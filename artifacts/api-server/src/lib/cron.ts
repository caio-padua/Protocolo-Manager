// Agendamento do envio noturno em lote para farmácias (22:00 BRT).
import cron from "node-cron";
import { sendNightlyPharmacyBatch } from "./pharmacy-email";
import { executarLembretesPeriodo } from "./lembrete-periodo";
import { logger } from "./logger";
import { processarReceituarioDiario } from "./receituario-worker";
import { processarFilaVideo }        from "./avatar-video-worker";
import { processarFilaCampanha, ensureCampanhaSchema } from "./avatar-campanha-worker";

let started = false;

export function startCronJobs(): void {
  if (started) return;
  started = true;

  // 22:00 todos os dias, fuso de São Paulo.
  cron.schedule(
    "0 22 * * *",
    () => {
      logger.info("Disparando lote noturno de farmácias (22:00 BRT)");
      sendNightlyPharmacyBatch().catch((err) => {
        logger.error({ err: err?.message }, "Falha no lote noturno de farmácias");
      });
    },
    { timezone: "America/Sao_Paulo" },
  );

  logger.info("Cron de lote noturno de farmácias agendado para 22:00 BRT");

  // Tick do motor de lembrete por período: a cada minuto (fuso BRT). Cada
  // lembrete só dispara no horário marcado ou até 5 min depois (nunca antes);
  // idempotência por (lembrete_id, janela) garante uma mensagem por janela.
  //
  // ISOLAMENTO: este schedule é independente do worker de campanhas abaixo.
  // O Node.js dispara os dois callbacks concorrentemente (não sequencialmente):
  // como ambos são async e operam em tabelas diferentes, campanhas grandes
  // (centenas de itens) nunca atrasam os lembretes do mesmo minuto.
  cron.schedule(
    "* * * * *",
    () => {
      const t0 = Date.now();
      executarLembretesPeriodo()
        .then((r) => {
          const ms = Date.now() - t0;
          if (r.enviados > 0 || r.falhas > 0) {
            logger.info(
              { examinados: r.examinados, enviados: r.enviados, falhas: r.falhas, pulados: r.pulados, ms },
              "[lembrete-worker] tick concluído",
            );
          } else {
            logger.debug({ examinados: r.examinados, pulados: r.pulados, ms }, "[lembrete-worker] tick sem envios");
          }
        })
        .catch((err) => logger.error({ err: err?.message }, "[lembrete-worker] falha no tick"));
    },
    { timezone: "America/Sao_Paulo" },
  );

  logger.info("Cron de lembrete por período agendado (tick a cada minuto, BRT — isolado do worker de campanhas)");

  // 06:00 todos os dias — libera receituários magistrais do dia (Onda 2)
  cron.schedule(
    "0 6 * * *",
    () => {
      logger.info("Cron receituário 06:00 BRT — iniciando processamento diário");
      processarReceituarioDiario().catch((err) => {
        logger.error({ err: err?.message }, "Falha no processamento diário do receituário");
      });
    },
    { timezone: "America/Sao_Paulo" },
  );

  logger.info("Cron de receituário magistral agendado para 06:00 BRT");

  // Worker de vídeo HeyGen: a cada 2 minutos faz polling na fila
  // avatar_video_queue e entrega links quando o vídeo fica pronto.
  cron.schedule(
    "*/2 * * * *",
    () => {
      processarFilaVideo()
        .then((r) => {
          if (r.processadas > 0) {
            logger.info(r, "[avatar-worker] tick da fila de vídeo");
          }
        })
        .catch((err) => logger.error({ err: err?.message }, "[avatar-worker] falha no tick"));
    },
    { timezone: "America/Sao_Paulo" },
  );

  logger.info("Worker de vídeo HeyGen agendado (tick a cada 2 min, BRT)");

  // Worker de campanhas de avatar (voz/vídeo em massa):
  // processa itens pendentes em avatar_campanha_itens a cada minuto.
  // Retoma automaticamente após restart do servidor (itens ficam no banco).
  void ensureCampanhaSchema().then(() => {
    logger.info("Schema de campanhas de avatar garantido no boot");
  }).catch(err => {
    logger.warn({ err: err?.message }, "Worker de campanhas: falha ao garantir schema no boot");
  });

  // ISOLAMENTO: schedule separado do worker de lembretes acima.
  // Mesmo que a campanha tenha centenas de itens, ela processa LOTE_POR_TICK (10)
  // por tick via claim atômico (FOR UPDATE SKIP LOCKED). O worker de lembretes
  // inicia seu próprio tick concorrentemente, sem aguardar este terminar.
  cron.schedule(
    "* * * * *",
    () => {
      const t0 = Date.now();
      processarFilaCampanha()
        .then((r) => {
          const ms = Date.now() - t0;
          if (r.processadas > 0 || r.leasesRecuperados > 0) {
            logger.info({ ...r, ms }, "[campanha-worker] tick da fila de campanhas");
          } else {
            logger.debug({ ms }, "[campanha-worker] tick sem itens pendentes");
          }
        })
        .catch((err) => logger.error({ err: err?.message }, "[campanha-worker] falha no tick"));
    },
    { timezone: "America/Sao_Paulo" },
  );

  logger.info("Worker de campanhas de avatar agendado (tick a cada 1 min, BRT — isolado do worker de lembretes)");

}
// NOTA: o cron horário de relatório de LLMs (Slack + Telegram) roda APENAS
// em artifacts/api-worker/src/worker.ts (Job 5). Não duplicar aqui.
