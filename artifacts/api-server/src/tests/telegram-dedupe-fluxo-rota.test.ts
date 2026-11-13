/**
 * Deduplicação por update_id — fluxo (processarWebhookInbox) e rota HTTP.
 * Banco e Telegram simulados; o comportamento SQL real está em
 * telegram-dedupe-banco-descartavel.test.ts.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// A camada de reivindicação por (bot, update_id) é testada à parte (telegram-claim-*.test.ts,
// SQL real em banco descartável). Aqui ela fica transparente para isolar o fluxo testado.
// Resolver do chat de alerta simulado: lê o ambiente (equivale ao processo com o cofre hidratado).
// A regra real (cofre > ambiente, validação numérica) é provada em telegram-config.test.ts.
vi.mock("../lib/telegram-config", () => ({
  chatIdValido: () => true,
  chatAlertaOuNull: async () => process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null,
  resolverChatAlerta: async () => {
    const c = process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null;
    return { chatId: c, fonte: c ? "ambiente" : "ausente", motivo: c ? null : "ausente" };
  },
}));
vi.mock("../lib/telegram-update-claim", async (orig) => ({
  ...(await orig<typeof import("../lib/telegram-update-claim")>()),
  reivindicarUpdate: vi.fn().mockResolvedValue("reivindicado"),
  concluirUpdate: vi.fn().mockResolvedValue(undefined),
  liberarUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const mockExecute = vi.fn();
vi.mock("@workspace/db", async () => {
  const { respostaOutboxFake } = await import("./helpers/outbox-sql-fake");
  const chain = (v: unknown[]) => {
    const c: Record<string, unknown> & PromiseLike<unknown[]> = {
      from: vi.fn(() => c), where: vi.fn(() => c),
      limit: vi.fn().mockResolvedValue(v),
      then: (res: (x: unknown[]) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(v).then(res, rej),
    };
    return c;
  };
  return {
    db: {
      select: () => chain([{ id: 42, name: "Ana Lima", cpf: "12345678900", empresaId: 5 }]),
      execute: (...a: unknown[]) => respostaOutboxFake(a[0]) ?? mockExecute(...a),
    },
    clientsTable: {}, assinaturaTogglesAdminTable: {}, secureSettingsTable: {}, appSettingsTable: {},
  };
});
vi.mock("../lib/secure-settings.js", () => ({
  getSecret: vi.fn().mockResolvedValue("segredo-teste"),
  getSecretStatus: vi.fn(), setSecret: vi.fn(), getSetting: vi.fn(), getJsonSetting: vi.fn(),
}));
const mockSend = vi.fn();
vi.mock("../lib/telegram.js", () => ({ sendTelegram: (...a: unknown[]) => mockSend(...a), getTelegramBotInfo: vi.fn() }));
const mockSlack = vi.fn();
vi.mock("../lib/slack-reporter.js", () => ({ postSlackAlert: (...a: unknown[]) => mockSlack(...a) }));
vi.mock("../lib/assinatura/service.js", () => ({ enviarAssinatura: vi.fn(), receberWebhook: vi.fn(), listarTimeline: vi.fn(), obterPdfAssinado: vi.fn(), processarNotificacoes: vi.fn(), listarTemplates: vi.fn(), upsertTemplate: vi.fn() }));
vi.mock("../lib/assinatura/consentimento.js", () => ({ consentimentoAtivo: vi.fn(), assertConsentimento: vi.fn(), ConsentimentoPendenteError: class extends Error {} }));
vi.mock("../lib/assinatura/clausulas.js", () => ({ listarClausulas: vi.fn(), upsertClausula: vi.fn(), desativarClausula: vi.fn() }));
vi.mock("../lib/assinatura/contexto.js", () => ({ contextoPaciente: vi.fn() }));
vi.mock("../routes/collaborator.js", () => ({
  requireCollaborator: (_q: unknown, _s: unknown, n: () => void) => n(),
  collaboratorGuard: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a) => a), and: vi.fn((...a) => a), desc: vi.fn(), asc: vi.fn(), isNull: vi.fn(), gt: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

import express from "express";
import request from "supertest";
import { configOutboxFake } from "./helpers/outbox-sql-fake";
import { telegramWebhookRouter } from "../routes/assinaturas.js";
import { logger } from "../lib/logger.js";
import { processarWebhookInbox } from "../lib/telegram-inbox-flow";
import { erroTransitorioDeBanco, extrairUpdateId } from "../lib/telegram-inbox-store";

const app = () => { const a = express(); a.use(express.json()); a.use((q, _s, n) => { q.log = logger; n(); }); a.use(telegramWebhookRouter); return a; };
const payload = (updateId: unknown) => ({ update_id: updateId, message: { message_id: 1, chat: { id: 999888777 }, text: "mensagem de teste", date: 1 } });
const enviar = (body: unknown) => request(app()).post("/webhooks/telegram").set("x-telegram-bot-api-secret-token", "segredo-teste").send(body as object);
const isInsert = (q: { strings: readonly string[] }) => q.strings.join("?").includes("INSERT INTO telegram_inbox_messages");
const flush = () => new Promise<void>((r) => setImmediate(() => setImmediate(r)));

beforeEach(() => {
  vi.clearAllMocks();
  configOutboxFake.reivindica = true;
  process.env["PADAXOR_TELEGRAM_CHAT_ID"] = "CEO_OUTRO_CHAT";
  mockSend.mockResolvedValue({ sent: true, mock: false });
  mockSlack.mockResolvedValue(undefined);
});

describe("funções puras", () => {
  it("extrairUpdateId: só inteiro positivo seguro; resto => null (sem dedupe, sem erro)", () => {
    expect(extrairUpdateId(123)).toBe(123);
    for (const v of [0, -1, 1.5, "123", null, undefined, NaN, 2 ** 60, {}]) expect(extrairUpdateId(v)).toBeNull();
  });
  it("erroTransitorioDeBanco: rede/conexão/deadlock = sim; integridade/dados/código = não", () => {
    expect(erroTransitorioDeBanco({ code: "ECONNREFUSED" })).toBe(true);
    expect(erroTransitorioDeBanco({ cause: { code: "57P01" } })).toBe(true);
    expect(erroTransitorioDeBanco({ code: "40P01" })).toBe(true);
    expect(erroTransitorioDeBanco({ code: "08006" })).toBe(true);
    expect(erroTransitorioDeBanco({ code: "23503" })).toBe(false);
    expect(erroTransitorioDeBanco({ cause: { code: "22001" } })).toBe(false);
    expect(erroTransitorioDeBanco({ code: "42703" })).toBe(false);
    expect(erroTransitorioDeBanco(new TypeError("bug"))).toBe(false);
    expect(erroTransitorioDeBanco(null)).toBe(false);
  });
});

describe("processarWebhookInbox — duplicata e falhas", () => {
  const cliente = { id: 1, name: "X", empresaId: 5 };
  const deps = (over = {}) => ({ findClienteByChatId: vi.fn().mockResolvedValue(cliente), insertMensagem: vi.fn().mockResolvedValue({ id: 10 }), notificarCEO: vi.fn().mockResolvedValue(undefined), ...over });

  it("repassa updateId ao gravador", async () => {
    const d = deps();
    await processarWebhookInbox({ chatId: "1", texto: "t", chatIdCEO: "9", updateId: 77 }, d);
    expect(d.insertMensagem).toHaveBeenCalledWith(expect.objectContaining({ updateId: 77 }));
  });
  it("duplicada: resultado 'duplicado' e CEO NÃO é notificado de novo", async () => {
    const d = deps({ insertMensagem: vi.fn().mockResolvedValue({ id: 10, duplicada: true }) });
    const r = await processarWebhookInbox({ chatId: "1", texto: "t", chatIdCEO: "9", updateId: 77 }, d);
    expect(r).toEqual({ kind: "duplicado", mensagemId: 10, clienteId: 1 });
    await flush();
    expect(d.notificarCEO).not.toHaveBeenCalled();
  });
  it("gravada: notifica CEO uma vez, SEM marca de falha (3 argumentos)", async () => {
    const d = deps();
    await processarWebhookInbox({ chatId: "1", texto: "t", chatIdCEO: "9", updateId: 77 }, d);
    expect(d.notificarCEO).toHaveBeenCalledOnce();
    expect(d.notificarCEO.mock.calls[0]).toHaveLength(3);
  });
  it("falha DEPOIS da gravação (repasse cai): resultado continua 'gravado'", async () => {
    const d = deps({ notificarCEO: vi.fn().mockRejectedValue(new Error("telegram fora")) });
    const r = await processarWebhookInbox({ chatId: "1", texto: "t", chatIdCEO: "9", updateId: 77 }, d);
    expect(r.kind).toBe("gravado");
  });
  it("falha ANTES da gravação: propaga o erro e avisa o CEO com gravacaoFalhou", async () => {
    const d = deps({ insertMensagem: vi.fn().mockRejectedValue(new Error("db")) });
    await expect(processarWebhookInbox({ chatId: "1", texto: "t", chatIdCEO: "9", updateId: 77 }, d)).rejects.toThrow("db");
    expect(d.notificarCEO).toHaveBeenCalledWith("9", cliente, "t", { gravacaoFalhou: true });
  });
});

describe("POST /webhooks/telegram — dedupe de ponta a ponta (rota real, banco simulado)", () => {
  it("R1 primeira entrega: grava com update_id, repassa ao CEO, 200", async () => {
    mockExecute.mockImplementation(async (q) => (isInsert(q) ? { rows: [{ id: 50 }] } : { rows: [] }));
    const res = await enviar(payload(555));
    expect(res.status).toBe(200);
    const ins = mockExecute.mock.calls.map((c) => c[0]).find(isInsert)!;
    expect(ins.values).toContain(555);
    await flush();
    expect(mockSend).toHaveBeenCalledWith("CEO_OUTRO_CHAT", expect.stringContaining("mensagem de teste"));
  });
  it("R2 reentrega duplicada (repasse já fechado): 200, SEM repasse ao CEO e SEM alerta Slack", async () => {
    configOutboxFake.reivindica = false;
    mockExecute.mockImplementation(async (q) => {
      if (isInsert(q)) return { rows: [] };                        // conflito: nada inserido
      if (q.strings.join("?").includes("SELECT id FROM telegram_inbox_messages\n    WHERE chat_id")) return { rows: [{ id: 50 }] };
      return { rows: [{ id: 3 }] };                                // histórico de saída existiria
    });
    const res = await enviar(payload(555));
    expect(res.status).toBe(200);
    await flush();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockSlack).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ clienteId: 42 }, expect.stringContaining("duplicada"));
  });
  it("R3 sem update_id no corpo: grava sem chave de dedupe, 200", async () => {
    mockExecute.mockImplementation(async (q) => (isInsert(q) ? { rows: [{ id: 51 }] } : { rows: [] }));
    const res = await enviar(payload(undefined));
    expect(res.status).toBe(200);
    const ins = mockExecute.mock.calls.map((c) => c[0]).find(isInsert)!;
    expect(ins.strings.join("?")).not.toContain("ON CONFLICT");
  });
  it("R4 FALHA ANTES, banco fora (ECONNREFUSED): 500 para o Telegram reentregar; aviso ao CEO marcado como não gravada; log sem texto da mensagem", async () => {
    mockExecute.mockImplementation(async (q) => { if (isInsert(q)) throw Object.assign(new Error("Failed query: ... mensagem de teste"), { code: "ECONNREFUSED" }); return { rows: [] }; });
    const res = await enviar(payload(556));
    expect(res.status).toBe(500);
    await flush();
    expect(mockSend).toHaveBeenCalledWith("CEO_OUTRO_CHAT", expect.stringContaining("Não gravada no Cockpit"));
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("mensagem de teste");
  });
  it("R5 FALHA ANTES, permanente (FK 23503): 200 (reentregar não adianta) e erro registrado sem o texto", async () => {
    mockExecute.mockImplementation(async (q) => { if (isInsert(q)) throw Object.assign(new Error("Failed query: mensagem de teste"), { cause: { code: "23503" } }); return { rows: [] }; });
    const res = await enviar(payload(557));
    expect(res.status).toBe(200);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "23503" }), expect.stringContaining("permanente"));
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("mensagem de teste");
  });
  it("R2b reentrega duplicada com repasse ainda PENDENTE (registro ficou pela metade): repasse é recuperado, 1 envio", async () => {
    mockExecute.mockImplementation(async (q) => {
      if (isInsert(q)) return { rows: [] };
      if (q.strings.join("?").includes("SELECT id FROM telegram_inbox_messages\n    WHERE chat_id")) return { rows: [{ id: 50 }] };
      return { rows: [] };
    });
    const res = await enviar(payload(555));
    expect(res.status).toBe(200);
    await flush();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
  it("R6 FALHA DEPOIS: gravou, repasse ao CEO falhou => 200 e mensagem preservada", async () => {
    mockExecute.mockImplementation(async (q) => (isInsert(q) ? { rows: [{ id: 52 }] } : { rows: [] }));
    mockSend.mockResolvedValue({ sent: false, mock: false, error: "telegram_http_400" });
    const res = await enviar(payload(558));
    expect(res.status).toBe(200);
    await flush();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ erro: "telegram_http_400" }), expect.stringContaining("RECUSADO"));
  });
  it("R7 segredo errado continua 200 sem tocar no banco", async () => {
    const res = await request(app()).post("/webhooks/telegram").set("x-telegram-bot-api-secret-token", "errado").send(payload(559));
    expect(res.status).toBe(200);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
