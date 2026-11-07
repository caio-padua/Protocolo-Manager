import { Router, type Request, type Response } from "express";
import { db, clientsTable, locationsTable, professionalsTable } from "@workspace/db";
import { CreateClinicalDemonstrationBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { ClinicalAccessError, clinicalToolAccess } from "../lib/clinical-access";
import { resolvePrescriptionSigner, signExistingClinicalPdf } from "../lib/prescription-signing";
import { generateReceituarioPdfV2 } from "../lib/receituario-pdf";
import { generateExamRequestPdf } from "../lib/exam-request-pdf";
import { validateExamCatalogItems } from "../lib/exam-catalog-validation";
import { prescriptionItemForDocument } from "../lib/prescription-rendering";
import { getModeloAtivo } from "../lib/receituario-motor";
import { ObjectStorageService } from "../lib/objectStorage";
import { brtDisplayDate, brtISODate } from "../lib/brt";
import {
  kindFromId, listDemonstrations, readDemonstration, saveDemonstration,
  type DemonstrationKind,
} from "../lib/clinical-demonstration-store";

const router = Router();

async function authorized(req: Request, kind: DemonstrationKind) {
  const clientId = Number(req.params.clientId);
  if (!Number.isSafeInteger(clientId) || clientId <= 0) {
    throw new ClinicalIdentityError(400, "Cliente inválido.");
  }
  const tool = kind === "prescricao" ? "prescricao" : "pedido_exames";
  const access = await clinicalToolAccess(req, clientId, tool);
  if (access.mode !== "direto") throw new ClinicalAccessError(403, "Emissão de teste não autorizada para este profissional e clínica.");
  const identity = await resolveClinicalEmitter(req, clientId);
  if (!identity.canPrescribe) throw new ClinicalIdentityError(422, identity.issue ?? "Identidade médica incompleta.");
  return {
    identity,
    owner: {
      empresaId: identity.clinic.empresaId, clinicId: identity.clinic.id,
      professionalId: identity.professional.id, clientId: identity.client.id,
    },
  };
}

function respondError(req: Request, res: Response, error: unknown): void {
  if (error instanceof ClinicalIdentityError || error instanceof ClinicalAccessError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log?.error({ err: error }, "Falha em documento de demonstração");
  res.status(500).json({ error: "Não foi possível concluir. Confira os documentos de teste antes de tentar novamente." });
}

async function loadSignature(professionalId: number) {
  const [professional] = await db.select({ signatureUrl: professionalsTable.signatureUrl })
    .from(professionalsTable).where(eq(professionalsTable.id, professionalId)).limit(1);
  if (!professional?.signatureUrl) return undefined;
  const path = professional.signatureUrl.replace(/^\/api\/storage/, "");
  if (!path.startsWith("/objects/uploads/signatures/")) {
    throw new ClinicalIdentityError(422, "O caminho da assinatura cadastrada é inválido.");
  }
  try {
    const file = await new ObjectStorageService().getObjectEntityFile(path);
    const [bytes] = await file.download();
    if (!bytes.length || bytes.length > 2_000_000) throw new Error("invalid image");
    return { bytes, mime: path.toLowerCase().endsWith(".png") ? "image/png" as const : "image/jpeg" as const };
  } catch {
    throw new ClinicalIdentityError(422, "A imagem da assinatura cadastrada não pôde ser lida.");
  }
}

router.get("/clinical-demonstrations/:clientId", requireCollaborator, async (req, res): Promise<void> => {
  const kind = req.query.kind;
  if (kind !== "prescricao" && kind !== "exames") {
    res.status(400).json({ error: "Selecione o tipo de documento." }); return;
  }
  try {
    const { owner } = await authorized(req, kind);
    const documents = await listDemonstrations(owner, kind);
    res.setHeader("Cache-Control", "no-store");
    res.json(documents);
  } catch (error) { respondError(req, res, error); }
});

router.get("/clinical-demonstrations/:clientId/:id", requireCollaborator, async (req, res): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const kind = kindFromId(id);
  if (!kind) { res.status(404).json({ error: "Documento não encontrado." }); return; }
  try {
    const { owner } = await authorized(req, kind);
    const bytes = await readDemonstration(owner, id);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="DOCUMENTO-DE-TESTE-SEM-VALIDADE.pdf"');
    res.send(bytes);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 404) {
      res.status(404).json({ error: "Documento não encontrado." }); return;
    }
    respondError(req, res, error);
  }
});

router.post("/clinical-demonstrations/:clientId", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = CreateClinicalDemonstrationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Dados do documento de teste inválidos." }); return; }
  const body = parsed.data;
  if ((body.kind === "prescricao" && (!body.prescriptionItems?.length || body.examItems)) ||
      (body.kind === "exames" && (!body.examItems?.length || body.prescriptionItems))) {
    res.status(400).json({ error: "Selecione itens do tipo correto." }); return;
  }
  if (body.kind === "prescricao" && body.prescriptionItems!.some(item => !item.name.trim() || item.isControlled)) {
    res.status(422).json({ error: "Para demonstração, selecione fórmulas identificadas e não controladas." }); return;
  }
  try {
    const { identity, owner } = await authorized(req, body.kind);
    const signer = await resolvePrescriptionSigner(identity);
    const signature = await loadSignature(identity.professional.id);
    let bytes: Uint8Array;
    if (body.kind === "prescricao") {
      const [clinic] = await db.select({ name: locationsTable.name, address: locationsTable.address, phone: locationsTable.phone })
        .from(locationsTable).where(eq(locationsTable.id, identity.clinic.id)).limit(1);
      const [client] = await db.select({ birthDate: clientsTable.birthDate, address: clientsTable.address })
        .from(clientsTable).where(eq(clientsTable.id, identity.client.id)).limit(1);
      const model = await getModeloAtivo();
      const rawConfig = model.config["designerConfig"];
      const designerConfig = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
        ? { ...(rawConfig as Record<string, unknown>) } : {};
      for (const key of ["selectedClinicaId", "selectedMedicoId", "assinaturaDataUrl", "certificadoQrDataUrl"]) delete designerConfig[key];
      bytes = await generateReceituarioPdfV2({
        medicoName: identity.professional.name,
        medicoCrm: [identity.professional.crm, identity.professional.uf].filter(Boolean).join(" / "),
        clinicaNome: clinic?.name ?? identity.clinic.name,
        clinicaEndereco: clinic?.address ?? undefined,
        clinicaTelefone: clinic?.phone ?? undefined,
        pacienteNome: identity.client.name,
        pacienteCpf: identity.client.cpf ?? undefined,
        pacienteNascimento: client?.birthDate ?? undefined,
        pacienteEndereco: client?.address ?? undefined,
        formulas: body.prescriptionItems!.map(prescriptionItemForDocument),
        tipoReceita: "simples",
        dataEmissao: brtISODate(),
        homologacao: true,
        tituloSubtitulo: "DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA",
        assinaturaImagem: signature,
        designerConfig,
        bandModel: typeof model.config["bandModelId"] === "string" ? model.config["bandModelId"] : undefined,
      }, signer);
    } else {
      let items;
      try { items = await validateExamCatalogItems(body.examItems!); }
      catch (error) {
        res.status(422).json({ error: error instanceof Error ? error.message.replace(/^EXAM_CATALOG_INVALID: /, "") : "Exame fora do catálogo ativo." }); return;
      }
      const pdf = await generateExamRequestPdf({
        homologacao: true, tipo: "TESTE", tipoLabel: "DOCUMENTO DE TESTE",
        clientName: identity.client.name, clientCpf: identity.client.cpf,
        professionalName: identity.professional.name,
        professionalCrm: [identity.professional.crm, identity.professional.uf].filter(Boolean).join(" / "),
        dateBR: brtDisplayDate(), observacao: body.observacao, items,
        assinaturaImagem: signature, certificado: signer.meta,
      });
      bytes = await signExistingClinicalPdf(pdf, signer, "Solicitacao de exames");
    }
    const id = await saveDemonstration(owner, body.kind, bytes);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ id, kind: body.kind, createdAt: new Date().toISOString() });
  } catch (error) { respondError(req, res, error); }
});

export default router;
