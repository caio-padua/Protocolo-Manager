import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { createExclusaoToken, verifyExclusaoToken, verifyPatientToken } from "../lib/portal-token";
import { verifyPassword } from "../lib/patient-auth.js";
import { AVISO_EXCLUSAO, contaExcluida, excluirContaDoApp } from "../lib/area-paciente-conta.js";

// "Excluir minha conta" (Apple App Store 5.1.1(v)). Só Authorization: Bearer; nunca clientId vindo do cliente.
const router: IRouter = Router();
const naoAutorizado = { error: "Sessão expirada. Identifique-se novamente." };
const pedido = z.object({ senha: z.string().max(200).optional(), dataNascimento: z.string().max(20).optional() }).strict();
const corpo = z.object({ confirmacao: z.literal("EXCLUIR"), confirmacaoToken: z.string().min(20).max(400) }).strict();
const soDigitos = (v: string) => v.replace(/\D/g, "");
/** DD/MM/AAAA ou AAAA-MM-DD -> DDMMAAAA (para comparar com o cadastro, que guarda texto). */
function nascimentoCanonico(v: string | null | undefined): string {
  const d = soDigitos(v ?? "");
  if (d.length !== 8) return "";
  return /^\d{4}-\d{2}-\d{2}/.test((v ?? "").trim()) ? d.slice(6, 8) + d.slice(4, 6) + d.slice(0, 4) : d;
}

function idDoToken(authorization: string | undefined): number | null {
  return authorization && authorization.startsWith("Bearer ") ? verifyPatientToken(authorization.slice(7)) : null;
}

router.get("/area-paciente/conta/aviso-exclusao", (req, res): void => {
  if (idDoToken(req.headers.authorization) === null) { res.status(401).json(naoAutorizado); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(AVISO_EXCLUSAO);
});

// PASSO 1 — pedido: reautentica agora (senha; sem senha cadastrada, data de nascimento) e devolve a confirmação.
router.post("/area-paciente/conta/pedido-exclusao", async (req, res): Promise<void> => {
  const id = idDoToken(req.headers.authorization);
  if (id === null) { res.status(401).json(naoAutorizado); return; }
  const p = pedido.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dados inválidos." }); return; }
  try {
    if (await contaExcluida(pool, id)) { res.status(401).json(naoAutorizado); return; }
    const c = (await pool.query(`SELECT password_hash AS "passwordHash", birth_date AS "birthDate" FROM clients WHERE id=$1`, [id])).rows[0] as { passwordHash: string | null; birthDate: string | null } | undefined;
    if (!c) { res.status(401).json(naoAutorizado); return; }
    let ok = false;
    if (c.passwordHash) ok = !!p.data.senha && verifyPassword(p.data.senha, c.passwordHash);
    else { const n = nascimentoCanonico(c.birthDate); ok = n !== "" && nascimentoCanonico(p.data.dataNascimento) === n; }
    if (!ok) { res.status(403).json({ error: c.passwordHash ? "Senha incorreta." : "Data de nascimento não confere." }); return; }
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
