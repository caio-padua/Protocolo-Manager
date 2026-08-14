/**
 * onboarding-config.test.ts
 *
 * Testes de integração HTTP para a rota pública de configuração multi-tenant:
 *   GET /api/onboarding/config?tenant=<slug>
 *
 * Cobre:
 *   - 200 com branding correto quando tenant existe (clinicaNome, botHandle, areaUrl)
 *   - Sem "Instituto Pádua" no clinicaNome quando o tenant tem nome próprio
 *   - botHandle e areaUrl retornados como null quando não configurados
 *   - 404 quando slug não existe no banco
 *   - 400 quando ?tenant= não é informado ou está vazio
 *   - 500 tratado sem vazar stack trace
 *
 * Estratégia: @workspace/db é mockado via vi.hoisted() (sem conexão real).
 * A rota real é montada num app Express mínimo via supertest.
 * O boot migration IIFE é absorvido pelo mock — db.execute retorna { rows: [] }.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── vi.hoisted garante que mockExecute esteja disponível ANTES do hoist de vi.mock ──
const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

// ── Mocks ANTES dos imports das rotas ─────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db:           { execute: mockExecute },
  clientsTable: {},
  sql:          {},
}));

vi.mock("../lib/whatsapp.js", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/telegram.js", () => ({ sendTelegram: vi.fn() }));

// ── Imports após os mocks ─────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { onboardingPublicRouter } from "../routes/onboarding.js";

// ── App mínimo de teste ───────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/onboarding", onboardingPublicRouter);
  return app;
}

const app = buildApp();

// ── Helper: configura o mock de db.execute ────────────────────────────────────
// O boot migration (CREATE TABLE + ALTER TABLE) é um IIFE que dispara uma única
// vez no import do módulo — antes de qualquer beforeEach. Dentro de cada teste,
// mockExecute já foi resetado por vi.clearAllMocks(), então a próxima chamada é
// diretamente o SELECT de tenant. Basta retornar as linhas para qualquer chamada.
function setupDbMock(tenantRows: object[]) {
  mockExecute.mockResolvedValue({ rows: tenantRows });
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("GET /api/onboarding/config — rota pública multi-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("200 — retorna branding da clínica quando tenant existe", async () => {
    setupDbMock([
      {
        nome:                   "Clínica Barakat",
        telegram_bot_username:  "@BarakatBot",
        area_url:               "https://area.barakat.com.br",
      },
    ]);

    const res = await request(app)
      .get("/api/onboarding/config?tenant=barakat")
      .expect(200);

    expect(res.body).toMatchObject({
      clinicaNome: "Clínica Barakat",
      botHandle:   "@BarakatBot",
      areaUrl:     "https://area.barakat.com.br",
    });
  });

  it("200 — clinicaNome não contém 'Instituto Pádua' quando tenant tem nome próprio", async () => {
    setupDbMock([
      { nome: "Clínica Paluzze", telegram_bot_username: "@PaluzzeBot", area_url: null },
    ]);

    const res = await request(app)
      .get("/api/onboarding/config?tenant=paluzze")
      .expect(200);

    expect(res.body.clinicaNome).toBe("Clínica Paluzze");
    expect(res.body.clinicaNome).not.toContain("Pádua");
  });

  it("200 — botHandle e areaUrl são null quando não configurados no banco", async () => {
    setupDbMock([
      { nome: "Clínica Sem Bot", telegram_bot_username: null, area_url: null },
    ]);

    const res = await request(app)
      .get("/api/onboarding/config?tenant=sem-bot")
      .expect(200);

    expect(res.body.clinicaNome).toBe("Clínica Sem Bot");
    expect(res.body.botHandle).toBeNull();
    expect(res.body.areaUrl).toBeNull();
  });

  it("404 — slug não existe no banco", async () => {
    setupDbMock([]); // rows vazio → tenant não encontrado

    const res = await request(app)
      .get("/api/onboarding/config?tenant=slug-que-nao-existe")
      .expect(404);

    expect(res.body).toHaveProperty("error");
  });

  it("400 — ?tenant= não informado", async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get("/api/onboarding/config")
      .expect(400);

    expect(res.body).toHaveProperty("error");
  });

  it("400 — ?tenant= está vazio (string vazia)", async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get("/api/onboarding/config?tenant=")
      .expect(400);

    expect(res.body).toHaveProperty("error");
  });

  it("500 — erro de banco não vaza stack trace para o cliente", async () => {
    mockExecute.mockRejectedValue(new Error("connection refused"));

    const res = await request(app)
      .get("/api/onboarding/config?tenant=qualquer")
      .expect(500);

    expect(res.body).toHaveProperty("error");
    expect(JSON.stringify(res.body)).not.toContain("at Module");
  });
});
