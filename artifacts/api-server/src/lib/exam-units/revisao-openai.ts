/**
 * Segunda opinião da OpenAI sobre UMA unidade de exame.
 * NÃO reutiliza extractExamWithOpenAI (que envia o texto inteiro do laudo).
 * O corpo enviado é montado por lista fechada de campos: código e nome do analito e os dois símbolos de unidade.
 * Nunca recebe valor, nome, CPF, data, laboratório, documento ou PDF. Nunca lê nem grava exames.llmOpenaiAtivo.
 */
import { z } from "zod";
import { logAiUsage, requireAiTenant } from "../ai-central";

export const MODELO_REVISAO_UNIDADE = "gpt-4o";
/** Estimativa conservadora (prompt de ~400 tokens). Não é preço: o custo real vem do uso devolvido. */
export const CUSTO_ESTIMADO_POR_CONSULTA_USD = 0.01;

export interface PayloadUnidade {
  analyteCode: string;
  analyteName: string;
  unitOrigin: string;
  unitTarget: string;
}

const limpar = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

/** Lista fechada: qualquer outro campo recebido é descartado. */
export function montarPayloadUnidade(entrada: Record<string, unknown>): PayloadUnidade {
  const campo = (k: string) => (typeof entrada[k] === "string" ? limpar(entrada[k] as string) : "");
  const p = { analyteCode: campo("analyteCode"), analyteName: campo("analyteName"), unitOrigin: campo("unitOrigin"), unitTarget: campo("unitTarget") };
  if (!p.analyteCode || !p.unitOrigin || !p.unitTarget) throw new Error("payload de unidade incompleto");
  return p;
}

export const RespostaUnidadeSchema = z.object({
  relation: z.enum(["equivalent", "convertible", "analyte_specific", "not_convertible", "unknown"]),
  /** razão exata "a/b" ou inteiro; nulo quando não há fator comprovável */
  factor: z.string().regex(/^-?\d+(\/\d+)?$/).nullable(),
  formula: z.string().max(300),
  dimension: z.string().max(120),
  sourceNote: z.string().max(400),
  uncertainties: z.array(z.string().max(200)).max(8),
});
export type RespostaUnidade = z.infer<typeof RespostaUnidadeSchema>;

export class ProviderHttpError extends Error { constructor(public status: number) { super(`provedor respondeu HTTP ${status}`); } }
export class ProviderIncertoError extends Error {}

export function chaveOpenAIPresente(): boolean {
  return Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY);
}

const PROMPT = [
  "Você revisa uma conversão de UNIDADE de exame laboratorial. Não há dados de paciente.",
  "Responda SOMENTE JSON com: relation (equivalent|convertible|analyte_specific|not_convertible|unknown),",
  "factor (razão exata \"a/b\" para multiplicar o valor na unidade de origem e obter a unidade de destino, ou null),",
  "formula, dimension, sourceNote (fonte verificável), uncertainties (lista).",
  "Se a conversão depende de massa molar, método, ensaio ou de outro exame, use analyte_specific e factor null.",
  "Nunca invente fator.",
].join(" ");

export interface ResultadoChamada { parsed: RespostaUnidade; inputTokens?: number; outputTokens?: number; custoUsd: number }

export async function consultarOpenAIUnidade(
  payload: PayloadUnidade,
  empresaId: number,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ResultadoChamada> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("chave OpenAI ausente");
  const baseURL = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const { headers } = requireAiTenant(empresaId, "other");
  const f = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await f(`${baseURL}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        model: MODELO_REVISAO_UNIDADE,
        messages: [{ role: "user", content: `${PROMPT}\n${JSON.stringify(payload)}` }],
        response_format: { type: "json_object" },
        max_tokens: 500,
      }),
    });
  } catch {
    throw new ProviderIncertoError("sem resposta do provedor (rede ou tempo esgotado)");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ProviderHttpError(res.status);
  try {
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const conteudo = json.choices?.[0]?.message?.content ?? "";
    const parsed = RespostaUnidadeSchema.parse(JSON.parse(conteudo));
    const inT = json.usage?.prompt_tokens, outT = json.usage?.completion_tokens;
    // gpt-4o: referência de tabela pública, usada só como ESTIMATIVA do custo real.
    const custoUsd = ((inT ?? 0) * 2.5 + (outT ?? 0) * 10) / 1_000_000;
    void logAiUsage({ empresaId, provider: "openai", tipo: "other", inputTokens: inT, outputTokens: outT, custoUsd });
    return { parsed, inputTokens: inT, outputTokens: outT, custoUsd };
  } catch {
    throw new ProviderIncertoError("resposta recebida mas ilegível");
  }
}
