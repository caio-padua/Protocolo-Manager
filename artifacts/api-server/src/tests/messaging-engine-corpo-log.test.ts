/**
 * Motor Hermes: mensagem com segredo não pode ficar gravada no log do WhatsApp.
 * O contexto do envio aceita `corpoParaLog`; sem ele o comportamento dos demais chamadores
 * não muda. Dados sintéticos; nenhum envio real (Art. 82).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendWhatsapp: vi.fn(),
  sendWhatsappStickerOnly: vi.fn(),
}));

vi.mock("@workspace/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("../lib/whatsapp", () => ({
  sendWhatsapp: mocks.sendWhatsapp,
  sendWhatsappStickerOnly: mocks.sendWhatsappStickerOnly,
}));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: vi.fn() }));
vi.mock("../lib/telegram", () => ({ sendTelegramAnimation: vi.fn(), sendTelegramSticker: vi.fn() }));
vi.mock("../lib/avatar-messenger", () => ({
  getAvatarAtivoPorEmpresa: vi.fn(), limparTextoParaVoz: (t: string) => t, setAudioTemp: vi.fn(),
}));
vi.mock("../lib/elevenlabs", () => ({ gerarAudio: vi.fn(), checkElevenLabsStatus: vi.fn() }));
vi.mock("../lib/avatar-envios", () => ({ registrarEnvioAvatar: vi.fn() }));
vi.mock("../lib/avatar-metering", () => ({ registrarUso: vi.fn() }));

import { enviarMensagemPaxter } from "../lib/messaging/engine";

const doc = { eyebrow: "Chave de confirmação", titulo: "482913", paragrafos: ["Olá, Maria."] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendWhatsapp.mockResolvedValue({ sent: true, via: "twilio" });
  mocks.sendWhatsappStickerOnly.mockResolvedValue({ sent: true });
});

describe("Hermes: corpoParaLog no WhatsApp", () => {
  it("repassa o texto de log quando o chamador pede (a chave não vai ao log)", async () => {
    const r = await enviarMensagemPaxter(doc, { telefone: "11999990000" }, ["WHATSAPP"], {
      baseUrl: "https://clinica.teste", corpoParaLog: "[omitido]",
    });
    expect(r.resultados[0]).toMatchObject({ canal: "WHATSAPP", sent: true, via: "twilio" });
    const [phone, caption, opts] = mocks.sendWhatsapp.mock.calls[0];
    expect(phone).toBe("11999990000");
    expect(caption).toContain("*482913*");
    expect(opts).toEqual({ mediaUrl: "https://clinica.teste/api/brand/paxter-banner.png", corpoParaLog: "[omitido]" });
  });

  it("sem corpoParaLog o chamado fica idêntico ao de antes (demais chamadores não mudam)", async () => {
    await enviarMensagemPaxter(doc, { telefone: "11999990000" }, ["WHATSAPP"], { baseUrl: "https://clinica.teste" });
    const opts = mocks.sendWhatsapp.mock.calls[0][2];
    expect(opts).toEqual({ mediaUrl: "https://clinica.teste/api/brand/paxter-banner.png" });
    expect("corpoParaLog" in opts).toBe(false);
  });
});
