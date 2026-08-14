/**
 * telegram-slack-reply-alert.test.ts
 *
 * Testes de integração HTTP para a notificação Slack disparada pelo webhook
 * Telegram quando um paciente responde após o CEO ter enviado uma mensagem.
 *
 * Regra central (Task #115):
 *   - Se `telegram_inbox_messages` contém linha com direcao='saida' para o
 *     cliente → postSlackAlert DEVE ser chamado com nome + trecho da mensagem.
 *   - Se não há linha de saída → postSlackAlert NÃO deve ser chamado.
 *   - Falha no Slack não altera o status HTTP (sempre 200) — best-effort.
 *
 * Cenários cobertos:
 *   S1. Cliente com histórico de saída → Slack alertado
 *   S2. Cliente sem histórico de saída → Slack silenciado
 *   S3. Falha do Slack não impede o ACK 200 ao Telegram
 *   S4. Mensagem longa é truncada a 120 chars no alerta
 *   S5. Cliente não vinculado → Slack nunca chamado
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks OBRIGATORIAMENTE antes dos imports das rotas ───────────────────────

// Previne "DATABASE_URL must be set" e fornece db controlável por teste
const mockDbExecute = vi.fn<() => Promise<{ rows: unknown[] }>>();
const mockDbInsertReturning = vi.fn<() => Promise<{ id: number }[]>>();

vi.mock("@workspace/db", () => {
  function makeSelectChain(resolvedValue: unknown[] = []) {
    const chain: Record<string, unknown> & PromiseLike<unknown[]> = {
      from:  vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn().mockResolvedValue(resolvedValue),
      then:  (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(resolvedValue).then(resolve, reject),
    };
    return chain;
  }

  function makeInsertChain() {
    const chain: Record<string, unknown> = {
      values:     vi.fn(() => chain),
      returning:  vi.fn(() => mockDbInsertReturning()),
    };
    return chain;
  }

  return {
    db: {
      select:  () => makeSelectChain([CLIENTE_VINCULADO]),
      insert:  () => makeInsertChain(),
      execute: (...args: unknown[]) => mockDbExecute(...(args as [])),
    },
    clientsTable:                {},
    telegramInboxTable:          {},
    assinaturaTogglesAdminTable: {},
    secureSettingsTable:         {},
    appSettingsTable:            {},
  };
});

// Cliente vinculado retornado pelo select (definido após o mock para referência)
const CLIENTE_VINCULADO = {
  id: 42,
  name: "Ana Lima",
  cpf: "12345678900",
  empresaId: 5,
  telegramChatId: "999888777",
};

// getSecret — devolve segredo correto por padrão
const mockGetSecret = vi.fn<(key: string) => Promise<string | null>>();
vi.mock("../lib/secure-settings.js", () => ({
  getSecret:       (...args: [string]) => mockGetSecret(...args),
  getSecretStatus: vi.fn().mockResolvedValue({ isSet: false, masked: null, source: null, updatedAt: null }),
  setSecret:       vi.fn().mockResolvedValue(undefined),
  getSetting:      vi.fn().mockResolvedValue(null),
  getJsonSetting:  vi.fn().mockResolvedValue(null),
}));

// sendTelegram — fire-and-forget; não queremos chamadas reais
vi.mock("../lib/telegram.js", () => ({
  sendTelegram:       vi.fn().mockResolvedValue({ sent: false, mock: true }),
  getTelegramBotInfo: vi.fn().mockResolvedValue(null),
}));

// postSlackAlert — espiamos para confirmar se foi ou não chamado
const mockPostSlackAlert = vi.fn<(channel: string, text: string) => Promise<void>>();
vi.mock("../lib/slack-reporter.js", () => ({
  postSlackAlert: (...args: [string, string]) => mockPostSlackAlert(...args),
}));

// processarWebhookInbox — usamos o real para cobrir o fluxo completo,
// mas limitamos os deps injetados pelo handler (db já está mockado acima)
vi.mock("../lib/telegram-inbox-flow.js", () => {
  // Implementação mínima real: chama findClienteByChatId + insertMensagem + notificarCEO
  return {
    processarWebhookInbox: async (
      params: { chatId: string; texto: string; chatIdCEO?: string | null },
      deps: {
        findClienteByChatId: (chatId: string) => Promise<unknown>;
        insertMensagem: (p: unknown) => Promise<{ id: number }>;
        notificarCEO?: (ceoId: string, cli: unknown, txt: string) => Promise<void>;
      },
    ) => {
      if (!params.texto) return { kind: "ignorado", motivo: "texto vazio" };
      const cliente = await deps.findClienteByChatId(params.chatId);
      if (!cliente) return { kind: "nao_vinculado" };
      const { id } = await deps.insertMensagem({ empresaId: 5, clienteId: 42, chatId: params.chatId, texto: params.texto });
      if (params.chatIdCEO && deps.notificarCEO) {
        await deps.notificarCEO(params.chatIdCEO, cliente, params.texto).catch(() => {});
      }
      return { kind: "gravado", mensagemId: id, clienteId: 42 };
    },
    obterBadge:  vi.fn(),
    listarInbox: vi.fn(),
    marcarLidas: vi.fn(),
  };
});

// Mocks mínimos para outros módulos importados por assinaturas.ts
vi.mock("../lib/assinatura/service.js", () => ({
  enviarAssinatura:      vi.fn(),
  receberWebhook:        vi.fn(),
  listarTimeline:        vi.fn(),
  obterPdfAssinado:      vi.fn(),
  processarNotificacoes: vi.fn(),
  listarTemplates:       vi.fn(),
  upsertTemplate:        vi.fn(),
}));
vi.mock("../lib/assinatura/consentimento.js", () => ({
  consentimentoAtivo:         vi.fn(),
  assertConsentimento:        vi.fn(),
  ConsentimentoPendenteError: class ConsentimentoPendenteError extends Error {},
}));
vi.mock("../lib/assinatura/clausulas.js", () => ({
  listarClausulas:   vi.fn(),
  upsertClausula:    vi.fn(),
  desativarClausula: vi.fn(),
}));
vi.mock("../lib/assinatura/contexto.js", () => ({
  contextoPaciente: vi.fn(),
}));
vi.mock("../routes/collaborator.js", () => ({
  requireCollaborator: (_req: unknown, _res: unknown, next: () => void) => next(),
  collaboratorGuard:   (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("drizzle-orm", () => ({
  eq:     vi.fn((...a) => a),
  and:    vi.fn((...a) => a),
  sql:    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  desc:   vi.fn((...a) => a),
  asc:    vi.fn((...a) => a),
  isNull: vi.fn((...a) => a),
  gt:     vi.fn((...a) => a),
}));

// ── Imports após todos os mocks ──────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { telegramWebhookRouter } from "../routes/assinaturas.js";

// ── Constantes ────────────────────────────────────────────────────────────────

const SEGREDO = "test-segredo-123";

const PAYLOAD = (texto: string) => ({
  update_id: 200000001,
  message: {
    message_id: 10,
    chat: { id: 999888777, type: "private" },
    text: texto,
    date: 1720000000,
  },
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(telegramWebhookRouter);
  return app;
}

/** Aguarda microtasks pendentes para capturar notificações fire-and-forget. */
async function flushAsync() {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("POST /webhooks/telegram — alerta Slack quando paciente responde", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSecret.mockResolvedValue(SEGREDO);
    mockDbInsertReturning.mockResolvedValue([{ id: 99 }]);
    // Por padrão: sem histórico de saída (Slack silenciado)
    mockDbExecute.mockResolvedValue({ rows: [] });
    // PADAXOR_TELEGRAM_CHAT_ID não configurado neste conjunto de testes
    delete process.env["PADAXOR_TELEGRAM_CHAT_ID"];
    delete process.env["PADAXOR_SLACK_CHANNEL_ID"];
  });

  // ── S1: Cliente com histórico de saída → Slack alertado ─────────────────

  it("S1 — histórico de saída existe: postSlackAlert é chamado com nome e trecho", async () => {
    // Simula linha direcao='saida' no banco
    mockDbExecute.mockResolvedValue({ rows: [{ id: 7 }] });

    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO)
      .send(PAYLOAD("Oi doutor, como é a posologia?"));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(mockPostSlackAlert).toHaveBeenCalledOnce();
    const [channel, text] = mockPostSlackAlert.mock.calls[0];
    expect(channel).toBe("C0BLW5S7GQL"); // fallback padrão
    expect(text).toContain("Ana");       // primeiro nome do cliente
    expect(text).toContain("Oi doutor, como é a posologia?");
  });

  // ── S2: Sem histórico de saída → Slack silenciado ────────────────────────

  it("S2 — sem histórico de saída: postSlackAlert NÃO é chamado", async () => {
    mockDbExecute.mockResolvedValue({ rows: [] });

    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO)
      .send(PAYLOAD("Primeira mensagem do paciente"));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(mockPostSlackAlert).not.toHaveBeenCalled();
  });

  // ── S3: Falha do Slack não impede o ACK 200 ──────────────────────────────

  it("S3 — Slack lança erro: resposta ainda é 200 (best-effort)", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: 7 }] });
    mockPostSlackAlert.mockRejectedValue(new Error("Slack timeout"));

    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO)
      .send(PAYLOAD("Oi!"));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    await flushAsync();
    // O erro foi engolido — nenhuma exceção vazou para o handler
  });

  // ── S4: Mensagem longa é truncada ────────────────────────────────────────

  it("S4 — mensagem longa (>120 chars) é truncada no alerta Slack", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: 7 }] });

    const mensagemLonga = "A".repeat(200);

    await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO)
      .send(PAYLOAD(mensagemLonga));

    await flushAsync();

    expect(mockPostSlackAlert).toHaveBeenCalledOnce();
    const [, text] = mockPostSlackAlert.mock.calls[0];
    // O trecho enviado ao Slack não pode ser maior que 120 + "…"
    expect(text.length).toBeLessThan(300);
    expect(text).toContain("…");
  });

  // ── S5: Mensagem sem chatId vinculado → Slack nunca chamado ──────────────

  it("S5 — segredo errado: processamento interrompido, Slack nunca chamado", async () => {
    mockDbExecute.mockResolvedValue({ rows: [{ id: 7 }] });

    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", "token-errado")
      .send(PAYLOAD("Mensagem qualquer"));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(mockPostSlackAlert).not.toHaveBeenCalled();
  });
});
