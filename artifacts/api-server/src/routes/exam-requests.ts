import { Router, type IRouter, type Request } from "express";
import { randomBytes } from "node:crypto";
import { db, examRequestPdfsTable, clientsTable, professionalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { generateExamRequestPdf, type ExamRequestItem } from "../lib/exam-request-pdf";
import { sendGmailMessage, isGmailConnected } from "../lib/google-gmail";
import { sendWhatsapp, isWhatsappConfigured } from "../lib/whatsapp";

const router: IRouter = Router();

// ---- Prescritor de Exames (ONDA B) ----
// Gera 1 PDF por TIPO (SANGUE / IMAGEM / OUTROS): exames de tipos diferentes
// nunca se misturam. Opcionalmente envia por e-mail (anexos) e WhatsApp (links)
// ao paciente.

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

  // Agrupar por tipo
  const groups = new Map<string, ExamRequestItem[]>();
  for (const it of body.items) {
    const tipo = it.tipo;
    const arr = groups.get(tipo) ?? [];
    arr.push({
      nomeExame: it.nomeExame,
      codigoExame: it.codigoExame ?? null,
      grupoPrincipal: it.grupoPrincipal ?? null,
      preparo: it.preparo ?? null,
    });
    groups.set(tipo, arr);
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

  for (const [tipo, items] of groups) {
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
    const fileName = `${stamp.file} EXAMES ${tipo} ${safeName}.pdf`.replace(/\s+/g, " ");
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

  // Envio por e-mail (um e-mail com todos os PDFs anexados)
  let email: { attempted: boolean; success: boolean; error?: string } = { attempted: false, success: false };
  if (body.sendEmail) {
    email.attempted = true;
    if (!client.email) {
      email.error = "Cliente sem e-mail cadastrado";
    } else if (!(await isGmailConnected())) {
      email.error = "Gmail não conectado";
    } else {
      const listHtml = created
        .map((c) => `<li style="padding:4px 0;color:#334155;font-size:14px;"><strong>${c.tipoLabel}</strong> — ${c.examCount} exame(s)</li>`)
        .join("");
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f1f5f9;padding:20px;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#3D7A7A;padding:18px 24px;"><span style="color:#fff;font-size:18px;font-weight:bold;">INSTITUTO PADUA</span></div>
          <div style="padding:24px;">
            <p style="color:#1e293b;font-size:15px;">Olá, ${client.name}.</p>
            <p style="color:#334155;font-size:14px;">Segue em anexo a sua solicitação de exames. Cada arquivo agrupa um tipo de exame:</p>
            <ul style="margin:8px 0 16px;padding-left:18px;">${listHtml}</ul>
            <p style="color:#64748b;font-size:12px;">Apresente os arquivos no laboratório/clínica de imagem. Em caso de dúvida, entre em contato conosco.</p>
          </div>
        </div></body></html>`;
      const r = await sendGmailMessage({
        to: client.email,
        subject: `Instituto Padua | Solicitação de Exames | ${stamp.br}`,
        html,
        attachments,
      });
      email.success = r.success;
      if (!r.success) email.error = r.error;
    }
  }

  // Envio por WhatsApp (mensagem com links para cada PDF)
  let whatsapp: { attempted: boolean; success: boolean; error?: string } = { attempted: false, success: false };
  if (body.sendWhatsapp) {
    whatsapp.attempted = true;
    if (!client.phone) {
      whatsapp.error = "Cliente sem telefone cadastrado";
    } else if (!isWhatsappConfigured()) {
      whatsapp.error = "WhatsApp não configurado";
    } else {
      const lines = [
        `Olá, ${client.name}!`,
        "",
        "Segue sua *solicitação de exames* do Instituto Padua:",
        ...created.map((c) => `• ${c.tipoLabel} (${c.examCount}): ${c.url}`),
        "",
        "Apresente os arquivos no laboratório/clínica de imagem.",
      ];
      const r = await sendWhatsapp(client.phone, lines.join("\n"));
      whatsapp.success = r.success;
      if (!r.success) whatsapp.error = r.error;
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
