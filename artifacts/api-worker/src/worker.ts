/**
 * worker.ts — Lógica dos 4 jobs agendados do PADAXOR
 *
 * ATENÇÃO: Este arquivo foi migrado de:
 *   - artifacts/api-server/src/lib/cron.ts (3 jobs cron)
 *   - artifacts/api-server/src/app.ts (setInterval do Drive Watcher)
 *
 * A lógica de negócio é IDÊNTICA — nenhuma alteração de comportamento.
 * Apenas a localização mudou.
 *
 * O api-server deixou de chamar startCronJobs() e o Drive Watcher.
 * Este worker é a única fonte de verdade dos jobs.
 */

import cron from "node-cron";
import type pino from "pino";

let started = false;

export function startWorkerJobs(logger: pino.Logger): void {
  if (started) return;
  started = true;

  // ─── Job 1: Farmácia 22h BRT ────────────────────────────────────────────
  cron.schedule(
    "0 22 * * *",
    async () => {
      logger.info("Worker: disparando lote noturno de farmácias (22:00 BRT)");
      try {
        const { sendNightlyPharmacyBatch } = await import(
          "../../api-server/src/lib/pharmacy-email.js" as string
        );
        await sendNightlyPharmacyBatch();
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "Worker: falha no lote noturno de farmácias"
        );
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  // ─── Job 2: Lembrete por período — tick a cada minuto ───────────────────
  cron.schedule(
    "* * * * *",
    async () => {
      try {
        const { executarLembretesPeriodo } = await import(
          "../../api-server/src/lib/lembrete-periodo.js" as string
        );
        const r = await executarLembretesPeriodo();
        if (r.enviados > 0 || r.falhas > 0) {
          logger.info(
            { examinados: r.examinados, enviados: r.enviados, falhas: r.falhas, pulados: r.pulados },
            "Worker: tick de lembrete por período"
          );
        }
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "Worker: falha no tick de lembrete por período"
        );
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  // ─── Job 3: Receituário magistral 06h BRT ───────────────────────────────
  cron.schedule(
    "0 6 * * *",
    async () => {
      logger.info("Worker: cron receituário 06:00 BRT — iniciando processamento diário");
      try {
        const { processarReceituarioDiario } = await import(
          "../../api-server/src/lib/receituario-worker.js" as string
        );
        await processarReceituarioDiario();
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "Worker: falha no processamento diário do receituário"
        );
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  // ─── Job 4: Drive Watcher — a cada 5 minutos ────────────────────────────
  let driveRunning = false;

  async function runDriveWatcher() {
    if (driveRunning) return;
    driveRunning = true;
    try {
      const { processWatchedFolders } = await import(
        "../../api-server/src/lib/drive-watcher.js" as string
      );
      await processWatchedFolders({ maxFiles: 50 });
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "Worker: drive-watcher erro"
      );
    } finally {
      driveRunning = false;
    }
  }

  setTimeout(() => void runDriveWatcher(), 2 * 60 * 1000);
  void runDriveWatcher();
  setInterval(() => void runDriveWatcher(), 5 * 60 * 1000);

  logger.info(
    "Worker iniciado. Jobs ativos: farmácia-22h, lembrete-minuto, receituário-6h, drive-watcher-5min"
  );
}
