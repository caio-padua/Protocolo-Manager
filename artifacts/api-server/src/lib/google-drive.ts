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
    "https://" + hostname + "/api/v2/connection?include_secrets=true",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  ).then(res => res.json()).then(data => data.items?.find((i: any) => i.connector_name === "google-drive"));

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
  const digits = cpf.replace(/\D/g, "").padStart(11, "0").slice(0, 11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
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

  const dotCpf = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`;
  const cpfPatterns = [
    cpfDigits,
    dotCpf,
    `CPF: ${dotCpf}`,
    `CPF ${cpfDigits}`,
    `CPF ${dotCpf}`,
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
  const phoneDigits = phone.replace(/\D/g, "");
  let phoneFormatted = phone;
  if (phoneDigits.length === 11) {
    phoneFormatted = `+55 (${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, 7)}-${phoneDigits.slice(7)}`;
  } else if (phoneDigits.length === 13 && phoneDigits.startsWith("55")) {
    phoneFormatted = `+${phoneDigits.slice(0, 2)} (${phoneDigits.slice(2, 4)}) ${phoneDigits.slice(4, 9)}-${phoneDigits.slice(9)}`;
  } else if (phone.startsWith("+")) {
    phoneFormatted = phone;
  } else {
    phoneFormatted = `+55 ${phone}`;
  }

  const cepDigits = cep.replace(/\D/g, "");
  const cepFormatted = cepDigits.length === 8
    ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`
    : cep;

  const now = new Date();
  const carimbo = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;

  const rawBirthDate = clientData.birthDate || "";
  let birthDate = rawBirthDate;
  if (rawBirthDate.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [y, m, d] = rawBirthDate.slice(0, 10).split("-");
    birthDate = `${d}/${m}/${y}`;
  }
  const email = (clientData.email || "").toUpperCase();
  const instagram = (clientData.instagram || "").toUpperCase();
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
                  { userEnteredValue: { stringValue: phoneFormatted } },
                  { userEnteredValue: { stringValue: cepFormatted } },
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
  fileBuffer: Buffer,
  // Quando true, NAO apaga arquivo homonimo antes de subir. Use para arquivos
  // que devem coexistir (ex.: receitas — nome ja e unico por id), evitando que
  // um upload destrua um PDF anterior do mesmo dia.
  allowDuplicates = false
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = await getUncachableDriveClient();

  if (!allowDuplicates) {
    const existingFiles = await drive.files.list({
      q: `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
      fields: "files(id)",
    });

    if (existingFiles.data.files?.length) {
      for (const f of existingFiles.data.files) {
        await drive.files.delete({ fileId: f.id });
      }
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

export interface DriveChild {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
}

/** Lista os filhos diretos de uma pasta (arquivos e subpastas), paginando tudo. */
export async function driveListChildren(folderId: string): Promise<DriveChild[]> {
  const drive = await getUncachableDriveClient();
  const out: DriveChild[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      out.push({
        id: f.id!,
        name: f.name ?? "",
        mimeType: f.mimeType ?? "",
        isFolder: f.mimeType === "application/vnd.google-apps.folder",
        size: f.size ? Number(f.size) : null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** Baixa o conteudo bruto de um arquivo do Drive como Buffer. */
export async function driveDownloadFile(fileId: string): Promise<Buffer> {
  const drive = await getUncachableDriveClient();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/**
 * Cria uma CÓPIA de um arquivo no Drive dentro de uma pasta, com novo nome.
 * O arquivo original fica intocado (sandbox). Usado pelo watcher para criar
 * a cópia canônica (YY.MM.DD EXAME SANGUE NOME) sem renomear o original.
 */
export async function driveCopyFileInFolder(
  sourceFileId: string,
  targetFolderId: string,
  newName: string,
): Promise<{ fileId: string }> {
  const drive = await getUncachableDriveClient();
  const res = await drive.files.copy({
    fileId: sourceFileId,
    requestBody: { name: newName, parents: [targetFolderId] },
    fields: "id",
  });
  return { fileId: res.data.id! };
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

// ===== Roteamento de receitas para farmácias =====
// Estrutura: FARMACIAS (raiz) -> <NOME FARMACIA> -> <AAAA-MM-DD> (subpasta por dia).
// Idempotente: não recria pastas existentes.
export async function ensurePharmacyDayFolder(
  pharmacyName: string,
  dateStr: string,
): Promise<{ rootFolderId: string; pharmacyFolderId: string; dayFolderId: string }> {
  const drive = await getUncachableDriveClient();
  const cleanName = removeDiacritics(pharmacyName).toUpperCase().trim() || "FARMACIA";

  const rootFolderId = await findOrCreateFolder(drive, "FARMACIAS");
  const pharmacyFolderId = await findOrCreateFolder(drive, cleanName, rootFolderId);
  const dayFolderId = await findOrCreateFolder(drive, dateStr, pharmacyFolderId);

  return { rootFolderId, pharmacyFolderId, dayFolderId };
}

// Garante a pasta raiz da farmácia (sem subpasta de dia) — usada no cadastro.
export async function ensurePharmacyFolder(pharmacyName: string): Promise<string> {
  const drive = await getUncachableDriveClient();
  const cleanName = removeDiacritics(pharmacyName).toUpperCase().trim() || "FARMACIA";
  const rootFolderId = await findOrCreateFolder(drive, "FARMACIAS");
  return findOrCreateFolder(drive, cleanName, rootFolderId);
}

// Compartilhamento somente leitura (permite download, não edição).
export async function sharePharmacyFolder(folderId: string, email: string): Promise<void> {
  await shareWithClient(folderId, email);
}

function extractCpfFromFolderName(folderName: string): string | null {
  const cpfWithDots = folderName.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
  if (cpfWithDots) return cpfWithDots[1].replace(/\D/g, "");

  const cpfMatch = folderName.match(/CPF\s+(\d{11})/);
  if (cpfMatch) return cpfMatch[1];

  const rawDigits = folderName.match(/(\d{11})/);
  if (rawDigits) return rawDigits[1];

  return null;
}

export async function deduplicateClientFolders(): Promise<{
  merged: Array<{ cpf: string; kept: string; removed: string[]; filesMoved: number }>;
  errors: string[];
}> {
  const drive = await getUncachableDriveClient();
  const rootId = await findOrCreateFolder(drive, "CLIENTES");

  const allFolders = await findAllFolders(drive, rootId);

  const byCpf = new Map<string, Array<{ id: string; name: string }>>();
  for (const folder of allFolders) {
    const cpf = extractCpfFromFolderName(folder.name);
    if (!cpf) continue;
    const existing = byCpf.get(cpf) || [];
    existing.push(folder);
    byCpf.set(cpf, existing);
  }

  const merged: Array<{ cpf: string; kept: string; removed: string[]; filesMoved: number }> = [];
  const errors: string[] = [];

  for (const [cpf, folders] of byCpf) {
    if (folders.length <= 1) continue;

    const sorted = [...folders].sort((a, b) => {
      const aHasCpfFormatted = a.name.includes("CPF ");
      const bHasCpfFormatted = b.name.includes("CPF ");
      if (aHasCpfFormatted && !bHasCpfFormatted) return -1;
      if (!aHasCpfFormatted && bHasCpfFormatted) return 1;
      return b.name.length - a.name.length;
    });

    const keeper = sorted[0];
    const duplicates = sorted.slice(1);
    let totalFilesMoved = 0;

    try {
      const keeperSubs = await findAllFolders(drive, keeper.id);
      const keeperSubMap = new Map<string, string>();
      for (const sub of keeperSubs) {
        keeperSubMap.set(sub.name.toUpperCase(), sub.id);
      }

      for (const dup of duplicates) {
        const dupChildren = await listAllChildren(drive, dup.id);

        for (const child of dupChildren) {
          const isFolder = (child as any).mimeType === "application/vnd.google-apps.folder";

          if (isFolder) {
            const subName = child.name.toUpperCase();
            const targetSubId = keeperSubMap.get(subName);

            if (targetSubId) {
              const subChildren = await listAllChildren(drive, child.id);
              for (const subChild of subChildren) {
                await moveFile(drive, subChild.id, child.id, targetSubId);
                totalFilesMoved++;
              }
              await drive.files.update({ fileId: child.id, requestBody: { trashed: true } });
            } else {
              await moveFile(drive, child.id, dup.id, keeper.id);
              keeperSubMap.set(subName, child.id);
              totalFilesMoved++;
            }
          } else {
            await moveFile(drive, child.id, dup.id, keeper.id);
            totalFilesMoved++;
          }
        }

        await drive.files.update({ fileId: dup.id, requestBody: { trashed: true } });
        console.log(`[Drive] Dedup: removida pasta duplicada "${dup.name}" (CPF ${cpf})`);
      }

      merged.push({
        cpf,
        kept: keeper.name,
        removed: duplicates.map(d => d.name),
        filesMoved: totalFilesMoved,
      });
    } catch (err: any) {
      errors.push(`CPF ${cpf}: ${err.message}`);
    }
  }

  return { merged, errors };
}

function buildNormalizedFolderName(currentName: string): string {
  const cpfMatch = currentName.match(/(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-.\s]?(\d{2})/);
  let cpfDigits: string | null = null;
  if (cpfMatch) {
    cpfDigits = cpfMatch[1] + cpfMatch[2] + cpfMatch[3] + cpfMatch[4];
  } else {
    const raw11 = currentName.match(/(\d{11})/);
    if (raw11) cpfDigits = raw11[1];
  }

  let namePart = currentName;
  if (cpfDigits) {
    namePart = namePart
      .replace(/\s*-?\s*CPF\s*:?\s*/i, " ")
      .replace(/(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-.\s]?(\d{2})/, "")
      .replace(/\d{11}/, "");
  }
  namePart = namePart.replace(/\s*-\s*DEDUPLICADO\s*/gi, "");
  namePart = namePart.replace(/\s*-\s*$/g, "");
  namePart = namePart.replace(/^\s*-\s*/g, "");
  namePart = namePart.replace(/\s+/g, " ").trim();
  namePart = removeDiacritics(namePart).toUpperCase();

  if (cpfDigits) {
    const formatted = formatCpfDisplay(cpfDigits);
    return `${namePart} CPF ${formatted}`;
  }
  return namePart;
}

export async function normalizeAllClientFolders(): Promise<{
  renamed: Array<{ from: string; to: string }>;
  subfoldersCreated: number;
  spreadsheetsCreated: number;
  errors: string[];
}> {
  const drive = await getUncachableDriveClient();
  const sheets = await getSheetsClient();
  const rootId = await findOrCreateFolder(drive, "CLIENTES");

  const allFolders = await findAllFolders(drive, rootId);

  const renamed: Array<{ from: string; to: string }> = [];
  let subfoldersCreated = 0;
  let spreadsheetsCreated = 0;
  const errors: string[] = [];

  for (const folder of allFolders) {
    try {
      const normalizedName = buildNormalizedFolderName(folder.name);

      if (normalizedName !== folder.name) {
        await renameFolder(drive, folder.id, normalizedName);
        renamed.push({ from: folder.name, to: normalizedName });
        console.log(`[Normalize] Renomeada: "${folder.name}" -> "${normalizedName}"`);
      }

      const existingSubs = await findAllFolders(drive, folder.id);
      const existingSubNames = new Set(existingSubs.map(s => s.name.toUpperCase()));

      for (const subName of CLIENT_SUBFOLDERS) {
        if (!existingSubNames.has(subName.toUpperCase())) {
          await createFolder(drive, subName, folder.id);
          subfoldersCreated++;
        }
      }

      const cadastroId = (existingSubs.find(s => s.name.toUpperCase() === "CADASTRO") || 
        { id: await findFolder(drive, "CADASTRO", folder.id) }).id;
      
      if (cadastroId) {
        await findOrCreateFolder(drive, "CADASTROS ANTIGOS", cadastroId);
      }

      const cpfFromName = extractCpfFromFolderName(normalizedName);
      const nameWithoutCpf = normalizedName.replace(/\s*CPF\s+\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/, "").trim();
      const formattedCpf = cpfFromName ? formatCpfDisplay(cpfFromName) : "";
      const sheetTitle = cpfFromName
        ? `CADASTRO - ${nameWithoutCpf} CPF ${formattedCpf}`
        : `CADASTRO - ${nameWithoutCpf}`;

      if (cadastroId) {
        const existingSheets = await drive.files.list({
          q: `'${cadastroId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
          fields: "files(id, name)",
        });

        if (!existingSheets.data.files?.length) {
          const clientFolderUrl = `https://drive.google.com/drive/folders/${folder.id}`;
          const subfolderMap: Record<string, string> = {};
          const allSubsNow = await findAllFolders(drive, folder.id);
          for (const s of allSubsNow) {
            subfolderMap[s.name.toUpperCase()] = s.id;
          }

          const now = new Date();
          const carimbo = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;

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
                          { userEnteredValue: { stringValue: nameWithoutCpf } },
                          { userEnteredValue: { stringValue: formattedCpf } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "BRASIL" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
                          { userEnteredValue: { stringValue: "" } },
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
                          { userEnteredValue: { stringValue: nameWithoutCpf } },
                          { userEnteredValue: { stringValue: formattedCpf } },
                          { userEnteredValue: { stringValue: clientFolderUrl } },
                          { userEnteredValue: { stringValue: folder.id } },
                          { userEnteredValue: { stringValue: subfolderMap["CADASTRO"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["PATOLOGIAS"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["EXAMES"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["AVALIACOES"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["RECEITAS"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["PROTOCOLOS"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["FINANCEIRO"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["CONTRATOS"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["ATESTADOS"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["LAUDOS"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["TERMOS"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["FOTO PERFIL"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["IMAGENS"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["PESQUISA"] || "" } },
                          { userEnteredValue: { stringValue: subfolderMap["OUVIDORIA"] || "" } },
                        ],
                      },
                    ],
                  }],
                },
              ],
            },
          });

          const newSheetId = spreadsheetRes.data.spreadsheetId!;

          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: newSheetId,
            requestBody: {
              requests: [
                {
                  repeatCell: {
                    range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 17 },
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
                    range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 19 },
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
              ],
            },
          });

          await drive.files.update({
            fileId: newSheetId,
            addParents: cadastroId,
            fields: "id, parents",
          });

          spreadsheetsCreated++;
          console.log(`[Normalize] Planilha criada: "${sheetTitle}"`);
        }
      }
    } catch (err: any) {
      errors.push(`${folder.name}: ${err.message}`);
      console.error(`[Normalize] Erro em "${folder.name}":`, err.message);
    }
  }

  return { renamed, subfoldersCreated, spreadsheetsCreated, errors };
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
  return `${yy}.${m}.${d} RAS FAP ${cleanName} (${cleanTitle}).pdf`;
}

export async function uploadToFolderById(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<{ fileId: string; webViewLink: string }> {
  return uploadFileToDrive(folderId, fileName, mimeType, fileBuffer);
}

const NEW_HEADER_COLUMNS = [
  "CARIMBO DE DATA/HORA", "PONTUACAO", "NOME", "CPF", "DATA NASCIMENTO",
  "CELULAR", "CEP", "ENDERECO", "NUMERO", "COMPLEMENTO", "BAIRRO",
  "CIDADE", "ESTADO", "PAIS", "EMAIL", "INSTAGRAM", "COMO NOS CONHECEU ?"
];

const COLUMN_ALIASES: Record<string, string[]> = {
  "CARIMBO DE DATA/HORA": ["CARIMBO", "CARIMBO DE DATA/HORA", "TIMESTAMP", "DATA/HORA", "DATA HORA"],
  "PONTUACAO": ["PONTUACAO", "SCORE", "NOTA"],
  "NOME": ["NOME", "NOME COMPLETO", "NOME DO PACIENTE", "NOME DO CLIENTE"],
  "CPF": ["CPF", "CPF DO PACIENTE", "CPF DO CLIENTE"],
  "DATA NASCIMENTO": ["DATA NASCIMENTO", "DATA DE NASCIMENTO", "NASCIMENTO", "DT NASCIMENTO"],
  "CELULAR": ["CELULAR", "TELEFONE", "TELEFONE CELULAR", "TEL", "PHONE", "WHATSAPP"],
  "CEP": ["CEP"],
  "ENDERECO": ["ENDERECO", "ENDEREÇO", "LOGRADOURO", "RUA"],
  "NUMERO": ["NUMERO", "NÚMERO", "NUM", "Nº", "N"],
  "COMPLEMENTO": ["COMPLEMENTO", "COMPL"],
  "BAIRRO": ["BAIRRO"],
  "CIDADE": ["CIDADE", "MUNICIPIO"],
  "ESTADO": ["ESTADO", "UF"],
  "PAIS": ["PAIS", "PAÍS"],
  "EMAIL": ["EMAIL", "E-MAIL"],
  "INSTAGRAM": ["INSTAGRAM", "INSTA", "@"],
  "COMO NOS CONHECEU ?": ["COMO NOS CONHECEU ?", "COMO NOS CONHECEU", "COMO CONHECEU", "INDICACAO"],
};

function matchColumnToNew(oldHeader: string): string | null {
  const normalized = removeDiacritics(oldHeader).toUpperCase().trim();
  for (const [newCol, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === removeDiacritics(alias).toUpperCase()) return newCol;
    }
  }
  if (normalized.includes("NOME")) return "NOME";
  if (normalized.includes("CPF")) return "CPF";
  if (normalized.includes("NASC")) return "DATA NASCIMENTO";
  if (normalized.includes("CEL") || normalized.includes("PHONE") || normalized.includes("WHATS")) return "CELULAR";
  if (normalized.includes("MAIL")) return "EMAIL";
  if (normalized.includes("INSTA")) return "INSTAGRAM";
  if (normalized.includes("BAIRRO")) return "BAIRRO";
  if (normalized.includes("CIDADE") || normalized.includes("MUNIC")) return "CIDADE";
  if (normalized.includes("ESTADO") || normalized === "UF") return "ESTADO";
  if (normalized.includes("CEP")) return "CEP";
  if (normalized.includes("ENDER") || normalized.includes("LOGRA") || normalized.includes("RUA")) return "ENDERECO";
  if (normalized.includes("NUMER") || normalized === "NUM") return "NUMERO";
  if (normalized.includes("COMPL")) return "COMPLEMENTO";
  if (normalized.includes("PAIS")) return "PAIS";
  if (normalized.includes("CONHEC")) return "COMO NOS CONHECEU ?";
  return null;
}

export async function migrateExistingCadastros(): Promise<{
  migrated: number;
  skipped: number;
  alreadyNew: number;
  noData: number;
  errors: string[];
  details: Array<{ folder: string; status: string; fieldsRecovered?: string[] }>;
}> {
  const drive = await getUncachableDriveClient();
  const sheets = await getSheetsClient();
  const rootId = await findOrCreateFolder(drive, "CLIENTES");
  const allFolders = await findAllFolders(drive, rootId);

  let migrated = 0;
  let skipped = 0;
  let alreadyNew = 0;
  let noData = 0;
  const errors: string[] = [];
  const details: Array<{ folder: string; status: string; fieldsRecovered?: string[] }> = [];

  for (const folder of allFolders) {
    try {
      const existingSubs = await findAllFolders(drive, folder.id);
      const cadastroSub = existingSubs.find(s => s.name.toUpperCase() === "CADASTRO");
      if (!cadastroSub) {
        skipped++;
        continue;
      }

      const allSpreadsheets = await drive.files.list({
        q: `'${cadastroSub.id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
        fields: "files(id, name, createdTime)",
        orderBy: "createdTime desc",
      });

      const spreadsheetFiles = allSpreadsheets.data.files || [];
      if (spreadsheetFiles.length === 0) {
        noData++;
        details.push({ folder: folder.name, status: "SEM_PLANILHA" });
        continue;
      }

      if (spreadsheetFiles.length === 1) {
        const sheet = spreadsheetFiles[0];
        const data = await sheets.spreadsheets.values.get({
          spreadsheetId: sheet.id!,
          range: "A1:Z10",
        });
        const rows = data.data.values || [];
        if (rows.length < 2) {
          noData++;
          details.push({ folder: folder.name, status: "PLANILHA_VAZIA" });
          continue;
        }

        const headers = rows[0].map((h: string) => (h || "").toUpperCase().trim());
        const isNewLayout = headers.includes("CARIMBO DE DATA/HORA") && headers.includes("PONTUACAO") && headers.includes("PAIS");
        
        if (isNewLayout) {
          const dataRow = rows[1] || [];
          const hasData = dataRow.some((v: string, i: number) => i > 1 && v && v.trim() !== "");
          if (hasData) {
            alreadyNew++;
            details.push({ folder: folder.name, status: "JA_LAYOUT_NOVO_COM_DADOS" });
          } else {
            noData++;
            details.push({ folder: folder.name, status: "LAYOUT_NOVO_SEM_DADOS" });
          }
          continue;
        }

        const dataRow = rows[1] || [];
        const hasAnyData = dataRow.some((v: string) => v && v.trim() !== "");
        if (!hasAnyData) {
          noData++;
          details.push({ folder: folder.name, status: "PLANILHA_ANTIGA_VAZIA" });
          continue;
        }

        const columnMap: Record<string, number> = {};
        for (let i = 0; i < headers.length; i++) {
          const newCol = matchColumnToNew(headers[i]);
          if (newCol) columnMap[newCol] = i;
        }

        const recoveredValues: Record<string, string> = {};
        const fieldsRecovered: string[] = [];
        for (const col of NEW_HEADER_COLUMNS) {
          const idx = columnMap[col];
          if (idx !== undefined && dataRow[idx] && dataRow[idx].trim() !== "") {
            recoveredValues[col] = removeDiacritics(dataRow[idx].trim()).toUpperCase();
            fieldsRecovered.push(col);
          }
        }

        if (fieldsRecovered.length === 0) {
          noData++;
          details.push({ folder: folder.name, status: "NENHUM_CAMPO_MAPEAVEL" });
          continue;
        }

        const cpfFromName = extractCpfFromFolderName(folder.name);
        const nameWithoutCpf = folder.name.replace(/\s*CPF\s+\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/, "").trim();
        const formattedCpf = cpfFromName ? formatCpfDisplay(cpfFromName) : "";
        const sheetTitle = cpfFromName
          ? `CADASTRO - ${nameWithoutCpf} CPF ${formattedCpf}`
          : `CADASTRO - ${nameWithoutCpf}`;

        const clientFolderUrl = `https://drive.google.com/drive/folders/${folder.id}`;
        const subfolderMap: Record<string, string> = {};
        for (const s of existingSubs) {
          subfolderMap[s.name.toUpperCase()] = s.id;
        }

        const now = new Date();
        const carimbo = recoveredValues["CARIMBO DE DATA/HORA"] || `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;

        const newRow = NEW_HEADER_COLUMNS.map(col => {
          if (col === "CARIMBO DE DATA/HORA") return carimbo;
          if (col === "NOME") return recoveredValues["NOME"] || nameWithoutCpf;
          if (col === "CPF") return recoveredValues["CPF"] || formattedCpf;
          if (col === "PAIS") return recoveredValues["PAIS"] || "BRASIL";
          return recoveredValues[col] || "";
        });

        const metadataHeaders = [
          "NOME", "CPF", "URL PASTA", "ID PASTA", "ID CADASTRO", "ID PATOLOGIAS",
          "ID EXAMES", "ID AVALIACOES", "ID RECEITAS", "ID PROTOCOLOS", "ID FINANCEIRO",
          "ID CONTRATOS", "ID ATESTADOS", "ID LAUDOS", "ID TERMOS", "ID FOTO PERFIL",
          "ID IMAGENS", "ID PESQUISA", "ID OUVIDORIA"
        ];
        const metadataRow = [
          recoveredValues["NOME"] || nameWithoutCpf, formattedCpf, clientFolderUrl, folder.id,
          subfolderMap["CADASTRO"] || "", subfolderMap["PATOLOGIAS"] || "",
          subfolderMap["EXAMES"] || "", subfolderMap["AVALIACOES"] || "",
          subfolderMap["RECEITAS"] || "", subfolderMap["PROTOCOLOS"] || "",
          subfolderMap["FINANCEIRO"] || "", subfolderMap["CONTRATOS"] || "",
          subfolderMap["ATESTADOS"] || "", subfolderMap["LAUDOS"] || "",
          subfolderMap["TERMOS"] || "", subfolderMap["FOTO PERFIL"] || "",
          subfolderMap["IMAGENS"] || "", subfolderMap["PESQUISA"] || "",
          subfolderMap["OUVIDORIA"] || "",
        ];

        const spreadsheetRes = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title: sheetTitle },
            sheets: [
              {
                properties: { title: "CADASTRO", sheetId: 0, index: 0 },
                data: [{
                  startRow: 0, startColumn: 0,
                  rowData: [
                    { values: NEW_HEADER_COLUMNS.map(h => ({ userEnteredValue: { stringValue: h } })) },
                    { values: newRow.map(v => ({ userEnteredValue: { stringValue: v } })) },
                  ],
                }],
              },
              {
                properties: { title: "METADADOS", sheetId: 1, index: 1 },
                data: [{
                  startRow: 0, startColumn: 0,
                  rowData: [
                    { values: metadataHeaders.map(h => ({ userEnteredValue: { stringValue: h } })) },
                    { values: metadataRow.map(v => ({ userEnteredValue: { stringValue: v } })) },
                  ],
                }],
              },
            ],
          },
        });

        const newSheetId = spreadsheetRes.data.spreadsheetId!;

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: newSheetId,
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
              { autoResizeDimensions: { dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 17 } } },
              { autoResizeDimensions: { dimensions: { sheetId: 1, dimension: "COLUMNS", startIndex: 0, endIndex: 19 } } },
            ],
          },
        });

        await drive.files.update({
          fileId: newSheetId,
          addParents: cadastroSub.id,
          fields: "id, parents",
        });

        const cadastrosAntigosId = await findOrCreateFolder(drive, "CADASTROS ANTIGOS", cadastroSub.id);
        const oldName = sheet.name || "CADASTRO_ANTIGO";
        await drive.files.update({
          fileId: sheet.id!,
          requestBody: { name: `[ANTIGO] ${oldName}` },
          addParents: cadastrosAntigosId,
          removeParents: cadastroSub.id,
          fields: "id, parents",
        });

        migrated++;
        details.push({ folder: folder.name, status: "MIGRADO", fieldsRecovered });
        console.log(`[Migrate] ${folder.name}: migrado com ${fieldsRecovered.length} campos (${fieldsRecovered.join(", ")})`);

      } else {
        let oldSheet: { id: string; name: string } | null = null;
        let oldData: string[][] | null = null;

        for (const sf of spreadsheetFiles) {
          const data = await sheets.spreadsheets.values.get({
            spreadsheetId: sf.id!,
            range: "A1:Z10",
          });
          const rows = data.data.values || [];
          if (rows.length >= 2) {
            const headers = rows[0].map((h: string) => (h || "").toUpperCase().trim());
            const isNewLayout = headers.includes("CARIMBO DE DATA/HORA") && headers.includes("PONTUACAO") && headers.includes("PAIS");
            if (!isNewLayout) {
              const dataRow = rows[1] || [];
              const hasData = dataRow.some((v: string) => v && v.trim() !== "");
              if (hasData) {
                oldSheet = { id: sf.id!, name: sf.name || "" };
                oldData = rows;
                break;
              }
            }
          }
        }

        if (!oldSheet || !oldData) {
          skipped++;
          details.push({ folder: folder.name, status: "MULTIPLAS_PLANILHAS_SEM_DADOS_ANTIGOS" });
          continue;
        }

        const headers = oldData[0].map((h: string) => (h || "").toUpperCase().trim());
        const dataRow = oldData[1] || [];

        const columnMap: Record<string, number> = {};
        for (let i = 0; i < headers.length; i++) {
          const newCol = matchColumnToNew(headers[i]);
          if (newCol) columnMap[newCol] = i;
        }

        const recoveredValues: Record<string, string> = {};
        const fieldsRecovered: string[] = [];
        for (const col of NEW_HEADER_COLUMNS) {
          const idx = columnMap[col];
          if (idx !== undefined && dataRow[idx] && dataRow[idx].trim() !== "") {
            recoveredValues[col] = removeDiacritics(dataRow[idx].trim()).toUpperCase();
            fieldsRecovered.push(col);
          }
        }

        let newLayoutSheet: { id: string } | null = null;
        for (const sf of spreadsheetFiles) {
          if (sf.id === oldSheet.id) continue;
          const data = await sheets.spreadsheets.values.get({
            spreadsheetId: sf.id!,
            range: "A1:Z2",
          });
          const rows = data.data.values || [];
          if (rows.length >= 1) {
            const hdrs = rows[0].map((h: string) => (h || "").toUpperCase().trim());
            if (hdrs.includes("CARIMBO DE DATA/HORA") && hdrs.includes("PONTUACAO")) {
              newLayoutSheet = { id: sf.id! };
              break;
            }
          }
        }

        if (newLayoutSheet && fieldsRecovered.length > 0) {
          const now = new Date();
          const carimbo = recoveredValues["CARIMBO DE DATA/HORA"] || `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;
          const cpfFromName = extractCpfFromFolderName(folder.name);
          const nameWithoutCpf = folder.name.replace(/\s*CPF\s+\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/, "").trim();
          const formattedCpf = cpfFromName ? formatCpfDisplay(cpfFromName) : "";

          const newRow = NEW_HEADER_COLUMNS.map(col => {
            if (col === "CARIMBO DE DATA/HORA") return carimbo;
            if (col === "NOME") return recoveredValues["NOME"] || nameWithoutCpf;
            if (col === "CPF") return recoveredValues["CPF"] || formattedCpf;
            if (col === "PAIS") return recoveredValues["PAIS"] || "BRASIL";
            return recoveredValues[col] || "";
          });

          await sheets.spreadsheets.values.update({
            spreadsheetId: newLayoutSheet.id,
            range: "CADASTRO!A2:Q2",
            valueInputOption: "RAW",
            requestBody: { values: [newRow] },
          });

          const cadastrosAntigosId = await findOrCreateFolder(drive, "CADASTROS ANTIGOS", cadastroSub.id);
          await drive.files.update({
            fileId: oldSheet.id,
            requestBody: { name: `[ANTIGO] ${oldSheet.name}` },
            addParents: cadastrosAntigosId,
            removeParents: cadastroSub.id,
            fields: "id, parents",
          });

          migrated++;
          details.push({ folder: folder.name, status: "MIGRADO_MULTI", fieldsRecovered });
          console.log(`[Migrate] ${folder.name}: migrado (multi) com ${fieldsRecovered.length} campos`);
        } else if (fieldsRecovered.length > 0) {
          const cpfFromName = extractCpfFromFolderName(folder.name);
          const nameWithoutCpf = folder.name.replace(/\s*CPF\s+\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/, "").trim();
          const formattedCpf = cpfFromName ? formatCpfDisplay(cpfFromName) : "";
          const sheetTitle = cpfFromName
            ? `CADASTRO - ${nameWithoutCpf} CPF ${formattedCpf}`
            : `CADASTRO - ${nameWithoutCpf}`;

          const clientFolderUrl = `https://drive.google.com/drive/folders/${folder.id}`;
          const subfolderMap: Record<string, string> = {};
          for (const s of existingSubs) { subfolderMap[s.name.toUpperCase()] = s.id; }

          const now = new Date();
          const carimbo = recoveredValues["CARIMBO DE DATA/HORA"] || `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}`;
          const newRow = NEW_HEADER_COLUMNS.map(col => {
            if (col === "CARIMBO DE DATA/HORA") return carimbo;
            if (col === "NOME") return recoveredValues["NOME"] || nameWithoutCpf;
            if (col === "CPF") return recoveredValues["CPF"] || formattedCpf;
            if (col === "PAIS") return recoveredValues["PAIS"] || "BRASIL";
            return recoveredValues[col] || "";
          });

          const metadataHeaders = [
            "NOME", "CPF", "URL PASTA", "ID PASTA", "ID CADASTRO", "ID PATOLOGIAS",
            "ID EXAMES", "ID AVALIACOES", "ID RECEITAS", "ID PROTOCOLOS", "ID FINANCEIRO",
            "ID CONTRATOS", "ID ATESTADOS", "ID LAUDOS", "ID TERMOS", "ID FOTO PERFIL",
            "ID IMAGENS", "ID PESQUISA", "ID OUVIDORIA"
          ];
          const metadataRow = [
            recoveredValues["NOME"] || nameWithoutCpf, formattedCpf, clientFolderUrl, folder.id,
            subfolderMap["CADASTRO"] || "", subfolderMap["PATOLOGIAS"] || "",
            subfolderMap["EXAMES"] || "", subfolderMap["AVALIACOES"] || "",
            subfolderMap["RECEITAS"] || "", subfolderMap["PROTOCOLOS"] || "",
            subfolderMap["FINANCEIRO"] || "", subfolderMap["CONTRATOS"] || "",
            subfolderMap["ATESTADOS"] || "", subfolderMap["LAUDOS"] || "",
            subfolderMap["TERMOS"] || "", subfolderMap["FOTO PERFIL"] || "",
            subfolderMap["IMAGENS"] || "", subfolderMap["PESQUISA"] || "",
            subfolderMap["OUVIDORIA"] || "",
          ];

          const spreadsheetRes = await sheets.spreadsheets.create({
            requestBody: {
              properties: { title: sheetTitle },
              sheets: [
                {
                  properties: { title: "CADASTRO", sheetId: 0, index: 0 },
                  data: [{
                    startRow: 0, startColumn: 0,
                    rowData: [
                      { values: NEW_HEADER_COLUMNS.map(h => ({ userEnteredValue: { stringValue: h } })) },
                      { values: newRow.map(v => ({ userEnteredValue: { stringValue: v } })) },
                    ],
                  }],
                },
                {
                  properties: { title: "METADADOS", sheetId: 1, index: 1 },
                  data: [{
                    startRow: 0, startColumn: 0,
                    rowData: [
                      { values: metadataHeaders.map(h => ({ userEnteredValue: { stringValue: h } })) },
                      { values: metadataRow.map(v => ({ userEnteredValue: { stringValue: v } })) },
                    ],
                  }],
                },
              ],
            },
          });

          const newSheetId = spreadsheetRes.data.spreadsheetId!;
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: newSheetId,
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
                { autoResizeDimensions: { dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 17 } } },
                { autoResizeDimensions: { dimensions: { sheetId: 1, dimension: "COLUMNS", startIndex: 0, endIndex: 19 } } },
              ],
            },
          });

          await drive.files.update({
            fileId: newSheetId,
            addParents: cadastroSub.id,
            fields: "id, parents",
          });

          const cadastrosAntigosId = await findOrCreateFolder(drive, "CADASTROS ANTIGOS", cadastroSub.id);
          await drive.files.update({
            fileId: oldSheet.id,
            requestBody: { name: `[ANTIGO] ${oldSheet.name}` },
            addParents: cadastrosAntigosId,
            removeParents: cadastroSub.id,
            fields: "id, parents",
          });

          migrated++;
          details.push({ folder: folder.name, status: "MIGRADO_CRIADO_NOVO", fieldsRecovered });
          console.log(`[Migrate] ${folder.name}: criado novo + migrado com ${fieldsRecovered.length} campos`);
        } else {
          skipped++;
          details.push({ folder: folder.name, status: "MULTIPLAS_SEM_DADOS_MAPEAVEIS" });
        }
      }
    } catch (err: any) {
      errors.push(`${folder.name}: ${err.message}`);
      console.error(`[Migrate] Erro em "${folder.name}":`, err.message);
    }
  }

  console.log(`[Drive] Migracao concluida: ${migrated} migrados, ${alreadyNew} ja no layout novo, ${noData} sem dados, ${skipped} ignorados, ${errors.length} erros`);
  return { migrated, skipped, alreadyNew, noData, errors, details };
}
