import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ pool: null as any, db: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { ...schema, get pool() { return state.pool; }, get db() { return state.db; } };
});

import { PROCEDIMENTOS_SCHEMA_SQL } from "../lib/procedimentos-schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import procedimentosRouter from "../routes/procedimentos";

const app = express().use(express.json(), tenantContextMiddleware, procedimentosRouter);
let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const ownerA = () => createCollaboratorToken({ professionalId: 1, role: "admin" });
const ownerB = () => createCollaboratorToken({ professionalId: 2, role: "admin" });
const clinicianB = () => createCollaboratorToken({ professionalId: 3, role: "executor" });
const post = (token: string, body: object) => request(app).post("/procedimentos").set("Authorization", `Bearer ${token}`).send(body);
const put = (token: string, id: number, body: object) => request(app).put(`/procedimentos/${id}`).set("Authorization", `Bearer ${token}`).send(body);
const get = (token: string) => request(app).get("/procedimentos").set("Authorization", `Bearer ${token}`);
const consulta = { nome: "Consulta sintética", tipo: "consulta", descricao: null, duracaoMinutos: 60, ativo: true, produtoIds: [] };

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.pool = isolated.pool;
  const schema = await import("@workspace/db/schema");
  state.db = drizzle(state.pool, { schema });
  await state.pool.query(`
    CREATE TABLE empresas (id integer primary key, nome text, nome_fantasia text, ativa boolean, status text);
    INSERT INTO empresas VALUES (1,'Clínica A',null,true,'ATIVO'), (2,'Clínica B',null,true,'ATIVO');
    CREATE TABLE professionals (id integer primary key, role text, category text, active boolean,
      credential_version integer, empresa_id integer, is_platform_owner boolean);
    INSERT INTO professionals VALUES
      (1,'admin','medico',true,0,1,true), (2,'admin','medico',true,0,2,true),
      (3,'executor','medico',true,0,2,false), (4,'admin','medico',false,0,1,true);
    CREATE TABLE locations (id integer primary key, empresa_id integer, active text);
    CREATE TABLE location_professionals (id integer primary key, professional_id integer, location_id integer);
    CREATE TABLE professional_empresas (id integer primary key, professional_id integer, empresa_id integer);
    CREATE TABLE substances (id integer primary key, name text, procedure_type text, doctor_participation boolean);
    INSERT INTO substances VALUES (10,'Produto sintético IM','im',false),
      (11,'Implante sintético','implant',true), (12,'Produto médico sintético','im',true);
  `);
  await state.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
  await state.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
}, 60000);

afterAll(async () => { if (isolated) await isolated.stop(); }, 60000);

describe("Cadastro de procedimentos — banco e autenticação isolados", () => {
  let consultaId: number;
  let implantId: number;
  it("recusa leitura e escrita sem sessão e sessão inválida", async () => {
    expect((await request(app).get("/procedimentos")).status).toBe(401);
    expect((await request(app).post("/procedimentos").send(consulta)).status).toBe(401);
    expect((await get("invalido")).status).toBe(401);
    const inactive = createCollaboratorToken({ professionalId: 4, role: "admin" });
    expect((await get(inactive)).status).toBe(401);
    const revoked = createCollaboratorToken({ professionalId: 1, role: "admin", credentialVersion: 1 });
    expect((await get(revoked)).status).toBe(401);
  });
  it("não usa estrutura incompatível nem tenta modificá-la", async () => {
    const client = await state.pool.connect();
    try {
      await client.query("CREATE SCHEMA teste_incompativel; CREATE TABLE teste_incompativel.procedimentos_clinicos (duracao_minutos REAL)");
      await client.query("SET search_path TO teste_incompativel, public");
      const previous = state.pool;
      state.pool = client;
      try {
        expect((await get(ownerA())).status).toBe(503);
      } finally {
        state.pool = previous;
      }
      const structure = await client.query("SELECT data_type FROM information_schema.columns WHERE table_schema='teste_incompativel' AND table_name='procedimentos_clinicos' AND column_name='duracao_minutos'");
      expect(structure.rows[0].data_type).toBe("real");
      await client.query("RESET search_path");
    } finally {
      client.release();
    }
  });
  it("salva consulta sem substância e a relê da clínica correta", async () => {
    const result = await post(ownerA(), consulta);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ ...consulta, empresaId: 1 });
    consultaId = result.body.id;
    const list = await get(ownerA());
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ empresaId: 1, empresaNome: "Clínica A" });
    expect(list.body.procedimentos).toContainEqual(result.body);
    expect((await get(ownerB())).body.procedimentos).toEqual([]);
  });
  it("vincula produto existente sem alterá-lo e admite duração decimal", async () => {
    const before = await state.pool.query("SELECT * FROM substances ORDER BY id");
    const result = await post(ownerB(), {
      nome: "Implante sintético", tipo: "medico", descricao: null, duracaoMinutos: 2.5,
      ativo: true, produtoIds: [11],
    });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ empresaId: 2, tipo: "medico", produtoIds: [11], duracaoMinutos: 2.5 });
    implantId = result.body.id;
    expect((await state.pool.query("SELECT * FROM substances ORDER BY id")).rows).toEqual(before.rows);
  });
  it("impede edição cruzada e troca de clínica por profissional sem vínculo", async () => {
    expect((await put(ownerA(), implantId, consulta)).status).toBe(404);
    expect((await put(clinicianB(), consultaId, consulta)).status).toBe(403);
    const resposta = await get(clinicianB()).set("x-empresa-id", "1");
    expect(resposta.status).toBe(403);
    expect((await get(clinicianB())).body.procedimentos.map((p: any) => p.id)).toEqual([implantId]);
  });
  it("recusa campos inválidos, produto ausente e implante como enfermagem", async () => {
    for (const body of [
      { ...consulta, nome: "  " }, { ...consulta, tipo: "desconhecido" },
      { ...consulta, produtoIds: [10, 10] }, { ...consulta, produtoIds: [10.5] },
      { ...consulta, produtoIds: [999] }, { ...consulta, tipo: "enfermagem", produtoIds: [11] },
      { ...consulta, tipo: "enfermagem", produtoIds: [12] }, { ...consulta, empresaId: 2 },
      { ...consulta, duracaoMinutos: 0.001 },
    ]) expect((await post(ownerA(), body)).status, JSON.stringify(body)).toBe(400);
  });
  it("preserva 0,01 e 0,1 minuto sem aproximação no banco", async () => {
    for (const duracaoMinutos of [0.01, 0.1]) {
      const result = await post(ownerA(), { ...consulta, nome: `Duração ${duracaoMinutos}`, duracaoMinutos });
      expect(result.status).toBe(201);
      expect(result.body.duracaoMinutos).toBe(duracaoMinutos);
      const stored = await state.pool.query("SELECT duracao_minutos::text AS n FROM procedimentos_clinicos WHERE id=$1", [result.body.id]);
      expect(stored.rows[0].n).toBe(duracaoMinutos.toFixed(2));
    }
  });
  it("altera vínculos sem apagar histórico e reativa o mesmo procedimento", async () => {
    const body = { nome: "Implante sintético", tipo: "medico", descricao: "Revisado", duracaoMinutos: 30, ativo: false, produtoIds: [10] };
    expect((await put(ownerB(), implantId, body)).body).toMatchObject(body);
    const vinculos = await state.pool.query("SELECT produto_id, ativo FROM procedimento_produtos WHERE procedimento_id=$1 ORDER BY produto_id", [implantId]);
    expect(vinculos.rows).toEqual([{ produto_id: 10, ativo: true }, { produto_id: 11, ativo: false }]);
    expect((await put(ownerB(), implantId, { ...body, ativo: true, produtoIds: [11] })).body)
      .toMatchObject({ ...body, ativo: true, produtoIds: [11] });
    expect((await state.pool.query("SELECT count(*)::int AS n FROM procedimentos_clinicos WHERE id=$1", [implantId])).rows[0].n).toBe(1);
  });
  it("uma falha no vínculo desfaz a atualização por inteiro", async () => {
    await state.pool.query(`CREATE FUNCTION falhar_vinculo_sintetico() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha sintética'; END $$;
      CREATE TRIGGER teste_falha BEFORE INSERT ON procedimento_produtos FOR EACH ROW EXECUTE FUNCTION falhar_vinculo_sintetico()`);
    const result = await put(ownerB(), implantId, { nome: "Não deve salvar", tipo: "medico", descricao: null, duracaoMinutos: null, ativo: false, produtoIds: [10] });
    expect(result.status).toBe(500);
    const found = (await get(ownerB())).body.procedimentos.find((p: any) => p.id === implantId);
    expect(found).toMatchObject({ nome: "Implante sintético", ativo: true, produtoIds: [11] });
    await state.pool.query("DROP TRIGGER teste_falha ON procedimento_produtos; DROP FUNCTION falhar_vinculo_sintetico()");
  });
});
