import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as any[],
  claims: [] as number[],
  updates: [] as any[],
  whatsapp: vi.fn(),
  telegram: vi.fn(),
  usaTelegram: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  clientsTable: {},
  lembretesPrescricaoTable: {},
  lembreteEnviosTable: {},
  db: {
    select: mocks.select,
    insert: () => ({
      values: (value: any) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            mocks.claims.push(value.clienteId);
            return [{ id: value.lembreteId }];
          },
        }),
      }),
    }),
    update: () => ({ set: (value: any) => ({ where: async () => { mocks.updates.push(value); } }) }),
  },
}));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: mocks.whatsapp, registrarLogMensagem: vi.fn(async () => 1) }));
vi.mock("../lib/lembrete-telegram", () => ({
  lerConfigLembreteTelegram: async () => ({ modo: "lista", permitidos: new Set([1, 2, 3]) }),
  usaTelegram: mocks.usaTelegram,
  enviarLembreteTelegram: mocks.telegram,
}));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: async () => "mensagem sintetica" }));
vi.mock("../lib/lembrete-templates", () => ({ montarSaudacao: () => "Olá", templateLembretePrescricao: () => "simples" }));
vi.mock("../lib/avatar-messenger", () => ({ enviarVozAvatarWhatsapp: vi.fn(), gerarScriptLembrete: vi.fn() }));

import { executarLembretesPeriodo } from "../lib/lembrete-periodo";

function tresClientes() {
  mocks.rows = [1, 2, 3].map((id) => ({
    id: id * 10, clienteId: id, clienteNome: `Sintetico ${id}`, clienteTelefone: "0000000000",
    telegramChatId: `chat-${id}`, empresaId: 1, periodos: [], horariosEnvio: ["07:00"],
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T10:00:00Z")); // 07:00 em Sao Paulo
  mocks.claims = [];
  mocks.updates = [];
  mocks.whatsapp.mockReset().mockResolvedValue({ sent: true, via: "twilio", logId: 1 });
  mocks.telegram.mockReset().mockResolvedValue({ kind: "enviado" });
  mocks.usaTelegram.mockReset().mockReturnValue(true);
  // Simula o pior caso: a consulta devolve TODOS, mesmo com filtro pedido.
  mocks.select.mockReset().mockImplementation(() => ({
    from: () => ({ innerJoin: () => ({ where: async () => mocks.rows }) }),
  }));
  tresClientes();
});
afterEach(() => vi.useRealTimers());

describe("teste controlado de um único cliente", () => {
  it("processa só o cliente escolhido e não toca nos demais por nenhum canal", async () => {
    const r = await executarLembretesPeriodo({ clienteId: 2 });
    expect(r.examinados).toBe(1);
    expect(r.enviados).toBe(1);
    expect(mocks.claims).toEqual([2]);
    expect(mocks.telegram).toHaveBeenCalledTimes(1);
    expect(mocks.telegram.mock.calls[0][0]).toBe("chat-2");
    expect(mocks.whatsapp).not.toHaveBeenCalled();
  });

  it("sem Telegram liberado: não envia por WhatsApp e não grava marcador", async () => {
    mocks.usaTelegram.mockReturnValue(false);
    const r = await executarLembretesPeriodo({ clienteId: 2 });
    expect(r.enviados).toBe(0);
    expect(r.detalhes).toEqual([expect.objectContaining({ clienteId: 2, sucesso: false, erro: "telegram_indisponivel_no_teste" })]);
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.telegram).not.toHaveBeenCalled();
    expect(mocks.claims).toEqual([]);
  });

  it("falha do Telegram não recua para WhatsApp", async () => {
    mocks.telegram.mockResolvedValue({ kind: "falhou", erro: "telegram_http_400" });
    const r = await executarLembretesPeriodo({ clienteId: 3 });
    expect(r.falhas).toBe(1);
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.claims).toEqual([3]);
  });

  it("cliente inexistente na lista não envia nada", async () => {
    const r = await executarLembretesPeriodo({ clienteId: 99 });
    expect(r.examinados).toBe(0);
    expect(mocks.telegram).not.toHaveBeenCalled();
    expect(mocks.whatsapp).not.toHaveBeenCalled();
  });

  it("recusa identificador inválido", async () => {
    await expect(executarLembretesPeriodo({ clienteId: 0 })).rejects.toThrow(RangeError);
    await expect(executarLembretesPeriodo({ clienteId: 1.5 })).rejects.toThrow(RangeError);
  });

  it("execução normal continua igual: todos processados e WhatsApp como antes", async () => {
    mocks.usaTelegram.mockReturnValue(false);
    const r = await executarLembretesPeriodo();
    expect(r.examinados).toBe(3);
    expect(mocks.whatsapp).toHaveBeenCalledTimes(3);
  });

  it("somenteTelegram explícito vale também sem cliente escolhido", async () => {
    mocks.usaTelegram.mockReturnValue(false);
    await executarLembretesPeriodo({ somenteTelegram: true });
    expect(mocks.whatsapp).not.toHaveBeenCalled();
  });
});
