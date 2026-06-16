// Serviço de numeração SNCR (intervalos por médico + UF + tipo de controlado).
// REGRA CRÍTICA: nunca bloqueia a emissão. Quando esgota ou não há intervalo,
// retorna número nulo e o status correspondente — quem chama segue emitindo.
import { db, sncrRangesTable, sncrLogTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";

export const SNCR_LOW_THRESHOLD = 50;

export interface ConsumeResult {
  number: string | null;
  rangeId: number | null;
  status: "consumed" | "exhausted" | "no_range";
  remaining: number | null;
  low: boolean;
}

export interface QuotaInfo {
  rangeId: number;
  professionalId: number | null;
  professionalName: string | null;
  uf: string;
  controlledType: string;
  startNumber: number;
  endNumber: number;
  nextNumber: number;
  remaining: number;
  low: boolean;
  exhausted: boolean;
  active: boolean;
}

function buildConditions(professionalId: number | null | undefined, uf: string, controlledType: string) {
  const conds = [
    eq(sncrRangesTable.uf, uf),
    eq(sncrRangesTable.controlledType, controlledType),
    eq(sncrRangesTable.active, true),
  ];
  if (professionalId != null) {
    conds.push(eq(sncrRangesTable.professionalId, professionalId));
  }
  return and(...conds);
}

// Consome o próximo número de forma transacional. Best-effort: sempre retorna,
// nunca lança por falta de intervalo.
export async function consumeSncrNumber(opts: {
  professionalId?: number | null;
  uf: string;
  controlledType: string;
  recipeId?: number | null;
  prescriptionId?: number | null;
}): Promise<ConsumeResult> {
  const { professionalId, uf, controlledType, recipeId, prescriptionId } = opts;

  try {
    return await db.transaction(async (tx) => {
      const ranges = await tx
        .select()
        .from(sncrRangesTable)
        .where(buildConditions(professionalId, uf, controlledType))
        .orderBy(asc(sncrRangesTable.id))
        .for("update");

      const usable = ranges.find((r) => r.nextNumber <= r.endNumber);

      if (!usable) {
        // Sem intervalo cadastrado OU todos esgotados.
        const status = ranges.length === 0 ? "no_range" : "exhausted";
        await tx.insert(sncrLogTable).values({
          rangeId: ranges[0]?.id ?? null,
          recipeId: recipeId ?? null,
          prescriptionId: prescriptionId ?? null,
          number: null,
          professionalId: professionalId ?? null,
          uf,
          controlledType,
          status,
        });
        return { number: null, rangeId: ranges[0]?.id ?? null, status, remaining: 0, low: true };
      }

      const consumed = usable.nextNumber;
      const newNext = consumed + 1;
      await tx
        .update(sncrRangesTable)
        .set({ nextNumber: newNext })
        .where(eq(sncrRangesTable.id, usable.id));

      await tx.insert(sncrLogTable).values({
        rangeId: usable.id,
        recipeId: recipeId ?? null,
        prescriptionId: prescriptionId ?? null,
        number: consumed,
        professionalId: professionalId ?? null,
        uf,
        controlledType,
        status: "consumed",
      });

      const remaining = usable.endNumber - newNext + 1;
      return {
        number: String(consumed),
        rangeId: usable.id,
        status: "consumed",
        remaining: Math.max(0, remaining),
        low: remaining <= SNCR_LOW_THRESHOLD,
      };
    });
  } catch {
    // Falha inesperada: nunca bloqueia a emissão.
    return { number: null, rangeId: null, status: "no_range", remaining: null, low: true };
  }
}

export async function getSncrQuota(filter?: {
  professionalId?: number | null;
  uf?: string;
  controlledType?: string;
}): Promise<QuotaInfo[]> {
  const conds = [];
  if (filter?.professionalId != null) conds.push(eq(sncrRangesTable.professionalId, filter.professionalId));
  if (filter?.uf) conds.push(eq(sncrRangesTable.uf, filter.uf));
  if (filter?.controlledType) conds.push(eq(sncrRangesTable.controlledType, filter.controlledType));

  const rows = conds.length
    ? await db.select().from(sncrRangesTable).where(and(...conds))
    : await db.select().from(sncrRangesTable);

  return rows.map((r) => {
    const remaining = Math.max(0, r.endNumber - r.nextNumber + 1);
    return {
      rangeId: r.id,
      professionalId: r.professionalId,
      professionalName: r.professionalName,
      uf: r.uf,
      controlledType: r.controlledType,
      startNumber: r.startNumber,
      endNumber: r.endNumber,
      nextNumber: r.nextNumber,
      remaining,
      low: remaining <= SNCR_LOW_THRESHOLD && remaining > 0,
      exhausted: remaining === 0,
      active: r.active,
    };
  });
}
