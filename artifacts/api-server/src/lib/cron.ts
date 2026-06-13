// Agendamento do envio noturno em lote para farmácias (22:00 BRT).
import cron from "node-cron";
import { sendNightlyPharmacyBatch } from "./pharmacy-email";
import { logger } from "./logger";

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
}
