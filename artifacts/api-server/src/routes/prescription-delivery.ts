import { Router, type Request } from "express";
import { db, prescriptionsTable, prescriptionItemsTable, recipesTable, pharmaciesTable,
  clientsTable, dispatchLogTable, lembreteEnviosTable, whatsappMensagensLogTable } from "@workspace/db";
import { and, eq, desc, sql, gte, inArray } from "drizzle-orm";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { resolvePrescriptionClient } from "../lib/prescription-client";
import { emitirReceituarioPdf } from "../lib/receituario-motor";
import { sendWhatsapp } from "../lib/whatsapp";
import { sendTelegram } from "../lib/telegram";
import { sendGmailMessage } from "../lib/google-gmail";
import { prescriptionReminderMessage } from "../lib/prescription-reminder-message";
import { auditedDelivery, confirmedTarget, type DeliveryTarget } from "../lib/clinical-delivery";

// Explicit staff/location relation replaces the legacy single-tenant context.
export function authorizedPrescriptionFilter(professionalId: number) {
  return sql`EXISTS (
    SELECT 1 FROM clients c
    JOIN locations l ON l.id = c.location_id AND l.empresa_id = c.empresa_id
    JOIN location_professionals lp ON lp.location_id = l.id
    JOIN professionals p ON p.id = lp.professional_id
    WHERE c.id = ${prescriptionsTable.clientId}
      AND c.empresa_id = ${prescriptionsTable.empresaId}
      AND c.status = 'active' AND l.active = 'true'
      AND p.active = true AND p.professional_type = 'medico'
      AND lp.professional_id = ${professionalId})`;
}

export async function authorizedPrescription(req: Request, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ClinicalIdentityError(400, "Prescrição inválida.");
  const [pres] = await db.select().from(prescriptionsTable).where(and(
    eq(prescriptionsTable.id, id), authorizedPrescriptionFilter(req.collaborator!.professionalId),
  )).limit(1);
  if (!pres) throw new ClinicalIdentityError(404, "Prescrição não encontrada ou sem vínculo autorizado.");
  const identity = await resolveClinicalEmitter(req, pres.clientId);
  if (pres.empresaId !== identity.clinic.empresaId ||
    await resolvePrescriptionClient(pres, identity.clinic.empresaId) !== identity.client.id) {
    throw new ClinicalIdentityError(403, "O vínculo e os contatos da prescrição precisam ser conferidos com o cadastro.");
  }
  return { pres, identity };
}

async function deliveryContext(req: Request) {
  const { pres, identity } = await authorizedPrescription(req, Number(req.params.id));
  if (pres.status !== "emitted") throw new ClinicalIdentityError(422, "Somente prescrições emitidas podem ser enviadas.");
  const [client] = await db.select().from(clientsTable).where(and(
    eq(clientsTable.id, identity.client.id), eq(clientsTable.empresaId, identity.clinic.empresaId),
  ));
  const recipes = await db.select().from(recipesTable).where(eq(recipesTable.prescriptionId, pres.id));
  const pharmacies = await db.select().from(pharmaciesTable).where(eq(pharmaciesTable.active, true));
  const targets: DeliveryTarget[] = [];
  if (client.email?.trim()) targets.push({ channel: "email", recipient: client.email.trim(), label: `Paciente — ${client.name}` });
  if (client.phone?.trim()) targets.push({ channel: "whatsapp", recipient: client.phone.trim(), label: `Paciente — ${client.name}` });
  if (client.telegramChatId) targets.push({ channel: "telegram", recipient: client.telegramChatId, label: `Paciente — ${client.name}` });
  // Pharmacies are a shared catalogue. Only those attached to this authorized prescription are destinations.
  for (const p of pharmacies.filter(p => recipes.some(r => r.pharmacyId === p.id))) {
    const recipient = (p.whatsapp || p.phone || "").trim();
    if (recipient) targets.push({ channel: "whatsapp", recipient, label: `Farmácia — ${p.name}`, pharmacyId: p.id });
    if (p.email?.trim()) targets.push({ channel: "email", recipient: p.email.trim(), label: `Farmácia — ${p.name}`, pharmacyId: p.id });
  }
  return { pres, identity, client, recipes, targets };
}

const router = Router();
router.get("/prescriptions/:id/delivery", requireCollaborator, async (req, res) => {
  const ctx = await deliveryContext(req);
  const rawHistory = await db.select().from(dispatchLogTable).where(and(
    eq(dispatchLogTable.prescriptionId, ctx.pres.id), eq(dispatchLogTable.empresaId, ctx.identity.clinic.empresaId),
  )).orderBy(desc(dispatchLogTable.createdAt)).limit(100);
  const decodeDetail = (text: string | null): Record<string, unknown> => {
    try { return JSON.parse(text || "{}") ?? {}; } catch { return {}; }
  };
  const logIds = rawHistory.filter(row => row.channel === "whatsapp")
    .map(row => decodeDetail(row.detail).whatsappLogId)
    .filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0);
  // The signed provider callback already persists final status in this log.
  // Read it on every refresh, rather than retaining an obsolete initial acceptance.
  const providerLogs = logIds.length ? await db.select().from(whatsappMensagensLogTable).where(and(
    inArray(whatsappMensagensLogTable.id, logIds),
    eq(whatsappMensagensLogTable.clienteId, ctx.client.id),
    eq(whatsappMensagensLogTable.via, "whatsapp"),
  )) : [];
  const history = rawHistory.map(row => {
    const detail = decodeDetail(row.detail);
    const provider = providerLogs.find(log => log.id === detail.whatsappLogId && log.telefone === detail.recipient);
    if (!provider) return row;
    const failed = ["failed", "undelivered"].includes(provider.status);
    const delivered = ["delivered", "read"].includes(provider.status);
    return { ...row, status: failed ? "failed" : delivered ? "delivered" : row.status,
      detail: JSON.stringify({ ...detail, providerStatus: provider.status,
        error: failed ? provider.errorCode || "Provedor informou falha de entrega." : detail.error }) };
  });
  const recurring = await db.select({
    id: lembreteEnviosTable.id, status: lembreteEnviosTable.status, erro: lembreteEnviosTable.erro,
    janela: lembreteEnviosTable.janela, createdAt: lembreteEnviosTable.createdAt,
    recipient: whatsappMensagensLogTable.telefone, providerStatus: whatsappMensagensLogTable.status,
  }).from(lembreteEnviosTable)
    .leftJoin(whatsappMensagensLogTable, eq(whatsappMensagensLogTable.id, lembreteEnviosTable.whatsappLogId))
    .where(and(eq(lembreteEnviosTable.clienteId, ctx.client.id),
      ctx.pres.emittedAt ? gte(lembreteEnviosTable.createdAt, ctx.pres.emittedAt) : undefined))
    .orderBy(desc(lembreteEnviosTable.createdAt)).limit(30);
  const recurringHistory = recurring.map(row => ({
    id: -row.id, channel: "whatsapp",
    status: ["failed", "undelivered"].includes(row.providerStatus ?? "") || ["FALHOU", "SEM_TWILIO"].includes(row.status)
      ? "failed" : ["delivered", "read"].includes(row.providerStatus ?? "") ? "delivered"
      : row.status === "ENVIADO" ? "accepted" : "pending",
    detail: JSON.stringify({ label: `Lembrete recorrente — ${row.janela}`,
      recipient: row.recipient, error: row.erro }),
    createdAt: row.createdAt,
  }));
  res.setHeader("Cache-Control", "no-store");
  res.json({ targets: ctx.targets, history: [...history, ...recurringHistory]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) });
});

async function deliver(req: Request, res: import("express").Response) {
  const ctx = await deliveryContext(req);
  let target: DeliveryTarget;
  try {
    target = confirmedTarget(req.body, ctx.targets);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  if ((req.path.endsWith("/reenviar-email") && target.channel !== "email") ||
      (req.path.endsWith("/enviar-lembrete") && (target.channel === "email" || target.pharmacyId))) {
    res.status(400).json({ error: "Canal incompatível com esta ação." }); return;
  }
  // Email regeneration must use the original authenticated prescriber and clinic, not the global default.
  if (target.channel === "email" && !target.pharmacyId &&
      (ctx.pres.professionalId !== ctx.identity.professional.id || !ctx.identity.canPrescribe)) {
    res.status(403).json({ error: "O reenvio do documento deve ser feito pelo médico emissor autenticado." }); return;
  }
  const items = await db.select().from(prescriptionItemsTable)
    .where(eq(prescriptionItemsTable.prescriptionId, ctx.pres.id)).orderBy(prescriptionItemsTable.orderIndex);
  if (!items.length) { res.status(422).json({ error: "Prescrição sem itens." }); return; }
  const detail = { recipient: target.recipient, label: target.label, actorId: ctx.identity.professional.id,
    clientId: ctx.client.id };
  let whatsappLogId: number | undefined;
  const result = await auditedDelivery(
    async () => {
      const [row] = await db.insert(dispatchLogTable).values({
        prescriptionId: ctx.pres.id, empresaId: ctx.identity.clinic.empresaId,
        pharmacyId: target.pharmacyId ?? null, channel: target.channel, status: "pending",
        recipeCount: ctx.recipes.filter(r => !target.pharmacyId || r.pharmacyId === target.pharmacyId).length,
        detail: JSON.stringify(detail),
      }).returning({ id: dispatchLogTable.id });
      return row.id;
    },
    async () => {
      if (target.channel === "email" && target.pharmacyId) {
        const recipes = ctx.recipes.filter(r => r.pharmacyId === target.pharmacyId);
        if (!recipes.length || recipes.some(r => !r.pdfData)) return { accepted: false, error: "PDF regulatório indisponível; nenhum documento enviado." };
        const result = await sendGmailMessage({
          to: target.recipient, subject: `${ctx.identity.clinic.name} | Receitas #${ctx.pres.id}`,
          html: "<p>Seguem os documentos clínicos confirmados pela clínica, em anexo.</p>",
          attachments: recipes.map(r => ({ filename: r.fileName || `receita-${r.id}.pdf`,
            content: Buffer.from(r.pdfData!, "base64"), contentType: "application/pdf" })),
        });
        return { accepted: result.success, error: result.error };
      }
      if (target.channel === "email") {
        const result = await emitirReceituarioPdf({
          medicoId: ctx.pres.professionalId!, clinicaId: ctx.identity.clinic.id,
          patient: { nome: ctx.client.name, cpf: ctx.client.cpf ?? undefined,
            telefone: ctx.client.phone ?? undefined, email: ctx.client.email ?? undefined },
          formulas: items.map(it => ({ nome: it.name, ativos: it.ativos ?? undefined,
            posologia: it.posologia ?? "", via: it.via ?? undefined, forma: it.observacao ?? undefined, dose: it.dose ?? undefined })),
          tipoReceita: "especial", emailTo: [target.recipient],
        });
        return { accepted: result.emailSent, error: result.emailError };
      }
      const text = target.pharmacyId
        ? `${ctx.identity.clinic.name}: prescrição #${ctx.pres.id} de ${ctx.client.name} disponível. Solicite os documentos à clínica por canal autorizado.`
        : await prescriptionReminderMessage(ctx.client.name, items);
      const message = text.length > 1450 ? text.slice(0, 1400) + "\n(Consulte a receita completa na clínica.)" : text;
      if (target.channel === "telegram") {
        const result = await sendTelegram(target.recipient, message);
        return { accepted: result.sent && result.mock !== true,
          error: result.mock ? "Telegram não configurado; simulação não é envio." : result.error };
      }
      const result = await sendWhatsapp(target.recipient, message, {
        contexto: "lembrete_prescricao", clienteId: ctx.client.id, mirrorTelegram: false,
      });
      whatsappLogId = result.logId;
      return { accepted: result.sent, error: result.error };
    },
    async (id, status, error) => {
      await db.update(dispatchLogTable).set({ status, detail: JSON.stringify({ ...detail, error, whatsappLogId }) })
        .where(eq(dispatchLogTable.id, id));
    },
  );
  res.json({ ...result, target });
}

router.post("/prescriptions/:id/delivery", requireCollaborator, deliver);
router.post("/prescriptions/:id/enviar-lembrete", requireCollaborator, deliver);
router.post("/prescriptions/:id/reenviar-email", requireCollaborator, deliver);
router.post("/prescriptions/test-email-receituario", requireCollaborator, (_req, res) => {
  res.status(410).json({ error: "Envio de teste desabilitado. Use destinatários cadastrados e confirmados em uma prescrição." });
});
export default router;
