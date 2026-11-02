import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  clinicalApprovalEventsTable,
  clinicalApprovalRequestsTable,
  db,
} from "@workspace/db";
import { ClinicalAccessError, assertCurrentResponsibleDoctor } from "./clinical-access";
import { ClinicalIdentityError, resolveClinicalEmitter } from "./clinical-emitter";

export type ClinicalDbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function loadApprovalForEmission(
  req: Request,
  requestId: number,
  expectedKind: "prescricao" | "pedido_exames",
) {
  const actor = Number(req.collaborator?.professionalId);
  if (!Number.isSafeInteger(actor) || actor <= 0) {
    throw new ClinicalIdentityError(401, "Faça login de colaborador.");
  }
  const [request] = await db.select().from(clinicalApprovalRequestsTable)
    .where(eq(clinicalApprovalRequestsTable.id, requestId)).limit(1);
  if (!request || request.kind !== expectedKind) {
    throw new ClinicalAccessError(404, "Solicitação de conferência não encontrada.");
  }
  await assertCurrentResponsibleDoctor(actor, request.locationId, request.empresaId);
  const identity = await resolveClinicalEmitter(req, request.clientId);
  if (identity.clinic.id !== request.locationId || identity.clinic.empresaId !== request.empresaId) {
    throw new ClinicalAccessError(403, "O cliente não pertence mais à unidade desta solicitação.");
  }
  if (request.status !== "pendente" && request.status !== "aprovado") {
    throw new ClinicalAccessError(409, "A solicitação já foi rejeitada ou está em processamento.");
  }
  return { request, identity, actor };
}

export async function claimApprovalInTransaction(
  tx: ClinicalDbTransaction,
  requestId: number,
  actorProfessionalId: number,
): Promise<"claimed" | "already_approved" | "unavailable"> {
  const [claimed] = await tx.update(clinicalApprovalRequestsTable).set({
    status: "processando",
    decidedByProfessionalId: actorProfessionalId,
    updatedAt: new Date(),
  }).where(and(
    eq(clinicalApprovalRequestsTable.id, requestId),
    eq(clinicalApprovalRequestsTable.status, "pendente"),
  )).returning({ id: clinicalApprovalRequestsTable.id });
  if (claimed) {
    await tx.insert(clinicalApprovalEventsTable).values({
      requestId,
      actorProfessionalId,
      eventType: "emissao_iniciada",
      details: {},
    });
    return "claimed";
  }
  const [current] = await tx.select({ status: clinicalApprovalRequestsTable.status })
    .from(clinicalApprovalRequestsTable)
    .where(eq(clinicalApprovalRequestsTable.id, requestId))
    .limit(1);
  return current?.status === "aprovado" ? "already_approved" : "unavailable";
}

export async function completeApprovalInTransaction(
  tx: ClinicalDbTransaction,
  requestId: number,
  actorProfessionalId: number,
  documentIds: number[],
): Promise<void> {
  const [completed] = await tx.update(clinicalApprovalRequestsTable).set({
    status: "aprovado",
    decidedByProfessionalId: actorProfessionalId,
    result: { documentIds },
    decidedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(clinicalApprovalRequestsTable.id, requestId),
    eq(clinicalApprovalRequestsTable.status, "processando"),
  )).returning({ id: clinicalApprovalRequestsTable.id });
  if (!completed) throw new ClinicalAccessError(409, "A solicitação mudou durante a emissão.");
  await tx.insert(clinicalApprovalEventsTable).values({
    requestId,
    actorProfessionalId,
    eventType: "aprovado_e_emitido",
    details: { documentIds },
  });
}
