// ============================================================================
// Ferramentas de curadoria do Console de Exames: ENGLOBAR + TRANSFERIR + DESFAZER.
// Spec: specs/exame-englobar-transferir.md.
//
// ENGLOBAR: funde um exame já cadastrado (source) dentro de um exame padrão
// (target) — move os resultados, absorve grafias como apelidos e desativa o
// source. TRANSFERIR: repõe resultado(s) alocado(s) por engano de um exame para
// outro (nível resultado; não mexe no catálogo). Toda operação é transacional,
// idempotente, sem perda (soft-delete) e reversível (trilha de auditoria).
// ============================================================================
import {
  db,
  examResultsTable,
  examAnalyteCatalogTable,
  examAnalyteRangesTable,
  examResultReassignmentsTable,
} from "@workspace/db";
import { and, eq, inArray, sql, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  parseBrazilNumber,
  classifyByRef,
  loadUnits,
  resolveConversion,
  normalizeAnalyteName,
} from "./persist";
import { absorbAsAlias, loadCatalogFull } from "./triagem";

type ResultRow = typeof examResultsTable.$inferSelect;
type RangeRow = typeof examAnalyteRangesTable.$inferSelect;

// resultId sentinela (0) = linha-cabeçalho do lote (guarda o snapshot do catálogo
// do ENGLOBAR mesmo quando 0 resultados são movidos). resultId > 0 = resultado real.
const HEADER_RESULT_ID = 0;

export class ReassignError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ReassignError";
  }
}

interface Classification {
  valueCanonical: string | null;
  unitCanonical: string | null;
  unitConverted: boolean;
  refLow: string | null;
  refHigh: string | null;
  status: string | null;
}

type UnitsMap = Awaited<ReturnType<typeof loadUnits>>;

/**
 * Reclassifica UM resultado contra o exame DESTINO, espelhando persist.ts:
 * parseBrazilNumber(valueRaw) → resolveConversion(unidade do laudo) → faixa
 * interna curada (exam_analyte_ranges) tem PRIORIDADE; unidade sem fator → status
 * "conferencia". valueRaw/unitRaw são a fonte-da-verdade (texto cru do laudo).
 * A referência numérica só é reaproveitada quando não há conversão de unidade
 * (fator 1); com conversão, o texto cru da referência não é recuperável, então a
 * faixa interna curada assume (honesto, sem inventar conversão de referência).
 */
function classifyForTarget(
  row: ResultRow,
  targetCode: string,
  unitsByCode: UnitsMap,
  ranges: RangeRow[],
): Classification {
  const info = unitsByCode.get(targetCode);
  const conv = resolveConversion(info, row.unitRaw);
  const rawValue = parseBrazilNumber(row.valueRaw);
  const value = rawValue === null ? null : rawValue * conv.factor;

  let refLowN: number | null;
  let refHighN: number | null;
  if (conv.factor === 1) {
    refLowN = row.refLow === null ? null : Number(row.refLow);
    refHighN = row.refHigh === null ? null : Number(row.refHigh);
  } else {
    // Conversão de unidade: não há como recuperar o texto cru da referência do
    // laudo; a faixa interna curada classifica (linha vermelha: não inventar).
    refLowN = null;
    refHighN = null;
  }

  let status: string | null = classifyByRef(value, refLowN, refHighN);
  if (value !== null && ranges.length > 0) {
    const faixa = ranges.find((r) => {
      const lo = r.low === null ? null : Number(r.low);
      const hi = r.high === null ? null : Number(r.high);
      return (lo === null || value >= lo) && (hi === null || value <= hi);
    });
    if (faixa) status = faixa.faixaName;
  }
  if (conv.unknownUnit) status = "conferencia";

  return {
    valueCanonical: value === null ? null : String(value),
    unitCanonical: conv.unitCanonical,
    unitConverted: conv.converted,
    refLow: refLowN === null ? null : String(refLowN),
    refHigh: refHighN === null ? null : String(refHighN),
    status,
  };
}

async function getCatalogEntry(code: string) {
  const rows = await db
    .select()
    .from(examAnalyteCatalogTable)
    .where(eq(examAnalyteCatalogTable.code, code))
    .limit(1);
  return rows[0] ?? null;
}

async function loadTargetRanges(targetCode: string): Promise<RangeRow[]> {
  return db
    .select()
    .from(examAnalyteRangesTable)
    .where(eq(examAnalyteRangesTable.analyteCode, targetCode));
}

/** Move um conjunto de resultados para o destino, reclassifica e grava auditoria. */
async function moveAndAudit(
  tx: typeof db,
  rows: ResultRow[],
  targetCode: string,
  operation: "englobar" | "transferir",
  sourceCode: string | null,
  batchId: string,
  unitsByCode: UnitsMap,
  ranges: RangeRow[],
): Promise<number> {
  let moved = 0;
  for (const row of rows) {
    if (row.analyteCode === targetCode) continue; // no-op explícito
    const cls = classifyForTarget(row, targetCode, unitsByCode, ranges);
    await tx
      .update(examResultsTable)
      .set({
        analyteCode: targetCode,
        valueCanonical: cls.valueCanonical,
        unitCanonical: cls.unitCanonical,
        unitConverted: cls.unitConverted,
        refLow: cls.refLow,
        refHigh: cls.refHigh,
        status: cls.status,
      })
      .where(eq(examResultsTable.id, row.id));
    await tx.insert(examResultReassignmentsTable).values({
      batchId,
      operation,
      sourceCode,
      targetCode,
      resultId: row.id,
      clientId: row.clientId,
      examDocumentId: row.examDocumentId,
      prevAnalyteCode: row.analyteCode,
      prevValueCanonical: row.valueCanonical,
      prevUnitCanonical: row.unitCanonical,
      prevRefLow: row.refLow,
      prevRefHigh: row.refHigh,
      prevStatus: row.status,
      prevUnitConverted: row.unitConverted,
      catalogSnapshot: null,
    });
    moved++;
  }
  return moved;
}

export interface EnglobarResult {
  batchId: string;
  moved: number;
  aliasesAdded: string[];
  sourceDeactivated: boolean;
}

/**
 * ENGLOBAR: funde `sourceCode` dentro de `targetCode`. Move resultados +
 * reclassifica, absorve displayName/synonyms da origem como apelidos do destino
 * e desativa a origem (soft). Idempotente. Requer confirmOficial p/ englobar um
 * exame OFICIAL (origin="catalogo") como origem (proteção da base oficial).
 */
export async function englobarExame(
  sourceCode: string,
  targetCode: string,
  confirmOficial = false,
): Promise<EnglobarResult> {
  if (!sourceCode || !targetCode) {
    throw new ReassignError(400, "sourceCode e targetCode são obrigatórios.");
  }
  if (sourceCode === targetCode) {
    throw new ReassignError(400, "A origem e o destino não podem ser o mesmo exame.");
  }
  const source = await getCatalogEntry(sourceCode);
  const target = await getCatalogEntry(targetCode);
  if (!source) throw new ReassignError(404, `Exame de origem não encontrado: ${sourceCode}.`);
  if (!target) throw new ReassignError(404, `Exame de destino não encontrado: ${targetCode}.`);
  if (source.origin === "catalogo" && !confirmOficial) {
    throw new ReassignError(
      409,
      "A origem é um exame OFICIAL do catálogo. Confirme explicitamente para englobá-lo (confirmOficial).",
    );
  }

  const batchId = randomUUID();
  const unitsByCode = await loadUnits();
  const ranges = await loadTargetRanges(targetCode);

  return db.transaction(async (tx) => {
    // 1) mover resultados da origem -> destino (+ reclassificar + auditar)
    const rows = await tx
      .select()
      .from(examResultsTable)
      .where(eq(examResultsTable.analyteCode, sourceCode));
    const moved = await moveAndAudit(
      tx as unknown as typeof db,
      rows,
      targetCode,
      "englobar",
      sourceCode,
      batchId,
      unitsByCode,
      ranges,
    );

    // 2) absorver grafias da origem como apelidos do destino (idempotente, anti-colisão).
    //    Mede antes/depois para saber exatamente o que foi adicionado (para desfazer).
    const before = new Set(
      (target.synonyms ?? []).map((s) => normalizeAnalyteName(s)),
    );
    // A origem ainda está ativa nesta transação e "possui" a chave do próprio
    // nome; sem removê-la do catálogo em memória, absorbAsAlias recusaria a
    // absorção (colisão com a origem) e o nome ficaria órfão após a desativação.
    const catalog = (await loadCatalogFull()).filter((e) => e.code !== sourceCode);
    const candidates = [source.displayName, ...(source.synonyms ?? [])];
    for (const name of candidates) {
      await absorbAsAlias(targetCode, name, catalog);
    }
    const afterTarget = await getCatalogEntry(targetCode);
    const aliasesAdded = (afterTarget?.synonyms ?? []).filter(
      (s) => !before.has(normalizeAnalyteName(s)),
    );

    // 3) desativar origem (soft). Guarda estado anterior para desfazer.
    const sourceWasActive = source.active;
    if (sourceWasActive) {
      await tx
        .update(examAnalyteCatalogTable)
        .set({ active: false })
        .where(eq(examAnalyteCatalogTable.code, sourceCode));
    }

    // 4) linha-cabeçalho do lote com snapshot do catálogo (sobrevive a 0 resultados).
    await tx.insert(examResultReassignmentsTable).values({
      batchId,
      operation: "englobar",
      sourceCode,
      targetCode,
      resultId: HEADER_RESULT_ID,
      clientId: null,
      examDocumentId: null,
      prevAnalyteCode: null,
      prevValueCanonical: null,
      prevUnitCanonical: null,
      prevRefLow: null,
      prevRefHigh: null,
      prevStatus: null,
      prevUnitConverted: false,
      catalogSnapshot: { sourceWasActive, aliasesAdded },
    });

    return { batchId, moved, aliasesAdded, sourceDeactivated: sourceWasActive };
  });
}

export interface TransferirInput {
  targetCode: string;
  resultIds?: number[];
  sourceCode?: string;
  examDocumentId?: number;
  clientId?: number;
}

export interface TransferirResult {
  batchId: string;
  moved: number;
}

/**
 * TRANSFERIR: repõe resultado(s) para `targetCode`. Seleção por resultIds (fino,
 * por resultado) OU por sourceCode (opcionalmente restrito por examDocumentId /
 * clientId). Nível resultado — não mexe no catálogo. Idempotente.
 */
export async function transferirResultados(
  input: TransferirInput,
): Promise<TransferirResult> {
  const { targetCode, resultIds, sourceCode, examDocumentId, clientId } = input;
  if (!targetCode) throw new ReassignError(400, "targetCode é obrigatório.");
  const target = await getCatalogEntry(targetCode);
  if (!target) throw new ReassignError(404, `Exame de destino não encontrado: ${targetCode}.`);

  const hasIds = Array.isArray(resultIds) && resultIds.length > 0;
  if (!hasIds && !sourceCode) {
    throw new ReassignError(400, "Informe resultIds ou sourceCode para selecionar o que mover.");
  }

  const unitsByCode = await loadUnits();
  const ranges = await loadTargetRanges(targetCode);
  const batchId = randomUUID();

  return db.transaction(async (tx) => {
    let rows: ResultRow[];
    if (hasIds) {
      rows = await tx
        .select()
        .from(examResultsTable)
        .where(inArray(examResultsTable.id, resultIds!));
    } else {
      const conds = [eq(examResultsTable.analyteCode, sourceCode!)];
      if (typeof examDocumentId === "number")
        conds.push(eq(examResultsTable.examDocumentId, examDocumentId));
      if (typeof clientId === "number")
        conds.push(eq(examResultsTable.clientId, clientId));
      rows = await tx
        .select()
        .from(examResultsTable)
        .where(and(...conds));
    }
    const moved = await moveAndAudit(
      tx as unknown as typeof db,
      rows,
      targetCode,
      "transferir",
      sourceCode ?? null,
      batchId,
      unitsByCode,
      ranges,
    );
    return { batchId, moved };
  });
}

export interface DesfazerResult {
  undone: number;
  reactivatedSource: boolean;
  aliasesRemoved: string[];
}

/**
 * DESFAZER: reverte um lote fielmente — restaura analyteCode e classificação de
 * cada resultado, reativa a origem (se englobar a desativou) e remove os apelidos
 * adicionados por aquele lote. Idempotente: desfazer duas vezes é no-op.
 */
export async function desfazerLote(batchId: string): Promise<DesfazerResult> {
  if (!batchId) throw new ReassignError(400, "batchId é obrigatório.");
  const audit = await db
    .select()
    .from(examResultReassignmentsTable)
    .where(
      and(
        eq(examResultReassignmentsTable.batchId, batchId),
        sql`${examResultReassignmentsTable.undoneAt} IS NULL`,
      ),
    );
  if (audit.length === 0) {
    return { undone: 0, reactivatedSource: false, aliasesRemoved: [] };
  }

  return db.transaction(async (tx) => {
    let undone = 0;
    let reactivatedSource = false;
    let aliasesRemoved: string[] = [];

    for (const a of audit) {
      if (a.resultId === HEADER_RESULT_ID) {
        // cabeçalho do englobar: restaura catálogo (origem + apelidos).
        const snap = a.catalogSnapshot;
        if (a.sourceCode && snap?.sourceWasActive) {
          await tx
            .update(examAnalyteCatalogTable)
            .set({ active: true })
            .where(eq(examAnalyteCatalogTable.code, a.sourceCode));
          reactivatedSource = true;
        }
        const added = snap?.aliasesAdded ?? [];
        if (added.length > 0) {
          const tgt = await getCatalogEntry(a.targetCode);
          if (tgt) {
            const addedKeys = new Set(added.map((s) => normalizeAnalyteName(s)));
            const kept = (tgt.synonyms ?? []).filter(
              (s) => !addedKeys.has(normalizeAnalyteName(s)),
            );
            aliasesRemoved = (tgt.synonyms ?? []).filter((s) =>
              addedKeys.has(normalizeAnalyteName(s)),
            );
            await tx
              .update(examAnalyteCatalogTable)
              .set({ synonyms: kept })
              .where(eq(examAnalyteCatalogTable.code, a.targetCode));
          }
        }
        continue;
      }
      // resultado: restaura estado anterior completo.
      await tx
        .update(examResultsTable)
        .set({
          analyteCode: a.prevAnalyteCode,
          valueCanonical: a.prevValueCanonical,
          unitCanonical: a.prevUnitCanonical,
          refLow: a.prevRefLow,
          refHigh: a.prevRefHigh,
          status: a.prevStatus,
          unitConverted: a.prevUnitConverted,
        })
        .where(eq(examResultsTable.id, a.resultId));
      undone++;
    }

    await tx
      .update(examResultReassignmentsTable)
      .set({ undoneAt: new Date() })
      .where(
        and(
          eq(examResultReassignmentsTable.batchId, batchId),
          sql`${examResultReassignmentsTable.undoneAt} IS NULL`,
        ),
      );

    return { undone, reactivatedSource, aliasesRemoved };
  });
}

export interface ImpactoExame {
  code: string;
  displayName: string | null;
  origin: string | null;
  active: boolean;
  resultados: number;
  clientes: number;
  documentos: number;
}

/** Prévia de impacto de um exame: quantos resultados/clientes/documentos ele tem. */
export async function impactoExame(code: string): Promise<ImpactoExame> {
  const entry = await getCatalogEntry(code);
  const agg = await db
    .select({
      resultados: sql<number>`count(*)`,
      clientes: sql<number>`count(distinct ${examResultsTable.clientId})`,
      documentos: sql<number>`count(distinct ${examResultsTable.examDocumentId})`,
    })
    .from(examResultsTable)
    .where(eq(examResultsTable.analyteCode, code));
  const row = agg[0] ?? { resultados: 0, clientes: 0, documentos: 0 };
  return {
    code,
    displayName: entry?.displayName ?? null,
    origin: entry?.origin ?? null,
    active: entry?.active ?? false,
    resultados: Number(row.resultados),
    clientes: Number(row.clientes),
    documentos: Number(row.documentos),
  };
}

export interface LoteResumo {
  batchId: string;
  operation: string;
  sourceCode: string | null;
  targetCode: string;
  resultados: number;
  createdAt: string | null;
  undone: boolean;
}

/** Lista os últimos lotes de curadoria (para o painel DESFAZER). */
export async function listarLotes(limit = 20): Promise<LoteResumo[]> {
  const rows = await db
    .select({
      batchId: examResultReassignmentsTable.batchId,
      operation: examResultReassignmentsTable.operation,
      sourceCode: examResultReassignmentsTable.sourceCode,
      targetCode: examResultReassignmentsTable.targetCode,
      resultId: examResultReassignmentsTable.resultId,
      createdAt: examResultReassignmentsTable.createdAt,
      undoneAt: examResultReassignmentsTable.undoneAt,
    })
    .from(examResultReassignmentsTable)
    .orderBy(desc(examResultReassignmentsTable.createdAt));

  const map = new Map<string, LoteResumo & { _createdMs: number }>();
  for (const r of rows) {
    const createdMs = r.createdAt ? new Date(r.createdAt).getTime() : 0;
    let entry = map.get(r.batchId);
    if (!entry) {
      entry = {
        batchId: r.batchId,
        operation: r.operation,
        sourceCode: r.sourceCode,
        targetCode: r.targetCode,
        resultados: 0,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        undone: true,
        _createdMs: createdMs,
      };
      map.set(r.batchId, entry);
    }
    if (r.resultId !== HEADER_RESULT_ID) entry.resultados++;
    if (!r.undoneAt) entry.undone = false;
  }
  return Array.from(map.values())
    .sort((a, b) => b._createdMs - a._createdMs)
    .slice(0, limit)
    .map(({ _createdMs, ...rest }) => rest);
}
