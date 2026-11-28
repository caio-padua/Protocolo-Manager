import { brtDateStr } from "./brt.js";

const TYPE_LABELS: Record<string, string> = {
  exame_sangue: "LABOR",
  exame_laboratorial: "LABOR",
  laboratorial: "LABOR",
  sangue: "LABOR",
  lab: "LABOR",
  ultrassom: "USG",
  ultrassonografia: "USG",
  usg: "USG",
  tomografia: "TC",
  tomografia_computadorizada: "TC",
  tc: "TC",
  ct: "TC",
  ressonancia: "RMN",
  ressonancia_magnetica: "RMN",
  rmn: "RMN",
  rm: "RMN",
  radiografia: "RX",
  raio_x: "RX",
  rx: "RX",
  densitometria: "DENSITOMETRIA",
  dexa: "DENSITOMETRIA",
  dmo: "DENSITOMETRIA",
  mamografia: "MAMOGRAFIA",
  mammo: "MAMOGRAFIA",
  cintilografia: "CINTILOGRAFIA",
  eletrocardiograma: "ECG",
  ecg: "ECG",
  ekg: "ECG",
  eletroencefalograma: "EEG",
  eeg: "EEG",
  ecocardiograma: "ECOCARDIOGRAMA",
  holter: "HOLTER",
  mapa: "MAPA",
  endoscopia: "ENDOSCOPIA",
  colonoscopia: "COLONOSCOPIA",
  laudo: "LAUDO",
  documento: "DOCUMENTO",
  foto: "FOTO",
  receita: "RECEITA",
  atestado: "ATESTADO",
  comprovante: "COMPROVANTE",
};

const KNOWN_TEXT_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcintilografia\b.{0,40}\bmiocard/i, label: "CINTILOGRAFIA MIOCARDICA" },
  { pattern: /\bcintilografia\b.{0,40}\brenal\b.{0,30}\bestatic/i, label: "CINTILOGRAFIA RENAL ESTATICA" },
  { pattern: /\bcintilografia\b.{0,40}\brenal\b/i, label: "CINTILOGRAFIA RENAL" },
  { pattern: /\bcintilografia\b/i, label: "CINTILOGRAFIA" },
  { pattern: /\bangi[o]?resson[aâ]ncia\b|\bangi[o]?rm\b/i, label: "ANGIORRESSONANCIA" },
  { pattern: /\bangi[o]?tomografia\b|\bangi[o]?tc\b/i, label: "ANGIOTOMOGRAFIA" },
  { pattern: /\bcalcio coronariano\b/i, label: "CALCIO CORONARIANO" },
  { pattern: /\bcinecoronariografia\b/i, label: "CINECORONARIOGRAFIA" },
  { pattern: /\bcate\b/i, label: "CATE" },
  { pattern: /\b(ecocardiograma|ecodopplercardiograma)\b/i, label: "ECOCARDIOGRAMA" },
  { pattern: /\b(eletrocardiograma|ecg|ekg)\b/i, label: "ECG" },
  { pattern: /\b(eletroencefalograma|eeg)\b/i, label: "EEG" },
  { pattern: /\b(densitometria|dexa|dmo)\b/i, label: "DENSITOMETRIA" },
  { pattern: /\b(mamografia|mamograf)\b/i, label: "MAMOGRAFIA" },
  { pattern: /\bholter\b/i, label: "HOLTER" },
  { pattern: /\b(mapa|monitorizacao ambulatorial da pressao)\b/i, label: "MAPA" },
  { pattern: /\bteste ergometrico\b|\bergometria\b/i, label: "TESTE ERGOMETRICO" },
  { pattern: /\b(endoscopia digestiva alta|video esofagogastroduodenoscopia|eda)\b/i, label: "ENDOSCOPIA DIGESTIVA ALTA" },
  { pattern: /\bcolonoscopia\b/i, label: "COLONOSCOPIA" },
  { pattern: /\banuscopia\b/i, label: "ANUSCOPIA" },
  { pattern: /\bcapsula endoscopica\b/i, label: "CAPSULA ENDOSCOPICA" },
  { pattern: /\bnasofibroscopia\b/i, label: "NASOFIBROSCOPIA" },
  { pattern: /\b(genetica|genetico|apoe|bhmt|cbs|comt|cyp2c19|cyp2c9|cyp2d6|cyp3a4|cyp3a5|fto|mthfr|mtrr?|oprm1|slco1b1|tpmt|ugt1a1|vdr|vkorc1)\b/i, label: "GENETICA" },
  { pattern: /\b(ultrassom|ultrassonografia|ultra-sonografia|usg)\b/i, label: "USG" },
  { pattern: /\bdoppler\b/i, label: "USG" },
  { pattern: /\b(ressonancia magnetica|ressonancia|rmn)\b/i, label: "RMN" },
  { pattern: /\b(tomografia computadorizada|tomografia|tc|ct)\b/i, label: "TC" },
  { pattern: /\b(raio.?x|radiografia|rx)\b/i, label: "RX" },
  { pattern: /\b(espirometria|prova de funcao pulmonar)\b/i, label: "ESPIROMETRIA" },
  { pattern: /\b(audiometria)\b/i, label: "AUDIOMETRIA" },
  { pattern: /\b(polissonografia)\b/i, label: "POLISSONOGRAFIA" },
  { pattern: /\b(biopsia|anatomopatologico|histopatologico)\b/i, label: "BIOPSIA" },
  { pattern: /\b(papanicolau|citologia cervical)\b/i, label: "PAPANICOLAU" },
  { pattern: /\b(labor|hemograma|hemoglobina|glicemia|glicose|laboratorio|laboratorial|exame de sangue|calcitonina|glicoproteina)\b/i, label: "LABOR" },
];

const BODY_REGION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcoluna lombossacra\b/i, label: "COLUNA LOMBOSSACRA" },
  { pattern: /\bcoluna lombar\b/i, label: "COLUNA LOMBAR" },
  { pattern: /\bcoluna cervical\b/i, label: "COLUNA CERVICAL" },
  { pattern: /\bcoluna toracica\b|\bcoluna dorsal\b/i, label: "COLUNA TORACICA" },
  { pattern: /\bseios da face\b|\bseios paranasais\b/i, label: "SEIOS DA FACE" },
  { pattern: /\b(ombro|joelho|punho|tornozelo|cotovelo|quadril|cranio|abdome|pelve|mamas|tireoide|rins|figado|torax|mao|maos|pe|pescoco|braco|perna)\b.{0,18}\b(direito|direita|esquerdo|esquerda)\b/i, label: "" },
  { pattern: /\b(ombro|joelho|punho|tornozelo|cotovelo|quadril|cranio|abdome|pelve|mamas|tireoide|rins|figado|torax|mao|maos|pe|pescoco|braco|perna)\b/i, label: "" },
];

function normalizeWords(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDatePrefix(value?: string | null): string {
  if (value === undefined) return brtDateStr();
  if (value === null || !value.trim()) return "";

  const input = value.trim();
  const match =
    input.match(/^(\d{2})\.(\d{2})\.(\d{2})$/) ??
    input.match(/^(\d{4})-(\d{2})-(\d{2})$/)?.map((part, index) => index === 1 ? part.slice(-2) : part);

  if (match) {
    const [, yy, mm, dd] = match;
    const year = Number(yy.length === 2 ? `20${yy}` : yy);
    const month = Number(mm);
    const day = Number(dd);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${String(year).slice(-2)}.${mm}.${dd}`;
    }
  }

  const brDate = input.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (brDate) {
    const [, dd, mm, yyyy] = brDate;
    const year = Number(yyyy);
    const month = Number(mm);
    const day = Number(dd);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${yyyy.slice(-2)}.${mm}.${dd}`;
    }
  }

  const shortBrDate = input.match(/^(\d{2})[/-](\d{2})[/-](\d{2})$/);
  if (shortBrDate) {
    const [, dd, mm, yy] = shortBrDate;
    const year = Number(`20${yy}`);
    const month = Number(mm);
    const day = Number(dd);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${yy}.${mm}.${dd}`;
    }
  }

  return "";
}

export function parseExamDatePrefix(value: string): string | null {
  if (!value.trim()) return null;
  return normalizeDatePrefix(value) || null;
}

export function normalizeExamTypeLabel(value: string): string {
  const key = normalizeWords(value).toLowerCase().replace(/\s+/g, "_");
  return TYPE_LABELS[key] ?? normalizeWords(value);
}

export function classifyExamLabel(text: string): string | null {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const item of KNOWN_TEXT_LABELS) {
    if (item.pattern.test(normalized)) return item.label;
  }
  return null;
}

export function classifyExamRegion(text: string): string | undefined {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const item of BODY_REGION_PATTERNS) {
    const match = normalized.match(item.pattern);
    if (!match) continue;
    if (item.label) return item.label;
    const bodyPart = match[1];
    const side = match[2];
    if (/cintilografia/.test(normalized) && /renal|miocard/.test(normalized)) return undefined;
    const canonicalBodyPart: Record<string, string> = {
      cranio: "CRANIO", abdome: "ABDOME", torax: "TORAX", figado: "FIGADO",
      joelho: "JOELHO", ombro: "OMBRO", punho: "PUNHO", tornozelo: "TORNOZELO",
      cotovelo: "COTOVELO", quadril: "QUADRIL", pelve: "PELVE", mamas: "MAMAS",
      tireoide: "TIREOIDE", rins: "RINS",
      mao: "MAO", maos: "MAOS", pe: "PE", pescoco: "PESCOCO",
      braco: "BRACO", perna: "PERNA",
    };
    const body = canonicalBodyPart[bodyPart];
    if (!body) continue;
    if (!side) return body;
    return `${body} ${/direit/.test(side) ? "D" : "E"}`;
  }
  return undefined;
}

export function buildExamFileName(params: {
  date?: string | null;
  type: string;
  region?: string | null;
  clientName: string;
  extension?: string | null;
}): string {
  const datePrefix = normalizeDatePrefix(params.date);
  const type = normalizeWords(normalizeExamTypeLabel(params.type));
  const candidateRegion = params.region ? normalizeWords(params.region) : "";
  const region = candidateRegion && !`${type} `.includes(`${candidateRegion} `)
    ? candidateRegion
    : "";
  const clientName = normalizeWords(params.clientName);
  const extensionInput = params.extension?.trim() ?? "";
  const extension = extensionInput
    ? `.${extensionInput.replace(/^\./, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`
    : "";
  const nameParts = [datePrefix, type, region, clientName].filter(Boolean);
  return `${nameParts.join(" ")}${extension}`;
}

