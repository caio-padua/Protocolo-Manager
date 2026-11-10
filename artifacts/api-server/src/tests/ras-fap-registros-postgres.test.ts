import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

// K9 — o carregador dos registros do RAS FAP, contra um Postgres descartável (dados sintéticos).
const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("@workspace/db", () => ({
  db: new Proxy({}, {
    get(_t, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  }),
}));

import { loadProtocolRasRegistros } from "../lib/ras-fap-registros";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const exato = (id: number, clientId: number, empresaId: number | null = 5) =>
  ({ id, schedulingMode: "exact", empresaId, clientId });
const SUBS = [501, 502]; // ordem das colunas de substância

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await q(`
    CREATE TABLE sessions (id int PRIMARY KEY, empresa_id int, client_id int, protocol_id int, status text,
      week_number int, scheduled_date text);
    CREATE TABLE clients (id int PRIMARY KEY, empresa_id int, name text);
    CREATE TABLE professionals (id int PRIMARY KEY, name text);
    CREATE TABLE substance_applications (id serial PRIMARY KEY, session_id int, substance_id int, status text,
      availability text DEFAULT 'disp', applied_at text, confirmed_by int);
    INSERT INTO clients VALUES (10,5,'Caio Henrique Souza Padua'),(20,6,'Cliente Outra Clinica');
    INSERT INTO professionals VALUES (1,'Carlos Mendes'),(2,'Ana Lima');
    -- protocolo 100 (empresa 5, cliente 10): visitas 1 (aplicada), 2 (nada aplicado), 3 (cancelada), 4 (pendente)
    INSERT INTO sessions VALUES
      (1000,5,10,100,'completed',1,'2026-11-09'),
      (1001,5,10,100,'scheduled',2,'2026-11-16'),
      (1002,5,10,100,'cancelled',3,'2026-11-23'),
      (1003,null,10,100,'scheduled',4,'2026-11-30');
    -- visita 1: 502 aplicada primeiro (Ana, 01:30 UTC = 22:30 BRT do dia 09), 501 aplicada depois (Carlos)
    INSERT INTO substance_applications (session_id, substance_id, status, applied_at, confirmed_by) VALUES
      (1000,502,'applied','2026-11-10T01:30:00.000Z',2),
      (1000,501,'applied','2026-11-10T01:45:00.000Z',1),
      (1001,501,'pending',null,null),
      (1001,502,'pending',null,null),
      (1003,501,'applied','2026-11-30T12:00:00.000Z',1);
    INSERT INTO substance_applications (session_id, substance_id, status, availability, applied_at, confirmed_by) VALUES
      (1000,501,'applied','prox','2026-01-01T00:00:00.000Z',1);
  `);
  // a tabela de confirmações nasce pelo mesmo caminho do boot (ensureVisitConfirmations)
  const { ensureVisitConfirmations } = await import("../lib/ensure-visit-confirmations");
  await ensureVisitConfirmations();
}, 120_000);

afterAll(async () => { await isolated?.stop(); }, 60_000);

const setEstado = (sessionId: number, state: string, empresa = 5, cliente = 10) =>
  q(`INSERT INTO visit_confirmations (session_id, empresa_id, client_id, state) VALUES ($1,$2,$3,$4)
     ON CONFLICT (session_id) DO UPDATE SET state=EXCLUDED.state, empresa_id=EXCLUDED.empresa_id, client_id=EXCLUDED.client_id`,
    [sessionId, empresa, cliente, state]);

describe("K9 — carregador dos registros do RAS FAP", () => {
  it("T-K9-11: data e hora em Brasília, enfermeira da 1ª aplicação, aplicadas na ordem das colunas", async () => {
    const mapa = (await loadProtocolRasRegistros(exato(100, 10), SUBS))!;
    const v1 = mapa.get(1)!;
    expect(v1.dataEfetiva).toBe("09/11/2026"); // 01:30 UTC de 10/11 = 22:30 de 09/11 em Brasília
    expect(v1.hora).toBe("22:30");
    expect(v1.enfermeira).toBe("Ana Lima"); // quem registrou a mais antiga
    expect(v1.aplicadas).toEqual([true, true]);
    expect(v1.clienteNome).toBe("Caio Henrique Souza Padua");
    // a aplicação "prox" (sem disponibilidade) não entra em lugar nenhum
    expect(mapa.get(4)!.aplicadas).toEqual([true, false]);
  });

  it("T-K9-12: visita sem aplicação não mostra nada, mesmo com confirmação gravada (R8); cancelada não entra", async () => {
    await setEstado(1001, "pendente");
    const mapa = (await loadProtocolRasRegistros(exato(100, 10), SUBS))!;
    const v2 = mapa.get(2)!;
    expect(v2).toMatchObject({ dataEfetiva: null, hora: null, enfermeira: null, confirmacaoCliente: null, aplicadas: [false, false] });
    expect(mapa.has(3)).toBe(false);
    expect([...mapa.keys()]).toEqual([1, 2, 4]);
  });

  it("T-K9-13: o estado da confirmação vira a marca do cliente, só quando houve aplicação", async () => {
    const esperado: Array<[string, string | null]> = [
      ["rubrica_chave", "plena"], ["confirmada_email", "plena"], ["rubrica_desafio", "cadastro"],
      ["pendente", "aguardando"], ["nao_confirmada", "nao_confirmada"], ["sem_pedido", null], ["chave_enviada", null],
    ];
    for (const [estado, marca] of esperado) {
      await setEstado(1000, estado);
      const mapa = (await loadProtocolRasRegistros(exato(100, 10), SUBS))!;
      expect(mapa.get(1)!.confirmacaoCliente, estado).toBe(marca);
    }
  });

  it("T-K9-14: confirmação de outra empresa ou de outro cliente nunca aparece (R7)", async () => {
    await setEstado(1000, "rubrica_chave", 6, 10);
    expect((await loadProtocolRasRegistros(exato(100, 10), SUBS))!.get(1)!.confirmacaoCliente).toBeNull();
    await setEstado(1000, "rubrica_chave", 5, 20);
    expect((await loadProtocolRasRegistros(exato(100, 10), SUBS))!.get(1)!.confirmacaoCliente).toBeNull();
    await setEstado(1000, "rubrica_chave", 5, 10);
    expect((await loadProtocolRasRegistros(exato(100, 10), SUBS))!.get(1)!.confirmacaoCliente).toBe("plena");
  });

  it("T-K9-15: protocolo semanal (legado) não tem registros; tudo como era", async () => {
    expect(await loadProtocolRasRegistros({ id: 100, schedulingMode: "weekly", empresaId: 5, clientId: 10 }, SUBS)).toBeUndefined();
  });

  it("T-K9-16: recusa com erro claro em vez de ligar na linha errada (R9, F58)", async () => {
    await expect(loadProtocolRasRegistros(exato(100, 10, null), SUBS)).rejects.toThrow(/sem empresa/);
    await expect(loadProtocolRasRegistros(exato(100, 10, 6), SUBS)).rejects.toThrow(/outra empresa/);
    // cliente do protocolo que não existe nesta empresa (cliente 20 é da empresa 6)
    await q(`INSERT INTO sessions VALUES (1060,5,20,107,'scheduled',1,'2026-11-09')`);
    await expect(loadProtocolRasRegistros(exato(107, 20, 5), SUBS)).rejects.toThrow(/cliente do protocolo não encontrado/);
    await expect(loadProtocolRasRegistros(exato(100, 10), [501, 501])).rejects.toThrow(/ambígua/);
    await expect(loadProtocolRasRegistros(exato(100, 10), [])).rejects.toThrow(/ambígua/);
    // numeração duplicada e numeração ausente
    await q(`INSERT INTO sessions VALUES (1010,5,10,101,'scheduled',1,'2026-11-09'),(1011,5,10,101,'scheduled',1,'2026-11-16')`);
    await expect(loadProtocolRasRegistros(exato(101, 10), SUBS)).rejects.toThrow(/numeração das visitas ambígua/);
    await q(`INSERT INTO sessions VALUES (1020,5,10,102,'scheduled',null,'2026-11-09')`);
    await expect(loadProtocolRasRegistros(exato(102, 10), SUBS)).rejects.toThrow(/numeração das visitas ambígua/);
    // número 0 é a linha de preenchimento da folha: uma visita real com 0 nunca receberia registro
    await q(`INSERT INTO sessions VALUES (1021,5,10,104,'scheduled',0,'2026-11-09')`);
    await expect(loadProtocolRasRegistros(exato(104, 10), SUBS)).rejects.toThrow(/numeração das visitas ambígua/);
  });

  it("T-K9-18: visita ligada ao protocolo mas de OUTRO cliente da mesma empresa recusa a emissão (achado da revisão)", async () => {
    await q(`INSERT INTO clients VALUES (11,5,'Outro Cliente Mesma Empresa')`);
    await q(`INSERT INTO sessions VALUES (1040,5,11,105,'completed',1,'2026-11-09'),(1041,5,10,105,'scheduled',2,'2026-11-16')`);
    await q(`INSERT INTO substance_applications (session_id, substance_id, status, applied_at, confirmed_by) VALUES (1040,501,'applied','2026-11-09T12:00:00.000Z',1)`);
    await expect(loadProtocolRasRegistros(exato(105, 10), SUBS)).rejects.toThrow(/visita de outro cliente/);
    await q(`INSERT INTO sessions VALUES (1050,5,null,106,'scheduled',1,'2026-11-09')`);
    await expect(loadProtocolRasRegistros(exato(106, 10), SUBS)).rejects.toThrow(/visita de outro cliente/);
  });

  it("T-K9-17: hora de aplicação inválida no banco falha explicitamente", async () => {
    await q(`INSERT INTO sessions VALUES (1030,5,10,103,'scheduled',1,'2026-11-09')`);
    await q(`INSERT INTO substance_applications (session_id, substance_id, status, applied_at, confirmed_by) VALUES (1030,501,'applied','nao-e-data',1)`);
    await expect(loadProtocolRasRegistros(exato(103, 10), SUBS)).rejects.toThrow(/data de aplicação inválida/);
  });
});
