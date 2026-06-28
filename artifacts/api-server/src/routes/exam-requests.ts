import { Router, type IRouter, type Request } from "express";
import { randomBytes } from "node:crypto";
import { db, examRequestPdfsTable, clientsTable, professionalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { generateExamRequestPdf, type ExamRequestItem } from "../lib/exam-request-pdf";
import { enviarMensagemPaxter, type PaxterDoc } from "../lib/messaging/index.js";

const router: IRouter = Router();

// ---- Prescritor de Exames ----
// Exames de IMAGEM saem em 1 PDF por exame (cada imagem separada, para o
// paciente levar a clinicas de imagem diferentes). Exames de SANGUE e OUTROS
// continuam agrupados (1 PDF por tipo). Opcionalmente envia por e-mail
// (anexos) e WhatsApp (links) ao paciente.

const TIPO_LABEL: Record<string, string> = {
  SANGUE: "Sangue / Laboratorial",
  IMAGEM: "Imagem",
  OUTROS: "Outros / Procedimentos",
};

function dateStamp(d: Date): { br: string; file: string } {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const yy = String(yyyy).slice(-2);
  return { br: `${dd}/${mm}/${yyyy}`, file: `${yy}.${mm}.${dd}` };
}

function removeDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function absoluteBaseUrl(req: Request): string {
  const fromDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const host = fromDomains || process.env.REPLIT_DEV_DOMAIN || req.get("host") || "localhost";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

const ItemSchema = z.object({
  nomeExame: z.string().min(1),
  codigoExame: z.string().optional().nullable(),
  grupoPrincipal: z.string().optional().nullable(),
  preparo: z.string().optional().nullable(),
  tipo: z.enum(["SANGUE", "IMAGEM", "OUTROS"]),
});

const EmitSchema = z.object({
  clientId: z.number().int().positive(),
  professionalId: z.number().int().positive().optional().nullable(),
  observacao: z.string().optional().nullable(),
  sendEmail: z.boolean().optional().default(false),
  sendWhatsapp: z.boolean().optional().default(false),
  items: z.array(ItemSchema).min(1),
});

router.post("/exam-requests/emit", async (req, res): Promise<void> => {
  const parsed = EmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, body.clientId));
  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  let professional: typeof professionalsTable.$inferSelect | undefined;
  if (body.professionalId) {
    [professional] = await db
      .select()
      .from(professionalsTable)
      .where(eq(professionalsTable.id, body.professionalId));
    if (!professional) {
      res.status(404).json({ error: "Médico solicitante não encontrado" });
      return;
    }
  }

  // Montar os "trabalhos" de PDF.
  // ONDA 0 (bug critico): exames de IMAGEM saem 1 PDF por exame (cada imagem
  // separada); SANGUE e OUTROS continuam agrupados (1 PDF por tipo).
  const jobs: Array<{ tipo: string; items: ExamRequestItem[] }> = [];
  const grouped = new Map<string, ExamRequestItem[]>();
  for (const it of body.items) {
    const item: ExamRequestItem = {
      nomeExame: it.nomeExame,
      codigoExame: it.codigoExame ?? null,
      grupoPrincipal: it.grupoPrincipal ?? null,
      preparo: it.preparo ?? null,
    };
    if (it.tipo === "IMAGEM") {
      jobs.push({ tipo: "IMAGEM", items: [item] });
    } else {
      const arr = grouped.get(it.tipo) ?? [];
      arr.push(item);
      grouped.set(it.tipo, arr);
    }
  }
  for (const [tipo, items] of grouped) {
    jobs.push({ tipo, items });
  }

  const now = new Date();
  const stamp = dateStamp(now);
  const safeName = removeDiacritics(client.name).toUpperCase().replace(/\s+/g, " ").trim();

  const created: Array<{
    id: number;
    tipo: string;
    tipoLabel: string;
    fileName: string;
    examCount: number;
    url: string;
  }> = [];

  const baseUrl = absoluteBaseUrl(req);
  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];

  for (const { tipo, items } of jobs) {
    const tipoLabel = TIPO_LABEL[tipo] ?? tipo;
    const pdfBytes = await generateExamRequestPdf({
      tipo,
      tipoLabel,
      clientName: client.name,
      clientCpf: client.cpf,
      professionalName: professional?.name ?? null,
      professionalCrm: professional?.crm ?? null,
      dateBR: stamp.br,
      observacao: body.observacao ?? null,
      items,
    });
    const pdfBuffer = Buffer.from(pdfBytes);
    // IMAGEM unica leva o NOME do exame no arquivo (1 PDF por exame); tipos
    // agrupados mantem o rotulo do tipo.
    const isSingleImaging = tipo === "IMAGEM" && items.length === 1;
    const fileLabel = isSingleImaging
      ? `EXAME ${removeDiacritics(items[0].nomeExame).toUpperCase()}`
      : `EXAMES ${tipo}`;
    const fileName = `${stamp.file} ${fileLabel} ${safeName}.pdf`.replace(/\s+/g, " ");
    const token = randomBytes(24).toString("hex");

    const [row] = await db
      .insert(examRequestPdfsTable)
      .values({
        token,
        clientId: client.id,
        professionalId: professional?.id ?? null,
        tipo,
        fileName,
        examCount: items.length,
        observacao: body.observacao ?? null,
        pdfData: pdfBuffer.toString("base64"),
      })
      .returning({ id: examRequestPdfsTable.id });

    created.push({
      id: row.id,
      tipo,
      tipoLabel,
      fileName,
      examCount: items.length,
      url: `${baseUrl}/api/exam-requests/file/${token}`,
    });
    attachments.push({ filename: fileName, content: pdfBuffer, contentType: "application/pdf" });
  }

  // Envio ao cliente via Motor Único de Envio Branded (Hermes Paxter):
  // o MESMO conteúdo veste a marca em e-mail (com PDFs anexados) e WhatsApp
  // (banner + legenda com os links). Status honesto por canal.
  const docExame: PaxterDoc = {
    eyebrow: `Olá, ${client.name}`,
    titulo: "Solicitação de Exames",
    paragrafos: [
      "Segue a sua solicitação de exames. Cada arquivo agrupa um tipo de exame:",
      ...created.map((c) => `• ${c.tipoLabel} (${c.examCount}): ${c.url}`),
      "Apresente os arquivos no laboratório ou clínica de imagem. Em caso de dúvida, fale conosco.",
    ],
    anexos: attachments,
    assunto: `Instituto Padua | Solicitação de Exames | ${stamp.br}`,
  };

  // Envio por e-mail (um e-mail com todos os PDFs anexados)
  let email: { attempted: boolean; success: boolean; error?: string } = { attempted: false, success: false };
  if (body.sendEmail) {
    email.attempted = true;
    if (!client.email) {
      email.error = "Cliente sem e-mail cadastrado";
    } else {
      const envio = await enviarMensagemPaxter(docExame, { email: client.email, nome: client.name }, ["EMAIL"], { baseUrl });
      const r0 = envio.resultados[0];
      email.success = r0?.sent ?? false;
      if (!email.success) email.error = r0?.error ?? "Falha no envio";
    }
  }

  // Envio por WhatsApp (banner PAXTER + legenda com links para cada PDF)
  let whatsapp: { attempted: boolean; success: boolean; error?: string } = { attempted: false, success: false };
  if (body.sendWhatsapp) {
    whatsapp.attempted = true;
    if (!client.phone) {
      whatsapp.error = "Cliente sem telefone cadastrado";
    } else {
      const envio = await enviarMensagemPaxter(docExame, { telefone: client.phone, nome: client.name }, ["WHATSAPP"], { baseUrl });
      const r0 = envio.resultados[0];
      whatsapp.success = r0?.sent ?? false;
      if (!whatsapp.success) whatsapp.error = r0?.error ?? "Falha no envio";
    }
  }

  res.json({ pdfs: created, email, whatsapp });
});

// Servido por token aleatorio (nao por id sequencial) para evitar enumeracao
// de documentos clinicos de outros pacientes (IDOR).
router.get("/exam-requests/file/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token ?? "");
  if (!/^[a-f0-9]{48}$/.test(token)) {
    res.status(400).json({ error: "token inválido" });
    return;
  }
  const [row] = await db
    .select()
    .from(examRequestPdfsTable)
    .where(eq(examRequestPdfsTable.token, token));
  if (!row || !row.pdfData) {
    res.status(404).json({ error: "PDF não encontrado" });
    return;
  }
  const buf = Buffer.from(row.pdfData, "base64");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${row.fileName}"`);
  res.send(buf);
});

export default router;
