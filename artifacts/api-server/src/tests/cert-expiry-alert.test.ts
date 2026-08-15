/**
 * cert-expiry-alert.test.ts
 *
 * Confirma que a verificação de prazo do certificado ICP-Brasil:
 *   1. Não envia alerta para cert com exatamente 30 dias restantes (limiar exclusivo).
 *   2. Envia alerta para cert com 30 dias menos 1 ms restante.
 *   3. Não envia alerta para cert com 31 dias restantes.
 *   4. Envia alerta para certs com < 30 dias (15, 7, 1 dia).
 *   5. Envia alerta "VENCIDO" para cert expirado.
 *   6. Retorna silenciosamente quando o cert não está disponível.
 *   7. Não lança exceção quando postSlackAlert falha (fail-safe).
 *   8. Loga ok:false do Slack como erro (via errLog).
 *   9. Helpers puros são determinísticos com nowFn injetado.
 *
 * O relógio é sempre congelado via nowFn para eliminar corridas de ms.
 */

import { describe, it, expect, vi } from "vitest";
import {
  checkCertExpiryAndAlert,
  daysRemainingFromValidTo,
  buildCertAlertText,
  ALERT_THRESHOLD_DAYS,
  ALERT_THRESHOLD_MS,
} from "../lib/cert-expiry-alert";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISSUER = "CN=AC SyngularID Multipla, OU=AC, O=ICP-Brasil, C=BR";
/** Relógio fixo — elimina corridas de ms entre isoInDays e Date.now() real. */
const FIXED_NOW = 1_700_000_000_000; // timestamp arbitrário e estável

/** Retorna um validTo ISO que é EXACTLY `ms` milissegundos à frente de FIXED_NOW. */
function isoInMs(ms: number): string {
  return new Date(FIXED_NOW + ms).toISOString();
}
/** Shorthand: N dias exatos à frente de FIXED_NOW. */
function isoInDays(days: number): string {
  return isoInMs(days * 24 * 60 * 60 * 1000);
}

function makeDeps(validTo: string, alertError?: Error) {
  return {
    getCertInfoFn: vi.fn().mockReturnValue({
      subject: "CN=Dr. Caio Pádua",
      issuer: ISSUER,
      serial: "1234ABCD",
      validFrom: new Date(FIXED_NOW - 365 * 24 * 60 * 60 * 1000).toISOString(),
      validTo,
      cpf: "123.456.789-00",
    }),
    postAlert: alertError
      ? vi.fn().mockRejectedValue(alertError)
      : vi.fn().mockResolvedValue(undefined),
    // Relógio congelado: garante que msRemaining é determinístico.
    nowFn: () => FIXED_NOW,
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
  };
}

function makeDepsNoCert() {
  return {
    getCertInfoFn: vi.fn().mockImplementation(() => {
      throw new Error("Certificado digital A1 nao configurado.");
    }),
    postAlert: vi.fn().mockResolvedValue(undefined),
    nowFn: () => FIXED_NOW,
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Bloco 1 — Limiar exato: ALERT_THRESHOLD_MS
// ---------------------------------------------------------------------------

describe("checkCertExpiryAndAlert — limiar exato de 30 dias", () => {
  it("NÃO envia alerta quando msRemaining === ALERT_THRESHOLD_MS (exatamente 30 dias)", async () => {
    // msRemaining = 30d em ms exatos → >= ALERT_THRESHOLD_MS → sem alerta
    const deps = makeDeps(isoInMs(ALERT_THRESHOLD_MS));
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).not.toHaveBeenCalled();
    expect(deps.logInfo).toHaveBeenCalledOnce();
  });

  it("ENVIA alerta quando msRemaining === ALERT_THRESHOLD_MS - 1 (30 dias menos 1 ms)", async () => {
    const deps = makeDeps(isoInMs(ALERT_THRESHOLD_MS - 1));
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).toHaveBeenCalledOnce();
  });

  it("NÃO envia alerta quando msRemaining === 31 dias exatos", async () => {
    const deps = makeDeps(isoInDays(31));
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bloco 2 — Cert dentro do limiar (< 30 dias)
// ---------------------------------------------------------------------------

describe("checkCertExpiryAndAlert — cert < 30 dias (alerta deve ser enviado)", () => {
  it("envia alerta quando faltam 29 dias", async () => {
    const deps = makeDeps(isoInDays(29));
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).toHaveBeenCalledOnce();
  });

  it("envia alerta quando faltam 15 dias", async () => {
    const deps = makeDeps(isoInDays(15));
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).toHaveBeenCalledOnce();
  });

  it("envia alerta quando falta 1 dia", async () => {
    const deps = makeDeps(isoInDays(1));
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).toHaveBeenCalledOnce();
  });

  it("a mensagem contém 'dias' e o campo 'Vencimento'", async () => {
    const deps = makeDeps(isoInDays(15));
    await checkCertExpiryAndAlert(deps);
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toMatch(/dias/);
    expect(text).toContain("Vencimento");
  });

  it("a mensagem contém o primeiro segmento do emissor", async () => {
    const deps = makeDeps(isoInDays(20));
    await checkCertExpiryAndAlert(deps);
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain("AC SyngularID Multipla");
  });

  it("loga aviso (logWarn) após o alerta ser enviado", async () => {
    const deps = makeDeps(isoInDays(15));
    await checkCertExpiryAndAlert(deps);
    expect(deps.logWarn).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Bloco 3 — Cert vencido (msRemaining < 0)
// ---------------------------------------------------------------------------

describe("checkCertExpiryAndAlert — cert vencido", () => {
  it("envia alerta quando o cert expirou há 1 dia", async () => {
    const deps = makeDeps(isoInDays(-1));
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).toHaveBeenCalledOnce();
  });

  it("a mensagem contém 'VENCIDO' para cert expirado", async () => {
    const deps = makeDeps(isoInDays(-5));
    await checkCertExpiryAndAlert(deps);
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toMatch(/VENCIDO/i);
  });
});

// ---------------------------------------------------------------------------
// Bloco 4 — Cert saudável (≥ 30 dias)
// ---------------------------------------------------------------------------

describe("checkCertExpiryAndAlert — cert saudável (sem alerta)", () => {
  it("não envia alerta quando faltam 60 dias", async () => {
    const deps = makeDeps(isoInDays(60));
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).not.toHaveBeenCalled();
  });

  it("loga info (não warn) para cert saudável", async () => {
    const deps = makeDeps(isoInDays(38));
    await checkCertExpiryAndAlert(deps);
    expect(deps.logInfo).toHaveBeenCalledOnce();
    expect(deps.logWarn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bloco 5 — Sem certificado configurado
// ---------------------------------------------------------------------------

describe("checkCertExpiryAndAlert — sem certificado configurado", () => {
  it("não envia alerta quando getCertInfo lança", async () => {
    const deps = makeDepsNoCert();
    await checkCertExpiryAndAlert(deps);
    expect(deps.postAlert).not.toHaveBeenCalled();
  });

  it("loga info (não erro) quando cert ausente", async () => {
    const deps = makeDepsNoCert();
    await checkCertExpiryAndAlert(deps);
    expect(deps.logInfo).toHaveBeenCalledOnce();
    expect(deps.logError).not.toHaveBeenCalled();
  });

  it("não lança exceção quando cert ausente", async () => {
    const deps = makeDepsNoCert();
    await expect(checkCertExpiryAndAlert(deps)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bloco 6 — Falha no Slack (fail-safe)
// ---------------------------------------------------------------------------

describe("checkCertExpiryAndAlert — Slack falha", () => {
  it("não lança exceção quando postSlackAlert rejeita", async () => {
    const deps = makeDeps(isoInDays(10), new Error("Slack timeout"));
    await expect(checkCertExpiryAndAlert(deps)).resolves.toBeUndefined();
  });

  it("loga o erro (logError) quando postSlackAlert rejeita", async () => {
    const deps = makeDeps(isoInDays(10), new Error("Slack timeout"));
    await checkCertExpiryAndAlert(deps);
    expect(deps.logError).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Bloco 7 — Helpers puros
// ---------------------------------------------------------------------------

describe("daysRemainingFromValidTo", () => {
  it("retorna 30 para validTo exatamente 30d à frente", () => {
    const validTo = new Date(FIXED_NOW + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysRemainingFromValidTo(validTo, FIXED_NOW)).toBe(30);
  });

  it("retorna 0 para validTo no mesmo instante que now", () => {
    const validTo = new Date(FIXED_NOW).toISOString();
    expect(daysRemainingFromValidTo(validTo, FIXED_NOW)).toBe(0);
  });

  it("retorna -2 para cert vencido há 2 dias", () => {
    const validTo = new Date(FIXED_NOW - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysRemainingFromValidTo(validTo, FIXED_NOW)).toBe(-2);
  });
});

describe("buildCertAlertText", () => {
  it("contém '⚠️' para 15 dias restantes", () => {
    expect(buildCertAlertText(15, "15/09/2026", ISSUER)).toContain("⚠️");
  });

  it("contém '🚨' para 5 dias restantes (crítico)", () => {
    expect(buildCertAlertText(5, "20/08/2026", ISSUER)).toContain("🚨");
  });

  it("contém 'VENCIDO' para cert expirado", () => {
    expect(buildCertAlertText(-3, "12/08/2026", ISSUER)).toMatch(/VENCIDO/i);
  });

  it("menciona 'Configurações > Certificados'", () => {
    expect(buildCertAlertText(20, "04/09/2026", ISSUER)).toContain("Configurações > Certificados");
  });

  it("ALERT_THRESHOLD_DAYS é 30", () => {
    expect(ALERT_THRESHOLD_DAYS).toBe(30);
  });

  it("ALERT_THRESHOLD_MS é 30 dias em ms", () => {
    expect(ALERT_THRESHOLD_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
