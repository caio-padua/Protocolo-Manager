import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Registro de erros do servidor para a Central de Erros do CEO.
// Aditivo (sem DROP). Nunca guarda corpo de requisicao nem query string,
// para nao carregar dado de paciente. Gravar nunca derruba a requisicao.
export async function ensureSystemErrorLogTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS system_error_log (
      id              BIGSERIAL PRIMARY KEY,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      method          TEXT NOT NULL,
      path            TEXT NOT NULL,
      status          INTEGER NOT NULL,
      message         TEXT,
      code            TEXT,
      professional_id INTEGER
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS system_error_log_created_idx ON system_error_log (created_at DESC)
  `);
}

export interface SystemErrorEntry {
  method: string;
  path: string;
  status: number;
  message?: string | null;
  code?: string | null;
  professionalId?: number | null;
}

/** Remove query string e esconde segmentos que parecem token/identificador longo. */
export function sanitizePath(raw: string): string {
  const base = raw.split("?")[0] ?? "";
  return base
    .split("/")
    .map((seg) => (seg.length >= 24 && /^[A-Za-z0-9_-]+$/.test(seg) ? ":token" : seg))
    .join("/")
    .slice(0, 200);
}

export function registrarErroSistema(e: SystemErrorEntry): void {
  void db.execute(sql`
    INSERT INTO system_error_log (method, path, status, message, code, professional_id)
    VALUES (${e.method.slice(0, 10)}, ${sanitizePath(e.path)}, ${e.status},
            ${e.message ? e.message.slice(0, 400) : null}, ${e.code ? e.code.slice(0, 40) : null},
            ${e.professionalId ?? null})
  `).catch((err) => logger.warn({ errorName: err instanceof Error ? err.name : "Erro" }, "Falha ao gravar system_error_log"));
}
