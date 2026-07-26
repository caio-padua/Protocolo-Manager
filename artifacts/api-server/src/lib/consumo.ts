/**
 * consumo — Livro-caixa de ações de valor do sistema PADAXOR
 *
 * REGRAS ABSOLUTAS:
 * - registrarConsumo usa INSERT ... ON CONFLICT DO NOTHING (idempotente)
 * - Nunca DELETE ou UPDATE em consumo_eventos
 * - custo_unitario é congelado no momento do evento
 *
 * Funções de chave de idempotência:
 * - idDispatch(prescriptionId, channel, batchDate)
 * - idLembrete(clienteId, tipo, periodo, proximoEnvio)
 * - idIaMensagem(conversationId, role, content, createdAt)
 * - idExameOcr(fileId)
 * - idAssinatura(documentId, provedor)
 * - idDocumento(templateId, clientId, emitidoEm)
 */

import { createHash } from "crypto";
import { db } from "@workspace/db";
import { consumoEventosTable } from "@workspace/db/schema";
import { sql, and, gte, lte, eq, sum, count } from "drizzle-orm";
import { logger } from "./logger";

// ─── Chaves de idempotência ─────────────────────────────────────────────────

function sha256(...parts: (string | number | null | undefined)[]): string {
  return createHash("sha256")
    .update(parts.map((p) => String(p ?? "")).join("|"))
    .digest("hex");
}

export function idDispatch(
  prescriptionId: number | null | undefined,
  channel: string,
  batchDate: string | null | undefined
): string {
  return sha256("dispatch", prescriptionId, channel, batchDate);
}

export function idLembrete(
  clienteId: number,
  tipo: string,
  periodo: string,
  proximoEnvio: Date | string
): string {
  const ts =
    typeof proximoEnvio === "string"
      ? proximoEnvio
      : new Date(proximoEnvio).toISOString();
  return sha256("lembrete", clienteId, tipo, periodo, ts);
}

export function idIaMensagem(
  conversationId: number,
  role: string,
  content: string,
  createdAt: Date | string
): string {
  const ts =
    typeof createdAt === "string" ? createdAt : new Date(createdAt).toISOString();
  return sha256("ia_msg", conversationId, role, content.slice(0, 64), ts);
}

export function idExameOcr(fileId: string): string {
  return sha256("exame_ocr", fileId);
}

export function idAssinatura(documentId: string | number, provedor: string): string {
  return sha256("assinatura", documentId, provedor);
}

export function idDocumento(
  templateId: number | string,
  clientId: number,
  emitidoEm: Date | string
): string {
  const ts =
    typeof emitidoEm === "string" ? emitidoEm : new Date(emitidoEm).toISOString();
  return sha256("documento", templateId, clientId, ts);
}

// ─── registrarConsumo ────────────────────────────────────────────────────────

export interface RegistrarConsumoParams {
  empresaId: number;
  tipoEvento: string;
  origemId?: number | null;
  origemTabela?: string | null;
  custoUnitario?: number | string;
  moeda?: string;
  chaveIdempotencia: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Grava 1 evento no livro-caixa. Idempotente: chamada duplicada com a mesma
 * chaveIdempotencia não grava nada (ON CONFLICT DO NOTHING).
 */
export async function registrarConsumo(
  params: RegistrarConsumoParams
): Promise<void> {
  try {
    await db
      .insert(consumoEventosTable)
      .values({
        empresaId: params.empresaId,
        tipoEvento: params.tipoEvento,
        origemId: params.origemId ?? null,
        origemTabela: params.origemTabela ?? null,
        custoUnitario: String(params.custoUnitario ?? "0"),
        moeda: params.moeda ?? "BRL",
        chaveIdempotencia: params.chaveIdempotencia,
        metadata: (params.metadata as Record<string, unknown>) ?? null,
      })
      .onConflictDoNothing();
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), params: { tipoEvento: params.tipoEvento, chave: params.chaveIdempotencia } },
      "consumo: falha ao registrar evento"
    );
  }
}

// ─── somarConsumo ────────────────────────────────────────────────────────────

export interface SomarConsumoParams {
  empresaId: number;
  tipoEvento?: string;
  de?: Date;
  ate?: Date;
}

export async function somarConsumo(
  params: SomarConsumoParams
): Promise<number> {
  const conds = [eq(consumoEventosTable.empresaId, params.empresaId)];
  if (params.tipoEvento) {
    conds.push(eq(consumoEventosTable.tipoEvento, params.tipoEvento));
  }
  if (params.de) {
    conds.push(gte(consumoEventosTable.registradoEm, params.de));
  }
  if (params.ate) {
    conds.push(lte(consumoEventosTable.registradoEm, params.ate));
  }
  const rows = await db
    .select({ total: sum(consumoEventosTable.custoUnitario) })
    .from(consumoEventosTable)
    .where(and(...conds));
  return parseFloat(rows[0]?.total ?? "0") || 0;
}

// ─── listarConsumo ───────────────────────────────────────────────────────────

export interface ListarConsumoParams {
  empresaId: number;
  de?: Date;
  ate?: Date;
  page?: number;
  pageSize?: number;
}

export async function listarConsumo(params: ListarConsumoParams) {
  const { empresaId, de, ate, page = 1, pageSize = 50 } = params;
  const conds = [eq(consumoEventosTable.empresaId, empresaId)];
  if (de) conds.push(gte(consumoEventosTable.registradoEm, de));
  if (ate) conds.push(lte(consumoEventosTable.registradoEm, ate));

  const [total, rows] = await Promise.all([
    db
      .select({ n: count() })
      .from(consumoEventosTable)
      .where(and(...conds))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select()
      .from(consumoEventosTable)
      .where(and(...conds))
      .orderBy(sql`registrado_em DESC`)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  return { total, page, pageSize, rows };
}
