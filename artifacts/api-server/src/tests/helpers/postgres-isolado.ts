import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// pg é uma dependência direta do pacote de banco.
const require = createRequire(new URL("../../../../../lib/db/package.json", import.meta.url));
const { Pool } = require("pg");
const run = promisify(execFile);

export async function startIsolatedPostgres() {
  const directory = await mkdtemp(join(tmpdir(), "paxter-pg-isolado-"));
  const dataDirectory = join(directory, "dados");
  let started = false;
  let pool: any;
  try {
    await run("initdb", ["-D", dataDirectory, "--no-instructions", "--auth-local=trust", "--auth-host=reject"]);
    await run("pg_ctl", [
      "-D", dataDirectory, "-l", join(directory, "postgres.log"),
      "-o", `-F -k ${directory} -p 55432 -c listen_addresses=''`, "-w", "start",
    ]);
    started = true;
    pool = new Pool({ host: directory, port: 55432, user: userInfo().username, database: "postgres" });
  } catch (error) {
    if (started) await run("pg_ctl", ["-D", dataDirectory, "-m", "fast", "-w", "stop"]);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    pool,
    async stop() {
      try {
        await pool.end();
      } finally {
        try {
          await run("pg_ctl", ["-D", dataDirectory, "-m", "fast", "-w", "stop"]);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
  };
}
