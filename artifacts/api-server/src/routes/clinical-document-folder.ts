import { createHash } from "node:crypto";
import { Router, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable, collaboratorAuditTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalEmitter, resolveClinicalMember } from "../lib/clinical-emitter";
import { authorizedPrescription } from "./prescription-delivery";
import {
  getIssuedDocument, listIssuedDocumentsForClient, type ClinicalDocumentType,
} from "../lib/clinical-document-share";
import {
  driveListChildren, ensureClientFolderStructure, isDriveConnected, uploadFileToDrive,
} from "../lib/google-drive";

/**
 * Painel de Encaminhamento — parte "guardar na pasta do cliente".
 * Copia o PDF JÁ EMITIDO (nunca gera outro) para a subpasta correta da pasta do cliente no Drive da
 * empresa. A raiz vem sempre da empresa autenticada; sem raiz, o envio é bloqueado (nunca cai na pasta global).
 */
const router = Router();
router.use(requireCollaborator);

const TIPOS = [
  "prescricao", "pedido_exames", "atestado", "encaminhamento",
  "protocolo", "ras_fap", "carta_tratamento", "documento_assinado",
] as const;

/** Subpasta do cliente por tipo de documento (nomes que já existem em CLIENT_SUBFOLDERS). */
export const PASTA_POR_TIPO: Record<ClinicalDocumentType, string> = {
  prescricao: "RECEITAS",
  pedido_exames: "EXAMES",
  atestado: "ATESTADOS",
  encaminhamento: "ATESTADOS", // mesma pasta que a emissão do encaminhamento já usa
  protocolo: "PROTOCOLOS",
  ras_fap: "PROTOCOLOS",
  carta_tratamento: "PROTOCOLOS",
  documento_assinado: "CONTRATOS",
};

const Body = z.object({
  documentType: z.enum(TIPOS),
  documentId: z.number().int().positive(),
  clientId: z.number().int().positive(),
  confirmed: z.literal(true),
}).strict();

function noStore(res: Response) {
  res.set({ "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" });
}

function nomeSeguro(valor: string) {
  return (valor || "documento-clinico").replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N}._ -]+/gu, "_").trim().slice(0, 100);
}

async function identidadeDe(req: Parameters<typeof resolveClinicalEmitter>[0], tipo: string, clientId: number) {
  return tipo === "documento_assinado" ? resolveClinicalMember(req, clientId) : resolveClinicalEmitter(req, clientId);
}

async function raizDriveDaEmpresa(empresaId: number): Promise<string | null> {
  const r = await db.execute(sql`SELECT drive_clientes_folder_id FROM empresas WHERE id=${empresaId} LIMIT 1`);
  const v = (r.rows as Array<{ drive_clientes_folder_id?: unknown }>)[0]?.drive_clientes_folder_id;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Lista os documentos emitidos do cliente (opcionalmente filtrados por tipo) para o painel de cada ferramenta. */
router.get("/clinical-documents/issued/:clientId", async (req, res) => {
  noStore(res);
  const clientId = Number(req.params.clientId);
  const pedidos = String(req.query.tipos ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (!Number.isSafeInteger(clientId) || clientId <= 0 || pedidos.some((t) => !(TIPOS as readonly string[]).includes(t))) {
    res.status(400).json({ error: "Cliente ou tipo de documento inválido." });
    return;
  }
  try {
    // Para documentos assinados o vínculo basta; para os demais, o emissor autenticado.
    const identity = pedidos.length > 0 && pedidos.every((t) => t === "documento_assinado")
      ? await resolveClinicalMember(req, clientId)
      : await resolveClinicalEmitter(req, clientId);
    const docs = await listIssuedDocumentsForClient({
      clientId: identity.client.id, empresaId: identity.clinic.empresaId, locationId: identity.clinic.id,
    });
    const visiveis = docs.filter((d) =>
      (pedidos.length === 0 || pedidos.includes(d.documentType)) &&
      (d.professionalId === null || d.professionalId === identity.professional.id));
    res.json({ documents: visiveis.map((d) => ({ ...d, pasta: PASTA_POR_TIPO[d.documentType] })) });
  } catch (error) {
    if (error instanceof ClinicalIdentityError) { res.status(error.status).json({ error: error.message }); return; }
    req.log.error({ err: String(error), clientId }, "Falha ao listar documentos emitidos");
    res.status(500).json({ error: "Não foi possível listar os documentos emitidos." });
  }
});

router.post("/clinical-documents/archive-folder", async (req, res) => {
  noStore(res);
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Confira o documento e a confirmação para guardar na pasta." }); return; }
  const input = parsed.data;
  try {
    const identity = await identidadeDe(req, input.documentType, input.clientId);
    const document = await getIssuedDocument(input.documentType, input.documentId);
    if (!document || document.clientId !== identity.client.id ||
      (document.professionalId !== null && document.professionalId !== identity.professional.id) ||
      document.status !== "emitted" || !document.pdfData) {
      res.status(404).json({ error: "O documento emitido não pertence ao cliente selecionado ou não está disponível." });
      return;
    }
    if (input.documentType === "prescricao" && document.prescriptionId) {
      const { identity: pi } = await authorizedPrescription(req, document.prescriptionId);
      if (pi.client.id !== identity.client.id || pi.clinic.id !== identity.clinic.id) {
        res.status(403).json({ error: "A prescrição não está no escopo clínico autenticado." });
        return;
      }
    }
    const bytes = Buffer.from(document.pdfData, "base64");
    if (!bytes.length || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      res.status(422).json({ error: "O arquivo emitido está vazio ou inválido; nada foi guardado." });
      return;
    }
    const [client] = await db.select().from(clientsTable).where(and(
      eq(clientsTable.id, identity.client.id),
      eq(clientsTable.empresaId, identity.clinic.empresaId),
      eq(clientsTable.locationId, identity.clinic.id),
    )).limit(1);
    if (!client) { res.status(403).json({ error: "O cliente não pertence à clínica autenticada." }); return; }
    if (!client.cpf?.trim()) {
      res.status(422).json({ error: "O cliente não tem CPF cadastrado; a pasta exclusiva dele não pode ser localizada." });
      return;
    }
    const raiz = await raizDriveDaEmpresa(identity.clinic.empresaId);
    if (!raiz) { res.status(422).json({ error: "A empresa não tem a pasta de clientes configurada no Drive. Nada foi guardado." }); return; }
    if (!await isDriveConnected()) { res.status(503).json({ error: "Google Drive indisponível ou não autorizado. Nada foi guardado." }); return; }

    const pasta = PASTA_POR_TIPO[input.documentType];
    const { subfolders } = await ensureClientFolderStructure(client.name, client.cpf, raiz);
    const pastaId = subfolders[pasta];
    if (!pastaId) { res.status(502).json({ error: `A pasta ${pasta} do cliente não foi localizada.` }); return; }

    // Nome único por tipo+id: o mesmo documento nunca duplica e documentos diferentes nunca se apagam.
    const sha = createHash("sha256").update(bytes).digest("hex");
    const nome = `${nomeSeguro(document.fileName || document.label)} [${input.documentType}-${input.documentId}].pdf`;
    const existente = (await driveListChildren(pastaId)).find((f) => !f.isFolder && f.name === nome);
    let estado: "guardado" | "ja_estava";
    let webViewLink = "";
    if (existente) {
      estado = "ja_estava";
    } else {
      const up = await uploadFileToDrive(pastaId, nome, "application/pdf", bytes, true);
      estado = "guardado";
      webViewLink = up.webViewLink;
    }
    await db.insert(collaboratorAuditTable).values({
      professionalId: identity.professional.id,
      professionalName: identity.professional.name,
      action: "clinical_document_archive_folder",
      method: "POST",
      path: "/clinical-documents/archive-folder",
      detail: {
        clientId: identity.client.id, empresaId: identity.clinic.empresaId, clinicId: identity.clinic.id,
        documentType: input.documentType, documentId: input.documentId, pasta, estado, pdfSha256: sha, traceId: req.id,
      },
    }).catch((err) => req.log.warn({ err: String(err) }, "Auditoria do arquivamento não registrada"));
    res.json({ estado, pasta, fileName: nome, ...(webViewLink ? { webViewLink } : {}) });
  } catch (error) {
    if (error instanceof ClinicalIdentityError) { res.status(error.status).json({ error: error.message }); return; }
    req.log.error({ err: String(error), documentType: input.documentType, documentId: input.documentId }, "Falha ao guardar documento na pasta do cliente");
    res.status(502).json({ error: "O Drive não confirmou o arquivamento. Confira a pasta do cliente antes de repetir." });
  }
});

export default router;
