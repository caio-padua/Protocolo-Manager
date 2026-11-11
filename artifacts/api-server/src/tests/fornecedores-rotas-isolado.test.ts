import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ pool: null as any, db: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { ...schema, get pool() { return state.pool; }, get db() { return state.db; } };
});

import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import router from "../routes/fornecedores";

const app = express().use(express.json(), tenantContextMiddleware, router);
let banco: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const owner = () => createCollaboratorToken({ professionalId: 1, role: "admin" });
const normal = () => createCollaboratorToken({ professionalId: 2, role: "executor" });
const ficha = { nome: "Empresa sintética", razaoSocial: null, cnpj: null, endereco: null,
  telefone: null, email: null, site: null, instagram: null, fabricante: null,
  fornecedor: true, fonte: "Teste isolado", ativo: true };
const token = (t: string) => `Bearer ${t}`;

beforeAll(async () => {
  banco = await startIsolatedPostgres();
  state.pool = banco.pool;
  const schema = await import("@workspace/db/schema");
  state.db = drizzle(state.pool, { schema });
  await state.pool.query(`
    CREATE TABLE empresas(id integer PRIMARY KEY, ativa boolean, status text, nome text);
    INSERT INTO empresas VALUES (1,true,'ATIVO','Clínica um'),(2,true,'ATIVO','Clínica dois');
    CREATE TABLE professionals(id integer PRIMARY KEY, role text, category text, active boolean,
      credential_version integer, empresa_id integer, is_platform_owner boolean);
    INSERT INTO professionals VALUES (1,'admin','medico',true,0,1,true), (2,'executor','enfermagem',true,0,2,false);
    CREATE TABLE locations(id integer PRIMARY KEY, empresa_id integer, active text);
    CREATE TABLE location_professionals(id integer PRIMARY KEY, professional_id integer, location_id integer);
    CREATE TABLE professional_empresas(id integer PRIMARY KEY, professional_id integer, empresa_id integer);
    CREATE TABLE substances(id integer PRIMARY KEY);
    INSERT INTO substances VALUES (202);
  `);
  const migracao = readFileSync(new URL("../../../../lib/db/migrations/20261111-fornecedores-cadastrados.sql", import.meta.url), "utf8");
  await state.pool.query(migracao);
  await state.pool.query(readFileSync(new URL("../../../../lib/db/migrations/20261111-substance-variantes.sql", import.meta.url), "utf8"));
}, 60_000);
afterAll(async () => { if (banco) await banco.stop(); }, 60_000);

describe("Fornecedores — sessão e clínica", () => {
  it("recusa acesso sem sessão, inválido e sem propriedade", async () => {
    expect((await request(app).get("/fornecedores")).status).toBe(401);
    expect((await request(app).post("/fornecedores").send(ficha)).status).toBe(401);
    expect((await request(app).get("/fornecedores").set("Authorization", token("invalido"))).status).toBe(401);
    expect((await request(app).get("/fornecedores").set("Authorization", token(normal()))).status).toBe(403);
    expect((await request(app).post("/fornecedores").set("Authorization", token(normal())).send(ficha)).status).toBe(403);
    expect((await request(app).put("/fornecedores/1").send({ ...ficha, versao: 1 })).status).toBe(401);
    expect((await request(app).put("/fornecedores/1").set("Authorization", token(normal())).send({ ...ficha, versao: 1 })).status).toBe(403);
  });
  it("usa clínica autorizada da sessão e recusa clínica no corpo", async () => {
    expect((await request(app).post("/fornecedores").set("Authorization", token(owner()))
      .send({ ...ficha, empresaId: 2 })).status).toBe(400);
    const criado = await request(app).post("/fornecedores").set("Authorization", token(owner())).send(ficha);
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({ empresaId: 1, nome: ficha.nome, fabricante: null });
    const outra = await request(app).get("/fornecedores").set("Authorization", token(owner())).set("x-empresa-id", "2");
    expect(outra.body).toEqual([]);
    expect((await request(app).put(`/fornecedores/${criado.body.id}`).set("Authorization", token(owner()))
      .set("x-empresa-id", "2").send({ ...ficha, versao: 1 })).status).toBe(404);
    const mesmo = await request(app).get("/fornecedores").set("Authorization", token(owner()));
    expect(mesmo.body).toHaveLength(1);
    const editado = await request(app).put(`/fornecedores/${criado.body.id}`).set("Authorization", token(owner()))
      .send({ ...ficha, nome: "Fornecedor alterado", versao: criado.body.versao });
    expect(editado.status).toBe(200);
    expect(editado.body).toMatchObject({ nome: "Fornecedor alterado", versao: 2 });
    expect((await request(app).put(`/fornecedores/${criado.body.id}`).set("Authorization", token(owner()))
      .send({ ...ficha, versao: criado.body.versao })).status).toBe(409);
    expect((await request(app).get("/fornecedores").set("Authorization", token(owner()))).body[0].nome).toBe("Fornecedor alterado");
  });
  it("informa indisponibilidade se a estrutura não existir", async () => {
    const client = await banco.pool.connect();
    try {
      await client.query("CREATE SCHEMA estrutura_ausente; SET search_path TO estrutura_ausente");
      const anterior = state.pool;
      state.pool = client;
      try {
        const result = await request(app).get("/fornecedores").set("Authorization", token(owner()));
        expect(result.status).toBe(503);
        expect(result.body.error).toContain("estrutura ainda não instalada");
      } finally { state.pool = anterior; }
    } finally { await client.query("RESET search_path"); client.release(); }
  });
  it("lista somente apresentações da clínica autorizada, sem acesso anônimo", async () => {
    const fornecedorOutra = await state.pool.query("INSERT INTO fornecedores_cadastrados(empresa_id,nome) VALUES(2,'Outra clínica') RETURNING id");
    const v1 = await state.pool.query("INSERT INTO substance_variantes(empresa_id,substance_id,dose_total,forma,volume_ml,vias_fonte) VALUES(1,202,'10 mg','ampola',2,'IM') RETURNING id");
    const v2 = await state.pool.query("INSERT INTO substance_variantes(empresa_id,substance_id,dose_total,forma,volume_ml,vias_fonte) VALUES(2,202,'10 mg','ampola',4,'IM') RETURNING id");
    await state.pool.query(`INSERT INTO substance_ofertas(empresa_id,variante_id,fornecedor_id,posicao,origem_chave,documento,pagina,linha,embalagem_original,fonte_texto,quantidade_embalagem,custo_unitario_centavos,custo_embalagem_centavos)
      VALUES(2,$1,$2,1,'outra-origem','Fonte',1,1,'10 ampolas','Fonte',10,500,5000)`, [v2.rows[0].id, fornecedorOutra.rows[0].id]);
    expect((await request(app).get("/substances/202/variantes")).status).toBe(401);
    expect((await request(app).get("/substances/202/variantes").set("Authorization", token(normal()))).status).toBe(403);
    const lista1 = await request(app).get("/substances/202/variantes").set("Authorization", token(owner()));
    expect(lista1.status).toBe(200);
    expect(lista1.body.clinica).toBe("Clínica um");
    expect(lista1.body.variantes).toHaveLength(1);
    expect(lista1.body.variantes[0]).toMatchObject({ id: v1.rows[0].id, volumeMl: "2", ofertas: [] });
    const lista2 = await request(app).get("/substances/202/variantes").set("Authorization", token(owner())).set("x-empresa-id", "2");
    expect(lista2.body.clinica).toBe("Clínica dois");
    expect(lista2.body.variantes).toHaveLength(1);
    expect(lista2.body.variantes[0]).toMatchObject({ id: v2.rows[0].id, volumeMl: "4", ofertas: [{ fornecedor: "Outra clínica" }] });
    expect((await request(app).get("/substances/0/variantes").set("Authorization", token(owner()))).status).toBe(400);
  });
});
