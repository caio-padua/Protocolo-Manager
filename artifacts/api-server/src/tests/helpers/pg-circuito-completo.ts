import { execFileSync } from "node:child_process";
import { bancoAtendimentoIsolado } from "./pg-atendimento-isolado";

/**
 * Banco descartável com o ESQUEMA completo do banco de desenvolvimento (somente estrutura, nenhum dado).
 * Dados são sempre sintéticos. Nunca grava no banco configurado da aplicação.
 */
export async function bancoCircuitoCompleto() {
  const b = await bancoAtendimentoIsolado();
  const pgBin = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
  const ddl = execFileSync("pg_dump", ["-s", "--no-owner", "--no-privileges", process.env.DATABASE_URL as string],
    { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  const limpo = ddl.split("\n").filter((l) => !l.startsWith("\\")).join("\n");
  execFileSync(`${pgBin}/psql`, ["-h", b.dir, "-U", "teste", "-d", "postgres", "-q"],
    { input: limpo, stdio: ["pipe", "ignore", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  const n = await b.pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'");
  if (n.rows[0].n < 100) throw new Error("esquema_nao_carregado:" + n.rows[0].n);
  return b;
}
