import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// Real PostgreSQL, isolated from development/production and all patient data.
// Keep disposable files in /tmp; never run DROP/DELETE on the project database.
export async function isolatedPostgres() {
  const directory = mkdtempSync(join(tmpdir(), "exam-dispatch-pg-"));
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  execFileSync("initdb", ["-D", directory, "-A", "trust", "--no-locale", "-U", "synthetic"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", directory, "-l", join(directory, "server.log"), "-w", "start",
    "-o", `-k ${directory} -h 127.0.0.1 -p ${port}`], { stdio: "pipe" });
  const require = createRequire(new URL("../../../../../lib/db/package.json", import.meta.url));
  const { Pool } = require("pg");
  const pool = new Pool({ host: "127.0.0.1", port, user: "synthetic", database: "postgres" });
  const migration = readFileSync(new URL("../../../../../scripts/migrations/exam-request-dispatch-operations.sql", import.meta.url), "utf8");
  await pool.query(migration);
  // Verify additive migration is repeatable.
  await pool.query(migration);
  const dialect = new PgDialect();
  return {
    // Only this disposable local cluster is passed to subprocess tests.
    connection: { host: "127.0.0.1", port, user: "synthetic", database: "postgres" },
    pool,
    execute: (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      return pool.query(compiled.sql, compiled.params);
    },
    transaction: async (callback: (tx: { execute: (query: SQL) => Promise<any> }) => Promise<any>) => {
      const client = await pool.connect();
      const execute = (query: SQL) => {
        const compiled = dialect.sqlToQuery(query);
        return client.query(compiled.sql, compiled.params);
      };
      await client.query("BEGIN");
      try {
        const result = await callback({ execute });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    stop: async () => {
      await pool.end();
      execFileSync("pg_ctl", ["-D", directory, "-w", "stop", "-m", "fast"], { stdio: "pipe" });
      const tempRoot = `${resolve(tmpdir())}${sep}`;
      const isolatedDirectory = resolve(directory);
      if (!isolatedDirectory.startsWith(tempRoot)) {
        throw new Error("Refusing to remove a PostgreSQL test directory outside the temporary folder.");
      }
      rmSync(isolatedDirectory, { recursive: true, force: true });
    },
  };
}
