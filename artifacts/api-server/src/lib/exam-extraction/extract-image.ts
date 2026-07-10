import { ai } from "@workspace/integrations-gemini-ai";
import { Type } from "@google/genai";
import { compactExamText, inferLabName } from "./pdf-text";
import { ExtractedImageReportSchema, type ExtractedImageReport } from "./schema-image";
import { DEFAULT_MODEL, ESCALATION_MODEL, mediaPart } from "./extract";

const CONFIDENCE_FLOOR = 0.7;

// ============================================================================
// Motor de extracao de laudos de IMAGEM (mesmo pipeline do laboratorial:
// pdf-parse -> compactExamText -> Gemini json -> Zod). So muda o "molde".
// ============================================================================

const IMAGE_PROMPT = `Você é um extrator clínico de laudos de IMAGEM brasileiros
(ultrassom/USG, ressonância magnética/RMN, tomografia/TC, densitometria óssea, radiografia/raio-X).
Receberá o TEXTO de um laudo e deve extrair, em JSON estrito, todos os dados estruturados.

REGRAS OBRIGATÓRIAS:
1. PACIENTE: nome completo, CPF (como impresso) e data de nascimento (DD/MM/AAAA), do cabeçalho.
   - NÃO confunda o paciente com o "Médico:"/"Dr(a)" (médico solicitante ou radiologista).
2. Um mesmo arquivo pode conter VÁRIOS exames de imagem (laudo CONJUGADO: ex.: tireoide + mamas).
   - Separe em "exams": UM item por exame de imagem distinto encontrado no texto.
3. Para cada exame em "exams":
   - "examType": um de: "usg", "rmn", "tc", "densitometria", "rx", "outro" (classifique pelo CONTEÚDO).
   - "sector": um de: "ultrassom", "ressonancia", "tomografia", "densitometria", "radiografia".
   - "title": título do exame exatamente como impresso (ex.: "Ultrassonografia da tireoide").
   - "collectionDate": data do exame (DD/MM/AAAA), se houver.
   - "labName": clínica/laboratório de imagem, se houver.
   - "conclusion": a IMPRESSÃO DIAGNÓSTICA / CONCLUSÃO do laudo (o texto do fecho).
   - "comparativo": se o laudo compara com exame anterior ("em relação ao exame de DD/MM/AAAA..."),
     traga o antes/depois qualitativo aqui; senão null.
   - "findings": lista dos achados descritivos. Cada achado tem:
       "field": rótulo do achado (ex.: "Lobo direito", "Istmo", "Nódulo", "Ecotextura", "Disco L4-L5").
       "level": nível anatômico quando se aplica (RMN/TC de coluna: "L4-L5", "L5-S1"); senão null.
       "value": a descrição/medida do achado, texto livre (ex.: "5,2 x 1,8 x 1,6 cm", "sem nódulos").
4. NÃO invente. Copie do laudo. Mantenha a vírgula decimal brasileira.
5. "confidence": 0 a 1 (1 = laudo nítido; baixo = truncado/ilegível/ambíguo).

Responda SOMENTE com o objeto JSON, sem comentários, sem markdown.`;

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  // Tira cerca de markdown (```json ... ```), mesmo com preambulo antes dela
  // (ex.: o Gemini responde "Here is the JSON requested:\n```json{...}```").
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Recorta do 1o ate o ultimo delimitador de objeto/array, descartando qualquer
  // texto de preambulo/epilogo que o modelo tenha adicionado fora do JSON.
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length) {
    const start = Math.min(...starts);
    const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (end > start) s = s.slice(start, end + 1);
  }
  return s.trim();
}

// --- Classificacao por CONTEUDO (nunca por nome de arquivo) --------------------
const IMAGE_SIGNALS: RegExp[] = [
  /ultrassonografia|ultrassom|ecografia|ecodoppler|doppler colorido/i,
  /resson[aâ]ncia|ressonancia magn|\brm\b|sequ[eê]ncias?\b|ponderad[ao]/i,
  /tomografia|tomodensitometria|\btc\b de|cortes axiais/i,
  /densitometria|densidade mineral [oó]ssea|t-?score|z-?score/i,
  /radiografia|raio[- ]?x|incid[eê]ncia (ap|pa|perfil)/i,
  /impress[aã]o diagn[oó]stica|achados:|t[eé]cnica:|estudo (realizado|dinamico)/i,
];
const LAB_SIGNALS: RegExp[] = [
  /valor de refer[eê]ncia|hemograma|leucograma|plaquetas/i,
  /\bmg\/dl\b|\bg\/dl\b|\bng\/ml\b|\bµ?ui\/ml\b|\bmui\/l\b|\/mm3|\/µl/i,
  /m[eé]todo:\s|soro\b|plasma\b|creatinina|colesterol|triglic|glicose|tsh\b/i,
];

function score(text: string, patterns: RegExp[]): number {
  return patterns.reduce((acc, re) => acc + (re.test(text) ? 1 : 0), 0);
}

export type ExamKind = "lab" | "imagem";

/**
 * Decide se o laudo e LABORATORIAL ou de IMAGEM lendo o CONTEUDO (nunca o nome
 * do arquivo). Empate/ambos fracos -> "lab" (motor mais maduro). Sinal de imagem
 * claramente dominante -> "imagem".
 */
export function classifyExamKind(text: string): ExamKind {
  const img = score(text, IMAGE_SIGNALS);
  const lab = score(text, LAB_SIGNALS);
  if (img > lab) return "imagem";
  return "lab";
}

type GeminiContents = Parameters<typeof ai.models.generateContent>[0]["contents"];

async function runImageGemini(contents: GeminiContents, model: string): Promise<ExtractedImageReport> {
  // temperature 0 e DETERMINISTICO: se o modelo devolver preambulo/JSON invalido,
  // repetir a temperatura 0 daria o MESMO texto ruim. Por isso a 2a tentativa sobe
  // a temperatura para forcar uma amostragem diferente que respeite o JSON.
  const attempts = [0, 0.6];
  let lastErr = "Gemini retornou resposta vazia na extração do laudo de imagem.";
  for (const temperature of attempts) {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { responseMimeType: "application/json", temperature, maxOutputTokens: 32768 },
    });
    const raw = response.text ?? "";
    if (!raw.trim()) continue;
    try {
      return ExtractedImageReportSchema.parse(JSON.parse(stripJsonFences(raw)));
    } catch (err) {
      lastErr = `Falha ao parsear JSON do Gemini (imagem): ${(err as Error).message}. Trecho: ${raw.slice(0, 300)}`;
    }
  }
  throw new Error(lastErr);
}

async function callGeminiImage(text: string, model: string): Promise<ExtractedImageReport> {
  return runImageGemini(`${IMAGE_PROMPT}\n\n=== TEXTO DO LAUDO ===\n${text}`, model);
}

/**
 * Veredito por CONTEUDO de texto: laboratorial, imagem ou "none" (nao e exame).
 * Nenhum sinal de exame -> "none" (porteiro anti-lixo: evita gastar IA com
 * contrato/recibo/receita que por acaso caiu numa pasta varrida).
 */
export function examTextVerdict(text: string): "lab" | "imagem" | "none" {
  const img = score(text, IMAGE_SIGNALS);
  const lab = score(text, LAB_SIGNALS);
  if (img === 0 && lab === 0) return "none";
  return img > lab ? "imagem" : "lab";
}

const CLASSIFY_PROMPT = `Você recebe um ARQUIVO (imagem ou PDF). Responda SOMENTE em JSON estrito:
{"isExam": true|false, "kind": "lab"|"imagem"}
- isExam=true SOMENTE se for um EXAME/LAUDO médico: laboratorial (sangue, urina, hormônios) OU de imagem (ultrassom, ressonância, tomografia, densitometria, raio-x).
- isExam=false para: foto pessoal/selfie, documento de identidade, contrato, recibo, nota fiscal, receita/prescrição, termo de consentimento, ficha de cadastro, ou qualquer coisa que não seja resultado de exame.
- kind="lab" para exame laboratorial; kind="imagem" para exame de imagem. Se isExam=false, use kind="lab".
Sem markdown, sem comentário.`;

// Geracao CONTROLADA (responseSchema): forca o Gemini a emitir SO um objeto que
// obedece este esquema. Com isso o modelo nao pode devolver preambulo em texto
// ("Here is the JSON requested:") — falha real observada no run em massa, que o
// responseMimeType sozinho NAO impede. Este porteiro passa a ser deterministico.
const CLASSIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isExam: { type: Type.BOOLEAN },
    kind: { type: Type.STRING, enum: ["lab", "imagem"] },
  },
  required: ["isExam", "kind"],
} as const;

/**
 * Porteiro de VISAO: dado o arquivo (imagem ou PDF escaneado), decide se e exame
 * e de que tipo. "none" quando nao for exame (nao gasta a extracao pesada).
 */
export async function classifyMedia(buffer: Buffer, mimeType: string): Promise<"lab" | "imagem" | "none"> {
  const contents: GeminiContents = [
    { role: "user", parts: [{ text: CLASSIFY_PROMPT }, mediaPart(buffer, mimeType)] },
  ];
  // temperature 0 e DETERMINISTICO: alguns PDFs fazem o modelo devolver preambulo
  // em texto ("Here is the JSON requested:") mesmo com responseMimeType/responseSchema.
  // Repetir a temperatura 0 daria o MESMO texto ruim, entao a 2a tentativa sobe a
  // temperatura para forcar uma amostragem diferente que respeite o JSON.
  const attempts = [0, 0.6];
  // IMPORTANTE (fail-open): so retornamos "none" quando o modelo AFIRMA que nao e
  // exame. Resposta vazia/corrompida NAO pode virar "none" — isso gravaria o doc
  // como "ignorado" (permanente) e o dedup por (clientId,hash) impediria reprocessar
  // um exame verdadeiro numa nova execucao. Se TODAS as tentativas falharem lancamos:
  // o worker conta como erro (transitorio), SEM gravar linha, e a proxima run retenta.
  let lastErr = "Porteiro (classifyMedia): Gemini retornou resposta vazia.";
  for (const temperature of attempts) {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: CLASSIFY_SCHEMA,
        temperature,
        maxOutputTokens: 512,
      },
    });
    const raw = response.text ?? "";
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(stripJsonFences(raw)) as { isExam?: boolean; kind?: string };
      if (!parsed.isExam) return "none";
      return parsed.kind === "imagem" ? "imagem" : "lab";
    } catch (err) {
      lastErr = `Porteiro (classifyMedia): JSON invalido do Gemini: ${(err as Error).message}. Trecho: ${raw.slice(0, 200)}`;
    }
  }
  throw new Error(lastErr);
}

const IMAGE_MEDIA_SUFFIX = `\n\nO laudo vem como ARQUIVO EM ANEXO (imagem fotografada/escaneada ou PDF sem texto). Faça a LEITURA ÓPTICA do arquivo e extraia os dados conforme as regras acima.`;

/** Extrai um laudo de IMAGEM diretamente de um arquivo de imagem ou PDF escaneado (visão). */
export async function extractImageFromMedia(
  buffer: Buffer,
  mimeType: string,
  options: { model?: string; disableEscalation?: boolean } = {},
): Promise<ExtractImageResult> {
  const firstModel = options.model ?? DEFAULT_MODEL;
  const contents: GeminiContents = [
    { role: "user", parts: [{ text: IMAGE_PROMPT + IMAGE_MEDIA_SUFFIX }, mediaPart(buffer, mimeType)] },
  ];
  const data = await runImageGemini(contents, firstModel);
  const shouldEscalate =
    !options.model && !options.disableEscalation && data.confidence < CONFIDENCE_FLOOR;
  if (shouldEscalate) {
    try {
      const escalated = await runImageGemini(contents, ESCALATION_MODEL);
      return { data: escalated, modelUsed: ESCALATION_MODEL, escalated: true };
    } catch {
      return { data, modelUsed: firstModel, escalated: false };
    }
  }
  return { data, modelUsed: firstModel, escalated: false };
}

export interface ExtractImageResult {
  data: ExtractedImageReport;
  modelUsed: string;
  escalated: boolean;
}

export async function extractImageFromText(
  text: string,
  options: { model?: string; disableEscalation?: boolean; disableCompaction?: boolean } = {},
): Promise<ExtractImageResult> {
  const firstModel = options.model ?? DEFAULT_MODEL;
  const payload = options.disableCompaction ? text : compactExamText(text).text;
  const data = await callGeminiImage(payload, firstModel);

  const shouldEscalate =
    !options.model && !options.disableEscalation && data.confidence < CONFIDENCE_FLOOR;
  if (shouldEscalate) {
    try {
      const escalated = await callGeminiImage(payload, ESCALATION_MODEL);
      return { data: withImageLabFallback(escalated, text), modelUsed: ESCALATION_MODEL, escalated: true };
    } catch {
      return { data: withImageLabFallback(data, text), modelUsed: firstModel, escalated: false };
    }
  }
  return { data: withImageLabFallback(data, text), modelUsed: firstModel, escalated: false };
}

function withImageLabFallback(data: ExtractedImageReport, rawText: string): ExtractedImageReport {
  const fallback = inferLabName(rawText);
  return {
    ...data,
    exams: data.exams.map((e) => ({ ...e, labName: e.labName ?? fallback })),
  };
}
