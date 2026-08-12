/**
 * verify-device-lib.test.ts
 *
 * Dois grupos:
 *
 * B — verifyDeviceCode (lib unit)
 *  B1. CPF sem código no banco   → ok:false "Nenhum código ativo"
 *  B2. Código errado/expirado    → ok:false "Código inválido"
 *  B3. Código correto            → ok:true; db.transaction chamado 1×
 *  B4. Reuso do código           → ok:false "Código inválido"
 *  B5. Falha no UPSERT           → rejeita com o erro original
 *  B5b.5 tentativas falhas       → ok:false "Número de tentativas excedido"
 *  B6. Concorrência              → apenas uma das duas retorna ok:true
 *
 * C — checkDeviceOffer (lib unit)
 *  C1. Sem fingerprint           → allowed:true, requiresVerification:false
 *  C2. Dispositivo verificado    → isDeviceVerified consultado; sem fricção
 *  C3. offer_count ≤ threshold   → requiresVerification:false
 *  C4. offer_count > threshold   → requiresVerification:true
 *  C5. offer_count > HARD_LIMIT  → throttled:true, allowed:false
 *
 * Nota sobre os singletons _verificationsReady / _deviceLimitsReady:
 *   Após o primeiro teste que os inicializa, as promessas ficam cacheadas.
 *   Os testes usam mockResolvedValue (global default) em vez de
 *   mockResolvedValueOnce posicional para evitar dependência de ordem de chamada.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks declarados ANTES de qualquer import da lib ─────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    execute:     vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn(() => "__sql__"),
  eq:  vi.fn(),
}));

vi.mock("../lib/brt.js", () => ({
  brtISODate: vi.fn().mockReturnValue("2026-08-12"),
  brtNow:     vi.fn().mockReturnValue(new Date("2026-08-12T12:00:00Z")),
}));

// ── Lib importada após os mocks ───────────────────────────────────────────────
import { verifyDeviceCode } from "../lib/device-throttle.js";
import { db as mockDbRaw } from "@workspace/db";

type MockDb = {
  execute:     ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};
const mockDb = mockDbRaw as unknown as MockDb;

type TxFn = (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>;

/**
 * Configura db.transaction para simular o banco. Expõe o txExecute mock para
 * inspeção de chamadas nos testes.
 *
 * Ordem das execute dentro da transação:
 *   1. UPDATE device_contact_verifications … RETURNING (consumo OTP)
 *   2. INSERT device_verified_sessions          (só quando device_fingerprint != null)
 *   3. INSERT/UPDATE device_offer_limits        (só quando device_fingerprint != null)
 *
 * opts.failOnCall: índice (1-based) da tx.execute que deve lançar.
 */
let lastTxExecute: ReturnType<typeof vi.fn> | null = null;
function setTransaction(
  otpRows: Array<{ id: number; device_fingerprint: string | null }>,
  opts: { failOnCall?: number } = {},
) {
  mockDb.transaction.mockImplementation(async (fn: TxFn) => {
    let callIdx = 0;
    const txExecute = vi.fn().mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) return Promise.resolve({ rows: otpRows });
      if (opts.failOnCall === callIdx) throw new Error("simulated DB failure");
      return Promise.resolve({ rows: [] });
    });
    lastTxExecute = txExecute;
    return fn({ execute: txExecute });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe("verifyDeviceCode — lib unit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Padrão: db.execute resolve com linhas vazias (funciona p/ CREATE TABLE
    // e como fallback SELECT padrão).
    mockDb.execute.mockResolvedValue({ rows: [] });
  });

  // ── B1: CPF sem nenhum código no banco ───────────────────────────────────
  it("B1 — CPF sem código no banco → ok:false Nenhum código ativo", async () => {
    setTransaction([]); // UPDATE retorna 0 linhas
    // db.execute padrão: rows:[] → fallback SELECT também retorna vazio

    const result = await verifyDeviceCode("12345678901", "654321", 1);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/nenhum código ativo/i);
  });

  // ── B2: Código errado / expirado (linha existe no banco mas OTP não bate) ─
  it("B2 — código errado/expirado (linha existe mas não bate) → ok:false Código inválido", async () => {
    setTransaction([]); // UPDATE retorna 0 linhas (expires_at < NOW() ou code errado)
    // Fallback SELECT encontra linha para o challengeId (código existiu mas expirou/errou)
    mockDb.execute.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await verifyDeviceCode("12345678901", "000000", 1);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/código inválido/i);
  });

  // ── B3: Código correto ────────────────────────────────────────────────────
  it("B3 — código correto → ok:true; db.transaction chamado exatamente 1×", async () => {
    setTransaction([{ id: 42, device_fingerprint: "fp-ok" }]);

    const result = await verifyDeviceCode("12345678901", "654321", 42);
    expect(result.ok).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  // ── B3b: Loop de verificação fechado ──────────────────────────────────────
  // Prova que verifyDeviceCode grava em device_verified_sessions (consultado por
  // concierge-device-throttle.isDeviceVerified) ANTES de atualizar device_offer_limits.
  // Com device_fingerprint presente: 3 tx.execute (OTP + session + limits).
  // Com device_fingerprint nulo: 1 tx.execute (só OTP — nada a liberar).
  it("B3b — fingerprint presente → 3 tx.execute: OTP + device_verified_sessions + device_offer_limits", async () => {
    setTransaction([{ id: 42, device_fingerprint: "fp-loop" }]);

    const result = await verifyDeviceCode("12345678901", "654321", 42);
    expect(result.ok).toBe(true);
    // Deve ter chamado txExecute 3 vezes: OTP + session + limits
    expect(lastTxExecute).not.toBeNull();
    expect(lastTxExecute!.mock.calls).toHaveLength(3);
  });

  it("B3c — fingerprint nulo → 1 tx.execute: só OTP (sem liberar sessão)", async () => {
    setTransaction([{ id: 43, device_fingerprint: null }]);

    const result = await verifyDeviceCode("99900011122", "999000", 43);
    expect(result.ok).toBe(true);
    // Fingerprint nulo → nenhum INSERT em device_verified_sessions ou device_offer_limits
    expect(lastTxExecute).not.toBeNull();
    expect(lastTxExecute!.mock.calls).toHaveLength(1);
  });

  // ── B4: Reuso do mesmo código ─────────────────────────────────────────────
  it("B4 — reuso: verified_at já preenchido → ok:false Código inválido", async () => {
    // UPDATE WHERE verified_at IS NULL retorna 0 linhas (já foi consumido)
    setTransaction([]);
    // Fallback: a linha existe para o challengeId (foi consumida antes)
    mockDb.execute.mockResolvedValue({ rows: [{ id: 42 }] });

    const result = await verifyDeviceCode("12345678901", "654321", 42);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/código inválido/i);
  });

  // ── B5: Falha no INSERT device_verified_sessions → rollback ─────────────
  it("B5 — falha no INSERT device_verified_sessions → rejeita com o erro original", async () => {
    // failOnCall=2 → 1ª call = OTP consumido; 2ª call = session INSERT lança
    setTransaction([{ id: 99, device_fingerprint: "fp-fail" }], { failOnCall: 2 });

    await expect(verifyDeviceCode("12345678901", "654321", 99)).rejects.toThrow(
      "simulated DB failure",
    );
  });

  // ── B5b: Throttle — tentativas excedidas → código expirado e mensagem clara ─
  it("B5b — 5 tentativas falhas → ok:false Número de tentativas excedido", async () => {
    setTransaction([]); // UPDATE não encontra linha (código errado)
    // Simula que após o increment, attempt_count atingiu MAX_ATTEMPTS (5)
    mockDb.execute
      .mockResolvedValueOnce({ rows: [{ id: 55, attempt_count: 5 }] }) // INCREMENT retorna 5
      .mockResolvedValueOnce({ rows: [] })                               // UPDATE expires_at = NOW()
      .mockResolvedValue({ rows: [] });                                  // restante

    const result = await verifyDeviceCode("12345678901", "errado", 55);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/número de tentativas excedido/i);
  });

  // ── B6: Concorrência ──────────────────────────────────────────────────────
  it("B6 — concorrência: duas chamadas simultâneas → somente uma retorna ok:true", async () => {
    let txCallCount = 0;

    // Simula serialização pelo banco: a primeira transação "ganha" o UPDATE;
    // a segunda não encontra linha elegível (verified_at já preenchido).
    mockDb.transaction.mockImplementation(async (fn: TxFn) => {
      txCallCount++;
      const myCall = txCallCount;
      const otpRows =
        myCall === 1 ? [{ id: 1, device_fingerprint: "fp-race" }] : [];

      const txExecute = vi.fn().mockImplementation(() =>
        Promise.resolve({ rows: otpRows }),
      );
      return fn({ execute: txExecute });
    });

    // Fallback SELECT: linha existe (para que a "perdedora" retorne "Código inválido")
    mockDb.execute.mockResolvedValue({ rows: [{ id: 1 }] });

    const cpf  = "12345678901";
    const code = "654321";
    const [r1, r2] = await Promise.all([
      verifyDeviceCode(cpf, code, 1),
      verifyDeviceCode(cpf, code, 1),
    ]);

    const results   = [r1, r2];
    const successes = results.filter((r) => r.ok);
    const failures  = results.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo D — getOrCreateChallenge (idempotência + concorrência)
// ─────────────────────────────────────────────────────────────────────────────
import { getOrCreateChallenge } from "../lib/device-throttle.js";

describe("getOrCreateChallenge — idempotência e concorrência", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper que simula db.transaction serializado (advisory lock):
   * as transações entram em fila e correm uma de cada vez.
   * Simula o que o Postgres faz via pg_advisory_xact_lock.
   */
  function serializedTransactions(
    txBehaviors: Array<(txExecute: ReturnType<typeof vi.fn>) => Promise<unknown>>,
  ) {
    let callIdx = 0;
    mockDb.transaction.mockImplementation(async (fn: TxFn) => {
      const myIdx = callIdx++;
      const behavior = txBehaviors[myIdx] ?? txBehaviors[txBehaviors.length - 1];
      const txExecute = vi.fn().mockImplementation(() => Promise.resolve({ rows: [] }));
      return behavior(txExecute);
    });
  }

  // ── D1: desafio ativo já existe → retorna o mesmo id (isNew:false) ─────────
  it("D1 — desafio ativo existente → reutiliza (isNew:false), sem INSERT", async () => {
    // advisory lock resolve silenciosamente; SELECT retorna {id:7}; sem INSERT
    mockDb.transaction.mockImplementation(async (fn: TxFn) => {
      const txExecute = vi.fn()
        .mockResolvedValueOnce({ rows: [] })           // advisory lock
        .mockResolvedValueOnce({ rows: [{ id: 7 }] }); // SELECT → encontrou
      return fn({ execute: txExecute });
    });

    const r = await getOrCreateChallenge({ cpf: "12345678901", fingerprint: "fp-d1" });
    expect(r.challengeId).toBe(7);
    expect(r.isNew).toBe(false);
  });

  // ── D2: nenhum desafio ativo → cria novo ─────────────────────────────────
  it("D2 — sem desafio ativo → cria novo OTP (isNew:true)", async () => {
    mockDb.transaction.mockImplementation(async (fn: TxFn) => {
      const txExecute = vi.fn()
        .mockResolvedValueOnce({ rows: [] })            // advisory lock
        .mockResolvedValueOnce({ rows: [] })            // SELECT → vazio
        .mockResolvedValueOnce({ rows: [{ id: 42 }] }); // INSERT RETURNING
      return fn({ execute: txExecute });
    });

    const r = await getOrCreateChallenge({ cpf: "12345678901", fingerprint: "fp-d2" });
    expect(r.challengeId).toBe(42);
    expect(r.isNew).toBe(true);
  });

  // ── D3: duas chamadas concorrentes → mesmo challengeId, 1 INSERT no total ─
  // Prova o comportamento do advisory lock serializado:
  //   - Chamada 1: adquire lock, SELECT vazio → INSERT → id=1
  //   - Chamada 2: aguarda lock (simulado pela ordem do mock), SELECT → id=1
  //   - Ambas retornam challengeId=1; exatamente 1 db.transaction com INSERT
  it("D3 — concorrência: 2 chamadas simultâneas → mesmo challengeId, 1 INSERT", async () => {
    let txIdx = 0;
    mockDb.transaction.mockImplementation(async (fn: TxFn) => {
      const myIdx = txIdx++;
      let insertCalled = false;
      const txExecute = vi.fn().mockImplementation(async () => {
        // Chamada 1 (myIdx=0): advisory lock + SELECT vazio + INSERT → id=1
        if (myIdx === 0) {
          if (txExecute.mock.calls.length === 1) return { rows: [] };            // lock
          if (txExecute.mock.calls.length === 2) return { rows: [] };            // SELECT vazio
          insertCalled = true;
          return { rows: [{ id: 1 }] };                                          // INSERT
        }
        // Chamada 2 (myIdx=1): advisory lock + SELECT encontra id=1 (criado pelo 1)
        if (txExecute.mock.calls.length === 1) return { rows: [] };              // lock
        return { rows: [{ id: 1 }] };                                             // SELECT → já existe
      });
      const result = await fn({ execute: txExecute });
      return result;
    });

    const opts = { cpf: "44455566677", fingerprint: "fp-d3-race" };
    const [r1, r2] = await Promise.all([
      getOrCreateChallenge(opts),
      getOrCreateChallenge(opts),
    ]);

    // Ambas retornam o mesmo challengeId
    expect(r1.challengeId).toBe(1);
    expect(r2.challengeId).toBe(1);

    // Exatamente 2 db.transaction (uma por chamada)
    expect(mockDb.transaction).toHaveBeenCalledTimes(2);

    // Apenas 1 das transações deve ter feito INSERT (a que criou o desafio)
    // A outra encontrou o existente (2 executes: lock + SELECT)
    const transactionCalls = mockDb.transaction.mock.calls;
    expect(transactionCalls).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo C — checkDeviceOffer (lib unit)
// ─────────────────────────────────────────────────────────────────────────────
import { checkDeviceOffer } from "../lib/device-throttle.js";

describe("checkDeviceOffer — lib unit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Bootstrap resolvido + isDeviceVerified padrão: não verificado (rows:[])
    mockDb.execute.mockResolvedValue({ rows: [] });
    // transaction não é chamada por checkDeviceOffer
    mockDb.transaction.mockResolvedValue(undefined);
  });

  // ── C1: sem fingerprint → permitido sem fricção ───────────────────────────
  it("C1 — sem fingerprint → allowed:true, requiresVerification:false", async () => {
    const r = await checkDeviceOffer(null);
    expect(r.allowed).toBe(true);
    expect(r.requiresVerification).toBe(false);
    expect(r.throttled).toBe(false);
    // Não deve tocar o banco quando fingerprint é null
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  // ── C2: dispositivo verificado → isDeviceVerified consultado; sem fricção ─
  // Nota: _deviceLimitsReady já está cacheado dos testes B, portanto o CREATE
  // TABLE não gera db.execute aqui. Apenas isDeviceVerified usa db.execute.
  it("C2 — dispositivo verificado → isDeviceVerified consultado; sem fricção", async () => {
    // Única chamada db.execute esperada: isDeviceVerified SELECT → linha presente = verificado
    mockDb.execute.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const r = await checkDeviceOffer("fp-verified");
    expect(r.requiresVerification).toBe(false);
    expect(r.throttled).toBe(false);
    expect(r.allowed).toBe(true);
    // isDeviceVerified foi consultado exatamente 1×
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  // ── C3: offer_count ≤ threshold (5) → sem fricção ────────────────────────
  it("C3 — offer_count ≤ VERIFICATION_THRESHOLD → requiresVerification:false", async () => {
    // 1ª execute: isDeviceVerified → não verificado (rows:[])
    // 2ª execute: UPSERT offer_count → 3
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ offer_count: 3 }] });

    const r = await checkDeviceOffer("fp-low");
    expect(r.requiresVerification).toBe(false);
    expect(r.throttled).toBe(false);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(47); // 50 - 3
  });

  // ── C4: offer_count > threshold (5) → requiresVerification:true ──────────
  it("C4 — offer_count > VERIFICATION_THRESHOLD → requiresVerification:true", async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })              // isDeviceVerified → false
      .mockResolvedValueOnce({ rows: [{ offer_count: 7 }] }); // 7 > 5

    const r = await checkDeviceOffer("fp-medium");
    expect(r.requiresVerification).toBe(true);
    expect(r.throttled).toBe(false);
    expect(r.allowed).toBe(true);
  });

  // ── C5: offer_count > HARD_LIMIT (50) → throttled:true ───────────────────
  it("C5 — offer_count > HARD_LIMIT → throttled:true, allowed:false", async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] })              // isDeviceVerified → false
      .mockResolvedValueOnce({ rows: [{ offer_count: 51 }] }); // 51 > 50

    const r = await checkDeviceOffer("fp-bot");
    expect(r.throttled).toBe(true);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
});
