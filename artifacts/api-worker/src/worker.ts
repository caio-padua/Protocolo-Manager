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

export type WorkerProfile = "full" | "telegram-relay-dev";
type CronScheduler = Pick<typeof cron, "schedule">;

let startedProfile: WorkerProfile | null = null;

export function parseWorkerProfile(value: string | undefined): WorkerProfile {
  if (value === undefined || value === "full") return "full";
  if (value === "telegram-relay-dev") return value;
  throw new Error(`Perfil de api-worker inválido: ${value}`);
}

export function categorizarErroDeWorker(err: unknown): string {
  const vistos = new Set<unknown>();
  let atual: unknown = err;
  while (atual && typeof atual === "object" && !vistos.has(atual)) {
    vistos.add(atual);
    const item = atual as { code?: unknown; message?: unknown; cause?: unknown };
    const code = typeof item.code === "string" ? item.code : "";
    if (code && /^[A-Z0-9_]+$/.test(code)) return code;

    const message = typeof item.message === "string" ? item.message : "";
    if (/DATABASE_URL must be set/i.test(message)) return "database_url_missing";
    if (/APP_ENCRYPTION_KEY|SESSION_SECRET/i.test(message)) return "vault_key_configuration";
    if (/ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED|Cannot find package|Cannot find module/i.test(message)) {
      return "module_unavailable";
    }
    if (/Dynamic require of .* is not supported/i.test(message)) {
      return "esm_commonjs_dynamic_require";
    }
    if (/telegram_repasse_ceo.*does not exist|relation .*does not exist/i.test(message)) {
      return "database_schema_unavailable";
    }
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|connection terminated|connect timeout/i.test(message)) {
      return "database_connection_failed";
    }
    atual = item.cause;
  }
  return "unclassified";
}

export function resumoErroSeguro(err: unknown): string {
  if (!(err instanceof Error)) return typeof err;
  return err.message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url-redacted]")
    .replace(/https?:\/\/[^\s"'`]+/gi, "[url-redacted]")
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[token-redacted]")
    .replace(/\b(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]")
    .replace(/\b\d{5,20}\b/g, "[id-redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 160);
}

function iniciarJobRepasseTelegram(logger: pino.Logger, scheduler: CronScheduler, atendimento = false): void {
  let repasseRodando = false;
  let primeiroTickConcluido = false;
  scheduler.schedule(
    "* * * * *",
    async () => {
      if (repasseRodando) return;
      repasseRodando = true;
      try {
        const { processarRepassesPendentes } = await import(
          "../../api-server/src/lib/telegram-repasse-worker.js" as string
        );
        const resultado = await processarRepassesPendentes({ atendimento });
        if (
          !primeiroTickConcluido ||
          resultado.incertosNovos > 0 ||
          resultado.examinados > 0
        ) {
          logger.info(
            {
              examinados: resultado.examinados,
              aceitos: resultado.aceitos,
              falhas: resultado.falhas,
              incertosNovos: resultado.incertosNovos,
            },
            "Worker: retomada de repasses do Telegram"
          );
        }
        primeiroTickConcluido = true;
      } catch (err) {
        logger.error(
          {
            errorType: err instanceof Error ? err.constructor.name : typeof err,
            errorCategory: categorizarErroDeWorker(err),
          },
          "Worker: falha na retomada de repasses do Telegram"
        );
      } finally {
        repasseRodando = false;
      }
    },
    { timezone: "America/Sao_Paulo" }
  );
}

/**
 * Job 2: lembrete por período (tick a cada minuto). Função própria apenas para poder ser executada
 * isoladamente em verificação; é o MESMO agendamento e o MESMO motor usados pelo worker completo.
 */
export function iniciarJobLembretes(logger: pino.Logger): void {
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
}

export function startWorkerJobs(
  logger: pino.Logger,
  profile: WorkerProfile = "full",
  scheduler: CronScheduler = cron
): void {
  if (startedProfile) {
    if (startedProfile !== profile) {
      throw new Error(
        `api-worker já iniciado no perfil ${startedProfile}; não pode iniciar também ${profile}`
      );
    }
    return;
  }
  startedProfile = profile;

  if (profile === "telegram-relay-dev") {
    iniciarJobRepasseTelegram(logger, scheduler);
    logger.info(
      { profile, jobs: ["telegram-relay-1min"] },
      "api-worker iniciado em perfil restrito de desenvolvimento"
    );
    return;
  }

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
  iniciarJobLembretes(logger);

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

  // ─── Job 3b: Retomada dos repasses do Telegram ao chat de alerta — a cada minuto ───
  // Reenvia o que ficou pendente/falhou (com espera crescente). "incerto" NUNCA é reenviado sozinho.
  iniciarJobRepasseTelegram(logger, cron, true);

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

  // ─── Job 5: Monitor horário de LLMs + planilha no Slack ────────────────
  // Roda todo início de hora (XX:00), 24h/dia.
  // Só executa na instância CEO (PADAXOR_AI_BYPASS=true). Fail-safe total.
  // Detecta mudanças na planilha de produção e anota termos técnicos com (*N).
  // A lógica de despacho dual-canal vive em llm-monitor-dispatch.ts (testável).
  // Quando o Telegram falha, postTelegramReport posta aviso de fallback no Slack
  // usando slackFallbackChannelId (Task 34 — retry automático + fallback).
  cron.schedule(
    "0 * * * *",
    async () => {
      if (process.env.PADAXOR_AI_BYPASS !== "true") return; // clone: ignora silenciosamente
      const channelId      = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";
      // Fonte única do chat de alerta (cofre > ambiente, validado): o worker não hidrata o ambiente.
      const { chatAlertaOuNull } = await import("../../api-server/src/lib/telegram-config.js" as string);
      const telegramChatId: string = (await chatAlertaOuNull()) ?? "";
      logger.info(
        { channelId, telegramChatId: telegramChatId || "(não configurado)" },
        "Worker: gerando monitor horário (LLMs + planilha)"
      );

      // Importar módulos sob demanda — evita ciclo de boot
      const [reporter, dispatch] = await Promise.all([
        import("../../api-server/src/lib/slack-reporter.js" as string).catch((err: unknown) => {
          logger.error(
            { err: err instanceof Error ? err.message : String(err) },
            "Worker: falha ao importar slack-reporter"
          );
          return null;
        }),
        import("../../api-server/src/lib/llm-monitor-dispatch.js" as string).catch(() => null),
      ]);
      if (!reporter || !dispatch) return;

      // Delegar despacho dual-canal ao helper testável.
      // slackFallbackChannelId: se Telegram falhar após retentativas, avisa o Slack (Task 34).
      const result = await dispatch.runLlmMonitorJob(
        {
          channelId,
          telegramChatId,
          slackFallbackChannelId: channelId,
        },
        {
          buildLlmReport:     reporter.buildLlmReport,
          postSlackReport:    reporter.postSlackReport,
          postTelegramReport: reporter.postTelegramReport,
          // R2 (spec llm-monitor-telegram-fallback): grava registro "ambos" ao final
          salvarHistorico:    reporter.salvarHistorico,
        },
        logger,
      );

      if (result.reportBuilt) {
        logger.info(
          {
            slackOk:       result.slackOk,
            telegramOk:    result.telegramOk,
            slackError:    result.slackError,
            telegramError: result.telegramError,
          },
          "Worker: ciclo monitor horário concluído"
        );
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  // ─── Job 6: Telegram Webhook Guard — a cada 5 minutos ──────────────────
  // Verifica se o webhook do @Paduaclinica_bot ainda está registrado no Telegram.
  // Polling ativo em outro processo desativa o webhook silenciosamente e impede
  // que mensagens dos pacientes cheguem ao CEO. Alerta via Slack + Telegram CEO.
  import("../../api-server/src/lib/telegram-webhook-guard.js" as string)
    .then(({ startWebhookGuard }) => {
      startWebhookGuard(logger);
    })
    .catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "Worker: falha ao carregar telegram-webhook-guard"
      );
    });

  // ─── Job 7: Limpeza de device_offer_limits — diária às 03h BRT ────────────
  // Apaga linhas com dia_brt < CURRENT_DATE - 2 dias para evitar crescimento
  // indefinido da tabela (análogo ao cleanup de idempotência #165).
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        const { purgeOldDeviceOfferLimits } = await import(
          "../../api-server/src/lib/concierge-device-throttle.js" as string
        );
        const removed = await purgeOldDeviceOfferLimits();
        logger.info(
          { removed },
          "Worker: limpeza de device_offer_limits concluída"
        );
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "Worker: falha na limpeza de device_offer_limits"
        );
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  // ─── Job 9: Limpeza de device_contact_verifications e device_verified_sessions ─
  // Apaga linhas com expires_at < NOW() das duas tabelas de verificação OTP.
  // device_contact_verifications expira em 10 min; device_verified_sessions em 90 dias.
  // Roda no boot (captura acúmulo antes desta versão) e diariamente às 03:15 BRT.
  async function runDeviceVerificationPurge() {
    try {
      const { purgeExpiredVerificationCodes, purgeExpiredVerifiedSessions } = await import(
        "../../api-server/src/lib/device-throttle.js" as string
      );
      const [codes, sessions] = await Promise.all([
        purgeExpiredVerificationCodes(),
        purgeExpiredVerifiedSessions(),
      ]);
      if (codes > 0 || sessions > 0) {
        logger.info({ codes, sessions }, "Worker: limpeza de verificações OTP concluída");
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "Worker: falha na limpeza de verificações OTP"
      );
    }
  }

  void runDeviceVerificationPurge();

  cron.schedule(
    "15 3 * * *",
    async () => {
      logger.info("Worker: limpeza diária 03:15 BRT — device_contact_verifications e device_verified_sessions");
      await runDeviceVerificationPurge();
    },
    { timezone: "America/Sao_Paulo" }
  );

  // ─── Job 8: Purga mensal de concierge_webhook_eventos ─────────────────────
  // Apaga linhas com registrado_at < NOW() - 90 dias para evitar crescimento
  // indefinido da tabela de idempotência de webhooks do Asaas. A janela de
  // reenvio do Asaas é de horas; registros com >90 dias não servem mais para
  // deduplicação. Roda no dia 1 de cada mês às 03:30 BRT e uma vez no boot.
  const runPurgaEventos = async (origem: "boot" | "cron") => {
    logger.info(
      `Worker: purga de concierge_webhook_eventos iniciada (origem=${origem}, TTL=90 dias)`
    );
    try {
      const { purgeEventosAntigos } = await import(
        "../../api-server/src/lib/concierge-penalidade.js" as string
      );
      const removidas = await purgeEventosAntigos();
      logger.info(
        { removidas, origem },
        "Worker: purga de concierge_webhook_eventos concluída"
      );
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), origem },
        "Worker: falha na purga de concierge_webhook_eventos"
      );
    }
  };

  cron.schedule(
    "30 3 1 * *",
    () => runPurgaEventos("cron"),
    { timezone: "America/Sao_Paulo" }
  );

  // Purga imediata no boot — garante o log de boot exigido pela spec e limpa
  // registros acumulados antes do primeiro cron mensal.
  void runPurgaEventos("boot");

  // ─── Job 10: Verificação diária do certificado ICP-Brasil (PAdES) ──────────
  // Carrega o cache do certificado (Object Storage / cofre) e verifica o prazo.
  // Se faltarem < 30 dias (menos de 30 dias exatos), envia alerta urgente ao CEO via Slack.
  // Roda no boot do worker e diariamente às 08h BRT para não duplicar entre
  // réplicas Railway (o setInterval do api-server foi removido; este worker é
  // a única fonte de execução periódica, conforme a arquitetura da Onda 2).
  async function runCertExpiryCheck(origem: "boot" | "cron") {
    try {
      const certSource = await import(
        "../../api-server/src/lib/cert-source.js" as string
      );
      await certSource.refreshCertCache();
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "Worker: falha ao carregar cache do certificado antes da verificação de prazo"
      );
      // Segue mesmo sem cache — o fallback de arquivo local ainda pode funcionar.
    }

    try {
      const { checkCertExpiryAndAlert } = await import(
        "../../api-server/src/lib/cert-expiry-alert.js" as string
      );
      await checkCertExpiryAndAlert();
      logger.info(
        { origem },
        "Worker: verificação de prazo do certificado ICP-Brasil concluída"
      );
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), origem },
        "Worker: falha na verificação de prazo do certificado ICP-Brasil"
      );
    }
  }

  // Verificação imediata no boot do worker.
  void runCertExpiryCheck("boot");

  // Cron diário às 08:00 BRT — garante alerta mesmo após o boot.
  cron.schedule(
    "0 8 * * *",
    () => runCertExpiryCheck("cron"),
    { timezone: "America/Sao_Paulo" }
  );

  // ─── Job 10: Confirmação do cliente por visita (K8) — a cada 10 min ───────
  // Envia os lembretes vencidos: até 3 e-mails ao cliente (no ato, +24 h, +48 h)
  // e o aviso final à gestão (24 h após o 3º). Cada envio é reservado por UPDATE
  // condicional antes de sair (nunca duplica, mesmo com duas execuções juntas).
  // As tabelas são garantidas aqui também: o worker pode subir antes da API.
  let visitConfirmationsReady = false;
  let visitConfirmationsRunning = false;
  cron.schedule(
    "*/10 * * * *",
    async () => {
      if (visitConfirmationsRunning) return;
      visitConfirmationsRunning = true;
      try {
        if (!visitConfirmationsReady) {
          const { ensureVisitConfirmations } = await import(
            "../../api-server/src/lib/ensure-visit-confirmations.js" as string
          );
          await ensureVisitConfirmations();
          visitConfirmationsReady = true;
        }
        const { dispatchDue } = await import("../../api-server/src/lib/visit-confirmation.js" as string);
        const { realChannels } = await import("../../api-server/src/lib/visit-confirmation-channels.js" as string);
        const r = await dispatchDue(realChannels);
        if (r.clienteEmails + r.gestaoInicio + r.gestaoFinal + r.falhas + r.curados > 0) {
          logger.info(
            { clienteEmails: r.clienteEmails, gestaoInicio: r.gestaoInicio, gestaoFinal: r.gestaoFinal, falhas: r.falhas, curados: r.curados },
            "Worker: lembretes de confirmação do cliente"
          );
        }
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "Worker: falha nos lembretes de confirmação do cliente"
        );
      } finally {
        visitConfirmationsRunning = false;
      }
    },
    { timezone: "America/Sao_Paulo" }
  );

  logger.info(
    "Worker iniciado. Jobs ativos: farmácia-22h, lembrete-minuto, receituário-6h, telegram-repasse-1min, drive-watcher-5min, slack-monitor-horário, telegram-webhook-guard, device-offer-limits-cleanup-3h, webhook-eventos-purge-mensal, device-verification-purge-315h, cert-expiry-08h, visit-confirmations-10min"
  );
}
