import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
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
vi.mock("../routes/collaborator.js", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-collab"]) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    req.collaborator = { professionalId: 101 };
    next();
  },
}));
vi.mock("../middleware/messageClinic.js", () => ({
  requireMessageClinic: (req: any, res: any, next: any) => {
    const empresaId = Number(req.headers["x-empresa"]);
    if (!Number.isSafeInteger(empresaId) || empresaId <= 0) {
      res.status(403).json({ error: "Clínica não resolvida" });
      return;
    }
    req.messageEmpresaId = empresaId;
    next();
  },
}));

import anamnesePortalRouter from "../routes/anamnese-portal";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), anamnesePortalRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});
const headers = (empresaId: number) => ({ "x-collab": "synthetic", "x-empresa": String(empresaId) });

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await isolated.pool.query(`
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

  it("lista apenas as sugestões ligadas à clínica autenticada", async () => {
    const response = await request(app)
      .get("/anamnese-portal/fila")
      .set(headers(51))
      .expect(200);
    expect(response.body.map((row: { id: number }) => row.id)).toEqual([9201]);
  });

  it("não permite decidir sugestão de outra clínica e mantém os dados intactos", async () => {
    await request(app)
      .post("/anamnese-portal/sugestao/9202/decidir")
      .set(headers(51))
      .send({ decisao: "recusado" })
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

  it("permite decisão da própria clínica e atualiza pacote e itens na mesma transação", async () => {
    const response = await request(app)
      .post("/anamnese-portal/sugestao/9201/decidir")
      .set(headers(51))
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
});
