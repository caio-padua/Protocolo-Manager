import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { substancesTable } from "@workspace/db/schema";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn() }));
import { catalogSubstanceUpdate } from "../lib/substance-duration";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
let pool: any;
let connection: any;

beforeAll(async () => {
  // Instância descartável, sem escuta de rede e independente do DATABASE_URL.
  isolated = await startIsolatedPostgres();
  pool = isolated.pool;
}, 60000);

afterAll(async () => {
  if (isolated) await isolated.stop();
}, 60000);

beforeEach(async () => {
  connection = await pool.connect();
  await connection.query("BEGIN");
});
afterEach(async () => {
  if (connection) {
    await connection.query("ROLLBACK");
    connection.release();
  }
});

describe("Precisão do cadastro em tabelas temporárias isoladas", () => {
  it("acrescenta participação médica sem atribuir respostas ao cadastro antigo", async () => {
    await connection.query("CREATE TEMP TABLE substances (id integer, duration_minutes integer) ON COMMIT DROP");
    await connection.query("INSERT INTO pg_temp.substances VALUES (1, 15), (2, 30)");
    const migration = await readFile(
      new URL("../../../../scripts/migrations/20261108_substancias_participacao_medica.sql", import.meta.url), "utf8",
    );
    await connection.query(migration);
    await connection.query("UPDATE pg_temp.substances SET doctor_participation = true WHERE id=2");
    await connection.query(migration);
    const result = await connection.query("SELECT id, doctor_participation FROM pg_temp.substances ORDER BY id");
    expect(result.rows).toEqual([{ id: 1, doctor_participation: null }, { id: 2, doctor_participation: true }]);
  });
  it("executa a migração estrutural repetidamente sem alterar dados", async () => {
    await connection.query("CREATE TEMP TABLE substances (id integer, duration_minutes integer) ON COMMIT DROP");
    await connection.query("INSERT INTO pg_temp.substances VALUES (1, 15)");
    const sql = await readFile(
      new URL("../../../../scripts/migrations/20261108_substancias_duracao_precisa.sql", import.meta.url),
      "utf8",
    );
    await connection.query(sql);
    await connection.query(sql);
    const result = await connection.query("SELECT duration_minutes, precise_duration_seconds FROM pg_temp.substances");
    expect(result.rows).toEqual([{ duration_minutes: 15, precise_duration_seconds: null }]);
  });

  it("preserva a duração editada ao reimportar pelo conflito real do banco", async () => {
    const columns = getTableConfig(substancesTable).columns
      .map((column) => `"${column.name}" ${column.getSQLType()}`)
      .join(", ");
    await connection.query(`CREATE TEMP TABLE substances (${columns}, UNIQUE (codigo_padcom)) ON COMMIT DROP`);
    const db = drizzle(connection);
    const initial = {
      id: 9001, codigoPadcom: "SINTETICA-DURACAO", name: "Primeiro nome", category: "Teste", color: "blue",
      pricePerUnit: 10, durationMinutes: 15, preciseDurationSeconds: 150,
    };
    await db.insert(substancesTable).values(initial);
    const catalog = {
      codigoPadcom: "SINTETICA-DURACAO", name: "Nome atualizado", category: "Teste", color: "blue",
      pricePerUnit: 12, durationMinutes: 60, preciseDurationSeconds: 1800,
    };
    await db.insert(substancesTable).values({ ...catalog, id: 9002 })
      .onConflictDoUpdate({
        target: substancesTable.codigoPadcom,
        set: catalogSubstanceUpdate(catalog, true),
      });
    const rows = await connection.query(
      "SELECT id, name, duration_minutes, precise_duration_seconds FROM pg_temp.substances WHERE codigo_padcom = $1",
      ["SINTETICA-DURACAO"],
    );
    expect(rows.rows).toEqual([{
      id: 9001, name: "Nome atualizado", duration_minutes: 15, precise_duration_seconds: 150,
    }]);
  });
});
