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


describe("falha após a reserva e retomada (impedir duplicação NÃO é garantir entrega)", () => {
  const carimbo = async (nome: string) => (await poolA.query(`SELECT value FROM app_settings WHERE key=$1`, [PREFIXO_CARIMBO + nome])).rows[0]?.value as string | undefined;

  it("tarefa que falha: o carimbo da reserva permanece e OUTRO processo não repete dentro da janela (no máximo uma vez por janela)", async () => {
    let tentativas = 0, relogio = 5_000_000;
    await expect(executarUmaVezPorJanela("t-falha-reserva", 60_000, async () => { tentativas++; throw new Error("envio-falhou"); }, { pool: poolA as any, agora: () => relogio })).rejects.toThrow("envio-falhou");
    expect(await carimbo("t-falha-reserva")).toBe(String(relogio));
    relogio += 10_000; // ainda dentro da janela
    const r = await executarUmaVezPorJanela("t-falha-reserva", 60_000, async () => { tentativas++; }, { pool: poolB as any, agora: () => relogio });
    expect(r).toEqual({ executou: false, motivo: "janela_nao_vencida" });
    expect(tentativas, "não houve segunda tentativa na janela: isto impede duplicação, mas a entrega ficou pendente").toBe(1);
  });

  it("retomada: vencida a janela, qualquer processo tenta de novo e, tendo sucesso, a entrega acontece", async () => {
    let entregas = 0, relogio = 6_000_000;
    await expect(executarUmaVezPorJanela("t-retoma", 60_000, async () => { throw new Error("falha"); }, { pool: poolA as any, agora: () => relogio })).rejects.toThrow();
    relogio += 61_000;
    const r = await executarUmaVezPorJanela("t-retoma", 60_000, async () => { entregas++; return "ok"; }, { pool: poolB as any, agora: () => relogio });
    expect(r).toEqual({ executou: true, valor: "ok" });
    expect(entregas).toBe(1);
    expect(await carimbo("t-retoma")).toBe(String(relogio));
    // e a repetição imediata volta a ser barrada
    expect((await executarUmaVezPorJanela("t-retoma", 60_000, async () => { entregas++; }, { pool: poolA as any, agora: () => relogio + 1000 })).executou).toBe(false);
    expect(entregas).toBe(1);
  });

  it("processo que morre no meio da tarefa: a trava é solta pelo PostgreSQL, a reserva fica, e só a janela vencida libera a retomada", async () => {
    const poolMorre = new pg.Pool({ connectionString: banco.url, max: 1 });
    poolMorre.on("error", () => {});
    // a queda simulada chega como evento de erro da conexão emprestada; é esperada e não deve derrubar o teste
    const poolComTratamento = { connect: async () => { const c = await poolMorre.connect(); c.on("error", () => {}); return c; } };
    let relogio = 7_000_000, pidDaTarefa = 0, entregas = 0;
    const executando = executarUmaVezPorJanela("t-morte", 60_000, async () => {
      const pid = (await poolA.query(`SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=19872027 AND granted LIMIT 1`)).rows[0]?.pid;
      pidDaTarefa = pid ? 1 : 0; // a trava existe e tem dono enquanto a tarefa roda
      await poolA.query("SELECT pg_terminate_backend($1)", [pid]); // simula queda do processo
      await dorme(200);
      throw new Error("conexão perdida");
    }, { pool: poolComTratamento as any, agora: () => relogio }).catch(() => "caiu");
    expect(await executando).toBe("caiu");
    expect(pidDaTarefa).toBe(1);
    await Promise.race([poolMorre.end().catch(() => {}), dorme(500)]);
    expect(await carimbo("t-morte")).toBe(String(relogio));
    const livre = await poolB.query("SELECT pg_try_advisory_lock(19872027, hashtext('t-morte')) AS ok");
    expect(livre.rows[0].ok, "trava não ficou presa").toBe(true);
    await poolB.query("SELECT pg_advisory_unlock_all()");
    const dentro = await executarUmaVezPorJanela("t-morte", 60_000, async () => { entregas++; }, { pool: poolB as any, agora: () => relogio + 5_000 });
    expect(dentro).toEqual({ executou: false, motivo: "janela_nao_vencida" });
    const depois = await executarUmaVezPorJanela("t-morte", 60_000, async () => { entregas++; }, { pool: poolB as any, agora: () => relogio + 61_000 });
    expect(depois.executou).toBe(true);
    expect(entregas).toBe(1);
  });

  it("agendador: falha de um disparo é registrada, não derruba o agendador, e a próxima janela retoma", async () => {
    const lista: Array<() => Promise<void>> = []; const logs: string[] = [];
    let relogio = 8_000_000, n = 0;
    const falso = { schedule: (_e: string, fn: any) => { lista.push(fn); } };
    agendadorExclusivo(falso, "retoma", { pool: poolA as any, agora: () => relogio, log: (m) => logs.push(m) })
      .schedule("* * * * *", async () => { n++; if (n === 1) throw new Error("primeira falha"); });
    await lista[0]();
    expect(logs.some((m) => m.includes("falhou"))).toBe(true);
    await lista[0](); // dentro da janela de 48 s: barrado
    expect(n).toBe(1);
    relogio += 60_000;
    await lista[0]();
    expect(n).toBe(2);
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
