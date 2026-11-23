import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { bancoAtendimentoIsolado } from "./helpers/pg-atendimento-isolado.js";

const state = vi.hoisted(() => ({
  pool: null as any,
  db: null as any,
  secrets: {} as Record<string, string>,
  providerFetch: vi.fn(),
  providerConnectionState: "open",
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    pool: {
      query: (...args: unknown[]) => state.pool.query(...args),
      connect: (...args: unknown[]) => state.pool.connect(...args),
    },
    db: { select: (...args: unknown[]) => state.db.select(...args) },
  };
});

vi.mock("../lib/secure-settings.js", () => ({
  getSecret: vi.fn(async (key: string) => state.secrets[key] ?? null),
  setSecret: vi.fn(async (key: string, value: string) => { state.secrets[key] = value; }),
  getSecretStatus: vi.fn(async (key: string) => ({ isSet: Boolean(state.secrets[key]) })),
}));
vi.mock("../lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn(async () => [{ address: "203.0.113.20" }]) },
}));

import accountsRouter, {
  evolutionAccountsIdentityWebhookRouter,
} from "../routes/evolution-accounts-identidade.js";
import evolutionRouter, { evolutionWebhookRouter } from "../routes/evolution.js";
import evolutionAccountsLegacyRouter, {
  evolutionAccountsWebhookRouter,
} from "../routes/evolution-accounts.js";
import { createCollaboratorToken } from "../lib/collaborator-auth.js";
import { tenantContextMiddleware } from "../middleware/tenantContext.js";
import {
  evolutionAccountWebhookKeyName,
} from "../lib/evolution-contas-identidade.js";

const appFetch = globalThis.fetch.bind(globalThis);
const oldNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
process.env.EVOLUTION_HOMOLOGACAO = "false";
process.env.EVOLUTION_CONTATOS_AUTORIZADOS = "0000000000000";

let database: Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
let server: Server;
let baseUrl = "";

function startServer(): Promise<void> {
  return new Promise((resolveStarted) => {
    const app = express();
    app.use(express.json());
    app.use(tenantContextMiddleware);
    app.use((req, _res, next) => {
      const mismatch = req.header("x-test-context-professional");
      if (mismatch) req.tenantContext.professionalId = Number(mismatch);
      next();
    });
    app.use("/api", evolutionWebhookRouter);
    app.use("/api", evolutionRouter);
    app.use("/api", evolutionAccountsIdentityWebhookRouter);
    app.use("/api", evolutionAccountsWebhookRouter);
    app.use("/api", accountsRouter);
    app.use("/api", evolutionAccountsLegacyRouter);
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      resolveStarted();
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolveStopped) => server.close(() => resolveStopped()));
}

async function request(
  method: string,
  path: string,
  options: {
    company?: number;
    professional?: number;
    contextProfessional?: number;
    owner?: boolean;
    authenticated?: boolean;
    role?: string;
    body?: unknown;
  } = {},
): Promise<Response> {
  const headers = new Headers();
  const professional = options.professional ?? 500;
  if (options.authenticated !== false) {
    headers.set("authorization", `Bearer ${createCollaboratorToken({
      professionalId: professional,
      role: options.role ?? "platform_owner",
      credentialVersion: 0,
    })}`);
  }
  headers.set("x-empresa-id", String(options.company ?? 5));
  if (options.contextProfessional !== undefined) {
    headers.set("x-test-context-professional", String(options.contextProfessional));
  }
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body) headers.set("content-type", "application/json");
  return appFetch(`${baseUrl}${path}`, { method, headers, body });
}

async function newAccount(
  accountKey: "pessoal_proprietario" | "terceira",
  company = 5,
): Promise<Response> {
  return request("POST", `/evolution/accounts/${accountKey}`, { company });
}

async function configureAccount(accountKey: "pessoal_proprietario" | "terceira", instanceName: string, company = 5) {
  return request("PUT", `/evolution/accounts/${accountKey}/config`, {
    company,
    body: {
      baseUrl: `https://${instanceName}.example.test`,
      instanceName,
      apiKey: `synthetic-api-key-${instanceName}`,
    },
  });
}

const migrationSql = readFileSync(
  resolve(process.cwd(), "../../scripts/migrations/20261123_evolution_contas_identidade_clinicas.sql"),
  "utf8",
);
const rollbackSql = readFileSync(
  resolve(process.cwd(), "../../scripts/migrations/20261123_evolution_contas_identidade_clinicas.down.sql"),
  "utf8",
);

beforeAll(async () => {
  database = await bancoAtendimentoIsolado();
  state.pool = database.pool;
  state.db = database.db;
  await database.pool.query(`
    CREATE TABLE professionals (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'admin',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      empresa_id INTEGER,
      is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE,
      credential_version INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE empresas (
      id INTEGER PRIMARY KEY,
      ativa BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'ATIVO'
    );
    CREATE TABLE locations (id INTEGER PRIMARY KEY, empresa_id INTEGER, active TEXT NOT NULL DEFAULT 'true');
    CREATE TABLE location_professionals (
      id SERIAL PRIMARY KEY, location_id INTEGER NOT NULL, professional_id INTEGER NOT NULL
    );
    CREATE TABLE professional_empresas (
      id SERIAL PRIMARY KEY,
      professional_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE evolution_instancias (
      empresa_id INTEGER PRIMARY KEY,
      base_url TEXT NOT NULL,
      instance_name TEXT NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_por TEXT
    );
    CREATE TABLE evolution_mensagens (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      instancia TEXT NOT NULL,
      direcao TEXT NOT NULL,
      contato TEXT NOT NULL,
      corpo TEXT NOT NULL,
      provider_id TEXT,
      status TEXT NOT NULL,
      erro TEXT,
      contexto TEXT,
      enviado_por INTEGER,
      reissue_request_id BIGINT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO professionals (id, name, role, category, empresa_id, is_platform_owner)
      VALUES (500, 'Synthetic Owner', 'platform_owner', 'admin', 5, TRUE),
             (600, 'Synthetic Staff', 'admin', 'admin', 5, FALSE);
    INSERT INTO empresas (id) VALUES (5), (6);
    INSERT INTO evolution_instancias (empresa_id, base_url, instance_name)
      VALUES (5, 'https://business.example.test', 'business-live');
    INSERT INTO evolution_mensagens
      (empresa_id, instancia, direcao, contato, corpo, provider_id, status, contexto)
      VALUES (5, 'business-live', 'entrada', '0000000000000', 'legacy synthetic text', 'business-event-before', 'recebida', 'inbound');
  `);
  await database.pool.query(migrationSql);
  await startServer();
}, 60000);

afterAll(async () => {
  await stopServer();
  await database?.fechar();
  if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = oldNodeEnv;
  delete process.env.EVOLUTION_HOMOLOGACAO;
  delete process.env.EVOLUTION_CONTATOS_AUTORIZADOS;
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await database.pool.query("DELETE FROM evolution_conta_mensagens_identidade");
  await database.pool.query("DELETE FROM evolution_conta_clinicas");
  await database.pool.query("DELETE FROM evolution_conta_identidades");
  state.secrets = {
    "evolution.apiKey.5": "synthetic-legacy-business-api-key",
    "evolution.webhookToken.5": "synthetic-legacy-webhook-token",
  };
  state.providerFetch.mockReset();
  state.providerConnectionState = "open";
  vi.stubGlobal("fetch", state.providerFetch);
});

describe("contas Evolution por identidade e vínculo de clínica", () => {
  it("aplica a migração aditiva sem alterar configuração ou mensagens empresariais", async () => {
    const before = await database.pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM evolution_instancias) AS configs,
        (SELECT COUNT(*)::int FROM evolution_mensagens) AS mensagens
    `);
    await database.pool.query(migrationSql);
    const after = await database.pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM evolution_instancias) AS configs,
        (SELECT COUNT(*)::int FROM evolution_mensagens) AS mensagens
    `);
    expect(after.rows).toEqual(before.rows);
    expect(before.rows[0]).toEqual({ configs: 1, mensagens: 1 });
    expect(state.secrets["evolution.apiKey.5"]).toBe("synthetic-legacy-business-api-key");
    expect(state.secrets["evolution.webhookToken.5"]).toBe("synthetic-legacy-webhook-token");
  });

  it("exige autenticação real de colaborador e não confunde profissional com titular da sessão", async () => {
    const anonymous = await request("POST", "/evolution/accounts/pessoal_proprietario", {
      authenticated: false,
    });
    const roleDenied = await request("POST", "/evolution/accounts/pessoal_proprietario", {
      professional: 600,
      role: "admin",
      owner: false,
    });
    const mismatchedIdentity = await request("POST", "/evolution/accounts/pessoal_proprietario", {
      professional: 500,
      contextProfessional: 600,
      owner: true,
    });
    expect(anonymous.status).toBe(401);
    expect(roleDenied.status).toBe(404);
    expect(mismatchedIdentity.status).toBe(404);
    const rows = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_conta_identidades");
    expect(rows.rows[0].count).toBe(0);
  });

  it("associa a mesma identidade de conta a duas clínicas sem duplicar a conta", async () => {
    const first = await newAccount("pessoal_proprietario", 5);
    const firstBody = await first.json() as { accountId: string; ownerProfessionalId: number; linked: boolean };
    const second = await newAccount("pessoal_proprietario", 6);
    const secondBody = await second.json() as { accountId: string; ownerProfessionalId: number; linked: boolean };
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(firstBody.accountId).toBe(secondBody.accountId);
    expect(firstBody.ownerProfessionalId).toBe(500);
    expect(firstBody.linked).toBe(true);
    const identities = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_conta_identidades");
    const links = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_conta_clinicas");
    expect(identities.rows[0].count).toBe(1);
    expect(links.rows[0].count).toBe(2);
  });

  it("revoga somente o vínculo selecionado sem apagar a identidade ou o outro vínculo", async () => {
    const first = await newAccount("pessoal_proprietario", 5);
    const firstBody = await first.json() as { accountId: string };
    await newAccount("pessoal_proprietario", 6);
    const revoked = await request("DELETE", "/evolution/accounts/pessoal_proprietario/association", {
      company: 5,
    });
    const clinicFive = await request("GET", "/evolution/accounts/pessoal_proprietario", { company: 5 });
    const clinicSix = await request("GET", "/evolution/accounts/pessoal_proprietario", { company: 6 });
    const rows = await database.pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM evolution_conta_identidades WHERE account_id = $1) AS identities,
        (SELECT COUNT(*)::int FROM evolution_conta_clinicas WHERE account_id = $1 AND active) AS active_links,
        (SELECT COUNT(*)::int FROM evolution_conta_clinicas WHERE account_id = $1 AND NOT active) AS revoked_links
    `, [firstBody.accountId]);
    expect(revoked.status).toBe(200);
    expect(clinicFive.status, await clinicFive.clone().text()).toBe(404);
    expect(clinicSix.status).toBe(200);
    expect(rows.rows[0]).toEqual({ identities: 1, active_links: 1, revoked_links: 1 });
  });

  it("nega leitura cruzada, acesso de outro proprietário e tentativa de escolher a clínica no corpo", async () => {
    await newAccount("pessoal_proprietario", 5);
    const notLinked = await request("GET", "/evolution/accounts/pessoal_proprietario", { company: 6 });
    const otherOwner = await request("GET", "/evolution/accounts/pessoal_proprietario", {
      company: 5,
      professional: 600,
      role: "admin",
      owner: false,
    });
    const forgedCompany = await request("POST", "/evolution/accounts/terceira", {
      company: 5,
      body: { empresaId: 6, ownerProfessionalId: 600, accountId: "00000000-0000-4000-8000-000000000099" },
    });
    expect(notLinked.status, await notLinked.clone().text()).toBe(404);
    expect(otherOwner.status).toBe(404);
    expect(forgedCompany.status).toBe(201);
    const rows = await database.pool.query(`
      SELECT COUNT(*)::int AS count
        FROM evolution_conta_clinicas
       WHERE empresa_id = 6
    `);
    expect(rows.rows[0].count).toBe(0);
  });

  it("grava controles por conta sem alegar conexão antes de consultar o provedor", async () => {
    await newAccount("pessoal_proprietario");
    await newAccount("terceira");
    await configureAccount("pessoal_proprietario", "personal-one");
    await configureAccount("terceira", "third-one");

    const toggles = await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      body: { connectionEnabled: true, captureEnabled: true },
    });
    const initial = await toggles.json() as {
      connectionEnabled: boolean;
      captureEnabled: boolean;
      learningEnabled: boolean;
      repliesEnabled: boolean;
      capabilities: { learningExecution: boolean; automaticReplies: boolean };
    };
    expect(toggles.status).toBe(200);
    expect(initial.connectionEnabled).toBe(true);
    expect(initial.captureEnabled).toBe(true);
    expect(initial.learningEnabled).toBe(false);
    expect(initial.repliesEnabled).toBe(false);
    expect(initial.capabilities.learningExecution).toBe(false);
    expect(initial.capabilities.automaticReplies).toBe(false);

    state.providerFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ state: "open" }),
    });
    const failed = await request("GET", "/evolution/accounts/pessoal_proprietario/connection");
    expect(failed.status).toBe(200);
    expect(await failed.json()).toMatchObject({ estado: "erro_do_provedor" });

    state.providerFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ instance: { state: "open" } }),
    });
    const connected = await request("GET", "/evolution/accounts/pessoal_proprietario/connection");
    expect(await connected.json()).toMatchObject({ estado: "conectado" });
    const third = await request("GET", "/evolution/accounts/terceira");
    expect(await third.json()).toMatchObject({ connectionEnabled: false, captureEnabled: false });
  });

  it("recusa instância repetida e reverte identidade quando o vínculo da clínica conflita", async () => {
    await database.pool.query(`
      INSERT INTO evolution_conta_identidades
        (account_id, account_key, owner_professional_id)
      VALUES ('00000000-0000-4000-8000-000000000099', 'terceira', 600);
      INSERT INTO evolution_conta_clinicas
        (account_id, account_key, empresa_id, autorizado_por)
      VALUES ('00000000-0000-4000-8000-000000000099', 'terceira', 5, 600);
    `);
    const failedAssociation = await request("POST", "/evolution/accounts/terceira");
    expect(failedAssociation.status).toBe(409);
    let count = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM evolution_conta_identidades WHERE account_key = 'terceira'",
    );
    expect(count.rows[0].count).toBe(1);
    const ownerRow = await database.pool.query(
      "SELECT 1 FROM evolution_conta_identidades WHERE account_key = 'terceira' AND owner_professional_id = 500",
    );
    expect(ownerRow.rowCount).toBe(0);
    await database.pool.query("DELETE FROM evolution_conta_clinicas; DELETE FROM evolution_conta_identidades;");

    await newAccount("pessoal_proprietario");
    await newAccount("terceira");
    const first = await configureAccount("pessoal_proprietario", "shared-instance");
    const conflict = await configureAccount("terceira", "shared-instance");
    expect(first.status).toBe(200);
    expect(conflict.status).toBe(409);
    count = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM evolution_conta_identidades WHERE base_url = 'https://shared-instance.example.test'",
    );
    expect(count.rows[0].count).toBe(1);

    const businessCollision = await configureAccount("terceira", "unused");
    expect(businessCollision.status).toBe(200);
    const collideBusiness = await request("PUT", "/evolution/config", {
      body: {
        baseUrl: "https://unused.example.test",
        instanceName: "unused",
        apiKey: "synthetic-business-api-key",
      },
    });
    expect(collideBusiness.status).toBe(409);
  });

  it("valida token, conta e instância antes de capturar; não atribui autoria a fromMe", async () => {
    const created = await newAccount("pessoal_proprietario");
    const account = await created.json() as { accountId: string };
    await configureAccount("pessoal_proprietario", "personal-hook");
    await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      body: { connectionEnabled: true, captureEnabled: true },
    });
    const token = state.secrets[evolutionAccountWebhookKeyName(account.accountId)]!;
    const makePayload = (instance: string, id: string, fromMe = true) => ({
      event: "messages.upsert",
      instance,
      data: {
        key: { id, remoteJid: "0000000000000@s.whatsapp.net", fromMe },
        message: { conversation: "texto sintético de teste" },
      },
    });
    const wrongToken = await appFetch(
      `${baseUrl}/evolution/account-webhook/${account.accountId}?token=wrong-synthetic-token`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(makePayload("personal-hook", "event-wrong-token")) },
    );
    const unknownInstance = await appFetch(
      `${baseUrl}/evolution/account-webhook/${account.accountId}?token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(makePayload("unknown-instance", "event-unknown-instance")) },
    );
    expect(wrongToken.status).toBe(403);
    expect(unknownInstance.status).toBe(403);

    const validUrl = `${baseUrl}/evolution/account-webhook/${account.accountId}?token=${encodeURIComponent(token)}`;
    const event = makePayload("personal-hook", "event-synthetic-1");
    const valid = await appFetch(validUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    const duplicate = await appFetch(validUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    expect(valid.status).toBe(200);
    expect(duplicate.status).toBe(200);

    const stored = await database.pool.query(`
      SELECT account_id, provider_id, from_me, provenance, body
        FROM evolution_conta_mensagens_identidade
    `);
    expect(stored.rows).toEqual([{
      account_id: account.accountId,
      provider_id: "event-synthetic-1",
      from_me: true,
      provenance: "nao_classificada",
      body: "texto sintético de teste",
    }]);
  });

  it("mantém a rota empresarial e ignora nela evento de instância pessoal", async () => {
    state.secrets["evolution.webhookToken.5"] = "synthetic-legacy-webhook-token";
    await newAccount("pessoal_proprietario");
    await configureAccount("pessoal_proprietario", "personal-route");
    await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      body: { connectionEnabled: true, captureEnabled: true },
    });
    const before = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_mensagens");
    const personalEvent = {
      event: "messages.upsert",
      instance: "personal-route",
      data: {
        key: { id: "personal-to-business-synthetic", remoteJid: "0000000000000@s.whatsapp.net", fromMe: false },
        message: { conversation: "não deve entrar na clínica" },
      },
    };
    const ignored = await appFetch(`${baseUrl}/evolution/webhook/5/synthetic-legacy-webhook-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(personalEvent),
    });
    const after = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_mensagens");
    expect(ignored.status).toBe(200);
    expect(after.rows).toEqual(before.rows);

    const personalCount = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM evolution_conta_mensagens_identidade",
    );
    expect(personalCount.rows[0].count).toBe(0);
  });

  it("preserva vínculos e controles após reiniciar o servidor local de teste", async () => {
    await newAccount("pessoal_proprietario");
    await configureAccount("pessoal_proprietario", "restart-survives");
    await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      body: { connectionEnabled: true, captureEnabled: false },
    });
    const before = await request("GET", "/evolution/accounts/pessoal_proprietario");
    const beforeBody = await before.json() as { accountId: string };
    await stopServer();
    await startServer();
    const after = await request("GET", "/evolution/accounts/pessoal_proprietario");
    const afterBody = await after.json() as {
      accountId: string;
      connectionEnabled: boolean;
      captureEnabled: boolean;
      instanceName: string;
    };
    expect(after.status).toBe(200);
    expect(afterBody).toMatchObject({
      accountId: beforeBody.accountId,
      connectionEnabled: true,
      captureEnabled: false,
      instanceName: "restart-survives",
    });
  });

  it("diagnostica dados antigos sem copiá-los nem alterá-los", async () => {
    await database.pool.query(`
      CREATE TABLE evolution_contas (
        empresa_id INTEGER NOT NULL,
        account_key TEXT NOT NULL,
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
      );
      CREATE TABLE evolution_conta_mensagens (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        account_key TEXT NOT NULL,
        instance_name TEXT NOT NULL DEFAULT 'old-instance',
        provider_id TEXT NOT NULL DEFAULT 'synthetic-old-event',
        direction TEXT NOT NULL DEFAULT 'entrada',
        contact TEXT NOT NULL DEFAULT '0000000000000',
        body TEXT NOT NULL,
        from_me BOOLEAN NOT NULL DEFAULT FALSE,
        provenance TEXT NOT NULL DEFAULT 'nao_classificada',
        status TEXT NOT NULL DEFAULT 'recebida',
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO evolution_contas
        (empresa_id, account_key, owner_professional_id, base_url, instance_name)
      VALUES
        (5, 'pessoal_proprietario', 500, 'https://old-five.example.test', 'old-five'),
        (6, 'pessoal_proprietario', 500, 'https://old-six.example.test', 'old-six');
      INSERT INTO evolution_conta_mensagens (empresa_id, account_key, body)
        VALUES (5, 'pessoal_proprietario', 'synthetic legacy message');
    `);
    const before = await database.pool.query(`
      SELECT COUNT(*)::int AS accounts,
             (SELECT COUNT(*)::int FROM evolution_conta_mensagens) AS messages
        FROM evolution_contas
    `);
    const response = await request("GET", "/evolution/accounts/migration-diagnostics");
    const diagnostic = await response.json() as {
      legacyAccountRows: number;
      legacyMessageRows: number;
      ambiguousOwnerAccountGroups: number;
      automaticBackfill: false;
      status: string;
    };
    const after = await database.pool.query(`
      SELECT COUNT(*)::int AS accounts,
             (SELECT COUNT(*)::int FROM evolution_conta_mensagens) AS messages
        FROM evolution_contas
    `);
    expect(response.status).toBe(200);
    expect(diagnostic).toMatchObject({
      legacyAccountRows: 2,
      legacyMessageRows: 1,
      ambiguousOwnerAccountGroups: 1,
      automaticBackfill: false,
      status: "review_required",
    });
    expect(after.rows).toEqual(before.rows);

    const oldRow = await request("GET", "/evolution/accounts/pessoal_proprietario", { company: 5 });
    expect(oldRow.status).toBe(200);
    expect(await oldRow.json()).toMatchObject({
      accountKey: "pessoal_proprietario",
      baseUrl: "https://old-five.example.test",
      instanceName: "old-five",
    });
    const mergedList = await request("GET", "/evolution/accounts");
    const mergedListBody = await mergedList.json() as { accounts: Array<Record<string, unknown>> };
    expect(mergedListBody.accounts.find((account) => account.accountKey === "pessoal_proprietario"))
      .toMatchObject({ legacy: true, legacyPerClinic: true, instanceName: "old-five" });
  });

  it("bloqueia rollback com dados e permite removê-lo somente quando as tabelas novas estão vazias", async () => {
    await newAccount("terceira");
    const client = await database.pool.connect();
    try {
      await expect(client.query(rollbackSql)).rejects.toThrow(/Rollback blocked/);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    let present = await database.pool.query(
      "SELECT to_regclass('public.evolution_conta_identidades') AS table_name",
    );
    expect(present.rows[0].table_name).toBe("evolution_conta_identidades");

    await database.pool.query(`
      DELETE FROM evolution_conta_mensagens_identidade;
      DELETE FROM evolution_conta_clinicas;
      DELETE FROM evolution_conta_identidades;
    `);
    await database.pool.query(rollbackSql);
    present = await database.pool.query(
      "SELECT to_regclass('public.evolution_conta_identidades') AS table_name",
    );
    expect(present.rows[0].table_name).toBeNull();
  });
});
