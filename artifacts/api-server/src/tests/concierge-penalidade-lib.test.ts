/**
 * concierge-penalidade-lib.test.ts
 *
 * Testes de unidade do motor de penalidades (lib/concierge-penalidade.ts).
 * Cobre: getPenalidade, registrarFalha, resetarPenalidade, listPenalidades.
 *
 * Estratégia:
 *   - @workspace/db é mockado com vi.fn() inline (vi.mock é hoisted; referência
 *     a `const mockExecute` ainda não existe nesse momento).
 *   - db.execute é acessado após import via vi.mocked(db.execute).
 *   - Retornos de mock são castados para `any` — o contrato real do QueryResult
 *     (command, oid, fields) não é relevante aqui; testamos a lógica da lib.
 *   - A lib tem um singleton _tableReady (CREATE IF NOT EXISTS). beforeAll aquece
 *     o singleton uma única vez; cada teste subsequente faz apenas 1 chamada a
 *     db.execute (a query de dados), não 2.
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

// ── Mock de @workspace/db (ANTES de qualquer import da lib) ──────────────────
vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn(), transaction: vi.fn() },
}));

// ── Imports APÓS o mock ──────────────────────────────────────────────────────
import { db } from "@workspace/db";
import {
  getPenalidade,
  registrarFalha,
  resetarPenalidade,
  listPenalidades,
} from "../lib/concierge-penalidade";

// Aliases curtos para os spies já tipados.
const mockExec = () => vi.mocked(db.execute);
const mockTx   = () => vi.mocked(db.transaction);

// Helper: encapsula o cast `as any` para mocks parciais do QueryResult.
// O QueryResult real exige command/oid/fields que não importam aqui.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qr = (rows: unknown[], rowCount = rows.length): any =>
  ({ rows, rowCount });

// ── Constantes de teste ──────────────────────────────────────────────────────
const CPF_VALIDO = "12345678901"; // 11 dígitos
const CPF_CURTO  = "1234567890";  // 10 dígitos — ignorado pela lib

// ── Aquecimento dos singletons _tableReady e _auditTableReady ────────────────
// A primeira chamada a ensureTable()      faz CREATE TABLE penalidades.
// A primeira chamada a ensureAuditTable() faz CREATE TABLE auditoria.
// Após o beforeAll ambos estão quentes e os testes fazem apenas a query real.
beforeAll(async () => {
  // Passo 1: aquece _tableReady via getPenalidade
  mockExec()
    .mockResolvedValueOnce(qr([])) // CREATE TABLE penalidades
    .mockResolvedValueOnce(qr([])); // SELECT (0 linhas — fail-open)
  await getPenalidade(CPF_VALIDO);

  // Passo 2: aquece _auditTableReady via resetarPenalidade
  // ensureTable: já quente (sem execute)
  // ensureAuditTable: precisa de 1 execute (CREATE TABLE auditoria)
  // db.transaction: mockado para retornar false (CPF não encontrado no SELECT)
  mockExec().mockResolvedValueOnce(qr([])); // CREATE TABLE auditoria
  mockTx().mockImplementationOnce(async (callback) => {
    const txExec = vi.fn().mockResolvedValueOnce(qr([])); // SELECT retorna 0 linhas
    return callback({ execute: txExec });
  });
  await resetarPenalidade(CPF_VALIDO);

  vi.clearAllMocks();
});

// resetAllMocks limpa tanto o histórico de chamadas quanto as filas de
// mockResolvedValueOnce, evitando que valores não consumidos de um teste
// contaminem o próximo.
beforeEach(() => vi.resetAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// getPenalidade — fail-open para CPFs inválidos (sem chamar o banco)
// ─────────────────────────────────────────────────────────────────────────────

describe("getPenalidade — fail-open para CPFs inválidos", () => {
  it("null → penalidade zero, banco não chamado", async () => {
    const p = await getPenalidade(null);
    expect(p).toEqual({ bloqueado: false, penalidade_dias: 0, tentativas: 0 });
    expect(mockExec()).not.toHaveBeenCalled();
  });

  it("CPF de 10 dígitos → penalidade zero, banco não chamado", async () => {
    const p = await getPenalidade(CPF_CURTO);
    expect(p).toEqual({ bloqueado: false, penalidade_dias: 0, tentativas: 0 });
    expect(mockExec()).not.toHaveBeenCalled();
  });

  it("CPF formatado (com pontos/traço) → normaliza e consulta o banco", async () => {
    mockExec().mockResolvedValueOnce(qr([]));
    const p = await getPenalidade("123.456.789-01");
    expect(p).toEqual({ bloqueado: false, penalidade_dias: 0, tentativas: 0 });
    expect(mockExec()).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPenalidade — derivação correta da penalidade por número de falhas
// ─────────────────────────────────────────────────────────────────────────────

describe("getPenalidade — derivação por número de falhas", () => {
  it("sem registro no banco → penalidade zero (fail-open)", async () => {
    mockExec().mockResolvedValueOnce(qr([]));
    const p = await getPenalidade(CPF_VALIDO);
    expect(p).toEqual({ bloqueado: false, penalidade_dias: 0, tentativas: 0 });
  });

  it("1 falha → penalidade_dias=7, bloqueado=false", async () => {
    mockExec().mockResolvedValueOnce(
      qr([{ tentativas_falha: 1, bloqueado_permanente: false }]),
    );
    const p = await getPenalidade(CPF_VALIDO);
    expect(p.bloqueado).toBe(false);
    expect(p.penalidade_dias).toBe(7);
    expect(p.tentativas).toBe(1);
  });

  it("2 falhas → penalidade_dias=30, bloqueado=false", async () => {
    mockExec().mockResolvedValueOnce(
      qr([{ tentativas_falha: 2, bloqueado_permanente: false }]),
    );
    const p = await getPenalidade(CPF_VALIDO);
    expect(p.bloqueado).toBe(false);
    expect(p.penalidade_dias).toBe(30);
    expect(p.tentativas).toBe(2);
  });

  it("3 falhas → bloqueado=true (LIMITE_BLOQUEIO atingido)", async () => {
    mockExec().mockResolvedValueOnce(
      qr([{ tentativas_falha: 3, bloqueado_permanente: true }]),
    );
    const p = await getPenalidade(CPF_VALIDO);
    expect(p.bloqueado).toBe(true);
    expect(p.tentativas).toBe(3);
  });

  it("bloqueado_permanente=true sobrepõe contagem baixa → bloqueado=true", async () => {
    mockExec().mockResolvedValueOnce(
      qr([{ tentativas_falha: 1, bloqueado_permanente: true }]),
    );
    const p = await getPenalidade(CPF_VALIDO);
    expect(p.bloqueado).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registrarFalha
// ─────────────────────────────────────────────────────────────────────────────

describe("registrarFalha", () => {
  it("CPF nulo → não chama o banco", async () => {
    await registrarFalha(null);
    expect(mockExec()).not.toHaveBeenCalled();
  });

  it("CPF de 10 dígitos → não chama o banco", async () => {
    await registrarFalha(CPF_CURTO);
    expect(mockExec()).not.toHaveBeenCalled();
  });

  it("CPF válido → chama db.execute uma vez (INSERT ON CONFLICT DO UPDATE)", async () => {
    mockExec().mockResolvedValueOnce(qr([], 1));
    await registrarFalha(CPF_VALIDO);
    expect(mockExec()).toHaveBeenCalledTimes(1);
  });

  it("CPF com formatação → normaliza antes de inserir (1 chamada)", async () => {
    mockExec().mockResolvedValueOnce(qr([], 1));
    await registrarFalha("123.456.789-01");
    expect(mockExec()).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetarPenalidade
// ─────────────────────────────────────────────────────────────────────────────

// Helper para montar um mock de tx com execuções em sequência
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeTxExec = (...results: any[]) => {
  const txExec = vi.fn();
  results.forEach((r) => txExec.mockResolvedValueOnce(r));
  return txExec;
};

describe("resetarPenalidade", () => {
  it("CPF curto → retorna false, transaction não chamada", async () => {
    const r = await resetarPenalidade(CPF_CURTO);
    expect(r).toBe(false);
    expect(mockExec()).not.toHaveBeenCalled();
    expect(mockTx()).not.toHaveBeenCalled();
  });

  it("CPF válido encontrado → retorna true (SELECT retorna linha)", async () => {
    const txExec = makeTxExec(
      qr([{ tentativas_falha: 2 }]), // SELECT FOR UPDATE — linha encontrada
      qr([], 1),                      // UPDATE reset
      qr([], 1),                      // INSERT auditoria
    );
    mockTx().mockImplementationOnce(async (cb: (tx: { execute: typeof db.execute }) => Promise<boolean>) =>
      cb({ execute: txExec }),
    );
    const r = await resetarPenalidade(CPF_VALIDO);
    expect(r).toBe(true);
    expect(mockTx()).toHaveBeenCalledTimes(1);
  });

  it("CPF válido não encontrado → retorna false (SELECT retorna 0 linhas)", async () => {
    const txExec = makeTxExec(
      qr([]), // SELECT FOR UPDATE — sem resultado
    );
    mockTx().mockImplementationOnce(async (cb: (tx: { execute: typeof db.execute }) => Promise<boolean>) =>
      cb({ execute: txExec }),
    );
    const r = await resetarPenalidade(CPF_VALIDO);
    expect(r).toBe(false);
  });

  it("CPF com formatação → normaliza e opera via transaction", async () => {
    const txExec = makeTxExec(
      qr([{ tentativas_falha: 1 }]), // SELECT FOR UPDATE
      qr([], 1),                      // UPDATE
      qr([], 1),                      // INSERT audit
    );
    mockTx().mockImplementationOnce(async (cb: (tx: { execute: typeof db.execute }) => Promise<boolean>) =>
      cb({ execute: txExec }),
    );
    const r = await resetarPenalidade("123.456.789-01");
    expect(r).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listPenalidades
// ─────────────────────────────────────────────────────────────────────────────

describe("listPenalidades", () => {
  const RAW_ROW = {
    cpf_mascarado:        "123.***.***-01",
    tentativas_falha:     "3",           // banco pode devolver string
    bloqueado_permanente: true,
    ultima_falha_at:      "2026-08-12T10:00:00.000Z",
    criado_at:            "2026-08-01T00:00:00.000Z",
    atualizado_at:        "2026-08-12T10:00:00.000Z",
  };

  it("retorna array vazio quando tabela está limpa", async () => {
    mockExec().mockResolvedValueOnce(qr([]));
    const rows = await listPenalidades();
    expect(rows).toHaveLength(0);
  });

  it("mapeia tentativas_falha de string para number e preserva os demais campos", async () => {
    mockExec().mockResolvedValueOnce(qr([RAW_ROW]));
    const rows = await listPenalidades();
    expect(rows[0].tentativas_falha).toBe(3);
    expect(rows[0].bloqueado_permanente).toBe(true);
    expect(rows[0].cpf_mascarado).toBe("123.***.***-01");
  });

  it("chama db.execute uma vez com filtro quando filtro >= 3 dígitos", async () => {
    mockExec().mockResolvedValueOnce(qr([]));
    await listPenalidades("123");
    expect(mockExec()).toHaveBeenCalledTimes(1);
  });

  it("chama db.execute uma vez sem filtro quando filtro < 3 dígitos", async () => {
    mockExec().mockResolvedValueOnce(qr([]));
    await listPenalidades("12");
    expect(mockExec()).toHaveBeenCalledTimes(1);
  });
});
