import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { getSecret, setSecret } from "./secure-settings.js";
import {
  chamarComChave,
  contatoDoJid,
  normalizarEvento,
  normalizarBaseUrl,
  textoDaMensagem,
  tokenConfere,
  validarNomeInstancia,
  validarInstanciaEvolutionNaoDuplicada,
  type EstadoConexao,
  type RespostaProvedor,
} from "./evolution.js";

export const EVOLUTION_ACCOUNT_KEYS = ["pessoal_proprietario", "terceira"] as const;
export type EvolutionAccountKey = (typeof EVOLUTION_ACCOUNT_KEYS)[number];

export function isEvolutionAccountKey(value: unknown): value is EvolutionAccountKey {
  return typeof value === "string" && EVOLUTION_ACCOUNT_KEYS.includes(value as EvolutionAccountKey);
}

export interface EvolutionAccount {
  empresaId: number;
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

export interface EvolutionAccountControls {
  connectionEnabled?: boolean;
  captureEnabled?: boolean;
  learningEnabled?: boolean;
  repliesEnabled?: boolean;
}

let schemaReady: Promise<void> | null = null;

/**
 * Migração somente aditiva. Não altera evolution_instancias nem mensagens legadas.
 * Tabelas novas começam vazias e só armazenam mensagens após captura explícita.
 */
export function garantirTabelasContasEvolution(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS evolution_contas (
          empresa_id INTEGER NOT NULL,
          account_key TEXT NOT NULL CHECK (account_key IN ('pessoal_proprietario', 'terceira')),
          owner_professional_id INTEGER NOT NULL,
          base_url TEXT,
          instance_name TEXT,
          connection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          capture_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          learning_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          replies_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          atualizado_por INTEGER,
          PRIMARY KEY (empresa_id, account_key)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS evolution_conta_mensagens (
          id BIGSERIAL PRIMARY KEY,
          empresa_id INTEGER NOT NULL,
          account_key TEXT NOT NULL,
          instance_name TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          direction TEXT NOT NULL CHECK (direction IN ('entrada', 'saida')),
          contact TEXT NOT NULL,
          body TEXT NOT NULL,
          from_me BOOLEAN NOT NULL,
          provenance TEXT NOT NULL DEFAULT 'nao_classificada'
            CHECK (provenance = 'nao_classificada'),
          status TEXT NOT NULL DEFAULT 'recebida',
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (empresa_id, account_key, instance_name, provider_id),
          FOREIGN KEY (empresa_id, account_key)
            REFERENCES evolution_contas (empresa_id, account_key)
            ON DELETE RESTRICT
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS evolution_conta_mensagens_busca_idx
        ON evolution_conta_mensagens (empresa_id, account_key, criado_em DESC)
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS evolution_contas_instancia_unica_idx
        ON evolution_contas (base_url, instance_name)
        WHERE base_url IS NOT NULL AND instance_name IS NOT NULL
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export function chaveApiEvolutionConta(empresaId: number, accountKey: EvolutionAccountKey): string {
  return `evolution.apiKey.${empresaId}.${accountKey}`;
}

export function chaveWebhookEvolutionConta(empresaId: number, accountKey: EvolutionAccountKey): string {
  return `evolution.webhookToken.${empresaId}.${accountKey}`;
}

function mapearConta(row: Record<string, unknown>): EvolutionAccount {
  return {
    empresaId: Number(row.empresa_id),
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

export async function buscarContaEvolution(
  empresaId: number,
  accountKey: EvolutionAccountKey,
): Promise<EvolutionAccount | null> {
  await garantirTabelasContasEvolution();
  const result = await pool.query(
    `SELECT empresa_id, account_key, owner_professional_id, base_url, instance_name,
            connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em
       FROM evolution_contas
      WHERE empresa_id = $1 AND account_key = $2`,
    [empresaId, accountKey],
  );
  return result.rows[0] ? mapearConta(result.rows[0] as Record<string, unknown>) : null;
}

export async function listarContasEvolution(empresaId: number): Promise<EvolutionAccount[]> {
  await garantirTabelasContasEvolution();
  const result = await pool.query(
    `SELECT empresa_id, account_key, owner_professional_id, base_url, instance_name,
            connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em
       FROM evolution_contas
      WHERE empresa_id = $1
      ORDER BY account_key`,
    [empresaId],
  );
  return result.rows.map((row) => mapearConta(row as Record<string, unknown>));
}

export async function criarContaEvolution(
  empresaId: number,
  accountKey: EvolutionAccountKey,
  ownerProfessionalId: number,
  atualizadoPor: number,
): Promise<{ account: EvolutionAccount; created: boolean; ownerConflict: boolean }> {
  await garantirTabelasContasEvolution();
  const inserted = await pool.query(
    `INSERT INTO evolution_contas (empresa_id, account_key, owner_professional_id, atualizado_por)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (empresa_id, account_key) DO NOTHING
     RETURNING empresa_id, account_key, owner_professional_id, base_url, instance_name,
               connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em`,
    [empresaId, accountKey, ownerProfessionalId, atualizadoPor],
  );
  const row = inserted.rows[0] ?? (await pool.query(
    `SELECT empresa_id, account_key, owner_professional_id, base_url, instance_name,
            connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em
       FROM evolution_contas
      WHERE empresa_id = $1 AND account_key = $2`,
    [empresaId, accountKey],
  )).rows[0];
  if (!row) throw new Error("evolution_account_create_failed");
  const account = mapearConta(row as Record<string, unknown>);
  return {
    account,
    created: inserted.rowCount === 1,
    ownerConflict: account.ownerProfessionalId !== ownerProfessionalId,
  };
}

export async function atualizarControlesEvolutionConta(
  empresaId: number,
  accountKey: EvolutionAccountKey,
  controls: EvolutionAccountControls,
  atualizadoPor: number,
): Promise<EvolutionAccount | null> {
  await garantirTabelasContasEvolution();
  const columns: Array<[keyof EvolutionAccountControls, string]> = [
    ["connectionEnabled", "connection_enabled"],
    ["captureEnabled", "capture_enabled"],
    ["learningEnabled", "learning_enabled"],
    ["repliesEnabled", "replies_enabled"],
  ];
  const fields = columns.filter(([key]) => controls[key] !== undefined);
  if (!fields.length) return buscarContaEvolution(empresaId, accountKey);
  const values: unknown[] = [empresaId, accountKey];
  const sets = fields.map(([key, column]) => {
    values.push(controls[key]);
    return `${column} = $${values.length}`;
  });
  values.push(atualizadoPor);
  sets.push(`atualizado_por = $${values.length}`, "atualizado_em = NOW()");
  const result = await pool.query(
    `UPDATE evolution_contas
        SET ${sets.join(", ")}
      WHERE empresa_id = $1 AND account_key = $2
      RETURNING empresa_id, account_key, owner_professional_id, base_url, instance_name,
                connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em`,
    values,
  );
  return result.rows[0] ? mapearConta(result.rows[0] as Record<string, unknown>) : null;
}

export async function salvarConfiguracaoEvolutionConta(
  account: EvolutionAccount,
  rawBaseUrl: unknown,
  rawInstanceName: unknown,
  apiKey: string | undefined,
  atualizadoPor: number,
): Promise<void> {
  await garantirTabelasContasEvolution();
  const baseUrl = normalizarBaseUrl(rawBaseUrl);
  const instanceName = validarNomeInstancia(rawInstanceName);
  if (apiKey !== undefined && (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 512)) {
    throw new Error("api_key_invalida");
  }
  await validarInstanciaEvolutionNaoDuplicada(
    baseUrl,
    instanceName,
    account.empresaId,
    account.accountKey,
  );

  const secretKey = chaveApiEvolutionConta(account.empresaId, account.accountKey);
  const oldKey = await getSecret(secretKey);
  if (!apiKey && !oldKey) throw new Error("api_key_obrigatoria");
  if (apiKey) await setSecret(secretKey, apiKey, String(atualizadoPor));

  const currentWebhookToken = await getSecret(chaveWebhookEvolutionConta(account.empresaId, account.accountKey));
  if (!currentWebhookToken) {
    await setSecret(
      chaveWebhookEvolutionConta(account.empresaId, account.accountKey),
      crypto.randomBytes(32).toString("hex"),
      String(atualizadoPor),
    );
  }

  const updated = await pool.query(
    `UPDATE evolution_contas
        SET base_url = $3, instance_name = $4, atualizado_em = NOW(), atualizado_por = $5
      WHERE empresa_id = $1 AND account_key = $2`,
    [account.empresaId, account.accountKey, baseUrl, instanceName, atualizadoPor],
  );
  if (updated.rowCount !== 1) throw new Error("evolution_account_not_found");
}

async function chamarConta(
  account: EvolutionAccount,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<RespostaProvedor> {
  const key = await getSecret(chaveApiEvolutionConta(account.empresaId, account.accountKey));
  return chamarComChave(
    { baseUrl: account.baseUrl ?? "", instanceName: account.instanceName ?? "" },
    key,
    method,
    path,
    body,
  );
}

export async function consultarConexaoEvolutionConta(
  account: EvolutionAccount,
): Promise<{ estado: EstadoConexao; detalhe?: string }> {
  if (!account.connectionEnabled) return { estado: "desconectado", detalhe: "conta_desativada" };
  if (!account.baseUrl || !account.instanceName) return { estado: "nao_configurado" };
  const key = await getSecret(chaveApiEvolutionConta(account.empresaId, account.accountKey));
  if (!key) return { estado: "sem_credencial" };
  const result = await chamarComChave(
    { baseUrl: account.baseUrl, instanceName: account.instanceName },
    key,
    "GET",
    `/instance/connectionState/${encodeURIComponent(account.instanceName)}`,
  );
  const state = String(result.json?.instance?.state ?? result.json?.state ?? "").toLowerCase();
  if (result.falha) return { estado: "servidor_inacessivel", detalhe: result.falha };
  if (result.status === 401 || result.status === 403) return { estado: "credenciais_recusadas", detalhe: `HTTP ${result.status}` };
  if (result.status === 404) return { estado: "instancia_inexistente", detalhe: "HTTP 404" };
  if (!result.ok) return { estado: "erro_do_provedor", detalhe: `HTTP ${result.status}` };
  if (state === "open") return { estado: "conectado" };
  if (state === "connecting") return { estado: "conectando" };
  if (state === "close" || state === "closed") return { estado: "desconectado" };
  return { estado: "erro_do_provedor", detalhe: "resposta_nao_reconhecida" };
}

export async function obterQrEvolutionConta(
  account: EvolutionAccount,
): Promise<{ status: number; json: unknown }> {
  if (!account.connectionEnabled) return { status: 409, json: { error: "conta_desativada" } };
  if (!account.baseUrl || !account.instanceName) return { status: 409, json: { error: "nao_configurado" } };
  const result = await chamarConta(
    account,
    "GET",
    `/instance/connect/${encodeURIComponent(account.instanceName)}`,
  );
  return { status: result.status || 502, json: result.json ?? { error: result.falha ?? "sem_resposta" } };
}

export async function registrarWebhookEvolutionConta(
  account: EvolutionAccount,
  webhookUrl: string,
): Promise<{ status: number; json: unknown }> {
  if (!account.connectionEnabled) return { status: 409, json: { error: "conta_desativada" } };
  if (!account.baseUrl || !account.instanceName) return { status: 409, json: { error: "nao_configurado" } };
  const result = await chamarConta(
    account,
    "POST",
    `/webhook/set/${encodeURIComponent(account.instanceName)}`,
    { enabled: true, url: webhookUrl, webhookByEvents: false, events: ["MESSAGES_UPSERT"] },
  );
  return { status: result.status || 502, json: result.json ?? { error: result.falha ?? "sem_resposta" } };
}

export function urlWebhookEvolutionConta(
  baseApiUrl: string,
  empresaId: number,
  accountKey: EvolutionAccountKey,
  token: string,
): string {
  return `${baseApiUrl.replace(/\/+$/, "")}/api/evolution/account-webhook/${empresaId}/${accountKey}?token=${encodeURIComponent(token)}`;
}

export type ResultadoWebhookConta =
  | { status: 403; reason: "nao_autorizado" }
  | { status: 200; reason: "ignorado" | "capturado"; stored: number };

export async function processarWebhookEvolutionConta(input: {
  empresaId: number;
  accountKey: EvolutionAccountKey;
  token: string;
  payload: unknown;
}): Promise<ResultadoWebhookConta> {
  const account = await buscarContaEvolution(input.empresaId, input.accountKey);
  const expectedToken = await getSecret(chaveWebhookEvolutionConta(input.empresaId, input.accountKey));
  if (!account || !expectedToken || !tokenConfere(input.token, expectedToken)) {
    return { status: 403, reason: "nao_autorizado" };
  }
  if (!account.connectionEnabled) return { status: 200, reason: "ignorado", stored: 0 };

  const payload = input.payload as Record<string, unknown> | null;
  if (!payload || payload.instance !== account.instanceName) {
    return { status: 200, reason: "ignorado", stored: 0 };
  }
  const event = normalizarEvento(payload.event);
  if (event !== "messages.upsert") return { status: 200, reason: "ignorado", stored: 0 };
  if (!account.captureEnabled) return { status: 200, reason: "ignorado", stored: 0 };

  const data = payload.data as Record<string, unknown> | undefined;
  const messages = Array.isArray(data) ? data : [data];
  let stored = 0;
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const key = item.key as Record<string, unknown> | undefined;
    const providerId = typeof key?.id === "string" ? key.id.trim() : "";
    const remoteJid = typeof key?.remoteJid === "string" ? key.remoteJid : "";
    const contact = contatoDoJid(remoteJid);
    const message = item.message;
    const text = textoDaMensagem(message);
    if (!providerId || !contact || contact.grupo || !text) continue;
    const fromMe = key?.fromMe === true;
    const result = await pool.query(
      `INSERT INTO evolution_conta_mensagens
         (empresa_id, account_key, instance_name, provider_id, direction, contact, body, from_me, provenance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'nao_classificada')
       ON CONFLICT (empresa_id, account_key, instance_name, provider_id) DO NOTHING
       RETURNING id`,
      [
        account.empresaId,
        account.accountKey,
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
  return { status: 200, reason: stored ? "capturado" : "ignorado", stored };
}
