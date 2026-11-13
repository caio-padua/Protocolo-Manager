/**
 * Fonte ÚNICA do chat de alerta (clínica) do Telegram.
 *
 * Ordem de precedência (igual à de getSecret): cofre `telegram.ceoChatId` > variável de ambiente
 * `PADAXOR_TELEGRAM_CHAT_ID`. Valor que não é um identificador numérico de chat é REJEITADO com
 * motivo explícito (nunca enviado, nunca trocado por outro chat).
 * Vale para API, rota antiga, worker e scripts: todos chamam esta função em vez de ler process.env.
 */
import { getSecret } from "./secure-settings";

export type FonteChatAlerta = "cofre" | "ambiente" | "ausente";

export interface ChatAlerta {
  chatId: string | null;
  fonte: FonteChatAlerta;
  /** Preenchido quando chatId é null: "ausente" | "formato_invalido" | "cofre_indisponivel". */
  motivo: string | null;
}

/** Identificador numérico de chat do Telegram (usuário: positivo; grupo/canal: negativo). */
export function chatIdValido(v: string | null | undefined): v is string {
  return typeof v === "string" && /^-?\d{5,20}$/.test(v.trim());
}

export async function resolverChatAlerta(): Promise<ChatAlerta> {
  let valor: string | null = null;
  try {
    valor = await getSecret("telegram.ceoChatId");
  } catch {
    return { chatId: null, fonte: "ausente", motivo: "cofre_indisponivel" };
  }
  if (valor == null || !valor.trim()) return { chatId: null, fonte: "ausente", motivo: "ausente" };
  if (!chatIdValido(valor)) return { chatId: null, fonte: "ausente", motivo: "formato_invalido" };
  // getSecret devolve o do cofre quando existe; do contrário, o do ambiente.
  const doAmbiente = process.env["PADAXOR_TELEGRAM_CHAT_ID"]?.trim() === valor.trim();
  return { chatId: valor.trim(), fonte: doAmbiente ? "ambiente" : "cofre", motivo: null };
}

/** Atalho: só o id (ou null). Quem precisa distinguir o motivo usa resolverChatAlerta. */
export async function chatAlertaOuNull(): Promise<string | null> {
  return (await resolverChatAlerta()).chatId;
}
