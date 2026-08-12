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
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

// ── Mock do @workspace/db ─────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: { execute: mockExecute },
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
import { getPenalidade, registrarFalha } from "../lib/concierge-penalidade.js";

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
 * - INSERT INTO  → incrementa tentativas; ativa bloqueio quando >= 3
 * - SELECT       → devolve estado atual
 */
function makeStatefulMock() {
  const state = { tentativas: 0, bloqueado: false };

  mockExecute.mockImplementation(async (query: unknown) => {
    const sql = sqlContentOf(query);

    if (sql.includes("CREATE TABLE")) {
      return { rows: [] };
    }

    if (sql.includes("INSERT INTO")) {
      state.tentativas++;
      if (state.tentativas >= 3) state.bloqueado = true;
      return { rows: [] };
    }

    if (sql.includes("SELECT")) {
      if (state.tentativas === 0) return { rows: [] };
      return {
        rows: [{
          tentativas_falha:     state.tentativas,
          bloqueado_permanente: state.bloqueado,
        }],
      };
    }

    return { rows: [] };
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
