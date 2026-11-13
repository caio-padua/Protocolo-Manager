// Replit Integration: Gmail (connector: google-mail)
import { google } from 'googleapis';
import { ReplitConnectors } from '@replit/connectors-sdk';
import {
  findReplitConnection,
  getReplitConnectionAccessToken,
  type ReplitConnectorConnection,
} from "./replit-connection";

let connectionSettings: ReplitConnectorConnection | undefined;
const connectors = new ReplitConnectors();

async function gmailProfile(): Promise<{ emailAddress?: string }> {
  const response = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile", { method: "GET" });
  if (!response.ok) throw new Error(`Gmail indisponível ou não autorizado (código ${response.status}).`);
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("emailAddress" in payload) ||
    typeof payload.emailAddress !== "string"
  ) {
    return {};
  }
  return { emailAddress: payload.emailAddress };
}

async function getAccessToken() {
  const cachedToken = getReplitConnectionAccessToken(connectionSettings);
  const expiresAt = connectionSettings?.settings.expires_at;
  if (cachedToken && expiresAt && new Date(expiresAt).getTime() > Date.now()) {
    return cachedToken;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  );
  if (!response.ok) throw new Error("Gmail não conectado");
  connectionSettings = findReplitConnection(await response.json(), "google-mail");

  const accessToken = getReplitConnectionAccessToken(connectionSettings);

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail não conectado');
  }
  if (connectionSettings.status && connectionSettings.status !== 'connected') {
    connectionSettings = undefined;
    throw new Error('Conexão do Gmail expirada ou desconectada: reconecte a integração Gmail para enviar e-mails.');
  }
  return accessToken;
}

export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function buildMimeMessage(options: {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = options.attachments && options.attachments.length > 0;

  let message = "";
  message += `To: ${options.to}\r\n`;
  message += `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=\r\n`;
  message += `MIME-Version: 1.0\r\n`;

  if (hasAttachments) {
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset=UTF-8\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += Buffer.from(options.html).toString('base64') + "\r\n";

    for (const att of options.attachments!) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: ${att.contentType}; name="${att.filename}"\r\n`;
      message += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n\r\n`;
      message += att.content.toString('base64') + "\r\n";
    }
    message += `--${boundary}--\r\n`;
  } else {
    message += `Content-Type: text/html; charset=UTF-8\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += Buffer.from(options.html).toString('base64');
  }

  return message;
}

export async function sendGmailMessage(options: {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const rawMessage = buildMimeMessage(options);
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // O envio não pode ser repetido silenciosamente: uma resposta perdida pode
    // ocorrer depois de o Gmail aceitar a mensagem. A chamada única usa os
    // métodos públicos do conector para montar endereço e cabeçalhos.
    const headers = await connectors.getProxyHeaders("google-mail");
    const response = await fetch(`${connectors.getProxyUrl()}/gmail/v1/users/me/messages/send`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encodedMessage }),
    });
    if (!response.ok) {
      return { success: false, error: `O Gmail não confirmou o envio (código ${response.status}). Verifique antes de reenviar.` };
    }
    const result = await response.json() as { id?: string };
    if (!result.id) return { success: false, error: "O Gmail não confirmou o envio. Verifique antes de reenviar." };
    return { success: true, messageId: result.id };
  } catch (err: any) {
    console.error("Failed to send Gmail message:", err.message);
    return { success: false, error: "Não foi possível confirmar o envio pelo Gmail. Verifique antes de reenviar." };
  }
}

export async function isGmailConnected(): Promise<boolean> {
  try {
    await gmailProfile();
    return true;
  } catch {
    return false;
  }
}

// Endereço da própria conta Gmail conectada (o "from"). Usado para enviar
// e-mails de TESTE só para a própria caixa, nunca para terceiros.
export async function getGmailAddress(): Promise<string | null> {
  try {
    const prof = await gmailProfile();
    return prof.emailAddress ?? null;
  } catch {
    return null;
  }
}
