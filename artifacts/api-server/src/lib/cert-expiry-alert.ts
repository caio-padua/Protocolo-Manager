/**
 * cert-expiry-alert.ts
 *
 * Verifica o prazo de vencimento do certificado ICP-Brasil (A1 PAdES) e alerta
 * o CEO via Slack (#padaxor-projeto) quando faltarem < 30 dias para o vencimento.
 *
 * Uso:
 *   - Chamado no api-worker APÓS refreshCertCache() completar (Job 10 — cron 08h BRT + boot).
 *   - Fail-safe: jamais derruba o servidor; loga e segue em caso de erro.
 *
 * Testabilidade:
 *   - getCertInfoFn, postAlert e nowFn são injetáveis via CertExpiryDeps.
 *   - nowFn permite congelar o relógio em testes para cobertura determinística de limiar.
 */

import { logger } from "./logger.js";
import { postSlackAlertChecked } from "./slack-reporter.js";
import { getCertInfo } from "./pdf-signer.js";

// Requisito: alertar quando faltar MENOS DE 30 dias.
// A comparação usa milissegundos brutos para evitar imprecisão de Math.floor
// (ex.: 31 dias - alguns ms de execução → 30 dias floored → falso positivo).
export const ALERT_THRESHOLD_DAYS = 30;
export const ALERT_THRESHOLD_MS   = ALERT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

export type CertInfoFn = () => {
  subject: string;
  issuer: string;
  serial: string;
  validFrom: string;
  validTo: string;
  cpf: string | null;
};

export interface CertExpiryDeps {
  /** Retorna os metadados do certificado carregado (padrão: getCertInfo). */
  getCertInfoFn?: CertInfoFn;
  /** Envia alerta ao Slack (padrão: postSlackAlertChecked — verifica ok:false). */
  postAlert?: (channelId: string, text: string) => Promise<void>;
  /**
   * Fonte de tempo atual em ms (padrão: Date.now).
   * Injete um valor fixo em testes para eliminar corridas de milissegundos.
   */
  nowFn?: () => number;
  /** Log de informação injetável (padrão: logger.info). */
  logInfo?: (obj: Record<string, unknown>, msg: string) => void;
  /** Log de aviso injetável (padrão: logger.warn). */
  logWarn?: (obj: Record<string, unknown>, msg: string) => void;
  /** Log de erro injetável (padrão: logger.error). */
  logError?: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Retorna quantos dias inteiros faltam para `validTo`, ou null se o cert
 * não estiver disponível. `now` em ms (padrão: Date.now()).
 * Usado APENAS para exibição; a decisão de alerta usa ms brutos.
 */
export function getCertDaysRemaining(now = Date.now()): number | null {
  try {
    const info = getCertInfo();
    return Math.floor((new Date(info.validTo).getTime() - now) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/**
 * Calcula dias inteiros restantes a partir de `validTo` (ISO) e `now` (ms).
 * SOMENTE para texto de exibição — não use para a decisão de alertar.
 */
export function daysRemainingFromValidTo(validToIso: string, now = Date.now()): number {
  return Math.floor((new Date(validToIso).getTime() - now) / (1000 * 60 * 60 * 24));
}

/**
 * Monta o texto do alerta Slack.
 * `daysRemaining` é um valor já floored, usado somente na mensagem.
 */
export function buildCertAlertText(daysRemaining: number, validToStr: string, issuer: string): string {
  const urgencia =
    daysRemaining <= 0
      ? "🚨 *CERTIFICADO VENCIDO*"
      : daysRemaining <= 7
        ? "🚨 *ALERTA CRÍTICO — Certificado expira em breve*"
        : "⚠️ *ALERTA — Certificado próximo do vencimento*";

  const diasTexto =
    daysRemaining <= 0
      ? `O certificado *venceu há ${Math.abs(daysRemaining)} dia(s)*`
      : daysRemaining === 1
        ? "Falta *1 dia* para o vencimento"
        : `Faltam *${daysRemaining} dias* para o vencimento`;

  const acao =
    daysRemaining <= 0
      ? "A assinatura digital da Carta de Tratamento está *inoperante*. Renove imediatamente."
      : "Renove o certificado A1 em *Configurações > Certificados* antes do vencimento para não interromper a assinatura PAdES da Carta de Tratamento.";

  return [
    urgencia,
    "",
    `${diasTexto} do certificado ICP-Brasil (PAdES).`,
    `📅 Vencimento: *${validToStr}*`,
    `🏢 Emissor: ${issuer.split(",")[0] ?? issuer}`,
    "",
    acao,
  ].join("\n");
}

/**
 * Verifica o vencimento do certificado.
 * Alerta quando msRemaining < ALERT_THRESHOLD_MS (< 30 dias exatos).
 * Deve ser chamada APÓS refreshCertCache() para garantir que o cert
 * do Object Storage / cofre esteja no cache.
 * Sempre loga; nunca lança exceção.
 */
export async function checkCertExpiryAndAlert(deps: CertExpiryDeps = {}): Promise<void> {
  const getInfo = deps.getCertInfoFn ?? getCertInfo;
  // postSlackAlertChecked lança se a API retornar ok: false; o try/catch captura e loga.
  const alertFn = deps.postAlert ?? postSlackAlertChecked;
  const now     = deps.nowFn     ?? Date.now;
  const infoLog = deps.logInfo   ?? ((obj, msg) => logger.info(obj, msg));
  const warnLog = deps.logWarn   ?? ((obj, msg) => logger.warn(obj, msg));
  const errLog  = deps.logError  ?? ((obj, msg) => logger.error(obj, msg));

  try {
    let info: ReturnType<CertInfoFn>;
    try {
      info = getInfo();
    } catch {
      // Certificado ainda não carregado (ex.: nenhum .pfx configurado). Não alertar.
      infoLog({}, "[cert-expiry] Certificado não disponível para verificação de prazo.");
      return;
    }

    const nowMs       = now();
    const msRemaining = new Date(info.validTo).getTime() - nowMs;
    // daysRemaining é APENAS para exibição na mensagem.
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    const validToStr    = new Date(info.validTo).toLocaleDateString("pt-BR");

    // Decisão de alerta: ms brutos — sem risco de arredondamento.
    // "a menos de 30 dias" = msRemaining < 30 * 24 * 60 * 60 * 1000.
    if (msRemaining >= ALERT_THRESHOLD_MS) {
      infoLog(
        { daysRemaining, validTo: info.validTo },
        `[cert-expiry] Certificado ICP-Brasil válido — ${daysRemaining} dias restantes (vence ${validToStr}).`,
      );
      return;
    }

    // < 30 dias: montar e enviar alerta urgente.
    const channelId = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";
    const mensagem  = buildCertAlertText(daysRemaining, validToStr, info.issuer);

    await alertFn(channelId, mensagem);

    warnLog(
      { daysRemaining, msRemaining, validTo: info.validTo },
      `[cert-expiry] Alerta enviado ao Slack — certificado vence em ${daysRemaining} dia(s).`,
    );
  } catch (err: any) {
    // Fail-safe: engole erros para não bloquear o boot nem o cron.
    errLog(
      { err: err?.message ?? String(err) },
      "[cert-expiry] Falha inesperada na verificação de prazo do certificado.",
    );
  }
}
