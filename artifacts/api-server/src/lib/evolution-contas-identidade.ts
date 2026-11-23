import crypto from "node:crypto";
import { pool } from "@workspace/db";
import {
  chamarComChave,
  contatoDoJid,
  normalizarEvento,
  normalizarBaseUrl,
  textoDaMensagem,
  tokenConfere,
  validarNomeInstancia,
  type EstadoConexao,
  type RespostaProvedor,
} from "./evolution.js";
import { getSecret, getSecretStatus, setSecret } from "./secure-settings.js";

export const EVOLUTION_ACCOUNT_KEYS = ["pessoal_proprietario", "terceira"] as const;
export type EvolutionAccountKey = (typeof EVOLUTION_ACCOUNT_KEYS)[number];

export interface EvolutionAccountIdentity {
  accountId: string;
  accountKey: EvolutionAccountKey;
  ownerProfessionalId: number;
  baseUrl: string | null;
  instanceName: string | null;
  connectionEnabled: boolean;
  captureEnabled: boolean;
  learningEnabled: boolean;
  repliesEnabled: boolean;
  updatedAt: Date | null;
}

export interface LegacyEvolutionMigrationDiagnostic {
  legacyAccountTablePresent: boolean;
  legacyMessageTablePresent: boolean;
  legacyAccountRows: number;
  legacyMessageRows: number;
  ambiguousOwnerAccountGroups: number;
  automaticBackfill: false;
  status: "ready" | "review_required";
}

export function isEvolutionAccountKey(value: unknown): value is EvolutionAccountKey {
  return typeof value === "string" && EVOLUTION_ACCOUNT_KEYS.includes(value as EvolutionAccountKey);
}

export function evolutionAccountApiKeyName(accountId: string): string {
  return `evolution.account.${accountId}.apiKey`;
}

export function evolutionAccountWebhookKeyName(accountId: string): string {
  return `evolution.account.${accountId}.webhookToken`;
}

function mapIdentity(row: Record<string, unknown>): EvolutionAccountIdentity {
  return {
    accountId: String(row.account_id),
    accountKey: row.account_key as EvolutionAccountKey,
    ownerProfessionalId: Number(row.owner_professional_id),
    baseUrl: typeof row.base_url === "string" ? row.base_url : null,
    instanceName: typeof row.instance_name === "string" ? row.instance_name : null,
    connectionEnabled: row.connection_enabled === true,
    captureEnabled: row.capture_enabled === true,
    learningEnabled: row.learning_enabled === true,
    repliesEnabled: row.replies_enabled === true,
    updatedAt: row.atualizado_em instanceof Date ? row.atualizado_em : null,
  };
}

const IDENTITY_COLUMNS = `
  a.account_id, a.account_key, a.owner_professional_id, a.base_url, a.instance_name,
  a.connection_enabled, a.capture_enabled, a.learning_enabled, a.replies_enabled, a.atualizado_em
`;

export async function diagnoseLegacyEvolutionAccounts(): Promise<LegacyEvolutionMigrationDiagnostic> {
  const present = await pool.query(`
    SELECT to_regclass('public.evolution_contas') AS accounts,
           to_regclass('public.evolution_conta_mensagens') AS messages
  `);
  const tables = present.rows[0] as { accounts?: string | null; messages?: string | null } | undefined;
  const legacyAccountTablePresent = Boolean(tables?.accounts);
  const legacyMessageTablePresent = Boolean(tables?.messages);
  let legacyAccountRows = 0;
  let legacyMessageRows = 0;
  let ambiguousOwnerAccountGroups = 0;

  if (legacyAccountTablePresent) {
    const result = await pool.query("SELECT COUNT(*)::int AS count FROM evolution_contas");
    // The aggregate above is intentionally limited to counts; it never reads
    // credentials, message bodies, or contact details.
    const row = result.rows[0] as { count?: number } | undefined;
    legacyAccountRows = Number(row?.count ?? 0);
    const ambiguous = await pool.query(`
      SELECT COUNT(*)::int AS count
        FROM (
          SELECT owner_professional_id, account_key
            FROM evolution_contas
           GROUP BY owner_professional_id, account_key
          HAVING COUNT(DISTINCT empresa_id) > 1
        ) grouped
    `);
    ambiguousOwnerAccountGroups = Number(
      (ambiguous.rows[0] as { count?: number } | undefined)?.count ?? 0,
    );
  }
  if (legacyMessageTablePresent) {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS count FROM evolution_conta_mensagens",
    );
    legacyMessageRows = Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
  }

  return {
    legacyAccountTablePresent,
    legacyMessageTablePresent,
    legacyAccountRows,
    legacyMessageRows,
    ambiguousOwnerAccountGroups,
    automaticBackfill: false,
    status: legacyAccountRows > 0 ? "review_required" : "ready",
  };
}

async function legacySlotExists(
  empresaId: number,
  accountKey: EvolutionAccountKey,
  ownerProfessionalId: number,
): Promise<boolean> {
  const present = await pool.query("SELECT to_regclass('public.evolution_contas') AS accounts");
  const table = (present.rows[0] as { accounts?: string | null } | undefined)?.accounts;
  if (!table) return false;
  const result = await pool.query(
    `SELECT 1 FROM evolution_contas
      WHERE empresa_id = $1 AND account_key = $2 AND owner_professional_id = $3
      LIMIT 1`,
    [empresaId, accountKey, ownerProfessionalId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listEvolutionAccountsForClinic(
  empresaId: number,
  ownerProfessionalId: number,
): Promise<EvolutionAccountIdentity[]> {
  const result = await pool.query(
    `SELECT ${IDENTITY_COLUMNS}
       FROM evolution_conta_clinicas c
       JOIN evolution_conta_identidades a
         ON a.account_id = c.account_id AND a.account_key = c.account_key
      WHERE c.empresa_id = $1 AND c.active = TRUE AND a.owner_professional_id = $2
      ORDER BY a.account_key`,
    [empresaId, ownerProfessionalId],
  );
  return result.rows.map((row) => mapIdentity(row as Record<string, unknown>));
}

export async function getEvolutionAccountForClinic(
  empresaId: number,
  accountKey: EvolutionAccountKey,
  ownerProfessionalId: number,
): Promise<EvolutionAccountIdentity | null> {
  const result = await pool.query(
    `SELECT ${IDENTITY_COLUMNS}
       FROM evolution_conta_clinicas c
       JOIN evolution_conta_identidades a
         ON a.account_id = c.account_id AND a.account_key = c.account_key
      WHERE c.empresa_id = $1 AND c.account_key = $2 AND c.active = TRUE
        AND a.owner_professional_id = $3
      LIMIT 1`,
    [empresaId, accountKey, ownerProfessionalId],
  );
  return result.rows[0]
    ? mapIdentity(result.rows[0] as Record<string, unknown>)
    : null;
}

export async function linkEvolutionAccountToClinic(input: {
  empresaId: number;
  accountKey: EvolutionAccountKey;
  ownerProfessionalId: number;
  authorizedBy: number;
}): Promise<{ account: EvolutionAccountIdentity; linked: boolean }> {
  if (await legacySlotExists(input.empresaId, input.accountKey, input.ownerProfessionalId)) {
    throw new Error("legacy_account_requires_review");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO evolution_conta_identidades
         (account_id, account_key, owner_professional_id, atualizado_por)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (owner_professional_id, account_key) DO NOTHING
       RETURNING ${IDENTITY_COLUMNS.replaceAll("a.", "")}`,
      [crypto.randomUUID(), input.accountKey, input.ownerProfessionalId, input.authorizedBy],
    );
    const accountResult = inserted.rowCount === 1
      ? inserted
      : await client.query(
          `SELECT account_id, account_key, owner_professional_id, base_url, instance_name,
                  connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em
             FROM evolution_conta_identidades
            WHERE owner_professional_id = $1 AND account_key = $2
            FOR UPDATE`,
          [input.ownerProfessionalId, input.accountKey],
        );
    const row = accountResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("evolution_account_identity_create_failed");
    const account = mapIdentity(row);
    const linked = await client.query(
      `INSERT INTO evolution_conta_clinicas
         (account_id, account_key, empresa_id, active, autorizado_por, autorizado_em, revogado_por, revogado_em)
       VALUES ($1, $2, $3, TRUE, $4, NOW(), NULL, NULL)
       ON CONFLICT (account_id, empresa_id) DO UPDATE
         SET active = TRUE, autorizado_por = EXCLUDED.autorizado_por,
             autorizado_em = NOW(), revogado_por = NULL, revogado_em = NULL
       RETURNING account_id`,
      [account.accountId, account.accountKey, input.empresaId, input.authorizedBy],
    );
    await client.query("COMMIT");
    return { account, linked: linked.rowCount === 1 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
    if (code === "23505") throw new Error("clinic_account_slot_taken");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeEvolutionAccountClinicLink(input: {
  empresaId: number;
  accountKey: EvolutionAccountKey;
  ownerProfessionalId: number;
  revokedBy: number;
}): Promise<boolean> {
  const result = await pool.query(
    `UPDATE evolution_conta_clinicas c
        SET active = FALSE, revogado_por = $4, revogado_em = NOW()
       FROM evolution_conta_identidades a
      WHERE c.account_id = a.account_id AND c.account_key = a.account_key
        AND c.empresa_id = $1 AND c.account_key = $2 AND c.active = TRUE
        AND a.owner_professional_id = $3
      RETURNING c.account_id`,
    [input.empresaId, input.accountKey, input.ownerProfessionalId, input.revokedBy],
  );
  return result.rowCount === 1;
}

export async function updateEvolutionAccountControls(
  accountId: string,
  controls: Partial<Pick<EvolutionAccountIdentity,
    "connectionEnabled" | "captureEnabled" | "learningEnabled" | "repliesEnabled">>,
  updatedBy: number,
): Promise<EvolutionAccountIdentity | null> {
  const map: Array<[keyof typeof controls, string]> = [
    ["connectionEnabled", "connection_enabled"],
    ["captureEnabled", "capture_enabled"],
    ["learningEnabled", "learning_enabled"],
    ["repliesEnabled", "replies_enabled"],
  ];
  const fields = map.filter(([key]) => controls[key] !== undefined);
  if (!fields.length) return getEvolutionAccountById(accountId);
  const values: unknown[] = [accountId];
  const sets = fields.map(([key, column]) => {
    values.push(controls[key]);
    return `${column} = $${values.length}`;
  });
  values.push(updatedBy);
  sets.push(`atualizado_por = $${values.length}`, "atualizado_em = NOW()");
  const result = await pool.query(
    `UPDATE evolution_conta_identidades
        SET ${sets.join(", ")}
      WHERE account_id = $1
      RETURNING account_id, account_key, owner_professional_id, base_url, instance_name,
                connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em`,
    values,
  );
  return result.rows[0]
    ? mapIdentity(result.rows[0] as Record<string, unknown>)
    : null;
}

export async function getEvolutionAccountById(accountId: string): Promise<EvolutionAccountIdentity | null> {
  const result = await pool.query(
    `SELECT account_id, account_key, owner_professional_id, base_url, instance_name,
            connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em
       FROM evolution_conta_identidades
      WHERE account_id = $1`,
    [accountId],
  );
  return result.rows[0] ? mapIdentity(result.rows[0] as Record<string, unknown>) : null;
}

async function assertInstanceAvailable(
  account: EvolutionAccountIdentity,
  baseUrl: string,
  instanceName: string,
  client: { query: (sql: string, values?: unknown[]) => Promise<any> },
): Promise<void> {
  const reservation = `${baseUrl.toLowerCase()}\n${instanceName}`;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [reservation]);
  const legacy = await client.query(
    `SELECT 1 FROM evolution_instancias
      WHERE lower(base_url) = lower($1) AND instance_name = $2
      LIMIT 1`,
    [baseUrl, instanceName],
  );
  const anotherIdentity = await client.query(
    `SELECT 1 FROM evolution_conta_identidades
      WHERE lower(base_url) = lower($1) AND instance_name = $2 AND account_id <> $3
      LIMIT 1`,
    [baseUrl, instanceName, account.accountId],
  );
  const oldAccountTable = await client.query("SELECT to_regclass('public.evolution_contas') AS accounts");
  const legacyAccountTable = (oldAccountTable.rows[0] as { accounts?: string | null } | undefined)?.accounts;
  let oldAccountConflict = false;
  if (legacyAccountTable) {
    const result = await client.query(
      `SELECT 1 FROM evolution_contas
        WHERE lower(base_url) = lower($1) AND instance_name = $2
        LIMIT 1`,
      [baseUrl, instanceName],
    );
    oldAccountConflict = (result.rowCount ?? 0) > 0;
  }
  if (legacy.rowCount || anotherIdentity.rowCount || oldAccountConflict) {
    throw new Error("instance_already_associated");
  }
}

export async function saveEvolutionAccountConfig(input: {
  account: EvolutionAccountIdentity;
  baseUrl: unknown;
  instanceName: unknown;
  apiKey?: string;
  updatedBy: number;
}): Promise<void> {
  const baseUrl = normalizarBaseUrl(input.baseUrl);
  const instanceName = validarNomeInstancia(input.instanceName);
  if (input.apiKey !== undefined &&
      (typeof input.apiKey !== "string" || input.apiKey.length < 8 ||
       input.apiKey.length > 512 || /\s/.test(input.apiKey))) {
    throw new Error("api_key_invalid");
  }
  const secretKey = evolutionAccountApiKeyName(input.account.accountId);
  if (!input.apiKey && !(await getSecret(secretKey))) throw new Error("api_key_required");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertInstanceAvailable(input.account, baseUrl, instanceName, client);
    await client.query(
      `UPDATE evolution_conta_identidades
          SET base_url = $2, instance_name = $3, atualizado_por = $4, atualizado_em = NOW()
        WHERE account_id = $1`,
      [input.account.accountId, baseUrl, instanceName, input.updatedBy],
    );
    if (input.apiKey) await setSecret(secretKey, input.apiKey, String(input.updatedBy));
    const hookKey = evolutionAccountWebhookKeyName(input.account.accountId);
    if (!(await getSecret(hookKey))) {
      await setSecret(hookKey, crypto.randomBytes(32).toString("hex"), String(input.updatedBy));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof Error && error.message === "instance_already_associated") {
      throw new Error("instance_already_associated");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getEvolutionAccountSecretStatus(accountId: string): Promise<{
  apiKeyDefined: boolean;
  webhookTokenDefined: boolean;
}> {
  const [apiKey, webhook] = await Promise.all([
    getSecretStatus(evolutionAccountApiKeyName(accountId)),
    getSecretStatus(evolutionAccountWebhookKeyName(accountId)),
  ]);
  return { apiKeyDefined: Boolean(apiKey.isSet), webhookTokenDefined: Boolean(webhook.isSet) };
}

async function callAccountProvider(
  account: EvolutionAccountIdentity,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<RespostaProvedor> {
  const key = await getSecret(evolutionAccountApiKeyName(account.accountId));
  return chamarComChave(
    { baseUrl: account.baseUrl ?? "", instanceName: account.instanceName ?? "" },
    key,
    method,
    path,
    body,
  );
}

export async function queryEvolutionAccountConnection(
  account: EvolutionAccountIdentity,
): Promise<{ estado: EstadoConexao; detalhe?: string }> {
  if (!account.connectionEnabled) return { estado: "desconectado", detalhe: "conta_desativada" };
  if (!account.baseUrl || !account.instanceName) return { estado: "nao_configurado" };
  const key = await getSecret(evolutionAccountApiKeyName(account.accountId));
  if (!key) return { estado: "sem_credencial" };
  const result = await chamarComChave(
    { baseUrl: account.baseUrl, instanceName: account.instanceName },
    key,
    "GET",
    `/instance/connectionState/${encodeURIComponent(account.instanceName)}`,
  );
  const state = String(result.json?.instance?.state ?? result.json?.state ?? "").toLowerCase();
  if (result.falha) return { estado: "servidor_inacessivel" };
  if (result.status === 401 || result.status === 403) return { estado: "credenciais_recusadas" };
  if (result.status === 404) return { estado: "instancia_inexistente" };
  if (!result.ok) return { estado: "erro_do_provedor", detalhe: `HTTP ${result.status}` };
  if (state === "open") return { estado: "conectado" };
  if (state === "connecting") return { estado: "conectando" };
  if (state === "close" || state === "closed") return { estado: "desconectado" };
  return { estado: "erro_do_provedor", detalhe: "resposta_nao_reconhecida" };
}

export async function getEvolutionAccountQr(
  account: EvolutionAccountIdentity,
): Promise<{ status: number; json: unknown }> {
  if (!account.connectionEnabled) return { status: 409, json: { error: "conta_desativada" } };
  if (!account.baseUrl || !account.instanceName) return { status: 409, json: { error: "nao_configurado" } };
  const result = await callAccountProvider(
    account,
    "GET",
    `/instance/connect/${encodeURIComponent(account.instanceName)}`,
  );
  return { status: result.status || 502, json: result.json ?? { error: result.falha ?? "sem_resposta" } };
}

export async function registerEvolutionAccountWebhook(
  account: EvolutionAccountIdentity,
  webhookUrl: string,
): Promise<{ status: number; json: unknown }> {
  if (!account.connectionEnabled) return { status: 409, json: { error: "conta_desativada" } };
  if (!account.baseUrl || !account.instanceName) return { status: 409, json: { error: "nao_configurado" } };
  const result = await callAccountProvider(
    account,
    "POST",
    `/webhook/set/${encodeURIComponent(account.instanceName)}`,
    { enabled: true, url: webhookUrl, webhookByEvents: false, events: ["MESSAGES_UPSERT"] },
  );
  return { status: result.status || 502, json: result.json ?? { error: result.falha ?? "sem_resposta" } };
}

export function evolutionAccountWebhookUrl(baseApiUrl: string, accountId: string, token: string): string {
  return `${baseApiUrl.replace(/\/+$/, "")}/api/evolution/account-webhook/${accountId}?token=${encodeURIComponent(token)}`;
}

export type EvolutionAccountWebhookResult =
  | { status: 403; reason: "unauthorized" | "instance_mismatch" | "unlinked_account"; stored: 0 }
  | { status: 200; reason: "ignored" | "captured"; stored: number };

export async function processEvolutionAccountWebhook(input: {
  accountId: string;
  token: string;
  payload: unknown;
}): Promise<EvolutionAccountWebhookResult> {
  const account = await getEvolutionAccountById(input.accountId);
  const expectedToken = await getSecret(evolutionAccountWebhookKeyName(input.accountId));
  if (!account || !expectedToken || !tokenConfere(input.token, expectedToken)) {
    return { status: 403, reason: "unauthorized", stored: 0 };
  }
  if (!account.connectionEnabled) return { status: 200, reason: "ignored", stored: 0 };
  if (!account.baseUrl || !account.instanceName) return { status: 200, reason: "ignored", stored: 0 };
  const linked = await pool.query(
    `SELECT 1 FROM evolution_conta_clinicas
      WHERE account_id = $1 AND account_key = $2 AND active = TRUE
      LIMIT 1`,
    [account.accountId, account.accountKey],
  );
  if (!linked.rowCount) return { status: 403, reason: "unlinked_account", stored: 0 };

  const payload = input.payload as Record<string, unknown> | null;
  if (!payload || payload.instance !== account.instanceName) {
    return { status: 403, reason: "instance_mismatch", stored: 0 };
  }
  if (normalizarEvento(payload.event) !== "messages.upsert") {
    return { status: 200, reason: "ignored", stored: 0 };
  }
  if (!account.captureEnabled) return { status: 200, reason: "ignored", stored: 0 };

  const data = payload.data as Record<string, unknown> | unknown[] | undefined;
  const messages = Array.isArray(data) ? data : [data];
  let stored = 0;
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const key = item.key as Record<string, unknown> | undefined;
    const providerId = typeof key?.id === "string" ? key.id.trim() : "";
    const remoteJid = typeof key?.remoteJid === "string" ? key.remoteJid : "";
    const contact = contatoDoJid(remoteJid);
    const text = textoDaMensagem(item.message);
    if (!providerId || !contact || contact.grupo || !text) continue;
    const fromMe = key?.fromMe === true;
    const result = await pool.query(
      `INSERT INTO evolution_conta_mensagens_identidade
         (account_id, base_url, instance_name, provider_id, direction, contact, body, from_me, provenance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'nao_classificada')
       ON CONFLICT (account_id, base_url, instance_name, provider_id) DO NOTHING
       RETURNING id`,
      [
        account.accountId,
        account.baseUrl,
        account.instanceName,
        providerId,
        fromMe ? "saida" : "entrada",
        contact.contato,
        text,
        fromMe,
      ],
    );
    stored += result.rowCount ?? 0;
  }
  return { status: 200, reason: stored ? "captured" : "ignored", stored };
}
