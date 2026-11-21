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

describe("PAX FINANCE onda 3 - seletor de empresa e tenant", () => {
  it("sem sessao: 401", async () => { expect((await request(app).get("/pax-finance/companies")).status).toBe(401); });
  it("lista so empresas autorizadas e mostra fantasia, razao e CNPJ", async () => {
    await q("INSERT INTO fin_entity (company_id,cnpj,razao_social,nome_fantasia_preferencial,aliases) VALUES (7,'69.410.873/0001-79','PADUMANN CLÍNICA MÉDICA LTDA','Instituto Padumann Clínica Médica','[\"Padumann\"]')");
    const r = await request(app).get("/pax-finance/companies").set(H(A));
    expect(r.status).toBe(200);
    const ids = r.body.empresas.map((e: any) => e.id).sort();
    expect(ids).toEqual([5, 7]); expect(ids).not.toContain(B);
    const p = r.body.empresas.find((e: any) => e.id === C);
    expect(p.nomeFantasia).toBe("Instituto Padumann Clínica Médica"); expect(p.razaoSocial).toContain("PADUMANN"); expect(p.cnpj).toBe("69.410.873/0001-79");
  });
  it("cabecalho x-fin-company: autorizada troca; nao autorizada 403; invalida 400", async () => {
    expect((await request(app).get("/pax-finance/scenario").set(H(A, { "x-fin-company": "7" }))).status).toBe(200);
    expect((await request(app).get("/pax-finance/scenario").set(H(A, { "x-fin-company": "6" }))).status).toBe(403);
    expect((await request(app).get("/pax-finance/scenario").set(H(A, { "x-fin-company": "abc" }))).status).toBe(400);
  });
  it("PADUMANN so carrega na propria empresa", async () => {
    expect((await request(app).post("/pax-finance/entities/seed-padumann").set(H(A))).status).toBe(409);
    expect((await q("SELECT count(*)::int n FROM fin_entity WHERE company_id=5")).rows[0].n).toBe(0);
  });
});

describe("PAX FINANCE onda 3 - camada DEMO", () => {
  it("semente da PADUMANN: totais por formula 348.800 / 458.800 e isolamento", async () => {
    const h = H(A, { "x-fin-company": "7" });
    expect((await request(app).post("/pax-finance/scenario/demo/seed?ano=2026").set(h)).body.criados).toBe(12);
    expect((await request(app).post("/pax-finance/scenario/demo/seed?ano=2026").set(h)).body.criados).toBe(0);
    const r = await request(app).get("/pax-finance/scenario?ano=2026").set(h);
    expect(r.body.totais.simulacaoCents).toBe(34_880_000); expect(r.body.totais.projecaoCents).toBe(11_000_000); expect(r.body.totais.projecaoAnualIlustrativaCents).toBe(45_880_000);
    expect(r.body.rotulo).toContain("NÃO SÃO FATURAMENTO REAL");
    expect(r.body.totais.realComprovadoCents).toBeNull(); expect(r.body.meses[0].realRotulo).toBe("Sem dados importados");
    const outra = await request(app).get("/pax-finance/scenario?ano=2026").set(H(A));
    expect(outra.body.temDemo).toBe(false); expect(outra.body.totais.simulacaoCents).toBeNull();
    expect(outra.body.meses[2].realComprovadoCents).toBe(10000);
  });
  it("DEMO nunca escreve em payments nem no livro-caixa; edicao e exclusao funcionam", async () => {
    const h = H(A, { "x-fin-company": "7" });
    expect((await q("SELECT count(*)::int n FROM payments WHERE empresa_id=7")).rows[0].n).toBe(0);
    expect((await q("SELECT count(*)::int n FROM fin_ledger_entry")).rows[0].n).toBe(0);
    expect((await request(app).put("/pax-finance/scenario/1").set(h).send({ ano: 2026, valorCents: 100, natureza: "simulacao" })).status).toBe(200);
    expect((await request(app).delete("/pax-finance/scenario/1?ano=2026").set(h)).body.apagados).toBe(1);
    expect((await request(app).put("/pax-finance/scenario/13").set(h).send({ ano: 2026, valorCents: 1, natureza: "simulacao" })).status).toBe(400);
  });
});

describe("PAX FINANCE onda 3 - credito e agentes", () => {
  it("sem regra verificada: estimativa ilustrativa, sem recomendacao firme e aviso de aprovacao", async () => {
    const h = H(A);
    await request(app).post("/pax-finance/credit-lines/seed").set(h);
    const r = await request(app).post("/pax-finance/credit/compare").set(h).send({ valorDesejadoCents: 10_000_000, finalidade: "capital_giro", prazoMeses: 36, cenarioMensalCents: 3_000_000 });
    expect(r.status).toBe(200); expect(r.body.linhas.length).toBe(8); expect(r.body.recomendacaoFirme).toBe(false);
    expect(r.body.aviso).toMatch(/não garante aprovação/);
    for (const l of r.body.linhas) { expect(l.avisoRegra).toBe("REGRA DO PROGRAMA A VALIDAR"); expect(l.statusFonte).toBe("aguardando_validacao_atual"); }
    const p = r.body.linhas[0];
    expect(p.metaMensalCents).toBe(Math.ceil(Math.ceil((10_000_000 * 100) / 30) / 12));
    expect(p.plano.length).toBeGreaterThan(0);
  });
  it("agentes: tres inteligencias nao configuradas e acionar devolve 409 sem executar", async () => {
    const a = await request(app).get("/pax-finance/agents").set(H(A));
    expect(a.body.map((x: any) => x.ligado)).toEqual([false, false, false]);
    expect(a.body.every((x: any) => x.estado !== "ligado")).toBe(true);
    const t = await request(app).post("/pax-finance/agents/maia/toggle").set(H(A));
    expect(t.status).toBe(409); expect(t.body.error).toMatch(/Nenhuma execução/);
    const f = await request(app).put("/pax-finance/config/flags").set(H(A)).send({ flags: { ia_maia: true, cenario_demo: false } });
    expect(f.body.flags.ia_maia).toBe(false); expect(f.body.flags.cenario_demo).toBe(false);
  });
});
