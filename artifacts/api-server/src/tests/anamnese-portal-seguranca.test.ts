import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => {
  process.env.SESSION_SECRET = "synthetic-only-anamnese-route-test-secret";
  return { database: null as any };
});
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_target, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  });
  return { ...schema, db };
});

import anamnesePortalRouter from "../routes/anamnese-portal";
import { createCollaboratorToken } from "../lib/collaborator-auth";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), anamnesePortalRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});
const headers = (professionalId: number) => ({
  authorization: `Bearer ${createCollaboratorToken({
    professionalId,
    role: "medico",
    credentialVersion: 1,
  })}`,
});

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await isolated.pool.query(`
    CREATE TABLE empresas (
      id integer PRIMARY KEY,
      nome text NOT NULL,
      slug text,
      telegram_bot_username text,
      area_url text,
      ativa boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT 'ATIVO'
    );
    CREATE TABLE professionals (
      id integer PRIMARY KEY,
      role text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      credential_version integer NOT NULL DEFAULT 1,
      empresa_id integer
    );
    CREATE TABLE clients (
      id integer PRIMARY KEY,
      name text NOT NULL,
      empresa_id integer
    );
    CREATE TABLE motor_sugestao (
      id serial PRIMARY KEY,
      sessao_id integer NOT NULL,
      cliente_id integer,
      status text NOT NULL DEFAULT 'AGUARDA_VALIDACAO',
      resumo jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE motor_sugestao_item (
      id serial PRIMARY KEY,
      sugestao_id integer NOT NULL,
      status text NOT NULL DEFAULT 'AGUARDA_VALIDACAO',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await isolated.pool.query(`
    INSERT INTO empresas (id, nome, slug) VALUES
      (51, 'Clínica Sintética A', 'clinica-a'),
      (52, 'Clínica Sintética B', 'clinica-b');
    INSERT INTO professionals (id, role, active, credential_version, empresa_id) VALUES
      (101, 'medico', true, 1, 51),
      (102, 'medico', true, 1, 52);
    INSERT INTO clients (id, name, empresa_id) VALUES
      (9101, 'Cliente Sintético A', 51),
      (9102, 'Cliente Sintético B', 52);
    INSERT INTO motor_sugestao (id, sessao_id, cliente_id, resumo) VALUES
      (9201, 9201, 9101, '{"origem":"sintetica-a"}'),
      (9202, 9202, 9102, '{"origem":"sintetica-b"}');
    INSERT INTO motor_sugestao_item (sugestao_id) VALUES (9201), (9202);
  `);
}, 120000);

afterAll(async () => {
  if (isolated) await isolated.stop();
}, 60000);

describe("fila de validação da anamnese: autenticação e isolamento", () => {
  it("recusa sem autenticação tanto a leitura quanto a decisão", async () => {
    await request(app).get("/anamnese-portal/fila").expect(401);
    await request(app)
      .post("/anamnese-portal/sugestao/9201/decidir")
      .send({ decisao: "validado" })
      .expect(401);
  });

  it("usa uma sessão médica assinada e lista somente a clínica do vínculo no banco", async () => {
    const response = await request(app)
      .get("/anamnese-portal/fila?empresaId=52")
      .set(headers(101))
      .expect(200);
    expect(response.body.map((row: { id: number }) => row.id)).toEqual([9201]);
  });

  it("ignora empresa enviada pelo cliente e bloqueia decisão entre clínicas", async () => {
    await request(app)
      .post("/anamnese-portal/sugestao/9202/decidir")
      .set(headers(101))
      .send({ decisao: "recusado", empresaId: 52 })
      .expect(404);
    const result = await isolated.pool.query(`
      SELECT s.status AS suggestion_status, i.status AS item_status
      FROM motor_sugestao s
      JOIN motor_sugestao_item i ON i.sugestao_id = s.id
      WHERE s.id = 9202
    `);
    expect(result.rows[0]).toEqual({
      suggestion_status: "AGUARDA_VALIDACAO",
      item_status: "AGUARDA_VALIDACAO",
    });
  });

  it("permite ao médico da clínica vinculada decidir e atualiza pacote e itens juntos", async () => {
    const response = await request(app)
      .post("/anamnese-portal/sugestao/9201/decidir")
      .set(headers(101))
      .send({ decisao: "validado" });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({ ok: true });
    const result = await isolated.pool.query(`
      SELECT s.status AS suggestion_status, i.status AS item_status
      FROM motor_sugestao s
      JOIN motor_sugestao_item i ON i.sugestao_id = s.id
      WHERE s.id = 9201
    `);
    expect(result.rows[0]).toEqual({
      suggestion_status: "validado",
      item_status: "validado",
    });
  });

  it("mantém o acesso legítimo do médico da segunda clínica aos próprios registros", async () => {
    const response = await request(app)
      .get("/anamnese-portal/fila")
      .set(headers(102))
      .expect(200);
    expect(response.body.map((row: { id: number }) => row.id)).toEqual([9202]);
  });
});
