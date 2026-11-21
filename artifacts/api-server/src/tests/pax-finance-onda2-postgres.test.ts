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
import { cnpjValido } from "../pax-finance/entidades";
import { janela, mesesAteMeta, resumir } from "../pax-finance/goals-calc";

let iso: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (t: string, p?: any[]) => iso.pool.query(t, p);
const app = express();
app.use(express.json(), (req: any, _r: any, n: any) => { req.log = { error() {}, info() {}, warn() {} }; n(); }, router);
const H = (empresa: number, ator = 1) => ({ "x-collab": String(ator), "x-empresa": String(empresa) });
const A = 5, B = 6;

beforeAll(async () => {
  iso = await startIsolatedPostgres();
  state.database = drizzle(iso.pool);
  await q("CREATE TABLE empresas (id integer PRIMARY KEY, nome text)");
  await q("INSERT INTO empresas VALUES (5,'A'),(6,'B')");
  await q("CREATE TABLE financial_goals (id serial PRIMARY KEY, period_type text, period_key text, target_amount numeric)");
  await q("INSERT INTO financial_goals (period_type, period_key, target_amount) VALUES ('month','2026-11',1000)");
  await q("CREATE TABLE payments (id serial PRIMARY KEY, empresa_id int, amount numeric, status text, paid_at text, due_date text, created_at text, provider text, asaas_invoice_url text)");
  await q("INSERT INTO payments (empresa_id, amount, status, paid_at, due_date, created_at) VALUES (5, 100.50, 'paid', '2026-11-03', '2026-11-03','2026-11-01'),(5, 50, 'pending', null, '2026-11-20','2026-11-01'),(6, 999, 'paid', '2026-11-04','2026-11-04','2026-11-01')");
  for (const d of [PAX_FINANCE_DDL, PAX_FINANCE_DDL]) for (const x of d) await q(x);
}, 120000);
afterAll(async () => { if (iso) await iso.stop(); }, 60000);

describe("PAX FINANCE onda 2 - calculos puros", () => {
  it("CNPJ valida digitos verificadores", () => { expect(cnpjValido("69.410.873/0001-79")).toBe(true); expect(cnpjValido("69.410.873/0001-78")).toBe(false); });
  it("janela e resumo", () => {
    const j = janela("quarter", "2026-Q4", "2026-11-21")!;
    expect(j.meses).toEqual(["2026-10", "2026-11", "2026-12"]); expect(j.decorridos).toBe(2);
    const r = resumir(3000000, 1000000, j);
    expect(r.pctAtingido).toBe(33.3); expect(r.mediaMensalCents).toBe(500000); expect(r.projecaoFechamentoCents).toBe(1500000); expect(r.diferencaProjecaoCents).toBe(-1500000);
    expect(janela("month", "2026-Q4", "2026-11-21")).toBeNull();
    expect(mesesAteMeta(2000000, 600000)).toBe(4); expect(mesesAteMeta(2000000, 0)).toBeNull();
  });
});

describe("PAX FINANCE onda 2 - API e isolamento", () => {
  it("sem sessao: 401", async () => { for (const u of ["/pax-finance/goals", "/pax-finance/entities", "/pax-finance/ledger"]) expect((await request(app).get(u)).status).toBe(401); });

  it("linha legada de metas fica preservada e sem empresa", async () => {
    expect((await q("SELECT count(*)::int n FROM financial_goals")).rows[0].n).toBe(1);
    expect((await q("SELECT status FROM fin_legacy_goal")).rows[0].status).toBe("legado_nao_atribuido");
    const s = await request(app).get("/pax-finance/goals/summary?periodType=month&periodKey=2026-11").set(H(A));
    expect(s.body.legadoNaoAtribuido).toBe(1); expect(s.body.resumo.metaCents).toBeNull();
  });

  it("resumo usa so os pagamentos da empresa da sessao e separa recebido x aberto", async () => {
    const a = await request(app).get("/pax-finance/goals/summary?periodType=month&periodKey=2026-11").set(H(A));
    expect(a.status).toBe(200); expect(a.body.conceitos.recebidoCents).toBe(10050); expect(a.body.conceitos.abertoCents).toBe(5000);
    expect(a.body.conceitos.emitidoCents).toBeNull();
    const b = await request(app).get("/pax-finance/goals/summary?periodType=month&periodKey=2026-11").set(H(B));
    expect(b.body.conceitos.recebidoCents).toBe(99900);
    expect((await request(app).get("/pax-finance/goals/summary?periodType=month&periodKey=2026-Q4").set(H(A))).status).toBe(400);
  });

  it("meta: upsert e isolamento", async () => {
    const m = await request(app).put("/pax-finance/goals").set(H(A)).send({ tipo: "faturamento", periodType: "month", periodKey: "2026-11", targetCents: 2000000 });
    expect(m.status).toBe(200);
    await request(app).put("/pax-finance/goals").set(H(A)).send({ tipo: "faturamento", periodType: "month", periodKey: "2026-11", targetCents: 3000000 });
    expect((await request(app).get("/pax-finance/goals").set(H(A))).body).toHaveLength(1);
    expect((await request(app).get("/pax-finance/goals").set(H(B))).body).toEqual([]);
    expect((await request(app).delete(`/pax-finance/goals/${m.body.id}`).set(H(B))).status).toBe(404);
    expect((await request(app).put("/pax-finance/goals").set(H(A)).send({ tipo: "faturamento", periodType: "month", periodKey: "2026-11", targetCents: -5 })).status).toBe(400);
  });

  it("credito: nasce aguardando verificacao; versionado; 'verificada' exige fonte", async () => {
    await request(app).post("/pax-finance/credit-lines/seed").set(H(A));
    await request(app).post("/pax-finance/credit-lines/seed").set(H(A));
    const l = (await request(app).get("/pax-finance/credit-lines").set(H(A))).body;
    expect(l).toHaveLength(6); expect(l.every((x: any) => x.status === "aguardando_verificacao" && Object.keys(x.conditions).length === 0)).toBe(true);
    const v = await request(app).put("/pax-finance/credit-lines/pronampe").set(H(A)).send({ nome: "Pronampe", etapa: "simulacao", conditions: { prazo: "teste" } });
    expect(v.body.version).toBe(2); expect(v.body.status).toBe("aguardando_verificacao");
    const ok = await request(app).put("/pax-finance/credit-lines/pronampe").set(H(A)).send({ nome: "Pronampe", etapa: "simulacao", conditions: {}, fonteOficial: "Fonte teste", fonteUrl: "https://example.org/x", verificadaEm: "2026-11-01" });
    expect(ok.body.status).toBe("verificada"); expect(ok.body.version).toBe(3);
    expect((await request(app).get("/pax-finance/credit-lines").set(H(B))).body).toEqual([]);
  });

  it("entidade PADUMANN: rascunho idempotente, sem dado pessoal, isolada", async () => {
    const r1 = await request(app).post("/pax-finance/entities/seed-padumann").set(H(A));
    const r2 = await request(app).post("/pax-finance/entities/seed-padumann").set(H(A));
    expect(r1.body.criado).toBe(true); expect(r2.body.criado).toBe(false);
    const e = (await request(app).get("/pax-finance/entities").set(H(A))).body;
    expect(e).toHaveLength(1);
    expect(e[0].cnpj).toBe("69.410.873/0001-79"); expect(e[0].cnpjValido).toBe(true); expect(e[0].statusValidacao).toBe("rascunho");
    expect(e[0].cnaesSecundarios).toHaveLength(27); expect(e[0].capitalSocialCents).toBe(50000000);
    expect(e[0].regimeEfetivo).toBeNull(); expect(e[0].opcaoSimples).toBe("nao_verificada"); expect(e[0].inscricaoMunicipal).toBeNull();
    const caio = e[0].pessoas.find((p: any) => p.nome.includes("Caio"));
    expect(caio.papel).toBe("responsavel_tecnico"); expect(caio.participacaoBp).toBeNull();
    expect(e[0].pessoas.find((p: any) => p.nome.includes("Dayana")).participacaoBp).toBe(10000);
    expect(JSON.stringify(e)).not.toMatch(/cpf|rg\b/i);
    expect((await request(app).get("/pax-finance/entities").set(H(B))).body).toEqual([]);
    expect((await request(app).post(`/pax-finance/entities/${e[0].id}/validate`).set(H(B))).status).toBe(404);
    const ed = await request(app).put(`/pax-finance/entities/${e[0].id}`).set(H(A)).send({ cnpj: "69.410.873/0001-79", razaoSocial: "PADUMANN CLINICA MEDICA LTDA" });
    expect(ed.body.statusValidacao).toBe("rascunho");
    expect((await request(app).post("/pax-finance/entities").set(H(A)).send({ cnpj: "11.111.111/1111-11", razaoSocial: "Invalida" })).status).toBe(400);
  });

  it("simulador: sem regra aprovada nao inventa numero; com regra ativa calcula com memoria", async () => {
    const body = { rbt12Cents: 10000000, receitaMensalCents: 1000000, folha12Cents: 3000000, anexos: ["III"] };
    const sem = (await request(app).post("/pax-finance/simulate").set(H(A)).send(body)).body;
    expect(sem.cenarios.every((c: any) => c.status === "pendente" && c.impostoMensalCents === null)).toBe(true);
    expect(sem.fatorR.anexo).toBeNull(); expect(sem.fatorR.razaoPct).toBe(30);
    await q("INSERT INTO fin_tax_rule (company_id, rule_key, version, tributo, esfera, regime, anexo, base, aliquota_pct, parcela_deduzir_cents, limite_min_cents, limite_max_cents, fonte_oficial, fonte_url, fonte_consultada_em, vigencia_inicio, status, aprovador_id, aprovado_em) VALUES (5,'teste.faixa',1,'DAS','federal','simples_nacional','III','RBT12',10,100000,0,50000000,'Fonte de TESTE','https://example.org','2026-11-01','2026-01-01','ativa',1,now())");
    await q("INSERT INTO fin_tax_rule (company_id, rule_key, version, tributo, esfera, regime, anexo, base, aliquota_pct, fonte_oficial, fonte_url, fonte_consultada_em, vigencia_inicio, status, aprovador_id, aprovado_em) VALUES (6,'teste.faixa',1,'DAS','federal','simples_nacional','III','RBT12',50,'x','https://example.org','2026-11-01','2026-01-01','ativa',1,now())");
    const com = (await request(app).post("/pax-finance/simulate").set(H(A)).send(body)).body;
    const c = com.cenarios[0];
    expect(c.status).toBe("calculado"); expect(c.aliquotaEfetivaPct).toBe(9); // (10.000.000*10% - 100.000)/10.000.000
    expect(c.impostoMensalCents).toBe(90000); expect(c.memoria.length).toBeGreaterThan(2); expect(c.regrasUsadas[0].ruleKey).toBe("teste.faixa");
    expect(com.aviso).toMatch(/SIMULACAO/);
  });

  it("livro-caixa: leitura isolada, lancamento sem exclusao e realizado exige data", async () => {
    const l = (await request(app).get("/pax-finance/ledger").set(H(A))).body;
    expect(l.pagamentos).toHaveLength(2); expect(l.totais.recebidoPagamentosCents).toBe(10050); expect(l.totais.aReceberCents).toBe(5000);
    expect((await request(app).get("/pax-finance/ledger").set(H(B))).body.pagamentos).toHaveLength(1);
    expect((await request(app).post("/pax-finance/ledger").set(H(A)).send({ tipo: "despesa", descricao: "Teste", valorCents: 1000, competencia: "2026-11-01", status: "realizado" })).status).toBe(400);
    const c = await request(app).post("/pax-finance/ledger").set(H(A)).send({ tipo: "despesa", descricao: "Teste", valorCents: 1000, competencia: "2026-11-01", status: "realizado", dataCaixa: "2026-11-02" });
    expect(c.status).toBe(201);
    expect((await request(app).post(`/pax-finance/ledger/${c.body.id}/cancel`).set(H(B))).status).toBe(404);
    expect((await request(app).post(`/pax-finance/ledger/${c.body.id}/cancel`).set(H(A))).body.status).toBe("cancelado");
    expect((await q("SELECT count(*)::int n FROM fin_ledger_entry")).rows[0].n).toBe(1);
  });
});
