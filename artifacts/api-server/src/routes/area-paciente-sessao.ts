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
const corpoOpcional = z.object({ refreshToken: z.string().min(20).max(200).optional() }).strict();

// Token de renovação em COOKIE protegido (HttpOnly: script da página não lê; SameSite=Strict + Path restrito;
// Secure fora do desenvolvimento). O aplicativo web e a API vivem na mesma origem (/api), então o cookie é viável.
// Proteção contra falsificação de requisição (CSRF): cabeçalho personalizado obrigatório (um site de fora não
// consegue enviá-lo sem pré-aprovação) E, quando houver Origin, ele precisa ser a própria origem.
export const COOKIE_RT = "paxcare_rt";
const COOKIE_PATH = "/api/area-paciente/sessao";
const NOVENTA_DIAS_S = 90 * 24 * 3600;
const seguro = () => process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;
function cookieDe(req: { headers: { cookie?: string } }): string | null {
  for (const parte of (req.headers.cookie ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === COOKIE_RT) { const v = decodeURIComponent(parte.slice(i + 1).trim()); return v || null; }
  }
  return null;
}
function gravarCookie(res: { append: (k: string, v: string) => void }, valor: string | null): void {
  const base = `${COOKIE_RT}=${valor ? encodeURIComponent(valor) : ""}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict`;
  res.append("Set-Cookie", `${base}${seguro() ? "; Secure" : ""}; ${valor ? `Max-Age=${NOVENTA_DIAS_S}` : "Max-Age=0"}`);
}
export function origemPermitida(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  if (req.headers["x-paxcare-csrf"] !== "1") return false;
  const o = req.headers.origin;
  if (typeof o !== "string") return true; // navegador não envia Origin em algumas navegações da mesma origem
  try { return new URL(o).host === String(req.headers.host ?? ""); } catch { return false; }
}

router.post("/area-paciente/sessao/iniciar", async (req, res): Promise<void> => {
  const a = req.headers.authorization;
  const id = a && a.startsWith("Bearer ") ? verifyPatientToken(a.slice(7)) : null;
  if (id === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  if (!origemPermitida(req)) { res.status(403).json({ error: "Requisição não permitida." }); return; }
  try {
    const rt = await iniciarSessao(pool, id);
    gravarCookie(res, rt); // o token NÃO volta no corpo: o script da página nunca o vê
    res.status(201).json({ ok: true });
  }
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
  if (!origemPermitida(req)) { res.status(403).json({ error: "Requisição não permitida." }); return; }
  const p = corpoOpcional.safeParse(req.body ?? {});
  // Cookie é o caminho normal; o corpo só serve para migrar sessões antigas guardadas no aparelho (uma vez).
  const rtRecebido = cookieDe(req) ?? (p.success ? p.data.refreshToken : undefined);
  if (!p.success || !rtRecebido || rtRecebido.length < 20) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  try {
    const r = await renovarSessao(pool, rtRecebido);
    if (!r) { gravarCookie(res, null); res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
    const c = await pool.query(`SELECT id, name, cpf FROM clients WHERE id=$1`, [r.clientId]);
    if (!c.rows[0] || await contaExcluida(pool, r.clientId)) { gravarCookie(res, null); res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
    gravarCookie(res, r.novoToken);
    res.json({ id: c.rows[0].id, name: c.rows[0].name, cpf: c.rows[0].cpf, token: createPortalToken(r.clientId) });
  } catch (err) { req.log.error({ err: String(err) }, "sessao renovar"); res.status(500).json({ error: "Não foi possível renovar a sessão." }); }
});

router.post("/area-paciente/sessao/encerrar", async (req, res): Promise<void> => {
  if (!origemPermitida(req)) { res.status(403).json({ error: "Requisição não permitida." }); return; }
  const p = corpoOpcional.safeParse(req.body ?? {});
  const rt = cookieDe(req) ?? (p.success ? p.data.refreshToken : undefined);
  gravarCookie(res, null);
  if (rt) await encerrarSessao(pool, rt).catch((err) => req.log.error({ err: String(err) }, "sessao encerrar"));
  res.json({ ok: true });
});

export default router;
