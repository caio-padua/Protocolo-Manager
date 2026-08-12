/**
 * concierge-device-throttle.test.ts
 *
 * Testes de unidade da lib checkDeviceThrottle (ARQUITETURA.md §6.2-6.4).
 *
 * Cenários:
 *   9.  Fingerprint ausente (null/"") → livre, banco não chamado
 *  10.  verified=true → livre, banco não chamado
 *  11.  < 6 ofertas/dia (não verificado) → livre (throttled=false, requiresVerification=false)
 *  12.  ≥ 6 ofertas/dia (não verificado) → requiresVerification=true, throttled=false
 *  13.  ≥ 50 ofertas/dia → throttled=true, requiresVerification=false
 *  14.  Exatamente 50 ofertas/dia → throttled=true (teto inclusivo)
 *  15.  Falha de DB → fail-open (livre, sem lançar exceção)
 *
 * Estratégia:
 *   - @workspace/db é mockado globalmente (vi.mock hoistado antes dos imports).
 *   - db.execute controla o retorno do INSERT...ON CONFLICT...RETURNING offer_count.
 *   - _tableReady (singleton CREATE IF NOT EXISTS) é aquecido no beforeAll.
 *   - brtISODate é mockado para retornar data estável, isolando o teste do relógio real.
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request } from "express";
import type { QueryResult } from "pg";

// ── Mock de @workspace/db ─────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn() },
}));

// ── Mock de brt.js (data estável) ─────────────────────────────────────────────
vi.mock("../lib/brt.js", () => ({
  brtISODate: vi.fn().mockReturnValue("2026-08-12"),
}));

// ── Imports após os mocks ─────────────────────────────────────────────────────
import { db } from "@workspace/db";
import { checkDeviceThrottle, deriveFingerprint, purgeOldDeviceOfferLimits } from "../lib/concierge-device-throttle.js";

// Helper: monta retorno compatível com QueryResult<{ offer_count: number }>.
// O QueryResult real exige command/oid/fields — irrelevantes aqui.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qr = (offerCount: number): any => ({ rows: [{ offer_count: offerCount }] });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qrEmpty = (): any => ({ rows: [] });

const mockExec = () => vi.mocked(db.execute);

// ── Aquecimento do singleton _tableReady ──────────────────────────────────────
// A primeira chamada com fingerprint válido dispara CREATE TABLE IF NOT EXISTS.
// Após o beforeAll o singleton está quente e os testes subsequentes consomem
// apenas 1 chamada a db.execute (o INSERT...RETURNING).
beforeAll(async () => {
  // Chamar com fingerprint ausente NÃO aquece (retorna early). Precisamos de
  // um fingerprint válido com verified=false para chegar ao ensureTable().
  mockExec()
    .mockResolvedValueOnce(qrEmpty()) // CREATE TABLE IF NOT EXISTS
    .mockResolvedValueOnce(qr(1));    // INSERT...RETURNING offer_count=1
  await checkDeviceThrottle("warmup-fp", false);
  vi.clearAllMocks();
});

beforeEach(() => vi.resetAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// Cenários de atalho — banco NÃO deve ser chamado
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDeviceThrottle — atalhos sem banco", () => {
  it("Cenário 9a — fingerprint null → livre, db.execute não chamado", async () => {
    const r = await checkDeviceThrottle(null, false);
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
    expect(r.allowed).toBe(true);
    expect(mockExec()).not.toHaveBeenCalled();
  });

  it("Cenário 9b — fingerprint vazio ('') → livre, db.execute não chamado", async () => {
    const r = await checkDeviceThrottle("", false);
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
    expect(r.allowed).toBe(true);
    expect(mockExec()).not.toHaveBeenCalled();
  });

  it("Cenário 9c — fingerprint só espaços → livre, db.execute não chamado", async () => {
    const r = await checkDeviceThrottle("   ", false);
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
    expect(r.allowed).toBe(true);
    expect(mockExec()).not.toHaveBeenCalled();
  });

  it("Cenário 10 — verified=true → livre mesmo com fingerprint válido, db.execute não chamado", async () => {
    const r = await checkDeviceThrottle("fp-verified-device", true);
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
    expect(r.allowed).toBe(true);
    expect(mockExec()).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenários com contador (INSERT...RETURNING)
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDeviceThrottle — lógica de limites", () => {
  it("Cenário 11 — 1ª oferta (count=1) → livre (throttled=false, requiresVerification=false)", async () => {
    mockExec().mockResolvedValueOnce(qr(1));
    const r = await checkDeviceThrottle("fp-new-device", false);
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(49); // 50 - 1
  });

  it("Cenário 11b — 5ª oferta (count=5) → ainda livre (abaixo do limiar 6)", async () => {
    mockExec().mockResolvedValueOnce(qr(5));
    const r = await checkDeviceThrottle("fp-5-offers", false);
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
    expect(r.allowed).toBe(true);
  });

  it("Cenário 12a — 6ª oferta (count=6) → requiresVerification=true, throttled=false", async () => {
    mockExec().mockResolvedValueOnce(qr(6));
    const r = await checkDeviceThrottle("fp-6-offers", false);
    expect(r.requiresVerification).toBe(true);
    expect(r.throttled).toBe(false);
    expect(r.allowed).toBe(true); // fricção, não bloqueio
    expect(r.message).toBeDefined();
  });

  it("Cenário 12b — 10ª oferta (count=10) → requiresVerification=true, ainda não throttled", async () => {
    mockExec().mockResolvedValueOnce(qr(10));
    const r = await checkDeviceThrottle("fp-10-offers", false);
    expect(r.requiresVerification).toBe(true);
    expect(r.throttled).toBe(false);
    expect(r.allowed).toBe(true);
  });

  it("Cenário 13 — 51ª oferta (count=51) → throttled=true, requiresVerification=false", async () => {
    mockExec().mockResolvedValueOnce(qr(51));
    const r = await checkDeviceThrottle("fp-51-offers", false);
    expect(r.throttled).toBe(true);
    expect(r.requiresVerification).toBe(false);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.message).toBeDefined();
  });

  it("Cenário 14 — exatamente 50ª oferta (count=50) → throttled=true (teto inclusivo ≥50)", async () => {
    mockExec().mockResolvedValueOnce(qr(50));
    const r = await checkDeviceThrottle("fp-50-offers", false);
    expect(r.throttled).toBe(true);
    expect(r.allowed).toBe(false);
  });

  it("Cenário — 49ª oferta (count=49) → ainda requiresVerification (não throttled)", async () => {
    mockExec().mockResolvedValueOnce(qr(49));
    const r = await checkDeviceThrottle("fp-49-offers", false);
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(true);
    expect(r.allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 15 — fail-open em caso de falha de DB
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDeviceThrottle — fail-open", () => {
  it("Cenário 15 — falha de DB → retorna livre sem lançar exceção", async () => {
    mockExec().mockRejectedValueOnce(new Error("DB offline"));
    // Não deve lançar
    await expect(checkDeviceThrottle("fp-db-error", false)).resolves.toMatchObject({
      allowed: true,
      throttled: false,
      requiresVerification: false,
    });
  });

  it("Cenário 15b — INSERT retorna rows vazio → trata como count=1 (fail-open)", async () => {
    // rows vazio — nenhum registro retornado (borda do ON CONFLICT)
    mockExec().mockResolvedValueOnce({ rows: [] });
    const r = await checkDeviceThrottle("fp-empty-rows", false);
    // count=1 pelo fallback, portanto livre
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
    expect(r.allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Segurança: XFF forjado pelo cliente não altera o fingerprint
// (deriveFingerprint usa req.ip, não X-Forwarded-For diretamente)
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveFingerprint — resistência a XFF forjado", () => {
  /** Monta um Request mínimo compatível com o que Express injeta após trust proxy. */
  function fakeReq(ip: string, ua: string, xff?: string): Request {
    return {
      ip,
      headers: {
        "user-agent": ua,
        ...(xff ? { "x-forwarded-for": xff } : {}),
      },
    } as unknown as Request;
  }

  it("mesmo req.ip e User-Agent produzem fingerprint idêntico independente do XFF", () => {
    const base = fakeReq("203.0.113.5", "TestBrowser/2.0");
    const forged = fakeReq("203.0.113.5", "TestBrowser/2.0", "10.0.0.1, 192.168.0.99");
    // XFF forjado não deve mudar o fingerprint porque deriveFingerprint usa req.ip
    expect(deriveFingerprint(base)).toBe(deriveFingerprint(forged));
  });

  it("IPs distintos geram fingerprints distintos (req.ip é o sinal de IP)", () => {
    const reqA = fakeReq("203.0.113.1", "TestBrowser/2.0");
    const reqB = fakeReq("198.51.100.5", "TestBrowser/2.0");
    expect(deriveFingerprint(reqA)).not.toBe(deriveFingerprint(reqB));
  });

  it("User-Agents distintos geram fingerprints distintos (mesmo IP)", () => {
    const reqA = fakeReq("203.0.113.1", "BrowserA/1.0");
    const reqB = fakeReq("203.0.113.1", "BrowserB/2.0");
    expect(deriveFingerprint(reqA)).not.toBe(deriveFingerprint(reqB));
  });

  it("XFF com 'req.ip' idêntico mas UA diferente → fingerprints distintos", () => {
    const attacker = fakeReq("203.0.113.5", "BotUA/1.0", "victim_ip");
    const victim   = fakeReq("203.0.113.5", "RealUA/1.0");
    // Mesmo que o atacante forje XFF apontando para a vítima,
    // o fingerprint ainda difere porque req.ip (mesma máquina) é o mesmo
    // e o UA diferente produz fingerprint diferente.
    expect(deriveFingerprint(attacker)).not.toBe(deriveFingerprint(victim));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariante: nunca grava penalidade no CPF
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDeviceThrottle — invariante: nenhum acesso à tabela concierge_penalidades", () => {
  it("Cenário throttled não acessa tabela de penalidades (só device_offer_limits)", async () => {
    mockExec().mockResolvedValueOnce(qr(55));
    await checkDeviceThrottle("fp-throttled-no-penalty", false);

    // A única chamada ao banco deve ser o INSERT INTO device_offer_limits,
    // nunca INSERT INTO concierge_penalidades.
    const calls = mockExec().mock.calls;
    // Cada argumento é um objeto sql`` — verificamos que nenhum menciona "penalidades"
    for (const [sqlArg] of calls) {
      const sqlStr = String(sqlArg);
      expect(sqlStr).not.toContain("penalidades");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// purgeOldDeviceOfferLimits — limpeza de linhas antigas
// ─────────────────────────────────────────────────────────────────────────────

// Helper: QueryResult simulado com N linhas retornadas pelo DELETE … RETURNING.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qrDeleted = (n: number): any => ({ rows: Array.from({ length: n }, () => ({ dummy: 1 })) });

describe("purgeOldDeviceOfferLimits — limpeza e fronteira BRT/UTC", () => {
  it("retorna o número de linhas removidas informado pelo banco", async () => {
    // ensureTable (CREATE IF NOT EXISTS) já está quente — 1 chamada: DELETE
    mockExec().mockResolvedValueOnce(qrDeleted(7));
    const removed = await purgeOldDeviceOfferLimits();
    expect(removed).toBe(7);
  });

  it("retorna 0 quando nenhuma linha antiga existe", async () => {
    mockExec().mockResolvedValueOnce(qrDeleted(0));
    const removed = await purgeOldDeviceOfferLimits();
    expect(removed).toBe(0);
  });

  it("usa cutoff BRT (America/Sao_Paulo) e não CURRENT_DATE puro", async () => {
    // O cutoff deve usar fuso explícito para não avançar 1 dia BRT em noites
    // entre 21h BRT e meia-noite UTC (diferença UTC-3 do horário de Brasília).
    mockExec().mockResolvedValueOnce(qrDeleted(0));
    await purgeOldDeviceOfferLimits();

    const calls = mockExec().mock.calls;
    // A última chamada deve ser o DELETE — verificamos que inclui o fuso BRT.
    // O sql`` do drizzle armazena as partes literais em queryChunks[].value.
    const deleteSqlArg = calls[calls.length - 1]?.[0];
    // O sql`` do drizzle armazena as partes literais em queryChunks[].value (array de strings).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks: unknown[] = (deleteSqlArg as any)?.queryChunks ?? [];
    const fullSql = chunks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : (typeof c?.value === "string" ? c.value : "")))
      .join("");
    expect(fullSql).toContain("America/Sao_Paulo");
    // Não deve usar CURRENT_DATE puro (sem fuso explícito) como cutoff
    expect(fullSql).not.toMatch(/WHERE\s+dia_brt\s*<\s*CURRENT_DATE/);
  });

  it("propaga falha de banco (lança) em vez de retornar 0 silenciosamente", async () => {
    mockExec().mockRejectedValueOnce(new Error("DB timeout"));
    // purgeOldDeviceOfferLimits NÃO tem catch interno — a exceção deve subir
    await expect(purgeOldDeviceOfferLimits()).rejects.toThrow("DB timeout");
  });

  it("DELETE usa RETURNING para contar linhas — o SQL contém RETURNING", async () => {
    mockExec().mockResolvedValueOnce(qrDeleted(3));
    await purgeOldDeviceOfferLimits();

    const calls = mockExec().mock.calls;
    const deleteSqlArg = calls[calls.length - 1]?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks: unknown[] = (deleteSqlArg as any)?.queryChunks ?? [];
    const fullSql = chunks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : (typeof c?.value === "string" ? c.value : "")))
      .join("");
    expect(fullSql).toContain("RETURNING");
  });
});
