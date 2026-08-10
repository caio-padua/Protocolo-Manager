/**
 * radar-mensagem — lógica pura do envio rápido do Radar Clínico.
 *
 * Separada da rota Express para ser completamente testável via vitest
 * sem subir servidor HTTP nem tocar banco real.
 *
 * Todas as dependências externas (DB, WhatsApp, Telegram, Gmail) entram
 * via `RadarMensagemDeps` — a rota injeta as implementações reais;
 * os testes injetam mocks.
 *
 * Contratos de retorno:
 *  { kind: "ok",  historyStored }           → HTTP 200
 *  { kind: "400", error }                   → HTTP 400
 *  { kind: "404" }                          → HTTP 404
 *  { kind: "422", error, link? }            → HTTP 422
 *  { kind: "502", error, link? }            → HTTP 502
 *  { kind: "500", error }                   → HTTP 500
 */

export interface ClienteBasico {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  telegram_chat_id: string | null;
}

export interface WhatsappResult {
  sent: boolean;
  via: "twilio" | "link";
  link: string;
  error?: string;
}

export interface TelegramResult {
  sent: boolean;
  mock: boolean;
  error?: string;
}

export interface GmailResult {
  success: boolean;
  error?: string;
}

// Dependências injetáveis — implementações reais ou mocks de teste
export interface RadarMensagemDeps {
  /** Busca cliente pelo id dentro do tenant; null = não encontrado. */
  getCliente(clientId: number, empresaId: number): Promise<ClienteBasico | null>;
  /** Envia WhatsApp; nunca lança. */
  sendWhatsapp(phone: string, mensagem: string): Promise<WhatsappResult>;
  /** Envia Telegram; nunca lança. */
  sendTelegram(chatId: string, mensagem: string): Promise<TelegramResult>;
  /** Envia e-mail via Gmail; nunca lança. */
  sendGmail(to: string, subject: string, html: string): Promise<GmailResult>;
  /** Persiste em mensageria_lembrete; nunca lança — devolve true em sucesso. */
  saveHistory(params: {
    clientId: number;
    mensagem: string;
    via: string;
    phone: string | null;
    empresaId: number;
  }): Promise<boolean>;
}

export type RadarMensagemResult =
  | { kind: "ok"; historyStored: boolean; historyError?: string }
  | { kind: "400"; error: string }
  | { kind: "404" }
  | { kind: "422"; error: string; link?: string }
  | { kind: "502"; error: string; link?: string }
  | { kind: "500"; error: string };

// Mapa de códigos Twilio → mensagem em português para o médico
const TWILIO_LEGIVEL: Record<string, string> = {
  twilio_63015:
    "O número ainda não entrou no canal WhatsApp (fora da janela de 24 h ou sandbox não ativado). Use o link manual.",
  twilio_63016:
    "Fora da janela de 24 h do WhatsApp — o paciente precisa iniciar uma nova conversa. Use o link manual.",
  twilio_63007: "Número de destino inválido no WhatsApp.",
  twilio_21614: "Número de telefone inválido. Verifique o cadastro do paciente.",
  twilio_21211: "Número de destino inválido para o Twilio.",
};

export async function enviarMensagemRadar(
  params: { clientId: number; canal: string; mensagem: string; empresaId: number },
  deps: RadarMensagemDeps,
): Promise<RadarMensagemResult> {
  const { clientId, canal, mensagem, empresaId } = params;

  // ── Validação de entrada ──────────────────────────────────────────────────
  if (!clientId || !canal || !mensagem) {
    return { kind: "400", error: "clientId, canal e mensagem são obrigatórios" };
  }

  // ── Busca o cliente dentro do tenant ─────────────────────────────────────
  let cliente: ClienteBasico | null;
  try {
    cliente = await deps.getCliente(clientId, empresaId);
  } catch (e) {
    return { kind: "500", error: (e as Error).message ?? "Erro ao buscar paciente" };
  }
  if (!cliente) return { kind: "404" };

  // ── Envio por canal ───────────────────────────────────────────────────────
  let viaRegistrada: string;

  if (canal === "whatsapp") {
    if (!cliente.phone) {
      return { kind: "422", error: "Paciente sem telefone cadastrado" };
    }
    const result = await deps.sendWhatsapp(cliente.phone, mensagem);
    if (!result.sent) {
      const mensagemErro =
        (result.error && TWILIO_LEGIVEL[result.error])
          ? TWILIO_LEGIVEL[result.error]
          : result.error ?? "Twilio recusou o envio.";
      if (result.via === "link") {
        return { kind: "422", error: "WhatsApp não configurado (Twilio sem credenciais). Use o link manual.", link: result.link };
      }
      return { kind: "502", error: mensagemErro, link: result.link };
    }
    viaRegistrada = "twilio";

  } else if (canal === "telegram") {
    if (!cliente.telegram_chat_id) {
      return { kind: "422", error: "Paciente sem Telegram vinculado" };
    }
    const result = await deps.sendTelegram(cliente.telegram_chat_id, mensagem);
    if (result.mock) {
      return { kind: "422", error: "Telegram não configurado (sem Bot Token). Configure nas Integrações." };
    }
    if (!result.sent) {
      return { kind: "502", error: result.error ?? "Telegram rejeitou o envio." };
    }
    viaRegistrada = "telegram";

  } else if (canal === "email") {
    if (!cliente.email) {
      return { kind: "422", error: "Paciente sem e-mail cadastrado" };
    }
    const htmlEscapado = mensagem
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    const result = await deps.sendGmail(
      cliente.email,
      `Mensagem da clínica para ${cliente.name}`,
      `<p>${htmlEscapado}</p>`,
    );
    if (!result.success) {
      return { kind: "502", error: result.error ?? "Gmail rejeitou o envio." };
    }
    viaRegistrada = "gmail";

  } else {
    return { kind: "400", error: "Canal inválido. Use: whatsapp | telegram | email" };
  }

  // ── Persiste no histórico ─────────────────────────────────────────────────
  let historyStored = false;
  let historyError: string | undefined;
  try {
    historyStored = await deps.saveHistory({
      clientId,
      mensagem,
      via: viaRegistrada,
      phone: cliente.phone ?? null,
      empresaId,
    });
  } catch (e) {
    historyError = (e as Error).message ?? String(e);
  }

  return { kind: "ok", historyStored, ...(historyError ? { historyError } : {}) };
}
