import { and, eq, inArray } from "drizzle-orm";
import { db, clientPreferredAgendasTable, agendaResourcesTable, locationsTable } from "@workspace/db";

type Executor = Pick<typeof db, "select" | "insert" | "update">;

export class InvalidPreferredAgendas extends Error {}

export async function validateClientLocation(
  executor: Executor, empresaId: number, locationId: number | null | undefined,
): Promise<void> {
  if (locationId == null) return;
  const [location] = await executor.select({ id: locationsTable.id }).from(locationsTable)
    .where(and(
      eq(locationsTable.id, locationId),
      eq(locationsTable.empresaId, empresaId),
      eq(locationsTable.active, "true"),
    ));
  if (!location) throw new InvalidPreferredAgendas("O local escolhido não pertence a esta empresa ou está inativo.");
}

export async function getPreferredAgendas(clientId: number, executor: Executor = db): Promise<number[]> {
  const rows = await executor.select({ id: clientPreferredAgendasTable.agendaResourceId })
    .from(clientPreferredAgendasTable)
    .where(and(eq(clientPreferredAgendasTable.clientId, clientId), eq(clientPreferredAgendasTable.active, true)));
  return rows.map((row) => row.id);
}

// Deve ser executada dentro da transação que bloqueia a linha do cliente.
// Ausência preserva o conjunto; somente um array explícito pode alterá-lo.
export async function setPreferredAgendas(
  executor: Executor,
  client: { id: number; empresaId: number | null; locationId: number | null },
  ids: number[] | null | undefined,
): Promise<void> {
  if (ids === undefined) return;
  if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new InvalidPreferredAgendas("Seleção de agendas inválida. Para limpar, escolha uma lista vazia.");
  }
  const unique = [...new Set(ids)];
  if (unique.length) {
    if (!client.empresaId || !client.locationId) {
      throw new InvalidPreferredAgendas("Selecione um local válido antes de escolher agendas.");
    }
    const matches = await executor.select({ id: agendaResourcesTable.id })
      .from(agendaResourcesTable)
      .innerJoin(locationsTable, eq(locationsTable.id, agendaResourcesTable.locationId))
      .where(and(
        inArray(agendaResourcesTable.id, unique),
        eq(agendaResourcesTable.active, true),
        eq(agendaResourcesTable.locationId, client.locationId),
        eq(locationsTable.empresaId, client.empresaId),
        eq(locationsTable.active, "true"),
      ));
    if (matches.length !== unique.length) {
      throw new InvalidPreferredAgendas("Uma agenda selecionada está inativa ou não pertence ao local do cliente.");
    }
  }
  await executor.update(clientPreferredAgendasTable).set({ active: false })
    .where(eq(clientPreferredAgendasTable.clientId, client.id));
  if (unique.length) {
    await executor.insert(clientPreferredAgendasTable)
      .values(unique.map((agendaResourceId) => ({ clientId: client.id, agendaResourceId, active: true })))
      .onConflictDoUpdate({
        target: [clientPreferredAgendasTable.clientId, clientPreferredAgendasTable.agendaResourceId],
        set: { active: true },
      });
  }
}
