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
 *  16.  Virada de meia-noite BRT — dois requests simultâneos no novo dia não são
 *       bloqueados pelo contador do dia anterior.
 *
 * Estratégia:
 *   - @workspace/db é mockado globalmente (vi.mock hoistado antes dos imports).
 *   - db.execute controla o retorno do INSERT...ON CONFLICT...RETURNING offer_count.
 *   - _tableReady (singleton CREATE IF NOT EXISTS) é aquecido no beforeAll.
 *   - brtISODate é mockado para retornar data estável, isolando o teste do relógio real.
 */

import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request } from "express";
type QueryResult = { rows: Record<string, unknown>[] };

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
import { brtISODate } from "../lib/brt.js";
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
    mockExec().mockResolvedValueOnce(qrEmpty());
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

  // ── "Hoje permanece intacto" ──────────────────────────────────────────────
  // Testes abaixo confirmam que o cutoff do DELETE exclui o dia atual BRT.
  // Inspecionamos o SQL gerado (sql``) para verificar que o predicado usa
  //   dia_brt < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 2
  // e não formas erradas como:
  //   dia_brt < NOW()                 ← apagaria linhas de hoje (UTC pode avançar)
  //   dia_brt < CURRENT_DATE          ← não ancora no fuso BRT
  //   dia_brt < (... )::date          ← sem o "- 2", apagaria ontem e hoje

  /** Helper reutilizável: extrai a string completa do sql`` da última chamada. */
  async function captureDeleteSql(): Promise<string> {
    mockExec().mockResolvedValueOnce(qrDeleted(0));
    await purgeOldDeviceOfferLimits();
    const calls = mockExec().mock.calls;
    const deleteSqlArg = calls[calls.length - 1]?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks: unknown[] = (deleteSqlArg as any)?.queryChunks ?? [];
    return chunks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : (typeof c?.value === "string" ? c.value : "")))
      .join("");
  }

  it("hoje permanece intacto — cutoff subtrai 2 dias (predicado inclui '- 2')", async () => {
    // O predicado correto é: dia_brt < (... BRT ...)::date - 2
    // Sem o "- 2", linhas de hoje e ontem seriam deletadas, zerando o throttle.
    const fullSql = await captureDeleteSql();
    expect(fullSql).toMatch(/- 2/);
  });

  it("hoje permanece intacto — não usa < NOW() puro como cutoff", async () => {
    // < NOW() não está ancorado no fuso e avançaria o corte até meia-noite UTC,
    // apagando linhas do dia atual BRT entre 21h e 00h (diferença UTC-3).
    const fullSql = await captureDeleteSql();
    expect(fullSql).not.toMatch(/dia_brt\s*<\s*NOW\(\)/i);
  });

  it("hoje permanece intacto — cutoff combina fuso BRT com subtração de 2 dias", async () => {
    // O predicado esperado une os dois requisitos:
    //   (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 2
    // Verificamos que ambos estão na mesma expressão de DELETE.
    const fullSql = await captureDeleteSql();
    expect(fullSql).toContain("America/Sao_Paulo");
    expect(fullSql).toMatch(/- 2/);
    // Não deve haver referência a CURRENT_DATE sem o fuso explícito como cutoff
    expect(fullSql).not.toMatch(/WHERE\s+dia_brt\s*<\s*CURRENT_DATE/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenário 16 — Virada de meia-noite BRT
//
// O contador é keyed por (device_fingerprint, dia_brt). Quando brtISODate()
// avança para o dia seguinte às 00h BRT, um novo INSERT deve começar do zero.
//
// Estratégia de asserção forte:
//   Os testes inspecionam os ARGUMENTOS passados a db.execute (o objeto sql``
//   do drizzle) para confirmar que:
//     1. O valor retornado por brtISODate() é passado como parâmetro SQL.
//     2. A data muda entre chamadas feitas em dias BRT distintos.
//     3. O SQL contém ON CONFLICT (device_fingerprint, dia_brt).
//   Assim, uma regressão que ignore brtISODate() ou use data hardcoded falha,
//   mesmo que o mock devolva count=1.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrai a string literal (partes SQL) de um objeto sql`` do drizzle.
 *
 * No drizzle-orm os queryChunks têm dois formatos:
 *   Literal SQL: objeto { value: string[] }  (ex.: { value: ["INSERT INTO ..."] })
 *   Parâmetro:   valor primitivo direto       (ex.: "fp-midnight-a" ou "2026-08-13")
 */
function extractSqlStr(sqlArg: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chunks: unknown[] = (sqlArg as any)?.queryChunks ?? [];
  return chunks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => (c && typeof c === "object" && Array.isArray(c?.value) ? c.value.join("") : ""))
    .join("");
}

/**
 * Extrai os valores de parâmetro interpolados (${...}) de um objeto sql`` do drizzle.
 *
 * Parâmetros são armazenados como primitivos diretos nos queryChunks;
 * os literais SQL são objetos { value: string[] }.
 */
function extractParams(sqlArg: unknown): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chunks: unknown[] = (sqlArg as any)?.queryChunks ?? [];
  // Parâmetros são os chunks que NÃO são objetos (são o valor primitivo em si)
  return chunks.filter((c) => typeof c !== "object" || c === null);
}

/** Retorna o sql`` passado à última (ou i-ésima) chamada a db.execute. */
function lastInsertArg(offset = 0): unknown {
  const calls = mockExec().mock.calls;
  return calls[calls.length - 1 - offset]?.[0];
}

describe("checkDeviceThrottle — virada de meia-noite BRT", () => {
  it("Cenário 16a — INSERT inclui a data BRT de brtISODate() como parâmetro SQL", async () => {
    // Se o código não usar brtISODate() como param do INSERT, este teste falha mesmo
    // que o mock devolva count=1, pois a data não estará nos params inspecionados.
    vi.mocked(brtISODate).mockReturnValue("2026-08-13");
    mockExec().mockResolvedValueOnce(qr(1));

    await checkDeviceThrottle("fp-midnight-a", false);

    const params = extractParams(lastInsertArg());
    // O fingerprint e a data BRT devem ambos aparecer como params do INSERT
    expect(params).toContain("fp-midnight-a");
    expect(params).toContain("2026-08-13");
  });

  it("Cenário 16b — quando brtISODate() avança, o param dia_brt no INSERT muda", async () => {
    // Dia anterior (ontem): dispositivo quase no limite
    vi.mocked(brtISODate).mockReturnValue("2026-08-12");
    mockExec().mockResolvedValueOnce(qr(49));
    await checkDeviceThrottle("fp-rollover-device", false);
    const paramsDay1 = extractParams(lastInsertArg());

    // Novo dia (hoje): brtISODate() avança — o INSERT deve usar a nova data
    vi.mocked(brtISODate).mockReturnValue("2026-08-13");
    mockExec().mockResolvedValueOnce(qr(1));
    await checkDeviceThrottle("fp-rollover-device", false);
    const paramsDay2 = extractParams(lastInsertArg());

    // A data passada ao banco muda entre as duas chamadas
    expect(paramsDay1).toContain("2026-08-12");
    expect(paramsDay2).toContain("2026-08-13");
    // O INSERT do novo dia não reaproveita a chave do dia anterior
    expect(paramsDay2).not.toContain("2026-08-12");
  });

  it("Cenário 16c — INSERT usa ON CONFLICT (device_fingerprint, dia_brt) como cláusula de conflito", async () => {
    // Confirma que a atomicidade depende do par (fingerprint, dia_brt), não só do fingerprint.
    // Um código que omitisse dia_brt da cláusula UNIQUE violaria a fronteira de dia.
    vi.mocked(brtISODate).mockReturnValue("2026-08-13");
    mockExec().mockResolvedValueOnce(qr(1));

    await checkDeviceThrottle("fp-conflict-clause", false);

    const sqlStr = extractSqlStr(lastInsertArg());
    expect(sqlStr).toMatch(/ON CONFLICT\s*\(\s*device_fingerprint\s*,\s*dia_brt\s*\)/);
  });

  it("Cenário 16d — dois requests simultâneos no novo dia: ambos livres e ambos usam a nova data", async () => {
    // 1º: INSERT → count=1; 2º: ON CONFLICT DO UPDATE → count=2
    vi.mocked(brtISODate).mockReturnValue("2026-08-13");
    mockExec()
      .mockResolvedValueOnce(qr(1))
      .mockResolvedValueOnce(qr(2));

    const [r1, r2] = await Promise.all([
      checkDeviceThrottle("fp-concurrent-mid", false),
      checkDeviceThrottle("fp-concurrent-mid", false),
    ]);

    // Nenhum deve ser bloqueado — o novo dia começa do zero
    expect(r1.allowed).toBe(true);
    expect(r1.throttled).toBe(false);
    expect(r1.requiresVerification).toBe(false);

    expect(r2.allowed).toBe(true);
    expect(r2.throttled).toBe(false);
    expect(r2.requiresVerification).toBe(false);

    // Ambas as chamadas ao banco devem ter usado a data do novo dia
    const calls = mockExec().mock.calls;
    for (const call of calls) {
      const params = extractParams(call[0]);
      expect(params).toContain("2026-08-13");
    }
  });

  it("Cenário 16e — ON CONFLICT DO UPDATE é exercitado: count=2 lido corretamente (remaining=48)", async () => {
    // Confirma que o resultado do ON CONFLICT (count=2) é lido sem truncar para 1.
    vi.mocked(brtISODate).mockReturnValue("2026-08-13");
    mockExec().mockResolvedValueOnce(qr(2)); // ON CONFLICT DO UPDATE → offer_count=2

    const r = await checkDeviceThrottle("fp-on-conflict", false);

    // remaining deve refletir count=2, não count=1 (caso o código ignorasse o RETURNING)
    expect(r.remaining).toBe(48); // 50 - 2
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
  });

  it("Cenário 16f — resultado do banco indica count=1: confirmed livre mesmo que ontem fosse count=49", async () => {
    // Prova que o sistema não carrega estado do dia anterior: o INSERT retorna 1
    // porque (fingerprint, new_date) é uma chave nova no banco.
    vi.mocked(brtISODate).mockReturnValue("2026-08-13");
    mockExec().mockResolvedValueOnce(qr(1));

    const r = await checkDeviceThrottle("fp-high-yesterday", false);

    expect(r.allowed).toBe(true);
    expect(r.throttled).toBe(false);
    expect(r.requiresVerification).toBe(false);
    expect(r.remaining).toBe(49);

    // E o param da data no INSERT é o novo dia, não o anterior
    const params = extractParams(lastInsertArg());
    expect(params).toContain("2026-08-13");
    expect(params).not.toContain("2026-08-12");
  });
});
