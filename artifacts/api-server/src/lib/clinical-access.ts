import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  clinicalAccessGrantsTable,
  db,
  locationsTable,
  locationProfessionalsTable,
  professionalsTable,
} from "@workspace/db";
import { normalizeMatriz, podeUsar, type Matriz } from "@workspace/governanca";
import { getJsonSetting } from "./secure-settings";
import { ClinicalIdentityError, medicalRegistration, resolveClinicalMember } from "./clinical-emitter";
import { clinicalWorkflowMode, type ClinicalToolId, type ClinicalWorkflowMode } from "./clinical-access-policy";

export class ClinicalAccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function currentMatrix(): Promise<Matriz> {
  return normalizeMatriz(await getJsonSetting<Matriz>("governanca.matriz"));
}

export async function loadProfessional(professionalId: number) {
  const [professional] = await db.select().from(professionalsTable)
    .where(eq(professionalsTable.id, professionalId)).limit(1);
  return professional;
}

export async function isPlatformOwner(professionalId: number): Promise<boolean> {
  const [professional] = await db.select({ isPlatformOwner: professionalsTable.isPlatformOwner })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, professionalId))
    .limit(1);
  return Boolean(professional?.isPlatformOwner);
}

export async function clinicalToolAccess(
  req: Request,
  clientId: unknown,
  tool: ClinicalToolId,
): Promise<{
  mode: ClinicalWorkflowMode;
  member: Awaited<ReturnType<typeof resolveClinicalMember>>;
}> {
  if (!req.collaborator) throw new ClinicalIdentityError(401, "Faça login de colaborador.");
  const member = await resolveClinicalMember(req, clientId);
  const [grant] = await db.select().from(clinicalAccessGrantsTable)
    .where(and(
      eq(clinicalAccessGrantsTable.professionalId, member.professional.id),
      eq(clinicalAccessGrantsTable.locationId, member.clinic.id),
      eq(clinicalAccessGrantsTable.empresaId, member.clinic.empresaId),
    )).limit(1);
  const matrix = await currentMatrix();
  const localAllowed = tool === "prescricao"
    ? Boolean(grant?.canPrescribe)
    : Boolean(grant?.canRequestExams);
  return {
    mode: clinicalWorkflowMode({
      active: member.professional.active,
      professionalType: member.professional.professionalType,
      category: member.professional.category,
      globalAllowed: podeUsar(matrix, tool, member.professional.category ?? ""),
      localAllowed,
    }),
    member,
  };
}

export async function clinicManagementPermission(
  professionalId: number,
  locationId: number,
): Promise<{ allowed: boolean; isOwner: boolean; empresaId: number | null }> {
  const [actor] = await db.select().from(professionalsTable)
    .where(eq(professionalsTable.id, professionalId)).limit(1);
  const [location] = await db.select().from(locationsTable)
    .where(eq(locationsTable.id, locationId)).limit(1);
  if (!actor?.active || !location || location.active !== "true" || !location.empresaId) {
    return { allowed: false, isOwner: Boolean(actor?.isPlatformOwner), empresaId: location?.empresaId ?? null };
  }
  if (actor.isPlatformOwner) return { allowed: true, isOwner: true, empresaId: location.empresaId };

  const [membership] = await db.select({ id: locationProfessionalsTable.id })
    .from(locationProfessionalsTable)
    .where(and(
      eq(locationProfessionalsTable.professionalId, professionalId),
      eq(locationProfessionalsTable.locationId, locationId),
    )).limit(1);
  const [grant] = await db.select({ isClinicAdmin: clinicalAccessGrantsTable.isClinicAdmin })
    .from(clinicalAccessGrantsTable)
    .where(and(
      eq(clinicalAccessGrantsTable.professionalId, professionalId),
      eq(clinicalAccessGrantsTable.locationId, locationId),
      eq(clinicalAccessGrantsTable.empresaId, location.empresaId),
    )).limit(1);
  const matrix = await currentMatrix();
  const allowed = Boolean(
    membership &&
    grant?.isClinicAdmin &&
    podeUsar(matrix, "gerenciar_liberacoes_clinicas", actor.category ?? ""),
  );
  return { allowed, isOwner: false, empresaId: location.empresaId };
}

export async function currentResponsibleDoctor(locationId: number, empresaId: number) {
  const [result] = await db.select({
    grant: clinicalAccessGrantsTable,
    professional: professionalsTable,
    location: locationsTable,
  })
    .from(clinicalAccessGrantsTable)
    .innerJoin(professionalsTable, eq(professionalsTable.id, clinicalAccessGrantsTable.professionalId))
    .innerJoin(locationsTable, eq(locationsTable.id, clinicalAccessGrantsTable.locationId))
    .where(and(
      eq(clinicalAccessGrantsTable.locationId, locationId),
      eq(clinicalAccessGrantsTable.empresaId, empresaId),
      eq(clinicalAccessGrantsTable.isResponsibleDoctor, true),
      eq(professionalsTable.active, true),
      eq(professionalsTable.professionalType, "medico"),
      eq(locationsTable.empresaId, empresaId),
      eq(locationsTable.active, "true"),
    )).limit(1);
  if (!result) return null;
  try {
    medicalRegistration(result.professional);
  } catch {
    return null;
  }
  return result.professional;
}

export async function assertCurrentResponsibleDoctor(
  professionalId: number,
  locationId: number,
  empresaId: number,
): Promise<void> {
  const [grant] = await db.select({ id: clinicalAccessGrantsTable.id })
    .from(clinicalAccessGrantsTable)
    .innerJoin(professionalsTable, eq(professionalsTable.id, clinicalAccessGrantsTable.professionalId))
    .innerJoin(locationProfessionalsTable, and(
      eq(locationProfessionalsTable.professionalId, clinicalAccessGrantsTable.professionalId),
      eq(locationProfessionalsTable.locationId, clinicalAccessGrantsTable.locationId),
    ))
    .where(and(
      eq(clinicalAccessGrantsTable.professionalId, professionalId),
      eq(clinicalAccessGrantsTable.locationId, locationId),
      eq(clinicalAccessGrantsTable.empresaId, empresaId),
      eq(clinicalAccessGrantsTable.isResponsibleDoctor, true),
      eq(professionalsTable.active, true),
      eq(professionalsTable.professionalType, "medico"),
    )).limit(1);
  if (!grant) throw new ClinicalAccessError(403, "Somente o médico responsável atual desta unidade pode revisar o pedido.");
}

export { clinicalWorkflowMode };
