import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  ClinicalAdministrationUpdateBody,
  ClinicalAccessUpdateBody,
  CountClinicalApprovalsResponse,
  CreateClinicalApprovalBody,
  ListClinicalAccessLocationsResponse,
  ListClinicalApprovalsResponse,
  ListClinicalProfessionalAccessResponse,
  RejectClinicalApprovalBody,
  RejectClinicalApprovalResponse,
  UpdateClinicalProfessionalAdministrationResponse,
  UpdateClinicalProfessionalAccessResponse,
  EmitPrescriptionBody,
  ExamRequestEmitBody,
} from "@workspace/api-zod";
import {
  catalogoExamesTable,
  clinicalAccessAuditTable,
  clinicalAccessGrantsTable,
  clinicalApprovalEventsTable,
  clinicalApprovalRequestsTable,
  clientsTable,
  db,
  locationProfessionalsTable,
  locationsTable,
  professionalsTable,
} from "@workspace/db";
import { normalizeMatriz, podeUsar, type Matriz } from "@workspace/governanca";
import { resolvePrescriptionClient } from "../lib/prescription-client";
import { ClinicalAccessError, clinicManagementPermission, currentResponsibleDoctor, isPlatformOwner } from "../lib/clinical-access";
import { clinicalWorkflowMode } from "../lib/clinical-access-policy";
import { assertCurrentResponsibleDoctor, clinicalToolAccess } from "../lib/clinical-access";
import { ClinicalIdentityError, medicalRegistration } from "../lib/clinical-emitter";
import { getJsonSetting } from "../lib/secure-settings";
import { requireCollaborator } from "./collaborator";

const router: IRouter = Router();
const validKinds = ["prescricao", "pedido_exames"] as const;

function actorId(req: Request): number | null {
  const id = Number(req.collaborator?.professionalId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadDigest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function resultDocumentIds(result: unknown): number[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const ids = (result as Record<string, unknown>).documentIds;
  return Array.isArray(ids) ? ids.filter((id): id is number => Number.isSafeInteger(id)) : [];
}

async function matrix(): Promise<Matriz> {
  return normalizeMatriz(await getJsonSetting<Matriz>("governanca.matriz"));
}

async function linkedProfessional(locationId: number, professionalId: number) {
  const [result] = await db.select({
    professional: professionalsTable,
    membershipId: locationProfessionalsTable.id,
  })
    .from(locationProfessionalsTable)
    .innerJoin(professionalsTable, eq(professionalsTable.id, locationProfessionalsTable.professionalId))
    .where(and(
      eq(locationProfessionalsTable.locationId, locationId),
      eq(locationProfessionalsTable.professionalId, professionalId),
    )).limit(1);
  return result?.professional;
}

async function publicProfessionalAccess(locationId: number, professionalId: number) {
  const [result] = await db.select({
    professional: professionalsTable,
    grant: clinicalAccessGrantsTable,
  })
    .from(locationProfessionalsTable)
    .innerJoin(professionalsTable, eq(professionalsTable.id, locationProfessionalsTable.professionalId))
    .leftJoin(clinicalAccessGrantsTable, and(
      eq(clinicalAccessGrantsTable.professionalId, locationProfessionalsTable.professionalId),
      eq(clinicalAccessGrantsTable.locationId, locationProfessionalsTable.locationId),
    ))
    .where(and(
      eq(locationProfessionalsTable.locationId, locationId),
      eq(locationProfessionalsTable.professionalId, professionalId),
    )).limit(1);
  if (!result) return null;
  const roleMatrix = await matrix();
  const [location] = await db.select({ empresaId: locationsTable.empresaId })
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId))
    .limit(1);
  const grant = result.grant;
  return {
    professionalId: result.professional.id,
    name: result.professional.name,
    professionalType: result.professional.professionalType,
    category: result.professional.category,
    active: Boolean(result.professional.active),
    canPrescribe: Boolean(grant?.empresaId === location?.empresaId && grant?.canPrescribe),
    canRequestExams: Boolean(grant?.empresaId === location?.empresaId && grant?.canRequestExams),
    globalAllowsPrescribe: podeUsar(roleMatrix, "prescricao", result.professional.category ?? ""),
    globalAllowsExamRequests: podeUsar(roleMatrix, "pedido_exames", result.professional.category ?? ""),
    isClinicAdmin: Boolean(grant?.empresaId === location?.empresaId && grant?.isClinicAdmin),
    isResponsibleDoctor: Boolean(grant?.empresaId === location?.empresaId && grant?.isResponsibleDoctor),
  };
}

async function writeAccessAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  args: {
    empresaId: number;
    locationId: number;
    subjectProfessionalId: number;
    actorProfessionalId: number;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(clinicalAccessAuditTable).values(args);
}

async function buildApprovalResponse(
  row: typeof clinicalApprovalRequestsTable.$inferSelect,
  actor: number,
  names: { clientName: string; locationName: string; preparedByName: string; responsibleDoctorName: string | null },
  responsibleLocationIds: Set<number>,
) {
  return {
    id: row.id,
    kind: row.kind as (typeof validKinds)[number],
    status: row.status as "pendente" | "processando" | "aprovado" | "rejeitado" | "conferir_resultado",
    clientId: row.clientId,
    clientName: names.clientName,
    locationId: row.locationId,
    locationName: names.locationName,
    empresaId: row.empresaId,
    preparedByProfessionalId: row.preparedByProfessionalId,
    preparedByName: names.preparedByName,
    responsibleDoctorName: names.responsibleDoctorName,
    payload: row.payload,
    resultDocumentIds: resultDocumentIds(row.result),
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    canReview: row.status === "pendente" && responsibleLocationIds.has(row.locationId) && row.preparedByProfessionalId !== actor,
  };
}

async function normalizeApprovalPayload(
  kind: (typeof validKinds)[number],
  rawPayload: Record<string, unknown>,
  client: Awaited<ReturnType<typeof import("../lib/clinical-emitter").resolveClinicalMember>>["client"],
  empresaId: number,
): Promise<Record<string, unknown>> {
  if (kind === "prescricao") {
    const parsed = EmitPrescriptionBody.safeParse({
      ...rawPayload,
      clientId: client.id,
      clientName: client.name,
      clientCpf: client.cpf,
      clientPhone: client.phone,
      clientEmail: client.email,
      professionalId: null,
      professionalName: null,
      professionalCrm: null,
      professionalUf: null,
      approvalRequestId: undefined,
    });
    if (!parsed.success) throw new ClinicalAccessError(400, "A prescrição contém dados incompletos ou inválidos.");
    const resolvedClientId = await resolvePrescriptionClient(parsed.data, empresaId);
    if (resolvedClientId !== client.id) {
      throw new ClinicalAccessError(403, "O cliente não pertence ao contexto clínico autenticado.");
    }
    return parsed.data as unknown as Record<string, unknown>;
  }

  const parsed = ExamRequestEmitBody.safeParse({
    ...rawPayload,
    clientId: client.id,
    professionalId: null,
    sendEmail: false,
    sendWhatsapp: false,
    approvalRequestId: undefined,
  });
  if (!parsed.success) throw new ClinicalAccessError(400, "O pedido de exames contém dados incompletos ou inválidos.");

  const requestedCodes = parsed.data.items.map((item) => item.codigoExame).filter((code): code is string => Boolean(code));
  const requestedNames = parsed.data.items.map((item) => item.nomeExame);
  const catalogConditions = [
    requestedCodes.length ? inArray(catalogoExamesTable.codigoExame, requestedCodes) : undefined,
    requestedNames.length ? inArray(catalogoExamesTable.nomeExame, requestedNames) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const catalog = catalogConditions.length
    ? await db.select({
      codigoExame: catalogoExamesTable.codigoExame,
      nomeExame: catalogoExamesTable.nomeExame,
      ativo: catalogoExamesTable.ativo,
    }).from(catalogoExamesTable).where(and(eq(catalogoExamesTable.ativo, true), or(...catalogConditions)))
    : [];
  const byCode = new Map(catalog.map((item) => [item.codigoExame, item]));
  const byName = new Map<string, typeof catalog>();
  for (const item of catalog) {
    const key = normalizeName(item.nomeExame ?? "");
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  const items = parsed.data.items.map((item) => {
    const matched = item.codigoExame ? byCode.get(item.codigoExame) : undefined;
    const nameMatches = !item.codigoExame ? byName.get(normalizeName(item.nomeExame)) ?? [] : [];
    const resolved = matched ?? (nameMatches.length === 1 ? nameMatches[0] : undefined);
    if (!resolved?.ativo || !resolved.codigoExame || !resolved.nomeExame) {
      throw new ClinicalAccessError(422, "Há exame fora do catálogo ativo ou sem correspondência única. Selecione novamente no catálogo.");
    }
    return { ...item, nomeExame: resolved.nomeExame, codigoExame: resolved.codigoExame };
  });
  return { ...parsed.data, items, sendEmail: false, sendWhatsapp: false, professionalId: null };
}

async function responsibleScopes(professionalId: number): Promise<Array<{ locationId: number; empresaId: number }>> {
  const rows = await db.select({
    locationId: clinicalAccessGrantsTable.locationId,
    empresaId: clinicalAccessGrantsTable.empresaId,
  })
    .from(clinicalAccessGrantsTable)
    .innerJoin(professionalsTable, eq(professionalsTable.id, clinicalAccessGrantsTable.professionalId))
    .innerJoin(locationProfessionalsTable, and(
      eq(locationProfessionalsTable.professionalId, clinicalAccessGrantsTable.professionalId),
      eq(locationProfessionalsTable.locationId, clinicalAccessGrantsTable.locationId),
    ))
    .where(and(
      eq(clinicalAccessGrantsTable.professionalId, professionalId),
      eq(clinicalAccessGrantsTable.isResponsibleDoctor, true),
      eq(professionalsTable.professionalType, "medico"),
      eq(professionalsTable.active, true),
    ));
  const valid: Array<{ locationId: number; empresaId: number }> = [];
  for (const row of rows) {
    try {
      await assertCurrentResponsibleDoctor(professionalId, row.locationId, row.empresaId);
      valid.push(row);
    } catch {
      // Vínculo removido ou médico desativado: nunca manter visibilidade da fila.
    }
  }
  return valid;
}

async function approvalNames(rows: Array<typeof clinicalApprovalRequestsTable.$inferSelect>) {
  const clientIds = [...new Set(rows.map((row) => row.clientId))];
  const locationIds = [...new Set(rows.map((row) => row.locationId))];
  const professionalIds = [...new Set(rows.map((row) => row.preparedByProfessionalId))];
  const [clients, locations, professionals] = await Promise.all([
    clientIds.length ? db.select({ id: clientsTable.id, name: clientsTable.name })
      .from(clientsTable).where(inArray(clientsTable.id, clientIds)) : [],
    locationIds.length ? db.select({ id: locationsTable.id, name: locationsTable.name })
      .from(locationsTable).where(inArray(locationsTable.id, locationIds)) : [],
    professionalIds.length ? db.select({ id: professionalsTable.id, name: professionalsTable.name })
      .from(professionalsTable).where(inArray(professionalsTable.id, professionalIds)) : [],
  ]);
  return {
    clients: new Map(clients.map((item) => [item.id, item.name])),
    locations: new Map(locations.map((item) => [item.id, item.name])),
    professionals: new Map(professionals.map((item) => [item.id, item.name])),
  };
}

router.get("/clinical-access/locations", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor) {
    res.status(401).json({ error: "Faça login de colaborador." });
    return;
  }
  const owner = await isPlatformOwner(actor);
  let locations: Array<{ id: number; name: string; empresaId: number }> = [];
  if (owner) {
    locations = await db.select({
      id: locationsTable.id,
      name: locationsTable.name,
      empresaId: locationsTable.empresaId,
    }).from(locationsTable).where(eq(locationsTable.active, "true"));
  } else {
    const rows = await db.select({
      id: locationsTable.id,
      name: locationsTable.name,
      empresaId: locationsTable.empresaId,
      isClinicAdmin: clinicalAccessGrantsTable.isClinicAdmin,
      isResponsibleDoctor: clinicalAccessGrantsTable.isResponsibleDoctor,
    })
      .from(locationProfessionalsTable)
      .innerJoin(locationsTable, eq(locationsTable.id, locationProfessionalsTable.locationId))
      .leftJoin(clinicalAccessGrantsTable, and(
        eq(clinicalAccessGrantsTable.locationId, locationProfessionalsTable.locationId),
        eq(clinicalAccessGrantsTable.professionalId, locationProfessionalsTable.professionalId),
      ))
      .where(and(
        eq(locationProfessionalsTable.professionalId, actor),
        eq(locationsTable.active, "true"),
      ));
    locations = rows.filter((row) => row.empresaId && (row.isClinicAdmin || row.isResponsibleDoctor));
  }

  const roleMatrix = await matrix();
  const result = [];
  for (const location of locations) {
    if (!location.empresaId) continue;
    const management = await clinicManagementPermission(actor, location.id);
    const doctor = await currentResponsibleDoctor(location.id, location.empresaId);
    result.push({
      id: location.id,
      name: location.name,
      empresaId: location.empresaId,
      canManage: management.allowed && (owner || podeUsar(roleMatrix, "gerenciar_liberacoes_clinicas", (await loadActorCategory(actor)) ?? "")),
      canReview: doctor?.id === actor,
    });
  }
  res.json(ListClinicalAccessLocationsResponse.parse(result));
});

async function loadActorCategory(professionalId: number): Promise<string | null> {
  const [actor] = await db.select({ category: professionalsTable.category })
    .from(professionalsTable).where(eq(professionalsTable.id, professionalId)).limit(1);
  return actor?.category ?? null;
}

router.get("/clinical-access/locations/:locationId/professionals", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  const locationId = positiveId(req.params.locationId);
  if (!actor || !locationId) {
    res.status(actor ? 400 : 401).json({ error: "Unidade ou acesso inválido." });
    return;
  }
  const management = await clinicManagementPermission(actor, locationId);
  if (!management.allowed) {
    res.status(403).json({ error: "Você não tem autorização para gerir acessos nesta unidade." });
    return;
  }
  const rows = await db.select({ professionalId: locationProfessionalsTable.professionalId })
    .from(locationProfessionalsTable)
    .where(eq(locationProfessionalsTable.locationId, locationId));
  const result = [];
  for (const row of rows) {
    const access = await publicProfessionalAccess(locationId, row.professionalId);
    if (access) result.push(access);
  }
  res.json(ListClinicalProfessionalAccessResponse.parse(result));
});

router.put("/clinical-access/locations/:locationId/professionals/:professionalId", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  const locationId = positiveId(req.params.locationId);
  const professionalId = positiveId(req.params.professionalId);
  const body = ClinicalAccessUpdateBody.safeParse(req.body);
  if (!actor || !locationId || !professionalId || !body.success) {
    res.status(actor ? 400 : 401).json({ error: "Dados de acesso inválidos." });
    return;
  }
  const management = await clinicManagementPermission(actor, locationId);
  if (!management.allowed || (!management.isOwner && professionalId === actor)) {
    res.status(403).json({ error: "A alteração não está autorizada para este administrador." });
    return;
  }
  const target = await linkedProfessional(locationId, professionalId);
  if (!target?.active || !management.empresaId) {
    res.status(404).json({ error: "Profissional ativo não vinculado a esta unidade." });
    return;
  }
  const roleMatrix = await matrix();
  const eligible = target.professionalType === "medico" && target.category === "medico" ||
    target.professionalType !== "medico" && target.category === "enfermagem";
  const roleAllowsPrescription = podeUsar(roleMatrix, "prescricao", target.category ?? "");
  const roleAllowsExams = podeUsar(roleMatrix, "pedido_exames", target.category ?? "");
  if ((!eligible && (body.data.canPrescribe || body.data.canRequestExams)) ||
      (body.data.canPrescribe && !roleAllowsPrescription) ||
      (body.data.canRequestExams && !roleAllowsExams)) {
    res.status(409).json({ error: "A função global deste profissional não permite a concessão solicitada." });
    return;
  }

  const before = await publicProfessionalAccess(locationId, professionalId);
  const after = {
    canPrescribe: body.data.canPrescribe,
    canRequestExams: body.data.canRequestExams,
    isClinicAdmin: Boolean(before?.isClinicAdmin),
    isResponsibleDoctor: Boolean(before?.isResponsibleDoctor),
  };
  await db.transaction(async (tx) => {
    await tx.insert(clinicalAccessGrantsTable).values({
      empresaId: management.empresaId!,
      locationId,
      professionalId,
      canPrescribe: after.canPrescribe,
      canRequestExams: after.canRequestExams,
      isClinicAdmin: after.isClinicAdmin,
      isResponsibleDoctor: after.isResponsibleDoctor,
      updatedByProfessionalId: actor,
    }).onConflictDoUpdate({
      target: [clinicalAccessGrantsTable.professionalId, clinicalAccessGrantsTable.locationId],
      set: { ...after, empresaId: management.empresaId!, updatedByProfessionalId: actor, updatedAt: new Date() },
    });
    await writeAccessAudit(tx, {
      empresaId: management.empresaId!,
      locationId,
      subjectProfessionalId: professionalId,
      actorProfessionalId: actor,
      before: before ? {
        canPrescribe: before.canPrescribe,
        canRequestExams: before.canRequestExams,
        isClinicAdmin: before.isClinicAdmin,
        isResponsibleDoctor: before.isResponsibleDoctor,
      } : null,
      after,
    });
  });
  const updated = await publicProfessionalAccess(locationId, professionalId);
  if (!updated) {
    res.status(500).json({ error: "Não foi possível confirmar a concessão." });
    return;
  }
  res.json(UpdateClinicalProfessionalAccessResponse.parse(updated));
});

router.put("/clinical-access/locations/:locationId/professionals/:professionalId/administration", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  const locationId = positiveId(req.params.locationId);
  const professionalId = positiveId(req.params.professionalId);
  const body = ClinicalAdministrationUpdateBody.safeParse(req.body);
  if (!actor || !locationId || !professionalId || !body.success) {
    res.status(actor ? 400 : 401).json({ error: "Dados administrativos inválidos." });
    return;
  }
  if (!(await isPlatformOwner(actor))) {
    res.status(403).json({ error: "Somente o proprietário global pode definir administrador local ou médico responsável." });
    return;
  }
  const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId)).limit(1);
  const target = await linkedProfessional(locationId, professionalId);
  if (!location?.empresaId || location.active !== "true" || !target?.active) {
    res.status(404).json({ error: "Unidade ou profissional ativo não encontrado." });
    return;
  }
  if (body.data.isClinicAdmin && target.category !== "administrativo") {
    res.status(409).json({ error: "A função de administrador local exige a categoria administrativa." });
    return;
  }
  if (body.data.isResponsibleDoctor) {
    if (target.professionalType !== "medico" || target.category !== "medico") {
      res.status(409).json({ error: "O responsável clínico precisa ser um médico ativo." });
      return;
    }
    try {
      medicalRegistration(target);
    } catch {
      res.status(409).json({ error: "O cadastro do médico responsável precisa ter registro profissional válido." });
      return;
    }
  } else {
    const other = await currentResponsibleDoctor(locationId, location.empresaId);
    if (other?.id === professionalId) {
      res.status(409).json({ error: "Designe outro médico responsável antes de retirar o atual." });
      return;
    }
  }
  const before = await publicProfessionalAccess(locationId, professionalId);
  const after = {
    canPrescribe: Boolean(before?.canPrescribe),
    canRequestExams: Boolean(before?.canRequestExams),
    isClinicAdmin: body.data.isClinicAdmin,
    isResponsibleDoctor: body.data.isResponsibleDoctor,
  };
  try {
    await db.transaction(async (tx) => {
      if (after.isResponsibleDoctor) {
        const previous = await tx.select({
          professionalId: clinicalAccessGrantsTable.professionalId,
          canPrescribe: clinicalAccessGrantsTable.canPrescribe,
          canRequestExams: clinicalAccessGrantsTable.canRequestExams,
          isClinicAdmin: clinicalAccessGrantsTable.isClinicAdmin,
          isResponsibleDoctor: clinicalAccessGrantsTable.isResponsibleDoctor,
        }).from(clinicalAccessGrantsTable).where(and(
          eq(clinicalAccessGrantsTable.locationId, locationId),
          eq(clinicalAccessGrantsTable.empresaId, location.empresaId!),
          eq(clinicalAccessGrantsTable.isResponsibleDoctor, true),
        ));
        for (const old of previous) {
          if (old.professionalId === professionalId) continue;
          await tx.update(clinicalAccessGrantsTable)
            .set({ isResponsibleDoctor: false, updatedByProfessionalId: actor, updatedAt: new Date() })
            .where(and(
              eq(clinicalAccessGrantsTable.professionalId, old.professionalId),
              eq(clinicalAccessGrantsTable.locationId, locationId),
            ));
          await writeAccessAudit(tx, {
            empresaId: location.empresaId!,
            locationId,
            subjectProfessionalId: old.professionalId,
            actorProfessionalId: actor,
            before: {
              canPrescribe: old.canPrescribe,
              canRequestExams: old.canRequestExams,
              isClinicAdmin: old.isClinicAdmin,
              isResponsibleDoctor: true,
            },
            after: {
              canPrescribe: old.canPrescribe,
              canRequestExams: old.canRequestExams,
              isClinicAdmin: old.isClinicAdmin,
              isResponsibleDoctor: false,
            },
          });
        }
      }
      await tx.insert(clinicalAccessGrantsTable).values({
        empresaId: location.empresaId!,
        locationId,
        professionalId,
        ...after,
        updatedByProfessionalId: actor,
      }).onConflictDoUpdate({
        target: [clinicalAccessGrantsTable.professionalId, clinicalAccessGrantsTable.locationId],
        set: { ...after, empresaId: location.empresaId!, updatedByProfessionalId: actor, updatedAt: new Date() },
      });
      await writeAccessAudit(tx, {
        empresaId: location.empresaId!,
        locationId,
        subjectProfessionalId: professionalId,
        actorProfessionalId: actor,
        before: before ? {
          canPrescribe: before.canPrescribe,
          canRequestExams: before.canRequestExams,
          isClinicAdmin: before.isClinicAdmin,
          isResponsibleDoctor: before.isResponsibleDoctor,
        } : null,
        after,
      });
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "Já existe outro médico responsável nesta unidade." });
      return;
    }
    throw error;
  }
  const updated = await publicProfessionalAccess(locationId, professionalId);
  if (!updated) {
    res.status(500).json({ error: "Não foi possível confirmar a designação." });
    return;
  }
  res.json(UpdateClinicalProfessionalAdministrationResponse.parse(updated));
});

router.post("/clinical-approvals", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  const parsed = CreateClinicalApprovalBody.safeParse(req.body);
  if (!actor || !parsed.success) {
    res.status(actor ? 400 : 401).json({ error: "Dados do pedido para conferência inválidos." });
    return;
  }
  const { requestKey, kind, clientId, payload } = parsed.data;
  const tool = kind === "prescricao" ? "prescricao" : "pedido_exames";
  const access = await clinicalToolAccess(req, clientId, tool);
  if (access.mode !== "conferir") {
    res.status(403).json({ error: "Seu acesso não permite preparar este documento para conferência." });
    return;
  }
  const doctor = await currentResponsibleDoctor(access.member.clinic.id, access.member.clinic.empresaId);
  if (!doctor) {
    res.status(422).json({ error: "Esta unidade ainda não tem médico responsável ativo e vinculado." });
    return;
  }
  const normalizedPayload = await normalizeApprovalPayload(kind, payload, access.member.client, access.member.clinic.empresaId);
  const hash = payloadDigest({ kind, clientId, payload: normalizedPayload });
  const [existing] = await db.select().from(clinicalApprovalRequestsTable).where(and(
    eq(clinicalApprovalRequestsTable.preparedByProfessionalId, actor),
    eq(clinicalApprovalRequestsTable.requestKey, requestKey),
  )).limit(1);
  if (existing) {
    if (existing.payloadHash !== hash) {
      res.status(409).json({ error: "A chave de repetição já foi usada com outro conteúdo." });
      return;
    }
    const names = await approvalNames([existing]);
    const response = await buildApprovalResponse(existing, actor, {
      clientName: names.clients.get(existing.clientId) ?? "Cliente",
      locationName: names.locations.get(existing.locationId) ?? "Unidade",
      preparedByName: names.professionals.get(existing.preparedByProfessionalId) ?? "Profissional",
      responsibleDoctorName: doctor.name,
    }, new Set());
    res.status(200).json(ListClinicalApprovalsResponse.element.parse(response));
    return;
  }
  let created: typeof clinicalApprovalRequestsTable.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(clinicalApprovalRequestsTable).values({
        requestKey,
        payloadHash: hash,
        kind,
        status: "pendente",
        empresaId: access.member.clinic.empresaId,
        locationId: access.member.clinic.id,
        clientId: access.member.client.id,
        preparedByProfessionalId: actor,
        payload: normalizedPayload,
      }).returning();
      await tx.insert(clinicalApprovalEventsTable).values({
        requestId: row.id,
        actorProfessionalId: actor,
        eventType: "solicitado",
        details: { kind },
      });
      return row;
    });
  } catch (error) {
    if ((error as { code?: string })?.code !== "23505") throw error;
    const [duplicate] = await db.select().from(clinicalApprovalRequestsTable).where(and(
      eq(clinicalApprovalRequestsTable.preparedByProfessionalId, actor),
      eq(clinicalApprovalRequestsTable.requestKey, requestKey),
    )).limit(1);
    if (!duplicate || duplicate.payloadHash !== hash) {
      res.status(409).json({ error: "A chave de repetição foi usada por outro conteúdo." });
      return;
    }
    created = duplicate;
  }
  const names = await approvalNames([created]);
  const response = await buildApprovalResponse(created, actor, {
    clientName: names.clients.get(created.clientId) ?? access.member.client.name,
    locationName: names.locations.get(created.locationId) ?? access.member.clinic.name,
    preparedByName: names.professionals.get(created.preparedByProfessionalId) ?? access.member.professional.name,
    responsibleDoctorName: doctor.name,
  }, new Set());
  res.status(201).json(ListClinicalApprovalsResponseItem.parse(response));
});

router.get("/clinical-approvals", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor) {
    res.status(401).json({ error: "Faça login de colaborador." });
    return;
  }
  const scopes = await responsibleScopes(actor);
  const reviewerConditions = scopes.map((scope) => and(
    eq(clinicalApprovalRequestsTable.locationId, scope.locationId),
    eq(clinicalApprovalRequestsTable.empresaId, scope.empresaId),
    inArray(clinicalApprovalRequestsTable.status, ["pendente", "processando"]),
  ));
  const filters = [
    eq(clinicalApprovalRequestsTable.preparedByProfessionalId, actor),
    ...reviewerConditions,
  ];
  const rows = filters.length ? await db.select().from(clinicalApprovalRequestsTable)
    .where(or(...filters))
    .orderBy(desc(clinicalApprovalRequestsTable.createdAt))
    .limit(200) : [];
  const deduped = [...new Map(rows.map((row) => [row.id, row])).values()];
  const names = await approvalNames(deduped);
  const response = [];
  for (const row of deduped) {
    const responsible = await currentResponsibleDoctor(row.locationId, row.empresaId);
    response.push(await buildApprovalResponse(row, actor, {
      clientName: names.clients.get(row.clientId) ?? "Cliente",
      locationName: names.locations.get(row.locationId) ?? "Unidade",
      preparedByName: names.professionals.get(row.preparedByProfessionalId) ?? "Profissional",
      responsibleDoctorName: responsible?.name ?? null,
    }, new Set(scopes.map((scope) => scope.locationId))));
  }
  res.json(ListClinicalApprovalsResponse.parse(response));
});

router.get("/clinical-approvals/count", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor) {
    res.status(401).json({ error: "Faça login de colaborador." });
    return;
  }
  const scopes = await responsibleScopes(actor);
  const conditions = scopes.map((scope) => and(
    eq(clinicalApprovalRequestsTable.locationId, scope.locationId),
    eq(clinicalApprovalRequestsTable.empresaId, scope.empresaId),
    eq(clinicalApprovalRequestsTable.status, "pendente"),
  ));
  if (!conditions.length) {
    res.json(CountClinicalApprovalsResponse.parse({ count: 0 }));
    return;
  }
  const rows = await db.select({ id: clinicalApprovalRequestsTable.id })
    .from(clinicalApprovalRequestsTable).where(or(...conditions));
  res.json(CountClinicalApprovalsResponse.parse({ count: rows.length }));
});

router.post("/clinical-approvals/:id/reject", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  const id = positiveId(req.params.id);
  const body = RejectClinicalApprovalBody.safeParse(req.body);
  if (!actor || !id || !body.success) {
    res.status(actor ? 400 : 401).json({ error: "Dados da decisão inválidos." });
    return;
  }
  const [request] = await db.select().from(clinicalApprovalRequestsTable)
    .where(eq(clinicalApprovalRequestsTable.id, id)).limit(1);
  if (!request) {
    res.status(404).json({ error: "Solicitação não encontrada." });
    return;
  }
  try {
    await assertCurrentResponsibleDoctor(actor, request.locationId, request.empresaId);
  } catch (error) {
    const status = error instanceof ClinicalAccessError ? error.status : 403;
    res.status(status).json({ error: error instanceof Error ? error.message : "Sem autorização." });
    return;
  }
  if (request.status !== "pendente") {
    res.status(409).json({ error: "A solicitação já foi processada ou está em conferência." });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(clinicalApprovalRequestsTable).set({
      status: "rejeitado",
      rejectionReason: body.data.reason.trim(),
      decidedByProfessionalId: actor,
      decidedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(clinicalApprovalRequestsTable.id, id),
      eq(clinicalApprovalRequestsTable.status, "pendente"),
      eq(clinicalApprovalRequestsTable.locationId, request.locationId),
      eq(clinicalApprovalRequestsTable.empresaId, request.empresaId),
    )).returning();
    if (!row) return null;
    await tx.insert(clinicalApprovalEventsTable).values({
      requestId: id,
      actorProfessionalId: actor,
      eventType: "rejeitado",
      details: { reason: body.data.reason.trim() },
    });
    return row;
  });
  if (!updated) {
    res.status(409).json({ error: "Outro processo já decidiu esta solicitação." });
    return;
  }
  const names = await approvalNames([updated]);
  const doctor = await currentResponsibleDoctor(updated.locationId, updated.empresaId);
  const response = await buildApprovalResponse(updated, actor, {
    clientName: names.clients.get(updated.clientId) ?? "Cliente",
    locationName: names.locations.get(updated.locationId) ?? "Unidade",
    preparedByName: names.professionals.get(updated.preparedByProfessionalId) ?? "Profissional",
    responsibleDoctorName: doctor?.name ?? null,
  }, new Set([updated.locationId]));
  res.json(RejectClinicalApprovalResponse.parse(response));
});

export default router;
