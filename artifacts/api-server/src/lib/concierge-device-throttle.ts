// Controle de acesso por dispositivo no Concierge (ARQUITETURA.md §6.2-6.4).
//
// Regras normativas:
//   < 6 ofertas/dia e não verificado → livre
//   ≥ 6 ofertas/dia e não verificado → requiresVerification: true
//   ≥ 50 ofertas/dia (qualquer) → throttled: true (teto antiautomação)
//   Dispositivo com identidade verificada → nenhum dos flags
//   A fricção NUNCA grava penalidade no CPF.
//
// Transporte do fingerprint: extraído pelo SERVIDOR a partir dos headers HTTP
// (User-Agent + IP mascarado /24). Nunca aceitar do cliente via query param.
//
// O incremento é atômico (INSERT … ON CONFLICT DO UPDATE) para evitar corrida.
// dia_brt usa brtISODate() — Regra 6 do CEO: nunca new Date() cru.

import { createHash } from "node:crypto";
import type { Request } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { brtISODate } from "./brt.js";

/** Limites por dispositivo não verificado (ARQUITETURA.md §6.2). */
const LIMIT_VERIFICATION = 6;  // a partir da 6ª oferta → pede verificação
const LIMIT_THROTTLE = 50;     // teto rígido antiautomação

export interface DeviceThrottleResult {
  allowed: boolean;
  remaining: number;
  throttled: boolean;            // teto rígido antiautomação (>= 50/dia)
  requiresVerification: boolean; // fricção crescente (>= 6/dia, não verificado)
  message?: string;
}

// ─── Fingerprint server-side ──────────────────────────────────────────────────

/**
 * Retorna o IP do cliente após resolução do proxy (Express trust proxy).
 * Usa req.ip — NUNCA lê X-Forwarded-For diretamente, pois é header
 * controlado pelo cliente e pode ser forjado.
 * Com `app.set('trust proxy', 1)` no app.ts, Express resolve req.ip
 * a partir do XFF adicionado pelo proxy Replit (não do XFF enviado pelo cliente).
 * Retorna apenas os primeiros 3 octetos (máscara /24) para não expor PII.
 * Ex.: "189.110.37.42" → "189.110.37"
 */
function maskedIp(req: Request): string {
  const raw = req.ip ?? "";
  // Máscara /24: remove o último octeto (IPv4) ou o grupo final (IPv6 simplificado)
  return raw.trim().split(".").slice(0, 3).join(".");
}

/**
 * Produz um fingerprint de 16 chars a partir de sinais HTTP estáveis:
 *   User-Agent (identifica o browser/runtime) + IP mascarado (/24).
 *
 * Regra §6.2: "IP só vale combinado com outro sinal estável" → User-Agent.
 * Sem User-Agent E sem IP retorna "" (→ fail-open no checkDeviceThrottle).
 * Nunca expor o hash ao cliente: é identificador interno do servidor.
 */
export function deriveFingerprint(req: Request): string {
  const ua = (req.headers["user-agent"] ?? "").trim();
  const ip = maskedIp(req);
  if (!ua && !ip) return "";
  return createHash("sha256").update(`${ua}|${ip}`).digest("hex").slice(0, 16);
}

// ─── Verified state (server-side) ────────────────────────────────────────────

/**
 * Verifica se o fingerprint possui sessão confirmada pelo canal (task #79/#180).
 * A tabela device_verified_sessions é criada pelo sistema de verificação de código.
 * Enquanto não construído, sempre retorna false (fail-safe, nunca fail-open).
 *
 * NUNCA aceitar "verified" como query param ou header não assinado do cliente.
 */
export async function isDeviceVerified(fingerprint: string): Promise<boolean> {
  if (!fingerprint) return false;
  try {
    const rows = await db.execute<{ fp: string }>(sql`
      SELECT device_fingerprint AS fp
        FROM device_verified_sessions
       WHERE device_fingerprint = ${fingerprint}
         AND expires_at > NOW()
       LIMIT 1
    `);
    return ((rows.rows ?? rows) as { fp: string }[]).length > 0;
  } catch {
    // Tabela não existe ainda (task #79 pendente). Fail-safe = não verificado.
    return false;
  }
}

// ─── Bootstrap da tabela ─────────────────────────────────────────────────────

// Fail-open: se a tabela ainda não existir, não bloqueia o funil público.
// A tabela nasce no schema Drizzle (device_offer_limits) e é criada no boot.
// Esta função é no-op após a primeira chamada bem-sucedida por processo.
let _tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (!_tableReady) {
    _tableReady = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS device_offer_limits (
          id SERIAL PRIMARY KEY,
          device_fingerprint TEXT NOT NULL,
          dia_brt DATE NOT NULL,
          offer_count INTEGER NOT NULL DEFAULT 0,
          first_offer_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_offer_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (device_fingerprint, dia_brt)
        )
      `)
      .then(() => undefined)
      .catch((err: unknown) => {
        _tableReady = null;
        throw err;
      });
  }
  return _tableReady;
}

// ─── Limpeza de linhas antigas ────────────────────────────────────────────────

/**
 * Apaga linhas de device_offer_limits com dia_brt anterior a 2 dias atrás
 * no calendário BRT (America/Sao_Paulo).
 *
 * ⚠️  O cutoff usa `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date` em vez de
 * `CURRENT_DATE` porque `dia_brt` é gravado com `brtISODate()` (fuso BRT).
 * `CURRENT_DATE` resolveria no fuso da sessão PostgreSQL (normalmente UTC), o que
 * avançaria o corte em 1 dia BRT nas noites entre 21h BRT e meia-noite UTC e
 * poderia apagar linhas ainda dentro do período de 2 dias protegido.
 *
 * Lança em caso de falha de banco para que boot e cron registrem o erro
 * corretamente em vez de reportar "0 linhas removidas" silenciosamente.
 */
export async function purgeOldDeviceOfferLimits(): Promise<number> {
  await ensureTable();
  const result = await db.execute<{ dummy: number }>(sql`
    DELETE FROM device_offer_limits
     WHERE dia_brt < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 2
    RETURNING 1 AS dummy
  `);
  return (result.rows ?? (result as unknown as unknown[])).length;
}

// ─── checkDeviceThrottle ──────────────────────────────────────────────────────

/**
 * Verifica e incrementa o contador de ofertas para um dispositivo.
 *
 * @param fingerprint - hash derivado server-side via deriveFingerprint(req).
 *                      Vazio/null → fail-open (sem fingerprint, sem limite).
 * @param verified    - resultado de isDeviceVerified(fingerprint) — server-side.
 *                      NUNCA derivar do cliente (query param / header não assinado).
 * @returns DeviceThrottleResult — nunca lança; em falha de DB retorna allow-all.
 */
export async function checkDeviceThrottle(
  fingerprint: string | null | undefined,
  verified: boolean,
): Promise<DeviceThrottleResult> {
  // Fingerprint ausente: §6.2 — "IP só vale combinado com outro sinal estável".
  // Sem ambos os sinais não é possível rastrear o dispositivo → fail-open.
  if (!fingerprint || fingerprint.trim() === "") {
    return { allowed: true, remaining: LIMIT_THROTTLE, throttled: false, requiresVerification: false };
  }

  // Dispositivo com identidade verificada pelo servidor → nenhum limite (§6.2 regra 5).
  if (verified) {
    return { allowed: true, remaining: LIMIT_THROTTLE, throttled: false, requiresVerification: false };
  }

  try {
    await ensureTable();

    const diaBrt = brtISODate(); // "YYYY-MM-DD" no fuso de Brasília

    // Incremento atômico: INSERT na primeira chamada do dia, UPDATE nas seguintes.
    // O UNIQUE (device_fingerprint, dia_brt) garante atomicidade sem race condition.
    const rows = await db.execute<{ offer_count: number }>(sql`
      INSERT INTO device_offer_limits (device_fingerprint, dia_brt, offer_count, first_offer_at, last_offer_at)
      VALUES (${fingerprint}, ${diaBrt}::date, 1, NOW(), NOW())
      ON CONFLICT (device_fingerprint, dia_brt)
      DO UPDATE SET
        offer_count = device_offer_limits.offer_count + 1,
        last_offer_at = NOW()
      RETURNING offer_count
    `);

    const count: number = Number((rows.rows ?? rows)[0]?.offer_count ?? 1);

    // Teto rígido: >= 50 = throttled (antiautomação). Não grava penalidade.
    if (count >= LIMIT_THROTTLE) {
      return {
        allowed: false,
        remaining: 0,
        throttled: true,
        requiresVerification: false,
        message: "Limite diário de consultas atingido. Tente novamente amanhã.",
      };
    }

    // Fricção crescente: >= 6 = pede verificação de identidade pelo canal.
    if (count >= LIMIT_VERIFICATION) {
      return {
        allowed: true,
        remaining: LIMIT_THROTTLE - count,
        throttled: false,
        requiresVerification: true,
        message: "Para seguir com a reserva, confirme seu contato — enviamos um código para o seu WhatsApp.",
      };
    }

    return {
      allowed: true,
      remaining: LIMIT_THROTTLE - count,
      throttled: false,
      requiresVerification: false,
    };
  } catch (err) {
    // Falha de banco: fail-open (não bloqueia o funil público por falha interna).
    console.error("[concierge-device-throttle] Falha ao verificar limite:", err);
    return { allowed: true, remaining: LIMIT_THROTTLE, throttled: false, requiresVerification: false };
  }
}
