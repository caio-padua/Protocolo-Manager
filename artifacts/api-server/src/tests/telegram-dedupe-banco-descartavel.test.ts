/**
 * Deduplicação por update_id — testes em BANCO DESCARTÁVEL.
 *
 * Sobe uma instância PostgreSQL própria (initdb em /tmp, SEM porta de rede,
 * só socket Unix), cria dados sintéticos e a derruba ao final. Nunca toca a
 * conexão configurada da aplicação (DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { aplicarMigracaoUpdateId, reverterMigracaoUpdateId } from "../lib/telegram-inbox-migracao";
import { gravarMensagemEntrada } from "../lib/telegram-inbox-store";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;
let db: ReturnType<typeof drizzle>;

const TABELA_ANTIGA = `
  CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT, empresa_id INT);
  CREATE TABLE telegram_inbox_messages (
    id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL DEFAULT 0,
    cliente_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL, texto TEXT NOT NULL,
    recebida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), lida_em TIMESTAMPTZ,
    direcao TEXT NOT NULL DEFAULT 'entrada');
`;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgdedupe-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=60"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    if (existsSync(join(dir, ".s.PGSQL.5432"))) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 30 });
  await pool.query(TABELA_ANTIGA);
  db = drizzle(pool);
  await pool.query("INSERT INTO clients (name, empresa_id) VALUES ('Sintetico A', 5), ('Sintetico B', 6)");
  // 3 linhas "legadas", gravadas ANTES da migração (update_id inexistente)
  await pool.query("INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto) VALUES (5,1,'111','legado 1'),(5,1,'111','legado 2'),(6,2,'222','legado 3')");
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir && dir.startsWith(join(tmpdir(), "pgdedupe-"))) rmSync(dir, { recursive: true, force: true });
});

const contar = async (where = "TRUE") =>
  Number((await pool.query(`SELECT count(*)::int AS n FROM telegram_inbox_messages WHERE ${where}`)).rows[0].n);

const base = { empresaId: 5, clienteId: 1, chatId: "111", texto: "oi" };

describe("migração aditiva e reversível", () => {
  it("M1 aplica sem alterar linhas legadas (3 linhas, update_id NULL, conteúdo igual)", async () => {
    const antes = (await pool.query("SELECT id, texto FROM telegram_inbox_messages ORDER BY id")).rows;
    await aplicarMigracaoUpdateId(db);
    const depois = (await pool.query("SELECT id, texto, update_id FROM telegram_inbox_messages ORDER BY id")).rows;
    expect(depois.map((r) => ({ id: r.id, texto: r.texto }))).toEqual(antes);
    expect(depois.every((r) => r.update_id === null)).toBe(true);
  });
  it("M2 é idempotente (aplicar 2 vezes mais não falha nem duplica índice)", async () => {
    await aplicarMigracaoUpdateId(db);
    await aplicarMigracaoUpdateId(db);
    const idx = await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname='ux_telegram_inbox_chat_update'");
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toContain("WHERE (update_id IS NOT NULL)");
  });
  it("M3 linhas legadas (NULL) convivem: várias NULL na mesma chat não colidem", async () => {
    expect(await contar("update_id IS NULL AND chat_id='111'")).toBe(2);
    await gravarMensagemEntrada(db, { ...base, updateId: null });
    await gravarMensagemEntrada(db, { ...base, updateId: null });
    expect(await contar("update_id IS NULL AND chat_id='111'")).toBe(4);
  });
});

describe("deduplicação", () => {
  it("D1 primeira entrega grava; reentrega do mesmo update_id NÃO duplica e devolve o mesmo id", async () => {
    const a = await gravarMensagemEntrada(db, { ...base, updateId: 5001 });
    const b = await gravarMensagemEntrada(db, { ...base, updateId: 5001 });
    expect(a.duplicada).toBe(false);
    expect(b.duplicada).toBe(true);
    expect(b.id).toBe(a.id);
    expect(await contar("update_id=5001")).toBe(1);
  });
  it("D2 mensagem NOVA do mesmo chat (update_id diferente, texto igual) grava normalmente", async () => {
    const r = await gravarMensagemEntrada(db, { ...base, updateId: 5002 });
    expect(r.duplicada).toBe(false);
    expect(await contar("chat_id='111' AND texto='oi' AND update_id IN (5001,5002)")).toBe(2);
  });
  it("D3 CONCORRÊNCIA: 25 entregas simultâneas do MESMO update_id => exatamente 1 linha, 1 gravada e 24 duplicadas", async () => {
    const rs = await Promise.all(Array.from({ length: 25 }, () => gravarMensagemEntrada(db, { ...base, updateId: 7000 })));
    expect(rs.filter((r) => !r.duplicada)).toHaveLength(1);
    expect(rs.filter((r) => r.duplicada)).toHaveLength(24);
    expect(new Set(rs.map((r) => r.id)).size).toBe(1);
    expect(await contar("update_id=7000")).toBe(1);
  });
  it("D4 CONCORRÊNCIA com updates diferentes: 25 simultâneos distintos => 25 linhas (nada é bloqueado em falso)", async () => {
    const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => gravarMensagemEntrada(db, { ...base, updateId: 8000 + i })));
    expect(rs.every((r) => !r.duplicada)).toBe(true);
    expect(await contar("update_id BETWEEN 8000 AND 8024")).toBe(25);
  });
  it("D5 ISOLAMENTO: mesmo update_id em OUTRO chat/cliente/empresa grava (chave é chat+update)", async () => {
    const r = await gravarMensagemEntrada(db, { empresaId: 6, clienteId: 2, chatId: "222", texto: "oi", updateId: 5001 });
    expect(r.duplicada).toBe(false);
    expect(await contar("update_id=5001")).toBe(2);
    expect(await contar("update_id=5001 AND empresa_id=6 AND cliente_id=2")).toBe(1);
    // e a reentrega do chat 222 continua dedupando só dentro do chat 222
    const dup = await gravarMensagemEntrada(db, { empresaId: 6, clienteId: 2, chatId: "222", texto: "oi", updateId: 5001 });
    expect(dup.duplicada).toBe(true);
  });
});

describe("falha antes e depois da gravação", () => {
  it("F1 FALHA ANTES: erro no INSERT (cliente inexistente / FK) não deixa linha e NÃO consome a chave; a reentrega seguinte grava", async () => {
    await expect(gravarMensagemEntrada(db, { ...base, clienteId: 9999, updateId: 9100 })).rejects.toBeDefined();
    expect(await contar("update_id=9100")).toBe(0);
    const ok = await gravarMensagemEntrada(db, { ...base, updateId: 9100 });
    expect(ok.duplicada).toBe(false);
    expect(await contar("update_id=9100")).toBe(1);
  });
  it("F2 FALHA ANTES (transação revertida): ROLLBACK libera a chave para a reentrega", async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, update_id) VALUES (5,1,'111','x',9200)");
      await c.query("ROLLBACK");
    } finally { c.release(); }
    expect(await contar("update_id=9200")).toBe(0);
    expect((await gravarMensagemEntrada(db, { ...base, updateId: 9200 })).duplicada).toBe(false);
  });
  it("F3 CONCORRÊNCIA + ROLLBACK: entrega B espera a A; se A reverte, B GRAVA (não é marcada duplicada em falso)", async () => {
    const a = await pool.connect();
    await a.query("BEGIN");
    await a.query("INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, update_id) VALUES (5,1,'111','a',9300)");
    const b = gravarMensagemEntrada(db, { ...base, updateId: 9300 }); // fica esperando a transação A
    await new Promise((r) => setTimeout(r, 400));
    await a.query("ROLLBACK");
    a.release();
    const rb = await b;
    expect(rb.duplicada).toBe(false);
    expect(await contar("update_id=9300")).toBe(1);
  });
  it("F4 CONCORRÊNCIA + COMMIT: entrega B espera a A; se A confirma, B é duplicada", async () => {
    const a = await pool.connect();
    await a.query("BEGIN");
    await a.query("INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, update_id) VALUES (5,1,'111','a',9400)");
    const b = gravarMensagemEntrada(db, { ...base, updateId: 9400 });
    await new Promise((r) => setTimeout(r, 400));
    await a.query("COMMIT");
    a.release();
    expect((await b).duplicada).toBe(true);
    expect(await contar("update_id=9400")).toBe(1);
  });
  it("F5 FALHA DEPOIS da gravação (resposta perdida): reentrega é reconhecida como duplicada, mensagem não se perde nem duplica", async () => {
    const primeira = await gravarMensagemEntrada(db, { ...base, updateId: 9500 }); // gravou; 'a resposta 200 se perdeu'
    const reentrega = await gravarMensagemEntrada(db, { ...base, updateId: 9500 });
    expect(primeira.duplicada).toBe(false);
    expect(reentrega).toEqual({ id: primeira.id, duplicada: true });
    expect(await contar("update_id=9500")).toBe(1);
  });
});

describe("reversão", () => {
  it("R1 reverter remove só coluna e índice: todas as mensagens continuam; reaplicar volta a funcionar", async () => {
    const total = await contar();
    await reverterMigracaoUpdateId(db);
    expect(await contar()).toBe(total);
    const col = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='telegram_inbox_messages' AND column_name='update_id'");
    expect(col.rows).toHaveLength(0);
    const idx = await pool.query("SELECT 1 FROM pg_indexes WHERE indexname='ux_telegram_inbox_chat_update'");
    expect(idx.rows).toHaveLength(0);
    await aplicarMigracaoUpdateId(db);
    expect((await gravarMensagemEntrada(db, { ...base, updateId: 9600 })).duplicada).toBe(false);
    expect((await gravarMensagemEntrada(db, { ...base, updateId: 9600 })).duplicada).toBe(true);
  });
});
