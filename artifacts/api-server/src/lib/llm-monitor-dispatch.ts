/**
 * llm-monitor-dispatch.ts
 *
 * Lógica de despacho dual-canal (Slack + Telegram) do Monitor Horário de LLMs.
 *
 * Separado do worker.ts para permitir testes de integração sem dependência de
 * agendadores (cron) ou variáveis de ambiente de produção.
 *
 * Regra de ouro: falha num canal NÃO derruba o outro.
 * Cada canal é envolvido em try/catch independente.
 */

import type pino from "pino";
import type { LlmReport } from "./slack-reporter";

// ---------------------------------------------------------------------------
// Tipos das dependências injetáveis (facilita mock nos testes)
// ---------------------------------------------------------------------------
export type BuildReportFn       = (horas?: number) => Promise<LlmReport>;
export type PostSlackFn         = (channelId: string, report: LlmReport) => Promise<void>;
export type PostTelegramFn      = (chatId: string, report: LlmReport, fallbackSlackChannelId?: string) => Promise<void>;
export type SalvarHistoricoFn   = (report: LlmReport, canal: "slack" | "telegram" | "ambos", ok: boolean, erro?: string) => Promise<void>;

export interface LlmMonitorDeps {
  buildLlmReport:     BuildReportFn;
  postSlackReport:    PostSlackFn;
  postTelegramReport: PostTelegramFn;
  /** Opcional — quando presente, grava um registro "ambos" ao final do ciclo */
  salvarHistorico?:   SalvarHistoricoFn;
}

export interface LlmMonitorConfig {
  channelId:       string;  // Slack channel ID
  telegramChatId:  string;  // Telegram chat ID (vazio = ignorado)
  horas?:          number;  // janela de coleta (padrão: 1)
  // Quando configurado, postTelegramReport usa este canal para postar aviso
  // de fallback no Slack caso todas as tentativas ao Telegram falhem (Task 34).
  slackFallbackChannelId?: string;
}

export interface LlmMonitorResult {
  reportBuilt:      boolean;
  slackOk:          boolean;
  slackError?:      string;
  telegramOk:       boolean;
  telegramError?:   string;
  telegramSkipped:  boolean; // true quando telegramChatId está vazio
}

/**
 * Executa um ciclo completo do monitor horário de LLMs:
 *   1. Constrói o relatório (buildLlmReport)
 *   2. Posta no Slack   — fail-safe independente
 *   3. Posta no Telegram — fail-safe independente do Slack
 *
 * Retorna um sumário com o resultado de cada etapa.
 * Nunca relança exceção — todas as falhas são capturadas e devolvidas em
 * `slackError` / `telegramError`.
 */
export async function runLlmMonitorJob(
  config:  LlmMonitorConfig,
  deps:    LlmMonitorDeps,
  logger?: Pick<pino.Logger, "info" | "warn" | "error">,
): Promise<LlmMonitorResult> {
  const result: LlmMonitorResult = {
    reportBuilt:     false,
    slackOk:         false,
    telegramOk:      false,
    telegramSkipped: !config.telegramChatId,
  };

  // ── 1. Construir relatório ─────────────────────────────────────────────
  let report: LlmReport;
  try {
    report = await deps.buildLlmReport(config.horas ?? 1);
    result.reportBuilt = true;
  } catch (err) {
    logger?.error(
      { err: err instanceof Error ? err.message : String(err) },
      "llm-monitor: falha ao construir relatório — nenhum canal será acionado"
    );
    return result; // sem relatório, nada a postar
  }

  // ── 2. Slack — fail-safe independente ───────────────────────────────────
  try {
    await deps.postSlackReport(config.channelId, report);
    result.slackOk = true;
    logger?.info(
      { channelId: config.channelId, chamadas: report.totalChamadas },
      "llm-monitor: Slack postado com sucesso"
    );
  } catch (err) {
    result.slackError = err instanceof Error ? err.message : String(err);
    logger?.error(
      { err: result.slackError },
      "llm-monitor: falha no canal Slack — Telegram segue independente"
    );
    // NÃO relança: continua para o Telegram
  }

  // ── 3. Telegram — fail-safe independente do Slack ───────────────────────
  if (!config.telegramChatId) {
    logger?.warn("llm-monitor: PADAXOR_TELEGRAM_CHAT_ID vazio — Telegram ignorado");
    // NÃO retorna aqui: continua para gravar o registro "ambos" no histórico
  } else {
    try {
      await deps.postTelegramReport(config.telegramChatId, report, config.slackFallbackChannelId);
      result.telegramOk = true;
      logger?.info("llm-monitor: Telegram postado com sucesso");
    } catch (err) {
      result.telegramError = err instanceof Error ? err.message : String(err);
      logger?.error(
        { err: result.telegramError },
        "llm-monitor: falha no canal Telegram — Slack não é afetado"
      );
      // NÃO relança
    }
  }

  // ── 4. Registro "ambos" — resumo dual-canal do ciclo ───────────────────
  // Só grava se o relatório foi construído e a função foi injetada.
  if (result.reportBuilt && deps.salvarHistorico) {
    // ambosOk = ambos os canais realmente entregaram.
    // telegramSkipped (chatId vazio) NÃO é sucesso — é ausência de configuração.
    const ambosOk = result.slackOk && result.telegramOk;
    const partesTelegram = result.telegramSkipped
      ? ["Telegram não configurado (PADAXOR_TELEGRAM_CHAT_ID vazio)"]
      : [];
    const erros = [...partesTelegram, result.slackError, result.telegramError]
      .filter(Boolean).join("; ");
    await deps.salvarHistorico(report, "ambos", ambosOk, erros || undefined).catch(() => {
      // salvarHistorico já trata seus próprios erros internamente
    });
    logger?.info(
      { slackOk: result.slackOk, telegramOk: result.telegramOk, ambosOk },
      "llm-monitor: registro 'ambos' gravado no histórico",
    );
  }

  return result;
}
