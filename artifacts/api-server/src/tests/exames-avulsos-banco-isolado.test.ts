/** Exames avulsos em PostgreSQL descartavel: isolamento por cliente, preco oculto ate publicar, aceite com confirmacao. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

// A licença do módulo é testada em module-guard.test.ts; aqui o guard passa para isolar o fluxo da rota.
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const auth = vi.hoisted(() => ({ owner: true }));
vi.mock("../lib/clinical-access", () => ({ isPlatformOwner: vi.fn(async () => auth.owner) }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, _res: any, next: any) => { req.collaborator = { professionalId: 7 }; next(); },
}));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "x".repeat(32);
let app: express.Express; let pool: any; let tok: (id: number) => string;

beforeAll(async () => {
  const db = await import("@workspace/db");
  pool = db.pool;
  await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int)`);
  await pool.query(`INSERT INTO clients (name, empresa_id) VALUES ('A',1),('B',1)`);
  await pool.query(`CREATE TABLE catalogo_exames (id serial primary key, codigo_exame text unique, nome_exame text, ativo boolean, grupo_principal text, modalidade text, preparo text)`);
  await pool.query(`INSERT INTO catalogo_exames (codigo_exame,nome_exame,ativo) VALUES ('EXTSH','TSH',true),('EXT4','T4 LIVRE',true),('EXOFF','ANTIGO',false)`);
  await (await import("../lib/exames-avulsos")).ensureExamesAvulsosTable();
  tok = (await import("../lib/portal-token")).createPortalToken;
  app = express(); app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
  app.use("/api", (await import("../routes/exames-avulsos")).default);
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

const H = (id: number) => ({ Authorization: `Bearer ${tok(id)}` });

describe("exames avulsos", () => {
  it("exige sessao do cliente", async () => {
    expect((await request(app).get("/api/area-paciente/exames-avulsos")).status).toBe(401);
    expect((await request(app).post("/api/area-paciente/exames-avulsos").send({ codigos: ["EXTSH"] })).status).toBe(401);
  });
  it("busca so exame ativo e exige 2+ letras", async () => {
    const r = await request(app).get("/api/area-paciente/exames-avulsos/catalogo?q=tsh").set(H(1));
    expect(r.body.itens.map((i: any) => i.codigo)).toEqual(["EXTSH"]);
    expect((await request(app).get("/api/area-paciente/exames-avulsos/catalogo?q=a").set(H(1))).body.itens).toEqual([]);
    expect((await request(app).get("/api/area-paciente/exames-avulsos/catalogo?q=antigo").set(H(1))).body.itens).toEqual([]);
  });
  it("recusa exame fora do catalogo ativo e ignora nome enviado pelo navegador", async () => {
    expect((await request(app).post("/api/area-paciente/exames-avulsos").set(H(1)).send({ codigos: ["EXOFF"] })).status).toBe(422);
    expect((await request(app).post("/api/area-paciente/exames-avulsos").set(H(1)).send({ codigos: ["EXTSH"], nome: "x" })).status).toBe(400);
  });
  it("fluxo completo: solicitar, preco oculto, titular publica, cliente aceita com confirmacao", async () => {
    const c = await request(app).post("/api/area-paciente/exames-avulsos").set(H(1)).send({ codigos: ["EXTSH", "EXT4"], notes: "quero saber o preparo" });
    expect(c.status).toBe(201);
    expect(c.body.quoteAmount).toBeNull();
    expect(c.body.aviso).toMatch(/avaliação profissional/);
    const id = c.body.id;
    // cliente B nao enxerga nem mexe
    expect((await request(app).get("/api/area-paciente/exames-avulsos").set(H(2))).body).toEqual([]);
    expect((await request(app).post(`/api/area-paciente/exames-avulsos/${id}/cancelar`).set(H(2))).status).toBe(409);
    // aceitar sem orcamento publicado
    expect((await request(app).post(`/api/area-paciente/exames-avulsos/${id}/aceitar`).set(H(1)).send({ confirmo: true })).status).toBe(409);
    // titular: sem confirmacao recusa; nao-titular 403
    expect((await request(app).put(`/api/exames-avulsos/${id}/orcamento`).send({ valor: 120.5 })).status).toBe(400);
    auth.owner = false;
    expect((await request(app).put(`/api/exames-avulsos/${id}/orcamento`).send({ valor: 120.5, confirmo: true })).status).toBe(403);
    auth.owner = true;
    expect((await request(app).put(`/api/exames-avulsos/${id}/orcamento`).send({ valor: 120.5, nota: "inclui coleta", confirmo: true })).status).toBe(200);
    // preco editavel antes do aceite
    expect((await request(app).put(`/api/exames-avulsos/${id}/orcamento`).send({ valor: 99.9, confirmo: true })).status).toBe(200);
    const vis = (await request(app).get("/api/area-paciente/exames-avulsos").set(H(1))).body[0];
    expect(vis.quoteAmount).toBe(99.9);
    // aceite exige confirmo:true
    expect((await request(app).post(`/api/area-paciente/exames-avulsos/${id}/aceitar`).set(H(1)).send({})).status).toBe(400);
    expect((await request(app).post(`/api/area-paciente/exames-avulsos/${id}/aceitar`).set(H(1)).send({ confirmo: true })).body.status).toBe("aceito");
    // depois de aceito o valor trava
    expect((await request(app).put(`/api/exames-avulsos/${id}/orcamento`).send({ valor: 10, confirmo: true })).status).toBe(409);
    expect((await request(app).post(`/api/area-paciente/exames-avulsos/${id}/aceitar`).set(H(1)).send({ confirmo: true })).status).toBe(409);
  });
  it("limita solicitacoes abertas por cliente", async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await request(app).post("/api/area-paciente/exames-avulsos").set(H(2)).send({ codigos: ["EXTSH"] })).status;
    expect(last).toBe(429);
  });
});
