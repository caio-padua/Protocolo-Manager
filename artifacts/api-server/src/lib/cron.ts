// Agendamento do envio noturno em lote para farmácias (22:00 BRT).
import cron from "node-cron";
import { sendNightlyPharmacyBatch } from "./pharmacy-email";
import { executarLembretesPeriodo } from "./lembrete-periodo";
import { logger } from "./logger";
import { processarReceituarioDiario } from "./receituario-worker";

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
  cron.schedule(
    "* * * * *",
    () => {
      executarLembretesPeriodo()
        .then((r) => {
          if (r.enviados > 0 || r.falhas > 0) {
            logger.info(
              { examinados: r.examinados, enviados: r.enviados, falhas: r.falhas, pulados: r.pulados },
              "Tick de lembrete por período",
            );
          }
        })
        .catch((err) => logger.error({ err: err?.message }, "Falha no tick de lembrete por período"));
    },
    { timezone: "America/Sao_Paulo" },
  );

  logger.info("Cron de lembrete por período agendado (tick a cada minuto, BRT)");

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
}
