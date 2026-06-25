import { ai } from "@workspace/integrations-gemini-ai";
import { compactExamText, inferLabName } from "./pdf-text";
import { ExtractedExamSchema, type ExtractedExam } from "./schema";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const ESCALATION_MODEL = "gemini-3.1-pro-preview";
const CONFIDENCE_FLOOR = 0.7;

const EXTRACTION_PROMPT = `Você é um extrator clínico de laudos laboratoriais brasileiros.
Receberá o TEXTO de um laudo (resultado de exames de sangue/imagem). Sua tarefa é extrair, em JSON estrito, TODOS os dados estruturados.

REGRAS OBRIGATÓRIAS:
1. Extraia o PACIENTE: nome completo, CPF (como impresso) e data de nascimento (DD/MM/AAAA).
   - O paciente é a pessoa cujo "CPF:", "DN:" e "Gênero:" aparecem no cabeçalho do laudo.
   - O nome do paciente costuma aparecer na linha imediatamente ANTES de "Gênero:" ou "CPF:".
   - "DN" é a sigla de Data de Nascimento (ex.: "DN: 14/11/1978 | 47 anos" → birthDate "14/11/1978").
   - NÃO confunda o paciente com a linha "Médico:" / "Dr(a)" (esse é o médico solicitante), MESMO que seja a mesma pessoa. Sempre preencha o nome do paciente a partir do cabeçalho.
2. Extraia a data da coleta (procure "DATA COLETA", DD/MM/AAAA) e o nome do LABORATÓRIO.
   - Se o nome do laboratório não estiver explícito, infira pelo rodapé ou pela URL de validação (ex.: "valida.dasa.com.br" → "DASA"; "fleury.com.br" → "Fleury"; "hermespardini" → "Hermes Pardini").
3. Extraia TODOS os analitos/exames com valor numérico. Para cada um:
   - "name": nome exatamente como impresso (ex.: "Hemoglobina", "Ferritina", "PCR ultrassensível").
   - "value": valor ATUAL exatamente como impresso, preservando a vírgula decimal brasileira (ex.: "18,4", "617,3", "210.000").
   - "unit": unidade impressa (ex.: "g/dL", "ng/mL", "mg/dL", "/µL"). Se não houver, null.
   - "referenceRange": faixa de referência impressa (ex.: "13,0 a 17,0"). Se não houver, null.
   - "method": método, se impresso; senão null.
   - "history": série histórica do MESMO analito, se o laudo trouxer resultados anteriores com datas. Cada ponto tem date (DD/MM/AAAA), value e unit. Se não houver histórico, use [].
4. Quando uma linha trouxer percentual E contagem absoluta (ex.: leucograma "100 % 7.740 /µL"), use a CONTAGEM ABSOLUTA como "value" e a unidade "/µL".
5. NÃO invente valores. NÃO converta unidades. Copie exatamente como está no laudo.
6. NÃO normalize a vírgula para ponto. Mantenha a notação brasileira.
7. "confidence": número de 0 a 1 indicando sua confiança global na extração (1 = laudo nítido e completo; baixo = texto truncado, ilegível ou ambíguo).

Responda SOMENTE com o objeto JSON, sem comentários, sem markdown.`;

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return trimmed;
}

async function callGemini(text: string, model: string): Promise<ExtractedExam> {
  const response = await ai.models.generateContent({
    model,
    contents: `${EXTRACTION_PROMPT}\n\n=== TEXTO DO LAUDO ===\n${text}`,
    config: {
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 32768,
    },
  });

  const raw = response.text ?? "";
  if (!raw.trim()) {
    throw new Error("Gemini retornou resposta vazia na extração do laudo.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch (err) {
    throw new Error(
      `Falha ao parsear JSON do Gemini: ${(err as Error).message}. Trecho: ${raw.slice(0, 300)}`,
    );
  }

  return ExtractedExamSchema.parse(parsed);
}

export interface ExtractExamOptions {
  /** Força um modelo específico (ignora escalonamento). */
  model?: string;
  /** Desativa o escalonamento automático para o modelo pro. */
  disableEscalation?: boolean;
  /** Desativa a compactação de linhas repetidas (cabeçalhos/rodapés). */
  disableCompaction?: boolean;
}

export interface ExtractExamResult {
  data: ExtractedExam;
  modelUsed: string;
  escalated: boolean;
}

export async function extractExamFromText(
  text: string,
  options: ExtractExamOptions = {},
): Promise<ExtractExamResult> {
  const firstModel = options.model ?? DEFAULT_MODEL;
  const payload = options.disableCompaction ? text : compactExamText(text).text;
  const data = await callGemini(payload, firstModel);

  const shouldEscalate =
    !options.model &&
    !options.disableEscalation &&
    data.confidence < CONFIDENCE_FLOOR;

  if (shouldEscalate) {
    try {
      const escalated = await callGemini(payload, ESCALATION_MODEL);
      return {
        data: withLabFallback(escalated, text),
        modelUsed: ESCALATION_MODEL,
        escalated: true,
      };
    } catch {
      return { data: withLabFallback(data, text), modelUsed: firstModel, escalated: false };
    }
  }

  return { data: withLabFallback(data, text), modelUsed: firstModel, escalated: false };
}

/** Preenche o laboratório por regra determinística quando a IA o deixa nulo. */
function withLabFallback(data: ExtractedExam, rawText: string): ExtractedExam {
  if (data.labName) return data;
  return { ...data, labName: inferLabName(rawText) };
}
