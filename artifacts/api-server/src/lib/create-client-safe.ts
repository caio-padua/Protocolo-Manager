/**
 * createClientSafe — utilitário central de criação de clientes
 *
 * REGRA DE OURO (Pedidos 3 e 4 do CEO, 23/07/2026):
 * Qualquer rota ou lib que precise criar um cliente DEVE usar esta função.
 * Ela garante que empresa_id, location_id e status nunca fiquem NULL ou errados,
 * independente de qual canal criou o cliente (portal, drive, concierge, etc.).
 *
 * Defaults aplicados quando o chamador não passa o campo:
 *   empresaId   = 5   (empresa padrão PADCOM / Instituto Padua)
 *   locationId  = 8   (localização padrão: Instituto Padua)
 *   status      = "active"
 */

import { db, clientsTable } from "@workspace/db";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

const DEFAULT_EMPRESA_ID = 5;
const DEFAULT_LOCATION_ID = 8;
const DEFAULT_STATUS = "active" as const;

type NewClient = typeof clientsTable.$inferInsert;
type DbOrTx = typeof db | PgTransaction<any, any, any>;

/**
 * Cria um cliente garantindo os campos obrigatórios de tenant.
 *
 * @param values  — Campos do cliente (sem empresa_id/location_id/status obrigatórios)
 * @param dbOrTx  — db ou transaction (opcional, padrão = db global)
 */
export async function createClientSafe(
  values: Omit<NewClient, "id" | "createdAt" | "updatedAt">,
  dbOrTx: DbOrTx = db,
): Promise<typeof clientsTable.$inferSelect> {
  const payload: NewClient = {
    ...values,
    empresaId: values.empresaId ?? DEFAULT_EMPRESA_ID,
    locationId: values.locationId ?? DEFAULT_LOCATION_ID,
    status: values.status ?? DEFAULT_STATUS,
  };

  const [created] = await (dbOrTx as typeof db)
    .insert(clientsTable)
    .values(payload)
    .returning();

  return created;
}
