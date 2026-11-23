/**
 * FATIA 01 — autorização e isolamento por clínica em /budgets*, /budget-settings* e /budget-catalog*.
 * Rotas REAIS (supertest) sobre PostgreSQL descartável sintético; nada do banco real é lido ou escrito.
 * A sessão é simulada só no ponto de entrada (req.tenantContext); a autorização, a matriz de Governança e o SQL são os reais.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { bancoAtendimentoIsolado } from "./helpers/pg-atendimento-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

const estado = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const ponte = (k: "db" | "pool") => new Proxy({}, { get(_t, key) { const v = estado[k]?.[key]; return typeof v === "function" ? v.bind(estado[k]) : v; } });
  return { ...schema, db: ponte("db"), pool: ponte("pool") };
});
// Matriz de Governança padrão (sem personalização): política comercial = admin + financeiro.
vi.mock("../lib/secure-settings", async (orig) => ({ ...(await orig<any>()), getJsonSetting: async () => null }));

import { budgetsTable, budgetCatalogTable, budgetSettingsTable, clientsTable, professionalsTable } from "@workspace/db/schema";
import budgetsRouter from "../routes/budgets";
import budgetSettingsRouter from "../routes/budget-settings";
import budgetCatalogRouter from "../routes/budget-catalog";
import { migrarComercial } from "../lib/comercial-migracao";

let iso: Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  const h = req.headers;
  req.tenantContext = h["x-anon"] === "1" ? { authenticated: false }
    : { authenticated: true, empresaId: h["x-sem-clinica"] === "1" ? 0 : Number(h["x-empresa"] ?? 5), professionalId: Number(h["x-prof"] ?? 10) };
  req.log = { info() {}, warn() {}, error() {} };
  next();
});
app.use("/api", budgetsRouter);
app.use("/api", budgetSettingsRouter);
app.use("/api", budgetCatalogRouter);
app.use((err: Error, _r: any, s: any, _n: any) => s.status(500).json({ error: err.message }));

// Profissionais sintéticos: 10 admin da clínica 5; 11 financeiro da clínica 5; 12 enfermagem da 5; 20 admin da clínica 9; 13 inativo.
const PROF_ADMIN5 = 10, PROF_FIN5 = 11, PROF_ENF5 = 12, PROF_INATIVO = 13, PROF_ADMIN9 = 20;
const como = (r: request.Test, prof: number, empresa: number) => r.set("x-prof", String(prof)).set("x-empresa", String(empresa));
const q = (t: string, v?: unknown[]) => iso.pool.query(t, v);

beforeAll(async () => {
  iso = await bancoAtendimentoIsolado();
  estado.pool = iso.pool; estado.db = drizzle(iso.pool);
  for (const t of [professionalsTable, clientsTable, budgetsTable, budgetCatalogTable, budgetSettingsTable]) await q(createTableFromSchema(t));
  await q(`INSERT INTO professionals (id,name,category,active,is_platform_owner) VALUES
    (10,'Admin 5','admin',true,false),(11,'Fin 5','financeiro',true,false),(12,'Enf 5','enfermagem',true,false),
    (13,'Inativo','admin',false,false),(20,'Admin 9','admin',true,false)`).catch(async () => {
    const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='professionals' AND is_nullable='NO' AND column_default IS NULL`)).rows;
    throw new Error("professionals exige colunas: " + cols.map((c: any) => c.column_name).join(","));
  });
  await q(`INSERT INTO clients (id,name,empresa_id) VALUES (1,'Cliente da 5',5),(2,'Cliente da 9',9)`);
  await q(`INSERT INTO budgets (id,empresa_id,client_id,status,total_cents,items) VALUES (1,5,1,'accepted',500000,'[]'),(2,9,2,'draft',100000,'[]')`);
  await q(`SELECT setval(pg_get_serial_sequence('budgets','id'), 100)`); // ids de semente fixos
  await migrarComercial(iso.pool); // idempotente sobre o esquema já com empresa_id
}, 90_000);
afterAll(async () => iso?.fechar());

describe("sem sessão ou sessão inválida: 401/403 em todas as rotas financeiras", () => {
  const rotas: [string, string][] = [
    ["get", "/api/budgets"], ["post", "/api/budgets"], ["post", "/api/budgets/calculate"], ["get", "/api/budgets/1"],
    ["patch", "/api/budgets/1"], ["delete", "/api/budgets/1"],
    ["get", "/api/budget-settings"], ["put", "/api/budget-settings"],
    ["get", "/api/budget-catalog"], ["post", "/api/budget-catalog"], ["patch", "/api/budget-catalog/1"], ["delete", "/api/budget-catalog/1"], ["post", "/api/budget-catalog/seed"],
  ];
  it.each(rotas)("anônimo: %s %s -> 401", async (m, rota) => {
    const r = await (request(app) as any)[m](rota).set("x-anon", "1").send({});
    expect(r.status).toBe(401);
  });
  it("profissional inativo -> 403", async () => {
    expect((await como(request(app).get("/api/budgets"), PROF_INATIVO, 5)).status).toBe(403);
  });
  it("sessão sem clínica -> 403 (nega por padrão)", async () => {
    const r = await request(app).get("/api/budgets").set("x-prof", "10").set("x-sem-clinica", "1");
    expect(r.status).toBe(403);
  });
  it("profissional inexistente -> 403", async () => {
    expect((await como(request(app).get("/api/budgets"), 999, 5)).status).toBe(403);
  });
});

describe("isolamento cruzado por ID direto", () => {
  it("clínica 9 não lê o orçamento da clínica 5 pelo ID (404 sem revelar existência)", async () => {
    const r = await como(request(app).get("/api/budgets/1"), PROF_ADMIN9, 9);
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/5\b|Cliente da 5|500000/);
  });
  it("clínica 9 não altera nem cancela orçamento da clínica 5", async () => {
    expect((await como(request(app).patch("/api/budgets/1").send({ title: "invasao", status: "cancelled" }), PROF_ADMIN9, 9)).status).toBe(404);
    expect((await como(request(app).delete("/api/budgets/1"), PROF_ADMIN9, 9)).status).toBe(404);
    const o = (await q("SELECT status,title FROM budgets WHERE id=1")).rows[0];
    expect(o.status).toBe("accepted"); expect(o.title).not.toBe("invasao");
  });
  it("listagem traz só orçamentos da própria clínica", async () => {
    const a = (await como(request(app).get("/api/budgets"), PROF_ADMIN5, 5)).body as { id: number }[];
    const b = (await como(request(app).get("/api/budgets"), PROF_ADMIN9, 9)).body as { id: number }[];
    expect(a.map((x) => x.id)).toEqual([1]); expect(b.map((x) => x.id)).toEqual([2]);
  });
  it("não cria orçamento para cliente de outra clínica", async () => {
    const r = await como(request(app).post("/api/budgets").send({ clientId: 1, items: [] }), PROF_ADMIN9, 9);
    expect(r.status).toBe(404);
    expect(Number((await q("SELECT count(*) c FROM budgets")).rows[0].c)).toBe(2);
  });
  it("criação grava a clínica da SESSÃO, ignorando empresaId enviado no corpo", async () => {
    const r = await como(request(app).post("/api/budgets").send({ clientId: 2, items: [], empresaId: 5 }), PROF_ADMIN9, 9);
    expect([r.status, r.body.error]).toEqual([201, undefined]);
    expect((await q("SELECT empresa_id FROM budgets WHERE id=$1", [r.body.id])).rows[0].empresa_id).toBe(9);
  });
  it("cancelar é lógico: a linha continua existindo e há trilha", async () => {
    const r = await como(request(app).delete("/api/budgets/2"), PROF_ADMIN9, 9);
    expect([200, 204]).toContain(r.status);
    expect((await q("SELECT status FROM budgets WHERE id=2")).rows[0].status).toBe("cancelled");
    expect(Number((await q("SELECT count(*) c FROM budget_eventos WHERE budget_id=2 AND empresa_id=9")).rows[0].c)).toBeGreaterThan(0);
  });
  it("transição inválida de estado é recusada (cancelado não volta)", async () => {
    expect((await como(request(app).patch("/api/budgets/2").send({ status: "accepted" }), PROF_ADMIN9, 9)).status).toBe(409);
  });
});

describe("configurações financeiras por clínica e permissão real", () => {
  it("leitura é permitida a qualquer profissional ativo da clínica; escrita exige permissão", async () => {
    expect((await como(request(app).get("/api/budget-settings"), PROF_ENF5, 5)).status).toBe(200);
    expect((await como(request(app).put("/api/budget-settings").send({ cashDiscountPct: 1 }), PROF_ENF5, 5)).status).toBe(403);
  });
  it("financeiro altera a política da PRÓPRIA clínica; a de outra clínica não muda", async () => {
    const antes9 = (await como(request(app).get("/api/budget-settings"), PROF_ADMIN9, 9)).body.cashDiscountPct;
    const r = await como(request(app).put("/api/budget-settings").send({ cashDiscountPct: 12 }), PROF_FIN5, 5);
    expect(r.status).toBe(200);
    expect((await como(request(app).get("/api/budget-settings"), PROF_ADMIN5, 5)).body.cashDiscountPct).toBe(12);
    expect((await como(request(app).get("/api/budget-settings"), PROF_ADMIN9, 9)).body.cashDiscountPct).toBe(antes9);
  });
  it("catálogo: enfermagem não escreve", async () => {
    expect((await como(request(app).post("/api/budget-catalog").send({ name: "X", unitPriceCents: 100 }), PROF_ENF5, 5)).status).toBe(403);
  });
});

describe("tentativas recusadas ficam na trilha da própria clínica", () => {
  it("o 403 da enfermagem foi registrado na clínica 5 e nada vaza para a clínica 9", async () => {
    const c5 = Number((await q("SELECT count(*) c FROM budget_eventos WHERE tipo='acesso_recusado' AND empresa_id=5")).rows[0].c);
    const c9 = Number((await q("SELECT count(*) c FROM budget_eventos WHERE tipo='acesso_recusado' AND empresa_id=9")).rows[0].c);
    expect(c5).toBeGreaterThan(0); expect(c9).toBe(0);
  });
});

describe("dados legados preservados", () => {
  it("orçamento antigo continua com valor, estado e cliente originais", async () => {
    const o = (await q("SELECT client_id,total_cents,status,empresa_id FROM budgets WHERE id=1")).rows[0];
    expect(o).toEqual({ client_id: 1, total_cents: 500000, status: "accepted", empresa_id: 5 });
  });
});
