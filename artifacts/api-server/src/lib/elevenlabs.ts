/**
 * elevenlabs.ts — Cliente REST da ElevenLabs (Text-to-Speech PT-BR).
 *
 * API v1: https://api.elevenlabs.io/v1
 * Autenticação: header xi-api-key
 *
 * Funções exportadas:
 *   listarVozes()              → lista de vozes disponíveis na conta
 *   gerarAudio(texto, voiceId) → Buffer MP3 pronto para enviar via Twilio/Email
 *   checkElevenLabsStatus()    → { ok, erro? } para o painel de status CEO
 */

import { getSecret } from "./secure-settings";
import { logger }    from "./logger";

const BASE_URL = "https://api.elevenlabs.io";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ElevenLabsVoz {
  voice_id:    string;
  name:        string;
  category:    string;
  description: string | null;
  preview_url: string | null;
  labels:      Record<string, string>;
}

export interface ElevenLabsStatusResult {
  ok:    boolean;
  erro?: string;
  vozes?: number; // quantidade de vozes na conta
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getApiKey(): Promise<string> {
  const key = await getSecret("elevenlabs.apiKey");
  if (!key) throw new Error("ELEVENLABS_API_KEY não configurado. Configure em Integrações → ElevenLabs.");
  return key;
}

async function fetchEL(path: string, opts: RequestInit = {}): Promise<Response> {
  const key = await getApiKey();
  return fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      "xi-api-key":   key,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Lista todas as vozes disponíveis na conta ElevenLabs.
 * Inclui vozes padrão da plataforma + vozes clonadas do usuário.
 */
export async function listarVozes(): Promise<ElevenLabsVoz[]> {
  const resp = await fetchEL("/v1/voices");
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs /v1/voices ${resp.status}: ${txt}`);
  }
  const data = await resp.json() as { voices: ElevenLabsVoz[] };
  return data.voices ?? [];
}

/**
 * Gera áudio MP3 a partir de texto usando a voz especificada.
 * Retorna Buffer pronto para salvar como arquivo ou enviar via Twilio/email.
 *
 * @param texto    Texto a sintetizar (máx. ~2.500 chars por chamada na API free)
 * @param voiceId  ID da voz ElevenLabs (ex.: "EXAVITQu4vr4xnSDxMaL")
 */
export async function gerarAudio(texto: string, voiceId: string): Promise<Buffer> {
  const resp = await fetchEL(`/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    body: JSON.stringify({
      text:           texto,
      model_id:       "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
    headers: { Accept: "audio/mpeg" },
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs TTS ${resp.status}: ${txt}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Verifica se a chave da API está configurada e funcionando.
 * Faz uma chamada leve (/v1/voices) e retorna status honesto.
 */
export async function checkElevenLabsStatus(): Promise<ElevenLabsStatusResult> {
  try {
    const vozes = await listarVozes();
    return { ok: true, vozes: vozes.length };
  } catch (e: any) {
    logger.warn({ err: e?.message }, "elevenlabs: check de status falhou");
    return { ok: false, erro: e?.message ?? "Erro desconhecido" };
  }
}
