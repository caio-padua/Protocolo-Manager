/**
 * telegram-relay-ceo.ts
 *
 * Repasse de mensagem de cliente ao chat do CEO, com duas regras:
 *  1. Nao repassa quando o remetente E o proprio chat do CEO (evitaria eco:
 *     o sistema responderia ao chat que acabou de escrever).
 *  2. O resultado do envio e sempre registrado em log (entregue, simulado ou
 *     recusado) — antes o resultado era descartado e falha ficava invisivel.
 *
 * Nenhum token, identificador do cliente, chat ou texto vai para o log.
 * O alerta não inclui nome/CPF do cadastro. O original fica no Cockpit.
 */

export interface RepasseCeoEntrada {
  chatIdCeo: string;
  chatIdRemetente: string;
  clienteId: number;
  nome: string;
  cpfDisplay: string;
  texto: string;
  /** true = a mensagem NÃO foi gravada no Cockpit (falha técnica); o Telegram tentará reentregar. */
  gravacaoFalhou?: boolean;
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

/** Compatibilidade com chamadores antigos: nunca devolve dígitos nem o valor inválido. */
export function formatarCpfDisplay(_cpf: string | null | undefined): string {
  return "***.***.***-**";
}

/** Redação apenas da cópia do alerta; a mensagem persistida não é modificada.
 * Não promete anonimização infalível de texto livre ou detecção clínica.
 */
export function ocultarIdentificadoresAlerta(texto: string): string {
  return texto
    .replace(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g, "[identificador oculto]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail oculto]")
    .replace(/(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)\d{4,5}[\s.-]?\d{4}\b/g, "[telefone oculto]");
}

/** Para log: só o código técnico; corpo de erro do Telegram/rede pode conter trechos de conteúdo. */
export function erroSeguroParaLog(erro: string): string {
  const m = /^(telegram_http_\d{3})/.exec(erro);
  if (m) return m[1];
  return erro === "sem_resultado" ? erro : "falha_de_rede_ou_excecao";
}

export async function repassarMensagemAoCeo(
  e: RepasseCeoEntrada,
  deps: RepasseCeoDeps,
): Promise<RepasseCeoResultado> {
  if (e.chatIdCeo === e.chatIdRemetente) {
    deps.log.info({}, "[telegram] repasse ao CEO omitido: remetente é o próprio chat do CEO");
    return { kind: "omitido_remetente_e_ceo" };
  }

  const aviso = e.gravacaoFalhou
    ? `⚠️ <b>Não gravada no Cockpit (falha técnica).</b> O Telegram tentará reentregar; quando gravar, ela aparece no Cockpit.\n\n`
    : "";
  const repasse =
    aviso +
    `💬 <b>Mensagem via Telegram</b>\n\n` +
    `<b>Cliente interno:</b> #${Number.isSafeInteger(e.clienteId) && e.clienteId > 0 && e.clienteId <= 2_147_483_647 ? e.clienteId : "indisponível"}\n\n` +
    `──────────────────\n` +
    `Consulte a conversa no Cockpit protegido. O alerta não contém a transcrição.`;

  let r: Awaited<ReturnType<RepasseCeoDeps["enviar"]>>;
  try {
    r = await deps.enviar(e.chatIdCeo, repasse);
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    deps.log.warn({ erro: erroSeguroParaLog(erro) }, "[telegram] repasse ao CEO: exceção ao enviar");
    return { kind: "falhou", erro: erroSeguroParaLog(erro) };
  }

  if (!r) {
    deps.log.warn({}, "[telegram] repasse ao CEO: envio sem resultado");
    return { kind: "falhou", erro: "sem_resultado" };
  }
  if (r.sent && !r.mock) {
    deps.log.info({ tamanhoTexto: e.texto.length }, "[telegram] repasse ao CEO aceito pelo Telegram");
    return { kind: "entregue" };
  }
  if (r.sent && r.mock) {
    deps.log.warn({}, "[telegram] repasse ao CEO SIMULADO (sem token): nada foi entregue");
    return { kind: "simulado" };
  }
  deps.log.warn({ erro: erroSeguroParaLog(r.error ?? "desconhecido") }, "[telegram] repasse ao CEO RECUSADO pelo Telegram");
  return { kind: "falhou", erro: erroSeguroParaLog(r.error ?? "desconhecido") };
}
