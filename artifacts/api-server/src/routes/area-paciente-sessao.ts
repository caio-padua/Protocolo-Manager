import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { createPortalToken, verifyPatientToken } from "../lib/portal-token";
import { contaExcluida } from "../lib/area-paciente-conta.js";
import { encerrarSessao, iniciarSessao, renovarSessao } from "../lib/area-paciente-sessao.js";

// Sessão persistente do cliente (celular): iniciar (com token de acesso válido), renovar e sair.
// Nenhuma rota recebe CPF/senha; nenhuma envia mensagem.
const router: IRouter = Router();
const corpo = z.object({ refreshToken: z.string().min(20).max(200) }).strict();

router.post("/area-paciente/sessao/iniciar", async (req, res): Promise<void> => {
  const a = req.headers.authorization;
  const id = a && a.startsWith("Bearer ") ? verifyPatientToken(a.slice(7)) : null;
  if (id === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  try { res.status(201).json({ refreshToken: await iniciarSessao(pool, id) }); }
  catch (err) { req.log.error({ err: String(err) }, "sessao iniciar"); res.status(500).json({ error: "Não foi possível manter a sessão." }); }
});

// Limite por origem contra adivinhação/força bruta do token de renovação (memória do processo: protege uma instância).
const tentativas = new Map<string, { n: number; ate: number }>();
function excedeuLimite(ip: string): boolean {
  const agora = Date.now();
  const t = tentativas.get(ip);
  if (!t || t.ate < agora) { tentativas.set(ip, { n: 1, ate: agora + 60_000 }); return false; }
  t.n += 1;
  if (tentativas.size > 5000) for (const [k, v] of tentativas) if (v.ate < agora) tentativas.delete(k);
  return t.n > 30;
}

router.post("/area-paciente/sessao/renovar", async (req, res): Promise<void> => {
  if (excedeuLimite(req.ip ?? "?")) { res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto." }); return; }
  const p = corpo.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dados inválidos." }); return; }
  try {
    const r = await renovarSessao(pool, p.data.refreshToken);
    if (!r) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
    const c = await pool.query(`SELECT id, name, cpf FROM clients WHERE id=$1`, [r.clientId]);
    if (!c.rows[0] || await contaExcluida(pool, r.clientId)) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
    res.json({ id: c.rows[0].id, name: c.rows[0].name, cpf: c.rows[0].cpf, token: createPortalToken(r.clientId), refreshToken: r.novoToken });
  } catch (err) { req.log.error({ err: String(err) }, "sessao renovar"); res.status(500).json({ error: "Não foi possível renovar a sessão." }); }
});

router.post("/area-paciente/sessao/encerrar", async (req, res): Promise<void> => {
  const p = corpo.safeParse(req.body);
  if (p.success) await encerrarSessao(pool, p.data.refreshToken).catch((err) => req.log.error({ err: String(err) }, "sessao encerrar"));
  res.json({ ok: true });
});

export default router;
