import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Redes sociais de clientes e profissionais.
 * Catálogo fechado: só estas chaves são aceitas. Instagram do CLIENTE continua na coluna
 * clients.instagram (leitores antigos, como o painel de encaminhamento, não mudam).
 */
export const REDES = [
  { key: "instagram", nome: "Instagram", exemplo: "@usuario" },
  { key: "facebook", nome: "Facebook", exemplo: "facebook.com/usuario" },
  { key: "tiktok", nome: "TikTok", exemplo: "@usuario" },
  { key: "youtube", nome: "YouTube", exemplo: "youtube.com/@canal" },
  { key: "linkedin", nome: "LinkedIn", exemplo: "linkedin.com/in/usuario" },
  { key: "x", nome: "X (Twitter)", exemplo: "@usuario" },
  { key: "threads", nome: "Threads", exemplo: "@usuario" },
  { key: "pinterest", nome: "Pinterest", exemplo: "pinterest.com/usuario" },
  { key: "kwai", nome: "Kwai", exemplo: "@usuario" },
  { key: "site", nome: "Site ou link", exemplo: "https://..." },
] as const;

export type OwnerTipo = "cliente" | "profissional";
const CHAVES = new Set<string>(REDES.map((r) => r.key));
const MAX = 200;

let pronto: Promise<void> | null = null;
export function garantirTabelaRedes(): Promise<void> {
  pronto ??= db.execute(sql`CREATE TABLE IF NOT EXISTS redes_sociais (
      id SERIAL PRIMARY KEY,
      owner_tipo TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      rede TEXT NOT NULL,
      handle TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT redes_sociais_unico UNIQUE (owner_tipo, owner_id, rede)
    )`).then(() => undefined).catch((e) => { pronto = null; throw e; });
  return pronto;
}

export class RedesInvalidas extends Error {}

/** Valida e normaliza o corpo: só chaves do catálogo, texto simples, vazio = remover. */
export function normalizarRedes(corpo: unknown): Record<string, string> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw new RedesInvalidas("Formato inválido para as redes sociais.");
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(corpo as Record<string, unknown>)) {
    if (!CHAVES.has(k)) throw new RedesInvalidas(`Rede social desconhecida: ${k}.`);
    if (v !== null && typeof v !== "string") throw new RedesInvalidas("Cada rede deve ser um texto.");
    const limpo = (v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (limpo.length > MAX) throw new RedesInvalidas(`${k}: no máximo ${MAX} caracteres.`);
    saida[k] = limpo;
  }
  return saida;
}

/** Grava (ou remove, se vazio) as redes enviadas. Chaves não enviadas permanecem como estão. */
export async function salvarRedesNaTabela(tipo: OwnerTipo, id: number, redes: Record<string, string>): Promise<void> {
  await garantirTabelaRedes();
  for (const [rede, handle] of Object.entries(redes)) {
    if (!handle) {
      await db.execute(sql`DELETE FROM redes_sociais WHERE owner_tipo=${tipo} AND owner_id=${id} AND rede=${rede}`);
    } else {
      await db.execute(sql`INSERT INTO redes_sociais (owner_tipo, owner_id, rede, handle) VALUES (${tipo}, ${id}, ${rede}, ${handle})
        ON CONFLICT (owner_tipo, owner_id, rede) DO UPDATE SET handle = EXCLUDED.handle, updated_at = NOW()`);
    }
  }
}

export async function lerRedesDaTabela(tipo: OwnerTipo, id: number): Promise<Record<string, string>> {
  await garantirTabelaRedes();
  const r = await db.execute(sql`SELECT rede, handle FROM redes_sociais WHERE owner_tipo=${tipo} AND owner_id=${id}`);
  const saida: Record<string, string> = {};
  for (const row of r.rows as Array<{ rede: string; handle: string }>) saida[row.rede] = row.handle;
  return saida;
}
