import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  clientsTable,
  db,
  examDocumentsTable,
  professionalsTable,
} from "@workspace/db";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter.js";
import { authorizeExamReviewer, nextExamReviewStatus } from "../lib/exam-review-policy.js";
import { requireCollaborator } from "./collaborator.js";

const router: IRouter = Router();

const CATEGORY_LABEL: Record<string, string> = {
  medico: "Médico(a)",
  enfermagem: "Enfermagem",
  recepcao: "Recepção",
  administrativo: "Administrativo",
  financeiro: "Financeiro",
  outro: "Colaborador(a)",
};

function cargoLabel(role: string | null, category: string | null): string {
  return role?.trim() || CATEGORY_LABEL[category ?? "outro"] || "Colaborador(a)";
}

// O colaborador vem da sessão validada pelo servidor; professionalId no corpo
// é aceito apenas por compatibilidade e nunca concede identidade ou permissão.
router.patch(
  "/exames-lab/documentos/:id/conferir",
  requireCollaborator,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const phase = Number(req.body?.fase);
      const actorId = req.collaborator?.professionalId;
      if (phase !== 1 && phase !== 2) {
        res.status(400).json({ error: "fase deve ser 1 (operacional) ou 2 (clínica)." });
        return;
      }
      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "Identificador de documento inválido." });
        return;
      }
      if (!actorId) {
        res.status(401).json({ error: "Faça login de colaborador." });
        return;
      }

      const [doc] = await db
        .select({
          id: examDocumentsTable.id,
          status: examDocumentsTable.status,
          clientId: examDocumentsTable.clientId,
          empresaId: examDocumentsTable.empresaId,
        })
        .from(examDocumentsTable)
        .where(eq(examDocumentsTable.id, id))
        .limit(1);
      if (!doc) {
        res.status(404).json({ error: "Documento não encontrado." });
        return;
      }

      const [client] = await db
        .select({
          id: clientsTable.id,
          empresaId: clientsTable.empresaId,
          status: clientsTable.status,
        })
        .from(clientsTable)
        .where(eq(clientsTable.id, doc.clientId))
        .limit(1);
      if (!client || client.status !== "active") {
        res.status(404).json({ error: "Documento não encontrado nesta clínica." });
        return;
      }

      const [professional] = await db
        .select({
          id: professionalsTable.id,
          name: professionalsTable.name,
          role: professionalsTable.role,
          category: professionalsTable.category,
          professionalType: professionalsTable.professionalType,
          active: professionalsTable.active,
          crm: professionalsTable.crm,
          registrationNumber: professionalsTable.registrationNumber,
          registrationCouncil: professionalsTable.registrationCouncil,
        })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, actorId))
        .limit(1);

      const companyMatches = Boolean(
        req.tenantContext?.authenticated &&
        req.tenantContext.professionalId === actorId &&
        req.tenantContext.empresaId > 0 &&
        client.empresaId === req.tenantContext.empresaId &&
        (doc.empresaId == null || doc.empresaId === client.empresaId),
      );

      let clinicalMembershipValidated = false;
      if (phase === 2 && companyMatches) {
        try {
          const identity = await resolveClinicalEmitter(req, doc.clientId);
          clinicalMembershipValidated =
            identity.professional.id === actorId && identity.canPrescribe;
        } catch (error) {
          if (error instanceof ClinicalIdentityError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          throw error;
        }
      }

      const authorization = authorizeExamReviewer({
        phase,
        authenticatedProfessionalId: actorId,
        requestedProfessionalId: req.body?.professionalId,
        professional,
        companyMatches,
        clinicalMembershipValidated,
      });
      if (!authorization.allowed) {
        res.status(authorization.status).json({ error: authorization.error });
        return;
      }

      const transition = nextExamReviewStatus(doc.status, phase);
      if ("error" in transition) {
        res.status(409).json({ error: transition.error });
        return;
      }

      const reviewer = authorization.professional;
      const cargo = cargoLabel(reviewer.role, reviewer.category);
      const now = new Date();
      const values = phase === 1
        ? {
            status: transition.status,
            conf1ProfessionalId: reviewer.id,
            conf1Name: reviewer.name,
            conf1Cargo: cargo,
            conf1At: now,
          }
        : {
            status: transition.status,
            conf2ProfessionalId: reviewer.id,
            conf2Name: reviewer.name,
            conf2Cargo: cargo,
            conf2At: now,
            conferredAt: now,
          };

      const updated = await db.update(examDocumentsTable)
        .set(values)
        .where(and(
          eq(examDocumentsTable.id, id),
          eq(examDocumentsTable.status, doc.status),
        ))
        .returning({ id: examDocumentsTable.id });
      if (!updated.length) {
        res.status(409).json({ error: "O documento mudou durante a conferência; atualize a tela e tente novamente." });
        return;
      }
      res.json({ ok: true, status: transition.status });
    } catch (error) {
      console.error("[ExamesLab] Erro ao conferir:", (error as Error).message);
      res.status(500).json({ error: "Erro ao conferir documento." });
    }
  },
);

export default router;
