/** PaxCare em PostgreSQL descartavel: previa nao acessa cofre/contrato, planos, aceite, duplicidade, concorrencia, franquia. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const auth = vi.hoisted(() => ({ owner: true }));
vi.mock("../lib/clinical-access", () => ({ isPlatformOwner: vi.fn(async () => auth.owner) }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, _res: any, next: any) => { req.collaborator = { professionalId: 7 }; next(); },
}));
vi.mock("../middleware/messageClinic.js", () => ({ requireMessageClinic: (req: any, _r: any, n: any) => { req.messageEmpresaId = 1; n(); } }));
vi.mock("../lib/objectStorage.js", () => ({ ObjectStorageService: class { async savePrivateObject() { return ""; } async readPrivateObject() { return Buffer.from(""); } } }));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "x".repeat(32);
let app: express.Express; let pool: any; let tok: (id: number, o?: { preview?: boolean }) => string;

beforeAll(async () => {
  const db = await import("@workspace/db");
  pool = db.pool;
  await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int)`);
  await pool.query(`CREATE TABLE empresas (id serial primary key, nome text, ativa boolean default true, status text default 'ATIVO', tipo text default 'clinic', cidade text, estado text)`);
  await pool.query(`CREATE TABLE exam_results (id serial primary key, client_id int, collection_date date)`);
  await pool.query(`INSERT INTO clients (name, empresa_id) VALUES ('A',1),('B',1)`);
  await pool.query(`INSERT INTO empresas (nome) VALUES ('Clinica 1')`);
  await (await import("../lib/ensure-paxcare")).ensurePaxcareTables();
  await (await import("../lib/paxcare-planos")).ensurePaxcarePlanosTables();
  tok = (await import("../lib/portal-token")).createPortalToken;
  app = express(); app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
  app.use("/api", (await import("../routes/paxcare")).default);
  app.use("/api", (await import("../routes/paxcare-planos")).default);
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

const H = (id: number) => ({ Authorization: `Bearer ${tok(id)}` });
const P = (id: number) => ({ Authorization: `Bearer ${tok(id, { preview: true })}` });

describe("previa do administrador nao e o paciente", () => {
  it("nao le cofre, nao altera consentimento, nao contrata", async () => {
    expect((await request(app).get("/api/area-paciente/paxcare/cofre").set(P(1))).status).toBe(401);
    expect((await request(app).get("/api/area-paciente/paxcare/clinicas").set(P(1))).status).toBe(401);
    expect((await request(app).post("/api/area-paciente/paxcare/vinculos").set(P(1)).send({ empresaId: 1, compartilha: { historico: true, exames: true, documentos: true } })).status).toBe(401);
    expect((await request(app).patch("/api/area-paciente/paxcare/vinculos/1").set(P(1)).send({ exames: true })).status).toBe(401);
    expect((await request(app).delete("/api/area-paciente/paxcare/vinculos/1").set(P(1))).status).toBe(401);
    expect((await request(app).delete("/api/area-paciente/paxcare/cofre/1").set(P(1))).status).toBe(401);
    expect((await request(app).get("/api/area-paciente/paxcare/cofre/1/arquivo").set(P(1))).status).toBe(401);
    expect((await request(app).post("/api/area-paciente/paxcare/assinatura").set(P(1)).send({ planoId: 1, aceite: true, termoHash: "a".repeat(64) })).status).toBe(401);
    expect((await request(app).get("/api/area-paciente/paxcare/cofre").set(H(1))).status).toBe(200);
  });
  it("previa nao devolve acesso depois de revogar vinculo", async () => {
    const v = await request(app).post("/api/area-paciente/paxcare/vinculos").set(H(1)).send({ empresaId: 1, compartilha: { historico: true, exames: true, documentos: false } });
    expect(v.status).toBe(201);
    expect((await request(app).patch(`/api/area-paciente/paxcare/vinculos/${v.body.id}`).set(H(1)).send({ historico: false })).status).toBe(200);
    expect((await request(app).delete(`/api/area-paciente/paxcare/vinculos/${v.body.id}`).set(H(1))).status).toBe(200);
    expect((await request(app).patch(`/api/area-paciente/paxcare/vinculos/${v.body.id}`).set(P(1)).send({ historico: true })).status).toBe(401);
    const r = await pool.query(`SELECT status, comp_historico, comp_exames FROM paxcare_vinculos WHERE id=$1`, [v.body.id]);
    expect(r.rows[0]).toMatchObject({ status: "revogado", comp_historico: false, comp_exames: false });
  });
  it("alteracoes simultaneas de categorias diferentes nao restauram permissao", async () => {
    const v = await request(app).post("/api/area-paciente/paxcare/vinculos").set(H(2)).send({ empresaId: 1, compartilha: { historico: true, exames: true, documentos: true } });
    await Promise.all([
      request(app).patch(`/api/area-paciente/paxcare/vinculos/${v.body.id}`).set(H(2)).send({ historico: false }),
      request(app).patch(`/api/area-paciente/paxcare/vinculos/${v.body.id}`).set(H(2)).send({ exames: false }),
      request(app).patch(`/api/area-paciente/paxcare/vinculos/${v.body.id}`).set(H(2)).send({ documentos: false }),
    ]);
    const r = await pool.query(`SELECT comp_historico, comp_exames, comp_documentos FROM paxcare_vinculos WHERE id=$1`, [v.body.id]);
    expect(r.rows[0]).toEqual({ comp_historico: false, comp_exames: false, comp_documentos: false });
    expect((await request(app).patch(`/api/area-paciente/paxcare/vinculos/${v.body.id}`).set(H(2)).send({})).status).toBe(400);
  });
});

describe("planos PaxCare", () => {
  let planoId: number; let termoHash: string;
  it("catalogo so para o titular e nasce vazio", async () => {
    auth.owner = false;
    expect((await request(app).get("/api/paxcare/planos")).status).toBe(403);
    auth.owner = true;
    expect((await request(app).get("/api/paxcare/planos")).body).toEqual([]);
    const c = await request(app).post("/api/paxcare/planos").send({ nome: "Teste Gratis" });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ status: "rascunho", precoCentavos: null, franquiaQtd: null, precoExcedenteCentavos: null, termoAceite: null });
    planoId = c.body.id;
  });
  it("rascunho nao aparece ao paciente e nao ativa incompleto", async () => {
    expect((await request(app).get("/api/area-paciente/paxcare/planos").set(H(1))).body.planos).toEqual([]);
    expect((await request(app).post(`/api/paxcare/planos/${planoId}/ativar`)).status).toBe(409);
    expect((await request(app).patch(`/api/paxcare/planos/${planoId}`).send({ gratuito: true, termoAceite: "Termo X", franquiaQtd: 2, franquiaUnidade: "pedido", franquiaPeriodo: "mensal", precoExcedenteCentavos: 1000, descontoExcedentePct: 20, beneficios: ["A"] })).status).toBe(200);
    expect((await request(app).post(`/api/paxcare/planos/${planoId}/ativar`)).body.status).toBe("ativo");
  });
  it("contratar exige aceite explicito e o termo vigente", async () => {
    const o = (await request(app).get("/api/area-paciente/paxcare/planos").set(H(1))).body;
    expect(o.planos).toHaveLength(1); expect(o.aviso).toMatch(/PAM/);
    termoHash = o.planos[0].termoHash;
    expect((await request(app).post("/api/area-paciente/paxcare/assinatura").set(H(1)).send({ planoId, termoHash })).status).toBe(400);
    expect((await request(app).post("/api/area-paciente/paxcare/assinatura").set(H(1)).send({ planoId, aceite: false, termoHash })).status).toBe(400);
    expect((await request(app).post("/api/area-paciente/paxcare/assinatura").set(H(1)).send({ planoId, aceite: true, termoHash: "b".repeat(64) })).status).toBe(409);
  });
  it("oferta alterada depois de exibida (so preco, termo igual) invalida o aceite", async () => {
    const c = (await request(app).post("/api/paxcare/planos").send({ nome: "Mutavel" })).body.id;
    await request(app).patch(`/api/paxcare/planos/${c}`).send({ gratuito: true, termoAceite: "Mesmo termo" });
    await request(app).post(`/api/paxcare/planos/${c}/ativar`);
    const h = (await request(app).get("/api/area-paciente/paxcare/planos").set(H(2))).body.planos.find((p: any) => p.id === c).termoHash;
    await request(app).patch(`/api/paxcare/planos/${c}`).send({ gratuito: false, precoCentavos: 9900, periodicidade: "mensal" });
    expect((await request(app).post("/api/area-paciente/paxcare/assinatura").set(H(2)).send({ planoId: c, aceite: true, termoHash: h })).status).toBe(409);
    expect((await pool.query(`SELECT 1 FROM paxcare_assinaturas WHERE client_id=2`)).rowCount).toBe(0);
  });
  it("contratacao simultanea gera uma unica assinatura; sem cobranca no plano gratuito", async () => {
    const rs = await Promise.all([1, 2, 3, 4].map(() => request(app).post("/api/area-paciente/paxcare/assinatura").set(H(1)).send({ planoId, aceite: true, termoHash })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    const r = await pool.query(`SELECT cobranca_status, ambiente FROM paxcare_assinaturas WHERE client_id=1`);
    expect(r.rows).toEqual([{ cobranca_status: "sem_cobranca", ambiente: "teste" }]);
  });
  it("PAM da clinica nao e criado pela assinatura", async () => {
    const t = await pool.query(`SELECT to_regclass('client_member_beneficios') AS t`);
    expect(t.rows[0].t).toBeNull();
  });
  it("outro plano com assinatura ativa e recusado; paciente B isolado", async () => {
    const c2 = (await request(app).post("/api/paxcare/planos").send({ nome: "Pago" })).body.id;
    await request(app).patch(`/api/paxcare/planos/${c2}`).send({ precoCentavos: 5000, periodicidade: "mensal", termoAceite: "Termo Y" });
    await request(app).post(`/api/paxcare/planos/${c2}/ativar`);
    const h = (await request(app).get("/api/area-paciente/paxcare/planos").set(H(1))).body.planos.find((p: any) => p.id === c2).termoHash;
    expect((await request(app).post("/api/area-paciente/paxcare/assinatura").set(H(1)).send({ planoId: c2, aceite: true, termoHash: h })).status).toBe(409);
    expect((await request(app).get("/api/area-paciente/paxcare/assinatura").set(H(2))).body.assinatura).toBeNull();
    const pago = await request(app).post("/api/area-paciente/paxcare/assinatura").set(H(2)).send({ planoId: c2, aceite: true, termoHash: h });
    expect(pago.status).toBe(201);
    expect((await pool.query(`SELECT cobranca_status FROM paxcare_assinaturas WHERE client_id=2`)).rows[0].cobranca_status).toBe("pendente_integracao");
  });
  it("preco do plano muda mas o contrato guarda o snapshot; encerrar nao cancela contratos", async () => {
    await request(app).patch(`/api/paxcare/planos/${planoId}`).send({ nome: "Renomeado" });
    expect((await request(app).get("/api/area-paciente/paxcare/assinatura").set(H(1))).body.assinatura.plano.nome).toBe("Teste Gratis");
    expect((await request(app).post(`/api/paxcare/planos/${planoId}/encerrar`)).body.status).toBe("encerrado");
    expect((await request(app).get("/api/area-paciente/paxcare/assinatura").set(H(1))).body.assinatura).not.toBeNull();
    expect((await request(app).patch(`/api/paxcare/planos/${planoId}`).send({ nome: "x1" })).status).toBe(409);
  });
  it("franquia: respeita limite, idempotente, concorrente, desconto sobre excedente e sem preco recusa", async () => {
    const { registrarConsumo } = await import("../lib/paxcare-planos");
    // cliente 1: franquia 2, excedente 1000 com 20% de desconto
    expect(await registrarConsumo(1, 1, "k1")).toMatchObject({ ok: true, dentro: 1, excedente: 0 });
    expect(await registrarConsumo(1, 1, "k1")).toMatchObject({ ok: true, repetido: true });
    const rs = await Promise.all([2, 3, 4, 5].map((i) => registrarConsumo(1, 1, "k" + i)));
    const dentro = rs.reduce((s, r: any) => s + r.dentro, 0);
    const exc = rs.reduce((s, r: any) => s + r.excedente, 0);
    expect(dentro).toBe(1); expect(exc).toBe(3); // total 5 = 2 na franquia + 3 excedentes
    const tot = await pool.query(`SELECT SUM(valor_excedente_centavos)::int AS v FROM paxcare_consumo`);
    expect(tot.rows[0].v).toBe(3 * 800);
    // cliente 2 (sem franquia): nao mede
    expect(await registrarConsumo(2, 5, "z")).toMatchObject({ ok: true, dentro: 5, excedente: 0 });
    expect(await registrarConsumo(999, 1, "q")).toEqual({ ok: false, motivo: "SEM_ASSINATURA" });
  });
  it("excedente sem preco cadastrado e recusado (nunca inventa valor)", async () => {
    const { calcularConsumo } = await import("../lib/paxcare-planos");
    expect(calcularConsumo({ franquia_qtd: 1, preco_excedente_centavos: null, desconto_excedente_pct: null }, 1, 1)).toEqual({ ok: false, motivo: "SEM_EXCEDENTE_PRECIFICADO" });
  });
});
