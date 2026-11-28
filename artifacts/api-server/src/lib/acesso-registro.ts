/**
 * Registro confiável de acesso (primeiro e último) de clientes e profissionais, a partir da implantação.
 * Só entra aqui quem EMITIU token de sessão de verdade (login concluído). Aceite de convite, navegação, prévia de
 * administrador e renovação de sessão NÃO contam. Datas anteriores à implantação nunca são inferidas: quem não tem linha
 * aqui está "sem registro", o que não prova que nunca acessou.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

export type TipoAcesso = "cliente" | "profissional";
let pronta = false;

export async function garantirTabelaAcesso(): Promise<void> {
  if (pronta) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS acesso_primeiro_registro (
      id SERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,
      pessoa_id INTEGER NOT NULL,
      primeiro_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      primeira_origem TEXT NOT NULL,
      ultimo_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      total INTEGER NOT NULL DEFAULT 1,
      CONSTRAINT acesso_primeiro_tipo_ck CHECK (tipo IN ('cliente','profissional')),
      CONSTRAINT acesso_primeiro_unico UNIQUE (tipo, pessoa_id)
    )`);
  pronta = true;
}

/** Nunca bloqueia o login: falha é registrada no log com nível de erro e o acesso segue. */
export async function registrarAcesso(tipo: TipoAcesso, pessoaId: number, origem: string): Promise<void> {
  try {
    await garantirTabelaAcesso();
    await db.execute(sql`
      INSERT INTO acesso_primeiro_registro (tipo, pessoa_id, primeira_origem)
      VALUES (${tipo}, ${pessoaId}, ${origem})
      ON CONFLICT (tipo, pessoa_id) DO UPDATE SET ultimo_em = NOW(), total = acesso_primeiro_registro.total + 1`);
  } catch (err) {
    logger.error({ err: String(err), tipo }, "acesso_registro_falhou");
  }
}
