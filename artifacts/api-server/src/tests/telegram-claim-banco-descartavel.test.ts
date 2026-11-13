/**
 * Reivindicação de update (bot_id, update_id) — SQL real em BANCO DESCARTÁVEL.
 * PostgreSQL próprio em /tmp, sem porta de rede (socket Unix); nunca toca DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  aplicarMigracaoClaim, reivindicarUpdate, concluirUpdate, liberarUpdate, botIdDoToken,
} from "../lib/telegram-update-claim";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgclaim-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=60"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    if (existsSync(join(dir, ".s.PGSQL.5432"))) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 30 });
  // O socket aparece ANTES de o servidor terminar de subir ("database system is starting up"):
  // espera até aceitar consulta de verdade.
  for (let i = 0; i < 80; i++) {
    try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  db = drizzle(pool);
  await aplicarMigracaoClaim(db);
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir && dir.startsWith(join(tmpdir(), "pgclaim-"))) rmSync(dir, { recursive: true, force: true });
});

describe("reivindicação por (bot, update_id)", () => {
  it("K1 migração é idempotente", async () => {
    await aplicarMigracaoClaim(db);
    await aplicarMigracaoClaim(db);
    const t = await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='telegram_updates_processados'");
    expect(t.rows[0].n).toBe(1);
  });

  it("K2 primeira reivindica; repetida durante o processamento = em_andamento; concluída = ja_concluido", async () => {
    expect(await reivindicarUpdate(db, "bot1", 1001, "dono-a")).toBe("reivindicado");
    expect(await reivindicarUpdate(db, "bot1", 1001, "dono-a")).toBe("em_andamento");
    await concluirUpdate(db, "bot1", 1001, "dono-a");
    expect(await reivindicarUpdate(db, "bot1", 1001, "dono-a")).toBe("ja_concluido");
  });

  it("K3 liberar (falha passageira) permite reprocessar; liberar NUNCA desfaz um concluído", async () => {
    expect(await reivindicarUpdate(db, "bot1", 1002, "dono-a")).toBe("reivindicado");
    await liberarUpdate(db, "bot1", 1002, "dono-a");
    expect(await reivindicarUpdate(db, "bot1", 1002, "dono-a")).toBe("reivindicado");
    await concluirUpdate(db, "bot1", 1002, "dono-a");
    await liberarUpdate(db, "bot1", 1002, "dono-a");
    expect(await reivindicarUpdate(db, "bot1", 1002, "dono-a")).toBe("ja_concluido");
  });

  it("K4 mesmo update_id em bots diferentes não colide", async () => {
    expect(await reivindicarUpdate(db, "botA", 2001, "dono-a")).toBe("reivindicado");
    expect(await reivindicarUpdate(db, "botB", 2001, "dono-a")).toBe("reivindicado");
    expect(await reivindicarUpdate(db, "botA", 2001, "dono-a")).toBe("em_andamento");
  });

  it("K5 'processando' abandonado (processo morreu) é reassumido depois do prazo; antes do prazo, não", async () => {
    expect(await reivindicarUpdate(db, "bot1", 3001, "dono-a")).toBe("reivindicado");
    expect(await reivindicarUpdate(db, "bot1", 3001, "dono-a")).toBe("em_andamento");
    await pool.query("UPDATE telegram_updates_processados SET atualizado_em = NOW() - interval '10 minutes' WHERE bot_id='bot1' AND update_id=3001");
    expect(await reivindicarUpdate(db, "bot1", 3001, "dono-a")).toBe("reivindicado");
  });

  it("K6 concluído antigo NUNCA é reassumido, por mais velho que seja", async () => {
    await reivindicarUpdate(db, "bot1", 3002, "dono-a");
    await concluirUpdate(db, "bot1", 3002, "dono-a");
    await pool.query("UPDATE telegram_updates_processados SET atualizado_em = NOW() - interval '30 days' WHERE bot_id='bot1' AND update_id=3002");
    expect(await reivindicarUpdate(db, "bot1", 3002, "dono-a")).toBe("ja_concluido");
  });

  it("K7 concorrência: 25 entregas simultâneas do mesmo update => exatamente 1 reivindica", async () => {
    const r = await Promise.all(Array.from({ length: 25 }, () => reivindicarUpdate(db, "bot1", 4001, "dono-a")));
    expect(r.filter((x) => x === "reivindicado")).toHaveLength(1);
    expect(r.filter((x) => x === "em_andamento")).toHaveLength(24);
    const n = await pool.query("SELECT count(*)::int AS n FROM telegram_updates_processados WHERE bot_id='bot1' AND update_id=4001");
    expect(n.rows[0].n).toBe(1);
  });

  it("K8 reinício: o estado vive no banco, uma nova 'instância' vê o mesmo resultado", async () => {
    await reivindicarUpdate(db, "bot1", 5001, "dono-a");
    await concluirUpdate(db, "bot1", 5001, "dono-a");
    const outroPool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 2 });
    try {
      expect(await reivindicarUpdate(drizzle(outroPool), "bot1", 5001, "dono-a")).toBe("ja_concluido");
    } finally {
      await outroPool.end();
    }
  });
});

describe("dono da reivindicação (lease)", () => {
  it("K9 dono antigo, depois de reassumido por outro, NÃO conclui nem libera a reivindicação nova", async () => {
    expect(await reivindicarUpdate(db, "bot1", 6001, "antigo")).toBe("reivindicado");
    await pool.query("UPDATE telegram_updates_processados SET atualizado_em = NOW() - interval '10 minutes' WHERE bot_id='bot1' AND update_id=6001");
    expect(await reivindicarUpdate(db, "bot1", 6001, "novo")).toBe("reivindicado");
    await concluirUpdate(db, "bot1", 6001, "antigo");
    await liberarUpdate(db, "bot1", 6001, "antigo");
    const r = await pool.query("SELECT estado, dono FROM telegram_updates_processados WHERE bot_id='bot1' AND update_id=6001");
    expect(r.rows[0]).toEqual({ estado: "processando", dono: "novo" });
    await concluirUpdate(db, "bot1", 6001, "novo");
    expect(await reivindicarUpdate(db, "bot1", 6001, "terceiro")).toBe("ja_concluido");
  });
  it("K10 migração adiciona a coluna dono em tabela criada sem ela (idempotente)", async () => {
    await pool.query("ALTER TABLE telegram_updates_processados DROP COLUMN dono");
    await aplicarMigracaoClaim(db);
    await aplicarMigracaoClaim(db);
    const c = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='telegram_updates_processados' AND column_name='dono'");
    expect(c.rowCount).toBe(1);
  });
});

describe("botIdDoToken", () => {
  it("extrai só a parte numérica pública; inválido => bot-desconhecido; nunca devolve o token", () => {
    expect(botIdDoToken("123456789:ABC-segredo")).toBe("123456789");
    expect(botIdDoToken("sem-formato")).toBe("bot-desconhecido");
    expect(botIdDoToken(null)).toBe("bot-desconhecido");
    expect(botIdDoToken("123456789:ABC-segredo")).not.toContain("segredo");
  });
});
