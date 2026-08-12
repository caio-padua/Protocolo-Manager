/**
 * concierge-penalidade.test.ts
 *
 * Testes de unidade + integração controlada da lógica de penalidade do Concierge.
 *
 * Cenários cobertos:
 *  1. CPF sem registro → penalidade_dias=0, bloqueado=false
 *  2. 1 falha  → penalidade_dias=7, bloqueado=false
 *  3. 2 falhas → penalidade_dias=30, bloqueado=false
 *  4. 3 falhas → bloqueado=true (tentativas=3)
 *  5. 4ª falha em cima de bloqueado → permanece bloqueado (não vai para pior)
 *  6. CPF inválido (<11 dígitos) → ignorado, sem penalidade, sem tocar banco
 *  7. Transição de estado real (0→7→30→bloqueado) via chamadas sucessivas
 *     a registrarFalha() + getPenalidade() sobre mock stateful
 *
 * Nota sobre o singleton _tableReady:
 *   ensureTable() guarda uma Promise por processo (singleton).
 *   Após o primeiro teste que acessa o DB, ensureTable vira no-op.
 *   Por isso usamos mockResolvedValue (default) em vez de mockResolvedValueOnce,
 *   e o mock stateful discrimina INSERT vs SELECT via conteúdo do template SQL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mocks ANTES do vi.mock (evita "Cannot access before initialization") ─
const { mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
}));

// ── Mock do @workspace/db ─────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: { execute: mockExecute, transaction: mockTransaction },
  professionalsTable: {},
  agendaResourcesTable: {},
  schedulingRequestsTable: {},
  professionalAreasTable: {},
  professionalSpecialtiesTable: {},
  clientsTable: {},
}));

// ── Mock mínimo de drizzle-orm (sql tagged template) ─────────────────────────
// sql`...` chama a função com (TemplateStringsArray, ...values).
// Retornamos os args como array, o que nos permite inspecionar o SQL no mock.
vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (...args: unknown[]) => args,
    { raw: (s: string) => s },
  ),
}));

// ── Importação após os mocks ──────────────────────────────────────────────────
import { getPenalidade, registrarFalha, resetarPenalidade } from "../lib/concierge-penalidade.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Configura mockExecute para devolver um row de penalidade específico. */
function mockRow(tentativas: number, bloqueado: boolean): void {
  mockExecute.mockResolvedValue({
    rows: [{ tentativas_falha: tentativas, bloqueado_permanente: bloqueado }],
  });
}

/** Configura mockExecute para devolver vazio (CPF sem registro). */
function mockEmpty(): void {
  mockExecute.mockResolvedValue({ rows: [] });
}

/**
 * Retorna o conteúdo do template SQL da chamada ao DB.
 * Como sql`...` é mockado como (...args) => args, o primeiro argumento de
 * db.execute() é [TemplateStringsArray, ...values]. A TemplateStringsArray
 * contém as partes fixas do SQL (INSERT, SELECT, CREATE TABLE, etc.).
 */
function sqlContentOf(query: unknown): string {
  if (!Array.isArray(query)) return "";
  const templateParts = query[0];
  if (!Array.isArray(templateParts)) return "";
  return templateParts.join(" ").toUpperCase();
}

/**
 * Cria um mockImplementation stateful que simula o comportamento do banco:
 * - CREATE TABLE → no-op
 * - CTE atômico (WITH DEDUP AS … INSERT … FROM dedup):
 *     detectado quando o SQL contém "WITH DEDUP AS" ou ambas as tabelas.
 *     Com idempotentEvents=true: 2ª chamada com mesmo eventId → rowCount=0 (no-op).
 *     Com idempotentEvents=false: sempre incrementa (cada CTE conta como nova falha).
 * - INSERT INTO concierge_penalidades (legado, sem CTE) → incrementa
 * - SELECT → devolve estado atual
 */
function makeStatefulMock(opts?: { idempotentEvents?: boolean }) {
  const state = { tentativas: 0, bloqueado: false };
  const processedEvents = new Set<string>();

  mockExecute.mockImplementation(async (query: unknown) => {
    const sqlStr = sqlContentOf(query);

    if (sqlStr.includes("CREATE TABLE")) {
      return { rows: [], rowCount: 0 };
    }

    // ── CTE atômico: contém o dedup de eventos + upsert de penalidade ────────
    // query = [TemplateStringsArray, eventId, cpf, cpf, LIMITE_BLOQUEIO]
    if (sqlStr.includes("WITH DEDUP AS") || sqlStr.includes("FROM DEDUP")) {
      const args = query as unknown[];
      // O primeiro valor interpolado é o eventId
      const eventId = String(args[1] ?? "");
      if (opts?.idempotentEvents && processedEvents.has(eventId)) {
        // Simula ON CONFLICT DO NOTHING no dedup → SELECT FROM dedup → 0 linhas → penalty não dispara
        return { rows: [], rowCount: 0 };
      }
      processedEvents.add(eventId);
      // Evento novo: incrementa a penalidade
      state.tentativas++;
      if (state.tentativas >= 3) state.bloqueado = true;
      return { rows: [], rowCount: 1 };
    }

    // ── INSERT legado (sem eventId) ───────────────────────────────────────────
    if (sqlStr.includes("INSERT INTO CONCIERGE_PENALIDADES")) {
      state.tentativas++;
      if (state.tentativas >= 3) state.bloqueado = true;
      return { rows: [], rowCount: 1 };
    }

    if (sqlStr.includes("SELECT")) {
      if (state.tentativas === 0) return { rows: [], rowCount: 0 };
      return {
        rows: [{
          tentativas_falha:     state.tentativas,
          bloqueado_permanente: state.bloqueado,
        }],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  return state;
}

const CPF_VALIDO   = "12345678901"; // 11 dígitos
const CPF_INVALIDO = "123456789";   // 9 dígitos

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 1 — getPenalidade: leitura do estado (rows injetados)
// ─────────────────────────────────────────────────────────────────────────────
describe("getPenalidade — leitura do estado de penalidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [] }); // default seguro
  });

  it("Cenário 1 — CPF sem registro → sem penalidade", async () => {
    mockEmpty();
    const pen = await getPenalidade(CPF_VALIDO);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(0);
    expect(pen.tentativas).toBe(0);
  });

  it("Cenário 2 — 1 falha → +7 dias, não bloqueado", async () => {
    mockRow(1, false);
    const pen = await getPenalidade(CPF_VALIDO);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(7);
    expect(pen.tentativas).toBe(1);
  });

  it("Cenário 3 — 2 falhas → +30 dias, não bloqueado", async () => {
    mockRow(2, false);
    const pen = await getPenalidade(CPF_VALIDO);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(30);
    expect(pen.tentativas).toBe(2);
  });

  it("Cenário 4 — 3 falhas → bloqueado", async () => {
    mockRow(3, true);
    const pen = await getPenalidade(CPF_VALIDO);
    expect(pen.bloqueado).toBe(true);
    expect(pen.tentativas).toBe(3);
  });

  it("Cenário 5 — 4 falhas sobre bloqueado → permanece bloqueado, penalidade_dias=0", async () => {
    mockRow(4, true);
    const pen = await getPenalidade(CPF_VALIDO);
    expect(pen.bloqueado).toBe(true);
    expect(pen.tentativas).toBe(4);
    expect(pen.penalidade_dias).toBe(0); // bloqueado não aplica offset
  });

  it("Cenário 6 — CPF inválido (<11 dígitos) → sem penalidade, sem tocar banco", async () => {
    const callsBefore = mockExecute.mock.calls.length;
    const pen = await getPenalidade(CPF_INVALIDO);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(0);
    expect(pen.tentativas).toBe(0);
    expect(mockExecute.mock.calls.length).toBe(callsBefore); // banco não foi chamado
  });

  it("Cenário 6b — CPF null → sem penalidade", async () => {
    const pen = await getPenalidade(null);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(0);
  });

  it("Cenário 6c — CPF undefined → sem penalidade", async () => {
    const pen = await getPenalidade(undefined);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(0);
  });

  it("Cenário 6d — CPF com pontuação mas 11 dígitos → normalizado e consultado", async () => {
    mockRow(1, false);
    const pen = await getPenalidade("123.456.789-01"); // normaliza para "12345678901"
    expect(pen.penalidade_dias).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 2 — registrarFalha: escrita no banco
// ─────────────────────────────────────────────────────────────────────────────
describe("registrarFalha — incremento de tentativas no banco", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [] });
  });

  it("CPF válido → acessa o banco (INSERT/ON CONFLICT)", async () => {
    await registrarFalha(CPF_VALIDO);
    expect(mockExecute).toHaveBeenCalled();
  });

  it("CPF inválido → NÃO chama o banco", async () => {
    await registrarFalha(CPF_INVALIDO);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("CPF null → NÃO chama o banco", async () => {
    await registrarFalha(null);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("CPF com pontuação mas 11 dígitos → normalizado e acessa banco", async () => {
    const callsBefore = mockExecute.mock.calls.length;
    await registrarFalha("123.456.789-01");
    expect(mockExecute.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 3 — Tabela de verdade dos dias de penalidade
// ─────────────────────────────────────────────────────────────────────────────
describe("Tabela de penalidade — 0/7/30/bloqueado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [] });
  });

  const casos: Array<[number, boolean, number, boolean]> = [
    [0, false,  0, false],
    [1, false,  7, false],
    [2, false, 30, false],
    [3, true,   0, true ],
    [5, true,   0, true ],
  ];

  for (const [t, permanente, diasEsperado, bloqEsperado] of casos) {
    it(`tentativas=${t} permanente=${permanente} → dias=${diasEsperado} bloqueado=${bloqEsperado}`, async () => {
      mockRow(t, permanente);
      const pen = await getPenalidade(CPF_VALIDO);
      expect(pen.penalidade_dias).toBe(diasEsperado);
      expect(pen.bloqueado).toBe(bloqEsperado);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 4 — Transição de estado real: registrarFalha → getPenalidade (stateful)
//
// Este bloco prova que o UPSERT de registrarFalha() produz a progressão
// correta de penalidade quando chamado repetidamente sobre o mesmo CPF.
// O mock simula exatamente o comportamento do Postgres: INSERT + ON CONFLICT.
// ─────────────────────────────────────────────────────────────────────────────
describe("Transição de estado via registrarFalha() + getPenalidade() — stateful", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Progressão completa 0→1(+7d)→2(+30d)→3(bloqueado)→4(ainda bloqueado)", async () => {
    makeStatefulMock();
    const CPF = "33333333333";

    // Estado inicial: sem registro → sem penalidade
    let pen = await getPenalidade(CPF);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(0);
    expect(pen.tentativas).toBe(0);

    // 1ª falha → +7 dias
    await registrarFalha(CPF);
    pen = await getPenalidade(CPF);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(7);
    expect(pen.tentativas).toBe(1);

    // 2ª falha → +30 dias
    await registrarFalha(CPF);
    pen = await getPenalidade(CPF);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(30);
    expect(pen.tentativas).toBe(2);

    // 3ª falha → bloqueado permanente
    await registrarFalha(CPF);
    pen = await getPenalidade(CPF);
    expect(pen.bloqueado).toBe(true);
    expect(pen.penalidade_dias).toBe(0);
    expect(pen.tentativas).toBe(3);

    // 4ª falha em cima de bloqueado → permanece bloqueado (sem piorar)
    await registrarFalha(CPF);
    pen = await getPenalidade(CPF);
    expect(pen.bloqueado).toBe(true);
    expect(pen.tentativas).toBe(4);
  });

  it("CPF inválido nunca altera o estado mesmo com múltiplas chamadas", async () => {
    makeStatefulMock();
    const CPF_CURTO = "99999";

    await registrarFalha(CPF_CURTO);
    await registrarFalha(CPF_CURTO);
    await registrarFalha(CPF_CURTO);

    // Banco não foi chamado
    expect(mockExecute).not.toHaveBeenCalled();

    // Consultando o mesmo CPF curto → sem penalidade
    const pen = await getPenalidade(CPF_CURTO);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 5 — resetarPenalidade: transação atômica com auditoria
//
// resetarPenalidade() usa db.transaction(). O mock de transaction recebe um
// callback e executa-o com um objeto `tx` que simula SELECT/UPDATE/INSERT via
// um mockTx.execute controlável por cada teste.
// ─────────────────────────────────────────────────────────────────────────────
describe("resetarPenalidade — transação atômica + registro de auditoria", () => {
  /** Cria um tx mock com execute configurável e passa para o callback. */
  function setupTransaction(txExecute: ReturnType<typeof vi.fn>) {
    mockTransaction.mockImplementation(async (callback: (tx: { execute: typeof txExecute }) => Promise<unknown>) => {
      return callback({ execute: txExecute });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // ensureTable e ensureAuditTable chamam db.execute; por padrão retornam vazio
    mockExecute.mockResolvedValue({ rows: [] });
  });

  it("CPF inválido (<11 dígitos) → retorna false sem chamar transaction", async () => {
    const result = await resetarPenalidade("99999999", "CEO");
    expect(result).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("CPF não encontrado no banco → retorna false sem fazer UPDATE/INSERT", async () => {
    const txExecute = vi.fn().mockResolvedValue({ rows: [] }); // SELECT FOR UPDATE → vazio
    setupTransaction(txExecute);

    const result = await resetarPenalidade(CPF_VALIDO, "CEO");

    expect(result).toBe(false);
    // Apenas o SELECT FOR UPDATE foi chamado (1 chamada); UPDATE e INSERT não foram executados.
    // Nota: sqlContentOf do SELECT FOR UPDATE contém "UPDATE" como substring —
    // por isso verificamos contagem de calls (1) ao invés de ausência da palavra "UPDATE".
    expect(txExecute).toHaveBeenCalledTimes(1);
    const sqls = txExecute.mock.calls.map(([q]: [unknown]) => sqlContentOf(q));
    expect(sqls[0]).toContain("SELECT");
    expect(sqls.some((s) => s.includes("INSERT"))).toBe(false);
  });

  it("Reset bem-sucedido → retorna true e registra tentativas_anteriores corretas", async () => {
    const TENTATIVAS = 2;
    const txExecute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ tentativas_falha: TENTATIVAS }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                    // UPDATE
      .mockResolvedValueOnce({ rows: [] });                                // INSERT auditoria

    setupTransaction(txExecute);

    const result = await resetarPenalidade(CPF_VALIDO, "CEO");

    expect(result).toBe(true);

    // Verifica que os 3 statements foram emitidos na ordem certa
    const sqls = txExecute.mock.calls.map(([q]: [unknown]) => sqlContentOf(q));
    expect(sqls[0]).toContain("SELECT");
    expect(sqls[1]).toContain("UPDATE");
    expect(sqls[2]).toContain("INSERT");

    // O INSERT de auditoria recebe tentativas_anteriores = TENTATIVAS
    // Como sql é mockado como (...args)=>args, os valores interpolados ficam nos args[1..n]
    const insertArgs = txExecute.mock.calls[2][0] as unknown[];
    const interpolated = insertArgs.slice(1); // valores interpolados
    expect(interpolated).toContain(TENTATIVAS);
  });

  it("Falha no INSERT de auditoria → transaction propaga o erro (rollback implícito)", async () => {
    const txExecute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ tentativas_falha: 3 }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })            // UPDATE
      .mockRejectedValueOnce(new Error("auditoria indisponível")); // INSERT falha

    setupTransaction(txExecute);

    // A transação deve rejeitar; o chamador recebe o erro
    await expect(resetarPenalidade(CPF_VALIDO, "CEO")).rejects.toThrow("auditoria indisponível");
  });

  it("Reset de CPF bloqueado (3 tentativas) registra tentativas_anteriores=3", async () => {
    const txExecute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ tentativas_falha: 3 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    setupTransaction(txExecute);

    const result = await resetarPenalidade(CPF_VALIDO, "Operador");

    expect(result).toBe(true);
    const insertArgs = txExecute.mock.calls[2][0] as unknown[];
    const interpolated = insertArgs.slice(1);
    expect(interpolated).toContain(3);          // tentativas_anteriores
    expect(interpolated).toContain("Operador"); // resetado_por
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 6 — Idempotência por eventId: reenvio do webhook não duplica penalidade
//
// Prova que chamar registrarFalha(cpf, eventId) duas vezes com o MESMO eventId
// só incrementa tentativas_falha uma vez. O mock stateful com idempotentEvents=true
// simula o ON CONFLICT DO NOTHING da tabela concierge_webhook_eventos.
// ─────────────────────────────────────────────────────────────────────────────
describe("registrarFalha com eventId — idempotência contra reenvios do Asaas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Mesmo eventId enviado duas vezes → tentativas incrementadas apenas uma vez", async () => {
    const state = makeStatefulMock({ idempotentEvents: true });
    const CPF = "44444444444";
    const EVENT_ID = "PAYMENT_OVERDUE:pay_abc123";

    // 1ª chamada: evento novo → deve registrar a falha
    await registrarFalha(CPF, EVENT_ID);
    expect(state.tentativas).toBe(1);

    // 2ª chamada: mesmo eventId → ON CONFLICT DO NOTHING → NÃO incrementa
    await registrarFalha(CPF, EVENT_ID);
    expect(state.tentativas).toBe(1); // permanece 1, não vai para 2

    // Confirma via getPenalidade: +7 dias (1 falha), não bloqueado
    const pen = await getPenalidade(CPF);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(7);
    expect(pen.tentativas).toBe(1);
  });

  it("EventIds diferentes → cada um incrementa normalmente", async () => {
    const state = makeStatefulMock({ idempotentEvents: true });
    const CPF = "55555555555";

    await registrarFalha(CPF, "PAYMENT_OVERDUE:pay_111");
    expect(state.tentativas).toBe(1);

    await registrarFalha(CPF, "PAYMENT_DELETED:pay_222");
    expect(state.tentativas).toBe(2);

    const pen = await getPenalidade(CPF);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(30); // 2 falhas → +30 dias
    expect(pen.tentativas).toBe(2);
  });

  it("Sem eventId → comportamento legado (incrementa sempre)", async () => {
    const state = makeStatefulMock({ idempotentEvents: true });
    const CPF = "66666666666";

    await registrarFalha(CPF); // sem eventId
    await registrarFalha(CPF); // sem eventId
    // Sem guarda de evento: ambas as chamadas incrementam
    expect(state.tentativas).toBe(2);
  });

  it("Reenvio em série do mesmo overdue de concierge não leva a bloqueio prematuro", async () => {
    // Simula o Asaas reenviando PAYMENT_OVERDUE 5 vezes para a mesma cobrança.
    // Com idempotência: apenas a 1ª conta. Sem idempotência: o paciente seria
    // bloqueado após a 3ª.
    const state = makeStatefulMock({ idempotentEvents: true });
    const CPF = "77777777777";
    const EVENT_ID = "PAYMENT_OVERDUE:pay_reenvio";

    for (let i = 0; i < 5; i++) {
      await registrarFalha(CPF, EVENT_ID);
    }

    // Só 1 falha registrada, não 5
    expect(state.tentativas).toBe(1);
    expect(state.bloqueado).toBe(false);

    const pen = await getPenalidade(CPF);
    expect(pen.bloqueado).toBe(false);
    expect(pen.penalidade_dias).toBe(7); // 1 falha → +7 dias
  });
});
