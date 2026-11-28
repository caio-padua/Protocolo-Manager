/**
 * Prova em PostgreSQL descartável (instância própria, sem rede, dados sintéticos) de que:
 * - códigos de validação iguais nunca vinculam (ambíguo) e cadastros inativos são ignorados;
 * - o link individual vincula exatamente o cadastro dono do link, mesmo com códigos iguais;
 * - o link vale uma vez e um chat não vira dois cadastros.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir = "";
let lib: typeof import("../lib/telegram-contato");
let magic: typeof import("../lib/telegram-magic-link");
let pool: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }>; end: () => Promise<void> };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pg-vinculo-"));
  const data = join(dir, "data");
  execFileSync("initdb", ["-D", data, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  execFileSync("pg_ctl", ["-D", data, "-o", `-c listen_addresses='' -k ${dir}`, "-l", join(dir, "log"), "-w", "start"], { stdio: "ignore" });
  execFileSync("createdb", ["-h", dir, "-U", "teste", "t"], { stdio: "ignore" });
  process.env.DATABASE_URL = `postgresql://teste@/t?host=${encodeURIComponent(dir)}`;
  const dbmod = await import("@workspace/db");
  pool = dbmod.pool as unknown as typeof pool;
  await pool.query(`CREATE TABLE clients (id serial PRIMARY KEY, name text, empresa_id int, status text DEFAULT 'active',
    validation_password text, telegram_chat_id text, telegram_vinculado_em timestamptz,
    telegram_magic_token text, telegram_magic_expira_em timestamptz, telegram_magic_usado_em timestamptz)`);
  await pool.query(`CREATE UNIQUE INDEX ux_chat ON clients (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL`);
  await pool.query(`INSERT INTO clients (name, empresa_id, validation_password) VALUES
    ('Sintetico A', 1, 'ABC1234'), ('Sintetico B', 2, 'abc1234 '), ('Sintetico C', 1, 'XYZ0001')`);
  await pool.query(`INSERT INTO clients (name, empresa_id, status, validation_password) VALUES ('Sintetico Inativo', 1, 'inactive', 'XYZ0001')`);
  lib = await import("../lib/telegram-contato");
  magic = await import("../lib/telegram-magic-link");
}, 60_000);

afterAll(async () => {
  try { await pool?.end(); } catch { /* ignora */ }
  try { execFileSync("pg_ctl", ["-D", join(dir, "data"), "-m", "immediate", "stop"], { stdio: "ignore" }); } catch { /* ignora */ }
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("vínculo do Telegram com códigos iguais (banco descartável)", () => {
  it("código repetido entre clínicas é ambíguo e não escolhe ninguém", async () => {
    expect(await lib.buscarCadastroPorCodigo(["ABC1234"])).toBe("ambiguo");
  });
  it("código único vincula o cadastro certo e ignora cadastro inativo", async () => {
    expect(await lib.buscarCadastroPorCodigo(["xyz0001"])).toEqual({ id: 3, name: "Sintetico C" });
  });
  it("texto sem código não encontra ninguém", async () => {
    expect(await lib.buscarCadastroPorCodigo(["OI", "BOM", "DIA"])).toBeNull();
  });
  it("conta cadastros com o mesmo código, exceto o próprio", async () => {
    expect(await lib.contarCadastrosComCodigo("ABC1234", 1)).toBe(1);
    expect(await lib.contarCadastrosComCodigo("XYZ0001", 3)).toBe(0);
  });
  it("link individual vincula só o dono do link, mesmo com código repetido", async () => {
    const link = await magic.emitirLinkMagico(2);
    expect(link?.url).toContain("?start=");
    const r = await magic.consumirLinkMagico(link!.token, "chat-sintetico-1");
    expect(r).toMatchObject({ status: "vinculado", clienteId: 2 });
    const { rows } = await pool.query(`SELECT id, telegram_chat_id FROM clients WHERE telegram_chat_id IS NOT NULL`);
    expect(rows).toEqual([{ id: 2, telegram_chat_id: "chat-sintetico-1" }]);
  });
  it("o mesmo link não vale duas vezes", async () => {
    const link = await magic.emitirLinkMagico(1);
    expect((await magic.consumirLinkMagico(link!.token, "chat-sintetico-2")).status).toBe("vinculado");
    expect((await magic.consumirLinkMagico(link!.token, "chat-sintetico-3")).status).toBe("usado");
  });
  it("um chat já vinculado não vira outro cadastro", async () => {
    const link = await magic.emitirLinkMagico(3);
    expect((await magic.consumirLinkMagico(link!.token, "chat-sintetico-1")).status).toBe("colisao");
  });
});
