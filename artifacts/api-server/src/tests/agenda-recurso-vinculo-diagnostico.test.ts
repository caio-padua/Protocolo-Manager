import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
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
vi.mock("../lib/clinical-access", () => ({
  clinicManagementPermission: async (professionalId: number) => ({ allowed: professionalId === 101 }),
  currentResponsibleDoctor: async () => null,
}));
vi.mock("../lib/agenda-booking.js", () => ({
  computeResourceSlots: vi.fn(), bookSession: vi.fn(), cancelBooking: vi.fn(), clearSimulations: vi.fn(),
}));
import router from "../routes/agenda";
import { AGENDA_CATEGORIA_AUDITORIA_DDL } from "../lib/agenda-recurso-categoria";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express().use(express.json(), (req, _res, next) => {
  req.tenantContext = {
    authenticated: true,
    empresaId: Number(req.headers["x-clinica-teste"] || 5),
    professionalId: 101,
    isPlatformOwner: true,
  } as any;
  next();
}, router);

const tela = { name: "Agenda sintética", kind: "enfermagem", modality: "local", color: "#16284a", sortOrder: 0, categoryId: 2 };

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await isolated.pool.query(`
    CREATE TABLE locations (id INTEGER PRIMARY KEY, empresa_id INTEGER, active TEXT, name TEXT DEFAULT 'Sala', google_calendar_id TEXT, agenda_papel TEXT DEFAULT 'local');
    INSERT INTO locations VALUES (8,5,'true'), (18,5,'true'), (9,6,'true');
    CREATE TABLE professional_areas (id integer PRIMARY KEY, name text, slug text, professional_type text, active boolean, sort_order integer DEFAULT 0);
    INSERT INTO professional_areas VALUES (1,'Medicina','medicina','medico',true,1),(2,'Enfermagem','enfermagem','nao_medico',true,2);
    CREATE TABLE professionals (id INTEGER PRIMARY KEY, active BOOLEAN NOT NULL, area_id INTEGER, empresa_id INTEGER);
    CREATE TABLE professional_empresas (professional_id integer, empresa_id integer);
    INSERT INTO professionals VALUES (42,true,2,5);
    CREATE TABLE location_professionals (location_id INTEGER, professional_id INTEGER);
    INSERT INTO location_professionals VALUES (18,42);
    CREATE TABLE agenda_resources (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
      modality TEXT NOT NULL, color TEXT NOT NULL, slot_minutes INTEGER NOT NULL DEFAULT 30,
      professional_id INTEGER, location_id INTEGER, google_calendar_id TEXT, category_id INTEGER, empresa_id INTEGER,
      external_cep TEXT, external_logradouro TEXT, external_bairro TEXT, external_cidade TEXT, external_uf TEXT, external_numero TEXT, external_complemento TEXT,
      active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE agenda_windows (
      id SERIAL PRIMARY KEY, resource_id INTEGER NOT NULL, weekday INTEGER NOT NULL,
      start_time TEXT NOT NULL, end_time TEXT NOT NULL, repeat_weeks INTEGER NOT NULL DEFAULT 1,
      anchor_date TEXT, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await isolated.pool.query(AGENDA_CATEGORIA_AUDITORIA_DDL);
}, 60_000);

beforeEach(async () => {
  await isolated.pool.query("DELETE FROM agenda_resources");
  // Impede o semeador da rota de criar agendas-padrão; não coincide com seus nomes.
  await isolated.pool.query(`INSERT INTO agenda_resources(name,kind,modality,color,location_id)
    VALUES ('Agenda controle sintética','medico','local','#000',8)`);
});
afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("Diagnóstico da criação de agenda no banco descartável", () => {
  it("sem local, a agenda nova nasce na clínica da sessão (não exige escolher outra agenda) e fica isolada da outra clínica", async () => {
    const result = await request(app).post("/agenda/resources").send(tela);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ locationId: null, empresaId: 5, categoryId: 2 });
    const listaA = await request(app).get("/agenda/resources").set("x-clinica-teste", "5");
    const listaB = await request(app).get("/agenda/resources").set("x-clinica-teste", "6");
    expect(listaA.body.map((row: any) => row.id)).toContain(result.body.id);
    expect(listaB.body.map((row: any) => row.id)).not.toContain(result.body.id);
  });
  it("local autorizado sem profissional cria agenda visível, mas sem vínculo profissional", async () => {
    const result = await request(app).post("/agenda/resources").send({ ...tela, locationId: 8 });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ locationId: 8, professionalId: null });
    expect((await isolated.pool.query("SELECT location_id, professional_id FROM agenda_resources WHERE id=$1", [result.body.id])).rows[0])
      .toEqual({ location_id: 8, professional_id: null });
    const listaA = await request(app).get("/agenda/resources").set("x-clinica-teste", "5");
    const listaB = await request(app).get("/agenda/resources").set("x-clinica-teste", "6");
    expect(listaA.body.map((row: any) => row.id)).toContain(result.body.id);
    expect(listaB.body.map((row: any) => row.id)).not.toContain(result.body.id);
  });
  it("rejeita local de outra clínica", async () => {
    const result = await request(app).post("/agenda/resources").send({ ...tela, locationId: 9 });
    expect(result.status).toBe(403);
    expect((await isolated.pool.query("SELECT count(*)::int AS total FROM agenda_resources")).rows[0].total).toBe(1);
  });
  it("uma agenda sem local já presente no banco não aparece na listagem da clínica", async () => {
    const inserted = await isolated.pool.query(`INSERT INTO agenda_resources(name,kind,modality,color)
      VALUES ('Agenda órfã sintética','enfermagem','local','#000') RETURNING id`);
    const lista = await request(app).get("/agenda/resources").set("x-clinica-teste", "5");
    expect(lista.status).toBe(200);
    expect(lista.body.map((row: any) => row.id)).not.toContain(inserted.rows[0].id);
    expect((await isolated.pool.query("SELECT count(*)::int AS total FROM agenda_resources WHERE id=$1", [inserted.rows[0].id])).rows[0].total).toBe(1);
  });
  it("atualmente aceita profissional vinculado à mesma empresa, mas somente a outro local", async () => {
    const result = await request(app).post("/agenda/resources").send({ ...tela, locationId: 8, professionalId: 42 });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ locationId: 8, professionalId: 42 });
    const match = await isolated.pool.query("SELECT 1 FROM location_professionals WHERE location_id=8 AND professional_id=42");
    expect(match.rowCount).toBe(0);
  });
});
