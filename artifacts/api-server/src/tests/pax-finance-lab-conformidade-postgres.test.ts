import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, { get(_t, k) { const v = state.database?.[k]; return typeof v === "function" ? v.bind(state.database) : v; } });
  return { ...schema, db };
});
// Autenticacao simulada por cabecalho (a regra real tem testes proprios); a empresa NUNCA vem do corpo.
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-collab"]) { res.status(401).json({ error: "Não autenticado" }); return; }
    req.collaborator = { professionalId: Number(req.headers["x-collab"]) }; next();
  },
}));
vi.mock("../middleware/messageClinic", () => ({
  requireMessageClinic: (req: any, _r: any, next: any) => { req.messageEmpresaId = Number(req.headers["x-empresa"]); next(); },
}));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: any, _r: any, next: any) => next() }));

import router from "../pax-finance/routes";
import { PAX_FINANCE_DDL } from "../pax-finance/schema";


let iso: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (t: string, p?: any[]) => iso.pool.query(t, p);
const app = express();
app.use(express.json(), (req: any, _r: any, n: any) => { req.log = { error() {}, info() {}, warn() {} }; n(); }, router);
// Colaborador 1 (empresa 5) tem vinculo com a empresa 7; ninguem tem vinculo com a 6.
const H = (empresa: number, extra: Record<string, string> = {}) => ({ "x-collab": "1", "x-empresa": String(empresa), ...extra });
const A = 5, B = 6, C = 7;

beforeAll(async () => {
  iso = await startIsolatedPostgres();
  state.database = drizzle(iso.pool);
  await q("CREATE TABLE empresas (id integer PRIMARY KEY, nome text, cnpj text, razao_social text, ativa boolean DEFAULT true, status text DEFAULT 'ATIVO')");
  await q("INSERT INTO empresas (id,nome,cnpj) VALUES (5,'A',NULL),(6,'B',NULL),(7,'Instituto Padumann Clínica Médica','69.410.873/0001-79')");
  await q("CREATE TABLE professional_empresas (id serial PRIMARY KEY, professional_id int, empresa_id int, ordem int)");
  await q("INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (1,7,2)");
  await q("CREATE TABLE professionals (id int PRIMARY KEY, empresa_id int)");
  await q("INSERT INTO professionals VALUES (1,5)");
  await q("CREATE TABLE financial_goals (id serial PRIMARY KEY)");
  await q("CREATE TABLE payments (id serial PRIMARY KEY, empresa_id int, amount numeric, status text, paid_at text, due_date text, created_at text, provider text, asaas_invoice_url text)");
  await q("INSERT INTO payments (empresa_id, amount, status, paid_at, due_date, created_at) VALUES (5, 100, 'paid', '2026-03-03','2026-03-03','2026-03-01')");
  for (const x of PAX_FINANCE_DDL) await q(x);
}, 120000);
afterAll(async () => { if (iso) await iso.stop(); }, 60000);


const parte = { tipo: "beneficiario_final", nome: "Dayana", tipoPessoa: "fisica", via: "direta", fonteDocumento: "Contrato social" };
let entA = 0, entC = 0, parteA = 0;

describe("PAX FINANCE laboratório e conformidade: isolamento e vazamento", () => {
  it("prepara cadastros nas empresas 5 e 7", async () => {
    entA = Number((await q("INSERT INTO fin_entity (company_id,cnpj,razao_social) VALUES (5,'11.222.333/0001-81','EMPRESA A') RETURNING id")).rows[0].id);
    entC = Number((await q("INSERT INTO fin_entity (company_id,cnpj,razao_social) VALUES (7,'69.410.873/0001-79','PADUMANN') RETURNING id")).rows[0].id);
    await q("INSERT INTO fin_partner (company_id, entity_id, nome, papel, participacao_bp) VALUES (5,$1,'Dayana','socio_administrador',10000)", [entA]);
  });
  it("laboratório: sem salvar devolve padrão com selo e is_simulation; nada é gravado só por ler", async () => {
    const r = await request(app).get("/pax-finance/lab").set(H(A));
    expect(r.status).toBe(200); expect(r.body.isSimulation).toBe(true); expect(r.body.salvo).toBe(false); expect(r.body.meses).toHaveLength(24);
    expect(r.body.selo).toMatch(/NÃO REPRESENTA FATURAMENTO REAL/);
    expect(Number((await q("SELECT count(*) c FROM fin_sim_scenario")).rows[0].c)).toBe(0);
  });
  it("laboratório: salvar na empresa 5 não aparece na 7; limpar só apaga a própria; payments intocado", async () => {
    const g = (await request(app).get("/pax-finance/lab").set(H(A))).body.premissas;
    expect((await request(app).put("/pax-finance/lab").set(H(A)).send({ premissas: { ...g, crescimentoMensalPct: 9 }, overrides: {} })).status).toBe(200);
    expect((await request(app).get("/pax-finance/lab").set(H(A))).body.premissas.crescimentoMensalPct).toBe(9);
    const outra = (await request(app).get("/pax-finance/lab").set(H(A, { "x-fin-company": "7" }))).body;
    expect(outra.salvo).toBe(false); expect(outra.premissas.crescimentoMensalPct).toBe(6);
    expect((await request(app).put("/pax-finance/lab").set(H(A, { "x-fin-company": "7" })).send({ premissas: g, overrides: {} })).status).toBe(200);
    expect((await request(app).delete("/pax-finance/lab").set(H(A))).body.apagados).toBe(1);
    expect(Number((await q("SELECT count(*) c FROM fin_sim_scenario WHERE company_id=7")).rows[0].c)).toBe(1);
    expect(Number((await q("SELECT count(*) c FROM payments")).rows[0].c)).toBe(1);
    expect(Number((await q("SELECT count(*) c FROM fin_ledger_entry")).rows[0].c)).toBe(0);
  });
  it("laboratório: banco recusa is_simulation=false e empresa autorizada inexistente 403", async () => {
    await expect(q("INSERT INTO fin_sim_scenario (company_id, is_simulation, premissas) VALUES (5,false,'{}')")).rejects.toThrow();
    expect((await request(app).get("/pax-finance/lab").set(H(A, { "x-fin-company": "6" }))).status).toBe(403);
  });
  it("conformidade: sem beneficiário final bloqueia; cria, valida e libera", async () => {
    const r0 = await request(app).get(`/pax-finance/entities/${entA}/compliance`).set(H(A));
    expect(r0.status).toBe(200); expect(r0.body.parecer.bloqueiaRoteador).toBe(true);
    const c = await request(app).post(`/pax-finance/entities/${entA}/compliance/parties`).set(H(A)).send(parte);
    expect(c.status).toBe(201); expect(c.body.statusValidacao).toBe("rascunho"); parteA = c.body.id;
    expect((await request(app).get(`/pax-finance/entities/${entA}/compliance`).set(H(A))).body.parecer.bloqueiaRoteador).toBe(true);
    expect((await request(app).post(`/pax-finance/compliance/parties/${parteA}/validate`).set(H(A))).body.statusValidacao).toBe("validado");
    expect((await request(app).get(`/pax-finance/entities/${entA}/compliance`).set(H(A))).body.parecer.bloqueiaRoteador).toBe(false);
  });
  it("conformidade: outra empresa não lê, não cria, não edita, não valida e não encerra", async () => {
    const o = H(A, { "x-fin-company": "7" });
    expect((await request(app).get(`/pax-finance/entities/${entA}/compliance`).set(o)).status).toBe(404);
    expect((await request(app).post(`/pax-finance/entities/${entA}/compliance/parties`).set(o).send(parte)).status).toBe(404);
    expect((await request(app).put(`/pax-finance/compliance/parties/${parteA}`).set(o).send(parte)).status).toBe(404);
    expect((await request(app).post(`/pax-finance/compliance/parties/${parteA}/validate`).set(o)).status).toBe(404);
    expect((await request(app).post(`/pax-finance/compliance/parties/${parteA}/end`).set(o)).status).toBe(404);
    expect((await request(app).get(`/pax-finance/entities/${entC}/compliance`).set(H(A))).status).toBe(404);
  });
  it("conformidade: validação de entrada e validar exige documento", async () => {
    expect((await request(app).post(`/pax-finance/entities/${entA}/compliance/parties`).set(H(A)).send({ ...parte, nome: "Maria 123.456.789-09" })).status).toBe(400);
    const s = await request(app).post(`/pax-finance/entities/${entA}/compliance/parties`).set(H(A)).send({ tipo: "parte_relacionada", nome: "Fulana", tipoPessoa: "fisica", via: "familiar" });
    expect((await request(app).post(`/pax-finance/compliance/parties/${s.body.id}/validate`).set(H(A))).status).toBe(409);
  });
  it("conformidade: editar volta a rascunho; encerrar mantém a linha (nunca apaga) e audita", async () => {
    const e = await request(app).put(`/pax-finance/compliance/parties/${parteA}`).set(H(A)).send({ ...parte, observacao: "ajuste" });
    expect(e.body.statusValidacao).toBe("rascunho");
    expect((await request(app).post(`/pax-finance/compliance/parties/${parteA}/end`).set(H(A))).body.encerradaEm).toBeTruthy();
    expect(Number((await q("SELECT count(*) c FROM fin_related_party WHERE id=$1", [parteA])).rows[0].c)).toBe(1);
    expect((await request(app).put(`/pax-finance/compliance/parties/${parteA}`).set(H(A)).send(parte)).status).toBe(409);
    const a = await q("SELECT action FROM fin_audit_log WHERE company_id=5 AND action LIKE 'conformidade.%'");
    expect(a.rows.length).toBeGreaterThanOrEqual(4);
  });
});
