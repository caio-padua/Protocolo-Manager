/**
 * googleAuth — Bandeira dupla: Replit Connectors (dev) ou Service Account (Railway)
 *
 * BANDEIRA DUPLA:
 *   process.env.REPLIT_CONNECTORS_TOKEN existe → retorna credenciais via Replit Connectors
 *   variável ausente                           → retorna credenciais via Google Service Account
 *
 * Por que Service Account e não OAuth 2.0 com browser?
 * Dr. Caio é operador único. A Service Account com delegação de domínio
 * gera tokens server-side sem interação humana.
 *
 * Variáveis para Railway:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — conteúdo JSON da Service Account, base64-encoded
 *   GOOGLE_DELEGATED_EMAIL       — e-mail do Dr. Caio para delegação de domínio
 *
 * Escopos por serviço:
 *   Calendar : https://www.googleapis.com/auth/calendar
 *   Gmail    : https://www.googleapis.com/auth/gmail.send
 *   Drive    : https://www.googleapis.com/auth/drive
 *
 * Uso:
 *   const auth = await getGoogleAuth(["https://www.googleapis.com/auth/calendar"]);
 *   const calendar = google.calendar({ version: "v3", auth });
 */

import { logger } from "./logger";

export const SCOPES = {
  CALENDAR: "https://www.googleapis.com/auth/calendar",
  GMAIL_SEND: "https://www.googleapis.com/auth/gmail.send",
  DRIVE: "https://www.googleapis.com/auth/drive",
} as const;

function isReplitEnv(): boolean {
  return !!process.env.REPLIT_CONNECTORS_TOKEN;
}

/**
 * Retorna um objeto google.auth compatível com googleapis SDK.
 * Em Replit: usa token injetado pelos Connectors.
 * Em Railway: usa Service Account com delegação de domínio.
 */
export async function getGoogleAuth(scopes: string[]) {
  if (isReplitEnv()) {
    const token = process.env.REPLIT_CONNECTORS_TOKEN!;
    const { google } = await import("googleapis");
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    return auth;
  }

  const jsonB64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const delegatedEmail = process.env.GOOGLE_DELEGATED_EMAIL;

  if (!jsonB64) {
    logger.error(
      "GOOGLE_SERVICE_ACCOUNT_JSON não definida. " +
      "Defina a variável com o JSON da Service Account em base64. " +
      "Consulte docs/dr-replit/PARA_MANAGER/GUIA_GOOGLE_SERVICE_ACCOUNT.md."
    );
    throw new Error("Integração Google não configurada (Service Account ausente).");
  }

  let serviceAccountJson: Record<string, unknown>;
  try {
    const raw = Buffer.from(jsonB64, "base64").toString("utf8");
    serviceAccountJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON malformada — não é base64 de JSON válido.");
  }

  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountJson,
    scopes,
    ...(delegatedEmail ? { clientOptions: { subject: delegatedEmail } } : {}),
  });

  return auth;
}

/**
 * Instância autenticada do Google Calendar.
 * Uso: const cal = await getCalendarClient();
 */
export async function getCalendarClient() {
  const auth = await getGoogleAuth([SCOPES.CALENDAR]);
  const { google } = await import("googleapis");
  return google.calendar({ version: "v3", auth: auth as Parameters<typeof google.calendar>[0]["auth"] });
}

/**
 * Instância autenticada do Gmail.
 */
export async function getGmailClient() {
  const auth = await getGoogleAuth([SCOPES.GMAIL_SEND]);
  const { google } = await import("googleapis");
  return google.gmail({ version: "v1", auth: auth as Parameters<typeof google.gmail>[0]["auth"] });
}

/**
 * Instância autenticada do Google Drive.
 */
export async function getDriveClient() {
  const auth = await getGoogleAuth([SCOPES.DRIVE]);
  const { google } = await import("googleapis");
  return google.drive({ version: "v3", auth: auth as Parameters<typeof google.drive>[0]["auth"] });
}
