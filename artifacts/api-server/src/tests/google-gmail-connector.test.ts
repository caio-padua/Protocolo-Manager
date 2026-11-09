import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { proxy, fetchMock } = vi.hoisted(() => ({ proxy: vi.fn(), fetchMock: vi.fn() }));
vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = proxy;
    getProxyUrl() { return "https://connector.example.test"; }
    async getProxyHeaders() { return { "Connector-Name": "google-mail" }; }
  },
}));

import { getGmailAddress, isGmailConnected, sendGmailMessage } from "../lib/google-gmail";

describe("Gmail pelo conector configurado", () => {
  beforeEach(() => { proxy.mockReset(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("consulta o perfil para confirmar acesso e identificar o remetente", async () => {
    proxy.mockImplementation(async () => new Response(JSON.stringify({ emailAddress: "clinica@example.test" }), { status: 200 }));
    expect(await isGmailConnected()).toBe(true);
    expect(await getGmailAddress()).toBe("clinica@example.test");
    expect(proxy).toHaveBeenCalledWith("google-mail", "/gmail/v1/users/me/profile", { method: "GET" });
  });

  it("não apresenta perfil recusado como conectado", async () => {
    proxy.mockResolvedValue(new Response("", { status: 401 }));
    expect(await isGmailConnected()).toBe(false);
    expect(await getGmailAddress()).toBeNull();
  });

  it("envia uma vez, preservando destinatário e anexo", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "mensagem-1" }), { status: 200 }));
    const result = await sendGmailMessage({
      to: "cliente@example.test", subject: "Protocolo", html: "<p>Olá</p>",
      attachments: [
        { filename: "arquivo.pdf", content: Buffer.from("documento"), contentType: "application/pdf" },
        { filename: "ras-fap.pdf", content: Buffer.from("ras-fap"), contentType: "application/pdf" },
      ],
    });
    expect(result).toEqual({ success: true, messageId: "mensagem-1" });
    expect(fetchMock.mock.calls.length).toBe(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://connector.example.test/gmail/v1/users/me/messages/send");
    expect(options.headers["Connector-Name"]).toBe("google-mail");
    const mime = Buffer.from(JSON.parse(options.body).raw, "base64url").toString();
    expect(mime).toContain("To: cliente@example.test");
    expect(mime).toContain('filename="arquivo.pdf"');
    expect(mime).toContain(Buffer.from("documento").toString("base64"));
    expect(mime).toContain('filename="ras-fap.pdf"');
    expect(mime).toContain(Buffer.from("ras-fap").toString("base64"));
  });

  it("não repete envio quando a resposta é perdida", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => { throw new Error("falha de rede"); });
    const result = await sendGmailMessage({ to: "cliente@example.test", subject: "Protocolo", html: "Olá" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Verifique antes de reenviar");
    expect(fetchMock.mock.calls.length).toBe(1);
    log.mockRestore();
  });

  it("não marca como enviado quando o provedor não confirma o identificador", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await sendGmailMessage({ to: "cliente@example.test", subject: "Protocolo", html: "Olá" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Verifique antes de reenviar");
  });
});
