/**
 * Armazenamento e histórico de PDFs de planos nutricionais emitidos.
 * Boot-migration lazy do padrão device-throttle.
 *
 * SEGURANÇA: todas as queries filtram por empresa_id (tenant). Nunca expor
 * registros sem confirmar que pertencem ao tenant da requisição.
 */

import { db, dietaPlanosEmitidosTable } from "@workspace/db";
import { sql, desc, eq, and } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();

// ─── Boot-migration lazy (CREATE IF NOT EXISTS) ────────────────────────────
// Alinhado com o schema Drizzle em lib/db/src/schema/dieta.ts.
let _tableReady: Promise<void> | null = null;

export async function ensureDietaPlanosTable(): Promise<void> {
  if (!_tableReady) {
    _tableReady = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS dieta_planos_emitidos (
          id                SERIAL       PRIMARY KEY,
          cliente_id        INTEGER      NOT NULL,
          empresa_id        INTEGER      NOT NULL DEFAULT 5,
          nome_paciente     TEXT         NOT NULL,
          peso_kg           REAL,
          altura_cm         REAL,
          idade             INTEGER,
          sexo              TEXT,
          objetivo          TEXT,
          estrategia        TEXT,
          nivel_atividade   TEXT,
          calorias_alvo     REAL,
          tmb               REAL,
          tdee              REAL,
          email_destino     TEXT,
          email_enviado     BOOLEAN      NOT NULL DEFAULT FALSE,
          pdf_storage_key   TEXT,
          pdf_bytes         INTEGER,
          emitido_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((err: unknown) => {
        _tableReady = null;
        throw err;
      });
  }
  return _tableReady;
}

// ─── Object Storage ────────────────────────────────────────────────────────────

function pdfObjectName(planoId: number): string {
  return `dieta-planos/${planoId}.pdf`;
}

export async function uploadDietaPdf(planoId: number, pdfBuffer: Buffer): Promise<string> {
  const objectName = pdfObjectName(planoId);
  return storage.savePrivateObject(objectName, pdfBuffer, "application/pdf");
}

export async function readDietaPdf(storageKey: string): Promise<Buffer> {
  // storageKey é o caminho lógico retornado por savePrivateObject
  return storage.readPrivateObject(storageKey);
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PlanoEmitidoRow {
  id: number;
  clienteId: number;
  empresaId: number;
  nomePaciente: string;
  objetivo: string | null;
  estrategia: string | null;
  caloriasAlvo: number | null;
  pesoKg: number | null;
  alturaCm: number | null;
  emailDestino: string | null;
  emailEnviado: boolean;
  pdfStorageKey: string | null;
  pdfBytes: number | null;
  emitidoEm: Date;
}

// ─── Queries com escopo de tenant obrigatório ──────────────────────────────────

/**
 * Lista os planos emitidos para um cliente, filtrado por empresa_id.
 * Nenhum registro de outro tenant é retornado.
 */
export async function listPlanosByCliente(
  clienteId: number,
  empresaId: number,
): Promise<PlanoEmitidoRow[]> {
  await ensureDietaPlanosTable();
  const rows = await db
    .select()
    .from(dietaPlanosEmitidosTable)
    .where(and(
      eq(dietaPlanosEmitidosTable.clienteId, clienteId),
      eq(dietaPlanosEmitidosTable.empresaId, empresaId),
    ))
    .orderBy(desc(dietaPlanosEmitidosTable.emitidoEm))
    .limit(50);
  return rows as PlanoEmitidoRow[];
}

/**
 * Busca um plano por ID, garantindo que pertence ao tenant informado.
 * Retorna null se não existir OU se pertencer a outro tenant (anti-IDOR).
 */
export async function getPlanoById(
  id: number,
  empresaId: number,
): Promise<PlanoEmitidoRow | null> {
  await ensureDietaPlanosTable();
  const [row] = await db
    .select()
    .from(dietaPlanosEmitidosTable)
    .where(and(
      eq(dietaPlanosEmitidosTable.id, id),
      eq(dietaPlanosEmitidosTable.empresaId, empresaId),
    ));
  return (row as PlanoEmitidoRow) ?? null;
}
