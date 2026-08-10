/**
 * telegram-webhook-guard.ts
 *
 * Verifica periodicamente se o webhook do @Paduaclinica_bot ainda está ativo
 * no Telegram. Se outro processo chamar getUpdates (polling), o Telegram
 * desativa o webhook silenciosamente — as mensagens do paciente param de
 * chegar ao CEO sem qualquer aviso de erro.
 *
 * O que este módulo faz:
 *   1. checkWebhookHealth() — faz uma chamada única a getWebhookInfo e decide
 *      se o webhook está saudável (URL configurada e sem erro recente).
 *   2. startWebhookGuard(logger) — chama checkWebhookHealth() a cada 5 minutos
 *      e, quando detecta problema, alerta o CEO via Slack e Telegram.
 *
 * Regras de alerta:
 *   - Alerta só quando o estado MUDA (de saudável → problemático ou vice-versa)
 *     para não inundar o Slack com mensagens repetidas.
 *   - Na primeira verificação após o boot também alerta se já houver problema.
 *   - Falha de rede na própria chamada getWebhookInfo é logada, mas NÃO dispara
 *     alerta (pode ser transitória) — só alerta após 2 falhas consecutivas.
 */

import type pino from "pino";
import { getWebhookInfo, sendTelegram } from "./telegram.js";
import { ReplitConnectors } from "@replit/connectors-sdk";

// ---------------------------------------------------------------------------
// Cache in-memory do último resultado (lido pela rota de status do CEO)
// ---------------------------------------------------------------------------

export interface WebhookHealthResult {
  healthy: boolean;
  url: string;
  pendingUpdateCount: number;
  lastErrorMessage?: string;
  mock?: boolean;
  fetchError?: string;
  checkedAt: string; // ISO-8601 BRT
}

let _lastResult: WebhookHealthResult | null = null;

/** Retorna o resultado do último check, ou null se ainda não rodou. */
export function getLastWebhookCheck(): WebhookHealthResult | null {
  return _lastResult;
}

// ---------------------------------------------------------------------------
// Lógica principal de verificação
// ---------------------------------------------------------------------------

/**
 * Chama getWebhookInfo e decide se o webhook está saudável.
 * Saudável = tem URL configurada e sem fetchError crítico.
 */
export async function checkWebhookHealth(): Promise<WebhookHealthResult> {
  const info = await getWebhookInfo();
  const healthy =
    !info.mock &&          // sem token = não há como saber
    !info.fetchError &&    // sem erro de rede
    info.url.length > 0;  // URL presente = webhook ativo

  const result: WebhookHealthResult = {
    healthy,
    url: info.url,
    pendingUpdateCount: info.pendingUpdateCount,
    lastErrorMessage: info.lastErrorMessage,
    mock: info.mock,
    fetchError: info.fetchError,
    checkedAt: new Date().toISOString(),
  };

  _lastResult = result;
  return result;
}

// ---------------------------------------------------------------------------
// Envio de alerta via Slack
// ---------------------------------------------------------------------------

async function sendSlackAlert(texto: string): Promise<void> {
  const channelId = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";
  try {
    const connectors = new ReplitConnectors();
    const resp = await connectors.proxy("slack", "/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: channelId,
        text: texto,
      }),
    });
    const data = (await resp.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      // Não lança — alerta via Slack falhou, mas não derruba o guard
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Guard periódico
// ---------------------------------------------------------------------------

let _prevHealthy: boolean | null = null;
let _consecutiveNetworkErrors = 0;

export function startWebhookGuard(logger: pino.Logger): void {
  logger.info("telegram-webhook-guard: iniciado (verificação a cada 5 minutos)");

  async function run(): Promise<void> {
    try {
      const result = await checkWebhookHealth();

      // MOCK = sem token no cofre, não é falha do webhook
      if (result.mock) {
        logger.info("telegram-webhook-guard: MOCK (token ausente) — ignorando");
        _prevHealthy = null;
        return;
      }

      // Erro de rede na própria chamada getWebhookInfo
      if (result.fetchError) {
        _consecutiveNetworkErrors++;
        logger.warn(
          { fetchError: result.fetchError, consecutivo: _consecutiveNetworkErrors },
          "telegram-webhook-guard: falha de rede ao consultar getWebhookInfo",
        );
        if (_consecutiveNetworkErrors >= 2) {
          const msg =
            `⚠️ *Telegram Webhook Guard* — Não consegui consultar o Telegram (${_consecutiveNetworkErrors}x consecutivas).\n` +
            `Erro: \`${result.fetchError}\`\n` +
            `Verifique a conectividade ou o token do bot.`;
          await sendSlackAlert(msg);
        }
        return;
      }

      _consecutiveNetworkErrors = 0;

      const changed = _prevHealthy === null || _prevHealthy !== result.healthy;
      _prevHealthy = result.healthy;

      if (!result.healthy && changed) {
        // Webhook inativo (URL vazia) — possível polling ativo
        const msg =
          `🚨 *ALERTA — Telegram Webhook Inativo*\n\n` +
          `O webhook do @Paduaclinica_bot foi desativado.\n` +
          `Isso acontece quando outro processo chama \`getUpdates\` (polling) e substitui o webhook.\n\n` +
          `*Consequência:* mensagens dos pacientes NÃO chegam ao CEO.\n\n` +
          `*Ação:* execute \`POST /api/telegram/register-webhook\` no painel de configurações ` +
          `para reativar o webhook imediatamente.`;

        logger.error({ result }, "telegram-webhook-guard: WEBHOOK INATIVO — alertando CEO");
        await sendSlackAlert(msg);

        // Também tenta alertar via Telegram se chatId do CEO estiver configurado
        const ceoChatId = process.env.PADAXOR_TELEGRAM_CHAT_ID;
        if (ceoChatId) {
          void sendTelegram(
            ceoChatId,
            `🚨 <b>ALERTA — Webhook do Bot Inativo</b>\n\n` +
            `O webhook do @Paduaclinica_bot foi substituído por polling.\n` +
            `Mensagens dos pacientes <b>não estão chegando</b>.\n\n` +
            `Reative em: Configurações → Telegram → Registrar Webhook.`,
          );
        }
      } else if (result.healthy && changed && _prevHealthy !== null) {
        // Voltou a ficar saudável
        logger.info("telegram-webhook-guard: webhook reativado — OK");
        await sendSlackAlert(
          `✅ *Telegram Webhook Reativado*\nURL: \`${result.url}\`\nO canal do bot está funcionando normalmente.`,
        );
      } else {
        logger.info(
          { url: result.url, pendingUpdateCount: result.pendingUpdateCount },
          "telegram-webhook-guard: webhook saudável",
        );
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "telegram-webhook-guard: erro inesperado no ciclo",
      );
    }
  }

  // Primeira verificação 30 segundos após o boot (dar tempo ao processo subir)
  setTimeout(() => void run(), 30_000);
  // Depois a cada 5 minutos
  setInterval(() => void run(), 5 * 60_000);
}
