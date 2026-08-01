// ============================================================================
// MOTOR — porta única de envio (Art. 66). Recebe um PaxterDoc + destino +
// canais e despacha em e-mail, WhatsApp, Telegram, VOICE e VIDEO.
//
// VOICE — gera MP3 via ElevenLabs (avatar da clínica) e envia como nota de
//         voz no WhatsApp (Twilio MediaUrl) ou como anexo no e-mail.
// VIDEO — enfileira geração HeyGen em avatar_video_queue; worker assíncrono
//         entrega o link quando o vídeo fica pronto.
//
// Nunca lança a ponto de quebrar o fluxo de quem chama; cada canal é isolado
// em try/catch. STATUS HONESTO por canal (enviado/mock/erro/pulado).
// ============================================================================
import { sendGmailMessage } from "../google-gmail";
import { sendWhatsapp, sendWhatsappStickerOnly } from "../whatsapp";
import { sendTelegramAnimation, sendTelegramSticker } from "../telegram";
import { renderPaxterEmail, assuntoPadrao } from "./render-email";
import { renderWhatsappCaption, renderTelegramCaption } from "./render-text";
import { baseUrlFromEnv } from "./base-url";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getAvatarAtivoPorEmpresa, limparTextoParaVoz } from "../avatar-messenger";
import { gerarAudio, checkElevenLabsStatus } from "../elevenlabs";
import { setAudioTemp } from "../avatar-messenger";
import { registrarEnvioAvatar } from "../avatar-envios";
import { registrarUso } from "../avatar-metering";
import { logger } from "../logger";
import type {
  PaxterDoc,
  PaxterDestino,
  PaxterCanal,
  PaxterEnvioContexto,
  PaxterCanalResultado,
  PaxterEnvioResultado,
} from "./types";

/** URL pública do banner de marca (servido pela rota /api/brand). */
export function paxterBannerUrl(baseUrl: string): string {
  return `${baseUrl}/api/brand/paxter-banner.png`;
}

/** Banner ANIMADO (faísca) em GIF — Telegram (sendAnimation). */
export function paxterBannerGifUrl(baseUrl: string): string {
  return `${baseUrl}/api/brand/paxter-banner.gif`;
}

/** Banner ANIMADO (faísca) em MP4 — WhatsApp via Twilio (não aceita GIF). */
export function paxterBannerMp4Url(baseUrl: string): string {
  return `${baseUrl}/api/brand/paxter-banner.mp4`;
}

/** Figurinha animada WebP 512x512 — final de cada mensagem WhatsApp/Telegram.
 *  Decisão do CEO (15/07/2026): sticker encerra o contato, nunca o abre. */
export function paxterStickerUrl(baseUrl: string): string {
  return `${baseUrl}/api/brand/paxter-sticker.webp`;
}

// ─── Helpers de VOICE ────────────────────────────────────────────────────────

/** Extrai o texto falado de um PaxterDoc (parágrafos como script). */
function docParaScript(doc: PaxterDoc): string {
  const partes: string[] = [];
  if (doc.titulo) partes.push(doc.titulo + ".");
  for (const p of doc.paragrafos) {
    const limpo = p.replace(/[*_~`]/g, "").replace(/\n/g, " ").trim();
    if (limpo) partes.push(limpo);
  }
  if (doc.notaRodape) partes.push(doc.notaRodape);
  return limparTextoParaVoz(partes.join(" "));
}

// ─── Helpers de VIDEO ────────────────────────────────────────────────────────

/** Enfileira geração de vídeo HeyGen (avatar_video_queue). */
async function enfileirarVideo(args: {
  empresaId: number;
  avatarId: number;
  clienteId?: number;
  texto: string;
  canalDestino: string;
  destino: string;
  contexto?: string;
}): Promise<number | null> {
  try {
    const rows = await db.execute(sql`
      INSERT INTO avatar_video_queue
        (empresa_id, avatar_id, cliente_id, texto, canal_destino, destino, status, contexto)
      VALUES (${args.empresaId}, ${args.avatarId}, ${args.clienteId ?? null},
              ${args.texto}, ${args.canalDestino}, ${args.destino},
              'pendente', ${args.contexto ?? null})
      RETURNING id
    `);
    return Number((rows.rows[0] as any)?.id ?? 0) || null;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[hermes] falha ao enfileirar vídeo");
    return null;
  }
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export async function enviarMensagemPaxter(
  doc: PaxterDoc,
  destino: PaxterDestino,
  canais: PaxterCanal[],
  ctx: PaxterEnvioContexto = {},
): Promise<PaxterEnvioResultado> {
  const baseUrl    = ctx.baseUrl || baseUrlFromEnv();
  const bannerUrl  = paxterBannerUrl(baseUrl);
  const stickerUrl = paxterStickerUrl(baseUrl);
  const resultados: PaxterCanalResultado[] = [];

  for (const canal of canais) {
    // ── EMAIL ────────────────────────────────────────────────────────────────
    if (canal === "EMAIL") {
      const to = destino.email?.trim();
      if (!to) {
        resultados.push({ canal, sent: false, skipped: true });
        continue;
      }
      try {
        const r = await sendGmailMessage({
          to,
          subject: assuntoPadrao(doc),
          html: renderPaxterEmail(doc, baseUrl),
          attachments: doc.anexos,
        });
        resultados.push({ canal, sent: r.success, via: "gmail", error: r.error });
      } catch (e: unknown) {
        resultados.push({ canal, sent: false, via: "gmail", error: (e as Error)?.message ?? String(e) });
      }

    // ── WHATSAPP ─────────────────────────────────────────────────────────────
    } else if (canal === "WHATSAPP") {
      const phone = destino.telefone?.trim();
      if (!phone) {
        resultados.push({ canal, sent: false, skipped: true });
        continue;
      }
      try {
        // 1ª mensagem: banner estático (PNG) + texto. Decisão CEO 15/07/2026.
        const r = await sendWhatsapp(phone, renderWhatsappCaption(doc), {
          mediaUrl: bannerUrl,
        });
        resultados.push({ canal, sent: r.sent, via: r.via, link: r.link, error: r.error });
        // 2ª mensagem: figurinha animada no final (best-effort, não afeta resultado).
        if (r.sent) {
          void sendWhatsappStickerOnly(phone, stickerUrl, { contexto: "sticker_final" });
        }
      } catch (e: unknown) {
        resultados.push({ canal, sent: false, via: "twilio", error: (e as Error)?.message ?? String(e) });
      }

    // ── TELEGRAM ─────────────────────────────────────────────────────────────
    } else if (canal === "TELEGRAM") {
      const chatId = destino.telegramChatId?.trim();
      if (!chatId) {
        resultados.push({ canal, sent: false, skipped: true });
        continue;
      }
      try {
        const r = await sendTelegramAnimation(chatId, paxterBannerGifUrl(baseUrl), bannerUrl, renderTelegramCaption(doc));
        resultados.push({ canal, sent: r.sent, via: "telegram", mock: r.mock, error: r.error });
        if (r.sent && !r.mock) {
          void sendTelegramSticker(chatId, stickerUrl);
        }
      } catch (e: unknown) {
        resultados.push({ canal, sent: false, via: "telegram", error: (e as Error)?.message ?? String(e) });
      }

    // ── VOICE (ElevenLabs MP3) ────────────────────────────────────────────────
    // Gera áudio com a voz do avatar da clínica e envia:
    //   WhatsApp: Twilio MediaUrl (MP3 em cache com TTL 5min)
    //   Email:    anexo MP3
    //   Outros:   ignorado (skipped honesto)
    } else if (canal === "VOICE") {
      const empresaId = ctx.empresaId;
      if (!empresaId) {
        resultados.push({ canal, sent: false, skipped: true, error: "empresaId ausente no contexto" });
        continue;
      }

      try {
        // Localizar avatar ativo com ElevenLabs configurado
        const avatar = ctx.avatarId
          ? await (async () => {
              // avatarId explícito — busca direto no banco
              const rows = await db.execute(sql`
                SELECT id, empresa_id, tipo, nome_exibido, elevenlabs_voice_id, heygen_avatar_id
                FROM clinic_avatars WHERE id = ${ctx.avatarId} AND status = 'ativo' LIMIT 1
              `);
              const r = rows.rows[0] as any;
              if (!r || !r.elevenlabs_voice_id) return null;
              return {
                id: Number(r.id), empresaId: Number(r.empresa_id),
                tipo: Number(r.tipo), nomeExibido: String(r.nome_exibido ?? ""),
                elevenLabsVoiceId: String(r.elevenlabs_voice_id),
                heygenAvatarId: r.heygen_avatar_id ?? null,
              };
            })()
          : await getAvatarAtivoPorEmpresa(empresaId);

        if (!avatar) {
          resultados.push({ canal, sent: false, skipped: true, error: "avatar não configurado" });
          continue;
        }

        const script = docParaScript(doc);
        if (!script.trim()) {
          resultados.push({ canal, sent: false, skipped: true, error: "script vazio" });
          continue;
        }

        // Gerar MP3 via ElevenLabs
        const mp3Buffer = await gerarAudio(script, avatar.elevenLabsVoiceId);

        // Registrar metering
        void registrarUso({
          empresaId,
          avatarId: avatar.id,
          clienteId: ctx.clienteId,
          provedor: "elevenlabs",
          tipoUso: "voz",
          charsTexto: script.length,
          contexto: ctx.contexto ?? "hermes_voice",
          status: "ok",
        });

        // Envio via WhatsApp: cache + MediaUrl
        const phone = destino.telefone?.trim();
        if (phone) {
          const audioKey = setAudioTemp(mp3Buffer);
          const audioUrl = `${baseUrl}/api/avatares/audio-temp/${audioKey}`;

          const r = await sendWhatsapp(phone, "🎵 Mensagem de voz do seu médico:", {
            mediaUrl: audioUrl,
            contexto: ctx.contexto ?? "hermes_voice",
            clienteId: ctx.clienteId,
          });

          resultados.push({ canal, sent: r.sent, via: "elevenlabs", audioUrl, error: r.error });

          // Registrar histórico de envio
          void registrarEnvioAvatar({
            empresaId, avatarId: avatar.id, clienteId: ctx.clienteId,
            canal: "VOICE", canalEntrega: "WHATSAPP",
            textoEnviado: script.slice(0, 500),
            status: r.sent ? "ok" : "erro",
            erro: r.error, contexto: ctx.contexto,
          });
          continue;
        }

        // Envio via Email: anexo MP3
        const email = destino.email?.trim();
        if (email) {
          const docComAnexo: PaxterDoc = {
            ...doc,
            anexos: [
              ...(doc.anexos ?? []),
              { filename: "mensagem-do-seu-medico.mp3", content: mp3Buffer, contentType: "audio/mpeg" },
            ],
          };
          const r = await sendGmailMessage({
            to: email,
            subject: assuntoPadrao(doc),
            html: renderPaxterEmail(docComAnexo, baseUrl),
            attachments: docComAnexo.anexos,
          });
          resultados.push({ canal, sent: r.success, via: "elevenlabs+gmail", error: r.error });

          void registrarEnvioAvatar({
            empresaId, avatarId: avatar.id, clienteId: ctx.clienteId,
            canal: "VOICE", canalEntrega: "EMAIL",
            textoEnviado: script.slice(0, 500),
            status: r.success ? "ok" : "erro",
            erro: r.error, contexto: ctx.contexto,
          });
          continue;
        }

        resultados.push({ canal, sent: false, skipped: true, error: "sem telefone nem email para VOICE" });

      } catch (e: unknown) {
        logger.warn({ err: (e as Error)?.message }, "[hermes] VOICE falhou");
        resultados.push({ canal, sent: false, via: "elevenlabs", error: (e as Error)?.message ?? String(e) });
      }

    // ── VIDEO (HeyGen — assíncrono) ───────────────────────────────────────────
    // Enfileira no avatar_video_queue. O worker (cron 2min) faz polling e entrega.
    // O canal retorna imediatamente com videoQueueId para acompanhamento.
    } else if (canal === "VIDEO") {
      const empresaId = ctx.empresaId;
      if (!empresaId) {
        resultados.push({ canal, sent: false, skipped: true, error: "empresaId ausente no contexto" });
        continue;
      }

      try {
        const avatar = ctx.avatarId
          ? await (async () => {
              const rows = await db.execute(sql`
                SELECT id, heygen_avatar_id FROM clinic_avatars
                WHERE id = ${ctx.avatarId} AND status = 'ativo' LIMIT 1
              `);
              const r = rows.rows[0] as any;
              if (!r || !r.heygen_avatar_id) return null;
              return { id: Number(r.id), heygenAvatarId: String(r.heygen_avatar_id) };
            })()
          : await (async () => {
              const av = await getAvatarAtivoPorEmpresa(empresaId);
              if (!av || !av.heygenAvatarId) return null;
              return { id: av.id, heygenAvatarId: av.heygenAvatarId };
            })();

        if (!avatar) {
          resultados.push({ canal, sent: false, skipped: true, error: "avatar sem HeyGen configurado" });
          continue;
        }

        const script = docParaScript(doc);
        const canalDestino = destino.telegramChatId ? "TELEGRAM" : "WHATSAPP";
        const destFinal    = (canalDestino === "TELEGRAM" ? destino.telegramChatId : destino.telefone) ?? "";

        if (!destFinal.trim()) {
          resultados.push({ canal, sent: false, skipped: true, error: "sem destino para VIDEO" });
          continue;
        }

        const queueId = await enfileirarVideo({
          empresaId,
          avatarId:     avatar.id,
          clienteId:    ctx.clienteId,
          texto:        script,
          canalDestino,
          destino:      destFinal,
          contexto:     ctx.contexto ?? "hermes_video",
        });

        resultados.push({ canal, sent: true, via: "heygen_queued", videoQueueId: queueId ?? undefined });

        void registrarEnvioAvatar({
          empresaId, avatarId: avatar.id, clienteId: ctx.clienteId,
          canal: "VIDEO", canalEntrega: canalDestino,
          textoEnviado: script.slice(0, 500),
          status: "ok", contexto: ctx.contexto,
        });

      } catch (e: unknown) {
        logger.warn({ err: (e as Error)?.message }, "[hermes] VIDEO falhou");
        resultados.push({ canal, sent: false, via: "heygen", error: (e as Error)?.message ?? String(e) });
      }
    }
  }

  return { resultados, algumEnviado: resultados.some((r) => r.sent) };
}
