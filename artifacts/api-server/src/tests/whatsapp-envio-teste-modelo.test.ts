/**
 * Modo teste (um único contato), modelo aprovado e escolha por janela de 24 h.
 * Nenhuma chamada real: o fetch e o banco são simulados.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ fetch: vi.fn(), telegram: vi.fn(), pool: vi.fn(), inserts: [] as any[] }));
vi.stubGlobal("fetch", h.fetch);
vi.mock("../lib/secure-settings", () => ({
  getSecret: vi.fn(async (k: string) => ({ "twilio.accountSid": "ACTEST", "twilio.authToken": "tok", "twilio.whatsappFrom": "whatsapp:+14155238886" } as Record<string, string>)[k] ?? null),
}));
vi.mock("../lib/telegram", () => ({ sendTelegram: h.telegram }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@workspace/db", () => {
  const ins = { values: vi.fn((v: any) => { h.inserts.push(v); return ins; }), returning: vi.fn().mockResolvedValue([{ id: 1 }]) };
  const upd = { set: vi.fn(), where: vi.fn().mockResolvedValue([]) }; upd.set.mockReturnValue(upd);
  const sel = { from: vi.fn(), where: vi.fn(), limit: vi.fn().mockResolvedValue([{ telegramChatId: "999" }]) };
  sel.from.mockReturnValue(sel); sel.where.mockReturnValue(sel);
  return {
    db: { insert: vi.fn().mockReturnValue(ins), update: vi.fn().mockReturnValue(upd), select: vi.fn().mockReturnValue(sel) },
    pool: { query: h.pool },
    whatsappMensagensLogTable: {}, clientsTable: {},
  };
});

import { sendWhatsapp, sendWhatsappTemplate, sendWhatsappConformeJanela } from "../lib/whatsapp";

const SID = "HX" + "b".repeat(32);
const aceito = () => ({ ok: true, status: 200, text: async () => "", json: async () => ({ sid: "SM9", status: "queued", error_code: null }) });

beforeEach(() => {
  vi.clearAllMocks(); h.inserts.length = 0;
  delete process.env.WHATSAPP_MODO_TESTE; delete process.env.WHATSAPP_CONTATO_TESTE;
  h.fetch.mockResolvedValue(aceito());
  h.pool.mockResolvedValue({ rows: [] });
});
afterEach(() => { delete process.env.WHATSAPP_MODO_TESTE; delete process.env.WHATSAPP_CONTATO_TESTE; });

describe("modo teste: um único contato autorizado", () => {
  beforeEach(() => { process.env.WHATSAPP_MODO_TESTE = "true"; process.env.WHATSAPP_CONTATO_TESTE = "+5511999990000"; });

  it("paciente (outro número) é barrado antes do provedor", async () => {
    const r = await sendWhatsapp("5511988887777", "olá", { clienteId: 3 });
    expect(r.sent).toBe(false);
    expect(r.error).toBe("modo_teste_contato_nao_autorizado");
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.telegram).not.toHaveBeenCalled();
    expect(h.inserts[0]).toMatchObject({ status: "bloqueado" });
  });
  it("contato autorizado envia e NADA é espelhado no Telegram", async () => {
    const r = await sendWhatsapp("(11) 99999-0000", "olá", { clienteId: 3 });
    expect(r.sent).toBe(true);
    expect(h.fetch).toHaveBeenCalled();
    await new Promise((x) => setTimeout(x, 30));
    expect(h.telegram).not.toHaveBeenCalled();
  });
  it("modelo também respeita o contato autorizado", async () => {
    const r = await sendWhatsappTemplate("5511988887777", { contentSid: SID });
    expect(r.error).toBe("modo_teste_contato_nao_autorizado");
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe("modelo aprovado", () => {
  it("recusa SID de modelo inválido", async () => {
    expect((await sendWhatsappTemplate("5511999990000", { contentSid: "abc" })).error).toBe("modelo_invalido");
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("envia ContentSid + variáveis e pede acompanhamento de status; log sem os valores", async () => {
    const r = await sendWhatsappTemplate("5511999990000", { contentSid: SID, variaveis: { "1": "Texto clínico sigiloso" } });
    expect(r.sent).toBe(true);
    const corpo = new URLSearchParams(String(h.fetch.mock.calls[0]![1].body));
    expect(corpo.get("ContentSid")).toBe(SID);
    expect(corpo.get("ContentVariables")).toBe(JSON.stringify({ "1": "Texto clínico sigiloso" }));
    expect(corpo.get("Body")).toBeNull();
    expect(JSON.stringify(h.inserts)).not.toContain("sigiloso");
    expect(h.inserts[0]).toMatchObject({ sid: "SM9", status: "queued" });
    await new Promise((x) => setTimeout(x, 30));
    expect(h.telegram).not.toHaveBeenCalled();
  });
});

describe("janela de 24 h", () => {
  const entradaHa = (horas: number) => h.pool.mockResolvedValue({ rows: [{ telefone: "5511999990000", criado_em: new Date(Date.now() - horas * 3600_000) }] });

  it("fora da janela e sem modelo: não envia", async () => {
    entradaHa(30);
    const r = await sendWhatsappConformeJanela("5511999990000", "texto livre");
    expect(r).toMatchObject({ sent: false, error: "fora_da_janela_sem_modelo", janela: "fechada" });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("fora da janela com modelo: usa o modelo", async () => {
    entradaHa(30);
    const r = await sendWhatsappConformeJanela("5511999990000", "texto livre", { modelo: { contentSid: SID } });
    expect(r.janela).toBe("fechada");
    expect(new URLSearchParams(String(h.fetch.mock.calls[0]![1].body)).get("ContentSid")).toBe(SID);
  });
  it("dentro da janela: texto livre", async () => {
    entradaHa(2);
    const r = await sendWhatsappConformeJanela("5511999990000", "texto livre");
    expect(r.janela).toBe("aberta");
    expect(new URLSearchParams(String(h.fetch.mock.calls[0]![1].body)).get("Body")).toBe("texto livre");
  });
});
