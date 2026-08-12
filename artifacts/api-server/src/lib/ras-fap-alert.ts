/**
 * ras-fap-alert.ts
 *
 * Utilitário isolado responsável por disparar o aviso no Slack
 * quando a geração do RAS FAP falha — seja no caminho do Drive
 * ou no caminho do e-mail.
 *
 * Separado do handler da rota para permitir testes de unidade sem
 * depender de Express, banco de dados ou Google Drive.
 */

import { postSlackAlert } from "./slack-reporter";
import { logger } from "./logger";

export type RasFapContext = "drive" | "email";

export interface RasFapAlertDeps {
  /** Função de alerta injetável (padrão: postSlackAlert). */
  postAlert?: (channelId: string, text: string) => Promise<void>;
  /** Função de log injetável (padrão: logger.error). */
  logError?: (msg: string, err: unknown) => void;
}

/**
 * Dispara o aviso no Slack quando a geração do RAS FAP falha.
 *
 * @param context   "drive" = falha ao gerar/salvar no Drive;
 *                  "email" = falha ao anexar ao e-mail.
 * @param clientName     Nome do paciente para exibir na mensagem.
 * @param protocolId     Número do protocolo.
 * @param protocolTitle  Título do protocolo.
 * @param errorMessage   Mensagem de erro capturada.
 * @param slackChannel   ID do canal Slack destino (undefined = silêncio).
 * @param deps           Dependências injetáveis para testes.
 */
export async function notifySlackRasFapFailure(
  context: RasFapContext,
  clientName: string,
  protocolId: number | string,
  protocolTitle: string,
  errorMessage: string,
  slackChannel: string | undefined,
  deps: RasFapAlertDeps = {},
): Promise<void> {
  const alertFn = deps.postAlert ?? postSlackAlert;
  const logFn   = deps.logError  ?? ((msg, err) => logger.error({ err }, msg));

  const label =
    context === "drive"
      ? "RAS FAP não pôde ser gerado/salvo"
      : "RAS FAP não pôde ser anexado ao e-mail";

  const detail =
    context === "email"
      ? " O e-mail foi enviado sem o anexo RAS FAP."
      : "";

  logFn(`RAS FAP alert (${context}): ${errorMessage}`, errorMessage);

  if (!slackChannel) return;

  const text =
    `⚠️ *${label}* para *${clientName}* ` +
    `(Protocolo #${protocolId} — ${protocolTitle}).${detail}\n` +
    `Erro: ${errorMessage}`;

  await alertFn(slackChannel, text).catch(() => {});
}
