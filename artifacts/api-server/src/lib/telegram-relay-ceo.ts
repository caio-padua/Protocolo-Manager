/**
 * telegram-relay-ceo.ts
 *
 * Repasse de mensagem de cliente ao chat do CEO, com duas regras:
 *  1. Nao repassa quando o remetente E o proprio chat do CEO (evitaria eco:
 *     o sistema responderia ao chat que acabou de escrever).
 *  2. O resultado do envio e sempre registrado em log (entregue, simulado ou
 *     recusado) — antes o resultado era descartado e falha ficava invisivel.
 *
 * Nenhum token, chat completo ou texto da mensagem vai para o log: apenas
 * identificador do cliente, tamanho do texto e o motivo tecnico.
 */

export interface RepasseCeoEntrada {
  chatIdCeo: string;
  chatIdRemetente: string;
  clienteId: number;
  nome: string;
  cpfDisplay: string;
  texto: string;
}

export type RepasseCeoResultado =
  | { kind: "omitido_remetente_e_ceo" }
  | { kind: "entregue" }
  | { kind: "simulado" }
  | { kind: "falhou"; erro: string };

export interface RepasseCeoDeps {
  enviar: (chatId: string, texto: string) => Promise<{ sent: boolean; mock: boolean; error?: string } | undefined>;
  log: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    warn: (obj: Record<string, unknown>, msg: string) => void;
  };
}

/** Telegram HTML: apenas &, < e > precisam de escape. Sem isto, texto com "<" e recusado (HTTP 400). */
export function escaparHtmlTelegram(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function repassarMensagemAoCeo(
  e: RepasseCeoEntrada,
  deps: RepasseCeoDeps,
): Promise<RepasseCeoResultado> {
  if (e.chatIdCeo === e.chatIdRemetente) {
    deps.log.info({ clienteId: e.clienteId }, "[telegram] repasse ao CEO omitido: remetente é o próprio chat do CEO");
    return { kind: "omitido_remetente_e_ceo" };
  }

  const repasse =
    `💬 <b>Mensagem via Telegram</b>\n\n` +
    `<b>De:</b> ${escaparHtmlTelegram(e.nome)}\n` +
    `<b>CPF:</b> ${escaparHtmlTelegram(e.cpfDisplay)}\n\n` +
    `"${escaparHtmlTelegram(e.texto)}"\n\n` +
    `──────────────────\n` +
    `Responda em: Cockpit → ${escaparHtmlTelegram(e.nome.split(" ")[0] ?? "")}`;

  let r: Awaited<ReturnType<RepasseCeoDeps["enviar"]>>;
  try {
    r = await deps.enviar(e.chatIdCeo, repasse);
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    deps.log.warn({ clienteId: e.clienteId, erro }, "[telegram] repasse ao CEO: exceção ao enviar");
    return { kind: "falhou", erro };
  }

  if (!r) {
    deps.log.warn({ clienteId: e.clienteId }, "[telegram] repasse ao CEO: envio sem resultado");
    return { kind: "falhou", erro: "sem_resultado" };
  }
  if (r.sent && !r.mock) {
    deps.log.info({ clienteId: e.clienteId, tamanhoTexto: e.texto.length }, "[telegram] repasse ao CEO entregue");
    return { kind: "entregue" };
  }
  if (r.sent && r.mock) {
    deps.log.warn({ clienteId: e.clienteId }, "[telegram] repasse ao CEO SIMULADO (sem token): nada foi entregue");
    return { kind: "simulado" };
  }
  deps.log.warn({ clienteId: e.clienteId, erro: r.error ?? "desconhecido" }, "[telegram] repasse ao CEO RECUSADO pelo Telegram");
  return { kind: "falhou", erro: r.error ?? "desconhecido" };
}
