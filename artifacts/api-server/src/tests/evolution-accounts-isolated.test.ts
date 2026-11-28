import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { bancoAtendimentoIsolado } from "./helpers/pg-atendimento-isolado.js";

const state = vi.hoisted(() => ({
  pool: null as any,
  secrets: {} as Record<string, string>,
  providerFetch: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    query: (...args: unknown[]) => state.pool.query(...args),
    connect: (...args: unknown[]) => state.pool.connect(...args),
  },
}));
vi.mock("../lib/secure-settings.js", () => ({
  getSecret: vi.fn(async (key: string) => state.secrets[key] ?? null),
  setSecret: vi.fn(async (key: string, value: string) => { state.secrets[key] = value; }),
  getSecretStatus: vi.fn(async (key: string) => ({ isSet: Boolean(state.secrets[key]) })),
}));
vi.mock("../routes/collaborator.js", () => ({
  requireCollaborator: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn(async () => [{ address: "203.0.113.20" }]) },
}));

import accountsRouter, { evolutionAccountsWebhookRouter } from "../routes/evolution-accounts.js";
import {
  chaveApiEvolutionConta,
  chaveWebhookEvolutionConta,
  garantirTabelasContasEvolution,
} from "../lib/evolution-contas.js";
import { salvarConfig } from "../lib/evolution.js";

const actualFetch = globalThis.fetch;
let database: Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
let server: Server;
let baseUrl: string;

function contextoDe(headers: Headers): Record<string, unknown> {
  return {
    authenticated: headers.get("x-authenticated") !== "false",
    empresaId: Number(headers.get("x-company") ?? "5"),
    isPlatformOwner: headers.get("x-owner") === "true",
    perfilPlataforma: headers.get("x-role") ?? "medico",
    professionalId: headers.has("x-professional") ? Number(headers.get("x-professional")) : null,
  };
}

async function request(
  method: string,
  path: string,
  options: { company?: number; owner?: boolean; professional?: number; role?: string; body?: unknown } = {},
) {
  const headers = new Headers();
  headers.set("x-company", String(options.company ?? 5));
  headers.set("x-owner", String(options.owner ?? true));
  headers.set("x-role", options.role ?? "platform_owner");
  headers.set(
    "x-professional",
    String(options.professional ?? ((options.company ?? 5) === 5 ? 500 : (options.company ?? 5) * 100)),
  );
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body) headers.set("content-type", "application/json");
  return actualFetch(`${baseUrl}${path}`, { method, headers, body });
}

beforeAll(async () => {
  database = await bancoAtendimentoIsolado();
  state.pool = database.pool;
  await database.pool.query(`
    CREATE TABLE evolution_instancias (
      empresa_id INTEGER PRIMARY KEY,
      base_url TEXT NOT NULL,
      instance_name TEXT NOT NULL
    )
  `);
  await database.pool.query(
    "INSERT INTO evolution_instancias (empresa_id, base_url, instance_name) VALUES (5, $1, $2)",
    ["https://legacy.example.test", "business-live-config"],
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const contextHeaders = new Headers();
    for (const name of ["x-authenticated", "x-company", "x-owner", "x-role", "x-professional"]) {
      const value = req.header(name);
      if (value !== undefined) contextHeaders.set(name, value);
    }
    (req as any).tenantContext = contextoDe(contextHeaders);
    next();
  });
  app.use("/api", evolutionAccountsWebhookRouter);
  app.use("/api", accountsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}, 60000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await database?.fechar();
});

beforeEach(() => {
  vi.stubGlobal("fetch", state.providerFetch);
  return (async () => {
    await garantirTabelasContasEvolution();
    await database.pool.query("DELETE FROM evolution_conta_mensagens");
    await database.pool.query("DELETE FROM evolution_contas");
  })();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  state.secrets = {
    "evolution.apiKey.5": "legacy-business-secret",
    "evolution.webhookToken.5": "legacy-business-webhook",
  };
  state.providerFetch.mockReset();
});

describe("contas Evolution isoladas por clínica", () => {
  it("aplica esquema aditivo repetidamente sem alterar a configuração empresarial", async () => {
    const before = await database.pool.query(
      "SELECT empresa_id, base_url, instance_name FROM evolution_instancias WHERE empresa_id = 5",
    );
    const first = await request("POST", "/evolution/accounts/pessoal_proprietario");
    const second = await request("POST", "/evolution/accounts/terceira");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const after = await database.pool.query(
      "SELECT empresa_id, base_url, instance_name FROM evolution_instancias WHERE empresa_id = 5",
    );
    expect(after.rows).toEqual(before.rows);
    expect(state.secrets["evolution.apiKey.5"]).toBe("legacy-business-secret");
    expect(state.secrets["evolution.webhookToken.5"]).toBe("legacy-business-webhook");
    const stored = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_contas");
    expect(stored.rows[0].count).toBe(2);
  });

  it("cria slots desligados por padrão e lista apenas contas da clínica da sessão", async () => {
    const response = await request("GET", "/evolution/accounts");
    const data = await response.json() as { accounts: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(data.accounts.map((account) => account.accountKey)).toEqual([
      "empresarial",
      "pessoal_proprietario",
      "terceira",
    ]);
    const personal = data.accounts[1]!;
    expect(personal.connectionEnabled).toBe(false);
    expect(personal.captureEnabled).toBe(false);
    expect(personal.learningEnabled).toBe(false);
    expect(personal.repliesEnabled).toBe(false);
    expect(JSON.stringify(data)).not.toContain("legacy-business-secret");

    await request("POST", "/evolution/accounts/pessoal_proprietario", { company: 6, professional: 600 });
    const otherClinic = await request("GET", "/evolution/accounts", { company: 6, professional: 600 });
    const otherData = await otherClinic.json() as { accounts: Array<Record<string, unknown>> };
    expect(otherData.accounts.filter((account) => account.accountKey === "pessoal_proprietario")).toHaveLength(1);
    expect(otherData.accounts[0]?.configured).toBe(false);
  });

  it("separa segredos, configurações e controles por empresa e conta", async () => {
    await request("POST", "/evolution/accounts/pessoal_proprietario");
    await request("POST", "/evolution/accounts/terceira");
    await request("POST", "/evolution/accounts/pessoal_proprietario", { company: 6, professional: 600 });

    for (const [company, key] of [[5, "pessoal_proprietario"], [5, "terceira"], [6, "pessoal_proprietario"]] as const) {
      const result = await request("PUT", `/evolution/accounts/${key}/config`, {
        company,
        professional: company === 5 ? 500 : 600,
        body: {
          baseUrl: `https://evolution-${company}-${key}.example.test`,
          instanceName: `clinic${company}-${key}`,
          apiKey: `synthetic-key-${company}-${key}`,
        },
      });
      expect(result.status).toBe(200);
    }

    expect(state.secrets[chaveApiEvolutionConta(5, "pessoal_proprietario")]).toBe("synthetic-key-5-pessoal_proprietario");
    expect(state.secrets[chaveApiEvolutionConta(5, "terceira")]).toBe("synthetic-key-5-terceira");
    expect(state.secrets[chaveApiEvolutionConta(6, "pessoal_proprietario")]).toBe("synthetic-key-6-pessoal_proprietario");
    expect(chaveApiEvolutionConta(5, "pessoal_proprietario")).not.toBe(chaveApiEvolutionConta(6, "pessoal_proprietario"));
    expect(chaveApiEvolutionConta(5, "pessoal_proprietario")).not.toBe(chaveApiEvolutionConta(5, "terceira"));

    const update = await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      body: { connectionEnabled: true, captureEnabled: true },
    });
    const separateControls = await request("PATCH", "/evolution/accounts/terceira/controls", {
      body: { learningEnabled: true, repliesEnabled: true },
    });
    expect(update.status).toBe(200);
    expect(separateControls.status).toBe(200);
    const controlDto = await separateControls.json() as {
      learningEnabled: boolean;
      repliesEnabled: boolean;
      capabilities: { learningExecution: boolean; automaticReplies: boolean };
    };
    expect(controlDto.learningEnabled).toBe(true);
    expect(controlDto.repliesEnabled).toBe(true);
    expect(controlDto.capabilities.learningExecution).toBe(false);
    expect(controlDto.capabilities.automaticReplies).toBe(false);
    const ownerAccount = await database.pool.query(
      "SELECT connection_enabled, capture_enabled, learning_enabled, replies_enabled FROM evolution_contas WHERE empresa_id = 5 AND account_key = 'pessoal_proprietario'",
    );
    const additionalAccount = await database.pool.query(
      "SELECT connection_enabled, capture_enabled, learning_enabled, replies_enabled FROM evolution_contas WHERE empresa_id = 5 AND account_key = 'terceira'",
    );
    expect(ownerAccount.rows[0]).toEqual({
      connection_enabled: true,
      capture_enabled: true,
      learning_enabled: false,
      replies_enabled: false,
    });
    expect(additionalAccount.rows[0]).toEqual({
      connection_enabled: false,
      capture_enabled: false,
      learning_enabled: true,
      replies_enabled: true,
    });
  });

  it("impede associar uma instância empresarial existente ou reutilizar uma instância pessoal no canal empresarial", async () => {
    await request("POST", "/evolution/accounts/pessoal_proprietario");
    const legacyCollision = await request("PUT", "/evolution/accounts/pessoal_proprietario/config", {
      body: {
        baseUrl: "https://legacy.example.test",
        instanceName: "business-live-config",
        apiKey: "synthetic-personal-key",
      },
    });
    expect(legacyCollision.status).toBe(409);
    expect(state.secrets[chaveApiEvolutionConta(5, "pessoal_proprietario")]).toBeUndefined();
    expect(state.secrets["evolution.apiKey.5"]).toBe("legacy-business-secret");

    const personalConfig = await request("PUT", "/evolution/accounts/pessoal_proprietario/config", {
      body: {
        baseUrl: "https://personal-only.example.test",
        instanceName: "personal-only",
        apiKey: "synthetic-personal-key",
      },
    });
    expect(personalConfig.status).toBe(200);

    await expect(
      salvarConfig(
        5,
        "https://personal-only.example.test",
        "personal-only",
        "synthetic-business-rotation",
        "owner-test",
      ),
    ).rejects.toThrow("instancia_ja_associada");
    const legacy = await database.pool.query(
      "SELECT base_url, instance_name FROM evolution_instancias WHERE empresa_id = 5",
    );
    expect(legacy.rows[0]).toEqual({
      base_url: "https://legacy.example.test",
      instance_name: "business-live-config",
    });
    expect(state.secrets["evolution.apiKey.5"]).toBe("legacy-business-secret");
  });

  it("nega acesso pessoal a outro profissional, colaborador e clínica sem revelar a conta", async () => {
    await request("POST", "/evolution/accounts/pessoal_proprietario");
    const otherOwner = await request("GET", "/evolution/accounts/pessoal_proprietario", { professional: 999 });
    const collaborator = await request("GET", "/evolution/accounts/pessoal_proprietario", {
      owner: false,
      professional: 500,
      role: "admin",
    });
    const collaboratorWrite = await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      owner: false,
      professional: 500,
      role: "admin",
      body: { captureEnabled: true },
    });
    const collaboratorConfig = await request("PUT", "/evolution/accounts/pessoal_proprietario/config", {
      owner: false,
      professional: 500,
      role: "admin",
      body: {
        baseUrl: "https://unauthorized.example.test",
        instanceName: "unauthorized",
        apiKey: "synthetic-unauthorized-key",
      },
    });
    const otherClinic = await request("GET", "/evolution/accounts/pessoal_proprietario", {
      company: 6,
      professional: 500,
    });
    expect(otherOwner.status).toBe(404);
    expect(collaborator.status).toBe(404);
    expect(collaboratorWrite.status).toBe(404);
    expect(collaboratorConfig.status).toBe(404);
    expect(otherClinic.status).toBe(404);
    expect(await otherOwner.json()).toEqual({ error: "Conta não encontrada." });
    const row = await database.pool.query(
      "SELECT base_url, instance_name, capture_enabled FROM evolution_contas WHERE empresa_id = 5 AND account_key = 'pessoal_proprietario'",
    );
    expect(row.rows[0]).toEqual({ base_url: null, instance_name: null, capture_enabled: false });
    expect(state.secrets[chaveApiEvolutionConta(5, "pessoal_proprietario")]).toBeUndefined();
  });

  it("recusa tentativas de escolher a empresa pelo corpo e não cria slot inválido", async () => {
    const response = await request("POST", "/evolution/accounts/empresarial", {
      company: 6,
      body: { empresaId: 6 },
    });
    expect(response.status).toBe(404);
    const rows = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_contas");
    expect(rows.rows[0].count).toBe(0);
  });

  it("não consulta nem pareia uma conta antes da ativação explícita", async () => {
    await request("POST", "/evolution/accounts/pessoal_proprietario");
    await request("PUT", "/evolution/accounts/pessoal_proprietario/config", {
      body: {
        baseUrl: "https://personal.example.test",
        instanceName: "personal-test",
        apiKey: "synthetic-personal-key",
      },
    });
    const connection = await request("GET", "/evolution/accounts/pessoal_proprietario/connection");
    const qr = await request("POST", "/evolution/accounts/pessoal_proprietario/qr");
    expect(connection.status).toBe(200);
    expect(await connection.json()).toEqual({ estado: "desconectado", detalhe: "conta_desativada" });
    expect(qr.status).toBe(409);
    expect(await qr.json()).toEqual({ error: "conta_desativada" });
    expect(state.providerFetch).not.toHaveBeenCalled();
  });

  it("captura somente com controle ligado, em tabela própria e sem classificar autoria", async () => {
    await request("POST", "/evolution/accounts/pessoal_proprietario");
    await request("PUT", "/evolution/accounts/pessoal_proprietario/config", {
      body: {
        baseUrl: "https://personal.example.test",
        instanceName: "personal-test",
        apiKey: "synthetic-personal-key",
      },
    });
    await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      body: { connectionEnabled: true },
    });
    state.secrets[chaveWebhookEvolutionConta(5, "pessoal_proprietario")] = "synthetic-webhook-token";
    const synthetic = {
      event: "messages.upsert",
      instance: "personal-test",
      data: {
        key: { id: "synthetic-message-1", remoteJid: "0000000000000@s.whatsapp.net", fromMe: false },
        message: { conversation: "conteúdo sintético sem dados pessoais" },
      },
    };
    const ignored = await actualFetch(
      `${baseUrl}/evolution/account-webhook/5/pessoal_proprietario?token=synthetic-webhook-token`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(synthetic) },
    );
    expect(ignored.status).toBe(200);
    let rows = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_conta_mensagens");
    expect(rows.rows[0].count).toBe(0);

    await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      body: { captureEnabled: true },
    });
    const captured = await actualFetch(
      `${baseUrl}/evolution/account-webhook/5/pessoal_proprietario?token=synthetic-webhook-token`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(synthetic) },
    );
    expect(captured.status).toBe(200);
    const duplicate = await actualFetch(
      `${baseUrl}/evolution/account-webhook/5/pessoal_proprietario?token=synthetic-webhook-token`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(synthetic) },
    );
    expect(duplicate.status).toBe(200);
    rows = await database.pool.query(
      "SELECT empresa_id, account_key, direction, from_me, provenance, body FROM evolution_conta_mensagens",
    );
    expect(rows.rows).toEqual([{
      empresa_id: 5,
      account_key: "pessoal_proprietario",
      direction: "entrada",
      from_me: false,
      provenance: "nao_classificada",
      body: "conteúdo sintético sem dados pessoais",
    }]);
    expect(state.providerFetch).not.toHaveBeenCalled();
  });

  it("mantém mensagens sintéticas isoladas entre contas e clínicas mesmo com o mesmo identificador externo", async () => {
    const slots = [
      { company: 5, key: "pessoal_proprietario" as const, owner: 500, instance: "clinic5-personal", fromMe: true },
      { company: 5, key: "terceira" as const, owner: 500, instance: "clinic5-third", fromMe: false },
      { company: 6, key: "pessoal_proprietario" as const, owner: 600, instance: "clinic6-personal", fromMe: false },
    ];
    for (const slot of slots) {
      await request("POST", `/evolution/accounts/${slot.key}`, {
        company: slot.company,
        professional: slot.owner,
      });
      await request("PUT", `/evolution/accounts/${slot.key}/config`, {
        company: slot.company,
        professional: slot.owner,
        body: {
          baseUrl: `https://synthetic-${slot.company}-${slot.key}.example.test`,
          instanceName: slot.instance,
          apiKey: `synthetic-${slot.company}-${slot.key}-key`,
        },
      });
      await request("PATCH", `/evolution/accounts/${slot.key}/controls`, {
        company: slot.company,
        professional: slot.owner,
        body: { connectionEnabled: true, captureEnabled: true },
      });
      state.secrets[chaveWebhookEvolutionConta(slot.company, slot.key)] =
        `synthetic-token-${slot.company}-${slot.key}`;
    }

    for (const slot of slots) {
      const event = {
        event: "messages.upsert",
        instance: slot.instance,
        data: {
          key: {
            id: "same-provider-id-synthetic",
            remoteJid: "0000000000002@s.whatsapp.net",
            fromMe: slot.fromMe,
          },
          message: { conversation: `mensagem sintética ${slot.company}-${slot.key}` },
        },
      };
      const response = await actualFetch(
        `${baseUrl}/evolution/account-webhook/${slot.company}/${slot.key}?token=synthetic-token-${slot.company}-${slot.key}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) },
      );
      expect(response.status).toBe(200);
    }

    const rows = await database.pool.query(
      `SELECT empresa_id, account_key, provider_id, from_me, provenance
         FROM evolution_conta_mensagens
        ORDER BY empresa_id, account_key`,
    );
    expect(rows.rows).toEqual([
      {
        empresa_id: 5,
        account_key: "pessoal_proprietario",
        provider_id: "same-provider-id-synthetic",
        from_me: true,
        provenance: "nao_classificada",
      },
      {
        empresa_id: 5,
        account_key: "terceira",
        provider_id: "same-provider-id-synthetic",
        from_me: false,
        provenance: "nao_classificada",
      },
      {
        empresa_id: 6,
        account_key: "pessoal_proprietario",
        provider_id: "same-provider-id-synthetic",
        from_me: false,
        provenance: "nao_classificada",
      },
    ]);
    expect(state.providerFetch).not.toHaveBeenCalled();
  });

  it("recusa token inválido e ignora instância divergente sem persistir", async () => {
    await request("POST", "/evolution/accounts/pessoal_proprietario");
    await request("PUT", "/evolution/accounts/pessoal_proprietario/config", {
      body: {
        baseUrl: "https://personal.example.test",
        instanceName: "personal-test",
        apiKey: "synthetic-personal-key",
      },
    });
    await request("PATCH", "/evolution/accounts/pessoal_proprietario/controls", {
      body: { connectionEnabled: true, captureEnabled: true },
    });
    state.secrets[chaveWebhookEvolutionConta(5, "pessoal_proprietario")] = "synthetic-webhook-token";
    const payload = {
      event: "messages.upsert",
      instance: "another-account",
      data: {
        key: { id: "synthetic-message-2", remoteJid: "0000000000001@s.whatsapp.net" },
        message: { conversation: "outro conteúdo sintético" },
      },
    };
    const wrongToken = await actualFetch(
      `${baseUrl}/evolution/account-webhook/5/pessoal_proprietario?token=wrong-token`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    );
    const wrongInstance = await actualFetch(
      `${baseUrl}/evolution/account-webhook/5/pessoal_proprietario?token=synthetic-webhook-token`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    );
    expect(wrongToken.status).toBe(403);
    expect(wrongInstance.status).toBe(200);
    const rows = await database.pool.query("SELECT COUNT(*)::int AS count FROM evolution_conta_mensagens");
    expect(rows.rows[0].count).toBe(0);
  });
});
