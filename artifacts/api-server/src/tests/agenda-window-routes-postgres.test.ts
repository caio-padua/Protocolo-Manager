import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_target, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  });
  return { ...schema, db };
});
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_req: any, _res: any, next: any) => next() }));
// O guard é real; a concessão clínica é controlada por identidades sintéticas.
vi.mock("../lib/clinical-access", () => ({
  clinicManagementPermission: async (professionalId: number) => ({ allowed: professionalId === 101 }),
  currentResponsibleDoctor: async () => null,
}));
vi.mock("../lib/agenda-booking.js", () => ({
  computeResourceSlots: vi.fn(), bookSession: vi.fn(), cancelBooking: vi.fn(), clearSimulations: vi.fn(),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-role"]) { res.status(401).json({ error: "Não autenticado" }); return; }
    req.collaborator = { professionalId: req.headers["x-test-role"] === "admin" ? 101 : 102 }; next();
  },
}));
import router from "../routes/agenda";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), (req, _res, next) => {
  const role = req.headers["x-test-role"];
  req.tenantContext = { authenticated: !!role, empresaId: 5, professionalId: role === "admin" ? 101 : 102 } as any;
  next();
}, router);
const path = "/agenda/resources/11/windows";
const everyOther = { weekday: 6, startTime: "09:00", endTime: "13:00", repeatWeeks: 2, anchorDate: "2026-11-21" };
const original = [{ weekday: 1, startTime: "09:00", endTime: "12:00", repeatWeeks: 1, anchorDate: null }];
const getWindows = () => request(app).get(path).set("x-test-role", "admin");

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await isolated.pool.query("CREATE TABLE locations (id INTEGER PRIMARY KEY, empresa_id INTEGER, active TEXT)");
  await isolated.pool.query("CREATE TABLE agenda_resources (id INTEGER PRIMARY KEY, location_id INTEGER, empresa_id INTEGER)");
  await isolated.pool.query("INSERT INTO locations VALUES (8,5,'true'),(9,6,'true'); INSERT INTO agenda_resources VALUES (11,8,5),(12,9,6)");
  await isolated.pool.query(`CREATE TABLE agenda_windows (
    id SERIAL PRIMARY KEY, resource_id INTEGER NOT NULL, weekday INTEGER NOT NULL,
    start_time TEXT NOT NULL, end_time TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await isolated.pool.query("INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time) VALUES (11,1,'09:00','12:00')");
  const migration = await readFile(
    new URL("../../../../scripts/migrations/20261108_agenda_janelas_quinzenais.sql", import.meta.url), "utf8",
  );
  await isolated.pool.query(migration);
  await isolated.pool.query(migration);
}, 60_000);
afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("janelas quinzenais no banco isolado", () => {
  it("migra uma janela antiga sem mudar sua periodicidade", async () => {
    const response = await getWindows();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject([{ weekday: 1, repeatWeeks: 1, anchorDate: null }]);
  });

  it("rejeita edição sem autorização e data inicial inválida", async () => {
    expect((await request(app).put(path).send({ windows: [everyOther], expectedWindows: original })).status).toBe(401);
    expect((await request(app).put(path).set("x-test-role", "secretaria")
      .send({ windows: [everyOther], expectedWindows: original })).status).toBe(403);
    const invalid = await request(app).put(path).set("x-test-role", "admin")
      .send({ windows: [{ ...everyOther, anchorDate: "2026-11-20" }], expectedWindows: original });
    expect(invalid.status).toBe(400);
    expect((await getWindows()).body).toHaveLength(1);
  });

  it("salva a repetição e preserva historicamente o expediente anterior", async () => {
    const response = await request(app).put(path).set("x-test-role", "admin")
      .send({ windows: [everyOther], expectedWindows: original });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject([everyOther]);
    const all = await isolated.pool.query("SELECT weekday, active FROM agenda_windows ORDER BY id");
    expect(all.rows).toEqual([{ weekday: 1, active: false }, { weekday: 6, active: true }]);
  });

  it("impede tela antiga de converter repetição quinzenal em semanal", async () => {
    const response = await request(app).put(path).set("x-test-role", "admin").send({
      windows: [{ weekday: 6, startTime: "09:00", endTime: "13:00" }],
    });
    expect(response.status).toBe(409);
    expect((await request(app).put(path).set("x-test-role", "admin").send({ windows: [] })).status).toBe(409);
    expect((await request(app).put(path).set("x-test-role", "admin")
      .send({ windows: [], expectedWindows: original })).status).toBe(409);
    expect((await getWindows()).body).toMatchObject([everyOther]);
  });

  it("limpeza explícita desativa sem apagar registros", async () => {
    const response = await request(app).put(path).set("x-test-role", "admin")
      .send({ windows: [], expectedWindows: [everyOther] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    const all = await isolated.pool.query("SELECT weekday, active FROM agenda_windows ORDER BY id");
    expect(all.rows).toEqual([{ weekday: 1, active: false }, { weekday: 6, active: false }]);
  });

  it("não expõe janelas ou vagas de outra empresa", async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get("/agenda/resources/12/windows").set("x-test-role", "admin")).status).toBe(404);
    expect((await request(app).get("/agenda/slots?resourceId=12&date=2026-11-21")).status).toBe(404);
    expect((await request(app).put("/agenda/resources/12/windows").set("x-test-role", "admin")
      .send({ windows: [], expectedWindows: [] })).status).toBe(403);
  });

  it("não sobrescreve alteração concorrente com a mesma versão inicial", async () => {
    const weekly = { weekday: 1, startTime: "10:00", endTime: "12:00", repeatWeeks: 1, anchorDate: null };
    const writes = await Promise.all([
      request(app).put(path).set("x-test-role", "admin").send({ windows: [weekly], expectedWindows: [] }),
      request(app).put(path).set("x-test-role", "admin").send({ windows: [everyOther], expectedWindows: [] }),
    ]);
    expect(writes.map(r => r.status).sort()).toEqual([200, 409]);
    const rows = await isolated.pool.query("SELECT count(*)::int AS count FROM agenda_windows WHERE active");
    expect(rows.rows[0].count).toBe(1);
  });
});

describe("novos padrões de repetição no banco isolado", () => {
  const put = (windows: unknown[], expectedWindows: unknown[]) =>
    request(app).put(path).set("x-test-role", "admin").send({ windows, expectedWindows });
  const atual = async () => (await getWindows()).body.map((w: any) => ({
    weekday: w.weekday, startTime: w.startTime, endTime: w.endTime, repeatWeeks: w.repeatWeeks, anchorDate: w.anchorDate,
  }));

  it("salva 1º e 3º sábado do mês na mesma faixa de horário e a cada 3 semanas", async () => {
    const primeiro = { weekday: 6, startTime: "09:00", endTime: "13:00", repeatWeeks: 101, anchorDate: null };
    const terceiro = { ...primeiro, repeatWeeks: 103 };
    const aCada3 = { weekday: 2, startTime: "09:00", endTime: "12:00", repeatWeeks: 3, anchorDate: "2026-11-17" };
    const antes = await atual();
    const response = await put([primeiro, terceiro, aCada3], antes);
    expect(response.status).toBe(200);
    expect(await atual()).toHaveLength(3);
  });

  it("recusa padrões fora da lista, mensal com data e sobreposição que pode coincidir", async () => {
    const base = { weekday: 6, startTime: "09:00", endTime: "13:00" };
    const antes = await atual();
    expect((await put([{ ...base, repeatWeeks: 5, anchorDate: "2026-11-21" }], antes)).status).toBe(400);
    expect((await put([{ ...base, repeatWeeks: 101, anchorDate: "2026-11-07" }], antes)).status).toBe(400);
    expect((await put([{ ...base, repeatWeeks: 106, anchorDate: null }], antes)).status).toBe(400);
    expect((await put([{ ...base, repeatWeeks: 1, anchorDate: null }, { ...base, startTime: "12:00", endTime: "14:00", repeatWeeks: 101, anchorDate: null }], antes)).status).toBe(400);
    expect(await atual()).toEqual(antes);
  });
});
