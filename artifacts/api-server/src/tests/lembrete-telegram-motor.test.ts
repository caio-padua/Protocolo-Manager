/** Motor de lembrete por período com transporte Telegram (mesmo motor; sem cron novo). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rows: [] as any[], claims: new Set<number>(), updates: [] as any[],
  setting: {} as Record<string, string | null>,
  tg: vi.fn(), wa: vi.fn(), log: vi.fn(), montar: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  clientsTable: {}, lembretesPrescricaoTable: {}, lembreteEnviosTable: {},
  db: {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => m.rows }) }) }),
    insert: () => ({ values: (v: any) => ({ onConflictDoNothing: () => ({ returning: async () => {
      if (m.claims.has(v.lembreteId)) return [];
      m.claims.add(v.lembreteId); return [{ id: v.lembreteId }];
    } }) }) }),
    update: () => ({ set: (v: any) => ({ where: async () => { m.updates.push(v); } }) }),
  },
}));
vi.mock("../lib/secure-settings", () => ({ getSetting: async (k: string) => m.setting[k] ?? null }));
vi.mock("../lib/telegram", () => ({ sendTelegram: (...a: unknown[]) => m.tg(...a) }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: (...a: unknown[]) => m.wa(...a), registrarLogMensagem: (...a: unknown[]) => m.log(...a) }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: (...a: unknown[]) => m.montar(...a) }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { executarLembretesPeriodo, periodosDaJanela } from "../lib/lembrete-periodo";
import { formatarParaTelegram, usaTelegram } from "../lib/lembrete-telegram";

const F = (nome: string) => ({ nome, dose: "1", ativoPrincipal: "x" });
const PERIODOS = [
  { sigla: "IM", nome: "Início da Manhã", tipo: "tomar", formulas: [F("Formula Manha")] },
  { sigla: "AL", nome: "Almoço", tipo: "tomar", formulas: [F("Formula Almoco")] },
  { sigla: "NO", nome: "Noite", tipo: "tomar", formulas: [F("Formula Noite")] },
] as any;

function cliente(over: Record<string, unknown> = {}) {
  m.rows = [{ id: 1, clienteId: 44, clienteNome: "Caio Teste", clienteTelefone: "11999999999",
    telegramChatId: "55511", empresaId: 5, periodos: PERIODOS, horariosEnvio: ["07:00", "11:00", "18:00"], ...over }];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T21:00:00Z")); // sábado 18:00 em Brasília
  m.claims.clear(); m.updates = []; m.setting = {};
  m.tg.mockReset().mockResolvedValue({ sent: true, mock: false });
  m.wa.mockReset().mockResolvedValue({ sent: true, via: "twilio", logId: 9 });
  m.log.mockReset().mockResolvedValue(77);
  m.montar.mockReset().mockImplementation(async (d: any) => `*Boa noite* ${d.nome} _${d.periodos.map((p: any) => p.nome).join("+")}_ ${d.periodos.flatMap((p: any) => p.formulas.map((f: any) => f.nome)).join(",")}`);
  cliente();
});
afterEach(() => vi.useRealTimers());

describe("periodosDaJanela", () => {
  it("cada horário leva só os períodos daquela janela", () => {
    expect(periodosDaJanela(PERIODOS, "07:00").periodos.map((p) => p.sigla)).toEqual(["IM"]);
    expect(periodosDaJanela(PERIODOS, "11:00").periodos.map((p) => p.sigla)).toEqual(["AL"]);
    expect(periodosDaJanela(PERIODOS, "18:00").periodos.map((p) => p.sigla)).toEqual(["NO"]);
  });
  it("horário que não casa com nenhum período mantém todos (dado antigo) e avisa pelo campo casou=false", () => {
    const r = periodosDaJanela(PERIODOS, "09:45");
    expect(r.casou).toBe(false);
    expect(r.periodos).toHaveLength(3);
  });
});

describe("formatarParaTelegram", () => {
  it("negrito e itálico do WhatsApp viram HTML; o resto é escapado", () => {
    expect(formatarParaTelegram("*Oi* _tudo_ <b>x</b> & ok")).toBe("<b>Oi</b> <i>tudo</i> &lt;b&gt;x&lt;/b&gt; &amp; ok");
  });
  it("underscore dentro de palavra não vira itálico", () => {
    expect(formatarParaTelegram("a_b_c")).toBe("a_b_c");
  });
});

describe("escolha do canal", () => {
  it("padrão desligado: usa WhatsApp, Telegram não é chamado", async () => {
    await executarLembretesPeriodo();
    expect(m.wa).toHaveBeenCalledTimes(1);
    expect(m.tg).not.toHaveBeenCalled();
  });
  it("modo lista: só cliente permitido com chat vinculado vai por Telegram", async () => {
    m.setting = { "lembrete.telegram.modo": "lista", "lembrete.telegram.permitidos": "[44]" };
    const r = await executarLembretesPeriodo();
    expect(m.tg).toHaveBeenCalledTimes(1);
    expect(m.wa).not.toHaveBeenCalled();
    expect(r).toMatchObject({ enviados: 1, falhas: 0 });
    expect(m.updates.at(-1)).toMatchObject({ status: "ENVIADO", whatsappLogId: 77 });
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ via: "telegram", clienteId: 44 }));
  });
  it("modo lista: cliente fora da lista segue no WhatsApp", async () => {
    m.setting = { "lembrete.telegram.modo": "lista", "lembrete.telegram.permitidos": "[999]" };
    await executarLembretesPeriodo();
    expect(m.tg).not.toHaveBeenCalled();
    expect(m.wa).toHaveBeenCalledTimes(1);
  });
  it("lista ilegível = desligado; modo desconhecido = desligado", async () => {
    m.setting = { "lembrete.telegram.modo": "lista", "lembrete.telegram.permitidos": "{quebrado" };
    await executarLembretesPeriodo();
    expect(m.tg).not.toHaveBeenCalled();
    expect(usaTelegram({ modo: "desligado", permitidos: new Set([44]) }, 44, "555")).toBe(false);
  });
  it("sem chat vinculado, mesmo em modo ligado, usa WhatsApp", async () => {
    m.setting = { "lembrete.telegram.modo": "ligado" };
    cliente({ telegramChatId: null });
    await executarLembretesPeriodo();
    expect(m.tg).not.toHaveBeenCalled();
    expect(m.wa).toHaveBeenCalledTimes(1);
  });
});

describe("conteúdo por janela e formato", () => {
  it("18:00 leva só a fórmula da noite e nada da manhã; texto chega em HTML", async () => {
    m.setting = { "lembrete.telegram.modo": "ligado" };
    await executarLembretesPeriodo();
    const [, texto] = m.tg.mock.calls[0];
    expect(texto).toContain("Formula Noite");
    expect(texto).not.toContain("Formula Manha");
    expect(texto).not.toContain("Formula Almoco");
    expect(texto).toContain("<b>Boa noite</b>");
    expect(m.montar.mock.calls[0][0].periodos.map((p: any) => p.sigla)).toEqual(["NO"]);
  });
});

describe("falhas e idempotência no Telegram", () => {
  it("sem token (mock) não conta como entregue", async () => {
    m.setting = { "lembrete.telegram.modo": "ligado" };
    m.tg.mockResolvedValue({ sent: true, mock: true });
    const r = await executarLembretesPeriodo();
    expect(r).toMatchObject({ enviados: 0, falhas: 1 });
    expect(m.updates.at(-1)).toMatchObject({ status: "FALHOU", erro: "telegram_sem_token" });
  });
  it("recusa HTTP 403 vira FALHOU com código curto (sem texto da mensagem)", async () => {
    m.setting = { "lembrete.telegram.modo": "ligado" };
    m.tg.mockResolvedValue({ sent: false, mock: false, error: "telegram_http_403: Formula Noite bloqueado" });
    await executarLembretesPeriodo();
    expect(m.updates.at(-1)).toMatchObject({ status: "FALHOU", erro: "telegram_http_403" });
  });
  it("dois ticks na mesma janela = um envio só", async () => {
    m.setting = { "lembrete.telegram.modo": "ligado" };
    await Promise.all([executarLembretesPeriodo(), executarLembretesPeriodo()]);
    await executarLembretesPeriodo();
    expect(m.tg).toHaveBeenCalledTimes(1);
  });
  it("exceção do transporte não derruba o tick e não repete envio", async () => {
    m.setting = { "lembrete.telegram.modo": "ligado" };
    m.tg.mockRejectedValue(new Error("rede"));
    const r = await executarLembretesPeriodo();
    expect(r.falhas).toBe(1);
    await executarLembretesPeriodo();
    expect(m.tg).toHaveBeenCalledTimes(1);
  });
});
