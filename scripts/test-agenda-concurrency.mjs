// Prova isolada do mecanismo de reserva. Não lê nem altera tabelas clínicas.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Client } = requireDb("pg");
const schema = `agenda_test_${randomUUID().replaceAll("-","")}`;
const a = new Client({connectionString:process.env.DATABASE_URL});
const b = new Client({connectionString:process.env.DATABASE_URL});
await Promise.all([a.connect(),b.connect()]);
try {
  await a.query(`CREATE SCHEMA "${schema}"`);
  await a.query(`CREATE TABLE "${schema}".slots (id serial PRIMARY KEY, time text NOT NULL)`);
  const attempt = async (client,delay) => {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(19872026,-987654)");
    const exists = await client.query(`SELECT 1 FROM "${schema}".slots WHERE time='09:00'`);
    if (delay) await client.query("SELECT pg_sleep(0.2)");
    if (exists.rowCount) {await client.query("ROLLBACK");return 409;}
    await client.query(`INSERT INTO "${schema}".slots(time) VALUES('09:00')`);
    await client.query("COMMIT");
    return 201;
  };
  const results = await Promise.all([attempt(a,true),attempt(b,false)]);
  assert.deepEqual(results.sort(),[201,409]);
  assert.equal((await a.query(`SELECT count(*)::int n FROM "${schema}".slots`)).rows[0].n,1);
  console.log("Concorrência PostgreSQL isolada: uma reserva criada, outra recusada; uma linha persistida.");
} finally {
  await Promise.all([a.query("ROLLBACK"),b.query("ROLLBACK")]);
  // Somente o esquema efêmero criado por este próprio teste, nunca dados do produto.
  await a.query(`DROP TABLE IF EXISTS "${schema}".slots`);
  await a.query(`DROP SCHEMA IF EXISTS "${schema}"`);
  await Promise.all([a.end(),b.end()]);
}
