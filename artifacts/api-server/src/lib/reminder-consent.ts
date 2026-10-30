import { db, clientsTable, dispatchLogTable } from "@workspace/db";
import { sql } from "drizzle-orm";

// A recurring authorization is specific to patient, clinic, phone and active staff membership.
// Older active=true flags are NOT proof that a destination was reviewed.
export function reminderConsentFilter() {
  return sql`EXISTS (
    SELECT 1 FROM dispatch_log d
    JOIN professionals p ON p.id = (d.detail::jsonb ->> 'actorId')::int
    JOIN location_professionals lp ON lp.professional_id = p.id
    JOIN locations l ON l.id = lp.location_id
    WHERE d.channel = 'reminder_authorization' AND d.status = 'authorized'
      AND d.empresa_id = ${clientsTable.empresaId}
      AND d.detail::jsonb ->> 'clientId' = ${clientsTable.id}::text
      AND d.detail::jsonb ->> 'recipient' = ${clientsTable.phone}
      AND d.detail::jsonb ->> 'locationId' = ${clientsTable.locationId}::text
      AND l.id = ${clientsTable.locationId} AND l.empresa_id = ${clientsTable.empresaId}
      AND l.active = 'true' AND p.active = true AND p.professional_type = 'medico')`;
}

export function clinicalClientFilter(professionalId: number) {
  return sql`EXISTS (SELECT 1 FROM location_professionals lp
    JOIN locations l ON l.id = lp.location_id
    JOIN professionals p ON p.id = lp.professional_id
    WHERE lp.professional_id = ${professionalId} AND l.id = ${clientsTable.locationId}
      AND l.empresa_id = ${clientsTable.empresaId} AND l.active = 'true'
      AND p.active = true AND p.professional_type = 'medico'
      AND ${clientsTable.status} = 'active')`;
}

export async function recordReminderConsent(input: {
  clientId: number; recipient: string; actorId: number; empresaId: number; locationId: number;
}) {
  await db.insert(dispatchLogTable).values({
    empresaId: input.empresaId, channel: "reminder_authorization", status: "authorized",
    detail: JSON.stringify(input),
  });
}
