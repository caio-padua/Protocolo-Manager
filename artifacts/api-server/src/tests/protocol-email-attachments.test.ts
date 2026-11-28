import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../lib/messaging/index.js", () => ({
  enviarMensagemPaxter: send,
  baseUrlFromEnv: () => "https://clinica.example.test",
}));

import { sendProtocolEmail, type ProtocolEmailData } from "../lib/email-service";

const data: ProtocolEmailData = {
  clientName: "Cliente sintético",
  clientEmail: "cliente@example.test",
  protocolTitle: "Protocolo sintético",
  professionalName: "Profissional sintético",
  startDate: "2030-01-07",
  substances: [],
  pdfBuffer: Buffer.from("protocolo"),
  pdfFileName: "protocolo.pdf",
};

describe("anexos anunciados no e-mail do protocolo", () => {
  beforeEach(() => { send.mockReset(); send.mockResolvedValue({ resultados: [{ sent: true }] }); });

  it("não anuncia RAS FAP ausente", async () => {
    await sendProtocolEmail(data);
    const doc = send.mock.calls[0][0];
    expect(doc.anexos).toHaveLength(1);
    expect(doc.blocosHtml.join(" ")).not.toContain("RASP FAP");
  });

  it("anuncia RAS FAP quando ele é o segundo anexo", async () => {
    await sendProtocolEmail({ ...data, rasFapBuffer: Buffer.from("ras"), rasFapFileName: "ras.pdf" });
    const doc = send.mock.calls[0][0];
    expect(doc.anexos).toHaveLength(2);
    expect(doc.blocosHtml.join(" ")).toContain("RASP FAP");
    expect(doc.blocosHtml.join(" ")).not.toContain("RAS FAP");
  });

  it("anuncia RAS FAP quando ele é o PDF principal do reenvio", async () => {
    await sendProtocolEmail({ ...data, pdfIsRasFap: true });
    const doc = send.mock.calls[0][0];
    expect(doc.anexos).toHaveLength(1);
    expect(doc.blocosHtml.join(" ")).toContain("RASP FAP");
    expect(doc.blocosHtml.join(" ")).not.toContain("RAS FAP");
  });
});
