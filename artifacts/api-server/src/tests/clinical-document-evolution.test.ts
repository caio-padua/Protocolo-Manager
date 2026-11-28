import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  execute: vi.fn(), config: vi.fn(), allowed: vi.fn(), identity: vi.fn(), send: vi.fn(),
  phrase: vi.fn(),
}));
vi.mock("@workspace/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("../lib/evolution", () => ({
  lerConfig: mocks.config, contatoAutorizado: mocks.allowed, enviarTextoEvolution: mocks.send,
}));
vi.mock("../lib/evolution-client-identity", () => ({ resolverIdentidadeWhatsapp: mocks.identity }));
vi.mock("../lib/telegram-frases", () => ({ carregarFrases: async () => mocks.phrase }));
import { destinoEvolutionDocumento, enviarDocumentoEvolution } from "../lib/clinical-document-evolution";

const destination = "5511000000000";
const input = { empresaId: 5, clientId: 9, locationId: 7, destination,
  professionalId: 3, title: "Documento sintético", url: "https://example.invalid/protected",
  reissueRequestId: "123" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockResolvedValue({ instanceName: "synthetic" });
  mocks.execute.mockResolvedValue({ rows: [{ phone: "11000000000", telefone: destination }] });
  mocks.allowed.mockReturnValue(true);
  mocks.identity.mockResolvedValue({ id: 9, locationId: 7 });
  mocks.phrase.mockReturnValue("TEXTO EDITÁVEL SINTÉTICO");
  mocks.send.mockResolvedValue({ accepted: true, id: 1, providerId: "synthetic" });
});
describe("entrega profissional pela Evolution", () => {
  it("sem Evolution configurada preserva o canal anterior", async () => {
    mocks.config.mockResolvedValue(null);
    expect(await destinoEvolutionDocumento(5, 9, 7)).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("usa vínculo confirmado, não telefone arbitrário do navegador", async () => {
    expect(await destinoEvolutionDocumento(5, 9, 7)).toBe(destination);
    expect(mocks.identity).toHaveBeenCalledWith(expect.anything(), 5, destination);
  });
  it.each(["sem_cliente", "nao_autorizado", "colisao"])("bloqueia %s", async kind => {
    if (kind === "sem_cliente") mocks.execute.mockResolvedValue({ rows: [] });
    if (kind === "nao_autorizado") mocks.allowed.mockReturnValue(false);
    if (kind === "colisao") mocks.identity.mockResolvedValue(null);
    await expect(destinoEvolutionDocumento(5, 9, 7)).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("revalida o destino antes da rede", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ telefone: "5511999999999" }] });
    await expect(enviarDocumentoEvolution(input)).rejects.toThrow("destino mudou");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("usa texto editável e associa a solicitação ao registro de envio", async () => {
    const result = await enviarDocumentoEvolution(input);
    expect(result.accepted).toBe(true);
    expect(mocks.phrase).toHaveBeenCalledWith("documento_link_seguro_whatsapp",
      { titulo: input.title, url: input.url });
    expect(mocks.send).toHaveBeenCalledWith(5, destination, "TEXTO EDITÁVEL SINTÉTICO",
      "clinical_document_resend", 3, "123");
  });
});
