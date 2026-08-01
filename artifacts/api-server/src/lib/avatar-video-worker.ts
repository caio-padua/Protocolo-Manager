/**
 * avatar-video-worker.ts
 *
 * Worker assíncrono da fila de vídeos HeyGen (avatar_video_queue).
 * Chamado pelo cron a cada 2 minutos. Para cada tarefa na fila:
 *   1. Se status=pendente → chama gerarVideo() no HeyGen e salva o heygenVideoId
 *   2. Se status=gerando  → faz polling buscarStatusVideo(); quando "completed"
 *      envia o link ao destinatário via WhatsApp ou Telegram e marca "entregue"
 *   3. Se tentativas >= MAX_TENTATIVAS → marca "erro" e abandona
 *
 * Nunca lança — todas as falhas são registradas na fila sem derrubar o cron.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { gerarVideo, buscarStatusVideo } from "./heygen";
import { sendWhatsapp } from "./whatsapp";
import { sendTelegram } from "./telegram";
import { registrarUso } from "./avatar-metering";
import { logger } from "./logger";

const MAX_TENTATIVAS = 10;   // ~20 min de polling (10 × 2min)
const POLLING_LIMIT  = 5;    // quantas tarefas "gerando" processar por tick

interface FilaItem {
  id: number;
  empresaId: number;
  avatarId: number;
  clienteId: number | null;
  heygenVideoId: string | null;
  texto: string;
  canalDestino: string;
  destino: string;
  status: string;
  tentativas: number;
  contexto: string | null;
}

async function buscarTarefas(): Promise<FilaItem[]> {
  const rows = await db.execute(sql`
    SELECT id, empresa_id, avatar_id, cliente_id, heygen_video_id,
           texto, canal_destino, destino, status, tentativas, contexto
    FROM avatar_video_queue
    WHERE status IN ('pendente','gerando')
      AND tentativas < ${MAX_TENTATIVAS}
    ORDER BY created_at ASC
    LIMIT ${POLLING_LIMIT}
  `);
  return (rows.rows as any[]).map(r => ({
    id:            Number(r.id),
    empresaId:     Number(r.empresa_id),
    avatarId:      Number(r.avatar_id),
    clienteId:     r.cliente_id ? Number(r.cliente_id) : null,
    heygenVideoId: r.heygen_video_id ?? null,
    texto:         String(r.texto ?? ""),
    canalDestino:  String(r.canal_destino ?? "WHATSAPP"),
    destino:       String(r.destino ?? ""),
    status:        String(r.status ?? "pendente"),
    tentativas:    Number(r.tentativas ?? 0),
    contexto:      r.contexto ?? null,
  }));
}

async function atualizarFila(
  id: number,
  patch: {
    status?: string;
    heygenVideoId?: string;
    videoUrl?: string;
    erro?: string;
    tentativas?: number;
    entregueAt?: Date;
  },
): Promise<void> {
  const sets: string[] = ["tentativas = tentativas + 1"];
  const vals: unknown[] = [];

  if (patch.status)       { sets.push(`status = $${vals.push(patch.status)}`); }
  if (patch.heygenVideoId){ sets.push(`heygen_video_id = $${vals.push(patch.heygenVideoId)}`); }
  if (patch.videoUrl)     { sets.push(`video_url = $${vals.push(patch.videoUrl)}`); }
  if (patch.erro)         { sets.push(`erro = $${vals.push(patch.erro)}`); }
  if (patch.entregueAt)   { sets.push(`entregue_at = $${vals.push(patch.entregueAt.toISOString())}`); }

  // Build raw SQL para não criar dependência de Drizzle por nome de tabela dinâmico
  await db.execute(
    sql.raw(`UPDATE avatar_video_queue SET ${sets.join(", ")} WHERE id = ${id}`)
  );
}

async function buscarVozDoAvatar(avatarId: number): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT heygen_avatar_id FROM clinic_avatars WHERE id = ${avatarId} LIMIT 1
  `);
  return (rows.rows[0] as any)?.heygen_avatar_id ?? null;
}

async function entregarVideo(item: FilaItem, videoUrl: string): Promise<void> {
  const msgTexto = `🎬 *Mensagem em vídeo do seu médico:*\n\n${videoUrl}`;

  if (item.canalDestino === "TELEGRAM") {
    await sendTelegram(item.destino, msgTexto);
  } else {
    // WhatsApp: envia link de vídeo como mensagem de texto (Twilio HeyGen URL)
    await sendWhatsapp(item.destino, msgTexto, {
      contexto: item.contexto ?? "avatar_video",
      clienteId: item.clienteId ?? undefined,
    });
  }
}

export async function processarFilaVideo(): Promise<{ processadas: number; entregues: number; erros: number }> {
  const tarefas = await buscarTarefas();
  let processadas = 0;
  let entregues   = 0;
  let erros       = 0;

  for (const item of tarefas) {
    processadas += 1;

    try {
      // ─ 1. Tarefa PENDENTE: iniciar geração no HeyGen ─────────────────────
      if (item.status === "pendente" && !item.heygenVideoId) {
        const avatarHgId = await buscarVozDoAvatar(item.avatarId);
        if (!avatarHgId) {
          await atualizarFila(item.id, { status: "erro", erro: "avatar sem heygen_avatar_id" });
          erros += 1;
          continue;
        }

        let videoId: string;
        try {
          const resultado = await gerarVideo(avatarHgId, item.texto);
          videoId = resultado.videoId;
        } catch (initErr: any) {
          await atualizarFila(item.id, { status: "erro", erro: initErr?.message ?? "falha ao iniciar HeyGen" });
          erros += 1;
          continue;
        }

        await atualizarFila(item.id, {
          status: "gerando",
          heygenVideoId: videoId,
        });
        logger.info({ fila: item.id, videoId: resultado.videoId }, "[avatar-worker] vídeo em geração");
        continue;
      }

      // ─ 2. Tarefa GERANDO: verificar status no HeyGen ─────────────────────
      if (item.heygenVideoId) {
        const status = await buscarStatusVideo(item.heygenVideoId);

        if (status.status === "completed" && status.videoUrl) {
          // Entregar e registrar
          await entregarVideo(item, status.videoUrl);
          await atualizarFila(item.id, {
            status: "entregue",
            videoUrl: status.videoUrl,
            entregueAt: new Date(),
          });
          // Registrar no metering
          void registrarUso({
            empresaId: item.empresaId,
            avatarId: item.avatarId,
            clienteId: item.clienteId ?? undefined,
            provedor: "heygen",
            tipoUso: "video",
            charsTexto: item.texto.length,
            contexto: item.contexto ?? "video_worker",
            status: "ok",
          });
          entregues += 1;
          logger.info({ fila: item.id }, "[avatar-worker] vídeo entregue");

        } else if (status.status === "failed") {
          await atualizarFila(item.id, { status: "erro", erro: status.error ?? "HeyGen: failed" });
          erros += 1;

        } else {
          // ainda processando: apenas incrementa tentativas
          await atualizarFila(item.id, {});
          logger.debug({ fila: item.id, heygenStatus: status.status }, "[avatar-worker] vídeo ainda processando");
        }
      }

    } catch (err: any) {
      logger.warn({ fila: item.id, err: err?.message }, "[avatar-worker] erro inesperado");
      await atualizarFila(item.id, { erro: err?.message ?? String(err) }).catch(() => {});
    }
  }

  return { processadas, entregues, erros };
}
