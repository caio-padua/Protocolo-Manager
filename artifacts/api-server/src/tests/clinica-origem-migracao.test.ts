import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
}, 60000);
afterAll(async () => { await isolated?.stop(); }, 60000);

describe("Clínica de origem em cadastros antigos", () => {
  it("migra duas vezes e preenche somente origens vazias, sem trocar os vínculos existentes", async () => {
    const db = isolated.pool;
    await db.query(`
      CREATE TABLE empresas (id INTEGER PRIMARY KEY);
      CREATE TABLE clients (id INTEGER PRIMARY KEY, empresa_id INTEGER, location_id INTEGER);
      INSERT INTO empresas VALUES (5), (6);
      INSERT INTO clients VALUES (1, 5, 30), (2, 5, NULL), (3, 6, 9);
    `);
    const migration = await readFile(new URL("../../../../scripts/migrations/20261109_clinica_origem_cliente.sql", import.meta.url), "utf8");
    await db.query(migration);
    await db.query(migration);
    await db.query("UPDATE clients SET clinica_origem_empresa_id=6 WHERE id=2");
    await db.query("UPDATE clients SET clinica_origem_empresa_id=5 WHERE empresa_id=5 AND clinica_origem_empresa_id IS NULL");
    const rows = await db.query("SELECT id, empresa_id, location_id, clinica_origem_empresa_id FROM clients ORDER BY id");
    expect(rows.rows).toEqual([
      { id: 1, empresa_id: 5, location_id: 30, clinica_origem_empresa_id: 5 },
      { id: 2, empresa_id: 5, location_id: null, clinica_origem_empresa_id: 6 },
      { id: 3, empresa_id: 6, location_id: 9, clinica_origem_empresa_id: null },
    ]);
    await expect(db.query("UPDATE clients SET clinica_origem_empresa_id=999 WHERE id=1")).rejects.toThrow();
  }, 30000);
});
