// Voz premium da Anamnese — Text-To-Speech (texto para fala) via Replit AI
// Guard de clone via ai-central: requireAiTenant() protege a chamada.
import { requireAiTenant } from "./ai-central";
// Integrations (OpenAI). Sem chave propria: usa AI_INTEGRATIONS_OPENAI_*,
// faturado nos creditos do CEO. Web Speech API e PROIBIDA pela skill.
//
// Motor: modelo gpt-audio em /chat/completions com modalities ["text","audio"].
// A locutora le o texto VERBATIM (palavra por palavra), voz feminina pt-BR.

// Vozes aceitas pelo gpt-audio. voiceLabel amigavel mora no frontend.
export const VOZES_PERMITIDAS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

export type VozId = (typeof VOZES_PERMITIDAS)[number];

export function vozValida(v: string): v is VozId {
  return (VOZES_PERMITIDAS as readonly string[]).includes(v);
}

const SYSTEM_PROMPT =
  "Voce e uma locutora brasileira de voz feminina, elegante, calorosa e clara. " +
  "Leia EXATAMENTE o texto do usuario, palavra por palavra, em portugues do Brasil, " +
  "sem adicionar, remover, traduzir, comentar ou responder nada. " +
  "Apenas narre o texto com entonacao natural, pausada e acolhedora.";

/**
 * Gera um mp3 (Buffer) lendo `texto` em voz alta com a `voz` escolhida.
 * Lanca erro se a integracao nao estiver configurada ou se a API falhar.
 */
export async function gerarFalaMp3(texto: string, voz: string, empresaId = 0): Promise<Buffer> {
  const base = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!base || !key) {
    throw new Error(
      "Integracao de voz nao configurada (AI_INTEGRATIONS_OPENAI_BASE_URL/API_KEY).",
    );
  }
  const { headers: aiHeaders } = requireAiTenant(empresaId, "voice");
  const v: VozId = vozValida(voz) ? voz : "shimmer";

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...aiHeaders,
    },
    body: JSON.stringify({
      model: "gpt-audio",
      modalities: ["text", "audio"],
      audio: { voice: v, format: "mp3" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: texto },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Falha na geracao de voz (${res.status}): ${t.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { audio?: { data?: string } } }[];
  };
  const b64 = data.choices?.[0]?.message?.audio?.data;
  if (!b64) {
    throw new Error("Resposta de voz sem audio.");
  }
  return Buffer.from(b64, "base64");
}
