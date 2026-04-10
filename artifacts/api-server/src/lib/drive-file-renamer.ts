import { google } from "googleapis";
import { Readable } from "stream";

function getOAuth2Client() {
  return getAccessTokenInternal().then(accessToken => {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return oauth2Client;
  });
}

let _connSettings: any;

async function getAccessTokenInternal(): Promise<string> {
  if (_connSettings?.settings?.expires_at && new Date(_connSettings.settings.expires_at).getTime() > Date.now()) {
    const t = _connSettings?.settings?.access_token || _connSettings?.settings?.oauth?.credentials?.access_token;
    if (t) return t;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken) throw new Error("X-Replit-Token not found");

  _connSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-drive",
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  ).then(r => r.json()).then(d => d.items?.[0]);

  const token = _connSettings?.settings?.access_token || _connSettings?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new Error("Google Drive not connected");
  return token;
}

function removeDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const EXAM_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /hemogl|hemograma/i, label: "HEMOGRAMA" },
  { pattern: /bioqu[ií]mica|bioquimi/i, label: "BIOQUIMICA" },
  { pattern: /colesterol|lipidograma|triglicerid/i, label: "PERFIL LIPIDICO" },
  { pattern: /glicemia|glicose|hba1c|hemoglobina glicada/i, label: "GLICEMIA" },
  { pattern: /tsh|t3|t4|tireoide|tireoid/i, label: "TIREOIDE" },
  { pattern: /hepatite|hbsag|anti.?hcv/i, label: "SOROLOGIA HEPATITE" },
  { pattern: /hiv|anti.?hiv/i, label: "SOROLOGIA HIV" },
  { pattern: /vdrl|sifilis/i, label: "SOROLOGIA SIFILIS" },
  { pattern: /urina|eas|elementos anormais/i, label: "URINA" },
  { pattern: /proteinuria|proteina.*urina/i, label: "PROTEINURIA" },
  { pattern: /creatinina|ureia|funcao renal/i, label: "FUNCAO RENAL" },
  { pattern: /tgo|tgp|transaminase|funcao hepatica|hepatica/i, label: "FUNCAO HEPATICA" },
  { pattern: /coagulograma|tp\b|inr\b|ttpa|coagula/i, label: "COAGULOGRAMA" },
  { pattern: /ferro|ferritina|transferrina/i, label: "PERFIL FERRO" },
  { pattern: /vitamina\s*d|25.?oh/i, label: "VITAMINA D" },
  { pattern: /vitamina\s*b12|cianocobalamina/i, label: "VITAMINA B12" },
  { pattern: /psa|prostata/i, label: "PSA" },
  { pattern: /eletrocardiograma|ecg|ekg/i, label: "ECG" },
  { pattern: /eletroencefalograma|eeg/i, label: "EEG" },
  { pattern: /densitometria|dexa|dmo/i, label: "DENSITOMETRIA" },
  { pattern: /mamografia|mamogra/i, label: "MAMOGRAFIA" },
  { pattern: /papanicolau|citolog.*cervic/i, label: "PAPANICOLAU" },
];

const IMAGING_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ultra.?som|ultrassonograf|usg\b|us\b/i, label: "USG" },
  { pattern: /resson[aâ]ncia|rmn?\b|rm\b/i, label: "RMN" },
  { pattern: /tomografia|tc\b|ct\b/i, label: "TC" },
  { pattern: /raio.?x|rx\b|radiograf/i, label: "RX" },
  { pattern: /cintilografia/i, label: "CINTILOGRAFIA" },
  { pattern: /endoscopia|eda\b/i, label: "ENDOSCOPIA" },
  { pattern: /colonoscopia/i, label: "COLONOSCOPIA" },
  { pattern: /ecocardiograma|eco.*cardio/i, label: "ECOCARDIOGRAMA" },
];

const BODY_PARTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ombro\s*(d|dir|direito)/i, label: "OMBRO D" },
  { pattern: /ombro\s*(e|esq|esquerdo)/i, label: "OMBRO E" },
  { pattern: /ombro/i, label: "OMBRO" },
  { pattern: /joelho\s*(d|dir|direito)/i, label: "JOELHO D" },
  { pattern: /joelho\s*(e|esq|esquerdo)/i, label: "JOELHO E" },
  { pattern: /joelho/i, label: "JOELHO" },
  { pattern: /coluna\s*(lombar|lombossacra)/i, label: "COLUNA LOMBAR" },
  { pattern: /coluna\s*(cervical)/i, label: "COLUNA CERVICAL" },
  { pattern: /coluna\s*(toracica|dorsal)/i, label: "COLUNA TORACICA" },
  { pattern: /coluna/i, label: "COLUNA" },
  { pattern: /quadril|coxofemoral/i, label: "QUADRIL" },
  { pattern: /punho\s*(d|dir|direito)/i, label: "PUNHO D" },
  { pattern: /punho\s*(e|esq|esquerdo)/i, label: "PUNHO E" },
  { pattern: /punho/i, label: "PUNHO" },
  { pattern: /tornozelo\s*(d|dir|direito)/i, label: "TORNOZELO D" },
  { pattern: /tornozelo\s*(e|esq|esquerdo)/i, label: "TORNOZELO E" },
  { pattern: /tornozelo/i, label: "TORNOZELO" },
  { pattern: /mao\s*(d|dir|direita)/i, label: "MAO D" },
  { pattern: /mao\s*(e|esq|esquerda)/i, label: "MAO E" },
  { pattern: /mao|maos/i, label: "MAO" },
  { pattern: /pe\s*(d|dir|direito)/i, label: "PE D" },
  { pattern: /pe\s*(e|esq|esquerdo)/i, label: "PE E" },
  { pattern: /cranio|cerebr|encefal/i, label: "CRANIO" },
  { pattern: /abdome|abdomin/i, label: "ABDOME" },
  { pattern: /torax|pulmao|pulmon/i, label: "TORAX" },
  { pattern: /pelve|pelvi/i, label: "PELVE" },
  { pattern: /mama|mamas/i, label: "MAMAS" },
  { pattern: /tireoide/i, label: "TIREOIDE" },
  { pattern: /rim|renal|rins/i, label: "RINS" },
  { pattern: /figado|hepatic/i, label: "FIGADO" },
  { pattern: /baco|esplenic/i, label: "BACO" },
  { pattern: /pancreas/i, label: "PANCREAS" },
  { pattern: /vesicula|biliar/i, label: "VESICULA" },
  { pattern: /prostata/i, label: "PROSTATA" },
  { pattern: /utero|uterino/i, label: "UTERO" },
  { pattern: /face|facial/i, label: "FACE" },
  { pattern: /seios.*face|seio.*paranasal|sinusal/i, label: "SEIOS DA FACE" },
];

const PROTOCOL_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /botox|toxina\s*botul/i, label: "TOXINA BOTULINICA" },
  { pattern: /acido\s*hialur|preench/i, label: "PREENCHIMENTO AH" },
  { pattern: /bioestimulador|bioestimul/i, label: "BIOESTIMULADOR" },
  { pattern: /sculptra|plla/i, label: "SCULPTRA" },
  { pattern: /radiesse|hidroxiapatita/i, label: "RADIESSE" },
  { pattern: /fio\s*(pdo|sustenta|lifting)/i, label: "FIOS PDO" },
  { pattern: /peeling/i, label: "PEELING" },
  { pattern: /laser|ipl/i, label: "LASER" },
  { pattern: /microagulh/i, label: "MICROAGULHAMENTO" },
  { pattern: /skinbooster|skin\s*booster/i, label: "SKINBOOSTER" },
  { pattern: /mesoterapia|mesoterap/i, label: "MESOTERAPIA" },
  { pattern: /intradermoterapia/i, label: "INTRADERMOTERAPIA" },
  { pattern: /enzima|lipoenzimat/i, label: "LIPOENZIMAS" },
  { pattern: /harmoniza.*facial|hof/i, label: "HOF" },
  { pattern: /anti.?aging|rejuven/i, label: "ANTI-AGING" },
  { pattern: /capilar|cabelo|tricolog/i, label: "CAPILAR" },
  { pattern: /corporal|corpo|gordura/i, label: "CORPORAL" },
  { pattern: /gluteo|nadeg/i, label: "GLUTEO" },
];

function classifyExamFromText(text: string, fileName: string): { type: string; bodyPart?: string } {
  const combined = removeDiacritics(`${fileName} ${text}`).toUpperCase();

  for (const img of IMAGING_KEYWORDS) {
    if (img.pattern.test(combined)) {
      let bodyPart: string | undefined;
      for (const bp of BODY_PARTS) {
        if (bp.pattern.test(combined)) {
          bodyPart = bp.label;
          break;
        }
      }
      return { type: img.label, bodyPart };
    }
  }

  for (const exam of EXAM_KEYWORDS) {
    if (exam.pattern.test(combined)) {
      return { type: exam.label };
    }
  }

  if (/sangue|laborat|lab\b/i.test(combined)) {
    return { type: "EXAME LABORATORIAL" };
  }

  return { type: "EXAME" };
}

function classifyProtocolFromText(text: string, fileName: string): string {
  const combined = removeDiacritics(`${fileName} ${text}`).toUpperCase();

  for (const p of PROTOCOL_KEYWORDS) {
    if (p.pattern.test(combined)) {
      return p.label;
    }
  }

  return "PROTOCOLO";
}

function extractClientNameFromFolder(folderName: string): string {
  return folderName
    .replace(/\s*CPF\s+\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/, "")
    .replace(/\s*CPF\s+\d{11}\s*$/, "")
    .trim();
}

function formatDateReverse(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

async function extractPdfText(drive: any, fileId: string): Promise<string> {
  try {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  } catch {
    return "";
  }
}

interface RenameResult {
  clientFolder: string;
  subfolder: string;
  from: string;
  to: string;
}

interface RenameReport {
  totalRenamed: number;
  results: RenameResult[];
  errors: string[];
  skipped: number;
}

export async function renameAllClientFiles(): Promise<RenameReport> {
  const auth = await getOAuth2Client();
  const drive = google.drive({ version: "v3", auth });

  const rootQ = `mimeType='application/vnd.google-apps.folder' and name='CLIENTES' and trashed=false`;
  const rootRes = await drive.files.list({ q: rootQ, fields: "files(id)", spaces: "drive" });
  const rootId = rootRes.data.files?.[0]?.id;
  if (!rootId) throw new Error("Pasta CLIENTES nao encontrada");

  const clientFolders = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 1000,
  });

  const results: RenameResult[] = [];
  const errors: string[] = [];
  let skipped = 0;

  const subfolderTargets = ["EXAMES", "PROTOCOLOS", "RECEITAS", "ATESTADOS", "LAUDOS", "CONTRATOS"];

  for (const clientFolder of (clientFolders.data.files || [])) {
    const clientName = extractClientNameFromFolder(clientFolder.name!);

    try {
      const subFolders = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and '${clientFolder.id}' in parents and trashed=false`,
        fields: "files(id, name)",
        spaces: "drive",
        pageSize: 100,
      });

      for (const sub of (subFolders.data.files || [])) {
        const subName = sub.name!.toUpperCase();
        if (!subfolderTargets.includes(subName)) continue;

        const files = await drive.files.list({
          q: `'${sub.id}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
          fields: "files(id, name, mimeType, createdTime, modifiedTime)",
          spaces: "drive",
          pageSize: 500,
        });

        for (const file of (files.data.files || [])) {
          try {
            const fileName = file.name || "";
            const fileDate = file.createdTime || file.modifiedTime || "";
            const datePrefix = formatDateReverse(fileDate);
            const ext = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
            const cleanClientName = removeDiacritics(clientName).toUpperCase();

            let newName = "";

            if (subName === "EXAMES") {
              let textContent = "";
              if (file.mimeType === "application/pdf") {
                textContent = await extractPdfText(drive, file.id!);
              }
              const classification = classifyExamFromText(textContent, fileName);
              const examLabel = classification.bodyPart
                ? `${classification.type} ${classification.bodyPart}`
                : classification.type;
              newName = datePrefix
                ? `${datePrefix} ${examLabel} ${cleanClientName}${ext}`
                : `${examLabel} ${cleanClientName}${ext}`;
            } else if (subName === "PROTOCOLOS") {
              let textContent = "";
              if (file.mimeType === "application/pdf") {
                textContent = await extractPdfText(drive, file.id!);
              }
              const protoLabel = classifyProtocolFromText(textContent, fileName);
              newName = datePrefix
                ? `${datePrefix} ${protoLabel} ${cleanClientName}${ext}`
                : `${protoLabel} ${cleanClientName}${ext}`;
            } else if (subName === "RECEITAS") {
              newName = datePrefix
                ? `${datePrefix} RECEITA ${cleanClientName}${ext}`
                : `RECEITA ${cleanClientName}${ext}`;
            } else if (subName === "ATESTADOS") {
              newName = datePrefix
                ? `${datePrefix} ATESTADO ${cleanClientName}${ext}`
                : `ATESTADO ${cleanClientName}${ext}`;
            } else if (subName === "LAUDOS") {
              newName = datePrefix
                ? `${datePrefix} LAUDO ${cleanClientName}${ext}`
                : `LAUDO ${cleanClientName}${ext}`;
            } else if (subName === "CONTRATOS") {
              newName = datePrefix
                ? `${datePrefix} CONTRATO ${cleanClientName}${ext}`
                : `CONTRATO ${cleanClientName}${ext}`;
            }

            if (newName && newName !== fileName) {
              await drive.files.update({
                fileId: file.id!,
                requestBody: { name: newName },
              });
              results.push({
                clientFolder: clientFolder.name!,
                subfolder: subName,
                from: fileName,
                to: newName,
              });
              console.log(`[Renamer] ${clientFolder.name}/${subName}: "${fileName}" -> "${newName}"`);
            } else {
              skipped++;
            }
          } catch (err: any) {
            errors.push(`${clientFolder.name}/${sub.name}/${file.name}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`${clientFolder.name}: ${err.message}`);
    }
  }

  return { totalRenamed: results.length, results, errors, skipped };
}
