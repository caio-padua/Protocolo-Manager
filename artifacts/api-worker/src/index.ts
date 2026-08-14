/**
 * api-worker — Worker de jobs agendados do PADAXOR
 *
 * ÚNICO PROCESSO para todos os cron jobs. Sempre 1 réplica (nunca autoscalar).
 * Compartilha o banco com o api-server mas NÃO sobe HTTP (exceto /worker/status).
 *
 * Jobs ativos:
 *   - farmácia 22h BRT     (sendNightlyPharmacyBatch)
 *   - lembrete por minuto  (executarLembretesPeriodo)
 *   - receituário 06h BRT  (processarReceituarioDiario)
 *   - Drive watcher 5min   (processWatchedFolders)
 *   - LLM Slack 08h BRT    (buildLlmReport + postSlackReport → #padaxor-projeto)
 *
 * Para Railway: startCommand = "pnpm --filter @workspace/api-worker run start"
 *               numReplicas  = 1   ← NUNCA alterar
 */

import http from "http";
import { startWorkerJobs } from "./worker";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// ─── Health endpoint mínimo para Railway verificar o worker ─────────────────
const server = http.createServer((req, res) => {
  if (req.url === "/worker/status" || req.url === "/") {
    // Lê o último check do webhook do módulo já carregado pelo Job 6.
    // O import é síncrono depois do primeiro carregamento (ESM cache),
    // mas usamos .then para não bloquear caso o módulo ainda não tenha
    // terminado de carregar (boot recente).
    import("../../api-server/src/lib/telegram-webhook-guard.js" as string)
      .then(({ getLastWebhookCheck }) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            worker: "api-worker",
            jobs: ["farmacia-22h", "lembrete-minuto", "receituario-6h", "drive-watcher-5min", "llm-slack-8h", "telegram-webhook-guard"],
            telegramWebhook: getLastWebhookCheck(),
            ts: new Date().toISOString(),
          })
        );
      })
      .catch(() => {
        // Módulo não carregou ainda — responde sem o campo do webhook
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            worker: "api-worker",
            jobs: ["farmacia-22h", "lembrete-minuto", "receituario-6h", "drive-watcher-5min", "llm-slack-8h", "telegram-webhook-guard"],
            telegramWebhook: null,
            ts: new Date().toISOString(),
          })
        );
      });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.WORKER_PORT ?? "8081";
server.listen(PORT, () => {
  logger.info({ port: PORT }, "api-worker: health server ouvindo");
});

// ─── Inicia os jobs ──────────────────────────────────────────────────────────
startWorkerJobs(logger);
