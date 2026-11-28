import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "./logger.js";

// Links temporários (cadastro, foto, consulta de receituário, arquivo de exame).
// 1) O token novo viaja no CABEÇALHO `X-Link-Token` (nunca em URL, histórico, log de proxy ou Referer).
//    Links antigos com ?token= continuam valendo até vencerem (compatibilidade), mas cada uso é marcado "legado".
// 2) Toda tentativa (aceita ou recusada) é auditada SEM guardar o token: só escopo, resultado, via e impressão
//    digital curta do IP. 3) Respostas nunca são guardadas em cache nem vazam o endereço por Referer.
export type EscopoLink = "cadastro" | "foto" | "receituario" | "exame";

export function lerTokenDeLink(req: Request): { token: string; via: "cabecalho" | "corpo" | "url" } {
  const h = req.headers["x-link-token"];
  if (typeof h === "string" && h.trim()) return { token: h.trim(), via: "cabecalho" };
  const b = (req.body as Record<string, unknown> | undefined)?.token;
  if (typeof b === "string" && b) return { token: b, via: "corpo" };
  const q = req.query.token;
  if (typeof q === "string" && q) return { token: q, via: "url" };
  return { token: "", via: "url" };
}

export function protegerRespostaLink(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

const DDL = `CREATE TABLE IF NOT EXISTS link_acesso_auditoria (
  id BIGSERIAL PRIMARY KEY, escopo TEXT NOT NULL, client_id INTEGER, via TEXT NOT NULL,
  resultado TEXT NOT NULL, ip_hash TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT now())`;
let pronta = false;

export async function auditarAcessoLink(
  req: Request, escopo: EscopoLink, via: string, resultado: "aceito" | "recusado", clientId: number | null = null,
): Promise<void> {
  try {
    if (!pronta) { await pool.query(DDL); pronta = true; }
    const ip = createHash("sha256").update(`link:${req.ip ?? ""}`).digest("hex").slice(0, 16);
    await pool.query(
      `INSERT INTO link_acesso_auditoria (escopo, client_id, via, resultado, ip_hash) VALUES ($1,$2,$3,$4,$5)`,
      [escopo, clientId, via, resultado, ip]);
  } catch (err) {
    // Auditoria não derruba o acesso legítimo, mas a falha fica no log (nunca em silêncio).
    logger.error({ evento: "link_auditoria_falhou", escopo, errorType: err instanceof Error ? err.constructor.name : typeof err }, "auditoria de link não gravada");
  }
}

// Freio contra adivinhação de links (memória do processo; protege uma instância): 60 tentativas por minuto por origem.
const janelas = new Map<string, { n: number; ate: number }>();
export function excedeuLimiteLink(req: Request, escopo: EscopoLink): boolean {
  const agora = Date.now();
  const k = `${escopo}|${req.ip ?? "?"}`;
  const j = janelas.get(k);
  if (!j || j.ate < agora) {
    if (janelas.size > 5000) for (const [x, v] of janelas) if (v.ate < agora) janelas.delete(x);
    janelas.set(k, { n: 1, ate: agora + 60_000 });
    return false;
  }
  j.n += 1;
  return j.n > 60;
}
