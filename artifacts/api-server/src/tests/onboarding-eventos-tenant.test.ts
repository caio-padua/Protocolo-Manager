import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock("@workspace/db", () => ({ db: { execute }, clientsTable: {} }));
vi.mock("../lib/whatsapp.js", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/telegram.js", () => ({ sendTelegram: vi.fn() }));

import { onboardingPublicRouter, onboardingRouter } from "../routes/onboarding.js";

const dialect = new PgDialect();
const queries = () => execute.mock.calls.map(([query]: [SQL]) => dialect.sqlToQuery(query));
const app = express();
app.use(express.json());
app.use("/api/onboarding", onboardingPublicRouter);
const event = { device: "desktop", secao: "login" };

// Let the existing asynchronous boot DDL finish before resetting the mock.
beforeAll(async () => { await new Promise((resolve) => setImmediate(resolve)); });
beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue({ rows: [] });
});

describe("POST /onboarding/evento — atribuição por slug", () => {
  it.each(["tenantSlug", "tenant"])("resolve %s no servidor e ignora empresa_id forjado", async (field) => {
    execute.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    await request(app).post("/api/onboarding/evento")
      .send({ ...event, [field]: " clinica-teste ", empresa_id: 5 }).expect(200);
    expect(queries()[0].params).toEqual(["clinica-teste"]);
    expect(queries()[1].sql).toContain("INSERT INTO onboarding_eventos");
    expect(queries()[1].params).toEqual([42, "desktop", "login", null]);
  });

  it("preserva empresa 5 somente quando não há slug", async () => {
    await request(app).post("/api/onboarding/evento").send({ ...event, empresa_id: 99 }).expect(200);
    expect(queries()).toHaveLength(1);
    expect(queries()[0].params).toEqual([5, "desktop", "login", null]);
  });

  it("não grava slug desconhecido na empresa padrão", async () => {
    const response = await request(app).post("/api/onboarding/evento")
      .send({ ...event, tenantSlug: "inexistente" }).expect(200);
    expect(response.body.skipped).toBe("tenant_desconhecido");
    expect(queries()).toHaveLength(1);
    expect(queries()[0].sql).not.toContain("INSERT");
  });

  it.each([
    { tenantSlug: "" }, { tenantSlug: "  " }, { tenantSlug: 42 },
    { tenantSlug: "a".repeat(81) }, { tenant: "" },
    { tenantSlug: "clinica-a", tenant: "clinica-b" },
  ])("rejeita slug inválido ou ambíguo: %j", async (input) => {
    await request(app).post("/api/onboarding/evento").send({ ...event, ...input }).expect(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([true, false])("associa paciente somente quando pertence à clínica: %s", async (belongs) => {
    execute.mockResolvedValueOnce({ rows: [{ id: 42 }] })
      .mockResolvedValueOnce({ rows: belongs ? [{ id: 123 }] : [] });
    await request(app).post("/api/onboarding/evento")
      .send({ ...event, tenantSlug: "clinica-teste", client_id: 123 }).expect(200);
    expect(queries()[1].sql).toContain("AND empresa_id =");
    expect(queries()[1].params).toEqual([123, 42]);
    expect(queries()[2].params).toEqual([42, "desktop", "login", belongs ? 123 : null]);
  });

  it("não faz fallback para empresa 5 se a consulta falhar", async () => {
    execute.mockRejectedValueOnce(new Error("banco indisponível"));
    await request(app).post("/api/onboarding/evento")
      .send({ ...event, tenantSlug: "clinica-teste" }).expect(500);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("GET /onboarding/stats — contexto do CEO", () => {
  function statsApp(empresaId?: number) {
    const stats = express();
    stats.use((req, _res, next) => {
      if (empresaId !== undefined) {
        req.tenantContext = { empresaId, isPlatformOwner: true, perfilPlataforma: "platform_owner" };
      }
      next();
    });
    stats.use("/api/onboarding", onboardingRouter);
    return stats;
  }

  it.each([5, 42])("escopa todas as agregações à empresa %s, ignorando query", async (empresaId) => {
    const response = await request(statsApp(empresaId))
      .get("/api/onboarding/stats?empresa_id=999&empresaId=999&tenantSlug=outra").expect(200);
    expect(response.body).toMatchObject({ ok: true, total: 0, pacientesUnicos: 0 });
    expect(queries()).toHaveLength(5);
    for (const query of queries()) {
      expect(query.sql).toContain("empresa_id =");
      expect(query.params).toEqual([empresaId]);
    }
  });

  it.each([undefined, 0, -1, NaN])("nega acesso sem contexto válido (%s)", async (empresaId) => {
    await request(statsApp(empresaId)).get("/api/onboarding/stats").expect(403);
    expect(execute).not.toHaveBeenCalled();
  });
});
