/**
 * telegram-fallback-slack.test.ts
 *
 * Confirma que postTelegramReport:
 *   - tenta o Telegram exatamente 3 vezes quando ele recusa (sent: false)
 *   - posta aviso de fallback no Slack após esgotar as tentativas
 *   - loga { telegramFailed: true } na chamada de erro final
 *
 * Cenários cobertos:
 *   1. Telegram responde { sent: false, error: "403 Forbidden" } nas 3 tentativas
 *      → slackPost é chamado 1 vez com a mensagem de fallback
 *      → log contém telegramFailed: true
 *      → postTelegramReport rejeita com mensagem indicando as tentativas
 *   2. slackFallbackChannelId ausente → fallback Slack NÃO é acionado
 *      (mas log ainda registra telegramFailed: true)
 *   3. Caminho feliz: Telegram aceita na 1ª tentativa → sem fallback, sem erro
 *   4. Telegram falha nas 2 primeiras tentativas e aceita na 3ª → sem fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── vi.hoisted — variáveis usadas dentro de vi.mock factories ─────────────
// vi.mock é hoistado para o topo do arquivo, antes de qualquer const/let.
// vi.hoisted garante que estas variáveis existam no momento em que as
// factories são executadas.
const { mockProxy, mockLogError, mockLogInfo, mockLogWarn } = vi.hoisted(() => ({
  mockProxy:    vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo:  vi.fn(),
  mockLogWarn:  vi.fn(),
}));

// ── Mocks de módulo ────────────────────────────────────────────────────────

// sendTelegram — controla o comportamento do Telegram em cada teste
vi.mock("../lib/telegram", () => ({
  sendTelegram:   vi.fn(),
  getWebhookInfo: vi.fn(),
}));

// ReplitConnectors — usa function (não arrow) para que `new` funcione
// corretamente e mockProxy seja atribuído à instância.
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: vi.fn(function (this: Record<string, unknown>) {
    this["proxy"] = mockProxy;
  }),
}));

// @workspace/db — salvarHistorico (no finally) usa db.execute
vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
}));

// logger — capturamos estrutura dos logs para verificar telegramFailed: true
vi.mock("../lib/logger", () => ({
  logger: {
    info:  mockLogInfo,
    warn:  mockLogWarn,
    error: mockLogError,
  },
}));

// slack-glossario — GLOSSARIO é percorrido em formatarRelatorioTelegram
vi.mock("../lib/slack-glossario", () => ({
  anotarTermos: vi.fn().mockReturnValue({ textoAnotado: "", legendas: [] }),
  GLOSSARIO:    [],
}));

// ── Imports após os mocks ──────────────────────────────────────────────────
import { postTelegramReport } from "../lib/slack-reporter";
import type { LlmReport } from "../lib/slack-reporter";
import { sendTelegram } from "../lib/telegram";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<LlmReport> = {}): LlmReport {
  return {
    geradoEm:            new Date("2026-08-14T15:00:00.000Z").toISOString(),
    periodo:             "última 1h",
    stats:               [],
    specsAtivas:         [],
    divergencias:        [],
    totalCustoUsd:       0,
    totalChamadas:       0,
    mudancasPlanilha:    [],
    totalItensPlanilha:  0,
    itensConcluidos:     [],
    ultimoPreenchimento: null,
    ...overrides,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Verifica se alguma chamada ao logger.error incluiu { telegramFailed: true } */
function hadTelegramFailedLog(): boolean {
  return (mockLogError.mock.calls as unknown[][]).some(
    (args) => (args[0] as Record<string, unknown>)?.telegramFailed === true,
  );
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("postTelegramReport — retry + fallback Slack após 3 falhas", () => {
  const sendTelegramMock = sendTelegram as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // mockProxy: resposta padrão de sucesso do Slack (para o aviso de fallback)
    mockProxy.mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. Fallback ativo: Telegram recusa 3 vezes ────────────────────────────
  it("posta aviso de fallback no Slack após 3 tentativas com 403 Forbidden", async () => {
    // Todas as 3 tentativas falham
    sendTelegramMock.mockResolvedValue({ sent: false, error: "403 Forbidden" });

    // A rejeição deve ser registrada ANTES de avançar os timers para evitar
    // "PromiseRejectionHandledWarning" (rejection handler attached asynchronously)
    const rejectPromise = expect(
      postTelegramReport("CHAT_123", makeReport(), "C_SLACK_FALLBACK"),
    ).rejects.toThrow(/Telegram sendMessage falhou após 3 tentativas/);

    // Avança os backoffs (1 s na 2ª tentativa + 2 s na 3ª)
    await vi.runAllTimersAsync();
    await rejectPromise;

    // Telegram foi tentado exatamente 3 vezes
    expect(sendTelegramMock).toHaveBeenCalledTimes(3);

    // slackPost (via ReplitConnectors.proxy) foi chamado exatamente 1 vez
    expect(mockProxy).toHaveBeenCalledTimes(1);

    // Verifica path e conteúdo do aviso de fallback
    const [proxyService, proxyPath, proxyOpts] = mockProxy.mock.calls[0] as [
      string,
      string,
      { body: string },
    ];
    expect(proxyService).toBe("slack");
    expect(proxyPath).toBe("/chat.postMessage");

    const body = JSON.parse(proxyOpts.body) as { channel: string; text: string };
    expect(body.channel).toBe("C_SLACK_FALLBACK");
    expect(body.text).toContain("Telegram offline");
    expect(body.text).toContain("403 Forbidden");
    expect(body.text).toContain("CHAT_123");

    // Log contém { telegramFailed: true }
    expect(hadTelegramFailedLog()).toBe(true);
  });

  // ── 2. Sem slackFallbackChannelId — fallback não é acionado ──────────────
  it("não posta fallback Slack quando slackFallbackChannelId não é fornecido", async () => {
    sendTelegramMock.mockResolvedValue({ sent: false, error: "503 Service Unavailable" });

    const rejectPromise = expect(
      postTelegramReport("CHAT_123", makeReport() /* sem fallbackSlackChannelId */),
    ).rejects.toThrow(/Telegram sendMessage falhou/);

    await vi.runAllTimersAsync();
    await rejectPromise;

    // 3 tentativas ao Telegram
    expect(sendTelegramMock).toHaveBeenCalledTimes(3);

    // Slack NÃO foi chamado (sem fallbackSlackChannelId)
    expect(mockProxy).not.toHaveBeenCalled();

    // Mas o log ainda registra telegramFailed: true
    expect(hadTelegramFailedLog()).toBe(true);
  });

  // ── 3. Caminho feliz: 1ª tentativa aceita ────────────────────────────────
  it("não aciona fallback quando Telegram aceita na 1ª tentativa", async () => {
    sendTelegramMock.mockResolvedValue({ sent: true });

    const resolvePromise = expect(
      postTelegramReport("CHAT_123", makeReport(), "C_SLACK_FALLBACK"),
    ).resolves.toBeUndefined();

    await vi.runAllTimersAsync();
    await resolvePromise;

    // Telegram chamado apenas 1 vez
    expect(sendTelegramMock).toHaveBeenCalledTimes(1);

    // Nenhum fallback acionado
    expect(mockProxy).not.toHaveBeenCalled();

    // Nenhum log de erro com telegramFailed
    expect(hadTelegramFailedLog()).toBe(false);
  });

  // ── 5. Modo MOCK (sem token no cofre) — 1 chamada, sem retry, sem fallback ─
  it("modo MOCK: resolve sem erro com 1 chamada e sem fallback Slack", async () => {
    // Simula ausência de token: sendTelegram retorna { mock: true }
    sendTelegramMock.mockResolvedValue({ mock: true });

    const resolvePromise = expect(
      postTelegramReport("CHAT_123", makeReport(), "C_SLACK_FALLBACK"),
    ).resolves.toBeUndefined();

    await vi.runAllTimersAsync();
    await resolvePromise;

    // sendTelegram chamado exatamente 1 vez — sem retentativas
    expect(sendTelegramMock).toHaveBeenCalledTimes(1);

    // Nenhum fallback Slack acionado
    expect(mockProxy).not.toHaveBeenCalled();

    // Nenhum log de erro com telegramFailed
    expect(hadTelegramFailedLog()).toBe(false);
  });

  // ── 4. Telegram falha nas 2 primeiras e aceita na 3ª — sem fallback ───────
  it("não aciona fallback quando Telegram aceita na 3ª tentativa", async () => {
    sendTelegramMock
      .mockResolvedValueOnce({ sent: false, error: "500 Internal Server Error" })
      .mockResolvedValueOnce({ sent: false, error: "500 Internal Server Error" })
      .mockResolvedValueOnce({ sent: true });

    const resolvePromise = expect(
      postTelegramReport("CHAT_123", makeReport(), "C_SLACK_FALLBACK"),
    ).resolves.toBeUndefined();

    await vi.runAllTimersAsync();
    await resolvePromise;

    // Telegram tentado 3 vezes, aceitou na 3ª
    expect(sendTelegramMock).toHaveBeenCalledTimes(3);

    // Nenhum fallback — não esgotou as tentativas
    expect(mockProxy).not.toHaveBeenCalled();

    // Sem log de erro com telegramFailed
    expect(hadTelegramFailedLog()).toBe(false);
  });
});
