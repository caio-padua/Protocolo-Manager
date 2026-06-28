// ============================================================================
// MOTOR ÚNICO DE ENVIO BRANDED — "HERMES PAXTER" (Código Paxter, Art. 66).
//
// Tipos compartilhados. O "documento de mensagem" (PaxterDoc) é abstrato e
// INDEPENDENTE de canal: quem chama fornece SÓ o conteúdo (chamada, título,
// parágrafos, botão, anexo) e o motor veste a marca em e-mail, WhatsApp e
// Telegram. Nenhuma rota monta HTML/mensagem de marca à mão (Art. 57).
// ============================================================================

export type PaxterCanal = "EMAIL" | "WHATSAPP" | "TELEGRAM";

export interface PaxterBotao {
  label: string;
  url: string;
}

export interface PaxterAnexo {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** Conteúdo puro de uma mensagem, sem nenhuma marca aplicada. */
export interface PaxterDoc {
  /** Linha-chamada curta em maiúsculas (ex.: "Olá, Caio" / "Cobrança"). */
  eyebrow?: string;
  /** Manchete (renderizada em serifa no e-mail / negrito nos cartões). */
  titulo: string;
  /** Corpo: cada frase em seu próprio parágrafo (regra do CEO). */
  paragrafos: string[];
  /** Botão de ação dourado (vira link no WhatsApp/Telegram). */
  botao?: PaxterBotao;
  /** Texto fino de rodapé (ex.: "Link pessoal — expira em 7 dias"). */
  notaRodape?: string;
  /** Assunto do e-mail. Se ausente, deriva de eyebrow/título. */
  assunto?: string;
  /** Anexos do e-mail (PDF de RAS, receitas etc.). Ignorados nos cartões. */
  anexos?: PaxterAnexo[];
  /**
   * Blocos de HTML já confiável (tabelas/cartões clínicos) injetados DENTRO do
   * casco Hermes, entre os parágrafos e o botão. Usado pelos e-mails ricos
   * (pré-sessão, pós-sessão, protocolo, onboarding, RAS demo) re-tematizados
   * para navy/ouro. Ignorados nos cartões (WhatsApp/Telegram só leem texto).
   */
  blocosHtml?: string[];
}

export interface PaxterDestino {
  email?: string | null;
  telefone?: string | null;
  telegramChatId?: string | null;
  /** Nome do destinatário, usado em saudações quando o doc não traz eyebrow. */
  nome?: string | null;
}

export interface PaxterEnvioContexto {
  /** Base pública (ex.: https://app.exemplo.com) para imagens e banner. */
  baseUrl?: string;
}

export interface PaxterCanalResultado {
  canal: PaxterCanal;
  /** true = saiu de verdade OU mock honesto; false = falhou. */
  sent: boolean;
  /** Origem real do envio: 'gmail' | 'twilio' | 'telegram' | 'link' | 'mock'. */
  via?: string;
  /** true quando o provedor não está configurado (envio simulado honesto). */
  mock?: boolean;
  /** true quando o canal foi pulado por falta de destino. */
  skipped?: boolean;
  /** Link wa.me de fallback manual (WhatsApp). */
  link?: string;
  error?: string;
}

export interface PaxterEnvioResultado {
  resultados: PaxterCanalResultado[];
  /** true se ao menos um canal saiu (real ou mock). */
  algumEnviado: boolean;
}
