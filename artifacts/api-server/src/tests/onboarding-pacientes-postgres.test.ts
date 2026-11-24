import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as ReturnType<typeof drizzle> | null }));
vi.mock("@workspace/db", () => ({
  db: {
    execute: (query: Parameters<ReturnType<typeof drizzle>["execute"]>[0]) =>
      state.database ? state.database.execute(query) : Promise.resolve({ rows: [] }),
  },
  clientsTable: {},
}));
vi.mock("../lib/whatsapp.js", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/telegram.js", () => ({ sendTelegram: vi.fn() }));
vi.mock("../lib/onboarding-clinic.js", () => ({ resolveOnboardingClinic: vi.fn() }));
import { onboardingRouter } from "../routes/onboarding";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use((req, _res, next) => {
  req.tenantContext = {
    empresaId: Number(req.headers["x-test-company"] ?? 5),
    isPlatformOwner: true, perfilPlataforma: "platform_owner",
    authenticated: true, professionalId: 1,
  };
  next();
});
app.use("/api/onboarding", onboardingRouter);

beforeAll(async () => {
  // All writes are confined to a fresh PostgreSQL cluster, never the app database.
  await new Promise((resolve) => setImmediate(resolve));
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await isolated.pool.query(`
    CREATE TABLE clients (id int PRIMARY KEY, name text NOT NULL, empresa_id int NOT NULL);
    CREATE TABLE onboarding_eventos (client_id int, empresa_id int, ts timestamptz, device text, secao text);
    INSERT INTO clients VALUES (1,'Cliente sintético A',5),(2,'Cliente sintético B',5),(3,'Outra clínica',42),(4,'Antigo',5);
    INSERT INTO onboarding_eventos VALUES
      (1,5,NOW()-INTERVAL '3 days','iphone','login'),
      (1,5,NOW()-INTERVAL '1 hour','iphone','telegram'),
      (2,5,NOW()-INTERVAL '2 days','android','login'),
      (3,42,NOW(),'desktop','login'),
      (3,5,NOW(),'desktop','login'),
      (999,5,NOW(),'desktop','login'),
      (NULL,5,NOW(),'desktop','login'),
      (4,5,NOW()-INTERVAL '31 days','desktop','login');
    INSERT INTO clients SELECT n, 'Cliente sintético ' || n, 5 FROM generate_series(100,154) n;
    INSERT INTO onboarding_eventos SELECT n, 5, NOW()-INTERVAL '10 days','desktop','login' FROM generate_series(100,154) n;
  `);
}, 60_000);
afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("lista identificada do Guia Digital com PostgreSQL descartável", () => {
  it("inclui todos os clientes, deduplica e usa a abertura mais recente dentro dos 30 dias", async () => {
    const response = await request(app).get("/api/onboarding/stats").expect(200);
    const { pacientes, pacientesUnicos, total } = response.body;
    expect(pacientes).toHaveLength(57);
    expect(pacientesUnicos).toBe(57);
    expect(total).toBe(61); // seis eventos recentes da clínica + 55 clientes extras
    expect(pacientes.slice(0, 2).map((p: { client_id: number }) => p.client_id)).toEqual([1, 2]);
    const latest = await isolated.pool.query("SELECT MAX(ts) AS ts FROM onboarding_eventos WHERE client_id=1");
    expect(pacientes[0]).toMatchObject({ client_id: 1, nome: "Cliente sintético A" });
    expect(new Date(pacientes[0].ultimo_acesso).toISOString()).toBe(latest.rows[0].ts.toISOString());
    expect(pacientes.some((p: { client_id: number }) => [3, 4, 999].includes(p.client_id))).toBe(false);
  });

  it("consulta somente a clínica autenticada, mesmo com parâmetros forjados", async () => {
    const response = await request(app).get("/api/onboarding/stats?empresa_id=5&tenantSlug=outra")
      .set("x-test-company", "42").expect(200);
    expect(response.body.pacientesUnicos).toBe(1);
    expect(response.body.pacientes).toEqual([
      expect.objectContaining({ client_id: 3, nome: "Outra clínica" }),
    ]);
  });

  it("retorna lista vazia e contagem zero quando não há acessos", async () => {
    const response = await request(app).get("/api/onboarding/stats")
      .set("x-test-company", "77").expect(200);
    expect(response.body).toMatchObject({ total: 0, pacientesUnicos: 0, pacientes: [] });
  });
});
