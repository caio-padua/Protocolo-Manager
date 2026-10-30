/**
 * Actual signed tokens + actual PostgreSQL queries on connection-local
 * temporary tables. No persistent patient data or real message delivery.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({ rows: [] }),
  select: vi.fn(),
  whatsapp: vi.fn(),
  telegram: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: { execute: mocks.execute, select: mocks.select },
  };
});
vi.mock("../lib/whatsapp.js", () => ({ sendWhatsapp: mocks.whatsapp }));
vi.mock("../lib/telegram.js", () => ({ sendTelegram: mocks.telegram }));

import { pool } from "@workspace/db";
import { onboardingRouter } from "../routes/onboarding.js";
import { createCollaboratorToken } from "../lib/collaborator-auth.js";

const app = express();
app.use(express.json());
// Reproduce the global legacy fallback: onboarding must NOT trust it.
app.use((req, _res, next) => {
  req.tenantContext = { empresaId: 5, isPlatformOwner: true, perfilPlataforma: "platform_owner" };
  next();
});
app.use("/api/onboarding", onboardingRouter);

let connection: Awaited<ReturnType<typeof pool.connect>>;
const licensedToken = createCollaboratorToken({ professionalId: 101, role: "admin" });
const legacyToken = createCollaboratorToken({ professionalId: 102, role: "admin" });
const otherToken = createCollaboratorToken({ professionalId: 103, role: "admin" });
let nextClientId = 2000;
let clientId: number;

beforeAll(async () => {
  connection = await pool.connect();
  const database = drizzle(connection);
  const dialect = new PgDialect();
  mocks.execute.mockImplementation(async (query) => {
    const { sql } = dialect.sqlToQuery(query);
    // Boot migrations never touch persistent tables in this suite.
    if (/^\s*(CREATE|ALTER)\b/i.test(sql)) return { rows: [] };
    return database.execute(query);
  });
  mocks.select.mockImplementation((fields) => database.select(fields));
});

beforeEach(async () => {
  clientId = ++nextClientId;
  mocks.whatsapp.mockReset().mockResolvedValue({ sent: true });
  mocks.telegram.mockReset().mockResolvedValue({ sent: true });
  await connection.query("BEGIN");
  await connection.query(`
    CREATE TEMP TABLE empresas (
      id INT PRIMARY KEY, nome TEXT, slug TEXT,
      telegram_bot_username TEXT, area_url TEXT,
      ativa BOOLEAN DEFAULT true, status TEXT DEFAULT 'ATIVO'
    ) ON COMMIT DROP;
    CREATE TEMP TABLE professionals (
      id INT PRIMARY KEY, empresa_id INT, active BOOLEAN
    ) ON COMMIT DROP;
    CREATE TEMP TABLE clients (
      id INT PRIMARY KEY, empresa_id INT, name TEXT,
      phone TEXT, telegram_chat_id TEXT, cpf TEXT, photo_url TEXT,
      status TEXT DEFAULT 'active', deleted_at TIMESTAMPTZ
    ) ON COMMIT DROP;
    CREATE TEMP TABLE onboarding_quota (
      client_id INT, canal TEXT, dia_brt DATE, enviados INT,
      PRIMARY KEY (client_id, canal, dia_brt)
    ) ON COMMIT DROP;
    INSERT INTO empresas (id, nome, slug, telegram_bot_username, area_url) VALUES
      (5, 'Instituto Pádua', NULL, NULL, NULL),
      (12, 'Clínica Licenciada', 'licenciada', '@LicenciadaBot', 'https://example.com/area'),
      (13, 'Outra Clínica', 'outra', NULL, NULL);
    INSERT INTO professionals VALUES (101, 12, true), (102, 5, true), (103, 13, true);
  `);
  await connection.query(
    "INSERT INTO pg_temp.clients (id, empresa_id, name, phone, telegram_chat_id) VALUES ($1, 12, 'Cliente Teste', '+5500000000000', 'synthetic-chat')",
    [clientId],
  );
});

afterEach(async () => { await connection.query("ROLLBACK"); });
afterAll(async () => { connection?.release(); await pool.end(); });

function send(token = licensedToken, extra: object = {}) {
  return request(app).post("/api/onboarding/enviar-guia")
    .set("Authorization", `Bearer ${token}`)
    .send({
      clientId,
      canais: ["WHATSAPP", "TELEGRAM"],
      guiaUrl: "https://example.com/guia-digital?tenant=licenciada",
      tenantSlug: "licenciada",
      ...extra,
    });
}

async function expectNoDelivery() {
  expect(mocks.whatsapp).not.toHaveBeenCalled();
  expect(mocks.telegram).not.toHaveBeenCalled();
  const result = await connection.query("SELECT COUNT(*)::int AS count FROM pg_temp.onboarding_quota");
  expect(result.rows[0].count).toBe(0);
}

describe("Guia: clínica autorizada pela identidade do colaborador", () => {
  it("minha-config retorna a clínica real, e ambos os canais usam sua marca", async () => {
    const config = await request(app).get("/api/onboarding/minha-config")
      .set("Authorization", `Bearer ${licensedToken}`).expect(200);
    expect(config.body).toEqual({
      clinicaNome: "Clínica Licenciada", slug: "licenciada",
      botHandle: "@LicenciadaBot", areaUrl: "https://example.com/area",
    });
    const result = await send(licensedToken, { tenantSlug: config.body.slug }).expect(200);
    expect(result.body.ok).toBe(true);
    for (const provider of [mocks.whatsapp, mocks.telegram]) {
      expect(provider).toHaveBeenCalledTimes(1);
      expect(provider.mock.calls[0][1]).toContain("Clínica Licenciada — Seu Guia Digital");
      expect(provider.mock.calls[0][1]).not.toContain("Instituto Pádua");
    }
  });

  it("sem slug, mantém a clínica licenciada autenticada, não usa fallback de outra empresa", async () => {
    await send(licensedToken, {
      tenantSlug: undefined, guiaUrl: "https://example.com/guia-digital",
    }).expect(200);
    expect(mocks.whatsapp.mock.calls[0][1]).toContain("Clínica Licenciada — Seu Guia Digital");
    expect(mocks.whatsapp.mock.calls[0][1]).toContain("?tenant=licenciada");
  });

  it("lista somente clientes ativos da clínica autenticada para o seletor", async () => {
    await connection.query(`
      INSERT INTO pg_temp.clients (id, empresa_id, name, status, deleted_at) VALUES
        (1, 5, 'Cliente Legado', 'active', NULL),
        (2, 13, 'Cliente Outra Clínica', 'active', NULL),
        (3, 12, 'Cliente Inativo', 'inactive', NULL),
        (4, 12, 'Cliente Arquivado', 'active', NOW())
    `);
    const result = await request(app).get("/api/onboarding/clientes")
      .set("Authorization", `Bearer ${licensedToken}`).expect(200);
    expect(result.body).toEqual([{
      id: clientId, name: "Cliente Teste", phone: "+5500000000000",
      cpf: null, photoUrl: null,
    }]);
  });

  it("mantém o fluxo legado da empresa 5 sem slug", async () => {
    await connection.query("UPDATE pg_temp.clients SET empresa_id = 5");
    await send(legacyToken, {
      tenantSlug: undefined, guiaUrl: "https://example.com/guia-digital",
    }).expect(200);
    expect(mocks.whatsapp.mock.calls[0][1]).toContain("Instituto Pádua — Seu Guia Digital");
  });

  it("rejeita slug de outra clínica mesmo com cliente próprio", async () => {
    await send(licensedToken, { tenantSlug: "outra" }).expect(403);
    await expectNoDelivery();
  });

  it("rejeita cliente de outra clínica mesmo com slug próprio", async () => {
    await connection.query("UPDATE pg_temp.clients SET empresa_id = 13");
    await send().expect(404);
    await expectNoDelivery();
  });

  it("outro colaborador não pode escolher clínica e cliente alheios", async () => {
    await send(otherToken).expect(403);
    await expectNoDelivery();
  });

  it("o título não pode disfarçar um link para outra clínica", async () => {
    await send(licensedToken, { guiaUrl: "https://example.com/guia-digital?tenant=outra" }).expect(403);
    await expectNoDelivery();
  });

  it.each(["", "invalid-token"])("rejeita sessão ausente ou inválida: %j", async (token) => {
    await send(token).expect(401);
    await request(app).get("/api/onboarding/minha-config")
      .set("Authorization", `Bearer ${token}`).expect(401);
    await expectNoDelivery();
  });

  it.each([
    "UPDATE pg_temp.professionals SET active = false WHERE id = 101",
    "UPDATE pg_temp.professionals SET empresa_id = NULL WHERE id = 101",
    "UPDATE pg_temp.professionals SET empresa_id = 999 WHERE id = 101",
    "UPDATE pg_temp.empresas SET ativa = false WHERE id = 12",
    "UPDATE pg_temp.empresas SET status = 'SUSPENSO' WHERE id = 12",
  ])("revalida vínculo no banco mesmo com token válido: %s", async (sql) => {
    await connection.query(sql);
    await send().expect(403);
    await request(app).get("/api/onboarding/minha-config")
      .set("Authorization", `Bearer ${licensedToken}`).expect(403);
    await expectNoDelivery();
  });

  it("consulta a associação atual após uma mudança de clínica", async () => {
    await connection.query("UPDATE pg_temp.professionals SET empresa_id = 13 WHERE id = 101");
    const result = await request(app).get("/api/onboarding/minha-config")
      .set("Authorization", `Bearer ${licensedToken}`).expect(200);
    expect(result.body.slug).toBe("outra");
    await send().expect(403);
    await expectNoDelivery();
  });
});
