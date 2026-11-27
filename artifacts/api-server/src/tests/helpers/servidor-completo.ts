/**
 * Sobe o app COMPLETO do api-server (src/app.ts: CORS, helmet, limite de taxa, Basic Auth, tenantContext, papéis por clínica,
 * todos os roteadores) sobre um PostgreSQL descartável com o esquema real aplicado pelo drizzle-kit. Nada toca o banco
 * configurado da aplicação. Credenciais de canais externos são removidas do ambiente para que nenhuma mensagem real saia.
 * O chamador precisa mockar ../lib/sheets-dicionario e ../lib/seed-avatares (efeitos de boot sobre serviços externos).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { iniciarPgDescartavel } from "./pg-descartavel";

export const ADMIN_USER = "perimetro-teste";
export const ADMIN_PASS = "perimetro-senha-teste";
const BLOQUEAR = /^(EVOLUTION_|TWILIO_|TELEGRAM|PADAXOR_TELEGRAM|ASAAS_|GITHUB_PAT|CF_API|ZAPSIGN|SLACK|PADAXOR_SLACK|GOOGLE_|PADAXOR_PLANILHA|RAILWAY_|CERT_)/;

export async function subirServidorCompleto() {
  const pg = iniciarPgDescartavel();
  for (const k of Object.keys(process.env)) if (BLOQUEAR.test(k)) delete process.env[k];
  // Clientes de IA exigem URL e chave ao importar; apontam para porta fechada local (nenhuma chamada real possível).
  for (const n of ["ANTHROPIC", "GEMINI", "OPENAI", "OPENROUTER"]) { process.env[`AI_INTEGRATIONS_${n}_BASE_URL`] = "http://127.0.0.1:9"; process.env[`AI_INTEGRATIONS_${n}_API_KEY`] = "teste"; }
  process.env.DATABASE_URL = pg.url;
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.ADMIN_USERNAME = ADMIN_USER;
  process.env.ADMIN_PASSWORD = ADMIN_PASS;
  process.env.NODE_ENV = "test";
  // O esquema referencia uma sequência criada fora do drizzle (scripts/migrations.sql); sem ela o push falha em banco vazio.
  execFileSync("psql", ["-h", pg.dir, "-U", "teste", "t", "-qc", "CREATE SEQUENCE IF NOT EXISTS locations_semantic_code_seq"], { stdio: "ignore" });
  execFileSync("pnpm", ["--filter", "@workspace/db", "run", "push-force"], {
    cwd: resolve(import.meta.dirname, "../../../../.."), env: process.env, stdio: "pipe", timeout: 240_000,
  });
  // Migrações incrementais que o deploy real aplica (colunas fora do drizzle). Erros pontuais são tolerados: cada comando é independente.
  try { execFileSync("psql", ["-h", pg.dir, "-U", "teste", "t", "-q", "-f", resolve(import.meta.dirname, "../../../../../scripts/migrations.sql")], { stdio: "ignore", timeout: 120_000 }); } catch { /* segue */ }
  // Coluna criada em tempo de execução por lib/anamnese-retorno.ts (fora do drizzle e das migrações).
  execFileSync("psql", ["-h", pg.dir, "-U", "teste", "t", "-qc", "ALTER TABLE clients ADD COLUMN IF NOT EXISTS sexo_biologico text"], { stdio: "ignore" });
  const { pool } = await import("@workspace/db");
  const app = (await import("../../app")).default;
  return { app, pool, pg, parar: async () => { await pool.end().catch(() => {}); pg.parar(); } };
}
