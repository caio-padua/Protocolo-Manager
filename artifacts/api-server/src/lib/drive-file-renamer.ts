import { google } from "googleapis";
import { Readable } from "stream";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, readdirSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";

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

const LAB_EXAM_PATTERNS: RegExp[] = [
  /hemogl|hemograma/i,
  /bioqu[ií]mica|bioquimi/i,
  /colesterol|lipidograma|triglicerid/i,
  /glicemia|glicose|hba1c|hemoglobina glicada/i,
  /hepatite|hbsag|anti.?hcv/i,
  /hiv|anti.?hiv/i,
  /vdrl|sifilis/i,
  /urina|eas|elementos anormais/i,
  /proteinuria|proteina.*urina/i,
  /creatinina|ureia|funcao renal/i,
  /tgo|tgp|transaminase|funcao hepatica|hepatica/i,
  /coagulograma|tp\b|inr\b|ttpa|coagula/i,
  /ferro|ferritina|transferrina/i,
  /vitamina\s*d|25.?oh/i,
  /vitamina\s*b12|cianocobalamina/i,
  /psa|prostata/i,
  /testosterona|estradiol|progesterona|fsh\b|lh\b|prolactina|hormon/i,
  /tsh|t3\b|t4\b/i,
  /acido\s*urico/i,
  /pcr|vhs|proteina.*reativa/i,
  /calcio|magnesio|fosforo|potassio|sodio|eletrolit/i,
  /albumina|proteinas?\s*totais/i,
  /bilirrubina/i,
  /amilase|lipase/i,
  /leucograma|plaqueta/i,
  /sangue|laborat|lab\b|resultado.*exame/i,
];

const COMPLEX_EXAM_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /eletrocardiograma|ecg\b|ekg\b/i, label: "ECG" },
  { pattern: /eletroencefalograma|eeg\b/i, label: "EEG" },
  { pattern: /densitometria|dexa\b|dmo\b/i, label: "DENSITOMETRIA" },
  { pattern: /mamografia|mamogra/i, label: "MAMOGRAFIA" },
  { pattern: /papanicolau|citolog.*cervic/i, label: "PAPANICOLAU" },
  { pattern: /arteriografia|angiografia/i, label: "ANGIOGRAFIA" },
  { pattern: /holter/i, label: "HOLTER" },
  { pattern: /mapa\b.*press|monit.*ambulat.*press/i, label: "MAPA" },
  { pattern: /espirometria|prova.*func.*pulm/i, label: "ESPIROMETRIA" },
  { pattern: /audiometria/i, label: "AUDIOMETRIA" },
  { pattern: /polissonografia/i, label: "POLISSONOGRAFIA" },
  { pattern: /biopsia|anatomopatol|histopatol/i, label: "BIOPSIA" },
  { pattern: /cintilografia/i, label: "CINTILOGRAFIA" },
  { pattern: /ergometri|teste.*esforco/i, label: "TESTE ERGOMETRICO" },
];

const IMAGING_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ultra.?som|ultrassonograf|usg\b/i, label: "USG" },
  { pattern: /angioresson[aâ]ncia|angio.?rm/i, label: "ANGIORESSONANCIA" },
  { pattern: /resson[aâ]ncia\s*magn|rmn\b/i, label: "RMN" },
  { pattern: /tomografia|tc\b|ct\b/i, label: "TC" },
  { pattern: /raio.?x|rx\b|radiograf/i, label: "RX" },
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
  { pattern: /\bmao\s+(direita|dir)\b/i, label: "MAO D" },
  { pattern: /\bmao\s+(esquerda|esq)\b/i, label: "MAO E" },
  { pattern: /\bmaos?\b/i, label: "MAO" },
  { pattern: /\bpe\s+(direito|dir)\b/i, label: "PE D" },
  { pattern: /\bpe\s+(esquerdo|esq)\b/i, label: "PE E" },
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

function findBodyPart(text: string): string | undefined {
  for (const bp of BODY_PARTS) {
    if (bp.pattern.test(text)) return bp.label;
  }
  return undefined;
}

function classifyExamFromText(text: string, fileName: string): { type: string; bodyPart?: string } {
  const combined = removeDiacritics(`${fileName} ${text}`).toUpperCase();

  for (const complex of COMPLEX_EXAM_KEYWORDS) {
    if (complex.pattern.test(combined)) {
      return { type: complex.label, bodyPart: findBodyPart(combined) };
    }
  }

  for (const img of IMAGING_KEYWORDS) {
    if (img.pattern.test(combined)) {
      return { type: img.label, bodyPart: findBodyPart(combined) };
    }
  }

  for (const labPattern of LAB_EXAM_PATTERNS) {
    if (labPattern.test(combined)) {
      return { type: "EXAME" };
    }
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

// Extrai a data do EXAME a partir do texto do PDF (DD/MM/YYYY ou DD-MM-YYYY).
// Prioriza palavras-contexto clínicas ("coleta", "data do exame", "realizado",
// "emissao", "data"). Cai no fallback (primeira data encontrada) se não achar.
// Retorna YY.MM.DD ou string vazia.
function extractExamDateFromText(text: string): string {
  if (!text) return "";

  // Padrões com contexto (ordem de prioridade)
  const contextPatterns: RegExp[] = [
    /data\s+da\s+coleta\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    /data\s+do\s+exame\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    /data\s+de\s+coleta\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    /realizado\s+em\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    /data\s+de\s+emiss[aã]o\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    /emiss[aã]o\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    /data\s+de\s+realiza[cç][aã]o\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    /coleta\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
    /data\s*:?\s*(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/i,
  ];

  for (const pattern of contextPatterns) {
    const m = text.match(pattern);
    if (m) {
      const dd = m[1].padStart(2, "0");
      const mm = m[2].padStart(2, "0");
      const yyyy = m[3];
      const d = new Date(`${yyyy}-${mm}-${dd}`);
      if (!isNaN(d.getTime())) {
        const yy = yyyy.slice(-2);
        return `${yy}.${mm}.${dd}`;
      }
    }
  }

  // Fallback: primeira data no formato DD/MM/YYYY encontrada no texto
  const fallback = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (fallback) {
    const dd = fallback[1].padStart(2, "0");
    const mm = fallback[2].padStart(2, "0");
    const yyyy = fallback[3];
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    if (!isNaN(d.getTime())) {
      return `${yyyy.slice(-2)}.${mm}.${dd}`;
    }
  }

  return "";
}

const TMP_DIR = "/tmp/pdf-ocr";

let _ocrWorker: any = null;

async function getOcrWorker(): Promise<any> {
  if (_ocrWorker) return _ocrWorker;
  const Tesseract = await import("tesseract.js");

  const possiblePaths = [
    join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
    join(process.cwd(), "../../node_modules/tesseract.js/src/worker-script/node/index.js"),
  ];
  let workerPath = "";
  for (const p of possiblePaths) {
    if (existsSync(p)) { workerPath = p; break; }
  }
  
  const opts: any = {};
  if (workerPath) {
    opts.workerPath = workerPath;
    console.log(`[OCR] Worker encontrado: ${workerPath}`);
  }

  _ocrWorker = await Tesseract.createWorker("por", undefined, opts);
  return _ocrWorker;
}

async function ocrFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

    const ts = Date.now();
    const pdfPath = join(TMP_DIR, `input_${ts}.pdf`);
    writeFileSync(pdfPath, buffer);

    try {
      execSync(`pdftoppm -png -r 200 -f 1 -l 1 "${pdfPath}" "${join(TMP_DIR, `page_${ts}`)}"`, { timeout: 15000 });
    } catch {
      unlinkSync(pdfPath);
      return "";
    }

    const pngFiles = readdirSync(TMP_DIR).filter(f => f.startsWith(`page_${ts}`) && f.endsWith(".png"));
    if (pngFiles.length === 0) {
      unlinkSync(pdfPath);
      return "";
    }

    const imgPath = join(TMP_DIR, pngFiles[0]);
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(imgPath);

    unlinkSync(pdfPath);
    for (const f of pngFiles) {
      try { unlinkSync(join(TMP_DIR, f)); } catch {}
    }

    return data.text || "";
  } catch (err) {
    console.error("[OCR] Erro:", (err as Error).message);
    return "";
  }
}

async function extractPdfText(drive: any, fileId: string): Promise<string> {
  let buffer: Buffer;
  try {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    buffer = Buffer.from(res.data as ArrayBuffer);
  } catch (err) {
    console.error(`[Extract] Erro ao baixar fileId=${fileId}:`, (err as Error).message);
    return "";
  }

  let text = "";
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = (typeof result === "string" ? result : result?.text || "").trim();
  } catch (err) {
    console.log(`[Extract] pdf-parse falhou para fileId=${fileId}: ${(err as Error).message?.slice(0, 100)}`);
  }

  if (text.length > 20) {
    return text;
  }

  console.log(`[OCR] Texto insuficiente (${text.length} chars), tentando OCR para fileId=${fileId}...`);
  try {
    const ocrText = await ocrFromPdfBuffer(buffer);
    if (ocrText.trim().length > 10) {
      console.log(`[OCR] Sucesso! Extraidos ${ocrText.trim().length} chars via OCR`);
      return ocrText;
    }
  } catch (err) {
    console.error(`[OCR] Falha para fileId=${fileId}:`, (err as Error).message);
  }

  return text || "";
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

export async function diagnosePdfContent(maxFiles: number = 5): Promise<Array<{
  client: string;
  subfolder: string;
  fileName: string;
  extractedText: string;
  classification: { type: string; bodyPart?: string };
}>> {
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

  const results: Array<{ client: string; subfolder: string; fileName: string; extractedText: string; classification: { type: string; bodyPart?: string } }> = [];

  for (const clientFolder of (clientFolders.data.files || [])) {
    if (results.length >= maxFiles) break;
    const subFolders = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and '${clientFolder.id}' in parents and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    for (const sub of (subFolders.data.files || [])) {
      if (results.length >= maxFiles) break;
      if (sub.name!.toUpperCase() !== "EXAMES") continue;

      const files = await drive.files.list({
        q: `'${sub.id}' in parents and trashed=false and mimeType='application/pdf'`,
        fields: "files(id, name)",
        spaces: "drive",
        pageSize: 3,
      });

      for (const file of (files.data.files || [])) {
        if (results.length >= maxFiles) break;
        const text = await extractPdfText(drive, file.id!);
        const classification = classifyExamFromText(text, file.name || "");
        results.push({
          client: clientFolder.name!,
          subfolder: sub.name!,
          fileName: file.name || "",
          extractedText: text.slice(0, 1500),
          classification,
        });
        console.log(`[Diagnose] ${clientFolder.name}/${file.name}: tipo=${classification.type}, texto=${text.slice(0, 200).replace(/\n/g, " ")}`);
      }
    }
  }

  return results;
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
            const knownExts = /\.(pdf|jpg|jpeg|png|gif|bmp|tiff|tif|webp|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|odt|ods|heic|mp4|mov)$/i;
            const extMatch = fileName.match(knownExts);
            const ext = extMatch ? extMatch[0].toLowerCase() : "";
            const cleanClientName = removeDiacritics(clientName).toUpperCase();

            let newName = "";

            if (subName === "EXAMES") {
              // Para EXAMES: extrai o texto do PDF e tenta obter a data do próprio exame.
              // Só usa createdTime como último recurso (CEO: data = data do exame, não de upload).
              let textContent = "";
              if (file.mimeType === "application/pdf") {
                textContent = await extractPdfText(drive, file.id!);
              }
              // Tenta extrair data do texto; cai no createdTime se não encontrar
              const examDateFromText = extractExamDateFromText(textContent);
              const fallbackDate = file.createdTime || file.modifiedTime || "";
              const datePrefix = examDateFromText || formatDateReverse(fallbackDate);

              const classification = classifyExamFromText(textContent, fileName);
              const examLabel = classification.bodyPart && !classification.type.includes(classification.bodyPart)
                ? `${classification.type} ${classification.bodyPart}`
                : classification.type;
              newName = datePrefix
                ? `${datePrefix} ${examLabel} ${cleanClientName}${ext}`
                : `${examLabel} ${cleanClientName}${ext}`;
            } else if (subName === "PROTOCOLOS") {
              const fileDate = file.createdTime || file.modifiedTime || "";
              const datePrefix = formatDateReverse(fileDate);
              let textContent = "";
              if (file.mimeType === "application/pdf") {
                textContent = await extractPdfText(drive, file.id!);
              }
              const protoLabel = classifyProtocolFromText(textContent, fileName);
              newName = datePrefix
                ? `${datePrefix} ${protoLabel} ${cleanClientName}${ext}`
                : `${protoLabel} ${cleanClientName}${ext}`;
            } else if (subName === "RECEITAS") {
              const fileDate = file.createdTime || file.modifiedTime || "";
              const datePrefix = formatDateReverse(fileDate);
              newName = datePrefix
                ? `${datePrefix} RECEITA ${cleanClientName}${ext}`
                : `RECEITA ${cleanClientName}${ext}`;
            } else if (subName === "ATESTADOS") {
              const fileDate = file.createdTime || file.modifiedTime || "";
              const datePrefix = formatDateReverse(fileDate);
              newName = datePrefix
                ? `${datePrefix} ATESTADO ${cleanClientName}${ext}`
                : `ATESTADO ${cleanClientName}${ext}`;
            } else if (subName === "LAUDOS") {
              const fileDate = file.createdTime || file.modifiedTime || "";
              const datePrefix = formatDateReverse(fileDate);
              newName = datePrefix
                ? `${datePrefix} LAUDO ${cleanClientName}${ext}`
                : `LAUDO ${cleanClientName}${ext}`;
            } else if (subName === "CONTRATOS") {
              const fileDate = file.createdTime || file.modifiedTime || "";
              const datePrefix = formatDateReverse(fileDate);
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
