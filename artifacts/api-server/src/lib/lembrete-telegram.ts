/**
 * Transporte Telegram do motor de lembrete por período (executarLembretesPeriodo).
 * NÃO cria agendador nem motor novo: só decide o canal e adapta o formato.
 *
 * Modo (app_settings `lembrete.telegram.modo`): desligado (padrão) | lista | ligado.
 *   desligado: comportamento anterior (WhatsApp), nada muda.
 *   lista:     só clientes em `lembrete.telegram.permitidos` (JSON com ids) que tenham chat vinculado.
 *   ligado:    todo cliente com chat vinculado (autorizado pelo Dr. Caio; não ativar sem ordem).
 * A autorização de lembrete recorrente (reminderConsentFilter) continua obrigatória em todos os modos.
 */
import { getSetting } from "./secure-settings";
import { sendTelegram } from "./telegram";

export type ModoLembreteTelegram = "desligado" | "lista" | "ligado";

export interface ConfigLembreteTelegram {
  modo: ModoLembreteTelegram;
  permitidos: Set<number>;
}

export async function lerConfigLembreteTelegram(): Promise<ConfigLembreteTelegram> {
  let modo: ModoLembreteTelegram = "desligado";
  const permitidos = new Set<number>();
  try {
    const m = (await getSetting("lembrete.telegram.modo"))?.trim().toLowerCase();
    if (m === "lista" || m === "ligado") modo = m;
    const raw = await getSetting("lembrete.telegram.permitidos");
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) for (const v of arr) if (Number.isSafeInteger(v) && v > 0) permitidos.add(v as number);
    }
  } catch {
    // Configuração ilegível = desligado (nunca liga por engano).
    return { modo: "desligado", permitidos: new Set() };
  }
  return { modo, permitidos };
}

export function usaTelegram(cfg: ConfigLembreteTelegram, clienteId: number, chatId: string | null | undefined): boolean {
  if (!chatId || !chatId.trim()) return false;
  if (cfg.modo === "ligado") return true;
  if (cfg.modo === "lista") return cfg.permitidos.has(clienteId);
  return false;
}

/** Converte a marcação do WhatsApp (*negrito*, _itálico_) para HTML do Telegram, escapando o resto. */
export function formatarParaTelegram(msg: string): string {
  const esc = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:!?])/g, "$1<i>$2</i>");
}

export type ResultadoEnvioLembreteTelegram =
  | { kind: "enviado" }
  | { kind: "falhou"; erro: string };

export async function enviarLembreteTelegram(chatId: string, mensagem: string): Promise<ResultadoEnvioLembreteTelegram> {
  try {
    const r = await sendTelegram(chatId, formatarParaTelegram(mensagem));
    // Sem token o transporte devolve "mock": NÃO é entrega.
    if (r.sent && r.mock) return { kind: "falhou", erro: "telegram_sem_token" };
    if (r.sent) return { kind: "enviado" };
    const m = /^(telegram_http_\d{3})/.exec(r.error ?? "");
    return { kind: "falhou", erro: m ? m[1] : "telegram_falha_de_envio" };
  } catch {
    return { kind: "falhou", erro: "telegram_excecao" };
  }
}
