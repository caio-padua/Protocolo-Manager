import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: {},
}));
import { getPreferredAgendas, InvalidPreferredAgendas, setPreferredAgendas } from "../lib/client-preferred-agendas";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
let connection: any;
let executor: any;

beforeAll(async () => { isolated = await startIsolatedPostgres(); }, 60000);
afterAll(async () => { if (isolated) await isolated.stop(); }, 60000);

beforeEach(async () => {
  connection = await isolated.pool.connect();
  await connection.query("BEGIN");
  await connection.query(`
    CREATE TEMP TABLE locations (id INTEGER PRIMARY KEY, empresa_id INTEGER, active TEXT) ON COMMIT DROP;
    CREATE TEMP TABLE agenda_resources (id INTEGER PRIMARY KEY, location_id INTEGER, active BOOLEAN) ON COMMIT DROP;
    CREATE TEMP TABLE client_preferred_agendas (
      id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, agenda_resource_id INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (client_id, agenda_resource_id)
    ) ON COMMIT DROP;
    INSERT INTO locations VALUES (8, 5, 'true'), (9, 6, 'true');
    INSERT INTO agenda_resources VALUES (11, 8, true), (12, 8, true), (13, 9, true), (14, 8, false);
  `);
  executor = drizzle(connection);
});
afterEach(async () => {
  if (connection) {
    await connection.query("ROLLBACK");
    connection.release();
  }
});

describe("Preferências de agendas em banco descartável", () => {
  const client = { id: 42, empresaId: 5, locationId: 8 };

  it("grava, troca, reativa e limpa sem apagar as linhas anteriores", async () => {
    await setPreferredAgendas(executor, client, [11, 12]);
    expect((await getPreferredAgendas(client.id, executor)).sort()).toEqual([11, 12]);
    await setPreferredAgendas(executor, client, [12]);
    expect(await getPreferredAgendas(client.id, executor)).toEqual([12]);
    await setPreferredAgendas(executor, client, [11]);
    expect(await getPreferredAgendas(client.id, executor)).toEqual([11]);
    await setPreferredAgendas(executor, client, []);
    expect(await getPreferredAgendas(client.id, executor)).toEqual([]);
    const rows = await connection.query("SELECT agenda_resource_id, active FROM pg_temp.client_preferred_agendas ORDER BY agenda_resource_id");
    expect(rows.rows).toEqual([
      { agenda_resource_id: 11, active: false },
      { agenda_resource_id: 12, active: false },
    ]);
  });

  it("preserva preferências quando o campo é omitido ou alguma agenda é inválida", async () => {
    await setPreferredAgendas(executor, client, [11]);
    await setPreferredAgendas(executor, client, undefined);
    for (const ids of [[11, 13], [11, 14], [11, -1], null]) {
      await expect(setPreferredAgendas(executor, client, ids)).rejects.toBeInstanceOf(InvalidPreferredAgendas);
      expect(await getPreferredAgendas(client.id, executor)).toEqual([11]);
    }
  });

  it("migra uma tabela antiga duas vezes preservando vínculos existentes", async () => {
    const legacy = await isolated.pool.connect();
    try {
      await legacy.query("BEGIN");
      await legacy.query("CREATE TEMP TABLE client_preferred_agendas (id INTEGER, client_id INTEGER, agenda_resource_id INTEGER) ON COMMIT DROP");
      await legacy.query("INSERT INTO client_preferred_agendas VALUES (1, 42, 11)");
      const migration = await readFile(
        new URL("../../../../scripts/migrations/20261108_preferencias_agendas_ativas.sql", import.meta.url),
        "utf8",
      );
      await legacy.query(migration);
      await legacy.query(migration);
      const rows = await legacy.query("SELECT client_id, agenda_resource_id, active FROM client_preferred_agendas");
      expect(rows.rows).toEqual([{ client_id: 42, agenda_resource_id: 11, active: true }]);
    } finally {
      await legacy.query("ROLLBACK");
      legacy.release();
    }
  });
});
