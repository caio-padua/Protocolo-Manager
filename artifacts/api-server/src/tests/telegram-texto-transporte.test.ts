import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), getSecret: vi.fn(), info: vi.fn(), warn: vi.fn(),
}));
vi.mock("../lib/secure-settings", () => ({ getSecret: mocks.getSecret }));
vi.mock("../lib/logger", () => ({ logger: { info: mocks.info, warn: mocks.warn } }));

async function enviar() {
  const { sendTelegram } = await import("../lib/telegram");
  return sendTelegram("11111", "Mensagem técnica sintética");
}
describe("transporte de texto: aceite verificável e erro sem conteúdo", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "12345:segredo-sintetico");
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("aceita somente resposta ok com identificador válido de mensagem", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 10 } })));
    expect(await enviar()).toEqual({ sent: true, mock: false });
    const [, options] = mocks.fetch.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([{}, { ok: false }, { ok: true }, { ok: true, result: {} },
    { ok: true, result: { message_id: "10" } }, { ok: true, result: { message_id: 0 } },
  ])("200 sem comprovante não é aceite (%j)", async (body) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body)));
    expect(await enviar()).toEqual({ sent: false, mock: false, error: "telegram_resultado_invalido" });
  });

  it("JSON ilegível fica sem aceite", async () => {
    mocks.fetch.mockResolvedValue(new Response("nao-json"));
    expect((await enviar()).sent).toBe(false);
  });

  it("recusa HTTP não copia corpo externo com dados", async () => {
    mocks.fetch.mockResolvedValue(new Response("segredo-sintetico texto privado", { status: 403 }));
    expect(await enviar()).toEqual({ sent: false, mock: false, error: "telegram_http_403" });
  });

  it("exceção de rede não devolve endereço com token", async () => {
    mocks.fetch.mockRejectedValue(new Error("https://api.telegram.org/bot12345:segredo-sintetico/sendMessage"));
    const resultado = await enviar();
    expect(resultado).toEqual({ sent: false, mock: false, error: "telegram_falha_de_rede_ou_timeout" });
    expect(JSON.stringify([resultado, mocks.info.mock.calls, mocks.warn.mock.calls])).not.toContain("segredo-sintetico");
  });

  it("expiração do prazo aborta a chamada e não causa segunda tentativa", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    try {
      mocks.fetch.mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(new Error("prazo")), { once: true });
      }));
      // Importar antes de avançar o relógio garante que fetch iniciou.
      const { sendTelegram } = await import("../lib/telegram");
      const pendente = sendTelegram("11111", "teste");
      await vi.advanceTimersByTimeAsync(15_001);
      expect(await pendente).toEqual({ sent: false, mock: false, error: "telegram_falha_de_rede_ou_timeout" });
      expect(timeout).toHaveBeenCalledWith(15_000);
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });
});
