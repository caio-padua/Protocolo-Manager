import { Router, type IRouter } from "express";
import { requireCollaborator } from "./collaborator";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  db,
  sessionsTable,
  clientsTable,
  substancesTable,
  substanceApplicationsTable,
  validationCodesTable,
  rasTable,
  locationsTable,
  emailLogTable,
  protocolsTable,
} from "@workspace/db";
import {
  sendPreSessionEmail,
  sendPostSessionEmail,
  isEmailConfigured,
  sendTelegramOnboardingEmail,
  type PreSessionEmailData,
  type PostSessionEmailData,
} from "../lib/email-service";
import { getGmailAddress } from "../lib/google-gmail";
import { emitirLinkMagico } from "../lib/telegram-magic-link";

const router: IRouter = Router();

// ── helpers ────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function procedureTypeLabel(type: string): string {
  switch (type) {
    case "iv": return "Aplicacao Endovenosa";
    case "im": return "Aplicacao Intramuscular";
    case "implant": return "Implante";
    default: return "Procedimento";
  }
}

/** Mascara e-mail: primeiros 3 chars + ***@domínio. Ex.: abc@gmail.com → abc***@gmail.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const prefix = local.substring(0, Math.min(3, local.length));
  return `${prefix}***@${domain}`;
}

/** Grava linha no log de e-mail sem lançar erro (fire-and-forget seguro). */
async function logEmail(opts: {
  tipo: string;
  clienteNome: string;
  destinatario: string;
  assunto: string;
  status: "enviado" | "falhou";
  erro?: string;
  sessionId?: number;
}): Promise<void> {
  try {
    await db.insert(emailLogTable).values({
      tipo: opts.tipo,
      clienteNome: opts.clienteNome,
      destinatario: opts.destinatario,
      assunto: opts.assunto,
      status: opts.status,
      erro: opts.erro ?? null,
      sessionId: opts.sessionId ?? null,
      provider: "gmail",
    });
  } catch (e) {
    // log não pode derrubar o fluxo principal
  }
}

// ── rotas ──────────────────────────────────────────────────────────────────

router.get("/email/status", async (_req, res): Promise<void> => {
  const configured = await isEmailConfigured();
  let fromAddress: string | null = null;
  if (configured) {
    fromAddress = await getGmailAddress();
  }
  res.json({ configured, fromAddress, gmail: configured });
});

// ── GET /email/log — histórico de envios com filtros ──────────────────────
router.get("/email/log", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
  const tipo = String(req.query.tipo ?? "");
  const status = String(req.query.status ?? "");
  const periodo = String(req.query.periodo ?? ""); // hoje | 7d | 30d | tudo

  let rows = await db.select().from(emailLogTable).orderBy(desc(emailLogTable.criadoEm)).limit(limit);

  // filtro por tipo
  if (tipo && tipo !== "todos") {
    rows = rows.filter(r => r.tipo === tipo);
  }
  // filtro por status
  if (status && status !== "todos") {
    rows = rows.filter(r => r.status === status);
  }
  // filtro por período
  if (periodo && periodo !== "tudo") {
    const now = new Date();
    let cutoff: Date;
    if (periodo === "hoje") {
      cutoff = new Date(now.toISOString().split("T")[0] + "T00:00:00.000Z");
    } else if (periodo === "7d") {
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    rows = rows.filter(r => new Date(r.criadoEm) >= cutoff);
  }

  // máscara do destinatário na resposta
  const masked = rows.map(r => ({
    ...r,
    destinatario: maskEmail(r.destinatario),
  }));

  res.json({ total: masked.length, items: masked });
});

// ── GET /email/stats — KPIs resumidos ─────────────────────────────────────
router.get("/email/stats", async (_req, res): Promise<void> => {
  const all = await db.select().from(emailLogTable);
  const hoje = new Date().toISOString().split("T")[0];
  res.json({
    total: all.length,
    enviados: all.filter(r => r.status === "enviado").length,
    falhas: all.filter(r => r.status === "falhou").length,
    hoje: all.filter(r => r.criadoEm.toISOString().startsWith(hoje)).length,
  });
});

// ── POST /email/send-pre-session/:sessionId ───────────────────────────────
router.post("/email/send-pre-session/:sessionId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  if (!(await isEmailConfigured())) {
    res.status(503).json({ error: "Gmail not connected via Replit integration." });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  if (!client || !client.email) {
    res.status(400).json({ error: "Client has no email address" });
    return;
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, sessionId));
  const dispApps = applications.filter(a => a.availability === "disp");
  if (dispApps.length === 0) {
    res.status(400).json({ error: "No substances scheduled for this session" });
    return;
  }

  const code = generateCode();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await db.insert(validationCodesTable).values({
    sessionId,
    clientId: session.clientId,
    code,
    expiresAt,
  });

  const isFirstSession = dispApps.every(a => a.sessionNumber <= 1);

  const substances: PreSessionEmailData["substances"] = [];
  for (const app of dispApps) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (substance) {
      substances.push({
        name: substance.name,
        dose: app.dose,
        color: substance.color,
        procedureType: substance.procedureType ?? "iv",
        sessionNumber: app.sessionNumber,
        totalSessions: app.totalSessions,
      });
    }
  }

  let locationAddress: string | undefined;
  if (session.unit) {
    const locs = await db.select().from(locationsTable);
    const loc = locs.find(l => l.name.toLowerCase().includes(session.unit!.toLowerCase()) || session.unit!.toLowerCase().includes(l.name.toLowerCase()));
    if (loc?.address) locationAddress = loc.address;
  }

  const primaryProcType = substances[0]?.procedureType ?? "iv";
  const assunto = `PAXTER | ${procedureTypeLabel(primaryProcType)} | ${code}`;

  const result = await sendPreSessionEmail({
    clientEmail: client.email,
    clientName: client.name,
    validationCode: code,
    scheduledDate: session.scheduledDate,
    scheduledTime: session.scheduledTime,
    procedureLabel: procedureTypeLabel(primaryProcType),
    substances,
    unit: session.unit ?? "Instituto Pádua",
    locationAddress,
    isFirstSession,
    sessionId: session.id,
    weekNumber: session.weekNumber,
    sessionStatus: session.status,
  });

  await logEmail({
    tipo: "pre_sessao",
    clienteNome: client.name,
    destinatario: client.email,
    assunto,
    status: result.success ? "enviado" : "falhou",
    erro: result.error,
    sessionId,
  });

  if (result.success) {
    res.json({ success: true, code, message: "Pre-session email sent" });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// ── POST /email/resend-ics/:sessionId ────────────────────────────────────
router.post("/email/resend-ics/:sessionId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  if (!(await isEmailConfigured())) {
    res.status(503).json({ error: "Gmail not connected via Replit integration." });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  if (!client || !client.email) {
    res.status(400).json({ error: "Client has no email address" });
    return;
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, sessionId));
  const dispApps = applications.filter(a => a.availability === "disp");
  if (dispApps.length === 0) {
    res.status(400).json({ error: "No substances scheduled for this session" });
    return;
  }

  const now = new Date();
  const existingCodes = await db.select().from(validationCodesTable)
    .where(and(
      eq(validationCodesTable.sessionId, sessionId),
      gte(validationCodesTable.expiresAt, now),
    ));
  existingCodes.sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());

  let code = existingCodes[0]?.code;
  let reusedCode = true;
  if (!code) {
    code = generateCode();
    reusedCode = false;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    await db.insert(validationCodesTable).values({
      sessionId,
      clientId: session.clientId,
      code,
      expiresAt,
    });
  }

  const isFirstSession = dispApps.every(a => a.sessionNumber <= 1);

  const substances: PreSessionEmailData["substances"] = [];
  for (const app of dispApps) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (substance) {
      substances.push({
        name: substance.name,
        dose: app.dose,
        color: substance.color,
        procedureType: substance.procedureType ?? "iv",
        sessionNumber: app.sessionNumber,
        totalSessions: app.totalSessions,
      });
    }
  }

  let locationAddress: string | undefined;
  if (session.unit) {
    const locations = await db.select().from(locationsTable);
    const loc = locations.find(l => l.name.toLowerCase().includes(session.unit!.toLowerCase()) || session.unit!.toLowerCase().includes(l.name.toLowerCase()));
    if (loc?.address) locationAddress = loc.address;
  }

  const primaryProcType = substances[0]?.procedureType ?? "iv";
  const assunto = `PAXTER | ICS Reenviado | ${procedureTypeLabel(primaryProcType)}`;

  const result = await sendPreSessionEmail({
    clientName: client.name,
    clientEmail: client.email,
    validationCode: code,
    scheduledDate: session.scheduledDate,
    scheduledTime: session.scheduledTime,
    procedureLabel: procedureTypeLabel(primaryProcType),
    substances,
    unit: session.unit ?? "Instituto Pádua",
    locationAddress,
    isFirstSession,
    sessionId: session.id,
    weekNumber: session.weekNumber,
    sessionStatus: session.status,
  });

  await logEmail({
    tipo: "ics_reenviado",
    clienteNome: client.name,
    destinatario: client.email,
    assunto,
    status: result.success ? "enviado" : "falhou",
    erro: result.error,
    sessionId,
  });

  if (result.success) {
    res.json({ success: true, code, reusedCode, message: "Convite .ics reenviado" });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// ── POST /email/send-post-session/:sessionId ─────────────────────────────
router.post("/email/send-post-session/:sessionId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  if (!(await isEmailConfigured())) {
    res.status(503).json({ error: "Gmail not connected via Replit integration." });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  if (!client || !client.email) {
    res.status(400).json({ error: "Client has no email address" });
    return;
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, sessionId));

  const substances: PostSessionEmailData["substances"] = [];
  for (const app of applications) {
    if (app.availability !== "disp") continue;
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (substance) {
      substances.push({
        name: substance.name,
        dose: app.dose,
        color: substance.color,
        status: app.status,
      });
    }
  }

  let rasPdfBuffer: Buffer | undefined;
  let rasId: number | undefined;

  try {
    const [ras] = await db.select().from(rasTable).where(eq(rasTable.sessionId, sessionId));
    if (ras) {
      rasId = ras.id;
      const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`;
      const pdfResp = await fetch(`${baseUrl}/api/ras/${ras.id}/pdf`);
      if (pdfResp.ok) {
        const arrayBuf = await pdfResp.arrayBuffer();
        rasPdfBuffer = Buffer.from(arrayBuf);
      }
    }
  } catch (e) {
    // RAS PDF opcional — não bloqueia o e-mail
  }

  const assunto = `PAXTER | Sessão Concluída | ${session.scheduledDate}`;

  const result = await sendPostSessionEmail({
    clientName: client.name,
    clientEmail: client.email,
    scheduledDate: session.scheduledDate,
    substances,
    rasPdfBuffer,
    rasId,
  });

  await logEmail({
    tipo: "pos_sessao",
    clienteNome: client.name,
    destinatario: client.email,
    assunto,
    status: result.success ? "enviado" : "falhou",
    erro: result.error,
    sessionId,
  });

  if (result.success) {
    res.json({ success: true, message: "Post-session email sent" });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// ── POST /email/send-weekly-reminders ─────────────────────────────────────
router.post("/email/send-weekly-reminders", async (_req, res): Promise<void> => {
  if (!(await isEmailConfigured())) {
    res.status(503).json({ error: "Gmail not connected" });
    return;
  }

  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const todayStr = today.toISOString().split("T")[0];
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const sessions = await db.select().from(sessionsTable);
  const upcomingSessions = sessions.filter(
    s => s.scheduledDate >= todayStr && s.scheduledDate <= weekEndStr && s.status === "scheduled"
  );

  const results: Array<{ sessionId: number; clientName: string; success: boolean; error?: string }> = [];

  for (const session of upcomingSessions) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
    if (!client?.email) {
      results.push({ sessionId: session.id, clientName: client?.name ?? "", success: false, error: "No email" });
      continue;
    }

    const applications = await db.select().from(substanceApplicationsTable)
      .where(eq(substanceApplicationsTable.sessionId, session.id));
    const dispApps = applications.filter(a => a.availability === "disp");

    if (dispApps.length === 0) continue;

    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.insert(validationCodesTable).values({
      sessionId: session.id,
      clientId: session.clientId,
      code,
      expiresAt,
    });

    const isFirstSession = dispApps.every(a => a.sessionNumber <= 1);

    const substances: PreSessionEmailData["substances"] = [];
    for (const app of dispApps) {
      const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (substance) {
        substances.push({
          name: substance.name,
          dose: app.dose,
          color: substance.color,
          procedureType: substance.procedureType ?? "iv",
          sessionNumber: app.sessionNumber,
          totalSessions: app.totalSessions,
          description: substance.description ?? undefined,
          mainFunction: substance.mainFunction ?? undefined,
          perceivedEffects: substance.perceivedEffects ?? undefined,
          timeToEffect: substance.timeToEffect ?? undefined,
          longevityBenefit: substance.longevityBenefit ?? undefined,
          sleepBenefit: substance.sleepBenefit ?? undefined,
          energyBenefit: substance.energyBenefit ?? undefined,
          physicalPerformance: substance.physicalPerformance ?? undefined,
          skinHairNails: substance.skinHairNails ?? undefined,
          categoryType: substance.categoryType ?? undefined,
          starRating: substance.starRating ?? undefined,
          bodySystemEffects: (substance.bodySystemEffects as Record<string, number>) ?? undefined,
        });
      }
    }

    let locationAddress: string | undefined;
    if (session.unit) {
      const allLocations = await db.select().from(locationsTable);
      const loc = allLocations.find(l => l.name.toLowerCase().includes(session.unit!.toLowerCase()) || session.unit!.toLowerCase().includes(l.name.toLowerCase()));
      if (loc?.address) locationAddress = loc.address;
    }

    const primaryProcType = substances[0]?.procedureType ?? "iv";
    const assunto = `PAXTER | Lembrete Semanal | ${procedureTypeLabel(primaryProcType)} | ${code}`;

    const emailResult = await sendPreSessionEmail({
      clientName: client.name,
      clientEmail: client.email,
      validationCode: code,
      scheduledDate: session.scheduledDate,
      scheduledTime: session.scheduledTime,
      procedureLabel: procedureTypeLabel(primaryProcType),
      substances,
      unit: session.unit ?? "Instituto Pádua",
      locationAddress,
      isFirstSession,
      sessionId: session.id,
      weekNumber: session.weekNumber,
      sessionStatus: session.status,
    });

    await logEmail({
      tipo: "lembrete_semanal",
      clienteNome: client.name,
      destinatario: client.email,
      assunto,
      status: emailResult.success ? "enviado" : "falhou",
      erro: emailResult.error,
      sessionId: session.id,
    });

    results.push({
      sessionId: session.id,
      clientName: client.name,
      success: emailResult.success,
      error: emailResult.error,
    });
  }

  res.json({
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results,
  });
});

// POST /api/email/send-copy — envia PDF de protocolo para qualquer e-mail (cópia para médico/admin)
router.post("/email/send-copy", async (req, res): Promise<void> => {
  const { to, protocolId } = req.body as { to?: string; protocolId?: number };
  if (!to || !protocolId) {
    res.status(400).json({ error: "Campos obrigatórios: to, protocolId" });
    return;
  }
  try {
    const { sendGmailMessage, isGmailConnected } = await import("../lib/google-gmail");
    const gmailOk = await isGmailConnected();
    if (!gmailOk) { res.status(503).json({ error: "Gmail não conectado" }); return; }

    const [protocol] = await db
      .select({ id: protocolsTable.id, title: protocolsTable.title })
      .from(protocolsTable)
      .where(eq(protocolsTable.id, protocolId))
      .limit(1);
    if (!protocol) { res.status(404).json({ error: "Protocolo não encontrado" }); return; }

    // Gera o PDF via fetch interno
    const pdfRes = await fetch(`http://localhost:${process.env.PORT ?? 8080}/api/protocols/${protocolId}/document-pdf`);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());

    const hoje = new Date().toLocaleDateString("pt-BR");
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#3D7A7A;">PAXTER — Cópia do Protocolo</h2>
        <p>Segue em anexo o documento jurídico completo do protocolo:</p>
        <p><strong>${protocol.title}</strong></p>
        <p>Gerado em ${hoje} pelo sistema PAXTER Clinical Intelligence.</p>
        <hr/>
        <p style="font-size:12px;color:#666;">Este é um envio automático — cópia para o médico/administrador.</p>
      </div>`;

    const filename = `${hoje.replace(/\//g,"-")} COPIA PROTOCOLO ${protocol.title.substring(0,40)}.pdf`;
    const result = await sendGmailMessage({
      to,
      subject: `PAXTER | Cópia Protocolo | ${protocol.title.substring(0,50)}`,
      html,
      attachments: [{ filename, content: pdfBuf, contentType: "application/pdf" }],
    });

    res.json({ ok: result.success, to, messageId: result.messageId, error: result.error });
  } catch (err) {
    res.status(500).json({ error: "erro_send_copy", detalhe: String(err) });
  }
});

// ── POST /api/email/telegram-onboarding/:clientId ─────────────────────────
// Envia e-mail PADAXOR (navy/gold) ensinando o paciente a ativar o Telegram
// com @Paduaclinica_bot. Requer colaborador autenticado.
router.post("/email/telegram-onboarding/:clientId", requireCollaborator, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) { res.status(400).json({ error: "clientId inválido" }); return; }

  const [client] = await db
    .select({
      name: clientsTable.name,
      email: clientsTable.email,
      validationPassword: clientsTable.validationPassword,
      telegramChatId: clientsTable.telegramChatId,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  // Já vinculado: não emitir link novo. Um link válido na caixa de e-mail de um
  // paciente ativo é uma chave sobrando — a troca de aparelho passa pela equipe.
  if (client.telegramChatId) {
    res.status(409).json({ error: "Telegram já vinculado", chatId: client.telegramChatId });
    return;
  }
  if (!client.email) { res.status(422).json({ error: "Cliente sem e-mail cadastrado" }); return; }
  if (!client.validationPassword) { res.status(422).json({ error: "Cliente sem senha de validação — gere primeiro em Cadastro" }); return; }

  try {
    // Emite o link mágico (uso único, com validade) que vai no botão do e-mail.
    // Se falhar, o e-mail ainda sai com o caminho manual da senha.
    const linkMagico = await emitirLinkMagico(clientId);
    const result = await sendTelegramOnboardingEmail({
      clientName: client.name,
      clientEmail: client.email,
      validationPassword: client.validationPassword,
      magicLink: linkMagico?.url,
    });
    if (result.success) {
      res.json({ ok: true, message: `E-mail de onboarding Telegram enviado para ${client.email}` });
    } else {
      res.status(500).json({ error: result.error ?? "Falha no envio" });
    }
  } catch (err) {
    res.status(500).json({ error: "erro_telegram_onboarding", detalhe: String(err) });
  }
});

export default router;
