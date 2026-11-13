import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DepsOutbox, LinhaRepasse } from "../lib/telegram-repasse-outbox";

const mocks = vi.hoisted(() => ({
  resolver: vi.fn(), enviar: vi.fn(), processar: vi.fn(),
}));
vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../lib/telegram-config", () => ({ resolverChatAlerta: mocks.resolver }));
vi.mock("../lib/telegram", () => ({ sendTelegram: mocks.enviar }));
vi.mock("../lib/telegram-repasse-outbox", () => ({
  registrarRepasse: vi.fn(), tentarRepasse: vi.fn(),
  processarRepassesVencidos: mocks.processar,
}));
import { processarRepassesPendentes } from "../lib/telegram-repasse-worker";

const linha: LinhaRepasse = {
  id: 1, inbox_message_id: 1, chat_id_destino: "22222", chat_id_remetente: "11111",
  cliente_id: 1, empresa_id: 5, direcao: "entrada", tentativas: 1,
  nome: "Cliente Sintético", cpf: null, texto: "Teste técnico sem conteúdo clínico",
};
async function tentativa() {
  await processarRepassesPendentes();
  const deps = mocks.processar.mock.calls[0][1] as DepsOutbox;
  return deps.enviar(linha);
}

describe("destino gravado x configuração atual do repasse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolver.mockResolvedValue({ chatId: "22222", fonte: "cofre", motivo: null });
    mocks.enviar.mockResolvedValue({ sent: true, mock: false });
    mocks.processar.mockResolvedValue({ incertosNovos: 0, examinados: 0, aceitos: 0, falhas: 0 });
  });

  it("destino atual igual ao gravado usa o transporte existente", async () => {
    expect(await tentativa()).toEqual({ kind: "entregue" });
    expect(mocks.enviar).toHaveBeenCalledTimes(1);
    expect(mocks.enviar.mock.calls[0][0]).toBe("22222");
  });

  it.each(["33333", null])("destino alterado ou removido bloqueia e não redireciona", async (chatId) => {
    mocks.resolver.mockResolvedValue({ chatId, fonte: "cofre", motivo: chatId ? null : "ausente" });
    expect(await tentativa()).toEqual({ kind: "bloqueado", motivo: "destino_configurado_alterado" });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("cofre indisponível não autoriza transporte", async () => {
    mocks.resolver.mockResolvedValue({ chatId: null, fonte: "ausente", motivo: "cofre_indisponivel" });
    await expect(tentativa()).rejects.toThrow("configuracao_indisponivel");
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});
