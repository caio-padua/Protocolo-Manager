/** Atendimento por IA com SQL real em BANCO DESCARTÁVEL (socket em /tmp; nunca toca DATABASE_URL). Dados sintéticos. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const h = vi.hoisted(() => ({ db: null as any, enviados: [] as { chat: string; texto: string }[], settings: {} as Record<string, string> }));
vi.mock("@workspace/db", () => ({ db: { execute: (...a: unknown[]) => h.db.execute(...a) } }));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: {} }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: async (k: string) => h.settings[k] ?? null }));
vi.mock("../lib/telegram", () => ({ sendTelegram: async (chat: string, texto: string) => { h.enviados.push({ chat, texto }); return { sent: true, mock: false }; } }));
vi.mock("../lib/telegram-config", () => ({ chatAlertaOuNull: async () => "ALERTA" }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: () => ({ headers: {} }) }));

import { aplicarMigracaoAtendimento, depsReaisAtendimento, pausarParaHumano, devolverParaIA, lerConfigAtendimento } from "../lib/atendimento-telegram-store";
import { processarAtendimento } from "../lib/atendimento-telegram";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = ""; let proc: ChildProcess | null = null; let pool: pg.Pool;
const base = { empresaId: 5, clienteId: 1, clienteNome: "Paciente Sintetico", chatId: "C1" };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgatend-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=60"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 30 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  await pool.query(`CREATE TABLE telegram_inbox_messages (id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL DEFAULT 0, cliente_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL, texto TEXT NOT NULL, recebida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), lida_em TIMESTAMPTZ, direcao TEXT NOT NULL DEFAULT 'entrada', update_id BIGINT)`);
  h.db = drizzle(pool);
  await aplicarMigracaoAtendimento(h.db);
  await pool.query(`INSERT INTO orientacoes_aprovadas (empresa_id,tema,perguntas_exemplo,resposta,status) VALUES
    (5,'Jejum antes do exame','preciso de jejum para exame de sangue, quantas horas de jejum','APROVADA: jejum de 8 horas.','aprovada'),
    (5,'Jejum rascunho','jejum exame sangue horas rascunho','RASCUNHO NAO PODE SAIR','rascunho'),
    (7,'Jejum outra clinica','jejum exame sangue horas de jejum','OUTRA CLINICA NAO PODE SAIR','aprovada')`);
  h.settings = { "atendimento.ia.modo": "ligado" };
}, 60000);
afterAll(async () => { await pool?.end(); proc?.kill("SIGTERM"); if (dir) rmSync(dir, { recursive: true, force: true }); });

const run = (id: number, texto: string, over: Partial<typeof base> = {}) =>
  processarAtendimento(depsReaisAtendimento(5), { ...base, ...over, inboxMessageId: id, texto });

describe("SQL real", () => {
  it("migração é idempotente", async () => { await aplicarMigracaoAtendimento(h.db); await aplicarMigracaoAtendimento(h.db); });

  it("só orientação APROVADA da PRÓPRIA empresa sai; envia, grava saída e desfecho", async () => {
    h.enviados.length = 0;
    expect(await run(101, "quantas horas de jejum para o exame de sangue?")).toBe("orientacao_enviada");
    expect(h.enviados).toEqual([{ chat: "C1", texto: "APROVADA: jejum de 8 horas." }]);
    const s = await pool.query(`SELECT direcao, texto FROM telegram_inbox_messages`);
    expect(s.rows).toEqual([{ direcao: "saida", texto: "APROVADA: jejum de 8 horas." }]);
    const r = await pool.query(`SELECT desfecho FROM telegram_atendimento_respostas WHERE inbox_message_id=101`);
    expect(r.rows[0].desfecho).toBe("orientacao_enviada");
  });

  it("20 entregas simultâneas da mesma mensagem = 1 resposta", async () => {
    h.enviados.length = 0;
    const rs = await Promise.all(Array.from({ length: 20 }, () => run(102, "quantas horas de jejum para o exame de sangue?")));
    expect(rs.filter((x) => x === "orientacao_enviada")).toHaveLength(1);
    expect(rs.filter((x) => x === "ja_tratado")).toHaveLength(19);
    expect(h.enviados.filter((e) => e.chat === "C1")).toHaveLength(1);
  });

  it("profissional assumiu = pausa; devolver à IA retoma", async () => {
    await pausarParaHumano(h.db, 1, "profissional_assumiu", 6);
    h.enviados.length = 0;
    expect(await run(103, "quantas horas de jejum para o exame de sangue?")).toBe("pausado_humano");
    expect(h.enviados).toHaveLength(0);
    await devolverParaIA(h.db, 1, 6);
    expect(await run(104, "quantas horas de jejum para o exame de sangue?")).toBe("orientacao_enviada");
  });

  it("queixa clínica pausa a IA, alerta com prioridade e não envia texto antes da revisão", async () => {
    await devolverParaIA(h.db, 2, null);
    h.enviados.length = 0;
    expect(await run(105, "passei mal depois da aplicação, muita tontura", { clienteId: 2, chatId: "C2" })).toBe("queixa_encaminhada");
    expect(h.enviados.map((e) => e.chat)).toEqual(["ALERTA"]);
    expect(h.enviados[0].texto).toMatch(/PRIORIDADE/);
    const m = await pool.query(`SELECT modo, motivo FROM telegram_atendimento WHERE cliente_id=2`);
    expect(m.rows[0]).toEqual({ modo: "humano", motivo: "queixa_clinica" });
    // próxima mensagem da mesma pessoa não recebe resposta automática (IA pausada)
    expect(await run(106, "quantas horas de jejum para o exame de sangue?", { clienteId: 2, chatId: "C2" })).toBe("pausado_humano");
  });

  it("configuração ilegível ou ausente = desligado", async () => {
    h.settings = {};
    expect((await lerConfigAtendimento()).modo).toBe("desligado");
    h.settings = { "atendimento.ia.modo": "lista", "atendimento.ia.permitidos": "{x" };
    expect((await lerConfigAtendimento()).modo).toBe("desligado");
    h.settings = { "atendimento.ia.modo": "ligado" };
  });
});
