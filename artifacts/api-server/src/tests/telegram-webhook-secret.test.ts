/**
 * telegram-webhook-secret.test.ts
 *
 * Testes de integração HTTP para a validação do segredo no webhook Telegram.
 *
 * Regra de ouro: o webhook SEMPRE responde HTTP 200 (Telegram reentreguaria
 * em loop se recebesse 4xx/5xx). Quando o segredo está ausente ou errado,
 * a rota silencia — sem gravar nada, sem vazar o motivo ao chamador.
 *
 * Cenários cobertos:
 *   C1. Segredo correto no cabeçalho → 200 + processarWebhookInbox chamado
 *   C2. Segredo ausente no cofre (null) → 200 + nada gravado
 *   C3. Segredo errado no cabeçalho → 200 + nada gravado
 *   C4. Cabeçalho completamente ausente → 200 + nada gravado
 *   C5. Resposta não vaza o motivo de rejeição (corpo idêntico ao caminho feliz)
 *   C6. Falha técnica do cofre → 200 + ERROR específico sem credenciais
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mocks OBRIGATORIAMENTE antes dos imports das rotas ───────────────────────
vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Previne o throw "DATABASE_URL must be set" em lib/db/src/index.ts
vi.mock("@workspace/db", () => {
  // Objeto db com chainable query builder — suficiente para o handler.
  //
  // O handler faz dois padrões de select distintos:
  //   Padrão A: db.select().from().where().limit()   → await sobre limit()
  //   Padrão B: db.select().from()                   → await direto sobre from()
  //
  // Para cobrir ambos, o chain precisa ser thenable (para o Padrão B) E
  // ter .where()/.limit() encadeáveis (para o Padrão A).
  function makeChain(resolvedValue: unknown[] = []) {
    const chain: Record<string, unknown> & PromiseLike<unknown[]> = {
      from:  vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn().mockResolvedValue(resolvedValue),
      // thenable — permite `await db.select().from()` sem .limit()
      then:  (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(resolvedValue).then(resolve, reject),
    };
    return chain;
  }

  const dbMock = {
    select:  vi.fn(() => makeChain([])),  // sem clientes vinculados por padrão
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };
  return {
    db:                          dbMock,
    clientsTable:                {},
    telegramInboxTable:          {},
    assinaturaTogglesAdminTable: {},
    secureSettingsTable:         {},
    appSettingsTable:            {},
  };
});

// getSecret controlável por cada teste
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
  sendTelegram:       vi.fn().mockResolvedValue(undefined),
  getTelegramBotInfo: vi.fn().mockResolvedValue(null),
}));

// processarWebhookInbox — espiamos para confirmar se foi ou não chamado
const mockProcessarWebhookInbox = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("../lib/telegram-inbox-flow.js", () => ({
  processarWebhookInbox: (...args: unknown[]) => mockProcessarWebhookInbox(...args),
  obterBadge:   vi.fn(),
  listarInbox:  vi.fn(),
  marcarLidas:  vi.fn(),
}));

// Biblioteca de assinatura — não usada no handler do Telegram, mas importada
// pelo mesmo arquivo assinaturas.ts; mock mínimo para não estourar.
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
  consentimentoAtivo:          vi.fn(),
  assertConsentimento:         vi.fn(),
  ConsentimentoPendenteError:  class ConsentimentoPendenteError extends Error {},
}));
vi.mock("../lib/assinatura/clausulas.js", () => ({
  listarClausulas:  vi.fn(),
  upsertClausula:   vi.fn(),
  desativarClausula: vi.fn(),
}));
vi.mock("../lib/assinatura/contexto.js", () => ({
  contextoPaciente: vi.fn(),
}));

// requireCollaborator — passthrough (o webhook não usa autenticação de colaborador,
// mas o mesmo arquivo exporta rotas que usam; mock para não travar).
vi.mock("../routes/collaborator.js", () => ({
  requireCollaborator: (_req: unknown, _res: unknown, next: () => void) => next(),
  collaboratorGuard:   (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// drizzle-orm — helpers de query usados no handler
vi.mock("drizzle-orm", () => ({
  eq:    vi.fn((...a) => a),
  and:   vi.fn((...a) => a),
  sql:   vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  desc:  vi.fn((...a) => a),
  asc:   vi.fn((...a) => a),
  isNull: vi.fn((...a) => a),
  gt:    vi.fn((...a) => a),
}));

// ── Imports após todos os mocks ──────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { telegramWebhookRouter } from "../routes/assinaturas.js";
import { logger } from "../lib/logger.js";
import { db } from "@workspace/db";
import { sendTelegram } from "../lib/telegram.js";

// ── Constantes de teste ───────────────────────────────────────────────────────

const SEGREDO_CORRETO = "super-secret-telegram-token-abc123";
const SEGREDO_ERRADO  = "token-invalido-xyz";

/** Payload mínimo válido de update do Telegram (mensagem de texto simples). */
const PAYLOAD_VALIDO = {
  update_id: 100000001,
  message: {
    message_id: 1,
    chat: { id: 123456789, type: "private" },
    text: "Olá",
    date: 1720000000,
  },
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = logger;
    next();
  });
  app.use(telegramWebhookRouter);
  return app;
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("POST /webhooks/telegram — validação do segredo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Padrão: segredo correto no cofre
    mockGetSecret.mockResolvedValue(SEGREDO_CORRETO);
    // processarWebhookInbox retorna gravado por padrão (para C1)
    mockProcessarWebhookInbox.mockResolvedValue({ kind: "gravado", mensagemId: 1, clienteId: 42 });
  });

  // ── C1: Segredo correto → processa e grava ──────────────────────────────

  it("C1 — segredo correto: retorna 200 e tenta processar a mensagem", async () => {
    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_CORRETO)
      .send(PAYLOAD_VALIDO);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("C1 — segredo correto: getSecret consultado com a chave correta", async () => {
    await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_CORRETO)
      .send(PAYLOAD_VALIDO);

    expect(mockGetSecret).toHaveBeenCalledWith("telegram.webhookSecret");
  });

  // ── C2: Segredo ausente no cofre (null) → silencia sem gravar ───────────

  it("C2 — segredo ausente no cofre (null): retorna 200 mesmo assim (Telegram exige)", async () => {
    mockGetSecret.mockResolvedValue(null);

    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_CORRETO)
      .send(PAYLOAD_VALIDO);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("C2 — segredo ausente no cofre (null): processarWebhookInbox NÃO é chamado", async () => {
    mockGetSecret.mockResolvedValue(null);

    await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_CORRETO)
      .send(PAYLOAD_VALIDO);

    expect(mockProcessarWebhookInbox).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("[telegram] webhook ignorado: segredo ausente ou divergente");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("C2 — segredo ausente no cofre: comportamento idêntico mesmo sem cabeçalho", async () => {
    mockGetSecret.mockResolvedValue(null);

    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .send(PAYLOAD_VALIDO);   // sem cabeçalho X-Telegram-Bot-Api-Secret-Token

    expect(res.status).toBe(200);
    expect(mockProcessarWebhookInbox).not.toHaveBeenCalled();
  });

  // ── C3: Segredo errado no cabeçalho → silencia sem gravar ───────────────

  it("C3 — segredo errado: retorna 200 (não vaza o motivo via status code)", async () => {
    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_ERRADO)
      .send(PAYLOAD_VALIDO);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("C3 — segredo errado: processarWebhookInbox NÃO é chamado", async () => {
    await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_ERRADO)
      .send(PAYLOAD_VALIDO);

    expect(mockProcessarWebhookInbox).not.toHaveBeenCalled();
  });

  // ── C4: Cabeçalho ausente (sem nenhum token) → silencia sem gravar ───────

  it("C4 — cabeçalho ausente: retorna 200", async () => {
    const res = await request(buildApp())
      .post("/webhooks/telegram")
      .send(PAYLOAD_VALIDO);   // sem x-telegram-bot-api-secret-token

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("C4 — cabeçalho ausente: processarWebhookInbox NÃO é chamado", async () => {
    await request(buildApp())
      .post("/webhooks/telegram")
      .send(PAYLOAD_VALIDO);

    expect(mockProcessarWebhookInbox).not.toHaveBeenCalled();
  });

  // ── C5: Corpo da resposta não vaza o motivo de rejeição ─────────────────

  it("C5 — corpo da rejeição é idêntico ao do caminho feliz (sem vazar motivo)", async () => {
    // Caminho feliz
    const resOk = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_CORRETO)
      .send(PAYLOAD_VALIDO);

    // Segredo ausente
    mockGetSecret.mockResolvedValue(null);
    const resAusente = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_CORRETO)
      .send(PAYLOAD_VALIDO);

    // Segredo errado
    mockGetSecret.mockResolvedValue(SEGREDO_CORRETO);
    const resErrado = await request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_ERRADO)
      .send(PAYLOAD_VALIDO);

    // Todos devem ter o mesmo shape — nenhum campo extra como "error" ou "motivo"
    expect(resAusente.body).toEqual(resOk.body);
    expect(resErrado.body).toEqual(resOk.body);
    // Garantia explícita: nenhum campo que revele o motivo
    expect(resAusente.body).not.toHaveProperty("error");
    expect(resAusente.body).not.toHaveProperty("motivo");
    expect(resErrado.body).not.toHaveProperty("error");
    expect(resErrado.body).not.toHaveProperty("motivo");
  });

  it("C6 — cofre indisponível: responde 200 e registra ERROR distinto sem vazar dados", async () => {
    const selectSpy = vi.spyOn(db, "select");
    mockGetSecret.mockRejectedValueOnce(Object.assign(
      new Error(`DB offline; credentials=${SEGREDO_CORRETO}`),
      { code: "ECONNREFUSED" },
    ));
    try {
      const res = await request(buildApp())
        .post("/webhooks/telegram")
        .set("x-telegram-bot-api-secret-token", SEGREDO_CORRETO)
        .send(PAYLOAD_VALIDO);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(logger.error).toHaveBeenCalledExactlyOnceWith({
        secretKey: "telegram.webhookSecret",
        errorType: "Error",
        errorCode: "ECONNREFUSED",
      }, "[telegram] falha técnica ao consultar cofre; update não processado");
      expect(logger.warn).not.toHaveBeenCalled();
      expect(selectSpy).not.toHaveBeenCalled();
      expect(mockProcessarWebhookInbox).not.toHaveBeenCalled();
      expect(sendTelegram).not.toHaveBeenCalled();
      expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(SEGREDO_CORRETO);
      expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(PAYLOAD_VALIDO.message.text);
    } finally {
      selectSpy.mockRestore();
    }
  });
});

describe("POST /webhooks/telegram — senha de validação com match único", () => {
  const SENHA = "SENHA-TESTE-42";
  const CHAT_ID = 123456789;
  const CLIENTES = [
    { id: 42, name: "Paciente Um", vp: SENHA },
    { id: 43, name: "Paciente Dois", vp: SENHA },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PADAXOR_TELEGRAM_CHAT_ID", "CEO_TESTE");
    mockGetSecret.mockResolvedValue(SEGREDO_CORRETO);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(db.select).mockReset();
  });

  function mockClientes(clientes: typeof CLIENTES) {
    // Primeira consulta: chat ainda não vinculado.
    // Segunda consulta: todos os candidatos à senha (await direto em from()).
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce({
        from: vi.fn().mockResolvedValue(clientes),
      } as unknown as ReturnType<typeof db.select>);
  }

  function enviarSenha(chatId = CHAT_ID) {
    return request(buildApp())
      .post("/webhooks/telegram")
      .set("x-telegram-bot-api-secret-token", SEGREDO_CORRETO)
      .send({
        ...PAYLOAD_VALIDO,
        message: {
          ...PAYLOAD_VALIDO.message,
          chat: { id: chatId, type: "private" },
          text: `  ${SENHA.toLowerCase()}  `,
        },
      });
  }

  it.each([CHAT_ID, CHAT_ID + 1])(
    "colisão: recusa o vínculo do chat %s sem UPDATE nem boas-vindas",
    async (chatId) => {
      mockClientes(CLIENTES);

      const res = await enviarSenha(chatId);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      // Prova que a busca de candidatos ocorreu, evitando um falso positivo
      // caso o texto do Telegram seja ignorado antes da verificação de colisão.
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        "[telegram] vínculo recusado: senha de validação ambígua (colisão)",
      );
      expect(db.execute).not.toHaveBeenCalled();
      expect(sendTelegram).not.toHaveBeenCalled();
      expect(mockProcessarWebhookInbox).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it("match único: grava o chat no paciente correto e envia boas-vindas", async () => {
    mockClientes([CLIENTES[0], { ...CLIENTES[1], vp: "OUTRA-SENHA" }]);

    const res = await enviarSenha();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledOnce();
    const query = vi.mocked(db.execute).mock.calls[0][0] as unknown as {
      strings: readonly string[];
      values: unknown[];
    };
    expect(query.strings.join("?").replace(/\s+/g, " ").trim()).toBe(
      "UPDATE clients SET telegram_chat_id = ?, telegram_vinculado_em = now() WHERE id = ?",
    );
    expect(query.values).toEqual([String(CHAT_ID), CLIENTES[0].id]);
    expect(sendTelegram).toHaveBeenCalledTimes(2);
    expect(sendTelegram).toHaveBeenCalledWith(
      String(CHAT_ID),
      expect.stringContaining("Olá, Paciente!"),
    );
    expect(sendTelegram).toHaveBeenCalledWith(
      String(CHAT_ID),
      expect.stringContaining("Seu Telegram está agora vinculado"),
    );
    expect(sendTelegram).toHaveBeenCalledWith(
      "CEO_TESTE",
      expect.stringContaining(CLIENTES[0].name),
    );
    expect(mockProcessarWebhookInbox).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
