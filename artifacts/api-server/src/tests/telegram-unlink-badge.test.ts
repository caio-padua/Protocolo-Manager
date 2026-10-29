/**
 * telegram-unlink-badge.test.ts
 *
 * Confirma o fluxo completo de remoção do vínculo Telegram e seu reflexo nas
 * rotas de diagnóstico e badge do cockpit:
 *
 *   1. DELETE /clients/:id/telegram — zera telegramChatId no banco (novo endpoint).
 *   2. POST /telegram/test-inbox — retorna 422 `canal_nao_vinculado` quando chatId é null.
 *   3. GET /cockpit/:clientId — retorna telegramLinked=false quando chatId é null.
 *
 * Sequência testada (Task 104 — "feito significa"):
 *   a) Simula cliente com chatId vinculado → test-inbox NÃO retorna 422.
 *   b) CEO chama DELETE unlink → chatId removido (rows > 0).
 *   c) Simula cliente com chatId=null → test-inbox retorna 422 canal_nao_vinculado.
 *   d) Simula cliente com chatId=null → cockpit retorna telegramLinked=false.
 *
 * Técnica: app Express em memória com DB mockado via filas independentes
 * para select() e execute(). Sem servidor real nem banco de dados.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks OBRIGATORIAMENTE antes dos imports das rotas ────────────────────────
//
// db usa duas filas:
//   _queueSelect()  — resultados de db.select() (consumidos em ordem)
//   _queueExecute() — resultados de db.execute() (consumidos em ordem)

vi.mock("@workspace/db", () => {
  const _selectQueue: unknown[][] = [];
  const _execQueue: { rows: unknown[] }[] = [];

  function makeChain(result: unknown[]) {
    const chain: Record<string, unknown> = {};
    chain.where   = vi.fn().mockReturnValue(chain);
    chain.from    = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit   = vi.fn().mockResolvedValue(result);
    // Cast to any to avoid strict Promise.then overload mismatch in the mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chain as any).then = (
      res?: ((v: unknown[]) => unknown) | null,
      rej?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(res ?? undefined, rej ?? undefined);
    return chain;
  }

  const db: Record<string, unknown> = {
    select: vi.fn().mockImplementation(() => makeChain(_selectQueue.shift() ?? [])),
    execute: vi.fn().mockImplementation(() =>
      Promise.resolve(_execQueue.shift() ?? { rows: [] })
    ),
    _queueSelect:  (...rows: unknown[][]) => { _selectQueue.splice(0); _selectQueue.push(...rows); },
    _queueExecute: (...results: { rows: unknown[] }[]) => { _execQueue.splice(0); _execQueue.push(...results); },
  };

  const col = (name: string) => ({ name });

  const clientsTable = {
    id:             col("id"),
    name:           col("name"),
    phone:          col("phone"),
    email:          col("email"),
    cpf:            col("cpf"),
    telegramChatId: col("telegram_chat_id"),
    empresaId:      col("empresa_id"),
    validationPassword: col("validation_password"),
  };

  return {
    db,
    clientsTable,
    // tabelas auxiliares consumidas indiretamente pelos routers importados:
    budgetsTable:                { id: col("id"), clientId: col("client_id"), status: col("status"), title: col("title"), totalCents: col("total_cents"), acceptedAt: col("accepted_at"), updatedAt: col("updated_at") },
    protocolsTable:              { id: col("id"), clientId: col("client_id"), status: col("status"), createdAt: col("created_at") },
    anamneseRespostaTable:       { clienteId: col("cliente_id"), perguntaId: col("pergunta_id"), valorNumerico: col("valor_numerico"), valor: col("valor") },
    perguntaDoencaTable:         { perguntaId: col("pergunta_id"), gatilhoValor: col("gatilho_valor"), doencaIdIhe: col("doenca_id_ihe") },
    itemDoencaTable:             { doencaIdIhe: col("doenca_id_ihe"), itemTipo: col("item_tipo"), itemNome: col("item_nome"), itemRef: col("item_ref"), peso: col("peso"), id: col("id") },
    catalogoDoencasTable:        {},
    whatsappMensagensLogTable:   { clienteId: col("cliente_id"), criadoEm: col("criado_em") },
    assinaturaTogglesAdminTable: {},
    telegramInboxTable:          {},
    clientPreferredAgendasTable: {},
    agendaResourcesTable:        {},
  };
});

// ── Mocks de libs pesadas ─────────────────────────────────────────────────────

vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req["collaborator"] = { professionalId: 1, role: "medico" };
    next();
  },
  collaboratorGuard: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/telegram", () => ({
  sendTelegram: vi.fn().mockResolvedValue({ sent: true, mock: false }),
}));

vi.mock("../lib/telegram-inbox-flow", () => ({
  obterBadge:            vi.fn().mockResolvedValue({ naoLidas: 0 }),
  listarInbox:           vi.fn().mockResolvedValue([]),
  marcarLidas:           vi.fn().mockResolvedValue({ atualizadas: 0 }),
  processarWebhookInbox: vi.fn(),
}));

vi.mock("../lib/motor-anamnese", () => ({
  computeMotor: vi.fn().mockResolvedValue({
    escoreTotal: 0, gradeGlobal: "BASICA", redFlag: false,
    blocos: [], sintomas: [], doencas: [], alarmes: [],
    exames: [], sugestaoDieta: null, sugestaoTreino: null,
  }),
  gatilhoBate: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/lembrete-periodo", () => ({
  sincronizarLembretePrescricao: vi.fn().mockResolvedValue({ formulas: 0, periodos: 0, horarios: [], ativo: false }),
  executarLembretesPeriodo:      vi.fn(),
}));

vi.mock("../lib/formula-manipulada", () => ({
  enriquecerItemFormula: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/whatsapp", () => ({
  sendWhatsapp:        vi.fn().mockResolvedValue({ sent: false, via: "link", link: "" }),
  isWhatsappConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/email-service", () => ({
  sendTelegramOnboardingEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../lib/logger", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../lib/secure-settings", () => ({
  getSecret:  vi.fn().mockResolvedValue(null),
  saveSecret: vi.fn().mockResolvedValue(undefined),
}));

// Mocks das libs de assinatura (pesadas, não testadas aqui)
vi.mock("../lib/assinatura/service", () => ({
  enviarAssinatura:       vi.fn(),
  receberWebhook:         vi.fn(),
  listarTimeline:         vi.fn().mockResolvedValue([]),
  obterPdfAssinado:       vi.fn(),
  processarNotificacoes:  vi.fn(),
  listarTemplates:        vi.fn().mockResolvedValue([]),
  upsertTemplate:         vi.fn(),
}));

vi.mock("../lib/assinatura/consentimento", () => ({
  consentimentoAtivo:       vi.fn().mockResolvedValue(true),
  assertConsentimento:      vi.fn().mockResolvedValue(undefined),
  ConsentimentoPendenteError: class ConsentimentoPendenteError extends Error {},
}));

vi.mock("../lib/assinatura/clausulas", () => ({
  listarClausulas:  vi.fn().mockResolvedValue([]),
  upsertClausula:   vi.fn(),
  desativarClausula: vi.fn(),
}));

vi.mock("../lib/assinatura/contexto", () => ({
  contextoPaciente: vi.fn().mockResolvedValue({}),
}));

// ── Imports após os mocks ─────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import * as dbModule from "@workspace/db";
import { PgDialect } from "drizzle-orm/pg-core";

// Importados dinâmicos para garantir que vi.mock() já está ativo
const { default: clientsRouter }    = await import("../routes/clients");
const { default: assinaturasRouter } = await import("../routes/assinaturas");
const { default: cockpitRouter }    = await import("../routes/cockpit");

// ── Helpers ───────────────────────────────────────────────────────────────────

type DbHelper = {
  _queueSelect:  (...rows: unknown[][]) => void;
  _queueExecute: (...results: { rows: unknown[] }[]) => void;
};

const dbHelper = dbModule.db as unknown as DbHelper;

function buildClientsApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantContextMiddleware);
  app.use(clientsRouter);
  return app;
}

function buildAssinaturasApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantContextMiddleware);
  app.use(assinaturasRouter);
  return app;
}

function buildCockpitApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantContextMiddleware);
  app.use(cockpitRouter);
  return app;
}

// Configura a fila do mock para um request ao GET /cockpit/:clientId.
// O cockpit faz 6 db.select() em sequência: cliente + 5 auxiliares.
function queueForCockpitGet(clientRow: Record<string, unknown> | undefined) {
  const first = clientRow ? [clientRow] : [];
  dbHelper._queueSelect(first, [], [], [], [], []);
}

// ── Constantes de teste ───────────────────────────────────────────────────────

const CLIENTE_VINCULADO = {
  id: 42,
  name: "João Silva",
  phone: "11999990001",
  email: "joao@ex.com",
  cpf: "12345678901",
  telegramChatId: "987654321",
  empresaId: 5,
};

const CLIENTE_DESVINCULADO = {
  ...CLIENTE_VINCULADO,
  telegramChatId: null,
};

// ── 1. DELETE /clients/:id/telegram ──────────────────────────────────────────

describe("DELETE /clients/:id/telegram — desvinculação Telegram", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 200 ok quando cliente existe e chatId é removido", async () => {
    // db.execute retorna 1 row (RETURNING id) → sucesso
    dbHelper._queueExecute({ rows: [{ id: 42 }] });

    const res = await request(buildClientsApp())
      .delete("/clients/42/telegram")
      .set("Authorization", "Bearer mock-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/removido/i);
    const statement = vi.mocked(dbModule.db.execute).mock.calls[0][0];
    const query = new PgDialect().sqlToQuery(statement as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.sql).toMatch(/UPDATE clients\s+SET telegram_chat_id = NULL, telegram_vinculado_em = NULL/i);
    expect(query.sql).toMatch(/WHERE id = \$1 AND empresa_id = \$2\s+RETURNING id/i);
    expect(query.params[0]).toBe(42);
    expect(query.params[1]).toBeDefined();
  });

  it("retorna 404 quando cliente não existe ou não pertence ao tenant", async () => {
    // db.execute retorna 0 rows (cliente não encontrado)
    dbHelper._queueExecute({ rows: [] });

    const res = await request(buildClientsApp())
      .delete("/clients/9999/telegram")
      .set("Authorization", "Bearer mock-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it("retorna 400 para clientId não inteiro", async () => {
    const res = await request(buildClientsApp())
      .delete("/clients/abc/telegram")
      .set("Authorization", "Bearer mock-token");

    expect(res.status).toBe(400);
  });

  it("retorna 500 quando o banco falha", async () => {
    vi.mocked(dbModule.db.execute).mockRejectedValueOnce(new Error("database unavailable"));
    const res = await request(buildClientsApp())
      .delete("/clients/42/telegram")
      .set("Authorization", "Bearer mock-token");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("erro_unlink_telegram");
  });

  it("retorna 400 para clientId zero", async () => {
    const res = await request(buildClientsApp())
      .delete("/clients/0/telegram")
      .set("Authorization", "Bearer mock-token");

    expect(res.status).toBe(400);
  });
});

// ── 2. POST /telegram/test-inbox — canal_nao_vinculado ───────────────────────

describe("POST /telegram/test-inbox — canal_nao_vinculado após desvinculação", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 422 canal_nao_vinculado quando telegramChatId é null", async () => {
    // db.select() retorna cliente COM chatId=null (pós-desvinculação)
    dbHelper._queueSelect([CLIENTE_DESVINCULADO]);

    const res = await request(buildAssinaturasApp())
      .post("/telegram/test-inbox")
      .set("Authorization", "Bearer mock-token")
      .send({ clienteId: 42, texto: "Olá, tenho uma dúvida!" });

    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("canal_nao_vinculado");
    expect(res.body.detalhe).toMatch(/telegramChatId/i);
  });

  it("NÃO retorna 422 quando cliente tem chatId vinculado", async () => {
    // Configura PADAXOR_TELEGRAM_CHAT_ID para a rota não retornar 503
    process.env["PADAXOR_TELEGRAM_CHAT_ID"] = "111222333";

    // db.select() retorna cliente COM chatId preenchido
    dbHelper._queueSelect([CLIENTE_VINCULADO]);

    const res = await request(buildAssinaturasApp())
      .post("/telegram/test-inbox")
      .set("Authorization", "Bearer mock-token")
      .send({ clienteId: 42, texto: "Olá, tenho uma dúvida!" });

    // Com chatId vinculado o erro canal_nao_vinculado NÃO deve aparecer
    expect(res.status).not.toBe(422);
    expect(res.body.error).not.toBe("canal_nao_vinculado");

    delete process.env["PADAXOR_TELEGRAM_CHAT_ID"];
  });

  it("retorna 400 para texto vazio", async () => {
    const res = await request(buildAssinaturasApp())
      .post("/telegram/test-inbox")
      .set("Authorization", "Bearer mock-token")
      .send({ clienteId: 42, texto: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("texto_vazio");
  });

  it("retorna 400 para clienteId inválido", async () => {
    const res = await request(buildAssinaturasApp())
      .post("/telegram/test-inbox")
      .set("Authorization", "Bearer mock-token")
      .send({ clienteId: 0, texto: "Oi" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("clienteId_invalido");
  });
});

// ── 3. GET /cockpit/:clientId — badge desaparece após desvinculação ───────────

describe("GET /cockpit/:clientId — telegramLinked reflete desvinculação", () => {
  beforeEach(() => vi.clearAllMocks());

  it("telegramLinked=true quando chatId está preenchido (pré-desvinculação)", async () => {
    queueForCockpitGet(CLIENTE_VINCULADO);

    const res = await request(buildCockpitApp()).get("/cockpit/42");

    expect(res.status).toBe(200);
    expect(res.body.cliente.telegramLinked).toBe(true);
  });

  it("telegramLinked=false quando chatId é null (pós-desvinculação — badge desaparece)", async () => {
    queueForCockpitGet(CLIENTE_DESVINCULADO);

    const res = await request(buildCockpitApp()).get("/cockpit/42");

    expect(res.status).toBe(200);
    expect(res.body.cliente.telegramLinked).toBe(false);
  });
});

// ── 4. Integração com estado compartilhado (Task 104 — "feito significa") ────
//
// Um único it() encadeia os quatro passos com estado que transita entre eles:
//   A) banco retorna cliente COM chatId  → test-inbox NÃO é 422
//   B) CEO chama DELETE /clients/42/telegram → execução persiste no mock
//   C) banco agora retorna cliente SEM chatId (estado pós-B) → test-inbox 422
//   D) cockpit lê o mesmo estado pós-B → telegramLinked=false (badge some)
//
// A transição de B→C simula o que acontece no banco real após o UPDATE:
// a próxima leitura encontra telegram_chat_id=NULL.

describe("Integração com estado compartilhado — unlink → badge some", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sequência real: DELETE persiste unlink → test-inbox 422 → cockpit telegramLinked=false", async () => {
    // Apps construídos uma vez para toda a sequência
    const clientsApp     = buildClientsApp();
    const assinaturasApp = buildAssinaturasApp();
    const cockpitApp     = buildCockpitApp();

    // ── A) Pré-condição: cliente tem chatId → test-inbox não bloqueia ────────
    process.env["PADAXOR_TELEGRAM_CHAT_ID"] = "111222333";
    dbHelper._queueSelect([CLIENTE_VINCULADO]);

    const resAntes = await request(assinaturasApp)
      .post("/telegram/test-inbox")
      .set("Authorization", "Bearer mock-token")
      .send({ clienteId: 42, texto: "Mensagem antes do unlink" });

    expect(resAntes.body.error).not.toBe("canal_nao_vinculado");
    delete process.env["PADAXOR_TELEGRAM_CHAT_ID"];

    // ── B) CEO desvincul o canal via DELETE /clients/42/telegram ─────────────
    // db.execute() retorna 1 row (RETURNING id) → UPDATE bem-sucedido no banco
    dbHelper._queueExecute({ rows: [{ id: 42 }] });

    const resUnlink = await request(clientsApp)
      .delete("/clients/42/telegram")
      .set("Authorization", "Bearer mock-token");

    expect(resUnlink.status).toBe(200);
    expect(resUnlink.body.ok).toBe(true);

    // ── C) Estado pós-unlink: banco agora retorna telegramChatId=null ─────────
    // Representa o que qualquer SELECT ao banco encontraria após o UPDATE de B.
    dbHelper._queueSelect([CLIENTE_DESVINCULADO]);

    const resTestInbox = await request(assinaturasApp)
      .post("/telegram/test-inbox")
      .set("Authorization", "Bearer mock-token")
      .send({ clienteId: 42, texto: "Mensagem após unlink" });

    expect(resTestInbox.status).toBe(422);
    expect(resTestInbox.body.ok).toBe(false);
    expect(resTestInbox.body.error).toBe("canal_nao_vinculado");

    // ── D) Cockpit lê o estado pós-unlink → badge Telegram some ──────────────
    // telegramLinked deriva de telegramChatId!=null; com null o badge desaparece.
    queueForCockpitGet(CLIENTE_DESVINCULADO);

    const resCockpit = await request(cockpitApp).get("/cockpit/42");

    expect(resCockpit.status).toBe(200);
    expect(resCockpit.body.cliente.telegramLinked).toBe(false);
  });
});
