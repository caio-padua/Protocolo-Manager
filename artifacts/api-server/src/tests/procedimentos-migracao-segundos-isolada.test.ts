import { afterAll, beforeAll, expect, it } from "vitest";
import { PROCEDIMENTOS_SCHEMA_SQL } from "../lib/procedimentos-schema";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  await isolated.pool.query(`
    CREATE TABLE empresas (id integer PRIMARY KEY);
    CREATE TABLE substances (id integer PRIMARY KEY, name text);
    CREATE TABLE professional_areas (id integer PRIMARY KEY);
    CREATE TABLE locations (id integer PRIMARY KEY);
    CREATE TABLE professionals (id integer PRIMARY KEY);
    INSERT INTO empresas VALUES (1);
    INSERT INTO substances VALUES (10,'Produto sintético');
    CREATE TABLE procedimentos_clinicos (
      id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id),
      nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 200),
      tipo TEXT NOT NULL CHECK (tipo IN ('consulta','enfermagem','medico')),
      descricao TEXT, duracao_minutos NUMERIC(8,2), ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE procedimento_produtos (
      procedimento_id INTEGER NOT NULL REFERENCES procedimentos_clinicos(id),
      produto_id INTEGER NOT NULL REFERENCES substances(id),
      ativo BOOLEAN NOT NULL DEFAULT TRUE, PRIMARY KEY (procedimento_id,produto_id)
    );
    INSERT INTO procedimentos_clinicos(empresa_id,nome,tipo,duracao_minutos)
      VALUES (1,'Procedimento sintético','enfermagem',2.50);
    INSERT INTO procedimento_produtos VALUES (1,10,true);
  `);
}, 60_000);
afterAll(async () => { if (isolated) await isolated.stop(); }, 60_000);

it("aplica somente a estrutura de procedimentos duas vezes sem alterar linhas existentes", async () => {
  const before = await isolated.pool.query(`
    SELECT p.*, row_to_json(s) AS produto, row_to_json(pp) AS vinculo
      FROM procedimentos_clinicos p JOIN procedimento_produtos pp ON pp.procedimento_id=p.id
      JOIN substances s ON s.id=pp.produto_id`);
  await isolated.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
  await isolated.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
  const after = await isolated.pool.query(`
    SELECT p.*, row_to_json(s) AS produto, row_to_json(pp) AS vinculo
      FROM procedimentos_clinicos p JOIN procedimento_produtos pp ON pp.procedimento_id=p.id
      JOIN substances s ON s.id=pp.produto_id`);
  const { duracao_segundos, dose, ...dadosAnteriores } = after.rows[0];
  expect(duracao_segundos).toBeNull();
  expect(dose).toBeNull();
  expect(dadosAnteriores).toEqual(before.rows[0]);
  expect(after.rowCount).toBe(1);
});
