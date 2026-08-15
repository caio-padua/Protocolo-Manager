/**
 * Armazenamento e histórico de PDFs de planos nutricionais emitidos.
 * Boot-migration lazy do padrão device-throttle.
 *
 * SEGURANÇA: todas as queries filtram por empresa_id (tenant). Nunca expor
 * registros sem confirmar que pertencem ao tenant da requisição.
 */

import { db, dietaPlanosEmitidosTable } from "@workspace/db";
import { sql, desc, eq, and, lt, isNotNull } from "drizzle-orm";
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

// ─── Limpeza de PDFs expirados ────────────────────────────────────────────────

const RETENTION_DAYS = 180;

/**
 * Remove do Object Storage todos os PDFs de planos com mais de 180 dias e
 * zera pdf_storage_key no banco (preservando o restante do registro histórico).
 * Retorna o número de planos limpos.
 */
export async function purgeOldDietaPdfs(): Promise<number> {
  await ensureDietaPlanosTable();

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Busca todos os registros com PDF armazenado mais antigos que o cutoff
  const stale = await db
    .select({
      id: dietaPlanosEmitidosTable.id,
      pdfStorageKey: dietaPlanosEmitidosTable.pdfStorageKey,
    })
    .from(dietaPlanosEmitidosTable)
    .where(
      and(
        lt(dietaPlanosEmitidosTable.emitidoEm, cutoff),
        isNotNull(dietaPlanosEmitidosTable.pdfStorageKey),
      ),
    );

  if (stale.length === 0) return 0;

  const svc = new ObjectStorageService();
  let removed = 0;

  for (const row of stale) {
    if (!row.pdfStorageKey) continue;
    try {
      // deletePrivateObject usa ignoreNotFound:true — só lança em erros reais (auth, rede, etc.)
      await svc.deletePrivateObject(row.pdfStorageKey);
    } catch (err) {
      // Erro real de storage: mantém a chave no banco para retentar no próximo ciclo.
      // Não conta como removido — a referência ainda pode apontar para o arquivo.
      console.error(
        `[dieta-pdfs] Falha ao deletar storage key ${row.pdfStorageKey} (plano #${row.id}):`,
        err,
      );
      continue;
    }
    // Delete confirmado (ou arquivo já não existia): zera a chave no banco.
    await db
      .update(dietaPlanosEmitidosTable)
      .set({ pdfStorageKey: null })
      .where(eq(dietaPlanosEmitidosTable.id, row.id));
    removed++;
  }

  return removed;
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
