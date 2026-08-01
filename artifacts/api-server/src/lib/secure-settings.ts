import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, secureSettingsTable, appSettingsTable } from "@workspace/db";
import { logger } from "./logger.js";

// ===========================================================================
// COFRE DE SEGREDOS (secure_settings) — cifrado em repouso com AES-256-GCM.
// Regras (spec financeiro-controle-total, seção 1):
//  - O frontend NUNCA recebe o valor em claro: só { isSet, masked, updatedAt }.
//  - Em PRODUÇÃO, APP_ENCRYPTION_KEY é OBRIGATÓRIA. Sem ela, gravar/ler falha.
//  - Em DESENVOLVIMENTO, cai para uma chave derivada de SESSION_SECRET (com
//    warning explícito). Nunca acopla autenticação ao cofre em produção.
//  - Resolver de leitura: cofre cifrado tem prioridade; se vazio, cai no env
//    (compatibilidade — ASAAS_API_KEY etc. continuam valendo).
// ===========================================================================

const KEY_VERSION = 1;
// Salt fixo: a entropia vem do segredo-mestre; o salt só separa o domínio.
const KEY_SALT = "padcon-conect-secure-settings-v1";

const isProd = process.env.NODE_ENV === "production";

let warnedDevFallback = false;

// Deriva a chave simétrica de 32 bytes a partir do segredo-mestre.
function deriveKey(): Buffer {
  const master = process.env.APP_ENCRYPTION_KEY;
  if (master && master.length > 0) {
    return crypto.scryptSync(master, KEY_SALT, 32);
  }
  if (isProd) {
    throw new Error(
      "APP_ENCRYPTION_KEY ausente em produção: defina-a para usar o cofre de segredos.",
    );
  }
  const devSecret = process.env.SESSION_SECRET;
  if (!devSecret || devSecret.length === 0) {
    throw new Error(
      "Sem APP_ENCRYPTION_KEY nem SESSION_SECRET: impossível derivar chave do cofre.",
    );
  }
  if (!warnedDevFallback) {
    warnedDevFallback = true;
    logger.warn(
      "secure-settings: APP_ENCRYPTION_KEY ausente — usando fallback de DEV derivado de SESSION_SECRET. NÃO usar em produção.",
    );
  }
  return crypto.scryptSync(devSecret, KEY_SALT, 32);
}

// Mapa de compatibilidade: segredo do cofre -> variável de ambiente equivalente.
// Permite que segredos já existentes no env continuem valendo até o CEO salvar
// pela tela. Nunca o contrário (env nunca sobrescreve o cofre).
const ENV_FALLBACK: Record<string, string> = {
  "elevenlabs.apiKey": "ELEVENLABS_API_KEY",
  "heygen.apiKey": "HEYGEN_API_KEY",
  "asaas.apiKey": "ASAAS_API_KEY",
  "asaas.webhookToken": "ASAAS_WEBHOOK_TOKEN",
  "certificate.password": "CERT_PASSWORD",
  "zapsign.token": "ZAPSIGN_TOKEN",
  "stripe.secretKey": "STRIPE_SECRET_KEY",
  "twilio.accountSid": "TWILIO_ACCOUNT_SID",
  "twilio.authToken": "TWILIO_AUTH_TOKEN",
  "twilio.whatsappFrom": "TWILIO_WHATSAPP_FROM",
  "gupshup.apiKey": "GUPSHUP_API_KEY",
  "gupshup.appName": "GUPSHUP_APP_NAME",
  "gupshup.sourceNumber": "GUPSHUP_SOURCE_NUMBER",
};

function encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decrypt(ciphertext: string, iv: string, authTag: string): string {
  const key = deriveKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// Grava (ou substitui) um segredo cifrado. `updatedBy` = nome/id do colaborador.
export async function setSecret(key: string, plaintext: string, updatedBy?: string): Promise<void> {
  const { ciphertext, iv, authTag } = encrypt(plaintext);
  await db
    .insert(secureSettingsTable)
    .values({ key, ciphertext, iv, authTag, keyVersion: KEY_VERSION, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: secureSettingsTable.key,
      set: { ciphertext, iv, authTag, keyVersion: KEY_VERSION, updatedBy: updatedBy ?? null },
    });
}

// Lê o valor em claro (apenas em memória do servidor). Cofre tem prioridade;
// se vazio/indisponível, cai no env. Retorna null se nada existir.
export async function getSecret(key: string): Promise<string | null> {
  const [row] = await db.select().from(secureSettingsTable).where(eq(secureSettingsTable.key, key)).limit(1);
  if (row) {
    try {
      return decrypt(row.ciphertext, row.iv, row.authTag);
    } catch (e) {
      // Falha de decifragem (ex.: chave-mestre trocada) NÃO derruba o app:
      // loga sem segredo e cai no fallback de env.
      logger.error({ err: e instanceof Error ? e.message : String(e), key }, "secure-settings: falha ao decifrar segredo");
    }
  }
  const envName = ENV_FALLBACK[key];
  if (envName && process.env[envName]) return process.env[envName] as string;
  return null;
}

// Versão síncrona da máscara: mostra os últimos 6 caracteres (o dono reconhece
// o próprio valor num relance; o restante continua oculto). Valor muito curto
// (<= 6) fica totalmente mascarado para não vazar quase tudo.
function mask(value: string): string {
  if (value.length <= 6) return "••••";
  return "••••" + value.slice(-6);
}

export interface SecretStatus {
  isSet: boolean;
  masked: string | null;
  source: "vault" | "env" | null;
  updatedAt: string | null;
}

// Status seguro para o frontend — NUNCA inclui o valor em claro.
export async function getSecretStatus(key: string): Promise<SecretStatus> {
  const [row] = await db.select().from(secureSettingsTable).where(eq(secureSettingsTable.key, key)).limit(1);
  if (row) {
    let masked: string | null = null;
    try {
      masked = mask(decrypt(row.ciphertext, row.iv, row.authTag));
    } catch {
      masked = "••••";
    }
    return { isSet: true, masked, source: "vault", updatedAt: row.updatedAt.toISOString() };
  }
  const envName = ENV_FALLBACK[key];
  if (envName && process.env[envName]) {
    return { isSet: true, masked: mask(process.env[envName] as string), source: "env", updatedAt: null };
  }
  return { isSet: false, masked: null, source: null, updatedAt: null };
}

export async function deleteSecret(key: string): Promise<void> {
  await db.delete(secureSettingsTable).where(eq(secureSettingsTable.key, key));
}

// ===========================================================================
// CONFIG NÃO-SENSÍVEL (app_settings) — chave/valor em texto (JSON serializado).
// ===========================================================================

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

export async function getJsonSetting<T>(key: string): Promise<T | null> {
  const raw = await getSetting(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value } });
}

export async function setJsonSetting(key: string, value: unknown): Promise<void> {
  await setSetting(key, JSON.stringify(value));
}
