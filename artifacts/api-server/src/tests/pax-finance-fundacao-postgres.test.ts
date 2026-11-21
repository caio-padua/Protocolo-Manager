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
import { regraVigente } from "../pax-finance/regras";

let iso: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (t: string, p?: any[]) => iso.pool.query(t, p);
const app = express();
app.use(express.json(), (req: any, _r: any, n: any) => { req.log = { error() {}, info() {}, warn() {} }; n(); }, router);
const H = (empresa: number, ator = 1) => ({ "x-collab": String(ator), "x-empresa": String(empresa) });
const A = 5, B = 6;
const regra = (extra: any = {}) => ({ ruleKey: "simples.anexo3.faixa1", tributo: "DAS", esfera: "federal", regime: "simples_nacional", anexo: "III", base: "RBT12",
  aliquotaPct: 6, parcelaDeduzirCents: 0, limiteMinCents: 0, limiteMaxCents: 18000000, vigenciaInicio: "2026-01-01", ...extra });
const FONTE = { fonteOficial: "Receita Federal - Resolucao CGSN (EXEMPLO DE TESTE)", fonteUrl: "https://example.org/fonte-teste", fonteConsultadaEm: "2026-11-01" };

beforeAll(async () => {
  iso = await startIsolatedPostgres();
  state.database = drizzle(iso.pool);
  await q("CREATE TABLE empresas (id integer PRIMARY KEY, nome text, razao_social text, cnpj text, cnae text, regime_tributario text, cidade text, estado text)");
  await q("INSERT INTO empresas VALUES (5,'Clinica A','A LTDA','00.000.000/0001-00','8630-5/03','simples_nacional','Sao Paulo','SP'),(6,'Clinica B','B LTDA','11.111.111/0001-11','8630-5/03','mei','Campinas','SP')");
  for (const s of PAX_FINANCE_DDL) await q(s);
  for (const s of PAX_FINANCE_DDL) await q(s); // idempotente: segunda execucao nao falha
}, 120000);
afterAll(async () => { if (iso) await iso.stop(); }, 60000);

describe("PAX FINANCE - fundacao", () => {
  it("sem sessao de colaborador nao ha acesso", async () => {
    expect((await request(app).get("/pax-finance/rules")).status).toBe(401);
    expect((await request(app).get("/pax-finance/company")).status).toBe(401);
  });

  it("empresa vem so da sessao: referencia o cadastro sem copiar CNPJ", async () => {
    const r = await request(app).get("/pax-finance/company").set(H(A));
    expect(r.body.empresa.id).toBe(A);
    expect(r.body.empresa.cnpj).toBe("00.000.000/0001-00");
    expect(r.body.perfil).toBeNull();
    const cols = (await q("SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'fin_%'")).rows.map((x: any) => x.column_name);
    expect(cols).not.toContain("cnpj");
    expect(cols).not.toContain("cpf");
  });

  describe("regras versionadas", () => {
    let id1 = 0, id2 = 0;
    it("rascunho nasce sem fonte e nao pode ser aprovado antes de enviar", async () => {
      const c = await request(app).post("/pax-finance/rules").set(H(A)).send(regra());
      expect(c.status).toBe(201); id1 = c.body.id; expect(c.body.status).toBe("rascunho"); expect(c.body.version).toBe(1);
      expect((await request(app).post(`/pax-finance/rules/${id1}/approve`).set(H(A))).status).toBe(409);
      expect((await request(app).post("/pax-finance/rules").set(H(A)).send(regra())).status).toBe(409); // ja ha rascunho aberto
    });
    it("aprovacao exige fonte oficial, URL e data de consulta", async () => {
      expect((await request(app).post(`/pax-finance/rules/${id1}/submit`).set(H(A))).status).toBe(200);
      const sem = await request(app).post(`/pax-finance/rules/${id1}/approve`).set(H(A));
      expect(sem.status).toBe(422); expect(sem.body.error).toMatch(/fonte/);
    });
    it("pendente nao se edita; volta a rascunho nao existe: corrige-se criando nova versao depois", async () => {
      expect((await request(app).put(`/pax-finance/rules/${id1}`).set(H(A)).send(regra(FONTE))).status).toBe(409);
      await q("UPDATE fin_tax_rule SET status='rascunho' WHERE id=$1", [id1]); // preparo do cenario: devolve ao rascunho
      expect((await request(app).put(`/pax-finance/rules/${id1}`).set(H(A)).send(regra(FONTE))).status).toBe(200);
      await request(app).post(`/pax-finance/rules/${id1}/submit`).set(H(A));
      const ok = await request(app).post(`/pax-finance/rules/${id1}/approve`).set(H(A, 7));
      expect(ok.status).toBe(200); expect(ok.body.status).toBe("aprovada"); expect(ok.body.aprovadorId).toBe(7);
    });
    it("regra aprovada e imutavel (API e banco) e nao pode ser apagada", async () => {
      expect((await request(app).put(`/pax-finance/rules/${id1}`).set(H(A)).send(regra({ ...FONTE, aliquotaPct: 99 }))).status).toBe(409);
      await expect(q("UPDATE fin_tax_rule SET aliquota_pct=1 WHERE id=$1", [id1])).rejects.toThrow(/imutavel/);
      await expect(q("DELETE FROM fin_tax_rule WHERE id=$1", [id1])).rejects.toThrow(/apagada/);
    });
    it("rascunho/aprovada nao entram em calculo oficial; so a ativa vigente", async () => {
      expect(await regraVigente({ companyId: A, actorId: 1 }, "simples.anexo3.faixa1", "2026-06-01")).toBeNull();
      expect((await request(app).post(`/pax-finance/rules/${id1}/activate`).set(H(A))).status).toBe(200);
      const v = await regraVigente({ companyId: A, actorId: 1 }, "simples.anexo3.faixa1", "2026-06-01");
      expect(v?.version).toBe(1); expect(v?.aliquotaPct).toBe(6);
      expect(await regraVigente({ companyId: A, actorId: 1 }, "simples.anexo3.faixa1", "2025-12-31")).toBeNull();
    });
    it("nova versao substitui a anterior sem sobrescrever o historico", async () => {
      const c = await request(app).post("/pax-finance/rules").set(H(A)).send(regra({ ...FONTE, aliquotaPct: 6.5, vigenciaInicio: "2027-01-01" }));
      expect(c.status).toBe(201); id2 = c.body.id; expect(c.body.version).toBe(2);
      await request(app).post(`/pax-finance/rules/${id2}/submit`).set(H(A));
      await request(app).post(`/pax-finance/rules/${id2}/approve`).set(H(A));
      expect((await request(app).post(`/pax-finance/rules/${id2}/activate`).set(H(A))).status).toBe(200);
      const h = (await request(app).get(`/pax-finance/rules/${id2}`).set(H(A))).body.historico;
      expect(h.map((x: any) => [x.version, x.status])).toEqual([[2, "ativa"], [1, "substituida"]]);
      expect(h[1].vigenciaFim).toBe("2026-12-31");
      expect((await regraVigente({ companyId: A, actorId: 1 }, "simples.anexo3.faixa1", "2026-12-31"))?.version).toBe(1);
      expect((await regraVigente({ companyId: A, actorId: 1 }, "simples.anexo3.faixa1", "2027-01-01"))?.version).toBe(2);
    });
    it("valores invalidos sao recusados (percentual fora de 0-100, centavos negativos ou fracionados, data textual)", async () => {
      for (const extra of [{ aliquotaPct: 120 }, { parcelaDeduzirCents: -1 }, { limiteMaxCents: 10.5 }, { vigenciaInicio: "01/01/2026" }, { fonteUrl: "nao-e-url" }]) {
        expect((await request(app).post("/pax-finance/rules").set(H(A)).send(regra({ ruleKey: "x.invalida", ...extra }))).status).toBe(400);
      }
    });
    it("ISOLAMENTO: a outra empresa nao ve, nao le, nao edita, nao aprova nem ativa", async () => {
      expect((await request(app).get("/pax-finance/rules").set(H(B))).body).toEqual([]);
      for (const [m, u] of [["get", `/pax-finance/rules/${id1}`], ["put", `/pax-finance/rules/${id1}`], ["post", `/pax-finance/rules/${id1}/submit`], ["post", `/pax-finance/rules/${id1}/approve`], ["post", `/pax-finance/rules/${id1}/activate`]] as const) {
        const r = await (request(app) as any)[m](u).set(H(B)).send(regra());
        expect(r.status, `${m} ${u}`).toBe(404);
      }
      expect(await regraVigente({ companyId: B, actorId: 1 }, "simples.anexo3.faixa1", "2027-06-01")).toBeNull();
      // companyId no corpo e ignorado: a regra nasce na empresa da sessao
      const c = await request(app).post("/pax-finance/rules").set(H(B)).send({ ...regra({ ruleKey: "b.propria" }), companyId: A });
      expect(c.status).toBe(201);
      expect((await q("SELECT company_id FROM fin_tax_rule WHERE id=$1", [c.body.id])).rows[0].company_id).toBe(B);
      expect((await request(app).get("/pax-finance/rules").set(H(A))).body.map((x: any) => x.ruleKey)).not.toContain("b.propria");
    });
  });

  describe("perfil fiscal e vinculos societarios", () => {
    it("alterar o perfil devolve a rascunho; validacao e humana e registrada", async () => {
      const p = await request(app).put("/pax-finance/company/profile").set(H(A)).send({ opcaoSimples: "nao_verificada", capitalSocialCents: 50000000, capitalSocialOrigem: "proposta - aguardando documento" });
      expect(p.body.statusValidacao).toBe("rascunho"); expect(p.body.capitalSocialCents).toBe(50000000);
      const v = await request(app).post("/pax-finance/company/profile/validate").set(H(A, 9));
      expect(v.body.statusValidacao).toBe("validado"); expect(v.body.validadoPor).toBe(9);
      const p2 = await request(app).put("/pax-finance/company/profile").set(H(A)).send({ opcaoSimples: "confirmada" });
      expect(p2.body.statusValidacao).toBe("rascunho"); expect(p2.body.validadoPor).toBeNull();
    });
    it("socios: sem CPF, sem exclusao, encerramento por data e isolamento", async () => {
      const c = await request(app).post("/pax-finance/partners").set(H(A)).send({ nome: "Socia Ficticia", papel: "socio_administrador", participacaoBp: 10000, vigenciaInicio: "2026-08-13" });
      expect(c.status).toBe(201); expect(c.body.statusValidacao).toBe("rascunho");
      expect((await request(app).delete(`/pax-finance/partners/${c.body.id}`).set(H(A))).status).toBe(404);
      expect((await request(app).post("/pax-finance/partners").set(H(A)).send({ nome: "X Y", papel: "socio", participacaoBp: 10001 })).status).toBe(400);
      expect((await request(app).post(`/pax-finance/partners/${c.body.id}/end`).set(H(A)).send({ fim: "2026-01-01" })).status).toBe(404);
      expect((await request(app).post(`/pax-finance/partners/${c.body.id}/end`).set(H(A)).send({ fim: "2026-12-31" })).body.vigenciaFim).toBe("2026-12-31");
      expect((await request(app).get("/pax-finance/partners").set(H(B))).body).toEqual([]);
      expect((await request(app).post(`/pax-finance/partners/${c.body.id}/validate`).set(H(B))).status).toBe(404);
      expect((await request(app).put(`/pax-finance/partners/${c.body.id}`).set(H(B)).send({ nome: "Invasor", papel: "socio" })).status).toBe(404);
      expect((await request(app).get("/pax-finance/company").set(H(B))).body.perfil).toBeNull();
    });
  });

  describe("auditoria", () => {
    it("registra cada mutacao por empresa e e imutavel", async () => {
      const a = (await request(app).get("/pax-finance/audit").set(H(A))).body;
      expect(a.map((x: any) => x.action)).toEqual(expect.arrayContaining(["regra.criar_rascunho", "regra.aprovar", "regra.ativar", "perfil.salvar", "perfil.validar", "socio.criar"]));
      const b = (await request(app).get("/pax-finance/audit").set(H(B))).body;
      expect(b.every((x: any) => x.entity === "fin_tax_rule")).toBe(true);
      await expect(q("UPDATE fin_audit_log SET action='x'")).rejects.toThrow(/imutavel/);
      await expect(q("DELETE FROM fin_audit_log")).rejects.toThrow(/imutavel/);
    });
  });

  it("nao toca em payments nem em tabelas clinicas: so tabelas fin_* foram criadas", async () => {
    const t = (await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1")).rows.map((x: any) => x.table_name);
    expect(t).toEqual(["empresas", "fin_audit_log", "fin_company_profile", "fin_partner", "fin_tax_rule"]);
  });
});
