/**
 * heygen.ts — Cliente REST da HeyGen (geração de vídeo com avatar).
 *
 * API v2: https://api.heygen.com
 * Autenticação: header X-Api-Key
 *
 * Funções exportadas:
 *   listarAvatares()                         → lista de avatares disponíveis
 *   gerarVideo(avatarId, texto, voiceId?)    → { videoId } para polling
 *   buscarStatusVideo(videoId)               → { status, videoUrl? }
 *   checkHeyGenStatus()                      → { ok, erro? }
 */

import { getSecret } from "./secure-settings";
import { logger }    from "./logger";

const BASE_URL = "https://api.heygen.com";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface HeyGenAvatar {
  avatar_id:   string;
  avatar_name: string;
  gender:      string | null;
  preview_image_url: string | null;
  preview_video_url: string | null;
}

export type HeyGenVideoStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "waiting";

export interface HeyGenVideoResult {
  videoId:  string;
  status:   HeyGenVideoStatus;
  videoUrl?: string;
  erro?:    string;
}

export interface HeyGenStatusResult {
  ok:    boolean;
  erro?: string;
  avatares?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getApiKey(): Promise<string> {
  const key = await getSecret("heygen.apiKey");
  if (!key) throw new Error("HEYGEN_API_KEY não configurado. Configure em Integrações → HeyGen.");
  return key;
}

async function fetchHG(path: string, opts: RequestInit = {}): Promise<Response> {
  const key = await getApiKey();
  return fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      "X-Api-Key":    key,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Lista avatares disponíveis na conta HeyGen.
 * Inclui avatares padrão + personalizados (clonados).
 */
export async function listarAvatares(): Promise<HeyGenAvatar[]> {
  const resp = await fetchHG("/v2/avatars");
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`HeyGen /v2/avatars ${resp.status}: ${txt}`);
  }
  const data = await resp.json() as { data?: { avatars?: HeyGenAvatar[] } };
  return data.data?.avatars ?? [];
}

/**
 * Dispara a geração de um vídeo com o avatar e retorna o videoId para polling.
 * A geração é ASSÍNCRONA — chamar buscarStatusVideo() até status='completed'.
 *
 * @param avatarId  ID do avatar HeyGen
 * @param texto     Script do vídeo (o avatar fala este texto)
 * @param voiceId   ID de voz HeyGen (opcional; usa a voz padrão do avatar se omitido)
 */
export async function gerarVideo(
  avatarId: string,
  texto: string,
  voiceId?: string,
): Promise<{ videoId: string }> {
  const body: Record<string, unknown> = {
    video_inputs: [{
      character: {
        type:      "avatar",
        avatar_id: avatarId,
        avatar_style: "normal",
      },
      voice: voiceId
        ? { type: "text", input_text: texto, voice_id: voiceId }
        : { type: "text", input_text: texto },
    }],
    dimension: { width: 1280, height: 720 },
    aspect_ratio: "16:9",
  };

  const resp = await fetchHG("/v2/video/generate", {
    method: "POST",
    body:   JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`HeyGen /v2/video/generate ${resp.status}: ${txt}`);
  }

  const data = await resp.json() as { data?: { video_id?: string }; error?: string };
  const videoId = data.data?.video_id;
  if (!videoId) throw new Error(`HeyGen: video_id ausente na resposta. ${data.error ?? ""}`);
  return { videoId };
}

/**
 * Verifica o status de um vídeo em geração.
 * Retorna a URL do vídeo pronto quando status = 'completed'.
 */
export async function buscarStatusVideo(videoId: string): Promise<HeyGenVideoResult> {
  const resp = await fetchHG(`/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`HeyGen status ${resp.status}: ${txt}`);
  }

  const data = await resp.json() as {
    data?: {
      status?:    HeyGenVideoStatus;
      video_url?: string;
      error?:     string;
    };
  };

  const status    = data.data?.status ?? "pending";
  const videoUrl  = data.data?.video_url ?? undefined;
  const erroMsg   = data.data?.error ?? undefined;

  return { videoId, status, videoUrl, erro: erroMsg };
}

/**
 * Verifica se a chave HeyGen está configurada e funcionando.
 */
export async function checkHeyGenStatus(): Promise<HeyGenStatusResult> {
  try {
    const avatares = await listarAvatares();
    return { ok: true, avatares: avatares.length };
  } catch (e: any) {
    logger.warn({ err: e?.message }, "heygen: check de status falhou");
    return { ok: false, erro: e?.message ?? "Erro desconhecido" };
  }
}
