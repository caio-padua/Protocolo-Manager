// Replit Integration: Google Drive (connector: google-drive)
import { google } from "googleapis";

let connectionSettings: any;

function extractToken(conn: any): string | undefined {
  return conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
}

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    const cached = extractToken(connectionSettings);
    if (cached) return cached;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-drive",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error("Google Drive not connected");
  }
  return accessToken;
}

function getUncachableDriveClient() {
  return getAccessToken().then(accessToken => {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth: oauth2Client });
  });
}

const CLIENT_SUBFOLDERS = [
  "CADASTRO",
  "PATOLOGIAS",
  "EXAMES",
  "AVALIACOES",
  "RECEITAS",
  "PROTOCOLOS",
  "FINANCEIRO",
  "CONTRATOS",
  "ATESTADOS",
  "LAUDOS",
  "TERMOS",
  "FOTO PERFIL",
  "IMAGENS",
  "PESQUISA",
  "OUVIDORIA",
];

function removeDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function findFolder(drive: any, name: string, parentId?: string): Promise<string | null> {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const res = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive" });
  return res.data.files?.[0]?.id ?? null;
}

async function createFolder(drive: any, name: string, parentId?: string): Promise<string> {
  const metadata: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const res = await drive.files.create({
    requestBody: metadata,
    fields: "id",
  });
  return res.data.id!;
}

async function findOrCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
  const existing = await findFolder(drive, name, parentId);
  if (existing) return existing;
  return createFolder(drive, name, parentId);
}

export async function ensureClientFolderStructure(clientName: string, cpf: string): Promise<{
  rootFolderId: string;
  clientFolderId: string;
  subfolders: Record<string, string>;
}> {
  const drive = await getUncachableDriveClient();

  const rootFolderId = await findOrCreateFolder(drive, "PACIENTES");

  const clientFolderName = `${removeDiacritics(clientName).toUpperCase()} ${cpf}`;
  const clientFolderId = await findOrCreateFolder(drive, clientFolderName, rootFolderId);

  const subfolders: Record<string, string> = {};
  for (const sub of CLIENT_SUBFOLDERS) {
    subfolders[sub] = await findOrCreateFolder(drive, sub, clientFolderId);
  }

  await findOrCreateFolder(drive, "CADASTROS ANTIGOS", subfolders["CADASTRO"]);

  return { rootFolderId, clientFolderId, subfolders };
}

export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = await getUncachableDriveClient();

  const existingFiles = await drive.files.list({
    q: `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id)",
  });

  if (existingFiles.data.files?.length) {
    for (const f of existingFiles.data.files) {
      await drive.files.delete({ fileId: f.id });
    }
  }

  const { Readable } = await import("stream");
  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, webViewLink",
  });

  return {
    fileId: res.data.id!,
    webViewLink: res.data.webViewLink ?? "",
  };
}

export async function shareWithClient(fileOrFolderId: string, clientEmail: string): Promise<void> {
  const drive = await getUncachableDriveClient();
  try {
    await drive.permissions.create({
      fileId: fileOrFolderId,
      requestBody: {
        type: "user",
        role: "reader",
        emailAddress: clientEmail,
      },
      sendNotificationEmail: false,
    });
  } catch (err: any) {
    console.error("Failed to share with client:", err.message);
  }
}

export async function isDriveConnected(): Promise<boolean> {
  try {
    await getUncachableDriveClient();
    return true;
  } catch {
    return false;
  }
}

export function formatProtocolFileName(date: string, clientName: string): string {
  const [y, m, d] = date.split("-");
  const yy = y.slice(-2);
  const cleanName = removeDiacritics(clientName).toUpperCase();
  return `${yy}.${m}.${d} PROTOCOLO ${cleanName}.pdf`;
}

export function formatRASFileName(date: string, clientName: string, cpf: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y.slice(-2)} RAS ${removeDiacritics(clientName).toUpperCase()} ${cpf}.pdf`;
}
