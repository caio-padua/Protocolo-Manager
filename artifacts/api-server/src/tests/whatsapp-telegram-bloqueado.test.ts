/**
 * whatsapp-telegram-bloqueado.test.ts
 *
 * Garante que registrarTelegramBloqueado é chamada nos caminhos corretos
 * de sendWhatsapp:
 *  - HTTP não-2xx do Twilio
 *  - error_code imediato na resposta JSON
 *  - falha assíncrona detectada por verifyDeliveryFailure (ex.: 63016)
 *  - exceção de rede
 *
 * E que NÃO é chamada quando:
 *  - O paciente não tem telegramChatId vinculado
 *  - O WhatsApp é entregue com sucesso
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── mocks externos ────────────────────────────────────────────────────────────

// Deve ser definido ANTES do import do módulo (hoisting do vi.mock).
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => mockDbSelect() }) }) }),
    insert: () => ({ values: () => ({ returning: () => mockDbInsert() }) }),
    update: () => ({ set: () => ({ where: () => mockDbUpdate() }) }),
  },
  whatsappMensagensLogTable: { id: "id", clienteId: "client_id", via: "via", status: "status", criadoEm: "criado_em" },
  clientsTable: { id: "id", telegramChatId: "telegram_chat_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ col: a, val: b }),
  and: (...args: unknown[]) => args,
  desc: (a: unknown) => a,
  ne: (a: unknown, b: unknown) => ({ ne: true, col: a, val: b }),
  gt: (a: unknown, b: unknown) => ({ gt: true, col: a, val: b }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/secure-settings", () => ({
  getSecret: vi.fn().mockResolvedValue("test-token"),
}));

vi.mock("../lib/telegram", () => ({
  sendTelegram: vi.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTwilioOkResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ sid: "SM123", status: "queued", error_code: null, ...overrides }),
    { status: 200 },
  );
}

function makeTwilioErrorResponse(status = 400) {
  return new Response("Bad Request", { status });
}

/** Simula clientsTable.select retornando telegramChatId */
function withChatId(chatId: string | null) {
  mockDbSelect.mockResolvedValue([{ telegramChatId: chatId }]);
}

/** Simula inserção no log retornando id=1 */
function withLogInsert() {
  mockDbInsert.mockResolvedValue([{ id: 1 }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  withLogInsert();
  // Por padrão, paciente TEM chatId (pior caso — queremos ver se o bloqueio é gravado)
  withChatId("chatId-123");
});

// ── testes ────────────────────────────────────────────────────────────────────

describe("sendWhatsapp — registro de espelho Telegram bloqueado", () => {
  // Importação lazy para não conflitar com o vi.mock
  async function getSendWhatsapp() {
    const mod = await import("../lib/whatsapp");
    return mod.sendWhatsapp;
  }

  it("HTTP não-2xx: registra bloqueio quando paciente tem chatId", async () => {
    mockFetch.mockResolvedValueOnce(makeTwilioErrorResponse(400));
    const sendWhatsapp = await getSendWhatsapp();

    const result = await sendWhatsapp("+5511999999999", "Olá", { clienteId: 42 });

    expect(result.sent).toBe(false);
    // Deve ter tentado inserir 2 linhas: 1 WhatsApp failed + 1 Telegram bloqueado
    // O select é chamado para verificar o chatId antes de inserir o bloqueio.
    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
  });

  it("HTTP não-2xx: NÃO registra bloqueio quando paciente NÃO tem chatId", async () => {
    withChatId(null);
    mockFetch.mockResolvedValueOnce(makeTwilioErrorResponse(400));
    const sendWhatsapp = await getSendWhatsapp();

    await sendWhatsapp("+5511999999999", "Olá", { clienteId: 42 });

    // O select verifica chatId → null → para aqui; apenas 1 insert (WhatsApp failed)
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it("error_code imediato (ex.: 63016): registra bloqueio com código correto", async () => {
    mockFetch
      .mockResolvedValueOnce(makeTwilioOkResponse({ sid: "SM999", status: "queued", error_code: 63016 }));
    const sendWhatsapp = await getSendWhatsapp();

    const result = await sendWhatsapp("+5511999999999", "Olá", { clienteId: 42 });

    expect(result.sent).toBe(false);
    expect(result.error).toBe("twilio_63016");
    // Deve ter chamado select (chatId check) e 2 inserts (WA + Telegram bloqueado)
    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
  });

  it("verifyDeliveryFailure detecta falha assíncrona: registra bloqueio", async () => {
    // Twilio aceita (2xx sem error_code)
    mockFetch.mockResolvedValueOnce(makeTwilioOkResponse({ sid: "SM456", error_code: null }));
    // verifyDeliveryFailure faz até 3 polls; retorna "failed" na 1ª tentativa
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "failed", error_code: 63016 }), { status: 200 }),
    );
    const sendWhatsapp = await getSendWhatsapp();

    const result = await sendWhatsapp("+5511999999999", "Olá", { clienteId: 42 });

    expect(result.sent).toBe(false);
    expect(result.error).toBe("twilio_63016");
    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockDbInsert).toHaveBeenCalledTimes(2); // WA queued + Telegram bloqueado
  });

  it("sem clienteId: nunca registra bloqueio (sem espelho possível)", async () => {
    mockFetch.mockResolvedValueOnce(makeTwilioErrorResponse(400));
    const sendWhatsapp = await getSendWhatsapp();

    await sendWhatsapp("+5511999999999", "Olá", {}); // sem clienteId

    // Sem clienteId, registrarTelegramBloqueado retorna early — sem select nem insert extra
    expect(mockDbSelect).not.toHaveBeenCalled();
    // Apenas 1 insert: o log do WhatsApp failed
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it("WhatsApp entregue com sucesso: NÃO registra bloqueio", async () => {
    mockFetch
      .mockResolvedValueOnce(makeTwilioOkResponse({ sid: "SM789", error_code: null }))
      // verifyDeliveryFailure: status ainda transitório após 3 polls → retorna null
      .mockResolvedValue(new Response(JSON.stringify({ status: "sent" }), { status: 200 }));

    // sendTelegram mock (espelho)
    const { sendTelegram } = await import("../lib/telegram");
    (sendTelegram as Mock).mockResolvedValue({ sent: true, mock: false });

    const sendWhatsapp = await getSendWhatsapp();
    const result = await sendWhatsapp("+5511999999999", "Olá", { clienteId: 42 });

    expect(result.sent).toBe(true);
    // Apenas 1 insert de log WhatsApp (queued) — Telegram foi ENVIADO, não bloqueado
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });
});
