/**
 * Confirmação do cliente por visita (K8) — núcleo.
 *
 * Decisões do CEO (09/11/2026), ver specs/agenda-google-linha-do-tempo-viva.md seção 13:
 *  - a enfermeira registra a aplicação SEMPRE; nada aqui bloqueia o registro clínico;
 *  - chave de 6 dígitos por VISITA (hash, 10 min, 5 tentativas, 60 s entre envios);
 *  - "Cliente confirma depois": e-mail de um clique ao cliente (3 ao todo, 1 por dia),
 *    e-mail à gestão (2: no ato e aviso final 24 h após o 3º do cliente);
 *  - desafio presencial por dados do cadastro (3 rodadas de 3 tentativas), prova fraca.
 *
 * Regras técnicas: todo estado muda por UPDATE condicional (reserva atômica); segredo só
 * em hash; falha de canal nunca desfaz nada; hora sempre vem como parâmetro (testável).
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import {
  ATTEMPTS_PER_ROUND, MAX_ROUNDS, answersMatch, drawPair, fieldLabel, pairSignature,
  type ChallengeClientData,
} from "./visit-confirmation-challenge";
import { clientConfirmEmail, keyMessage, managerEmail, whenLabel } from "./visit-confirmation-messages";
import { baseUrlFromEnv } from "./messaging/base-url";
import type { PaxterDoc } from "./messaging/types";

// ---------------------------------------------------------------------------
// Constantes (decisões do CEO)
// ---------------------------------------------------------------------------
export const KEY_TTL_MS = 10 * 60_000;
export const KEY_MAX_ATTEMPTS = 5;
export const KEY_RESEND_MIN_MS = 60_000;
export const LINK_TTL_MS = 7 * 24 * 3_600_000;
export const CLIENT_EMAIL_INTERVAL_MS = 24 * 3_600_000;
export const CLIENT_EMAILS_TOTAL = 3;
export const FINAL_DELAY_MS = 24 * 3_600_000;

export const COMPLETE_STATES = ["rubrica_chave", "confirmada_email"] as const;
const ENGINE_STATES = ["pendente", "rubrica_desafio"] as const;

export type ConfirmationState =
  | "sem_pedido" | "chave_enviada" | "rubrica_chave" | "rubrica_desafio"
  | "pendente" | "confirmada_email" | "nao_confirmada";

export const STATE_LABEL: Record<ConfirmationState, string> = {
  sem_pedido: "Sem chave pedida",
  chave_enviada: "Chave enviada; aguardando o cliente informar",
  rubrica_chave: "Cliente rubricou com a chave",
  rubrica_desafio: "Validado no local por dados do cadastro; confirmação por e-mail pendente",
  pendente: "Cliente confirma depois; aguardando o clique no e-mail",
  confirmada_email: "Cliente confirmou pelo e-mail",
  nao_confirmada: "NÃO CONFIRMADA pelo cliente",
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface VisitRef { sessionId: number; empresaId: number; clientId: number; locationId: number | null }

export interface ConfirmationRow {
  id: number; session_id: number; empresa_id: number; client_id: number; location_id: number | null;
  state: ConfirmationState;
  key_hash: string | null; key_expires_at: Date | string | null; key_attempts: number;
  key_sent_at: Date | string | null; key_used_at: Date | string | null;
  rubrica_at: Date | string | null; rubrica_method: string | null; rubrica_by_professional_id: number | null;
  pending_at: Date | string | null; pending_by_professional_id: number | null;
  pending_origin: string | null; pending_reason: string | null;
  link_nonce: string | null; link_expires_at: Date | string | null;
  client_emails_sent: number; client_email_failures: number;
  next_client_email_at: Date | string | null; final_due_at: Date | string | null;
  manager_first_sent_at: Date | string | null; manager_final_sent_at: Date | string | null;
  confirmed_at: Date | string | null; confirmed_late: boolean;
  challenge_round: number; challenge_attempts: number;
  challenge_field_a: string | null; challenge_field_b: string | null;
  challenge_pairs_used: string[]; challenge_locked: boolean;
}

/**
 * Cada canal recebe o CONTEÚDO (PaxterDoc); quem veste a marca e envia é o motor Hermes
 * (lib/messaging, Art. 66). Os testes injetam canais simulados nesta mesma interface.
 */
export interface ChannelSenders {
  sendEmail(to: string, doc: PaxterDoc): Promise<{ success: boolean; error?: string }>;
  sendWhatsapp(phone: string, doc: PaxterDoc): Promise<{ sent: boolean; via: string; error?: string }>;
  sendTelegram(chatId: string, doc: PaxterDoc): Promise<{ sent: boolean; mock: boolean; error?: string }>;
}

export type ChannelStatus = "aceito" | "falhou" | "sem_contato" | "simulado";
export interface ChannelReport { canal: "email" | "whatsapp" | "telegram"; estado: ChannelStatus }

// ---------------------------------------------------------------------------
// Segredo e hashes
// ---------------------------------------------------------------------------
function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    // Falha explícita: sem segredo não existe chave segura (nada de segredo embutido no código).
    throw new Error("SESSION_SECRET ausente ou curto demais: a confirmação por visita não pode operar.");
  }
  return value;
}

export function generateKey(random: (max: number) => number = (n) => randomInt(0, n)): string {
  return String(random(1_000_000)).padStart(6, "0");
}

export function hashKey(confirmationId: number, key: string): string {
  return createHmac("sha256", secret()).update(`visit-key|${confirmationId}|${key}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function linkMac(id: number, nonce: string): string {
  return createHmac("sha256", secret()).update(`visit-link|${id}|${nonce}`).digest("base64url");
}

export function buildLinkToken(row: Pick<ConfirmationRow, "id" | "link_nonce">): string | null {
  return row.link_nonce ? `${row.id}.${linkMac(row.id, row.link_nonce)}` : null;
}

/** Impressão do aparelho que clicou: hash com segredo do servidor (não reversível, sem dado pessoal extra). */
export function fingerprint(ip: string | undefined, userAgent: string | undefined): string {
  return createHmac("sha256", secret()).update(`visit-fp|${ip ?? ""}|${userAgent ?? ""}`).digest("hex").slice(0, 32);
}

export function parseToken(token: string): { id: number; mac: string } | null {
  const m = /^(\d{1,9})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
  return m ? { id: Number(m[1]), mac: m[2] } : null;
}

const iso = (d: Date) => d.toISOString();
const toDate = (v: Date | string | null | undefined): Date | null => (v ? new Date(v) : null);

// ---------------------------------------------------------------------------
// Acesso à linha e eventos
// ---------------------------------------------------------------------------
async function rowsOf<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

export async function getBySession(sessionId: number, empresaId: number): Promise<ConfirmationRow | null> {
  const [row] = await rowsOf<ConfirmationRow>(sql`
    SELECT * FROM visit_confirmations WHERE session_id = ${sessionId} AND empresa_id = ${empresaId} LIMIT 1`);
  return row ?? null;
}

export async function getById(id: number): Promise<ConfirmationRow | null> {
  const [row] = await rowsOf<ConfirmationRow>(sql`SELECT * FROM visit_confirmations WHERE id = ${id} LIMIT 1`);
  return row ?? null;
}

export async function getOrCreate(ref: VisitRef): Promise<ConfirmationRow> {
  await db.execute(sql`
    INSERT INTO visit_confirmations (session_id, empresa_id, client_id, location_id)
    VALUES (${ref.sessionId}, ${ref.empresaId}, ${ref.clientId}, ${ref.locationId})
    ON CONFLICT (session_id) DO NOTHING`);
  const row = await getBySession(ref.sessionId, ref.empresaId);
  // Linha de outra empresa/cliente com o mesmo session_id nunca é entregue (isolamento).
  if (!row || row.client_id !== ref.clientId) {
    throw new Error("Confirmação da visita inconsistente com a empresa ou o cliente.");
  }
  return row;
}

async function logEvent(row: Pick<ConfirmationRow, "id" | "session_id" | "empresa_id">, event: string,
  professionalId: number | null, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO visit_confirmation_events (confirmation_id, session_id, empresa_id, event, professional_id, detail)
      VALUES (${row.id}, ${row.session_id}, ${row.empresa_id}, ${event}, ${professionalId}, ${JSON.stringify(detail)}::jsonb)`);
  } catch (error) {
    // O histórico nunca derruba a ação; a falha fica no log do servidor (sem dado do cliente).
    logger.warn({ err: (error as Error).message, event }, "[visit-confirmation] falha ao gravar evento");
  }
}

// ---------------------------------------------------------------------------
// Resumo seguro para a tela da enfermagem (nunca devolve hash nem chave)
// ---------------------------------------------------------------------------
export function summarize(row: ConfirmationRow | null, now: Date) {
  if (!row) {
    return {
      estado: "sem_pedido" as ConfirmationState, rotulo: STATE_LABEL.sem_pedido,
      chaveAtiva: false, chaveValidaAte: null as string | null, tentativasRestantesChave: KEY_MAX_ATTEMPTS,
      podeEnviarChave: true, aguardeSegundos: 0, completa: false, pendente: false,
      emailsEnviadosCliente: 0, emailsTotal: CLIENT_EMAILS_TOTAL, desafioTravado: false,
      rubrica: null as null | { metodo: string; em: string }, confirmadaEm: null as string | null,
      confirmadaComAtraso: false,
    };
  }
  const complete = (COMPLETE_STATES as readonly string[]).includes(row.state);
  const exp = toDate(row.key_expires_at);
  const sent = toDate(row.key_sent_at);
  const active = Boolean(row.key_hash && exp && exp > now && row.key_attempts < KEY_MAX_ATTEMPTS);
  const wait = sent ? Math.max(0, Math.ceil((sent.getTime() + KEY_RESEND_MIN_MS - now.getTime()) / 1000)) : 0;
  return {
    estado: row.state, rotulo: STATE_LABEL[row.state] ?? row.state,
    chaveAtiva: active, chaveValidaAte: active && exp ? iso(exp) : null,
    tentativasRestantesChave: Math.max(0, KEY_MAX_ATTEMPTS - row.key_attempts),
    podeEnviarChave: !complete && wait === 0, aguardeSegundos: complete ? 0 : wait,
    completa: complete, pendente: Boolean(row.pending_at) && !complete,
    emailsEnviadosCliente: row.client_emails_sent, emailsTotal: CLIENT_EMAILS_TOTAL,
    desafioTravado: row.challenge_locked,
    rubrica: row.rubrica_at && row.rubrica_method
      ? { metodo: row.rubrica_method, em: iso(new Date(row.rubrica_at)) } : null,
    confirmadaEm: row.confirmed_at ? iso(new Date(row.confirmed_at)) : null,
    confirmadaComAtraso: row.confirmed_late,
  };
}

// ---------------------------------------------------------------------------
// Chave de 6 dígitos
// ---------------------------------------------------------------------------
export type IssueResult =
  | { ok: true; key: string; keyHash: string; confirmationId: number; expiresAt: Date }
  | { ok: false; reason: "ja_completa" | "aguarde"; retryAfterSec?: number };

export async function issueKey(ref: VisitRef, professionalId: number | null, now: Date = new Date()): Promise<IssueResult> {
  const row = await getOrCreate(ref);
  if ((COMPLETE_STATES as readonly string[]).includes(row.state)) return { ok: false, reason: "ja_completa" };
  const key = generateKey();
  const keyHash = hashKey(row.id, key);
  const expiresAt = new Date(now.getTime() + KEY_TTL_MS);
  const threshold = new Date(now.getTime() - KEY_RESEND_MIN_MS);
  const claimed = await rowsOf<{ id: number }>(sql`
    UPDATE visit_confirmations
       SET key_hash = ${keyHash}, key_expires_at = ${iso(expiresAt)}::timestamptz, key_attempts = 0,
           key_sent_at = ${iso(now)}::timestamptz, key_used_at = NULL,
           state = CASE WHEN state = 'sem_pedido' THEN 'chave_enviada' ELSE state END,
           updated_at = ${iso(now)}::timestamptz
     WHERE id = ${row.id}
       AND state NOT IN ('rubrica_chave', 'confirmada_email')
       AND (key_sent_at IS NULL OR key_sent_at <= ${iso(threshold)}::timestamptz)
     RETURNING id`);
  if (claimed.length === 0) {
    const fresh = await getById(row.id);
    if (fresh && (COMPLETE_STATES as readonly string[]).includes(fresh.state)) return { ok: false, reason: "ja_completa" };
    const sent = toDate(fresh?.key_sent_at);
    const retry = sent ? Math.max(1, Math.ceil((sent.getTime() + KEY_RESEND_MIN_MS - now.getTime()) / 1000)) : 1;
    return { ok: false, reason: "aguarde", retryAfterSec: retry };
  }
  await logEvent(row, "chave_emitida", professionalId);
  return { ok: true, key, keyHash, confirmationId: row.id, expiresAt };
}

/** Nenhum canal aceitou a chave: devolve a trava de 60 s para a enfermeira tentar de novo na hora. */
export async function releaseUnsentKey(confirmationId: number, keyHash: string): Promise<void> {
  await db.execute(sql`
    UPDATE visit_confirmations
       SET key_hash = NULL, key_expires_at = NULL, key_sent_at = NULL,
           state = CASE WHEN state = 'chave_enviada' THEN 'sem_pedido' ELSE state END
     WHERE id = ${confirmationId} AND key_hash = ${keyHash}`);
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "formato" | "sem_chave" | "expirada" | "tentativas_esgotadas" | "ja_completa" | "ja_usada" }
  | { ok: false; reason: "incorreta"; tentativasRestantes: number };

export async function verifyKey(ref: VisitRef, code: unknown, professionalId: number, now: Date = new Date()): Promise<VerifyResult> {
  const typed = typeof code === "string" ? code.trim() : "";
  if (!/^\d{6}$/.test(typed)) return { ok: false, reason: "formato" };
  const row = await getBySession(ref.sessionId, ref.empresaId);
  if (!row || row.client_id !== ref.clientId) return { ok: false, reason: "sem_chave" };
  if ((COMPLETE_STATES as readonly string[]).includes(row.state)) return { ok: false, reason: "ja_completa" };

  // Conta a tentativa ANTES de comparar: tentativas simultâneas nunca passam de 5.
  const counted = await rowsOf<{ key_hash: string; key_attempts: number }>(sql`
    UPDATE visit_confirmations
       SET key_attempts = key_attempts + 1, updated_at = ${iso(now)}::timestamptz
     WHERE id = ${row.id} AND key_hash IS NOT NULL AND key_used_at IS NULL
       AND key_expires_at > ${iso(now)}::timestamptz AND key_attempts < ${KEY_MAX_ATTEMPTS}
       AND state NOT IN ('rubrica_chave', 'confirmada_email')
     RETURNING key_hash, key_attempts`);
  if (counted.length === 0) {
    const fresh = (await getById(row.id)) ?? row;
    if ((COMPLETE_STATES as readonly string[]).includes(fresh.state)) return { ok: false, reason: "ja_completa" };
    if (fresh.key_attempts >= KEY_MAX_ATTEMPTS) return { ok: false, reason: "tentativas_esgotadas" };
    if (!fresh.key_hash) return { ok: false, reason: fresh.key_used_at ? "ja_usada" : "sem_chave" };
    return { ok: false, reason: "expirada" };
  }
  const { key_hash: stored, key_attempts: attempts } = counted[0];
  if (safeEqualHex(stored, hashKey(row.id, typed))) {
    const consumed = await rowsOf<{ id: number }>(sql`
      UPDATE visit_confirmations
         SET key_hash = NULL, key_used_at = ${iso(now)}::timestamptz, state = 'rubrica_chave',
             rubrica_at = ${iso(now)}::timestamptz, rubrica_method = 'chave',
             rubrica_by_professional_id = ${professionalId}, updated_at = ${iso(now)}::timestamptz
       WHERE id = ${row.id} AND key_hash = ${stored} AND key_used_at IS NULL
         AND state <> 'confirmada_email'
       RETURNING id`);
    if (consumed.length === 0) {
      const fresh = await getById(row.id);
      return { ok: false, reason: fresh && (COMPLETE_STATES as readonly string[]).includes(fresh.state) ? "ja_completa" : "ja_usada" };
    }
    await logEvent(row, "rubrica_chave", professionalId);
    return { ok: true };
  }
  if (attempts >= KEY_MAX_ATTEMPTS) {
    await db.execute(sql`UPDATE visit_confirmations SET key_hash = NULL WHERE id = ${row.id} AND key_hash = ${stored}`);
    await logEvent(row, "chave_esgotada", professionalId);
    return { ok: false, reason: "tentativas_esgotadas" };
  }
  await logEvent(row, "chave_incorreta", professionalId, { tentativa: attempts });
  return { ok: false, reason: "incorreta", tentativasRestantes: KEY_MAX_ATTEMPTS - attempts };
}

// ---------------------------------------------------------------------------
// Contexto da visita (nomes, contatos, data) — lido do banco no momento do envio
// ---------------------------------------------------------------------------
export interface VisitContext {
  sessionId: number; empresaId: number; status: string; archived: boolean;
  scheduledDate: string; scheduledTime: string;
  clientId: number; clientName: string; clientEmail: string | null; clientPhone: string | null;
  telegramChatId: string | null; locationId: number | null;
  cpf: string | null; birthDate: string | null; address: string | null;
}

export async function loadContext(sessionId: number): Promise<VisitContext | null> {
  const [r] = await rowsOf<Record<string, any>>(sql`
    SELECT s.id AS session_id, s.empresa_id AS session_empresa, s.status, s.agenda_archived,
           s.scheduled_date, s.scheduled_time,
           c.id AS client_id, c.empresa_id AS client_empresa, c.name, c.email, c.phone,
           c.telegram_chat_id, c.location_id, c.cpf, c.birth_date, c.address
      FROM sessions s JOIN clients c ON c.id = s.client_id
     WHERE s.id = ${sessionId} LIMIT 1`);
  if (!r) return null;
  return {
    sessionId: r.session_id, empresaId: r.session_empresa ?? r.client_empresa, status: r.status,
    archived: Boolean(r.agenda_archived), scheduledDate: r.scheduled_date, scheduledTime: r.scheduled_time,
    clientId: r.client_id, clientName: r.name ?? "", clientEmail: (r.email ?? "").trim() || null,
    clientPhone: (r.phone ?? "").trim() || null, telegramChatId: (r.telegram_chat_id ?? "").trim() || null,
    locationId: r.location_id ?? null, cpf: r.cpf ?? null, birthDate: r.birth_date ?? null, address: r.address ?? null,
  };
}

/**
 * A confirmação do cliente diz "a aplicação aconteceu": só faz sentido depois de a enfermagem registrar
 * ao menos uma aplicação desta visita. (Não condiciona o REGISTRO da aplicação à confirmação — o inverso.)
 */
export async function hasRegisteredApplication(sessionId: number): Promise<boolean> {
  const rows = await rowsOf<{ ok: number }>(sql`
    SELECT 1 AS ok FROM substance_applications WHERE session_id = ${sessionId} AND status = 'applied' LIMIT 1`);
  return rows.length > 0;
}

/**
 * Endereço de máquina local ou de rede privada: nunca abre no aparelho do cliente.
 * Recebe o nome já normalizado por `new URL(...).hostname` (que converte formas como 2130706433 em
 * 127.0.0.1). Endereço IPv6 literal (inclusive o mapeado de IPv4, como [::ffff:127.0.0.1]) não é
 * aceito como endereço público do sistema: o domínio da clínica é sempre um nome.
 */
function isLocalOrPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.+$/, ""); // "localhost." (ponto final) é o mesmo nome
  if (h === "" || h.includes(":") || h.startsWith("[")) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Endereço público para o link de um clique. A resolução é do ajudante único do motor Hermes
 * (messaging/base-url.ts); aqui só se recusa endereço de máquina local ou de rede privada.
 */
export function linkBaseUrl(): string | null {
  const base = baseUrlFromEnv();
  try {
    return isLocalOrPrivateHost(new URL(base).hostname) ? null : base;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Envio da chave ao cliente (nunca bloqueia; relato honesto por canal)
// ---------------------------------------------------------------------------
export async function sendKeyToClient(channels: ChannelSenders, ctx: VisitContext, key: string): Promise<ChannelReport[]> {
  const when = whenLabel(ctx.scheduledDate, ctx.scheduledTime);
  const doc = keyMessage({ clientName: ctx.clientName, key, minutes: KEY_TTL_MS / 60_000, when });
  return sendDocToClient(channels, ctx, doc);
}

/**
 * Envia um documento aos 3 canais do cliente (e-mail, WhatsApp, Telegram) com relato honesto por canal.
 * Compartilhado pela chave (K8) e pelo aviso de aplicação realizada (K10). Nunca lança por falha de canal.
 */
export async function sendDocToClient(channels: ChannelSenders, ctx: VisitContext, doc: PaxterDoc): Promise<ChannelReport[]> {
  const report: ChannelReport[] = [];

  if (ctx.clientEmail) {
    try {
      const r = await channels.sendEmail(ctx.clientEmail, doc);
      report.push({ canal: "email", estado: r.success ? "aceito" : "falhou" });
    } catch { report.push({ canal: "email", estado: "falhou" }); }
  } else report.push({ canal: "email", estado: "sem_contato" });

  if (ctx.clientPhone) {
    try {
      const r = await channels.sendWhatsapp(ctx.clientPhone, doc);
      report.push({ canal: "whatsapp", estado: r.sent && r.via === "twilio" ? "aceito" : "falhou" });
    } catch { report.push({ canal: "whatsapp", estado: "falhou" }); }
  } else report.push({ canal: "whatsapp", estado: "sem_contato" });

  if (ctx.telegramChatId) {
    try {
      const r = await channels.sendTelegram(ctx.telegramChatId, doc);
      report.push({ canal: "telegram", estado: r.sent ? (r.mock ? "simulado" : "aceito") : "falhou" });
    } catch { report.push({ canal: "telegram", estado: "falhou" }); }
  } else report.push({ canal: "telegram", estado: "sem_contato" });

  return report;
}

// ---------------------------------------------------------------------------
// "Cliente confirma depois"
// ---------------------------------------------------------------------------
export type PendingOrigin = "enfermeira" | "desafio" | "desafio_travado";
export type PendingResult =
  | { ok: true; already: boolean; confirmationId: number }
  | { ok: false; reason: "ja_completa" };

export async function markPending(ref: VisitRef,
  args: { professionalId: number | null; origin: PendingOrigin; reason?: string | null },
  now: Date = new Date()): Promise<PendingResult> {
  const row = await getOrCreate(ref);
  if ((COMPLETE_STATES as readonly string[]).includes(row.state)) return { ok: false, reason: "ja_completa" };
  if (row.pending_at) return { ok: true, already: true, confirmationId: row.id };
  const nonce = randomBytes(32).toString("base64url");
  const reason = (args.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null;
  const claimed = await rowsOf<{ id: number }>(sql`
    UPDATE visit_confirmations
       SET state = CASE WHEN state = 'rubrica_desafio' THEN state ELSE 'pendente' END,
           pending_at = ${iso(now)}::timestamptz, pending_by_professional_id = ${args.professionalId},
           pending_origin = ${args.origin}, pending_reason = ${reason},
           link_nonce = ${nonce}, link_expires_at = ${iso(new Date(now.getTime() + LINK_TTL_MS))}::timestamptz,
           client_emails_sent = 0, next_client_email_at = ${iso(now)}::timestamptz,
           updated_at = ${iso(now)}::timestamptz
     WHERE id = ${row.id} AND pending_at IS NULL AND state NOT IN ('rubrica_chave', 'confirmada_email')
     RETURNING id`);
  if (claimed.length === 0) {
    const fresh = await getById(row.id);
    if (fresh && (COMPLETE_STATES as readonly string[]).includes(fresh.state)) return { ok: false, reason: "ja_completa" };
    return { ok: true, already: true, confirmationId: row.id };
  }
  await logEvent(row, "pendente_acionado", args.professionalId, { origem: args.origin, motivo: reason });
  return { ok: true, already: false, confirmationId: row.id };
}

// ---------------------------------------------------------------------------
// Link de um clique
// ---------------------------------------------------------------------------
export type LinkLookup =
  | { status: "ok"; row: ConfirmationRow }
  | { status: "ja_confirmada"; row: ConfirmationRow }
  | { status: "invalido" }
  | { status: "expirado" };

export async function lookupLink(token: string, now: Date = new Date()): Promise<LinkLookup> {
  const parsed = parseToken(token);
  if (!parsed) return { status: "invalido" };
  const row = await getById(parsed.id);
  if (!row || !row.link_nonce) return { status: "invalido" };
  if (!safeEqualHex(linkMac(row.id, row.link_nonce), parsed.mac)) return { status: "invalido" };
  if ((COMPLETE_STATES as readonly string[]).includes(row.state)) return { status: "ja_confirmada", row };
  const exp = toDate(row.link_expires_at);
  if (!exp || exp <= now) return { status: "expirado" };
  return { status: "ok", row };
}

export async function confirmByLink(token: string, fingerprint: string, now: Date = new Date()):
  Promise<{ status: "confirmada" | "ja_confirmada" | "invalido" | "expirado"; late?: boolean }> {
  const found = await lookupLink(token, now);
  if (found.status === "invalido" || found.status === "expirado") return { status: found.status };
  if (found.status === "ja_confirmada") return { status: "ja_confirmada" };
  const claimed = await rowsOf<{ confirmed_late: boolean }>(sql`
    UPDATE visit_confirmations
       SET confirmed_late = (state = 'nao_confirmada'), state = 'confirmada_email',
           confirmed_at = ${iso(now)}::timestamptz, confirmed_fingerprint = ${fingerprint},
           updated_at = ${iso(now)}::timestamptz
     WHERE id = ${found.row.id} AND confirmed_at IS NULL
       AND state IN ('pendente', 'rubrica_desafio', 'nao_confirmada')
     RETURNING confirmed_late`);
  if (claimed.length === 0) return { status: "ja_confirmada" };
  await logEvent(found.row, "confirmada_email", null, { comAtraso: claimed[0].confirmed_late });
  return { status: "confirmada", late: claimed[0].confirmed_late };
}

// ---------------------------------------------------------------------------
// Gestão: gestor administrador e responsável técnico do local da visita
// ---------------------------------------------------------------------------
export interface ManagerRecipient { email: string; name: string }

export async function listManagers(locationId: number | null, empresaId: number): Promise<ManagerRecipient[]> {
  if (!locationId) return [];
  const rows = await rowsOf<{ email: string | null; name: string }>(sql`
    SELECT p.email, p.name
      FROM clinical_access_grants g
      JOIN professionals p ON p.id = g.professional_id
      JOIN locations l ON l.id = g.location_id
      JOIN location_professionals lp ON lp.professional_id = g.professional_id AND lp.location_id = g.location_id
     WHERE g.location_id = ${locationId} AND g.empresa_id = ${empresaId} AND l.empresa_id = ${empresaId}
       AND l.active = 'true' AND p.active IS TRUE
       AND (g.is_clinic_admin IS TRUE OR g.is_responsible_doctor IS TRUE)`);
  const seen = new Set<string>();
  const out: ManagerRecipient[] = [];
  for (const r of rows) {
    const email = (r.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: r.name });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Motor de envio: e-mails ao cliente e à gestão (idempotente, reserva antes de enviar)
// ---------------------------------------------------------------------------
export interface DispatchStats {
  clienteEmails: number; gestaoInicio: number; gestaoFinal: number;
  falhas: number; pulados: number; curados: number; avisos: string[];
}

async function nurseName(professionalId: number | null): Promise<string | null> {
  if (!professionalId) return null;
  const [p] = await rowsOf<{ name: string }>(sql`SELECT name FROM professionals WHERE id = ${professionalId} LIMIT 1`);
  return p?.name ?? null;
}

async function sendToManagers(channels: ChannelSenders, row: ConfirmationRow, ctx: VisitContext,
  kind: "inicio" | "final", stats: DispatchStats, fresh: ConfirmationRow): Promise<void> {
  const managers = await listManagers(ctx.locationId, ctx.empresaId);
  if (managers.length === 0) {
    await logEvent(row, `gestao_${kind}_sem_destinatario`, null);
    stats.avisos.push("Nenhum gestor administrador ou responsável técnico com e-mail cadastrado nesta clínica.");
    return;
  }
  const doc = managerEmail({
    kind, clientName: ctx.clientName, when: whenLabel(ctx.scheduledDate, ctx.scheduledTime),
    nurseName: await nurseName(fresh.pending_by_professional_id), origin: fresh.pending_origin ?? "enfermeira",
    clientHasEmail: Boolean(ctx.clientEmail), emailsSent: fresh.client_emails_sent, emailsFailed: fresh.client_email_failures,
  });
  let ok = 0;
  for (const m of managers) {
    try {
      const r = await channels.sendEmail(m.email, doc);
      if (r.success) ok++; else stats.falhas++;
    } catch { stats.falhas++; }
  }
  await logEvent(row, `gestao_${kind}_enviada`, null, { destinatarios: managers.length, aceitos: ok });
  if (ok === 0) stats.avisos.push("Os e-mails à gestão não foram aceitos pelo provedor de envio.");
  if (kind === "inicio") stats.gestaoInicio += ok; else stats.gestaoFinal += ok;
}

export async function dispatchDue(channels: ChannelSenders,
  opts: { now?: Date; onlyId?: number; limit?: number } = {}): Promise<DispatchStats> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 50;
  const stats: DispatchStats = { clienteEmails: 0, gestaoInicio: 0, gestaoFinal: 0, falhas: 0, pulados: 0, curados: 0, avisos: [] };
  const only = opts.onlyId ?? null;
  const onlyFilter = only === null ? sql`` : sql`AND id = ${only}`;

  // 0) Cura: desafio acertado/travado sem o caminho por e-mail ligado (falha anterior) liga agora.
  const orphans = await rowsOf<ConfirmationRow>(sql`
    SELECT * FROM visit_confirmations
     WHERE pending_at IS NULL AND state NOT IN ('rubrica_chave', 'confirmada_email')
       AND (state = 'rubrica_desafio' OR challenge_locked IS TRUE) ${onlyFilter}
     ORDER BY id LIMIT ${limit}`);
  for (const o of orphans) {
    const r = await markPending({ sessionId: o.session_id, empresaId: o.empresa_id, clientId: o.client_id, locationId: o.location_id },
      { professionalId: o.rubrica_by_professional_id, origin: o.challenge_locked ? "desafio_travado" : "desafio" }, now);
    if (r.ok && !r.already) stats.curados++;
  }

  // A) E-mail ao cliente: no ato, +24 h, +48 h (3 ao todo), parando na confirmação.
  const due = await rowsOf<ConfirmationRow>(sql`
    SELECT * FROM visit_confirmations
     WHERE state IN ('pendente', 'rubrica_desafio') AND pending_at IS NOT NULL
       AND client_emails_sent < ${CLIENT_EMAILS_TOTAL} AND next_client_email_at <= ${iso(now)}::timestamptz ${onlyFilter}
     ORDER BY next_client_email_at LIMIT ${limit}`);
  for (const row of due) {
    const ctx = await loadContext(row.session_id);
    if (!ctx || ctx.archived || ctx.status === "cancelled" || ctx.empresaId !== row.empresa_id) { stats.pulados++; continue; }
    const n = row.client_emails_sent + 1;
    const next = n >= CLIENT_EMAILS_TOTAL ? null : new Date(now.getTime() + CLIENT_EMAIL_INTERVAL_MS);
    const finalDue = n >= CLIENT_EMAILS_TOTAL ? new Date(now.getTime() + FINAL_DELAY_MS) : null;
    const claimed = await rowsOf<{ id: number }>(sql`
      UPDATE visit_confirmations
         SET client_emails_sent = client_emails_sent + 1,
             next_client_email_at = ${next ? iso(next) : null}::timestamptz,
             final_due_at = COALESCE(${finalDue ? iso(finalDue) : null}::timestamptz, final_due_at),
             updated_at = ${iso(now)}::timestamptz
       WHERE id = ${row.id} AND client_emails_sent = ${row.client_emails_sent}
         AND state IN ('pendente', 'rubrica_desafio') AND next_client_email_at <= ${iso(now)}::timestamptz
       RETURNING id`);
    if (claimed.length === 0) { stats.pulados++; continue; }
    const token = buildLinkToken(row);
    const base = linkBaseUrl();
    if (!ctx.clientEmail || !token || !base) {
      await db.execute(sql`UPDATE visit_confirmations SET client_email_failures = client_email_failures + 1 WHERE id = ${row.id}`);
      await logEvent(row, !ctx.clientEmail ? "cliente_sem_email" : "sem_url_publica", null, { n });
      stats.falhas++;
      if (!ctx.clientEmail) stats.avisos.push("O cliente não tem e-mail cadastrado; a confirmação por clique não pôde ser enviada.");
      if (ctx.clientEmail && !base) stats.avisos.push("Endereço público do sistema não configurado; o link de confirmação não pôde ser montado.");
      continue;
    }
    const doc = clientConfirmEmail({
      clientName: ctx.clientName, link: `${base}/api/confirmacao-visita/${token}`,
      when: whenLabel(ctx.scheduledDate, ctx.scheduledTime), n, total: CLIENT_EMAILS_TOTAL,
    });
    let accepted = false;
    try { accepted = (await channels.sendEmail(ctx.clientEmail, doc)).success; } catch { accepted = false; }
    if (accepted) stats.clienteEmails++;
    else {
      stats.falhas++;
      await db.execute(sql`UPDATE visit_confirmations SET client_email_failures = client_email_failures + 1 WHERE id = ${row.id}`);
      stats.avisos.push("O e-mail ao cliente não foi aceito pelo provedor de envio.");
    }
    await logEvent(row, accepted ? "email_cliente_enviado" : "email_cliente_falhou", null, { n });
  }

  // B) Gestão, no ato do botão.
  const firsts = await rowsOf<ConfirmationRow>(sql`
    SELECT * FROM visit_confirmations
     WHERE pending_at IS NOT NULL AND manager_first_sent_at IS NULL
       AND state NOT IN ('rubrica_chave', 'confirmada_email') ${onlyFilter}
     ORDER BY pending_at LIMIT ${limit}`);
  for (const row of firsts) {
    const ctx = await loadContext(row.session_id);
    if (!ctx || ctx.archived || ctx.status === "cancelled" || ctx.empresaId !== row.empresa_id) { stats.pulados++; continue; }
    const claimed = await rowsOf<ConfirmationRow>(sql`
      UPDATE visit_confirmations SET manager_first_sent_at = ${iso(now)}::timestamptz
       WHERE id = ${row.id} AND manager_first_sent_at IS NULL AND state NOT IN ('rubrica_chave', 'confirmada_email')
       RETURNING *`);
    if (claimed.length === 0) { stats.pulados++; continue; }
    await sendToManagers(channels, row, ctx, "inicio", stats, claimed[0]);
  }

  // C) Aviso final: 24 h depois do 3º e-mail do cliente, sem confirmação.
  const finals = await rowsOf<ConfirmationRow>(sql`
    SELECT * FROM visit_confirmations
     WHERE state IN ('pendente', 'rubrica_desafio') AND pending_at IS NOT NULL
       AND client_emails_sent >= ${CLIENT_EMAILS_TOTAL} AND final_due_at <= ${iso(now)}::timestamptz
       AND manager_final_sent_at IS NULL ${onlyFilter}
     ORDER BY final_due_at LIMIT ${limit}`);
  for (const row of finals) {
    const claimed = await rowsOf<ConfirmationRow>(sql`
      UPDATE visit_confirmations
         SET manager_final_sent_at = ${iso(now)}::timestamptz,
             state = CASE WHEN state = 'pendente' THEN 'nao_confirmada' ELSE state END,
             updated_at = ${iso(now)}::timestamptz
       WHERE id = ${row.id} AND manager_final_sent_at IS NULL AND state IN ('pendente', 'rubrica_desafio')
       RETURNING *`);
    if (claimed.length === 0) { stats.pulados++; continue; }
    await logEvent(row, "nao_confirmada", null);
    const ctx = await loadContext(row.session_id);
    if (!ctx || ctx.empresaId !== row.empresa_id) { stats.pulados++; continue; }
    await sendToManagers(channels, row, ctx, "final", stats, claimed[0]);
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Desafio presencial
// ---------------------------------------------------------------------------
export interface ChallengeView {
  rodada: number; maxRodadas: number; tentativasRestantes: number;
  metades: [{ rotulo: string; tamanho: 3 }, { rotulo: string; tamanho: 3 }];
}
export type ChallengeGet =
  | { estado: "disponivel"; desafio: ChallengeView }
  | { estado: "travado" | "completa" }
  | { estado: "indisponivel"; motivo: "dados_insuficientes" };

function viewOf(row: ConfirmationRow): ChallengeView {
  return {
    rodada: row.challenge_round, maxRodadas: MAX_ROUNDS,
    tentativasRestantes: Math.max(0, ATTEMPTS_PER_ROUND - row.challenge_attempts),
    metades: [
      { rotulo: fieldLabel(row.challenge_field_a ?? "") ?? "", tamanho: 3 },
      { rotulo: fieldLabel(row.challenge_field_b ?? "") ?? "", tamanho: 3 },
    ],
  };
}

const clientData = (ctx: VisitContext): ChallengeClientData => ({ cpf: ctx.cpf, birthDate: ctx.birthDate, address: ctx.address });

export async function getChallenge(ref: VisitRef, ctx: VisitContext): Promise<ChallengeGet> {
  let row = await getOrCreate(ref);
  if ((COMPLETE_STATES as readonly string[]).includes(row.state)) return { estado: "completa" };
  if (row.challenge_locked) return { estado: "travado" };
  if (!row.challenge_field_a || !row.challenge_field_b) {
    const pair = drawPair(clientData(ctx), []);
    if (!pair) return { estado: "indisponivel", motivo: "dados_insuficientes" };
    await db.execute(sql`
      UPDATE visit_confirmations
         SET challenge_round = 1, challenge_attempts = 0, challenge_field_a = ${pair.a}, challenge_field_b = ${pair.b},
             challenge_pairs_used = ${JSON.stringify([pairSignature(pair.a, pair.b)])}::jsonb
       WHERE id = ${row.id} AND challenge_field_a IS NULL`);
    row = (await getById(row.id)) ?? row;
  }
  return { estado: "disponivel", desafio: viewOf(row) };
}

export type ChallengeSubmit =
  | { ok: true; metodo: "desafio" }
  | { ok: false; reason: "ja_completa" | "travado" | "sem_desafio" | "tente_novamente" | "formato" }
  | { ok: false; reason: "incorreta"; tentativasRestantes: number }
  | { ok: false; reason: "nova_rodada"; desafio: ChallengeView }
  | { ok: false; reason: "travou"; pendenteAcionado: boolean };

export async function submitChallenge(ref: VisitRef, ctx: VisitContext,
  answers: { metade1?: unknown; metade2?: unknown }, professionalId: number, now: Date = new Date()): Promise<ChallengeSubmit> {
  const row = await getBySession(ref.sessionId, ref.empresaId);
  if (!row || row.client_id !== ref.clientId) return { ok: false, reason: "sem_desafio" };
  if ((COMPLETE_STATES as readonly string[]).includes(row.state)) return { ok: false, reason: "ja_completa" };
  if (row.challenge_locked) return { ok: false, reason: "travado" };
  const a = row.challenge_field_a; const b = row.challenge_field_b;
  if (!a || !b) return { ok: false, reason: "sem_desafio" };
  const h1 = String(answers.metade1 ?? ""); const h2 = String(answers.metade2 ?? "");
  if (h1.trim().length === 0 || h2.trim().length === 0 || h1.length > 12 || h2.length > 12) return { ok: false, reason: "formato" };

  const counted = await rowsOf<{ challenge_attempts: number }>(sql`
    UPDATE visit_confirmations SET challenge_attempts = challenge_attempts + 1, updated_at = ${iso(now)}::timestamptz
     WHERE id = ${row.id} AND challenge_locked IS FALSE AND challenge_attempts < ${ATTEMPTS_PER_ROUND}
       AND challenge_round = ${row.challenge_round} AND challenge_field_a = ${a} AND challenge_field_b = ${b}
       AND state NOT IN ('rubrica_chave', 'confirmada_email')
     RETURNING challenge_attempts`);
  if (counted.length === 0) return { ok: false, reason: "tente_novamente" };
  const attempts = counted[0].challenge_attempts;

  if (answersMatch(a, b, h1, h2, clientData(ctx))) {
    // Só vale se o sorteio ainda for o vigente (uma rodada encerrada ou travada em paralelo anula a resposta).
    const won = await rowsOf<{ id: number }>(sql`
      UPDATE visit_confirmations
         SET state = CASE WHEN state IN ('sem_pedido', 'chave_enviada', 'pendente', 'nao_confirmada') THEN 'rubrica_desafio' ELSE state END,
             rubrica_at = ${iso(now)}::timestamptz, rubrica_method = 'desafio',
             rubrica_by_professional_id = ${professionalId}, updated_at = ${iso(now)}::timestamptz
       WHERE id = ${row.id} AND state NOT IN ('rubrica_chave', 'confirmada_email')
         AND challenge_locked IS FALSE AND challenge_round = ${row.challenge_round}
         AND challenge_field_a = ${a} AND challenge_field_b = ${b}
       RETURNING id`);
    if (won.length === 0) return { ok: false, reason: "tente_novamente" };
    await logEvent(row, "rubrica_desafio", professionalId, { rodada: row.challenge_round });
    return { ok: true, metodo: "desafio" };
  }

  await logEvent(row, "desafio_incorreto", professionalId, { rodada: row.challenge_round, tentativa: attempts });
  if (attempts < ATTEMPTS_PER_ROUND) {
    return { ok: false, reason: "incorreta", tentativasRestantes: ATTEMPTS_PER_ROUND - attempts };
  }
  // Rodada esgotada: novo sorteio (no máximo 3 rodadas) ou trava + liga o caminho por e-mail.
  const next = row.challenge_round < MAX_ROUNDS ? drawPair(clientData(ctx), row.challenge_pairs_used ?? []) : null;
  if (next) {
    const updated = await rowsOf<ConfirmationRow>(sql`
      UPDATE visit_confirmations
         SET challenge_round = challenge_round + 1, challenge_attempts = 0,
             challenge_field_a = ${next.a}, challenge_field_b = ${next.b},
             challenge_pairs_used = challenge_pairs_used || ${JSON.stringify([pairSignature(next.a, next.b)])}::jsonb
       WHERE id = ${row.id} AND challenge_round = ${row.challenge_round} AND challenge_attempts >= ${ATTEMPTS_PER_ROUND}
       RETURNING *`);
    if (updated.length > 0) return { ok: false, reason: "nova_rodada", desafio: viewOf(updated[0]) };
    return { ok: false, reason: "tente_novamente" };
  }
  await db.execute(sql`
    UPDATE visit_confirmations SET challenge_locked = TRUE, updated_at = ${iso(now)}::timestamptz
     WHERE id = ${row.id} AND challenge_round = ${row.challenge_round}`);
  await logEvent(row, "desafio_travado", professionalId, { rodadas: row.challenge_round });
  const pending = await markPending(ref, { professionalId, origin: "desafio_travado" }, now);
  return { ok: false, reason: "travou", pendenteAcionado: pending.ok };
}
