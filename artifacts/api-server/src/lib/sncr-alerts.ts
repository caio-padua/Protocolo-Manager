// Efeitos colaterais dos alertas de numeração SNCR.
// REGRA CRÍTICA: nunca bloqueia a emissão. Tudo é best-effort (try/catch).
// - low (acabando): e-mail para a administração + cartão interno (adm).
// - exhausted (esgotado): escalonamento ao CEO (e-mail urgente) + cartão para
//   adm e médico.
// - no_range (sem talão): tratado como esgotado para fins de alerta.
import { db, taskCardsTable } from "@workspace/db";
import { sendGmailMessage, isGmailConnected } from "./google-gmail";
import { logger } from "./logger";

export type SncrAlertStatus = "low" | "exhausted" | "no_range";

export interface SncrAlertInput {
  status: SncrAlertStatus;
  controlledType: string;
  uf: string;
  remaining: number | null;
  prescriptionId: number | null;
  clientId: number | null;
  professionalName: string | null;
  message: string;
}

// Destinatários configuráveis por ambiente (sem segredos hardcoded).
function adminEmail(): string | null {
  return (
    process.env.SNCR_ALERT_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.CLINIC_EMAIL ||
    null
  );
}

function ceoEmail(): string | null {
  return process.env.CEO_EMAIL || adminEmail();
}

function buildHtml(input: SncrAlertInput, urgent: boolean): string {
  const color = urgent ? "#b91c1c" : "#b45309";
  const header = urgent ? "URGENTE — NUMERAÇÃO SNCR ESGOTADA" : "Atenção — Numeração SNCR acabando";
  return `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a">
      <h2 style="color:${color};margin:0 0 12px">${header}</h2>
      <p>${input.message}</p>
      <table style="border-collapse:collapse;font-size:13px;margin-top:8px">
        <tr><td style="padding:4px 10px;color:#666">Tipo controlado</td><td style="padding:4px 10px;font-weight:bold">${input.controlledType}</td></tr>
        <tr><td style="padding:4px 10px;color:#666">UF</td><td style="padding:4px 10px;font-weight:bold">${input.uf}</td></tr>
        <tr><td style="padding:4px 10px;color:#666">Restantes</td><td style="padding:4px 10px;font-weight:bold">${input.remaining ?? "-"}</td></tr>
        <tr><td style="padding:4px 10px;color:#666">Prescrição</td><td style="padding:4px 10px">#${input.prescriptionId ?? "-"}</td></tr>
        <tr><td style="padding:4px 10px;color:#666">Médico</td><td style="padding:4px 10px">${input.professionalName ?? "-"}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:12px;color:#666">Mensagem automática do Paxter. A emissão NÃO foi bloqueada.</p>
    </div>`;
}

async function createCard(opts: {
  type: string;
  assignedRole: string;
  priority: string;
  title: string;
  description: string;
  clientId: number | null;
}): Promise<void> {
  try {
    await db.insert(taskCardsTable).values({
      type: opts.type,
      assignedRole: opts.assignedRole,
      // task_cards.clientId é NOT NULL; alertas de estoque de numeração não são
      // específicos de cliente — usa 0 como sentinela quando não há cliente.
      clientId: opts.clientId ?? 0,
      priority: opts.priority,
      status: "pending",
      title: opts.title,
      description: opts.description,
    });
  } catch (err) {
    logger.warn({ err }, "Falha ao criar cartão de alerta SNCR");
  }
}

async function sendMail(to: string | null, subject: string, html: string): Promise<void> {
  if (!to) {
    logger.warn({ subject }, "Sem e-mail de destino configurado para alerta SNCR");
    return;
  }
  try {
    if (!(await isGmailConnected())) {
      logger.warn("Gmail indisponível — alerta SNCR não enviado por e-mail");
      return;
    }
    await sendGmailMessage({ to, subject, html });
  } catch (err) {
    logger.warn({ err }, "Falha ao enviar e-mail de alerta SNCR");
  }
}

// Dispara os efeitos colaterais. Best-effort, nunca lança.
export async function handleSncrAlert(input: SncrAlertInput): Promise<void> {
  try {
    const exhausted = input.status === "exhausted" || input.status === "no_range";

    if (exhausted) {
      // Escalonamento ao CEO + cartões para adm e médico.
      await sendMail(
        ceoEmail(),
        `Paxter | URGENTE | SNCR esgotado ${input.controlledType}/${input.uf}`,
        buildHtml(input, true),
      );
      await createCard({
        type: "sncr_exhausted",
        assignedRole: "adm_01",
        priority: "urgent",
        title: `SNCR ESGOTADO — ${input.controlledType} (${input.uf})`,
        description: input.message,
        clientId: input.clientId,
      });
      await createCard({
        type: "sncr_exhausted",
        assignedRole: "medico_01",
        priority: "urgent",
        title: `SNCR ESGOTADO — ${input.controlledType} (${input.uf})`,
        description: input.message,
        clientId: input.clientId,
      });
    } else {
      // low: e-mail para administração + cartão interno.
      await sendMail(
        adminEmail(),
        `Paxter | SNCR acabando | ${input.controlledType}/${input.uf}`,
        buildHtml(input, false),
      );
      await createCard({
        type: "sncr_low",
        assignedRole: "adm_01",
        priority: "high",
        title: `SNCR acabando — ${input.controlledType} (${input.uf})`,
        description: input.message,
        clientId: input.clientId,
      });
    }
  } catch (err) {
    logger.warn({ err }, "handleSncrAlert falhou (ignorado, emissão não bloqueada)");
  }
}
