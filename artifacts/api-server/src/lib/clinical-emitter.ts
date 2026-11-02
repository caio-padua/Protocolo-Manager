import type { Request } from "express";
import { db, clientsTable, professionalsTable, locationsTable, locationProfessionalsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export class ClinicalIdentityError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const STATES = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export function medicalRegistration(prof: {
  crm: string | null; registrationNumber: string | null; registrationCouncil: string | null;
}) {
  const source = (prof.registrationNumber?.trim() || prof.crm?.trim() || "").toUpperCase();
  const council = prof.registrationCouncil?.trim().toUpperCase() || "";
  if (council && !/^CRM(?:\b|[-/])/.test(council)) {
    throw new ClinicalIdentityError(422, "O conselho profissional deve ser CRM para esta operação médica.");
  }
  const ufs = [...new Set((`${source.toUpperCase()} ${council}`.match(/\b[A-Z]{2}\b/g) || []).filter(s => STATES.has(s)))];
  if (ufs.length > 1) throw new ClinicalIdentityError(422, "Há unidades federativas divergentes no registro médico.");
  const crm = source.replace(/\bCRM\b/gi, "").replace(/\b[A-Z]{2}\b/g, "").replace(/[\s./-]/g, "");
  if (!/^\d+$/.test(crm)) throw new ClinicalIdentityError(422, "Confira o número do registro médico no cadastro profissional.");
  return { crm, uf: ufs[0] ?? null };
}

// Exported separately so authorization rules can be tested without touching real data.
export function validateClinicalIdentity(input: {
  professional: typeof professionalsTable.$inferSelect | undefined;
  client: typeof clientsTable.$inferSelect | undefined;
  location: typeof locationsTable.$inferSelect | undefined;
  linked: boolean;
}) {
  const { professional, client, location, linked } = input;
  validateClinicalMembership(input);
  if (professional.professionalType !== "medico") {
    throw new ClinicalIdentityError(403, "O acesso autenticado não pertence a um médico ativo.");
  }
  const registration = medicalRegistration(professional);
  return {
    professional: { id: professional.id, name: professional.name, cpf: professional.cpf, ...registration },
    client: { id: client.id, name: client.name, cpf: client.cpf, email: client.email, phone: client.phone, birthDate: client.birthDate },
    clinic: { id: location.id, empresaId: client.empresaId, name: location.name },
    canPrescribe: !!registration.uf,
    issue: registration.uf ? null : "Informe a unidade federativa do CRM no cadastro profissional (por exemplo, CRM/SP).",
  };
}

export function validateClinicalMembership(input: {
  professional: typeof professionalsTable.$inferSelect | undefined;
  client: typeof clientsTable.$inferSelect | undefined;
  location: typeof locationsTable.$inferSelect | undefined;
  linked: boolean;
}) {
  const { professional, client, location, linked } = input;
  if (!professional?.active) {
    throw new ClinicalIdentityError(403, "O acesso autenticado não pertence a um profissional ativo.");
  }
  if (!client || client.status !== "active" || !client.empresaId || !client.locationId) {
    throw new ClinicalIdentityError(403, "Cliente indisponível para emissão clínica ou vínculo cadastral incompleto.");
  }
  if (!location || location.active !== "true" || location.id !== client.locationId ||
      location.empresaId !== client.empresaId || !linked) {
    throw new ClinicalIdentityError(403, "O profissional não possui vínculo autorizado com a clínica deste cliente.");
  }
  return {
    professional: {
      id: professional.id,
      name: professional.name,
      cpf: professional.cpf,
      professionalType: professional.professionalType,
      category: professional.category,
      active: professional.active,
    },
    client: {
      id: client.id,
      name: client.name,
      cpf: client.cpf,
      email: client.email,
      phone: client.phone,
      birthDate: client.birthDate,
    },
    clinic: { id: location.id, empresaId: client.empresaId, name: location.name },
  };
}

export async function resolveClinicalMember(req: Request, clientId: unknown) {
  if (!req.collaborator) throw new ClinicalIdentityError(401, "Faça login de colaborador.");
  if (typeof clientId !== "number" || !Number.isSafeInteger(clientId) || clientId <= 0) {
    throw new ClinicalIdentityError(400, "Selecione um cliente cadastrado.");
  }
  const [professional] = await db.select().from(professionalsTable)
    .where(eq(professionalsTable.id, req.collaborator.professionalId)).limit(1);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
  // Authorization is the explicit staff/location relation, not legacy owner flags.
  const [location] = client?.locationId
    ? await db.select().from(locationsTable).where(eq(locationsTable.id, client.locationId)).limit(1)
    : [];
  const [membership] = location
    ? await db.select({ id: locationProfessionalsTable.id }).from(locationProfessionalsTable)
      .where(and(eq(locationProfessionalsTable.locationId, location.id),
        eq(locationProfessionalsTable.professionalId, req.collaborator.professionalId))).limit(1)
    : [];
  return validateClinicalMembership({ professional, client, location, linked: !!membership });
}

export async function resolveClinicalEmitter(req: Request, clientId: unknown) {
  const member = await resolveClinicalMember(req, clientId);
  if (member.professional.professionalType !== "medico") {
    throw new ClinicalIdentityError(403, "O acesso autenticado não pertence a um médico ativo.");
  }
  const [professional] = await db.select().from(professionalsTable)
    .where(eq(professionalsTable.id, member.professional.id)).limit(1);
  const [client] = await db.select().from(clientsTable)
    .where(eq(clientsTable.id, member.client.id)).limit(1);
  const [location] = await db.select().from(locationsTable)
    .where(eq(locationsTable.id, member.clinic.id)).limit(1);
  return validateClinicalIdentity({ professional, client, location, linked: true });
}
