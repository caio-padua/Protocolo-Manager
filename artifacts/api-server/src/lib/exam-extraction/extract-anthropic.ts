import { ExtractedExamSchema, type ExtractedExam } from "./schema";
import { requireAiTenant, logAiUsage } from "../ai-central";

// ────────────────────────────────────────────────────────────────────────────
// Extrator Claude (Anthropic) — lazy init: não estoura no boot se as vars
// não estiverem configuradas. Retorna null quando desativado/sem config.
// ────────────────────────────────────────────────────────────────────────────

const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

const EXTRACTION_PROMPT = `Você é um extrator clínico de laudos laboratoriais brasileiros.
Receberá o TEXTO de um laudo (resultado de exames de sangue/imagem). Sua tarefa é extrair, em JSON estrito, TODOS os dados estruturados.

REGRAS OBRIGATÓRIAS:
1. Extraia o PACIENTE: nome completo, CPF (como impresso) e data de nascimento (DD/MM/AAAA).
   - "DN" é a sigla de Data de Nascimento.
   - NÃO confunda o paciente com a linha "Médico:" / "Dr(a)".
2. Extraia a data da coleta (procure "DATA COLETA", DD/MM/AAAA) e o nome do LABORATÓRIO.
   - Se o nome não estiver explícito, infira pelo rodapé ou URL (ex.: "valida.dasa.com.br" → "DASA").
3. Extraia TODOS os analitos com valor numérico. Para cada um:
   - "name": nome exatamente como impresso.
   - "value": valor ATUAL exatamente como impresso, preservando vírgula decimal brasileira.
   - "unit": unidade impressa ou null.
   - "referenceRange": faixa de referência impressa ou null.
   - "method": método se impresso, senão null.
   - "history": série histórica do mesmo analito com datas, ou [].
4. Quando houver percentual E contagem absoluta, use a CONTAGEM ABSOLUTA como "value".
5. NÃO invente valores. NÃO converta unidades. Copie exatamente como está.
6. NÃO normalize vírgula para ponto. Mantenha notação brasileira.
7. "confidence": número de 0 a 1 indicando confiança global na extração.

Responda SOMENTE com o objeto JSON, sem comentários, sem markdown.`;

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
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

let _client: import("@anthropic-ai/sdk").default | null = null;
let _initAttempted = false;

function getClient(): import("@anthropic-ai/sdk").default | null {
  if (_initAttempted) return _client;
  _initAttempted = true;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey || !baseURL) return null;
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const Cls = Anthropic.default ?? Anthropic;
    _client = new Cls({ apiKey, baseURL }) as import("@anthropic-ai/sdk").default;
  } catch {
    _client = null;
  }
  return _client;
}

export async function extractExamWithClaude(text: string, empresaId = 0): Promise<{ data: ExtractedExam; ms: number } | null> {
  const client = getClient();
  if (!client) return null;

  const { headers: aiHeaders } = requireAiTenant(empresaId, "clinical");
  const t0 = Date.now();
  try {
    const msg = await (client.messages.create as Function)(
      {
        model: CLAUDE_MODEL,
        max_tokens: 8096,
        messages: [
          {
            role: "user",
            content: `${EXTRACTION_PROMPT}\n\n=== TEXTO DO LAUDO ===\n${text}`,
          },
        ],
      },
      { headers: aiHeaders },
    );

    const usage = (msg as any).usage;
    void logAiUsage({
      empresaId,
      provider: "anthropic",
      tipo: "clinical",
      inputTokens:  usage?.input_tokens  ?? undefined,
      outputTokens: usage?.output_tokens ?? undefined,
    });

    const raw = (msg.content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    const parsed = JSON.parse(stripJsonFences(raw));
    const validated = ExtractedExamSchema.parse(parsed);
    return { data: validated, ms: Date.now() - t0 };
  } catch {
    return null;
  }
}

export const CLAUDE_MODEL_NAME = CLAUDE_MODEL;
