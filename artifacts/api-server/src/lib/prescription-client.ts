import { db, clientsTable } from "@workspace/db";
import { and, eq, or, sql } from "drizzle-orm";

export type PrescriptionIdentity = {
  clientId?: number | null;
  clientCpf?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientName?: string | null;
};
export const cpfDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");
const emailKey = (value?: string | null) => (value ?? "").trim().toLowerCase();
const nameKey = (value?: string | null) => emailKey(value).normalize("NFD").replace(/\p{Mn}/gu, "").replace(/\s+/g, " ");
const phoneKey = (value?: string | null) => {
  const digits = cpfDigits(value);
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
};
type ClientIdentity = { id: number; cpf: string | null; email: string | null; phone: string | null; name: string };
function matchesProvidedIdentity(input: PrescriptionIdentity, client: ClientIdentity): boolean {
  return (!cpfDigits(input.clientCpf) || cpfDigits(input.clientCpf) === cpfDigits(client.cpf))
    && (!emailKey(input.clientEmail) || emailKey(input.clientEmail) === emailKey(client.email))
    && (!phoneKey(input.clientPhone) || phoneKey(input.clientPhone) === phoneKey(client.phone))
    && (!nameKey(input.clientName) || nameKey(input.clientName) === nameKey(client.name));
}
const fields = { id: clientsTable.id, cpf: clientsTable.cpf, email: clientsTable.email, phone: clientsTable.phone, name: clientsTable.name };

export async function resolvePrescriptionClient(input: PrescriptionIdentity, empresaId: number): Promise<number | null> {
  if (input.clientId != null) {
    if (!Number.isSafeInteger(input.clientId) || input.clientId <= 0) return null;
    const [client] = await db.select(fields).from(clientsTable)
      .where(and(eq(clientsTable.empresaId, empresaId), eq(clientsTable.id, input.clientId))).limit(1);
    return client && matchesProvidedIdentity(input, client) ? client.id : null;
  }
  const cpf = cpfDigits(input.clientCpf);
  const email = (input.clientEmail ?? "").trim().toLowerCase();
  if (!cpf && !email) return null;
  const candidates = await db.select(fields).from(clientsTable)
    .where(and(eq(clientsTable.empresaId, empresaId), or(
      cpf ? sql`regexp_replace(${clientsTable.cpf}, '[^0-9]', '', 'g') = ${cpf}` : sql`false`,
      email ? sql`lower(btrim(${clientsTable.email})) = ${email}` : sql`false`,
    ))).limit(2);
  if (candidates.length !== 1) return null;
  const candidate = candidates[0];
  return matchesProvidedIdentity(input, candidate) ? candidate.id : null;
}
