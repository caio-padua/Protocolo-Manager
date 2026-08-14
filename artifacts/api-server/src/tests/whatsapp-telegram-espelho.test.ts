/**
 * whatsapp-telegram-espelho.test.ts
 *
 * Confirma que espelharParaTelegram dispara SOMENTE após o Twilio confirmar
 * aceitação da mensagem. Três cenários:
 *
 *   1. Twilio retorna HTTP não-2xx → espelho NÃO dispara
 *   2. Twilio retorna 2xx mas com error_code 63016 (fora da janela 24h)
 *      → espelho NÃO dispara
 *   3. Twilio retorna 2xx, verifyDeliveryFailure detecta status "failed"
 *      com error_code 63016 → espelho NÃO dispara
 *   4. Twilio aceita a mensagem com sucesso → espelho É disparado
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── vi.hoisted — variáveis disponíveis dentro de vi.mock factories ─────────
const { mockFetch, mockSendTelegram, mockLogWarn, mockLogInfo } = vi.hoisted(() => ({
  mockFetch:        vi.fn(),
  mockSendTelegram: vi.fn(),
  mockLogWarn:      vi.fn(),
  mockLogInfo:      vi.fn(),
}));

// ── Mocks de módulo ────────────────────────────────────────────────────────

// fetch global — intercepta chamadas à API do Twilio
vi.stubGlobal("fetch", mockFetch);

// secure-settings — devolve credenciais válidas sempre
vi.mock("../lib/secure-settings", () => ({
  getSecret: vi.fn(async (key: string) => {
    if (key === "twilio.accountSid")   return "ACTEST000";
    if (key === "twilio.authToken")    return "token_test";
    if (key === "twilio.whatsappFrom") return "whatsapp:+14155238886";
    return null;
  }),
}));

// telegram — spy na entrega ao paciente via Telegram
vi.mock("../lib/telegram", () => ({
  sendTelegram: mockSendTelegram,
}));

// @workspace/db — mock de baixo acoplamento para insert/update/select
// Cada cadeia retorna `this` e as terminais resolvem valores adequados.
vi.mock("@workspace/db", () => {
  const insertChain = {
    values:    vi.fn(),
    returning: vi.fn().mockResolvedValue([{ id: 42 }]),
  };
  insertChain.values.mockReturnValue(insertChain);

  const updateChain = {
    set:   vi.fn(),
    where: vi.fn().mockResolvedValue([]),
  };
  updateChain.set.mockReturnValue(updateChain);

  // espelharParaTelegram faz SELECT para buscar o telegramChatId do cliente
  const selectChain = {
    from:  vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue([{ telegramChatId: "TELEGRAM_CHAT_999" }]),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);

  return {
    db: {
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
      select: vi.fn().mockReturnValue(selectChain),
    },
    whatsappMensagensLogTable: {},
    clientsTable:              {},
  };
});

// logger — silencia durante os testes
vi.mock("../lib/logger", () => ({
  logger: {
    info:  mockLogInfo,
    warn:  mockLogWarn,
    error: vi.fn(),
  },
}));

// ── Import após os mocks ───────────────────────────────────────────────────
import { sendWhatsapp } from "../lib/whatsapp";

// ── Helpers de fetch mock ──────────────────────────────────────────────────

/** Resposta Twilio de falha HTTP (não-2xx). */
function twilioHttpError(status = 500) {
  return {
    ok:     false,
    status,
    text:   vi.fn().mockResolvedValue("Internal Server Error"),
    json:   vi.fn().mockResolvedValue({}),
  };
}

/** Resposta Twilio 2xx com error_code imediato (ex: 63016). */
function twilioAcceptedWithErrorCode(errorCode: number) {
  return {
    ok:   true,
    status: 200,
    text: vi.fn().mockResolvedValue(""),
    json: vi.fn().mockResolvedValue({
      sid:        "SM_ERR_IMMEDIATE",
      status:     "failed",
      error_code: errorCode,
    }),
  };
}

/** Resposta Twilio 2xx sem erro (mensagem aceita). */
function twilioAccepted(sid = "SM_OK_123") {
  return {
    ok:   true,
    status: 200,
    text: vi.fn().mockResolvedValue(""),
    json: vi.fn().mockResolvedValue({
      sid,
      status:     "queued",
      error_code: null,
    }),
  };
}

/** Resposta de polling de status: falha definitiva com error_code. */
function twilioStatusFailed(errorCode: number) {
  return {
    ok:   true,
    status: 200,
    text: vi.fn().mockResolvedValue(""),
    json: vi.fn().mockResolvedValue({
      status:     "failed",
      error_code: errorCode,
    }),
  };
}

/** Resposta de polling de status: entregue com sucesso. */
function twilioStatusDelivered() {
  return {
    ok:   true,
    status: 200,
    text: vi.fn().mockResolvedValue(""),
    json: vi.fn().mockResolvedValue({ status: "delivered", error_code: null }),
  };
}

/** Aguarda todas as microtasks pendentes (flush de Promises). */
async function flushMicrotasks(ticks = 10) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

// ── Testes ────────────────────────────────────────────────────────────────

describe("sendWhatsapp — espelho Telegram dispara somente após confirmação do Twilio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // sendTelegram retorna sucesso por padrão (quando chamado)
    mockSendTelegram.mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Cenário 1: HTTP não-2xx ──────────────────────────────────────────────
  it("NÃO espelha para Telegram quando Twilio retorna HTTP não-2xx (500)", async () => {
    mockFetch.mockResolvedValue(twilioHttpError(500));

    const resultPromise = sendWhatsapp("11999990000", "Olá", { clienteId: 1 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    await flushMicrotasks();

    expect(result.sent).toBe(false);
    expect(result.error).toContain("HTTP 500");
    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  // ── Cenário 2: 2xx com error_code 63016 imediato ─────────────────────────
  it("NÃO espelha para Telegram quando Twilio retorna 2xx com error_code 63016", async () => {
    mockFetch.mockResolvedValue(twilioAcceptedWithErrorCode(63016));

    const resultPromise = sendWhatsapp("11999990000", "Olá", { clienteId: 1 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    await flushMicrotasks();

    expect(result.sent).toBe(false);
    expect(result.error).toContain("63016");
    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  // ── Cenário 3: 2xx aceito, mas polling detecta status "failed" (63016) ───
  it("NÃO espelha para Telegram quando verifyDeliveryFailure detecta status failed/63016", async () => {
    // POST aceita; polling devolve "failed" com 63016 na 1ª tentativa
    mockFetch
      .mockResolvedValueOnce(twilioAccepted("SM_ASYNC_FAIL")) // POST
      .mockResolvedValue(twilioStatusFailed(63016));          // GETs de polling

    const resultPromise = sendWhatsapp("11999990000", "Olá", { clienteId: 1 });
    // Avança os sleeps de verifyDeliveryFailure (3 × 1000 ms)
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    await flushMicrotasks();

    expect(result.sent).toBe(false);
    expect(result.error).toContain("63016");
    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  // ── Cenário 4: Twilio aceita sem erro → espelho dispara ──────────────────
  it("espelha para Telegram quando Twilio aceita a mensagem com sucesso", async () => {
    // POST aceita; polling devolve "delivered" (sem erro)
    mockFetch
      .mockResolvedValueOnce(twilioAccepted("SM_SUCCESS")) // POST
      .mockResolvedValue(twilioStatusDelivered());          // GETs de polling

    const resultPromise = sendWhatsapp("11999990000", "Olá", { clienteId: 1 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    // Permite que a Promise do espelho (fire-and-forget) seja resolvida
    await flushMicrotasks();

    expect(result.sent).toBe(true);
    expect(result.via).toBe("twilio");
    expect(mockSendTelegram).toHaveBeenCalledTimes(1);
    expect(mockSendTelegram).toHaveBeenCalledWith("TELEGRAM_CHAT_999", "Olá");
  });

  // ── Extra: sem clienteId → espelho nunca é tentado ────────────────────────
  it("nunca tenta espelhar para Telegram quando clienteId não é fornecido", async () => {
    mockFetch
      .mockResolvedValueOnce(twilioAccepted("SM_NO_CLIENT"))
      .mockResolvedValue(twilioStatusDelivered());

    const resultPromise = sendWhatsapp("11999990000", "Olá" /* sem opts */);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    await flushMicrotasks();

    expect(result.sent).toBe(true);
    expect(mockSendTelegram).not.toHaveBeenCalled();
  });
});
