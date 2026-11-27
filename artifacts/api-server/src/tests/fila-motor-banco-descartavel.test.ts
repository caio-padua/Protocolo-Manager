/**
 * Fila persistente — SQL real em BANCO DESCARTAVEL (socket Unix, nunca toca DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import {
  chaveMensagem, comTravaDeJob, concluir, criarTabelaFila, enfileirar, ErroDefinitivo, falhar,
  processarLote, reservar, varrerFila,
} from "../lib/fila-motor";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgfila-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=80"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 30 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  await criarTabelaFila(pool);
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir.startsWith(join(tmpdir(), "pgfila-"))) rmSync(dir, { recursive: true, force: true });
});

async function limpar() { await pool.query("TRUNCATE mensagens_fila RESTART IDENTITY"); }
async function estado(id: number) {
  return (await pool.query("SELECT * FROM mensagens_fila WHERE id=$1", [id])).rows[0];
}

describe("idempotencia", () => {
  it("criar a tabela duas vezes nao falha", async () => {
    await criarTabelaFila(pool);
  });
  it("mesma chave concorrente cria uma unica linha", async () => {
    await limpar();
    const r = await Promise.all(Array.from({ length: 10 }, () => enfileirar(pool, { tipo: "mensagem", empresaId: 1, chave: "k1" })));
    expect(r.filter((x) => !x.duplicada)).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int n FROM mensagens_fila")).rows[0].n).toBe(1);
  });
  it("mesma chave em outra clinica ou outro tipo e item distinto", async () => {
    await limpar();
    const a = await enfileirar(pool, { tipo: "mensagem", empresaId: 1, chave: "x" });
    const b = await enfileirar(pool, { tipo: "mensagem", empresaId: 2, chave: "x" });
    const c = await enfileirar(pool, { tipo: "pdf_exame", empresaId: 1, chave: "x" });
    expect([a, b, c].every((x) => !x.duplicada)).toBe(true);
  });
  it("recusa payload grande, chave vazia e empresa invalida", async () => {
    await expect(enfileirar(pool, { tipo: "mensagem", empresaId: 1, chave: "g", payload: { t: "a".repeat(70000) } })).rejects.toThrow("payload_grande_demais");
    await expect(enfileirar(pool, { tipo: "mensagem", empresaId: 1, chave: "" })).rejects.toThrow("chave_invalida");
    await expect(enfileirar(pool, { tipo: "mensagem", empresaId: 0, chave: "z" })).rejects.toThrow("empresa_invalida");
  });
  it("chaveMensagem e estavel e sensivel a cada campo", () => {
    const base = { canal: "wa", destinatario: "d", conteudo: "c", janela: "j" };
    expect(chaveMensagem(base)).toBe(chaveMensagem({ ...base }));
    expect(chaveMensagem(base)).not.toBe(chaveMensagem({ ...base, janela: "j2" }));
  });
});

describe("reserva exclusiva, lease, TTL e tentativas", () => {
  it("reservas concorrentes nunca entregam o mesmo item", async () => {
    await limpar();
    for (let i = 0; i < 40; i++) await enfileirar(pool, { tipo: "pdf_exame", empresaId: 1, chave: `i${i}` });
    const lotes = await Promise.all(Array.from({ length: 8 }, (_, w) => reservar(pool, { tipo: "pdf_exame", limite: 10, workerId: `w${w}` })));
    const ids = lotes.flat().map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(40);
  });
  it("lease vencido devolve o item e o dono antigo nao consegue concluir", async () => {
    await limpar();
    const { id } = await enfileirar(pool, { tipo: "pdf_exame", empresaId: 1, chave: "L" });
    const [a] = await reservar(pool, { tipo: "pdf_exame", limite: 1, workerId: "A" });
    expect(a.tentativas).toBe(1);
    expect(await reservar(pool, { tipo: "pdf_exame", limite: 1, workerId: "B" })).toHaveLength(0);
    await pool.query("UPDATE mensagens_fila SET reservada_ate = now() - interval '1 second' WHERE id=$1", [id]);
    const [b] = await reservar(pool, { tipo: "pdf_exame", limite: 1, workerId: "B" });
    expect(b.id).toBe(id);
    expect(b.tentativas).toBe(2);
    expect(await concluir(pool, a, "A")).toBe(false);
    expect(await falhar(pool, a, "A", new Error("tarde"))).toBeNull();
    expect(await concluir(pool, b, "B")).toBe(true);
    expect((await estado(id!)).estado).toBe("concluida");
  });
  it("mesmo worker com reserva antiga tambem nao conclui (numero da tentativa)", async () => {
    await limpar();
    const { id } = await enfileirar(pool, { tipo: "pdf_exame", empresaId: 1, chave: "M" });
    const [a1] = await reservar(pool, { tipo: "pdf_exame", limite: 1, workerId: "A" });
    await pool.query("UPDATE mensagens_fila SET reservada_ate = now() - interval '1 second' WHERE id=$1", [id]);
    const [a2] = await reservar(pool, { tipo: "pdf_exame", limite: 1, workerId: "A" });
    expect(await concluir(pool, a1, "A")).toBe(false);
    expect(await concluir(pool, a2, "A")).toBe(true);
  });
  it("TTL vencido nunca e entregue e vira expirada", async () => {
    await limpar();
    const { id } = await enfileirar(pool, { tipo: "mensagem", empresaId: 1, chave: "T" });
    await pool.query("UPDATE mensagens_fila SET expira_em = now() - interval '1 second' WHERE id=$1", [id]);
    expect(await reservar(pool, { tipo: "mensagem", limite: 5, workerId: "A" })).toHaveLength(0);
    expect((await estado(id!)).estado).toBe("expirada");
  });
  it("TTL vencido durante reserva abandonada tambem expira", async () => {
    await limpar();
    const { id } = await enfileirar(pool, { tipo: "mensagem", empresaId: 1, chave: "T2" });
    await reservar(pool, { tipo: "mensagem", limite: 1, workerId: "A" });
    await pool.query("UPDATE mensagens_fila SET reservada_ate = now() - interval '1 second', expira_em = now() - interval '1 second' WHERE id=$1", [id]);
    const v = await varrerFila(pool, "mensagem");
    expect(v.expiradas).toBe(1);
    expect((await estado(id!)).estado).toBe("expirada");
  });
  it("falha tem espera crescente e esgotadas viram morta", async () => {
    await limpar();
    const { id } = await enfileirar(pool, { tipo: "mensagem", empresaId: 1, chave: "F", maxTentativas: 3 });
    let esperas: number[] = [];
    for (let t = 1; t <= 3; t++) {
      await pool.query("UPDATE mensagens_fila SET proxima_tentativa_em = now() WHERE id=$1", [id]);
      const [it] = await reservar(pool, { tipo: "mensagem", limite: 1, workerId: "A" });
      expect(it.tentativas).toBe(t);
      const novo = await falhar(pool, it, "A", new Error("cpf 12345678901 falhou"));
      const s = await estado(id!);
      if (t < 3) {
        expect(novo).toBe("falha");
        esperas.push(Math.round((new Date(s.proxima_tentativa_em).getTime() - Date.now()) / 1000));
      } else {
        expect(novo).toBe("morta");
        expect(s.ultimo_erro).not.toContain("12345678901");
      }
    }
    expect(esperas[1]).toBeGreaterThan(esperas[0]);
    await pool.query("UPDATE mensagens_fila SET proxima_tentativa_em = now() WHERE id=$1", [id]);
    expect(await reservar(pool, { tipo: "mensagem", limite: 1, workerId: "A" })).toHaveLength(0);
  });
  it("lease vencido com tentativas esgotadas vira morta e nao volta", async () => {
    await limpar();
    const { id } = await enfileirar(pool, { tipo: "mensagem", empresaId: 1, chave: "E", maxTentativas: 1 });
    await reservar(pool, { tipo: "mensagem", limite: 1, workerId: "A" });
    await pool.query("UPDATE mensagens_fila SET reservada_ate = now() - interval '1 second' WHERE id=$1", [id]);
    expect(await reservar(pool, { tipo: "mensagem", limite: 1, workerId: "B" })).toHaveLength(0);
    expect((await estado(id!)).estado).toBe("morta");
  });
  it("teto por clinica por minuto limita a entrega", async () => {
    await limpar();
    for (let i = 0; i < 6; i++) await enfileirar(pool, { tipo: "mensagem", empresaId: 7, chave: `c${i}` });
    const a = await reservar(pool, { tipo: "mensagem", limite: 1, workerId: "A", tetoPorEmpresaPorMinuto: 2 });
    const b = await reservar(pool, { tipo: "mensagem", limite: 1, workerId: "A", tetoPorEmpresaPorMinuto: 2 });
    const c = await reservar(pool, { tipo: "mensagem", limite: 1, workerId: "A", tetoPorEmpresaPorMinuto: 2 });
    expect([a.length, b.length, c.length]).toEqual([1, 1, 0]);
  });
});

describe("trava distribuida por job", () => {
  it("segunda instancia nao executa enquanto a primeira segura a trava; depois libera", async () => {
    let liberar!: () => void;
    const segura = new Promise<void>((r) => (liberar = r));
    const primeira = comTravaDeJob(pool, "job-x", async () => { await segura; return 1; });
    await new Promise((r) => setTimeout(r, 200));
    const segunda = await comTravaDeJob(pool, "job-x", async () => 2);
    expect(segunda.executou).toBe(false);
    const outroJob = await comTravaDeJob(pool, "job-y", async () => 3);
    expect(outroJob.executou).toBe(true);
    liberar();
    expect((await primeira).executou).toBe(true);
    const terceira = await comTravaDeJob(pool, "job-x", async () => 4);
    expect(terceira.executou).toBe(true);
  });
  it("trava e liberada mesmo se a funcao falhar", async () => {
    await expect(comTravaDeJob(pool, "job-z", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect((await comTravaDeJob(pool, "job-z", async () => 1)).executou).toBe(true);
  });
});

describe("processarLote: concorrencia 2 e prazo", () => {
  it("nunca roda mais de 2 ao mesmo tempo e conclui todos", async () => {
    await limpar();
    for (let i = 0; i < 6; i++) await enfileirar(pool, { tipo: "pdf_exame", empresaId: 1, chave: `p${i}` });
    let ativos = 0, pico = 0;
    const handler = async () => { ativos++; pico = Math.max(pico, ativos); await new Promise((r) => setTimeout(r, 80)); ativos--; };
    let concluidos = 0;
    for (let ciclo = 0; ciclo < 5; ciclo++) {
      concluidos += (await processarLote(pool, { tipo: "pdf_exame", handler, workerId: "W", concorrencia: 2, timeoutMs: 5000 })).concluidos;
    }
    expect(pico).toBeLessThanOrEqual(2);
    expect(concluidos).toBe(6);
  });
  it("dois processadores simultaneos: so um executa o ciclo", async () => {
    await limpar();
    for (let i = 0; i < 4; i++) await enfileirar(pool, { tipo: "pdf_exame", empresaId: 1, chave: `q${i}` });
    const handler = async () => { await new Promise((r) => setTimeout(r, 300)); };
    const [a, b] = await Promise.all([
      processarLote(pool, { tipo: "pdf_exame", handler, workerId: "A", timeoutMs: 5000 }),
      processarLote(pool, { tipo: "pdf_exame", handler, workerId: "B", timeoutMs: 5000 }),
    ]);
    expect([a.executou, b.executou].filter(Boolean)).toHaveLength(1);
  });
  it("estourou o prazo: aborta o sinal, registra falha e nao conclui", async () => {
    await limpar();
    const { id } = await enfileirar(pool, { tipo: "pdf_exame", empresaId: 1, chave: "lento" });
    let abortou = false;
    const handler = (_i: unknown, sinal: AbortSignal) => new Promise<void>(() => { sinal.addEventListener("abort", () => { abortou = true; }); });
    const r = await processarLote(pool, { tipo: "pdf_exame", handler, workerId: "W", timeoutMs: 150 });
    expect(r.falhas).toBe(1);
    expect(abortou).toBe(true);
    const s = await estado(id!);
    expect(s.estado).toBe("falha");
    expect(s.ultimo_erro).toContain("tempo_esgotado_150ms");
  });
  it("erro definitivo vai direto para morta", async () => {
    await limpar();
    const { id } = await enfileirar(pool, { tipo: "pdf_exame", empresaId: 1, chave: "def" });
    const r = await processarLote(pool, { tipo: "pdf_exame", handler: async () => { throw new ErroDefinitivo("payload ruim"); }, workerId: "W" });
    expect(r.mortos).toBe(1);
    expect((await estado(id!)).estado).toBe("morta");
  });
});
