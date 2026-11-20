/**
 * Pedido de exames pago/isento: documento pré-pronto, prévia sem certificado e
 * "assinar e enviar" num só clique do médico. O sistema NUNCA assina sozinho:
 * a assinatura só ocorre com o certificado do médico logado, após o clique dele.
 */
import { Router, type IRouter, type Request } from "express";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod/v4";
import { db, professionalsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { generateExamRequestPdf } from "../lib/exam-request-pdf";
import { ClinicalIdentityError, medicalRegistration, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { resolvePrescriptionSigner, signExistingClinicalPdf } from "../lib/prescription-signing";
import { ambienteDoCliente, enviarComunicacao } from "../lib/comunicacao-padrao";
import { brtDateStr, brtDisplayDate } from "../lib/brt";
import { getSetting, setSetting } from "../lib/secure-settings";
import { isPlatformOwner } from "../lib/clinical-access";
import { requireCollaborator } from "./collaborator";
import { loadAuthorized, type Row } from "./pedidos-medicos";

const router: IRouter = Router();

/** Itens do documento = linhas do rascunho salvo; sem rascunho, o texto que o cliente escreveu. */
export function itensDoTexto(texto: string | null | undefined): string[] {
  return String(texto ?? "")
    .split(/\r?\n/).map((l) => l.replace(/^[\s\-•*\d.)]+/, "").trim())
    .filter((l) => l.length > 0).slice(0, 100);
}

async function marcarPrevia(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const msg = "PRÉVIA — SEM CERTIFICADO DIGITAL — NÃO TEM VALIDADE";
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    page.drawRectangle({ x: 25, y: 4, width: width - 50, height: 20, color: rgb(1, 0.96, 0.96), borderColor: rgb(0.66, 0.08, 0.08), borderWidth: 0.8 });
    page.drawText(msg, { x: (width - font.widthOfTextAtSize(msg, 11)) / 2, y: 10, font, size: 11, color: rgb(0.66, 0.08, 0.08) });
  }
  return doc.save();
}

function absoluteBaseUrl(req: Request): string {
  const host = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() || process.env.REPLIT_DEV_DOMAIN || req.get("host") || "localhost";
  return `${host.includes("localhost") ? "http" : "https"}://${host}`;
}

async function carregar(req: Request, res: import("express").Response) {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return null;
  const full = (await db.execute(sql`SELECT * FROM client_medical_requests WHERE id = ${ctx.row.id}`)).rows[0] as unknown as Row;
  return { ...ctx, row: full };
}

// Prévia: mesmo motor do documento real, sem certificado e com faixa vermelha de prévia.
router.get("/pedidos-medicos/:id/previa", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await carregar(req, res);
  if (!ctx) return;
  const { row } = ctx;
  if (row.kind !== "pedido_exames") { res.status(422).json({ error: "A prévia automática existe só para pedido de exames." }); return; }
  const itens = itensDoTexto(row.draft_items ?? row.details);
  if (itens.length === 0) { res.status(422).json({ error: "Não há itens para a prévia." }); return; }
  const c = (await db.execute(sql`SELECT name, cpf FROM clients WHERE id = ${row.client_id}`)).rows[0] as { name: string; cpf: string | null };
  const [p] = await db.select({ name: professionalsTable.name, crm: professionalsTable.crm,
    registrationNumber: professionalsTable.registrationNumber, registrationCouncil: professionalsTable.registrationCouncil })
    .from(professionalsTable).where(eq(professionalsTable.id, ctx.actor)).limit(1);
  let crmTxt: string | null = null;
  try { const r = medicalRegistration(p); crmTxt = [r.crm, r.uf].filter(Boolean).join(" / "); } catch { crmTxt = null; }
  const bytes = await generateExamRequestPdf({
    tipo: "OUTROS", tipoLabel: "Pedido do cliente", clientName: c.name, clientCpf: c.cpf,
    professionalName: p?.name ?? null, professionalCrm: crmTxt,
    dateBR: brtDisplayDate(), observacao: null,
    items: itens.map((nomeExame) => ({ nomeExame })),
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="previa-pedido-${row.id}.pdf"`);
  res.send(Buffer.from(await marcarPrevia(bytes)));
});

const ItensBody = z.object({ itens: z.array(z.string().trim().min(1).max(300)).min(1).max(100) }).strict();
router.put("/pedidos-medicos/:id/itens", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await carregar(req, res);
  if (!ctx) return;
  const body = ItensBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Informe ao menos um item (até 100)." }); return; }
  const upd = await db.execute(sql`
    UPDATE client_medical_requests SET draft_items = ${body.data.itens.join("\n")}, updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status IN ('pago','em_analise') AND assigned_professional_id = ${ctx.actor} AND kind = 'pedido_exames'
 RETURNING id`);
  if (upd.rows.length === 0) { res.status(409).json({ error: "Só o médico com o pedido em aberto pode editar os itens." }); return; }
  res.json({ id: ctx.row.id, itens: body.data.itens });
});

async function enviarAoCliente(req: Request, requestId: number, clientId: number, token: string): Promise<{ status: string; error: string | null }> {
  try {
    const ambiente = await ambienteDoCliente(clientId);
    const r = await enviarComunicacao({
      ambiente, categoria: "documento", clienteId: clientId,
      documento: "Solicitação de exames", link: `${absoluteBaseUrl(req)}/api/exam-requests/file/${token}`,
    });
    const status = r.status === "aceito" ? "enviado" : "falha";
    const error = r.status === "aceito" ? null : (r.erro ?? "Envio recusado");
    await db.execute(sql`UPDATE client_medical_requests SET doc_send_status = ${status}, doc_send_error = ${error},
      doc_sent_at = ${status === "enviado" ? sql`NOW()` : null} WHERE id = ${requestId}`);
    return { status, error };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Falha no envio";
    await db.execute(sql`UPDATE client_medical_requests SET doc_send_status = 'falha', doc_send_error = ${error} WHERE id = ${requestId}`);
    return { status: "falha", error };
  }
}

// Um clique do médico: assina com o certificado dele, guarda o PDF e envia ao cliente.
router.post("/pedidos-medicos/:id/assinar-enviar", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await carregar(req, res);
  if (!ctx) return;
  const { row, actor } = ctx;
  if (row.kind !== "pedido_exames") { res.status(422).json({ error: "Receita ainda é emitida no Cockpit." }); return; }
  if (!["pago", "em_analise"].includes(row.status) || row.assigned_professional_id !== actor) {
    res.status(409).json({ error: "Só o médico com o pedido em aberto pode assinar e enviar." }); return;
  }
  const itens = itensDoTexto(row.draft_items ?? row.details);
  if (itens.length === 0) { res.status(422).json({ error: "Não há itens para assinar." }); return; }
  try {
    const identity = await resolveClinicalEmitter(req, row.client_id);
    if (identity.professional.id !== actor) throw new ClinicalIdentityError(403, "A assinatura exige o médico autenticado.");
    if (!identity.canPrescribe) throw new ClinicalIdentityError(422, identity.issue ?? "O médico autenticado não pode solicitar exames.");
    const signer = await resolvePrescriptionSigner(identity);
    const professional = { ...identity.professional, crm: [identity.professional.crm, identity.professional.uf].filter(Boolean).join(" / ") };
    let assinaturaImagem: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" } | undefined;
    const [rec] = await db.select({ u: professionalsTable.signatureUrl }).from(professionalsTable).where(eq(professionalsTable.id, actor)).limit(1);
    const sigPath = rec?.u?.replace(/^\/api\/storage/, "");
    if (sigPath) {
      if (!sigPath.startsWith("/objects/uploads/signatures/")) { res.status(422).json({ error: "O caminho da assinatura cadastrada não é válido." }); return; }
      const [bytes] = await (await new ObjectStorageService().getObjectEntityFile(sigPath)).download();
      if (!bytes.length || bytes.length > 2_000_000) { res.status(422).json({ error: "A imagem da assinatura cadastrada está vazia ou grande demais." }); return; }
      assinaturaImagem = { bytes, mime: sigPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" };
    }
    const unsigned = await generateExamRequestPdf({
      tipo: "OUTROS", tipoLabel: "Pedido do cliente", clientName: identity.client.name, clientCpf: identity.client.cpf,
      professionalName: professional.name, professionalCrm: professional.crm, dateBR: brtDisplayDate(),
      observacao: null, items: itens.map((nomeExame) => ({ nomeExame })), certificado: signer.meta, assinaturaImagem,
    });
    const signed = Buffer.from(await signExistingClinicalPdf(unsigned, signer, "Solicitacao de exames"));
    const safeName = identity.client.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
    const fileName = `${brtDateStr()} EXAMES PEDIDO ${row.id} ${safeName}.pdf`;
    const token = randomBytes(24).toString("hex");
    const saved = await db.transaction(async (tx) => {
      const claim = await tx.execute(sql`
        UPDATE client_medical_requests SET status = 'emitido', decided_by_professional_id = ${actor}, updated_at = NOW()
         WHERE id = ${row.id} AND status IN ('pago','em_analise') AND assigned_professional_id = ${actor} RETURNING id`);
      if (claim.rows.length === 0) return null;
      const ins = await tx.execute(sql`
        INSERT INTO exam_request_pdfs (client_id, professional_id, tipo, file_name, exam_count, observacao, pdf_data, token)
        VALUES (${row.client_id}, ${actor}, 'OUTROS', ${fileName}, ${itens.length}, ${`Pedido do cliente nº ${row.id}`}, ${signed.toString("base64")}, ${token})
        RETURNING id`);
      const pdfId = (ins.rows[0] as { id: number }).id;
      await tx.execute(sql`UPDATE client_medical_requests SET doc_pdf_id = ${pdfId}, issued_reference = ${`pdf:${pdfId}`}, doc_send_status = 'pendente' WHERE id = ${row.id}`);
      return pdfId;
    });
    if (saved === null) { res.status(409).json({ error: "O pedido já foi concluído por outro processo." }); return; }
    const envio = await enviarAoCliente(req, row.id, row.client_id, token);
    res.json({ id: row.id, status: "emitido", docToken: token, envio });
  } catch (e) {
    if (e instanceof ClinicalIdentityError) { res.status(e.status).json({ error: e.message }); return; }
    req.log.error({ err: String(e) }, "Erro ao assinar e enviar pedido de exames");
    res.status(500).json({ error: "Não foi possível assinar e enviar agora. Nada foi enviado ao cliente." });
  }
});

// Reenvio só quando o último envio FALHOU de forma conhecida; nunca duplica um envio aceito.
router.post("/pedidos-medicos/:id/reenviar", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await carregar(req, res);
  if (!ctx) return;
  const { row, actor } = ctx;
  if (row.status !== "emitido" || !row.doc_pdf_id || row.doc_send_status !== "falha" || row.decided_by_professional_id !== actor) {
    res.status(409).json({ error: "Só é possível reenviar quando o envio anterior falhou." }); return;
  }
  const d = (await db.execute(sql`SELECT token FROM exam_request_pdfs WHERE id = ${row.doc_pdf_id}`)).rows[0] as { token: string } | undefined;
  if (!d) { res.status(404).json({ error: "Documento não encontrado." }); return; }
  res.json({ id: row.id, envio: await enviarAoCliente(req, row.id, row.client_id, d.token) });
});

// Corrige marca falsa: "emitido" sem documento real volta para a fila (registro no próprio pedido).
router.post("/pedidos-medicos/:id/reabrir", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await carregar(req, res);
  if (!ctx) return;
  const { row, actor } = ctx;
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'pago', decision_note = ${`Reaberto em ${brtDisplayDate()}: estava marcado como emitido sem documento.`}, updated_at = NOW()
     WHERE id = ${row.id} AND status = 'emitido' AND doc_pdf_id IS NULL AND kind = 'pedido_exames'
       AND (assigned_professional_id = ${actor} OR decided_by_professional_id = ${actor})
 RETURNING id`);
  if (upd.rows.length === 0) { res.status(409).json({ error: "Só reabre pedido de exames marcado como emitido sem documento." }); return; }
  res.json({ id: row.id, status: "pago" });
});

// Chave da validação médica: ligada = todo pedido espera o médico (padrão seguro).
// Desligada = só registra a preferência; liberação automática NÃO existe (assinatura é sempre humana).
const CHAVE_VALIDACAO = "pedidoMedico.validacaoAtiva";
router.get("/pedidos-medicos/validacao-medica", requireCollaborator, async (_req, res): Promise<void> => {
  res.json({ ativa: (await getSetting(CHAVE_VALIDACAO)) !== "false" });
});
router.put("/pedidos-medicos/validacao-medica", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.collaborator?.professionalId);
  if (!Number.isSafeInteger(id) || !(await isPlatformOwner(id))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  const b = z.object({ ativa: z.boolean() }).strict().safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Informe ativa verdadeiro ou falso." }); return; }
  await setSetting(CHAVE_VALIDACAO, b.data.ativa ? "true" : "false");
  res.json({ ativa: b.data.ativa });
});

export default router;
