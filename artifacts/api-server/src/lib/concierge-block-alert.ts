import { brtDateTime } from "./brt.js";
import { logger } from "./logger.js";
import { postSlackAlertChecked } from "./slack-reporter.js";

type ConciergeBlockedPath =
  | "POST /scheduling/requests"
  | "GET /scheduling/concierge-offer";

/** Best-effort notification only: callers must not await this before returning 403. */
export async function notifyConciergeBlocked(
  rawCpf: string,
  tentativas: number,
  path: ConciergeBlockedPath,
): Promise<void> {
  const cpf = rawCpf.replace(/\D/g, "");
  const maskedCpf = cpf.length === 11
    ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`
    : "***.***.***-**";

  try {
    await postSlackAlertChecked(
      process.env.PADAXOR_SLACK_CHANNEL_ID?.trim() || "C0BLW5S7GQL",
      [
        "*Concierge — acesso bloqueado por penalidade*",
        `CPF: ${maskedCpf}`,
        `Tentativas registradas: ${tentativas}`,
        `Horário: ${brtDateTime()} (BRT)`,
        `Caminho: ${path}`,
      ].join("\n"),
    );
  } catch {
    // Do not log provider payloads/errors: they may contain sensitive request data.
    logger.error({ path, cpf: maskedCpf }, "Falha ao notificar bloqueio Concierge no Slack");
  }
}
