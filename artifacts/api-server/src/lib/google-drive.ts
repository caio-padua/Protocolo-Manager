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

function getOAuth2Client() {
  return getAccessToken().then(accessToken => {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return oauth2Client;
  });
}

function getUncachableDriveClient() {
  return getOAuth2Client().then(auth => google.drive({ version: "v3", auth }));
}

function getSheetsClient() {
  return getOAuth2Client().then(auth => google.sheets({ version: "v4", auth }));
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

export function removeDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function formatCpfDisplay(cpf: string): string {
  return cpf.replace(/\D/g, "").padStart(11, "0").slice(0, 11);
}

export function buildClientFolderName(clientName: string, cpf: string): string {
  const cleanName = removeDiacritics(clientName).toUpperCase().trim();
  const formattedCpf = formatCpfDisplay(cpf);
  return `${cleanName} CPF ${formattedCpf}`;
}

async function findFolder(drive: any, name: string, parentId?: string): Promise<string | null> {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const res = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive" });
  return res.data.files?.[0]?.id ?? null;
}

async function findAllFolders(drive: any, parentId: string): Promise<Array<{ id: string; name: string }>> {
  const q = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive", pageSize: 1000 });
  return res.data.files || [];
}

async function listAllChildren(drive: any, folderId: string): Promise<Array<{ id: string; name: string }>> {
  const q = `'${folderId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: "files(id, name, mimeType)", spaces: "drive", pageSize: 1000 });
  return res.data.files || [];
}

async function moveFile(drive: any, fileId: string, oldParentId: string, newParentId: string): Promise<void> {
  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParentId,
    fields: "id, parents",
  });
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

async function renameFolder(drive: any, folderId: string, newName: string): Promise<void> {
  await drive.files.update({
    fileId: folderId,
    requestBody: { name: newName },
  });
}

async function findOldClientFolder(drive: any, rootId: string, cpf: string, _clientName: string): Promise<string | null> {
  const cpfDigits = cpf.replace(/\D/g, "").padStart(11, "0");
  const formattedCpf = formatCpfDisplay(cpf);

  const allFolders = await findAllFolders(drive, rootId);

  const oldFormattedCpf = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`;
  const cpfPatterns = [
    cpfDigits,
    oldFormattedCpf,
    `CPF: ${oldFormattedCpf}`,
    `CPF ${cpfDigits}`,
  ];

  for (const folder of allFolders) {
    const folderName = folder.name;
    for (const pattern of cpfPatterns) {
      if (folderName.includes(pattern)) {
        return folder.id;
      }
    }
  }

  return null;
}

async function ensureRootFolder(drive: any): Promise<string> {
  const clientesId = await findFolder(drive, "CLIENTES");
  const pacientesId = await findFolder(drive, "PACIENTES");

  if (clientesId && pacientesId) {
    const legacyChildren = await listAllChildren(drive, pacientesId);
    for (const child of legacyChildren) {
      try {
        await moveFile(drive, child.id, pacientesId, clientesId);
        console.log(`[Drive] Migrado ${child.name} de PACIENTES para CLIENTES`);
      } catch (err: any) {
        console.error(`[Drive] Erro ao migrar ${child.name}:`, err.message);
      }
    }
    try {
      await drive.files.update({ fileId: pacientesId, requestBody: { trashed: true } });
      console.log("[Drive] Pasta PACIENTES antiga movida para lixeira");
    } catch (err: any) {
      console.error("[Drive] Erro ao mover PACIENTES para lixeira:", err.message);
    }
    return clientesId;
  }

  if (clientesId) return clientesId;

  if (pacientesId) {
    await renameFolder(drive, pacientesId, "CLIENTES");
    console.log("[Drive] Pasta PACIENTES renomeada para CLIENTES");
    return pacientesId;
  }

  return createFolder(drive, "CLIENTES");
}

export async function ensureClientFolderStructure(clientName: string, cpf: string): Promise<{
  rootFolderId: string;
  clientFolderId: string;
  subfolders: Record<string, string>;
}> {
  const drive = await getUncachableDriveClient();

  const rootFolderId = await ensureRootFolder(drive);

  const newFolderName = buildClientFolderName(clientName, cpf);
  let clientFolderId = await findFolder(drive, newFolderName, rootFolderId);

  if (!clientFolderId) {
    const oldFolderId = await findOldClientFolder(drive, rootFolderId, cpf, clientName);

    if (oldFolderId) {
      await renameFolder(drive, oldFolderId, newFolderName);
      clientFolderId = oldFolderId;
      console.log(`[Drive] Pasta antiga renomeada para: ${newFolderName}`);
    } else {
      clientFolderId = await createFolder(drive, newFolderName, rootFolderId);
      console.log(`[Drive] Pasta nova criada: ${newFolderName}`);
    }
  }

  const subfolders: Record<string, string> = {};
  for (const sub of CLIENT_SUBFOLDERS) {
    subfolders[sub] = await findOrCreateFolder(drive, sub, clientFolderId);
  }

  await findOrCreateFolder(drive, "CADASTROS ANTIGOS", subfolders["CADASTRO"]);

  return { rootFolderId, clientFolderId, subfolders };
}

export async function createClientSpreadsheet(
  clientName: string,
  cpf: string,
  clientData: {
    birthDate?: string | null;
    phone?: string | null;
    cep?: string | null;
    address?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    pais?: string | null;
    email?: string | null;
    instagram?: string | null;
    comoConheceu?: string | null;
  },
  folderStructure: {
    rootFolderId: string;
    clientFolderId: string;
    subfolders: Record<string, string>;
  }
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const drive = await getUncachableDriveClient();
  const sheets = await getSheetsClient();

  const cleanName = removeDiacritics(clientName).toUpperCase().trim();
  const formattedCpf = formatCpfDisplay(cpf);
  const sheetTitle = `CADASTRO - ${cleanName} CPF ${formattedCpf}`;

  const existingFiles = await drive.files.list({
    q: `name='${sheetTitle.replace(/'/g, "\\'")}' and '${folderStructure.subfolders["CADASTRO"]}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id, name)",
  });

  if (existingFiles.data.files?.length) {
    const existing = existingFiles.data.files[0];
    return {
      spreadsheetId: existing.id!,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${existing.id}`,
    };
  }

  const addr = clientData.address || "";
  const addrParts = parseAddressFields(addr);
  const endereco = clientData.address
    ? removeDiacritics(addrParts.logradouro || "").toUpperCase()
    : "";
  const numero = clientData.numero || addrParts.numero || "";
  const complemento = clientData.complemento || addrParts.complemento || "";
  const cidade = clientData.cidade
    ? removeDiacritics(clientData.cidade).toUpperCase()
    : removeDiacritics(addrParts.cidade || "").toUpperCase();
  const estado = clientData.estado
    ? clientData.estado.toUpperCase()
    : (addrParts.estado || "").toUpperCase();
  const cep = clientData.cep || addrParts.cep || "";
  const pais = (clientData.pais || "BRASIL").toUpperCase();

  const phone = clientData.phone || "";
  const phoneWithCountry = phone.startsWith("+") ? phone : `+55 ${phone}`;

  const now = new Date();
  const carimbo = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;

  const birthDate = clientData.birthDate || "";
  const email = (clientData.email || "").toUpperCase();
  const instagram = clientData.instagram || "";
  const comoConheceu = (clientData.comoConheceu || "").toUpperCase();

  const clientFolderUrl = `https://drive.google.com/drive/folders/${folderStructure.clientFolderId}`;

  const spreadsheetRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: sheetTitle },
      sheets: [
        {
          properties: { title: "CADASTRO", sheetId: 0, index: 0 },
          data: [{
            startRow: 0, startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: "CARIMBO DE DATA/HORA" } },
                  { userEnteredValue: { stringValue: "PONTUACAO" } },
                  { userEnteredValue: { stringValue: "NOME" } },
                  { userEnteredValue: { stringValue: "CPF" } },
                  { userEnteredValue: { stringValue: "DATA NASCIMENTO" } },
                  { userEnteredValue: { stringValue: "CELULAR" } },
                  { userEnteredValue: { stringValue: "CEP" } },
                  { userEnteredValue: { stringValue: "ENDERECO" } },
                  { userEnteredValue: { stringValue: "NUMERO" } },
                  { userEnteredValue: { stringValue: "COMPLEMENTO" } },
                  { userEnteredValue: { stringValue: "BAIRRO" } },
                  { userEnteredValue: { stringValue: "CIDADE" } },
                  { userEnteredValue: { stringValue: "ESTADO" } },
                  { userEnteredValue: { stringValue: "PAIS" } },
                  { userEnteredValue: { stringValue: "EMAIL" } },
                  { userEnteredValue: { stringValue: "INSTAGRAM" } },
                  { userEnteredValue: { stringValue: "COMO NOS CONHECEU ?" } },
                ],
              },
              {
                values: [
                  { userEnteredValue: { stringValue: carimbo } },
                  { userEnteredValue: { stringValue: "" } },
                  { userEnteredValue: { stringValue: cleanName } },
                  { userEnteredValue: { stringValue: formattedCpf } },
                  { userEnteredValue: { stringValue: birthDate } },
                  { userEnteredValue: { stringValue: phoneWithCountry } },
                  { userEnteredValue: { stringValue: cep } },
                  { userEnteredValue: { stringValue: endereco } },
                  { userEnteredValue: { stringValue: numero } },
                  { userEnteredValue: { stringValue: complemento } },
                  { userEnteredValue: { stringValue: removeDiacritics(addrParts.bairro || clientData.bairro || "").toUpperCase() } },
                  { userEnteredValue: { stringValue: cidade } },
                  { userEnteredValue: { stringValue: estado } },
                  { userEnteredValue: { stringValue: pais } },
                  { userEnteredValue: { stringValue: email } },
                  { userEnteredValue: { stringValue: instagram } },
                  { userEnteredValue: { stringValue: comoConheceu } },
                ],
              },
            ],
          }],
        },
        {
          properties: { title: "METADADOS", sheetId: 1, index: 1 },
          data: [{
            startRow: 0, startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: "NOME" } },
                  { userEnteredValue: { stringValue: "CPF" } },
                  { userEnteredValue: { stringValue: "URL PASTA" } },
                  { userEnteredValue: { stringValue: "ID PASTA" } },
                  { userEnteredValue: { stringValue: "ID CADASTRO" } },
                  { userEnteredValue: { stringValue: "ID PATOLOGIAS" } },
                  { userEnteredValue: { stringValue: "ID EXAMES" } },
                  { userEnteredValue: { stringValue: "ID AVALIACOES" } },
                  { userEnteredValue: { stringValue: "ID RECEITAS" } },
                  { userEnteredValue: { stringValue: "ID PROTOCOLOS" } },
                  { userEnteredValue: { stringValue: "ID FINANCEIRO" } },
                  { userEnteredValue: { stringValue: "ID CONTRATOS" } },
                  { userEnteredValue: { stringValue: "ID ATESTADOS" } },
                  { userEnteredValue: { stringValue: "ID LAUDOS" } },
                  { userEnteredValue: { stringValue: "ID TERMOS" } },
                  { userEnteredValue: { stringValue: "ID FOTO PERFIL" } },
                  { userEnteredValue: { stringValue: "ID IMAGENS" } },
                  { userEnteredValue: { stringValue: "ID PESQUISA" } },
                  { userEnteredValue: { stringValue: "ID OUVIDORIA" } },
                ],
              },
              {
                values: [
                  { userEnteredValue: { stringValue: cleanName } },
                  { userEnteredValue: { stringValue: formattedCpf } },
                  { userEnteredValue: { stringValue: clientFolderUrl } },
                  { userEnteredValue: { stringValue: folderStructure.clientFolderId } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["CADASTRO"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["PATOLOGIAS"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["EXAMES"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["AVALIACOES"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["RECEITAS"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["PROTOCOLOS"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["FINANCEIRO"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["CONTRATOS"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["ATESTADOS"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["LAUDOS"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["TERMOS"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["FOTO PERFIL"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["IMAGENS"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["PESQUISA"] || "" } },
                  { userEnteredValue: { stringValue: folderStructure.subfolders["OUVIDORIA"] || "" } },
                ],
              },
            ],
          }],
        },
      ],
    },
  });

  const spreadsheetId = spreadsheetRes.data.spreadsheetId!;

  await drive.files.update({
    fileId: spreadsheetId,
    addParents: folderStructure.subfolders["CADASTRO"],
    fields: "id, parents",
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.12, green: 0.33, blue: 0.33 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.12, green: 0.33, blue: 0.33 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 17 },
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId: 1, dimension: "COLUMNS", startIndex: 0, endIndex: 19 },
          },
        },
      ],
    },
  });

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  };
}

function parseAddressFields(address: string): {
  logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; estado: string; cep: string;
} {
  const result = { logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "" };
  if (!address) return result;

  const cepMatch = address.match(/CEP\s*([\d\-\.]+)/i) || address.match(/(\d{5}[\-]?\d{3})/);
  if (cepMatch) result.cep = cepMatch[1].replace(/\./g, "");

  const clean = address.replace(/,?\s*CEP\s*[\d\-\.]+/i, "").trim();
  const parts = clean.split(",").map(p => p.trim()).filter(Boolean);

  if (parts.length >= 1) result.logradouro = parts[0];
  if (parts.length >= 2) result.numero = parts[1];
  if (parts.length >= 3) result.bairro = parts[2];
  if (parts.length >= 4) {
    const cidadeEstado = parts[3];
    const ceMatch = cidadeEstado.match(/^(.+?)\s*-\s*(\w{2})$/);
    if (ceMatch) {
      result.cidade = ceMatch[1].trim();
      result.estado = ceMatch[2].trim();
    } else {
      result.cidade = cidadeEstado;
    }
  }

  return result;
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

export function formatPhysicalRASFileName(date: string, clientName: string, protocolTitle: string): string {
  const [y, m, d] = date.split("-");
  const yy = y.slice(-2);
  const cleanName = removeDiacritics(clientName).toUpperCase();
  const cleanTitle = removeDiacritics(protocolTitle).toUpperCase();
  return `${yy}.${m}.${d} PROTOCOLO ${cleanName} (${cleanTitle}).pdf`;
}

export async function uploadToFolderById(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<{ fileId: string; webViewLink: string }> {
  return uploadFileToDrive(folderId, fileName, mimeType, fileBuffer);
}
