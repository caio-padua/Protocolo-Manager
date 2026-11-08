import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { catalogoItensTable, substancesTable } from "@workspace/db";

// Importações e correções usam a mesma trava transacional antes de ler fontes.
export async function travarCatalogoClinico(tx: { execute: (query: any) => Promise<any> }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026, 61040)`);
}

export function exigirIdentidadeRevisada(
  anterior: Record<string, unknown>,
  recebido: Record<string, unknown>,
  campos: readonly string[],
) {
  if (campos.some(campo => anterior[campo] !== recebido[campo])) {
    throw new Error("Importação interrompida: a identidade de um item com via revisada mudou e exige nova conferência clínica.");
  }
}

export class ViaClinicaDivergente extends Error {
  constructor() {
    super("O tipo de procedimento diverge da via clínica confirmada. Revise a confirmação antes de alterar.");
  }
}

// Chamar apenas dentro da transação que já obteve a trava do catálogo.
export async function exigirTipoCompativelComVia(
  tx: any, substanceId: number, procedureType: unknown,
) {
  const [substance] = await tx.select({ codigoPadcom: substancesTable.codigoPadcom })
    .from(substancesTable).where(eq(substancesTable.id, substanceId));
  if (!substance?.codigoPadcom) return;
  const [item] = await tx.select({
    viaUso: catalogoItensTable.viaUso, revisada: catalogoItensTable.viaUsoRevisada,
  }).from(catalogoItensTable).where(eq(catalogoItensTable.codigoPadcom, substance.codigoPadcom));
  if (!item?.revisada) return;
  const routeTypes: Record<string, string> = { IM: "im", SC: "sc", EV: "iv" };
  const expected = routeTypes[item.viaUso?.trim().toUpperCase() ?? ""];
  if (!expected || procedureType !== expected) throw new ViaClinicaDivergente();
}
