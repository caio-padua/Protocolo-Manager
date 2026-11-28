/**
 * Exclusividade de tarefas entre processos: PostgreSQL descartável, DUAS conexões independentes (simulam API e worker/réplicas).
 * Nenhuma mensagem real; as tarefas aqui só contam execuções.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { executarUmaVezPorJanela, agendadorExclusivo, janelaDaExpressao, PREFIXO_CARIMBO } from "../lib/exclusividade-tarefas";

const banco = iniciarPgDescartavel();
const poolA = new pg.Pool({ connectionString: banco.url, max: 4 });
const poolB = new pg.Pool({ connectionString: banco.url, max: 4 });
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await poolA.query(`CREATE TABLE app_settings (key text PRIMARY KEY, value text, updated_at timestamptz NOT NULL DEFAULT now())`);
});
afterAll(async () => { await poolA.end(); await poolB.end(); banco.parar(); });

describe("uma execução por janela entre processos", () => {
  it("duas conexões disparando ao mesmo tempo: só uma executa", async () => {
    let n = 0;
    const tarefa = async () => { n++; await dorme(150); };
    const [a, b] = await Promise.all([
      executarUmaVezPorJanela("t-simultanea", 60_000, tarefa, { pool: poolA as any }),
      executarUmaVezPorJanela("t-simultanea", 60_000, tarefa, { pool: poolB as any }),
    ]);
    expect(n).toBe(1);
    expect([a.executou, b.executou].sort()).toEqual([false, true]);
    const perdedora = a.executou ? b : a;
    expect((perdedora as any).motivo).toBe("trava_ocupada");
  });
  it("outro processo logo depois, dentro da janela: não repete", async () => {
    let n = 0;
    await executarUmaVezPorJanela("t-sequencial", 60_000, async () => { n++; }, { pool: poolA as any });
    const r = await executarUmaVezPorJanela("t-sequencial", 60_000, async () => { n++; }, { pool: poolB as any });
    expect(n).toBe(1);
    expect(r).toEqual({ executou: false, motivo: "janela_nao_vencida" });
  });
  it("janela vencida: executa de novo (a tarefa não fica presa)", async () => {
    let n = 0, relogio = 1_000_000;
    const o = { pool: poolA as any, agora: () => relogio };
    await executarUmaVezPorJanela("t-vence", 60_000, async () => { n++; }, o);
    relogio += 61_000;
    const r = await executarUmaVezPorJanela("t-vence", 60_000, async () => { n++; }, { pool: poolB as any, agora: () => relogio });
    expect(r.executou).toBe(true); expect(n).toBe(2);
  });
  it("nomes diferentes não se bloqueiam", async () => {
    let n = 0;
    const [a, b] = await Promise.all(["t-x", "t-y"].map((nome) => executarUmaVezPorJanela(nome, 60_000, async () => { n++; await dorme(50); }, { pool: poolA as any })));
    expect(a.executou && b.executou).toBe(true); expect(n).toBe(2);
  });
  it("a trava é solta mesmo quando a tarefa falha, e o erro da tarefa é propagado", async () => {
    await expect(executarUmaVezPorJanela("t-falha", 1, async () => { throw new Error("falha-propria"); }, { pool: poolA as any })).rejects.toThrow("falha-propria");
    const livre = await poolB.query("SELECT pg_try_advisory_lock(19872027, hashtext('t-falha')) AS ok");
    expect(livre.rows[0].ok).toBe(true);
    await poolB.query("SELECT pg_advisory_unlock_all()");
  });
  it("sem conexão com o banco: NÃO executa (nunca por via das dúvidas)", async () => {
    let n = 0; const mensagens: string[] = [];
    const quebrado = { connect: async () => { throw new Error("sem banco"); } };
    const r = await executarUmaVezPorJanela("t-sem-banco", 1000, async () => { n++; }, { pool: quebrado as any, log: (m) => mensagens.push(m) });
    expect(n).toBe(0); expect(r).toEqual({ executou: false, motivo: "erro_de_controle" });
    expect(mensagens.length).toBe(1);
  });
  it("estado do banco: um carimbo por tarefa, só com o prefixo próprio e sem dados de cliente", async () => {
    const r = await poolA.query(`SELECT key, value FROM app_settings ORDER BY key`);
    expect(r.rows.length).toBeGreaterThanOrEqual(5);
    for (const x of r.rows) { expect(x.key.startsWith(PREFIXO_CARIMBO)).toBe(true); expect(/^\d+$/.test(x.value)).toBe(true); }
  });
});

describe("agendador exclusivo (duas réplicas do mesmo código)", () => {
  it("o mesmo disparo cron em dois agendadores executa o job uma vez só", async () => {
    const falso = (lista: Array<() => Promise<void>>) => ({ schedule: (_e: string, fn: any) => { lista.push(fn); } });
    const listaA: Array<() => Promise<void>> = [], listaB: Array<() => Promise<void>> = [];
    let n = 0;
    const job = async () => { n++; await dorme(100); };
    agendadorExclusivo(falso(listaA), "rep", { pool: poolA as any }).schedule("* * * * *", job);
    agendadorExclusivo(falso(listaB), "rep", { pool: poolB as any }).schedule("* * * * *", job);
    await Promise.all([listaA[0](), listaB[0]()]);
    expect(n).toBe(1);
    await Promise.all([listaA[0](), listaB[0]()]); // próximo disparo dentro da janela de 48 s
    expect(n).toBe(1);
  });
  it("janela derivada da expressão", () => {
    expect(janelaDaExpressao("* * * * *")).toBe(48_000);
    expect(janelaDaExpressao("*/3 * * * *")).toBe(144_000);
    expect(janelaDaExpressao("*/30 * * * * *")).toBe(24_000);
    expect(janelaDaExpressao("0 22 * * *")).toBe(20 * 60_000);
  });
});
