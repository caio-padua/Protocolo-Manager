/**
 * telegram-webhook-guard.test.ts
 *
 * Confirma que o guard do webhook Telegram:
 *   1. checkWebhookHealth() retorna healthy:false quando url é ""
 *   2. checkWebhookHealth() retorna healthy:true quando url está preenchida
 *   3. runGuardCycle() dispara alerta Slack quando url="" (webhook inativo)
 *   4. runGuardCycle() dispara alerta Slack de "reativado" quando url volta
 *   5. runGuardCycle() NÃO repete o alerta se o estado não mudou
 *   6. runGuardCycle() dispara alerta Slack após 2 erros de rede consecutivos
 *   7. runGuardCycle() NÃO alerta na 1ª falha de rede isolada
 *   8. runGuardCycle() também envia Telegram ao CEO quando chatId está configurado
 *   9. runGuardCycle() NÃO envia Telegram ao CEO quando chatId ausente
 *  10. checkWebhookHealth() retorna healthy:false quando fetchError está presente
 *  11. checkWebhookHealth() retorna healthy:false quando mock:true (token ausente)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted — variáveis usadas dentro de vi.mock factories ────────────────
const { mockGetWebhookInfo, mockSendTelegram, mockProxy, mockLogError, mockLogInfo, mockLogWarn } =
  vi.hoisted(() => ({
    mockGetWebhookInfo: vi.fn(),
    mockSendTelegram:   vi.fn(),
    mockProxy:          vi.fn(),
    mockLogError:       vi.fn(),
    mockLogInfo:        vi.fn(),
    mockLogWarn:        vi.fn(),
  }));

// ── Mocks de módulo ───────────────────────────────────────────────────────────

vi.mock("../lib/telegram", () => ({
  getWebhookInfo: mockGetWebhookInfo,
  sendTelegram:   mockSendTelegram,
}));

vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: vi.fn(function (this: Record<string, unknown>) {
    this["proxy"] = mockProxy;
  }),
}));

// ── Imports após mocks ────────────────────────────────────────────────────────

import {
  checkWebhookHealth,
  runGuardCycle,
  _resetGuardStateForTesting,
} from "../lib/telegram-webhook-guard";

// ── Logger fake ───────────────────────────────────────────────────────────────

function makeLogger() {
  return {
    info:  mockLogInfo  as unknown as import("pino").Logger["info"],
    warn:  mockLogWarn  as unknown as import("pino").Logger["warn"],
    error: mockLogError as unknown as import("pino").Logger["error"],
  } as unknown as import("pino").Logger;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WEBHOOK_URL = "https://example.replit.dev/api/telegram/webhook";

function webhookInfoDown() {
  return {
    url: "",
    hasCustomCertificate: false,
    pendingUpdateCount: 5,
  };
}

function webhookInfoUp(url = WEBHOOK_URL) {
  return {
    url,
    hasCustomCertificate: false,
    pendingUpdateCount: 0,
  };
}

function webhookInfoMock() {
  return {
    url: "",
    hasCustomCertificate: false,
    pendingUpdateCount: 0,
    mock: true,
  };
}

function webhookInfoFetchError(err = "ECONNREFUSED") {
  return {
    url: "",
    hasCustomCertificate: false,
    pendingUpdateCount: 0,
    fetchError: err,
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _resetGuardStateForTesting();

  // Slack proxy responde ok por padrão
  mockProxy.mockResolvedValue({
    json: vi.fn().mockResolvedValue({ ok: true }),
  });

  // sendTelegram bem-sucedido por padrão
  mockSendTelegram.mockResolvedValue({ sent: true });

  // Limpar PADAXOR_TELEGRAM_CHAT_ID entre testes
  delete process.env.PADAXOR_TELEGRAM_CHAT_ID;
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 1 — checkWebhookHealth: decisão de saúde
// ─────────────────────────────────────────────────────────────────────────────

describe("checkWebhookHealth — determinação de healthy", () => {
  it("retorna healthy:false quando url é vazia (polling ativo)", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());

    const result = await checkWebhookHealth();

    expect(result.healthy).toBe(false);
    expect(result.url).toBe("");
  });

  it("retorna healthy:true quando url está preenchida", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoUp());

    const result = await checkWebhookHealth();

    expect(result.healthy).toBe(true);
    expect(result.url).toBe(WEBHOOK_URL);
  });

  it("retorna healthy:false quando token ausente (mock:true)", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoMock());

    const result = await checkWebhookHealth();

    expect(result.healthy).toBe(false);
    expect(result.mock).toBe(true);
  });

  it("retorna healthy:false quando há fetchError de rede", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoFetchError());

    const result = await checkWebhookHealth();

    expect(result.healthy).toBe(false);
    expect(result.fetchError).toBe("ECONNREFUSED");
  });

  it("popula pendingUpdateCount a partir do getWebhookInfo", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());

    const result = await checkWebhookHealth();

    expect(result.pendingUpdateCount).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 2 — runGuardCycle: alerta Slack quando webhook cai
// ─────────────────────────────────────────────────────────────────────────────

describe("runGuardCycle — alerta Slack quando webhook inativo", () => {
  it("chama proxy do Slack quando url é vazia (1ª verificação)", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());

    await runGuardCycle(makeLogger());

    expect(mockProxy).toHaveBeenCalledOnce();
    const [service, path] = mockProxy.mock.calls[0] as [string, string, unknown];
    expect(service).toBe("slack");
    expect(path).toBe("/chat.postMessage");
  });

  it("o alerta Slack menciona polling e ação de reativar", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());

    await runGuardCycle(makeLogger());

    const opts = mockProxy.mock.calls[0][2] as { body: string };
    const body = JSON.parse(opts.body) as { text: string };
    expect(body.text).toContain("ALERTA");
    expect(body.text).toContain("polling");
    expect(body.text).toContain("register-webhook");
  });

  it("loga erro quando webhook é detectado como inativo", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());

    await runGuardCycle(makeLogger());

    expect(mockLogError).toHaveBeenCalledOnce();
  });

  it("NÃO repete o alerta Slack na 2ª verificação se estado não mudou", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());

    await runGuardCycle(makeLogger());   // 1ª: muda null → false → alerta
    vi.clearAllMocks();
    mockProxy.mockResolvedValue({ json: vi.fn().mockResolvedValue({ ok: true }) });

    await runGuardCycle(makeLogger());   // 2ª: false → false → sem mudança

    expect(mockProxy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 3 — runGuardCycle: alerta "reativado" quando webhook volta
// ─────────────────────────────────────────────────────────────────────────────

describe("runGuardCycle — alerta 'reativado' quando webhook volta", () => {
  it("envia alerta Slack de reativação após webhook voltar", async () => {
    // Ciclo 1: inativo
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());
    await runGuardCycle(makeLogger());

    // Ciclo 2: ativo de volta
    vi.clearAllMocks();
    mockProxy.mockResolvedValue({ json: vi.fn().mockResolvedValue({ ok: true }) });
    mockGetWebhookInfo.mockResolvedValue(webhookInfoUp());

    await runGuardCycle(makeLogger());

    expect(mockProxy).toHaveBeenCalledOnce();
    const opts = mockProxy.mock.calls[0][2] as { body: string };
    const body = JSON.parse(opts.body) as { text: string };
    expect(body.text).toContain("Reativado");
    expect(body.text).toContain(WEBHOOK_URL);
  });

  it("NÃO envia alerta 'reativado' no primeiro boot quando webhook já está saudável", async () => {
    // Primeira verificação: já saudável desde o boot (prevHealthy era null)
    mockGetWebhookInfo.mockResolvedValue(webhookInfoUp());

    await runGuardCycle(makeLogger());

    // Nenhum alerta — não houve transição false→true
    expect(mockProxy).not.toHaveBeenCalled();
  });

  it("NÃO repete alerta 'reativado' em verificações subsequentes saudáveis", async () => {
    // Ciclo 1: inativo
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());
    await runGuardCycle(makeLogger());

    // Ciclo 2: reativado
    mockGetWebhookInfo.mockResolvedValue(webhookInfoUp());
    await runGuardCycle(makeLogger());

    // Ciclo 3: ainda saudável
    vi.clearAllMocks();
    mockProxy.mockResolvedValue({ json: vi.fn().mockResolvedValue({ ok: true }) });
    await runGuardCycle(makeLogger());

    expect(mockProxy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 4 — runGuardCycle: alerta Telegram ao CEO
// ─────────────────────────────────────────────────────────────────────────────

describe("runGuardCycle — alerta Telegram ao CEO", () => {
  it("envia Telegram ao CEO quando PADAXOR_TELEGRAM_CHAT_ID está configurado", async () => {
    process.env.PADAXOR_TELEGRAM_CHAT_ID = "CEO_CHAT_999";
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());

    await runGuardCycle(makeLogger());

    // sendTelegram é chamado de forma fire-and-forget (void), aguardar microtasks
    await Promise.resolve();

    expect(mockSendTelegram).toHaveBeenCalledOnce();
    const [chatId, text] = mockSendTelegram.mock.calls[0] as [string, string];
    expect(chatId).toBe("CEO_CHAT_999");
    expect(text).toContain("polling");
  });

  it("NÃO envia Telegram quando chatId não está configurado", async () => {
    // PADAXOR_TELEGRAM_CHAT_ID já foi deletado no beforeEach
    mockGetWebhookInfo.mockResolvedValue(webhookInfoDown());

    await runGuardCycle(makeLogger());
    await Promise.resolve();

    expect(mockSendTelegram).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 5 — runGuardCycle: erros de rede em getWebhookInfo
// ─────────────────────────────────────────────────────────────────────────────

describe("runGuardCycle — falhas de rede em getWebhookInfo", () => {
  it("NÃO dispara alerta Slack na 1ª falha de rede (transitória)", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoFetchError("ETIMEDOUT"));

    await runGuardCycle(makeLogger());

    expect(mockProxy).not.toHaveBeenCalled();
  });

  it("dispara alerta Slack após 2 falhas de rede consecutivas", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoFetchError("ETIMEDOUT"));

    await runGuardCycle(makeLogger()); // 1ª — sem alerta
    await runGuardCycle(makeLogger()); // 2ª — alerta!

    expect(mockProxy).toHaveBeenCalledOnce();
    const opts = mockProxy.mock.calls[0][2] as { body: string };
    const body = JSON.parse(opts.body) as { text: string };
    expect(body.text).toContain("ETIMEDOUT");
  });

  it("reseta contador de erros de rede quando getWebhookInfo responde ok", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoFetchError("ETIMEDOUT"));
    await runGuardCycle(makeLogger()); // 1ª falha

    // Volta ao normal
    mockGetWebhookInfo.mockResolvedValue(webhookInfoUp());
    await runGuardCycle(makeLogger()); // ok — reseta contador

    vi.clearAllMocks();
    mockProxy.mockResolvedValue({ json: vi.fn().mockResolvedValue({ ok: true }) });
    mockGetWebhookInfo.mockResolvedValue(webhookInfoFetchError("ETIMEDOUT"));

    await runGuardCycle(makeLogger()); // 1ª falha novamente — sem alerta

    // Não deve ter disparado alerta (contador foi resetado)
    expect(mockProxy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 6 — runGuardCycle: modo MOCK (token ausente)
// ─────────────────────────────────────────────────────────────────────────────

describe("runGuardCycle — modo MOCK (token ausente)", () => {
  it("não dispara nenhum alerta quando mock:true", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoMock());

    await runGuardCycle(makeLogger());

    expect(mockProxy).not.toHaveBeenCalled();
    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  it("loga info (não error) quando mock:true", async () => {
    mockGetWebhookInfo.mockResolvedValue(webhookInfoMock());

    await runGuardCycle(makeLogger());

    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockLogInfo).toHaveBeenCalled();
  });
});
