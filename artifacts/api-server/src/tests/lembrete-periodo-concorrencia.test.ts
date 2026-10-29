import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as any[],
  claims: new Set<number>(),
  updates: [] as any[],
  claimError: 0,
  send: vi.fn(),
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
            if (value.lembreteId === mocks.claimError) throw new Error("claim unavailable");
            if (mocks.claims.has(value.lembreteId)) return [];
            mocks.claims.add(value.lembreteId);
            return [{ id: value.lembreteId }];
          },
        }),
      }),
    }),
    update: () => ({
      set: (value: any) => ({
        where: async () => { mocks.updates.push(value); },
      }),
    }),
  },
}));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: mocks.send }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: async () => "lembrete" }));
vi.mock("../lib/lembrete-templates", () => ({
  montarSaudacao: () => "Olá",
  templateLembretePrescricao: () => "lembrete simples",
}));
vi.mock("../lib/avatar-messenger", () => ({
  enviarVozAvatarWhatsapp: vi.fn(),
  gerarScriptLembrete: vi.fn(),
}));

import { executarLembretesPeriodo } from "../lib/lembrete-periodo";

function clients(count: number) {
  mocks.rows = Array.from({ length: count }, (_, i) => ({
    id: i + 1, clienteId: i + 1, clienteNome: `Cliente ${i + 1}`,
    clienteTelefone: "11999999999", empresaId: null,
    periodos: [], horariosEnvio: ["07:00"],
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
  mocks.claims.clear();
  mocks.updates = [];
  mocks.claimError = 0;
  mocks.send.mockReset().mockResolvedValue({ sent: true, via: "twilio", logId: 1 });
  mocks.select.mockReset().mockImplementation(() => ({
    from: () => ({ innerJoin: () => ({ where: async () => mocks.rows }) }),
  }));
  clients(0);
});
afterEach(() => vi.useRealTimers());

describe("concorrência dos lembretes", () => {
  it.each([
    [10, undefined, 10, 5000],
    [50, undefined, 10, 25000],
    [7, 3, 3, 15000],
    [3, 1, 1, 15000],
  ])("%i clientes, limite %s: respeita teto e duração", async (count, limit, peakExpected, duration) => {
    clients(count!);
    let active = 0;
    let peak = 0;
    mocks.send.mockImplementation(async (_phone, _message, options) => {
      expect(mocks.claims.has(options.clienteId)).toBe(true);
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      active--;
      return { sent: true, via: "twilio" };
    });
    const start = Date.now();
    const pending = executarLembretesPeriodo({ concorrencia: limit });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(Date.now() - start).toBe(duration);
    expect(peak).toBe(peakExpected);
    expect(active).toBe(0);
    expect(result).toMatchObject({ examinados: count, enviados: count, falhas: 0, pulados: 0 });
    expect(mocks.updates).toHaveLength(count!);
  });

  it("não duplica envio em ticks simultâneos nem repetidos", async () => {
    clients(12);
    const results = await Promise.all([executarLembretesPeriodo(), executarLembretesPeriodo()]);
    expect(mocks.send).toHaveBeenCalledTimes(12);
    expect(results.reduce((n, r) => n + r.enviados, 0)).toBe(12);
    expect(results.reduce((n, r) => n + r.pulados, 0)).toBe(12);
    expect((await executarLembretesPeriodo()).pulados).toBe(12);
    expect(mocks.send).toHaveBeenCalledTimes(12);
  });

  it("isola rejeição, falha, ausência de canal/telefone e horários inelegíveis", async () => {
    clients(8);
    mocks.rows[4].clienteTelefone = " ";
    mocks.rows[5].horariosEnvio = [];
    mocks.rows[6].horariosEnvio = ["07:01"];
    mocks.rows[7].horariosEnvio = ["06:54"];
    mocks.send.mockImplementation(async (_phone, _message, { clienteId }) => {
      if (clienteId === 1) throw new Error("timeout");
      if (clienteId === 2) return { sent: false, via: "twilio", error: "recusado" };
      if (clienteId === 3) return { sent: false, via: "link" };
      return { sent: true, via: "twilio" };
    });
    const result = await executarLembretesPeriodo({ concorrencia: 2 });
    expect(result).toMatchObject({ examinados: 8, enviados: 1, falhas: 3, pulados: 4 });
    expect(mocks.send).toHaveBeenCalledTimes(4);
    expect(mocks.updates.map((u) => u.status).sort()).toEqual(
      ["ENVIADO", "FALHOU", "FALHOU", "FALHOU", "SEM_TWILIO"],
    );
  });

  it("processa lotes seguintes mas propaga erros inesperados", async () => {
    clients(5);
    mocks.claimError = 1;
    await expect(executarLembretesPeriodo({ concorrencia: 2 })).rejects.toThrow(AggregateError);
    expect(mocks.send).toHaveBeenCalledTimes(4);
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejeita limite inválido %s antes do banco", async (concorrencia) => {
    await expect(executarLembretesPeriodo({ concorrencia })).rejects.toThrow(RangeError);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("aceita lista vazia", async () => {
    expect(await executarLembretesPeriodo()).toEqual({
      examinados: 0, enviados: 0, falhas: 0, pulados: 0, detalhes: [],
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
