import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { clientsTable, db, examDocumentsTable, professionalsTable } from "@workspace/db";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter.js";
import { authorizeExamReviewer } from "../lib/exam-review-policy.js";
import { getInternalCopy } from "../lib/exam-file-store.js";
import { driveDownloadFile } from "../lib/google-drive.js";
import { logger } from "../lib/logger.js";
import { requireDocumentInSession, sessionEmpresaId } from "../lib/exam-tenant.js";
import {
  claimQuarantine,
  loadQuarantine,
  recordHumanDecision,
  revertClaim,
} from "../lib/exam-extraction/identity-gate.js";
import { requireCollaborator } from "./collaborator.js";

/** Quem incorpora é injetado pela rota de exames (evita importação circular). */
export type IncorporateFn = (
  job: { documentId: number; clientId: number; buffer: Buffer; fileName: string; sourcePdfDriveId?: string | null; notify?: boolean },
  data: any,
  modelUsed: string,
  pipeline: any[],
) => Promise<void>;

const NOTE_MIN = { revisao: 10, contradicao: 15 } as const;

export function createExamIdentityRouter(incorporate: IncorporateFn): IRouter {
  const router: IRouter = Router();

  // Detalhe da quarentena: só colaborador da mesma clínica; CPF sempre mascarado.
  router.get("/exames-lab/documentos/:id/identidade", requireCollaborator, async (req: Request, res: Response) => {
    try {
      const scope = await requireDocumentInSession(req, res, Number(req.params.id));
      if (!scope) return;
      const quarantine = await loadQuarantine(scope.id);
      const [client] = await db
        .select({ name: clientsTable.name, birthDate: clientsTable.birthDate })
        .from(clientsTable)
        .where(eq(clientsTable.id, scope.clientId))
        .limit(1);
      if (!quarantine) {
        res.json({ documentId: scope.id, status: scope.status, emQuarentena: false });
        return;
      }
      const patient = quarantine.payload?.extracted?.patient ?? null;
      res.json({
        documentId: scope.id,
        status: scope.status,
        emQuarentena: scope.status === "quarentena",
        veredito: quarantine.verdict,
        motivos: quarantine.reasons,
        decisao: quarantine.decision,
        versaoRegras: quarantine.ruleSetVersion,
        trilha: quarantine.trail,
        // Análise PRELIMINAR (CPF ausente): leitura para conferência; NADA disto está no prontuário.
        previa: quarantine.decision === "preliminar" && quarantine.payload?.extracted
          ? {
              aviso: "Análise preliminar: estes valores não estão no prontuário e não alimentam a evolução.",
              coleta: quarantine.payload.extracted.collectionDate,
              laboratorio: quarantine.payload.extracted.labName,
              analitos: quarantine.payload.extracted.analytes.slice(0, 300).map((a) => ({
                nome: a.name, valor: a.value, unidade: a.unit, referencia: a.referenceRange,
              })),
            }
          : null,
        laudo: patient
          ? { nome: patient.name, nascimento: patient.birthDate, cpfFinal: patient.cpf ? String(patient.cpf).replace(/\D/g, "").slice(-2) : null }
          : null,
        cadastro: client ? { nome: client.name, nascimento: client.birthDate } : null,
      });
    } catch (err) {
      req.log?.error({ err }, "GET identidade falhou");
      res.status(500).json({ error: "Falha ao consultar a verificação de identidade." });
    }
  });

  async function decide(req: Request, res: Response, action: "liberar" | "rejeitar"): Promise<void> {
    try {
      const actorId = req.collaborator?.professionalId;
      const scope = await requireDocumentInSession(req, res, Number(req.params.id));
      if (!scope) return;
      if (!actorId || sessionEmpresaId(req) !== scope.empresaId || req.tenantContext.professionalId !== actorId) {
        res.status(403).json({ error: "Sem vínculo ativo com a clínica deste exame." });
        return;
      }
      const note = typeof req.body?.justificativa === "string" ? req.body.justificativa.trim() : "";
      const quarantine = await loadQuarantine(scope.id);
      if (!quarantine || scope.status !== "quarentena") {
        res.status(409).json({ error: "O documento não está em quarentena de identidade." });
        return;
      }
      const needsDoctor = action === "liberar" && quarantine.verdict === "contradicao";
      const minNote = action === "rejeitar" ? NOTE_MIN.revisao : NOTE_MIN[quarantine.verdict];
      if (note.length < minNote) {
        res.status(400).json({ error: `Informe a justificativa (mínimo de ${minNote} caracteres).` });
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

      let clinicalMembershipValidated = false;
      if (needsDoctor) {
        try {
          const identity = await resolveClinicalEmitter(req, scope.clientId);
          clinicalMembershipValidated = identity.professional.id === actorId && identity.canPrescribe;
        } catch (error) {
          if (error instanceof ClinicalIdentityError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          throw error;
        }
      }
      const authorization = authorizeExamReviewer({
        phase: needsDoctor ? 2 : 1,
        authenticatedProfessionalId: actorId,
        requestedProfessionalId: req.body?.professionalId,
        professional,
        companyMatches: true,
        clinicalMembershipValidated,
      });
      if (!authorization.allowed) {
        res.status(authorization.status).json({ error: authorization.error });
        return;
      }

      if (action === "rejeitar") {
        if ((await claimQuarantine(scope.id, "identidade_rejeitada")) !== "claimed") {
          res.status(409).json({ error: "O documento já foi decidido por outra pessoa." });
          return;
        }
        await recordHumanDecision({ documentId: scope.id, empresaId: scope.empresaId, clientId: scope.clientId, event: "rejeicao_humana", professionalId: actorId, note });
        res.json({ ok: true, status: "identidade_rejeitada" });
        return;
      }

      // Documento que já tinha resultados gravados (contradição detectada depois da leitura): a liberação
      // só restaura o status. Não reincorpora, não reextrai e não duplica nenhum resultado.
      const [jaTemResultados] = (
        await db.execute(sql`SELECT 1 AS ok FROM exam_results WHERE exam_document_id = ${scope.id} LIMIT 1`)
      ).rows as Array<{ ok: number }>;
      if (jaTemResultados) {
        if ((await claimQuarantine(scope.id, "recebido")) !== "claimed") {
          res.status(409).json({ error: "O documento já foi decidido por outra pessoa." });
          return;
        }
        await recordHumanDecision({ documentId: scope.id, empresaId: scope.empresaId, clientId: scope.clientId, event: "liberacao_humana", professionalId: actorId, note });
        res.json({ ok: true, status: "recebido" });
        return;
      }
      if (!quarantine.payload?.extracted) {
        res.status(422).json({ error: "O conteúdo extraído deste documento não está disponível; reenvie o laudo." });
        return;
      }
      // O original é necessário para o cofre e o arquivo do cliente: sem ele, não se incorpora.
      const [doc] = await db
        .select({ fileName: examDocumentsTable.fileName, sourcePdfDriveId: examDocumentsTable.sourcePdfDriveId })
        .from(examDocumentsTable)
        .where(eq(examDocumentsTable.id, scope.id))
        .limit(1);
      let original: Buffer | null = (await getInternalCopy(scope.id).catch(() => null))?.bytes ?? null;
      if ((!original || original.length === 0) && doc?.sourcePdfDriveId) {
        original = await driveDownloadFile(doc.sourcePdfDriveId).catch(() => null);
      }
      if (!original || original.length === 0) {
        res.status(422).json({ error: "O arquivo original não está disponível; peça o reenvio do laudo." });
        return;
      }
      if ((await claimQuarantine(scope.id, "processando")) !== "claimed") {
        res.status(409).json({ error: "O documento já foi decidido por outra pessoa." });
        return;
      }
      try {
        await incorporate(
          {
            documentId: scope.id,
            clientId: scope.clientId,
            buffer: original,
            fileName: doc?.fileName ?? `documento-${scope.id}.pdf`,
            sourcePdfDriveId: doc?.sourcePdfDriveId ?? null,
            notify: false,
          },
          quarantine.payload.extracted,
          quarantine.payload.modelUsed,
          quarantine.payload.pipeline,
        );
      } catch (error) {
        await revertClaim(scope.id).catch(() => undefined);
        logger.error({ err: error, docId: scope.id }, "[ExamesLab] liberação humana falhou ao incorporar; documento voltou à quarentena");
        res.status(500).json({ error: "Falha ao incorporar o exame; ele continua em quarentena." });
        return;
      }
      await recordHumanDecision({ documentId: scope.id, empresaId: scope.empresaId, clientId: scope.clientId, event: "liberacao_humana", professionalId: actorId, note });
      res.json({ ok: true, status: "recebido" });
    } catch (err) {
      req.log?.error({ err }, "decisão de identidade falhou");
      res.status(500).json({ error: "Falha ao registrar a decisão de identidade." });
    }
  }

  router.post("/exames-lab/documentos/:id/identidade/liberar", requireCollaborator, (req, res) => void decide(req, res, "liberar"));
  router.post("/exames-lab/documentos/:id/identidade/rejeitar", requireCollaborator, (req, res) => void decide(req, res, "rejeitar"));
  return router;
}
