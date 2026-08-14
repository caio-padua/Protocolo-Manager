// Lib de verificação de dispositivo para a trava de escassez do Concierge.
//
// Responsabilidade:
//   - Bootstrap lazy das tabelas (CREATE IF NOT EXISTS) antes de qualquer query.
//   - checkDeviceOffer(fingerprint): verifica offer_count; se o dispositivo
//     já foi verificado (verified_at IS NOT NULL), pula toda fricção.
//     Devolve DeviceThrottleResult conforme contrato da seção 6.3 da ARQUITETURA.
//   - storeVerificationCode(): persiste OTP enviado ao canal do paciente.
//   - verifyDeviceCode(cpf, code): consome o OTP + libera device_offer_limits
//     em UMA única db.transaction (rollback se UPSERT falhar).
//     Throttle de tentativas: MAX_ATTEMPTS=5 por desafio, scoped ao challengeId
//     via CTE (não por CPF) para prevenir lockout remoto.
//   - isDeviceVerified(fingerprint): consulta verified_at em device_offer_limits.
//   - dia_brt usa brtISODate() — nunca CURRENT_DATE (seria UTC ao redor da
//     meia-noite BRT).

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { brtISODate } from "./brt.js";

/** Máximo de tentativas falhas por desafio antes de expirar. */
const MAX_ATTEMPTS = 5;

/**
 * A partir da 6ª oferta do dia para dispositivo não verificado, pedir código.
 * Conforme ARQUITETURA.md §6.2 regra 3.
 */
const VERIFICATION_THRESHOLD = 5;

/**
 * Teto duro anti-automação: 50 ofertas/dia.
 * Conforme ARQUITETURA.md §6.2 regra 4.
 */
const HARD_LIMIT = 50;

// ─── Bootstrap lazy das tabelas ───────────────────────────────────────────────
// Singleton por processo; zerado em caso de erro para permitir nova tentativa.
// device_verified_sessions: consultada por concierge-device-throttle.isDeviceVerified().
// O schema deve espelhar o que aquele módulo espera: device_fingerprint + expires_at.

let _verificationsReady: Promise<void> | null = null;
let _deviceLimitsReady: Promise<void> | null = null;
let _verifiedSessionsReady: Promise<void> | null = null;

async function ensureVerifiedSessionsTable(): Promise<void> {
  if (!_verifiedSessionsReady) {
    _verifiedSessionsReady = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS device_verified_sessions (
          id                 SERIAL      PRIMARY KEY,
          device_fingerprint TEXT        NOT NULL,
          verified_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at         TIMESTAMPTZ NOT NULL,
          UNIQUE (device_fingerprint)
        )
      `)
      .then(() => undefined)
      .catch((err: unknown) => {
        _verifiedSessionsReady = null;
        throw err;
      });
  }
  return _verifiedSessionsReady;
}

async function ensureVerificationsTable(): Promise<void> {
  if (!_verificationsReady) {
    _verificationsReady = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS device_contact_verifications (
          id                 SERIAL      PRIMARY KEY,
          cpf                TEXT        NOT NULL,
          device_fingerprint TEXT,
          code               TEXT        NOT NULL,
          sent_via           TEXT        NOT NULL DEFAULT 'whatsapp',
          phone              TEXT,
          sent_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at         TIMESTAMPTZ NOT NULL,
          verified_at        TIMESTAMPTZ,
          attempt_count      INTEGER     NOT NULL DEFAULT 0
        )
      `)
      .then(async () => {
        await db
          .execute(
            sql`ALTER TABLE device_contact_verifications ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0`,
          )
          .catch(() => undefined);
      })
      .then(() => undefined)
      .catch((err: unknown) => {
        _verificationsReady = null;
        throw err;
      });
  }
  return _verificationsReady;
}

async function ensureDeviceLimitsTable(): Promise<void> {
  if (!_deviceLimitsReady) {
    _deviceLimitsReady = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS device_offer_limits (
          id                  SERIAL      PRIMARY KEY,
          device_fingerprint  TEXT        NOT NULL,
          dia_brt             DATE        NOT NULL,
          offer_count         INTEGER     NOT NULL DEFAULT 0,
          first_offer_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_offer_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          verified_at         TIMESTAMPTZ,
          UNIQUE (device_fingerprint, dia_brt)
        )
      `)
      .then(async () => {
        await db
          .execute(
            sql`ALTER TABLE device_offer_limits ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`,
          )
          .catch(() => undefined);
      })
      .then(() => undefined)
      .catch((err: unknown) => {
        _deviceLimitsReady = null;
        throw err;
      });
  }
  return _deviceLimitsReady;
}

// ─── Contrato público (ARQUITETURA.md §6.3) ────────────────────────────────────

export interface DeviceThrottleResult {
  /** false somente se ultrapassou o teto rígido anti-automação (50/dia). */
  allowed: boolean;
  /** Ofertas restantes antes do teto rígido. */
  remaining: number;
  /** true se ultrapassou o teto anti-automação (50/dia). */
  throttled: boolean;
  /** true se passou do limiar de fricção e o dispositivo não está verificado. */
  requiresVerification: boolean;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Verifica e registra uma oferta de agenda para o dispositivo.
 *
 * Fluxo (ARQUITETURA.md §6.2):
 *   1. Sem fingerprint → permitido sem fricção (fingerprint é sinal de suspeita,
 *      não chave obrigatória; sem sinal, não há como inferir suspeita).
 *   2. Dispositivo já verificado (verified_at IS NOT NULL) → permitido sem fricção.
 *   3. Incrementa offer_count via UPSERT atômico (evita corrida).
 *   4. offer_count ≤ VERIFICATION_THRESHOLD → livre.
 *   5. VERIFICATION_THRESHOLD < offer_count ≤ HARD_LIMIT → requiresVerification.
 *   6. offer_count > HARD_LIMIT → throttled (teto anti-automação).
 *
 * Importante: `isDeviceVerified` é consultado ANTES de incrementar o contador,
 * garantindo que dispositivos verificados nunca acumulam oferta restritiva.
 */
export async function checkDeviceOffer(
  deviceFingerprint: string | null,
): Promise<DeviceThrottleResult> {
  const FREE = { allowed: true, remaining: HARD_LIMIT, throttled: false, requiresVerification: false };

  if (!deviceFingerprint) return FREE;

  await ensureDeviceLimitsTable();

  // Passo 1: dispositivo verificado → sem fricção, sem incremento.
  const verified = await isDeviceVerified(deviceFingerprint);
  if (verified) return FREE;

  // Passo 2: incrementa offer_count atomicamente.
  const diaBrt = brtISODate();
  const result = await db.execute(sql`
    INSERT INTO device_offer_limits
      (device_fingerprint, dia_brt, offer_count)
    VALUES
      (${deviceFingerprint}, ${diaBrt}::date, 1)
    ON CONFLICT (device_fingerprint, dia_brt)
    DO UPDATE SET
      offer_count   = device_offer_limits.offer_count + 1,
      last_offer_at = NOW()
    RETURNING offer_count
  `);

  const offerCount =
    ((result.rows[0] as { offer_count: number } | undefined)?.offer_count) ?? 1;
  const remaining = Math.max(0, HARD_LIMIT - offerCount);

  if (offerCount > HARD_LIMIT) {
    return { allowed: false, remaining: 0, throttled: true, requiresVerification: false };
  }

  return {
    allowed: true,
    remaining,
    throttled: false,
    requiresVerification: offerCount > VERIFICATION_THRESHOLD,
  };
}

export interface StoreVerificationCodeOpts {
  cpf: string;
  code: string;
  deviceFingerprint?: string | null;
  phone?: string | null;
  sentVia?: "whatsapp" | "telegram";
  /** Validade em minutos (padrão: 10). */
  ttlMinutes?: number;
}

/**
 * Persiste um código OTP recém-enviado ao canal do paciente.
 * Retorna o challengeId (PK do registro) para que o frontend possa enviá-lo
 * de volta em verify-device, permitindo scoping de tentativas por desafio.
 *
 * Chamado pela lógica de throttle quando aciona requiresVerification=true
 * (task #183 implementa o envio; esta função persiste o registro).
 */
export async function storeVerificationCode(
  opts: StoreVerificationCodeOpts,
): Promise<{ challengeId: number }> {
  await ensureVerificationsTable();
  const cpf = opts.cpf.replace(/\D/g, "");
  if (cpf.length < 11) throw new Error("CPF inválido para armazenar código OTP");

  const ttl = opts.ttlMinutes ?? 10;
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO device_contact_verifications
      (cpf, device_fingerprint, code, sent_via, phone, expires_at)
    VALUES (
      ${cpf},
      ${opts.deviceFingerprint ?? null},
      ${opts.code},
      ${opts.sentVia ?? "whatsapp"},
      ${opts.phone ?? null},
      ${expiresAt.toISOString()}
    )
    RETURNING id
  `);
  const row = (result.rows[0] as { id: number } | undefined);
  if (!row) throw new Error("storeVerificationCode: INSERT sem RETURNING id");
  return { challengeId: row.id };
}

export interface VerifyDeviceCodeResult {
  ok: boolean;
  /** Mensagem legível (retornar ao cliente em caso de falha). */
  message?: string;
}

type VerificationConsumed = { id: number; device_fingerprint: string | null };
type AttemptRow = { attempt_count: number };

/**
 * Garante que existe exatamente um desafio ativo para o par (cpf, fingerprint).
 * Se já existir um desafio não expirado e não consumido, retorna-o (idempotente).
 * Se não existir, gera um novo OTP e o persiste.
 *
 * Race-safe via pg_advisory_xact_lock(hashtext(cpf), hashtext(fingerprint)):
 * requisições concorrentes para o mesmo par ficam serializadas pelo lock de
 * transação — a segunda encontra o desafio criado pela primeira e o reutiliza.
 *
 * Não envia o código ao canal (task #183 faz o envio). Esta função apenas
 * garante que o challengeId existe para o frontend enviar de volta.
 */
export async function getOrCreateChallenge(opts: {
  cpf: string;
  fingerprint: string;
}): Promise<{ challengeId: number; isNew: boolean }> {
  await ensureVerificationsTable();

  // Importa crypto fora da transação (import() é impuro — não deve estar no CTE).
  const { randomInt } = await import("crypto");

  return db.transaction(async (tx) => {
    // Lock de transação por par (cpf, fingerprint) — serializa concorrência.
    // hashtext() retorna int4; a forma de 2 argumentos usa dois int4 → espaço de
    // colisão muito menor que bigint, mas suficiente para este contexto clínico
    // onde (cpf, fingerprint) já identifica o par de forma determinística.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${opts.cpf}), hashtext(${opts.fingerprint}))
    `);

    // Reusa o desafio ativo mais recente para o par (cpf, fingerprint).
    const existing = await tx.execute<{ id: number }>(sql`
      SELECT id FROM device_contact_verifications
      WHERE  cpf                = ${opts.cpf}
        AND  device_fingerprint = ${opts.fingerprint}
        AND  verified_at        IS NULL
        AND  expires_at         > NOW()
        AND  attempt_count      < ${MAX_ATTEMPTS}
      ORDER BY id DESC
      LIMIT 1
    `);

    const existingRow = (existing.rows[0]) as { id: number } | undefined;
    if (existingRow) {
      return { challengeId: existingRow.id, isNew: false };
    }

    // Nenhum desafio ativo → gera novo OTP de 6 dígitos e persiste (ainda dentro do lock).
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const inserted = await tx.execute<{ id: number }>(sql`
      INSERT INTO device_contact_verifications
        (cpf, device_fingerprint, code, sent_via, expires_at)
      VALUES
        (${opts.cpf}, ${opts.fingerprint}, ${code}, ${"whatsapp"}, ${expiresAt.toISOString()})
      RETURNING id
    `);

    const newRow = (inserted.rows[0]) as { id: number } | undefined;
    if (!newRow) throw new Error("getOrCreateChallenge: INSERT sem RETURNING id");

    return { challengeId: newRow.id, isNew: true };
  });
}

/**
 * Valida o código OTP digitado pelo paciente.
 *
 * @param rawCpf       CPF do paciente (com ou sem máscara).
 * @param enteredCode  Código OTP informado pelo paciente.
 * @param challengeId  ID retornado em getOrCreateChallenge (obrigatório).
 *                     TODOS os UPDATEs (consumo + tentativas + expiração) são scoped
 *                     a este ID exato — um atacante com apenas o CPF não pode expirar
 *                     o OTP do paciente (ARQUITETURA.md §6.3).
 *
 * Fluxo (tudo em uma db.transaction):
 *   1. UPDATE WHERE id=$challengeId AND cpf=$cpf AND code=$code
 *      → consome o OTP atomicamente.
 *   2. Se consumido → INSERT em device_verified_sessions (fecha loop com
 *      concierge-device-throttle.isDeviceVerified) + UPSERT device_offer_limits.
 *   3. Se não consumido → incrementa attempt_count SOMENTE no desafio challengeId.
 *      Se ≥ MAX_ATTEMPTS → expira esse desafio e retorna mensagem clara.
 */
export async function verifyDeviceCode(
  rawCpf: string,
  enteredCode: string,
  challengeId: number,
): Promise<VerifyDeviceCodeResult> {
  await ensureVerificationsTable();
  await ensureDeviceLimitsTable();

  const cpf = rawCpf.replace(/\D/g, "");
  if (cpf.length < 11) {
    return { ok: false, message: "CPF inválido." };
  }

  const trimmedCode = (enteredCode ?? "").trim();
  if (!trimmedCode) {
    return { ok: false, message: "Código não informado." };
  }

  await ensureVerifiedSessionsTable();

  try {
    const consumed = await db.transaction(async (tx) => {
      // Passo 1: consumo atômico do OTP scoped ao desafio exato.
      // id + cpf + code no WHERE: impossível consumir desafio de outra pessoa.
      const result = await tx.execute(sql`
        UPDATE device_contact_verifications
        SET    verified_at = NOW()
        WHERE  id           = ${challengeId}
          AND  cpf          = ${cpf}
          AND  code         = ${trimmedCode}
          AND  verified_at  IS NULL
          AND  expires_at   > NOW()
          AND  attempt_count < ${MAX_ATTEMPTS}
        RETURNING id, device_fingerprint
      `);

      const row = result.rows[0] as VerificationConsumed | undefined;
      if (!row) return null;

      const fp = row.device_fingerprint;
      if (fp) {
        // Passo 2a: grava sessão verificada em device_verified_sessions
        //   → consultada por concierge-device-throttle.isDeviceVerified()
        //   → fecha o loop: OTP correto → isDeviceVerified=true → sem requiresVerification
        //   Validade de 90 dias — o paciente não precisa re-verificar com frequência.
        await tx.execute(sql`
          INSERT INTO device_verified_sessions
            (device_fingerprint, verified_at, expires_at)
          VALUES
            (${fp}, NOW(), NOW() + INTERVAL '90 days')
          ON CONFLICT (device_fingerprint)
          DO UPDATE SET verified_at = NOW(),
                        expires_at  = NOW() + INTERVAL '90 days'
        `);

        // Passo 2b: marca o dia atual em device_offer_limits (mesmo tx; rollback se falhar).
        const diaBrt = brtISODate();
        await tx.execute(sql`
          INSERT INTO device_offer_limits
            (device_fingerprint, dia_brt, offer_count, verified_at)
          VALUES
            (${fp}, ${diaBrt}::date, 0, NOW())
          ON CONFLICT (device_fingerprint, dia_brt)
          DO UPDATE SET verified_at = NOW()
        `);
      }

      return row;
    });

    if (!consumed) {
      // ── Incremento scoped ao challengeId exato (nunca afeta outro desafio) ─
      const incrementResult = await db.execute(sql`
        WITH target AS (
          SELECT id
          FROM   device_contact_verifications
          WHERE  id           = ${challengeId}
            AND  cpf          = ${cpf}
            AND  verified_at  IS NULL
            AND  expires_at   > NOW()
            AND  attempt_count < ${MAX_ATTEMPTS}
        )
        UPDATE device_contact_verifications
        SET    attempt_count = attempt_count + 1
        FROM   target
        WHERE  device_contact_verifications.id = target.id
        RETURNING device_contact_verifications.id,
                  device_contact_verifications.attempt_count
      `);

      const maxReached = (incrementResult.rows as AttemptRow[]).some(
        (r) => r.attempt_count >= MAX_ATTEMPTS,
      );

      if (maxReached) {
        // Expira exatamente este desafio (por ID — nunca afeta outros).
        await db.execute(sql`
          UPDATE device_contact_verifications
          SET    expires_at = NOW()
          WHERE  id          = ${challengeId}
            AND  cpf         = ${cpf}
            AND  verified_at IS NULL
            AND  attempt_count >= ${MAX_ATTEMPTS}
        `);
        return {
          ok: false,
          message: "Número de tentativas excedido. Solicite um novo código.",
        };
      }

      // Desafio não encontrado para este challengeId → já expirado ou inválido.
      const challengeExistsResult = await db.execute(sql`
        SELECT 1 FROM device_contact_verifications
        WHERE id = ${challengeId} AND cpf = ${cpf} LIMIT 1
      `);
      if (challengeExistsResult.rows.length === 0) {
        return {
          ok: false,
          message: "Nenhum código ativo encontrado. Solicite um novo código.",
        };
      }
      return { ok: false, message: "Código inválido. Verifique e tente novamente." };
    }

    return { ok: true };
  } catch (err) {
    throw err;
  }
}

// ─── Limpeza de linhas expiradas ──────────────────────────────────────────────

/**
 * Apaga linhas de device_contact_verifications com expires_at < NOW().
 *
 * Lança em caso de falha de banco para que boot e cron registrem o erro
 * corretamente em vez de reportar "0 linhas removidas" silenciosamente.
 */
export async function purgeExpiredVerificationCodes(): Promise<number> {
  await ensureVerificationsTable();
  const result = await db.execute<{ dummy: number }>(sql`
    DELETE FROM device_contact_verifications
     WHERE expires_at < NOW()
    RETURNING 1 AS dummy
  `);
  return (result.rows ?? (result as unknown as unknown[])).length;
}

/**
 * Apaga linhas de device_verified_sessions com expires_at < NOW().
 *
 * Lança em caso de falha de banco para que boot e cron registrem o erro
 * corretamente em vez de reportar "0 linhas removidas" silenciosamente.
 */
export async function purgeExpiredVerifiedSessions(): Promise<number> {
  await ensureVerifiedSessionsTable();
  const result = await db.execute<{ dummy: number }>(sql`
    DELETE FROM device_verified_sessions
     WHERE expires_at < NOW()
    RETURNING 1 AS dummy
  `);
  return (result.rows ?? (result as unknown as unknown[])).length;
}

/**
 * Retorna true se o dispositivo tem verified_at preenchido em qualquer dia.
 * Consultado por checkDeviceOffer para dispensar fricção em dispositivos
 * já verificados.
 */
export async function isDeviceVerified(deviceFingerprint: string): Promise<boolean> {
  if (!deviceFingerprint) return false;
  await ensureDeviceLimitsTable();

  const result = await db.execute(sql`
    SELECT 1
    FROM   device_offer_limits
    WHERE  device_fingerprint = ${deviceFingerprint}
      AND  verified_at IS NOT NULL
    LIMIT  1
  `);
  return result.rows.length > 0;
}
