/**
 * Regras puras (sem banco, sem rede) de segurança e confiabilidade do WhatsApp.
 * Ficam isoladas para serem testáveis e para o webhook de entrada, o de status e o
 * motor de envio usarem exatamente a mesma regra.
 */
import crypto from "node:crypto";

// ── Assinatura X-Twilio-Signature ───────────────────────────────────────────
/** HMAC-SHA1 base64 da URL + parâmetros ordenados (chave+valor, sem separador). */
export function assinaturaEsperada(authToken: string, url: string, params: Record<string, unknown>): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + String(params[k] ?? "");
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function assinaturaConfere(assinada: string, esperada: string): boolean {
  try {
    const a = Buffer.from(assinada);
    const b = Buffer.from(esperada);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Assinatura ausente, vazia ou que não bata com NENHUMA URL candidata = inválida. */
export function assinaturaTwilioValida(
  authToken: string,
  assinada: string | undefined,
  urlsCandidatas: string[],
  params: Record<string, unknown>,
): boolean {
  if (!authToken || !assinada) return false;
  return urlsCandidatas.some((url) => assinaturaConfere(assinada, assinaturaEsperada(authToken, url, params)));
}

// ── Telefone ────────────────────────────────────────────────────────────────
/**
 * Telefone completo e canônico (somente dígitos, com DDI 55). Devolve null quando não
 * dá para afirmar que é um número completo. Nunca compara por pedaço do número.
 */
export function telefoneCanonico(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").replace(/^whatsapp:/i, "").trim();
  const d = s.replace(/\D/g, "");
  if (!d) return null;
  // Com "+" o número já é internacional: não se presume Brasil.
  if (s.startsWith("+")) return d.length >= 8 && d.length <= 15 ? d : null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

export function mascararTelefone(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `***${d.slice(-4)}` : "***";
}

// ── Status de entrega: nunca retroceder ─────────────────────────────────────
const RANK: Record<string, number> = { queued: 1, accepted: 1, scheduled: 1, sending: 2, sent: 3, delivered: 4, read: 5 };
const FINAIS_RUINS = new Set(["failed", "undelivered", "canceled"]);

/**
 * Callbacks do Twilio podem chegar fora de ordem. Um status novo só vale quando não
 * volta atrás (delivered não vira sent) e uma falha não apaga uma entrega confirmada.
 */
export function statusPodeAvancar(atual: string | null | undefined, novo: string): boolean {
  const a = (atual ?? "").toLowerCase();
  const n = novo.toLowerCase();
  if (!a || a === n) return true;
  if (FINAIS_RUINS.has(n)) return !(RANK[a] >= 4);        // falha não apaga delivered/read
  if (FINAIS_RUINS.has(a)) return false;                  // falha final não é reaberta por callback atrasado
  if (a === "link" || a === "bloqueado" || a === "received") return false;
  return (RANK[n] ?? 0) >= (RANK[a] ?? 0);
}

// ── Chaves de segurança (variáveis de ambiente; nada é gravado por aqui) ───
/** Resposta automática do webhook de entrada: DESLIGADA por padrão; liga só com "true". */
export function autorespostaHabilitada(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.WHATSAPP_INBOUND_AUTORESPOSTA ?? "").trim().toLowerCase() === "true";
}

export function modoTesteAtivo(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.WHATSAPP_MODO_TESTE ?? "").trim().toLowerCase() === "true";
}

/**
 * Em modo teste, SÓ o contato autorizado (um único número) pode receber. Sem contato
 * configurado, nada sai (fecha por padrão). Fora do modo teste, nada muda.
 */
export function envioPermitidoNoModoTeste(destino: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!modoTesteAtivo(env)) return true;
  const autorizado = telefoneCanonico(env.WHATSAPP_CONTATO_TESTE);
  const alvo = telefoneCanonico(destino);
  return Boolean(autorizado && alvo && autorizado === alvo);
}

/** Janela de 24 h do WhatsApp conta a partir da última mensagem RECEBIDA do contato. */
export function janelaAberta(ultimaEntrada: Date | null | undefined, agora: Date = new Date()): boolean {
  if (!ultimaEntrada) return false;
  const dif = agora.getTime() - ultimaEntrada.getTime();
  return dif >= 0 && dif < 24 * 60 * 60 * 1000;
}

export const CONTENT_SID_RE = /^HX[0-9a-fA-F]{32}$/;
