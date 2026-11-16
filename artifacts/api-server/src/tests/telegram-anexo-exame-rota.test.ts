/**
 * SPEC 4 — anexos (PDF/foto) de cliente vinculado no Telegram. Rota HTTP real, banco/Telegram/motor SIMULADOS
 * (nenhuma mensagem a pessoa real, nenhuma chamada de rede). Base: telegram-dedupe-fluxo-rota.test.ts.
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
    const result = Promise.resolve(v);
    const c: Record<string, unknown> & PromiseLike<unknown[]> = {
      from: vi.fn(() => c), where: vi.fn(() => c),
      limit: vi.fn().mockResolvedValue(v),
      then: result.then.bind(result),
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


const mockBaixar = vi.fn();
vi.mock("../lib/telegram-anexo-exame", async (orig) => ({
  ...(await orig<typeof import("../lib/telegram-anexo-exame")>()),
  baixarArquivoTelegram: (...a: unknown[]) => mockBaixar(...a),
}));
const mockIngest = vi.fn();
vi.mock("../routes/exames-lab", () => ({ startExamIngestion: (...a: unknown[]) => mockIngest(...a) }));
import express from "express";
import request from "supertest";
import { configOutboxFake } from "./helpers/outbox-sql-fake";
import { telegramWebhookRouter } from "../routes/assinaturas.js";
import { logger } from "../lib/logger.js";
import { extrairAnexo, tipoPorAssinatura, tratarAnexo, LIMITE_BYTES_ANEXO } from "../lib/telegram-anexo-exame";

const app = () => { const a = express(); a.use(express.json()); a.use((q, _s, n) => { q.log = logger; n(); }); a.use(telegramWebhookRouter); return a; };
const enviar = (body: unknown) => request(app()).post("/webhooks/telegram").set("x-telegram-bot-api-secret-token", "segredo-teste").send(body as object);
const docMsg = (extra: object = {}) => ({ update_id: 500, message: { message_id: 1, chat: { id: 999888777 }, date: 1, document: { file_id: "F1", file_name: "exame.pdf", mime_type: "application/pdf", file_size: 100 }, ...extra } });
const PDF = Buffer.from("%PDF-1.4 sintetico");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const flush = () => new Promise<void>((r) => setImmediate(() => setImmediate(r)));
const inserts = () => mockExecute.mock.calls.filter((c) => (c[0] as { strings: readonly string[] }).strings?.join("?").includes("INSERT INTO telegram_inbox_messages"));

beforeEach(() => {
  vi.clearAllMocks();
  configOutboxFake.reivindica = true;
  process.env["PADAXOR_TELEGRAM_CHAT_ID"] = "CEO_OUTRO_CHAT";
  mockSend.mockResolvedValue({ sent: true, mock: false });
  mockExecute.mockResolvedValue({ rows: [{ id: 10 }] });
  mockIngest.mockResolvedValue({ documentId: 77, duplicate: false });
});

describe("funções puras do anexo", () => {
  it("extrairAnexo: documento, foto (maior tamanho), texto puro = null", () => {
    expect(extrairAnexo({ document: { file_id: "D", file_name: "a.pdf" } })).toMatchObject({ fileId: "D", origem: "documento" });
    expect(extrairAnexo({ photo: [{ file_id: "P1" }, { file_id: "P2" }] })).toMatchObject({ fileId: "P2", origem: "foto" });
    expect(extrairAnexo({})).toBeNull();
    expect(extrairAnexo({ document: { file_id: 5 as never } })).toBeNull();
  });
  it("tipoPorAssinatura ignora o tipo declarado", () => {
    expect(tipoPorAssinatura(PDF)).toBe("pdf");
    expect(tipoPorAssinatura(JPG)).toBe("jpeg");
    expect(tipoPorAssinatura(Buffer.from("MZ exe"))).toBeNull();
  });
  it("tamanho declarado acima do limite recusa sem baixar", async () => {
    const baixar = vi.fn();
    const r = await tratarAnexo({ id: 1, empresaId: 5 }, { fileId: "x", fileName: "g.pdf", mimeType: null, size: LIMITE_BYTES_ANEXO + 1, origem: "documento", legenda: "" }, { baixar, iniciarIngestao: vi.fn() });
    expect(r).toMatchObject({ resultado: "recusado", motivo: "tamanho" });
    expect(baixar).not.toHaveBeenCalled();
  });
});

describe("webhook: anexo de cliente vinculado", () => {
  it("PDF válido: motor chamado com a clínica do cadastro, mensagem registrada, resposta ao próprio chat", async () => {
    mockBaixar.mockResolvedValue(PDF);
    const r = await enviar(docMsg());
    await flush();
    expect(r.status).toBe(200);
    expect(mockIngest).toHaveBeenCalledWith(expect.objectContaining({ clientId: 42, empresaId: 5, notify: false }));
    expect(inserts().length).toBe(1);
    expect(mockSend).toHaveBeenCalledWith("999888777", expect.stringContaining("leitura foi iniciada"));
  });
  it("arquivo que diz ser PDF mas não é: recusado, motor NÃO chamado", async () => {
    mockBaixar.mockResolvedValue(Buffer.from("MZ executavel"));
    const r = await enviar(docMsg());
    await flush();
    expect(r.status).toBe(200);
    expect(mockIngest).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith("999888777", expect.stringContaining("PDF, JPEG ou PNG"));
  });
  it("foto: registrada na Caixa de Entrada sem leitura automática", async () => {
    mockBaixar.mockResolvedValue(JPG);
    const r = await enviar({ update_id: 501, message: { message_id: 2, chat: { id: 999888777 }, date: 1, photo: [{ file_id: "P", file_size: 10 }] } });
    await flush();
    expect(r.status).toBe(200);
    expect(mockIngest).not.toHaveBeenCalled();
    expect(inserts().length).toBe(1);
    expect(mockSend).toHaveBeenCalledWith("999888777", expect.stringContaining("só com PDF"));
  });
  it("download indisponível por falha de rede: 500 (Telegram reentrega) e nada gravado", async () => {
    mockBaixar.mockRejectedValue(new Error("telegram: download sem resposta"));
    const r = await enviar(docMsg());
    expect(r.status).toBe(500);
    expect(inserts().length).toBe(0);
    expect(mockIngest).not.toHaveBeenCalled();
  });
  it("falha ao iniciar a leitura: arquivo não é perdido, cliente é avisado com honestidade", async () => {
    mockBaixar.mockResolvedValue(PDF);
    mockIngest.mockRejectedValue(new Error("falha"));
    const r = await enviar(docMsg());
    await flush();
    expect(r.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith("999888777", expect.stringContaining("não consegui iniciar a leitura"));
  });
  it("reentrega do mesmo update (duplicada): não repete a resposta ao cliente", async () => {
    mockBaixar.mockResolvedValue(PDF);
    mockExecute.mockImplementation(async (q: { strings: readonly string[] }) => {
      const t = q.strings.join("?");
      if (t.includes("INSERT INTO telegram_inbox_messages")) return { rows: [] };
      if (t.includes("SELECT id FROM telegram_inbox_messages")) return { rows: [{ id: 10 }] };
      return { rows: [] };
    });
    const r = await enviar(docMsg());
    await flush();
    expect(r.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalledWith("999888777", expect.anything());
  });
  it("mensagem editada com anexo não reprocessa o exame", async () => {
    mockBaixar.mockResolvedValue(PDF);
    const base = docMsg().message;
    const r = await enviar({ update_id: 502, edited_message: base });
    expect(r.status).toBe(200);
    expect(mockIngest).not.toHaveBeenCalled();
  });
});
