import { ExtractedExamSchema, type ExtractedExam } from "./schema";
import { requireAiTenant, logAiUsage } from "../ai-central";

// ────────────────────────────────────────────────────────────────────────────
// Extrator OpenAI GPT-4o — sem SDK; usa fetch nativo (sem instalar openai pkg).
// Lazy: retorna null se AI_INTEGRATIONS_OPENAI_API_KEY nao estiver configurado.
// ────────────────────────────────────────────────────────────────────────────

export const OPENAI_MODEL = "gpt-4o";

const EXTRACTION_PROMPT = `Você é um extrator clínico de laudos laboratoriais brasileiros.
Receberá o TEXTO de um laudo (resultado de exames de sangue/imagem). Sua tarefa é extrair, em JSON estrito, TODOS os dados estruturados.

REGRAS OBRIGATÓRIAS:
1. Extraia o PACIENTE: nome completo, CPF (como impresso) e data de nascimento (DD/MM/AAAA).
   - "DN" é a sigla de Data de Nascimento.
   - NÃO confunda o paciente com a linha "Médico:" / "Dr(a)".
2. Extraia a data da coleta (procure "DATA COLETA", DD/MM/AAAA) e o nome do LABORATÓRIO.
3. Extraia TODOS os analitos com valor numérico. Para cada um:
   - "name": nome exatamente como impresso.
   - "value": valor ATUAL exatamente como impresso, preservando vírgula decimal brasileira.
   - "unit": unidade impressa ou null.
   - "referenceRange": faixa de referência impressa ou null.
   - "method": método se impresso, senão null.
   - "history": série histórica do mesmo analito com datas, ou [].
4. Quando houver percentual E contagem absoluta, use a CONTAGEM ABSOLUTA como "value".
5. NÃO invente valores. Copie exatamente como está.
6. "confidence": número de 0 a 1 indicando confiança global na extração.

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

export async function extractExamWithOpenAI(text: string, empresaId = 0): Promise<{ data: ExtractedExam; ms: number } | null> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  const baseURL = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  if (!apiKey) return null;

  const { headers: aiHeaders } = requireAiTenant(empresaId, "clinical");
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...aiHeaders,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "user",
            content: `${EXTRACTION_PROMPT}\n\n=== TEXTO DO LAUDO ===\n${text}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 16384,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    void logAiUsage({
      empresaId,
      provider: "openai",
      tipo: "clinical",
      inputTokens:  json?.usage?.prompt_tokens     ?? undefined,
      outputTokens: json?.usage?.completion_tokens ?? undefined,
    });
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    if (!raw) return null;
    const parsed = JSON.parse(stripJsonFences(raw));
    const validated = ExtractedExamSchema.parse(parsed);
    return { data: validated, ms: Date.now() - t0 };
  } catch {
    return null;
  }
}
