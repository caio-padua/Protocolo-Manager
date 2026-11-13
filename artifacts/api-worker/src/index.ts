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
import { parseWorkerProfile, startWorkerJobs, type WorkerProfile } from "./worker";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const workerProfile = parseWorkerProfile(process.env.PADAXOR_WORKER_PROFILE);

function categoriaErroSeguro(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string"
      ? err.code
      : "";
  if (code && /^[A-Z0-9_]+$/.test(code)) return code;

  const message = err instanceof Error ? err.message : "";
  if (/DATABASE_URL must be set/i.test(message)) return "database_url_missing";
  if (/APP_ENCRYPTION_KEY|SESSION_SECRET/i.test(message)) return "vault_key_configuration";
  if (/ERR_MODULE_NOT_FOUND|Cannot find package/i.test(message)) return "module_unavailable";
  return "unclassified";
}

const jobsByProfile: Record<WorkerProfile, string[]> = {
  full: [
    "farmacia-22h",
    "lembrete-minuto",
    "receituario-6h",
    "telegram-repasse-1min",
    "drive-watcher-5min",
    "llm-slack-horario",
    "telegram-webhook-guard",
    "device-offer-limits-cleanup-3h",
    "webhook-eventos-purge-mensal",
    "device-verification-purge-315h",
    "cert-expiry-08h",
    "visit-confirmations-10min",
  ],
  "telegram-relay-dev": ["telegram-repasse-1min"],
};

function sendHealthStatus(res: http.ServerResponse, telegramWebhook: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      worker: "api-worker",
      profile: workerProfile,
      jobs: jobsByProfile[workerProfile],
      telegramWebhook,
      ts: new Date().toISOString(),
    })
  );
}

// ─── Health endpoint mínimo para Railway verificar o worker ─────────────────
const server = http.createServer((req, res) => {
  if (req.url === "/worker/status" || req.url === "/") {
    if (workerProfile === "telegram-relay-dev") {
      sendHealthStatus(res, null);
      return;
    }
    // Lê o último check do webhook do módulo já carregado pelo Job 6.
    // O import é síncrono depois do primeiro carregamento (ESM cache),
    // mas usamos .then para não bloquear caso o módulo ainda não tenha
    // terminado de carregar (boot recente).
    import("../../api-server/src/lib/telegram-webhook-guard.js" as string)
      .then(({ getLastWebhookCheck }) => {
        sendHealthStatus(res, getLastWebhookCheck());
      })
      .catch(() => {
        // Módulo não carregou ainda — responde sem o campo do webhook
        sendHealthStatus(res, null);
      });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.WORKER_PORT ?? "8081";
if (workerProfile === "full") {
  server.listen(PORT, () => {
    logger.info({ port: PORT }, "api-worker: health server ouvindo");
  });
} else {
  logger.info(
    { profile: workerProfile },
    "api-worker: endpoint HTTP desativado no perfil restrito de desenvolvimento"
  );
}

// ─── Inicia os jobs ──────────────────────────────────────────────────────────
// Mesma fonte de configuração da API: o cofre (gravado pela tela) vence o ambiente. Sem isto, o
// worker leria o valor antigo do ambiente (ex.: chat de alerta, token do bot, Twilio).
void (async () => {
  try {
    const { hydrateEnvFromVault } = await import("../../api-server/src/lib/secure-settings.js" as string);
    const { hidratadas } = await hydrateEnvFromVault();
    logger.info({ total: hidratadas.length }, "api-worker: segredos do cofre hidratados no ambiente");
  } catch (err) {
    logger.error(
      {
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        errorCategory: categoriaErroSeguro(err),
      },
      "api-worker: falha ao hidratar o cofre (jobs seguem com o ambiente)"
    );
  }
  startWorkerJobs(logger, workerProfile);
})();
