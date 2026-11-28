import { Router, type IRouter } from "express";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { requireCollaborator } from "./collaborator";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { createExclusaoToken, verifyExclusaoToken, verifyPatientToken } from "../lib/portal-token";
import { verifyPassword } from "../lib/patient-auth.js";
import { AVISO_EXCLUSAO, contaExcluida, excluirContaDoApp } from "../lib/area-paciente-conta.js";

// "Excluir minha conta" (Apple App Store 5.1.1(v)). Só Authorization: Bearer; nunca clientId vindo do cliente.
const router: IRouter = Router();
const naoAutorizado = { error: "Sessão expirada. Identifique-se novamente." };
const pedido = z.object({ senha: z.string().max(200).optional(), codigoClinica: z.string().max(20).optional() }).strict();
const corpo = z.object({ confirmacao: z.literal("EXCLUIR"), confirmacaoToken: z.string().min(20).max(400) }).strict();

// Conta SEM senha: data de nascimento NÃO é prova (é dado cadastral conhecido por terceiros). A prova é um código
// de uso único, de 8 dígitos, emitido por colaborador da clínica do cliente e entregue em mão (nenhuma mensagem
// é enviada). Vale 15 minutos, no máximo 5 erros, guardado só como hash.
const CODIGO_VALIDADE_MIN = 15;
const CODIGO_MAX_ERROS = 5;
const DDL_CODIGOS = `CREATE TABLE IF NOT EXISTS area_paciente_exclusao_codigos (
  id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), empresa_id INTEGER,
  codigo_hash TEXT NOT NULL, emitido_por TEXT, emitido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL, erros INTEGER NOT NULL DEFAULT 0, usado_em TIMESTAMPTZ)`;
const hashCodigo = (c: string) => createHash("sha256").update(`exclusao-app:${c}`).digest("hex");

function idDoToken(authorization: string | undefined): number | null {
  return authorization && authorization.startsWith("Bearer ") ? verifyPatientToken(authorization.slice(7)) : null;
}

router.get("/area-paciente/conta/aviso-exclusao", (req, res): void => {
  if (idDoToken(req.headers.authorization) === null) { res.status(401).json(naoAutorizado); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(AVISO_EXCLUSAO);
});

async function consumirCodigoClinica(clientId: number, codigo: string | undefined): Promise<boolean> {
  await pool.query(DDL_CODIGOS);
  const ativo = (await pool.query(
    `SELECT id, codigo_hash, erros FROM area_paciente_exclusao_codigos
      WHERE client_id=$1 AND usado_em IS NULL AND expira_em > now() AND erros < $2 ORDER BY id DESC LIMIT 1`, [clientId, CODIGO_MAX_ERROS])).rows[0] as { id: number; codigo_hash: string; erros: number } | undefined;
  if (!ativo || !codigo || !/^\d{8}$/.test(codigo)) {
    if (ativo) await pool.query(`UPDATE area_paciente_exclusao_codigos SET erros = erros + 1 WHERE id=$1`, [ativo.id]);
    return false;
  }
  const a = Buffer.from(hashCodigo(codigo)), b = Buffer.from(ativo.codigo_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await pool.query(`UPDATE area_paciente_exclusao_codigos SET erros = erros + 1 WHERE id=$1`, [ativo.id]);
    return false;
  }
  const r = await pool.query(`UPDATE area_paciente_exclusao_codigos SET usado_em=now() WHERE id=$1 AND usado_em IS NULL`, [ativo.id]);
  return r.rowCount === 1;
}

// Quem pode emitir (fail-closed: perfil desconhecido NÃO emite). Quem entrega o código precisa conferir a identidade
// do cliente presencialmente: dono da plataforma, administrador, médico e recepção. Enfermagem não emite.
const PERFIS_EMISSORES = new Set(["platform_owner", "admin", "medico", "recepcionista"]);
function podeEmitirCodigo(req: { tenantContext?: { authenticated?: boolean; isPlatformOwner?: boolean; perfilPlataforma?: string } }): boolean {
  const t = req.tenantContext;
  return !!t && t.authenticated === true && (t.isPlatformOwner === true || PERFIS_EMISSORES.has(String(t.perfilPlataforma)));
}

// Emissão pela clínica (colaborador autenticado; cliente precisa ser da empresa do contexto; senão 404).
router.post("/cockpit/:clientId/codigo-exclusao-app", requireCollaborator, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isSafeInteger(clientId) || clientId <= 0) { res.status(400).json({ error: "Cliente inválido." }); return; }
  if (!podeEmitirCodigo(req)) { res.status(403).json({ error: "Seu perfil não pode emitir este código." }); return; }
  try {
    const empresaId = resolveEmpresaId(req);
    const c = (await pool.query(`SELECT password_hash AS "passwordHash" FROM clients WHERE id=$1 AND empresa_id=$2`, [clientId, empresaId])).rows[0] as { passwordHash: string | null } | undefined;
    if (!c) { res.status(404).json({ error: "Cliente não encontrado." }); return; }
    if (c.passwordHash) { res.status(409).json({ error: "Este cliente tem senha: ele mesmo confirma com a senha." }); return; }
    await pool.query(DDL_CODIGOS);
    await pool.query(`UPDATE area_paciente_exclusao_codigos SET usado_em=now() WHERE client_id=$1 AND usado_em IS NULL`, [clientId]); // só o último vale
    const codigo = String(randomInt(0, 100_000_000)).padStart(8, "0");
    const quem = String((req.tenantContext as { userId?: unknown } | undefined)?.userId ?? "colaborador");
    await pool.query(
      `INSERT INTO area_paciente_exclusao_codigos (client_id, empresa_id, codigo_hash, emitido_por, expira_em) VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval)`,
      [clientId, empresaId, hashCodigo(codigo), quem, String(CODIGO_VALIDADE_MIN)]);
    req.log.info({ clientId, empresaId }, "código de exclusão do app emitido pela clínica");
    res.setHeader("Cache-Control", "no-store");
    res.json({ codigo, validadeMinutos: CODIGO_VALIDADE_MIN, aviso: "Entregue em mão ao cliente. Nenhuma mensagem foi enviada." });
  } catch (err) {
    req.log.error({ err: String(err) }, "emitir código de exclusão");
    res.status(500).json({ error: "Não foi possível emitir o código." });
  }
});

// PASSO 1 — pedido: reautentica agora (senha; sem senha cadastrada, data de nascimento) e devolve a confirmação.
router.post("/area-paciente/conta/pedido-exclusao", async (req, res): Promise<void> => {
  const id = idDoToken(req.headers.authorization);
  if (id === null) { res.status(401).json(naoAutorizado); return; }
  const p = pedido.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dados inválidos." }); return; }
  try {
    if (await contaExcluida(pool, id)) { res.status(401).json(naoAutorizado); return; }
    const c = (await pool.query(`SELECT password_hash AS "passwordHash" FROM clients WHERE id=$1`, [id])).rows[0] as { passwordHash: string | null } | undefined;
    if (!c) { res.status(401).json(naoAutorizado); return; }
    let ok = false;
    if (c.passwordHash) ok = !!p.data.senha && verifyPassword(p.data.senha, c.passwordHash);
    else ok = await consumirCodigoClinica(id, p.data.codigoClinica);
    if (!ok) { res.status(403).json({ error: c.passwordHash ? "Senha incorreta." : "Código da clínica inválido, vencido ou já usado." }); return; }
    await pool.query(`CREATE TABLE IF NOT EXISTS area_paciente_exclusao_pedidos (
      id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id),
      pedido_em TIMESTAMPTZ NOT NULL DEFAULT now(), confirmado_em TIMESTAMPTZ)`);
    await pool.query(`INSERT INTO area_paciente_exclusao_pedidos (client_id) VALUES ($1)`, [id]);
    res.json({ confirmacaoToken: createExclusaoToken(id), validadeMinutos: 10 });
  } catch (err) {
    req.log.error({ err: String(err) }, "pedido de exclusão");
    res.status(500).json({ error: "Não foi possível iniciar o pedido. Nada foi alterado." });
  }
});

// PASSO 2 — confirmação: exige o código do passo 1 (feito há no máximo 10 min) + a palavra EXCLUIR.
router.delete("/area-paciente/conta", async (req, res): Promise<void> => {
  const id = idDoToken(req.headers.authorization);
  if (id === null) { res.status(401).json(naoAutorizado); return; }
  const p = corpo.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Para excluir, confirme a senha e digite EXCLUIR." }); return; }
  if (verifyExclusaoToken(p.data.confirmacaoToken) !== id) { res.status(403).json({ error: "Confirmação vencida. Informe a senha novamente." }); return; }
  try {
    if (await contaExcluida(pool, id)) { res.json({ ok: true, jaExcluida: true }); return; }
    await excluirContaDoApp(pool, id);
    await pool.query(`UPDATE area_paciente_exclusao_pedidos SET confirmado_em=now() WHERE client_id=$1 AND confirmado_em IS NULL`, [id]).catch(() => {});
    req.log.info({ clientId: id }, "conta do aplicativo excluída pelo titular");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err: String(err) }, "excluir conta");
    res.status(500).json({ error: "Não foi possível excluir agora. Nada foi alterado." });
  }
});

export default router;
