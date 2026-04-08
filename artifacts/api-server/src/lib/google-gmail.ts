// Replit Integration: Gmail (connector: google-mail)
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
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

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
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
    const gmail = await getUncachableGmailClient();
    const rawMessage = buildMimeMessage(options);
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return { success: true, messageId: result.data.id ?? undefined };
  } catch (err: any) {
    console.error("Failed to send Gmail message:", err.message);
    return { success: false, error: err.message ?? String(err) };
  }
}

export async function isGmailConnected(): Promise<boolean> {
  try {
    await getUncachableGmailClient();
    return true;
  } catch {
    return false;
  }
}
