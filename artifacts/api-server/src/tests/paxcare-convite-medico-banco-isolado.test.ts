/** Convite de médico pelo cliente + contato da vitrine, em PostgreSQL descartável (dados sintéticos). */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const auth = vi.hoisted(() => ({ prof: 7, owner: false }));
vi.mock("../lib/clinical-access", () => ({ isPlatformOwner: vi.fn(async () => auth.owner) }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, _res: any, next: any) => { req.collaborator = { professionalId: auth.prof }; next(); },
}));
vi.mock("../lib/professional-empresas", () => ({
  empresaIdsDoProfissional: vi.fn(async (id: number) => new Set(id === 7 ? [1] : [])),
}));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "x".repeat(32);
let app: express.Express; let pool: any; let tok: (id: number) => string; let zerar: () => void;

beforeAll(async () => {
  const db = await import("@workspace/db");
  pool = db.pool;
  await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int)`);
  await pool.query(`CREATE TABLE empresas (id serial primary key, nome text, ativa boolean default true, status text default 'ATIVO', tipo text default 'clinic')`);
  await pool.query(`CREATE TABLE professionals (id serial primary key, email text, secondary_email text, registration_number text, crm text)`);
  await pool.query(`CREATE TABLE paxcare_cofre_itens (id serial primary key, client_id int, tipo text, titulo text, data_ref date, notas text, arquivo text, criado_em timestamptz default now(), removido_em timestamptz)`);
  await pool.query(`INSERT INTO clients (name) VALUES ('Ana Teste'),('Beto Teste')`);
  await pool.query(`INSERT INTO empresas (nome) VALUES ('Clinica 1'),('Clinica 2')`);
  await pool.query(`INSERT INTO professionals (id,email,registration_number) VALUES (7,'dr@teste.com','123456'),(8,'outro@teste.com','999999')`);
  await pool.query(`INSERT INTO paxcare_cofre_itens (client_id,tipo,titulo,notas) VALUES (1,'historico','Hist A','x'),(1,'exame_externo','Exame A','y'),(1,'documento','Doc A','z'),(2,'historico','Hist B','w')`);
  tok = (await import("../lib/portal-token")).createPortalToken;
  zerar = (await import("../routes/paxcare-convite-medico")).zerarLimitesConviteMedico;
  app = express(); app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
  app.use("/api", (await import("../routes/paxcare-convite-medico")).default);
  app.use("/api", (await import("../routes/vitrine-contatos")).default);
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

const H = (id: number) => ({ Authorization: `Bearer ${tok(id)}` });
let TH = "";
const corpo = (extra: object = {}) => ({ consentimentoHash: TH, medicoNome: "Dr Teste", medicoEmail: "DR@teste.com", conselho: "123456", uf: "sp", compartilha: { historico: true, exames: false, documentos: false }, ...extra });
async function criar(cliente = 1, extra: object = {}) {
  const r = await request(app).post("/api/area-paciente/paxcare/convites-medico").set(H(cliente)).send(corpo(extra));
  return r;
}

describe("convite de médico", () => {
  it("termo é servido e consentimento é obrigatório e gravado", async () => {
    const t = await request(app).get("/api/area-paciente/paxcare/convites-medico/termo").set(H(1));
    expect(t.status).toBe(200); TH = t.body.hash;
    expect((await criar(1, { consentimentoHash: "errado" })).status).toBe(400);
    const r = await criar(); expect(r.status).toBe(201);
    const l = await pool.query(`SELECT consentimento_em IS NOT NULL AS em, consentimento_hash FROM paxcare_convites_medico WHERE id=$1`, [r.body.id]);
    expect(l.rows[0]).toEqual({ em: true, consentimento_hash: TH });
  });
  it("exige sessão do cliente e escopo mínimo", async () => {
    expect((await request(app).post("/api/area-paciente/paxcare/convites-medico").send(corpo())).status).toBe(401);
    expect((await criar(1, { compartilha: { historico: false, exames: false, documentos: false } })).status).toBe(400);
    expect((await criar(1, { empresaId: 99 })).status).toBe(404);
  });
  it("guarda só o hash do token e não devolve token na lista", async () => {
    const r = await criar();
    expect(r.status).toBe(201);
    const linhas = await pool.query(`SELECT token_hash FROM paxcare_convites_medico WHERE id=$1`, [r.body.id]);
    expect(linhas.rows[0].token_hash).not.toContain(r.body.token);
    const l = await request(app).get("/api/area-paciente/paxcare/convites-medico").set(H(1));
    expect(JSON.stringify(l.body)).not.toContain(r.body.token);
    expect(l.body[0].email).toBe("d***@teste.com");
  });
  it("fluxo completo: aceita, lê só o escopo, cliente revoga e acesso cai na hora", async () => {
    auth.prof = 7;
    const c = await criar();
    const ver = await request(app).get(`/api/collaborator/paxcare/convites/${c.body.token}`);
    expect(ver.status).toBe(200);
    expect(ver.body.cliente).toBe("Ana");
    expect((await request(app).post(`/api/collaborator/paxcare/convites/${c.body.token}/aceitar`)).status).toBe(200);
    expect((await request(app).post(`/api/collaborator/paxcare/convites/${c.body.token}/aceitar`)).status).toBe(409);
    const cofre = await request(app).get(`/api/collaborator/paxcare/convites-aceitos/${c.body.id}/cofre`);
    expect(cofre.status).toBe(200);
    expect(cofre.body.itens.map((i: any) => i.titulo)).toEqual(["Hist A"]);
    expect((await request(app).delete(`/api/area-paciente/paxcare/convites-medico/${c.body.id}`).set(H(2))).status).toBe(404);
    expect((await request(app).delete(`/api/area-paciente/paxcare/convites-medico/${c.body.id}`).set(H(1))).status).toBe(200);
    expect((await request(app).get(`/api/collaborator/paxcare/convites-aceitos/${c.body.id}/cofre`)).status).toBe(403);
    const h = await pool.query(`SELECT acao FROM paxcare_convites_medico_hist WHERE convite_id=$1 ORDER BY id`, [c.body.id]);
    expect(h.rows.map((x: any) => x.acao)).toEqual(["criou", "visualizou", "aceitou", "leu_cofre", "revogou"]);
  });
  it("médico com e-mail/conselho diferente é negado, e cliente B não lê o cofre de A", async () => {
    const c = await criar();
    auth.prof = 8;
    expect((await request(app).get(`/api/collaborator/paxcare/convites/${c.body.token}`)).status).toBe(403);
    expect((await request(app).post(`/api/collaborator/paxcare/convites/${c.body.token}/aceitar`)).status).toBe(403);
    expect((await request(app).get(`/api/collaborator/paxcare/convites/token-inexistente-token-inexistente-token-xx`)).status).toBe(403);
    auth.prof = 7;
    const st = await pool.query(`SELECT status FROM paxcare_convites_medico WHERE id=$1`, [c.body.id]);
    expect(st.rows[0].status).toBe("pendente");
  });
  it("convite expirado não aceita; convite de clínica exige vínculo do médico", async () => {
    const c = await criar();
    await pool.query(`UPDATE paxcare_convites_medico SET expira_em = NOW() - interval '1 minute' WHERE id=$1`, [c.body.id]);
    expect((await request(app).post(`/api/collaborator/paxcare/convites/${c.body.token}/aceitar`)).status).toBe(409);
    const outra = await criar(1, { empresaId: 2 });
    expect((await request(app).get(`/api/collaborator/paxcare/convites/${outra.body.token}`)).status).toBe(403);
    const propria = await criar(1, { empresaId: 1 });
    expect((await request(app).get(`/api/collaborator/paxcare/convites/${propria.body.token}`)).status).toBe(200);
  });
  it("acesso com prazo vencido deixa de ler", async () => {
    const c = await criar();
    await request(app).post(`/api/collaborator/paxcare/convites/${c.body.token}/aceitar`);
    await pool.query(`UPDATE paxcare_convites_medico SET acesso_ate = NOW() - interval '1 second' WHERE id=$1`, [c.body.id]);
    expect((await request(app).get(`/api/collaborator/paxcare/convites-aceitos/${c.body.id}/cofre`)).status).toBe(403);
  });
  it("visão do CEO: só o titular, e-mail mascarado, sem token", async () => {
    auth.owner = false;
    expect((await request(app).get("/api/ceo/paxcare/convites-medico")).status).toBe(403);
    auth.owner = true;
    const r = await request(app).get("/api/ceo/paxcare/convites-medico");
    expect(r.status).toBe(200);
    expect(r.body.resumo.revogado).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(r.body)).not.toMatch(/token/i);
    expect(r.body.convites[0].email).toContain("***");
    auth.owner = false;
  });
});

describe("contato da vitrine", () => {
  const base = { nome: "Maria Teste", email: "m@teste.com", clinica: "Clinica X", especialidade: "Endocrino", necessidade: "Quero conhecer o sistema" };
  it("grava consentimento, aceita ausência e não duplica reenvio", async () => {
    const a = await request(app).post("/api/vitrine-contatos").send({ ...base, consentimento: true });
    expect(a.body).toEqual({ ok: true });
    const b = await request(app).post("/api/vitrine-contatos").send({ ...base, consentimento: true });
    expect(b.body).toEqual({ ok: true, duplicado: true });
    const c = await request(app).post("/api/vitrine-contatos").send({ ...base, email: "n@teste.com" });
    expect(c.status).toBe(200);
    const rows = await pool.query(`SELECT email, consentimento, consentimento_em IS NOT NULL AS em FROM vitrine_contatos ORDER BY id`);
    expect(rows.rows).toEqual([{ email: "m@teste.com", consentimento: true, em: true }, { email: "n@teste.com", consentimento: null, em: false }]);
  });
  it("recusa dados inválidos", async () => {
    expect((await request(app).post("/api/vitrine-contatos").send({ ...base, email: "ruim" })).status).toBe(400);
  });
});
