// PostgreSQL descartável para testes: instância própria, sem escuta de rede (só socket em pasta temporária).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function iniciarPgDescartavel(): { dir: string; url: string; parar: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "pg-teste-"));
  const data = join(dir, "data");
  execFileSync("initdb", ["-D", data, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  execFileSync("pg_ctl", ["-D", data, "-o", `-c listen_addresses='' -k ${dir}`, "-l", join(dir, "log"), "-w", "start"], { stdio: "ignore" });
  execFileSync("createdb", ["-h", dir, "-U", "teste", "t"], { stdio: "ignore" });
  return {
    dir,
    url: `postgresql://teste@/t?host=${encodeURIComponent(dir)}`,
    parar: () => {
      try { execFileSync("pg_ctl", ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore" }); } catch { /* ignora */ }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
