/**
 * cockpit-badge.test.ts
 *
 * Confirma que GET /cockpit/:clientId devolve telegramLinked corretamente.
 *
 *   - telegramLinked: false  quando telegram_chat_id é NULL no registro
 *   - telegramLinked: true   quando telegram_chat_id está preenchido
 *   - nome, telefone e email presentes no DTO (regressão da seleção parcial)
 *   - HTTP 404 quando cliente não existe
 *   - HTTP 400 para clientId não inteiro
 *
 * Técnica: app Express em memória com DB mockado via fila de resultados,
 * sem servidor real nem banco de dados.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const authState = vi.hoisted(() => ({ enforce: false, whereCalls: [] as unknown[] }));

// ── Mocks OBRIGATORIAMENTE antes dos imports das rotas ────────────────────────
//
// db usa uma FILA interna: cada chamada a db.select() consome um item da fila.
// O primeiro item é o resultado do clientsTable; os demais retornam [].
// _queueResults() preenche a fila antes de cada request.

vi.mock("@workspace/db", () => {
  const _queue: unknown[][] = [];
  const _whereCalls: unknown[] = authState.whereCalls;

  function makeChain(result: unknown[]) {
    const chain: Record<string, unknown> = {};
    chain.where   = vi.fn((condition: unknown) => {
      _whereCalls.push(condition);
      return chain;
    });
    chain.from    = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit   = vi.fn().mockResolvedValue(result);
    // Torna o chain "thenable" (para queries sem .limit())
    const resolved = Promise.resolve(result);
    (chain as unknown as Promise<unknown[]>).then = resolved.then.bind(resolved);
    return chain;
  }

  const db: Record<string, unknown> = {
    select:        vi.fn().mockImplementation(() => makeChain(_queue.shift() ?? [])),
    execute:       vi.fn().mockResolvedValue({ rows: [] }),
    _queueResults: (...rows: unknown[][]) => { _queue.splice(0); _queue.push(...rows); },
    _whereCalls,
  };

  // Colunas do clientsTable precisam ser objetos (o cockpit faz clientsTable.id, etc.)
  const col = (name: string) => ({ name });
  const clientsTable = {
    id:             col("id"),
    name:           col("name"),
    phone:          col("phone"),
    email:          col("email"),
    telegramChatId: col("telegram_chat_id"),
    empresaId:      col("empresa_id"),
  };

  return {
    db,
    clientsTable,
    budgetsTable:              { id: col("id"), clientId: col("client_id"), status: col("status"), title: col("title"), totalCents: col("total_cents"), acceptedAt: col("accepted_at"), updatedAt: col("updated_at") },
    protocolsTable:            { id: col("id"), clientId: col("client_id"), status: col("status"), createdAt: col("created_at") },
    anamneseRespostaTable:     { clienteId: col("cliente_id"), perguntaId: col("pergunta_id"), valorNumerico: col("valor_numerico"), valor: col("valor") },
    perguntaDoencaTable:       { perguntaId: col("pergunta_id"), gatilhoValor: col("gatilho_valor"), doencaIdIhe: col("doenca_id_ihe") },
    itemDoencaTable:           { doencaIdIhe: col("doenca_id_ihe"), itemTipo: col("item_tipo"), itemNome: col("item_nome"), itemRef: col("item_ref"), peso: col("peso"), id: col("id") },
    catalogoDoencasTable:      {},
    whatsappMensagensLogTable: { clienteId: col("cliente_id"), criadoEm: col("criado_em") },
    assinaturaTogglesAdminTable: {},
    telegramInboxTable:        {},
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...args: unknown[]) => ({ op: "and", args }),
  inArray: (col: unknown, vals: unknown[]) => ({ op: "inArray", col, vals }),
  desc: (col: unknown) => ({ op: "desc", col }),
  ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
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
vi.mock("../lib/formula-manipulada",  () => ({ enriquecerItemFormula: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/whatsapp",            () => ({ sendWhatsapp: vi.fn().mockResolvedValue({ sent: false, via: "link", link: "" }), registrarLogMensagem: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/telegram",            () => ({ sendTelegram: vi.fn() }));
vi.mock("../lib/telegram-inbox-flow", () => ({
  obterBadge:            vi.fn().mockResolvedValue({ naoLidas: 0 }),
  listarInbox:           vi.fn().mockResolvedValue([]),
  marcarLidas:           vi.fn().mockResolvedValue({ atualizadas: 0 }),
  processarWebhookInbox: vi.fn(),
}));
vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: { headers: Record<string, string | undefined>; collaborator?: unknown }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    if (authState.enforce && req.headers.authorization !== "Bearer test-authorized") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.collaborator = { professionalId: 1, role: "executor", credentialVersion: 0 };
    next();
  },
  collaboratorGuard:   (_req: unknown, _res: unknown, next: () => void) => next(),
}));
// A rota real confirma o vínculo da clínica no banco; neste teste isolado
// somente o envio e o registro são exercitados.
vi.mock("../middleware/messageClinic", () => ({
  requireMessageClinic: (req: { messageEmpresaId?: number }, _res: unknown, next: () => void) => {
    req.messageEmpresaId = 5;
    next();
  },
}));

// ── Imports após os mocks ─────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import * as dbModule from "@workspace/db";
import * as telegramModule from "../lib/telegram";

// Importado dinâmico para garantir que os vi.mock acima já estão ativos
const { default: cockpitRouter } = await import("../routes/cockpit");

// ── Helpers ───────────────────────────────────────────────────────────────────

type DbHelper = { _queueResults: (...rows: unknown[][]) => void };

/**
 * Configura a fila do mock para um request ao GET /cockpit/:clientId.
 * O cockpit faz 6 db.select() em sequência: cliente, respostas, perguntaDoenca,
 * protocolos, orcamentos, ultimoLog. Somente a primeira importa para o badge.
 */
function queueForCockpitGet(clientRow: Record<string, unknown> | undefined) {
  const first = clientRow ? [clientRow] : [];
  (dbModule.db as unknown as DbHelper)._queueResults(
    first, // 1. cliente (clientsTable)
    [],    // 2. respostas anamnese
    [],    // 3. perguntaDoenca (doencasAcesasIds)
    [],    // 4. protocolos
    [],    // 5. orcamentos
    [],    // 6. ultimo log de contato
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantContextMiddleware);
  app.use((req, _res, next) => {
    const requested = req.headers["x-test-company"];
    if (typeof requested === "string") req.tenantContext.empresaId = Number(requested);
    next();
  });
  app.use(cockpitRouter);
  return app;
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("GET /cockpit/:clientId — badge Telegram + DTO básico", () => {
  beforeEach(() => vi.clearAllMocks());

  it("telegramLinked=false quando telegram_chat_id é null", async () => {
    queueForCockpitGet({ id: 42, name: "Ana Silva", phone: "11999999999", email: "ana@ex.com", telegramChatId: null });

    const res = await request(buildApp()).get("/cockpit/42");

    expect(res.status).toBe(200);
    expect(res.body.cliente.telegramLinked).toBe(false);
  });

  it("telegramLinked=true quando telegram_chat_id está preenchido", async () => {
    queueForCockpitGet({ id: 42, name: "Ana Silva", phone: "11999999999", email: "ana@ex.com", telegramChatId: "987654321" });

    const res = await request(buildApp()).get("/cockpit/42");

    expect(res.status).toBe(200);
    expect(res.body.cliente.telegramLinked).toBe(true);
  });

  it("DTO contém nome, telefone e email (regressão seleção parcial)", async () => {
    queueForCockpitGet({ id: 42, name: "Ana Silva", phone: "11999999999", email: "ana@ex.com", telegramChatId: null });

    const res = await request(buildApp()).get("/cockpit/42");

    expect(res.status).toBe(200);
    expect(res.body.cliente.nome).toBe("Ana Silva");
    expect(res.body.cliente.telefone).toBe("11999999999");
    expect(res.body.cliente.email).toBe("ana@ex.com");
  });

  it("HTTP 404 quando cliente não existe", async () => {
    queueForCockpitGet(undefined);

    const res = await request(buildApp()).get("/cockpit/99999");

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it("HTTP 400 para clientId não inteiro", async () => {
    const res = await request(buildApp()).get("/cockpit/abc");
    expect(res.status).toBe(400);
  });

  it("nega as leituras sem sessão antes de consultar o banco", async () => {
    authState.enforce = true;
    try {
      const before = vi.mocked(dbModule.db.select).mock.calls.length;
      const dto = await request(buildApp()).get("/cockpit/42");
      const pdf = await request(buildApp()).get("/cockpit/42/pdf");
      expect(dto.status).toBe(401);
      expect(pdf.status).toBe(401);
      expect(vi.mocked(dbModule.db.select)).toHaveBeenCalledTimes(before);
    } finally {
      authState.enforce = false;
    }
  });

  it("usa a empresa autenticada no filtro de cliente para impedir leitura entre clínicas", async () => {
    authState.enforce = true;
    authState.whereCalls.splice(0);
    queueForCockpitGet(undefined);
    try {
      const response = await request(buildApp())
        .get("/cockpit/42")
        .set("Authorization", "Bearer test-authorized")
        .set("x-test-company", "6");
      expect(response.status).toBe(404);
      const containsCompanyFilter = (value: any): boolean => {
        if (!value || typeof value !== "object") return false;
        if (value.op === "eq" && value.col?.name === "empresa_id" && value.val === 6) return true;
        return Object.values(value).some(child => Array.isArray(child)
          ? child.some(containsCompanyFilter)
          : containsCompanyFilter(child));
      };
      expect(authState.whereCalls.some(containsCompanyFilter)).toBe(true);
    } finally {
      authState.enforce = false;
    }
  });
});

// ── Testes: POST /cockpit/:clientId/telegram-inbox/enviar ─────────────────────
//
// Verifica que telegram_last_test_ok é persistido corretamente após cada envio
// real ao chatId do paciente (não ao CEO) e que o cliente é refletido pelo
// número de chamadas a db.execute:
//
//   sent=false, mock=false → 1 execute (UPDATE false)  + 502 (sem INSERT)
//   sent=true,  mock=false → 3 executes (UPDATE + INSERT inbox + pausa da IA)
//   sent=true,  mock=true  → 2 executes (INSERT inbox + pausa da IA, sem UPDATE)

describe("POST /cockpit/:clientId/telegram-inbox/enviar — telegram_last_test_ok", () => {
  beforeEach(() => vi.clearAllMocks());

  /** Fila para o POST: apenas 1 select (busca do cliente). */
  function queueForEnviar(telegramChatId: string | null) {
    (dbModule.db as unknown as DbHelper)._queueResults(
      telegramChatId !== null ? [{ id: 42, telegramChatId }] : [],
    );
  }

  it("persiste telegram_last_test_ok=false e retorna 502 quando o chatId está bloqueado", async () => {
    queueForEnviar("123456789");
    vi.mocked(telegramModule.sendTelegram).mockResolvedValueOnce({ sent: false, mock: false, error: "403 Forbidden" });

    const res = await request(buildApp())
      .post("/cockpit/42/telegram-inbox/enviar")
      .send({ texto: "Teste de entrega" });

    // 502 porque o envio real falhou
    expect(res.status).toBe(502);

    // db.execute deve ter sido chamado EXATAMENTE 1 vez:
    // o UPDATE SET telegram_last_test_ok = false.
    // O INSERT do inbox NÃO ocorre pois a rota retorna antes.
    const executeCalls = vi.mocked(dbModule.db.execute as ReturnType<typeof vi.fn>).mock.calls;
    expect(executeCalls).toHaveLength(1);
  });

  it("persiste telegram_last_test_ok=true e retorna 200 após envio bem-sucedido", async () => {
    queueForEnviar("123456789");
    vi.mocked(telegramModule.sendTelegram).mockResolvedValueOnce({ sent: true, mock: false });

    const res = await request(buildApp())
      .post("/cockpit/42/telegram-inbox/enviar")
      .send({ texto: "Teste de entrega" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const executeCalls = vi.mocked(dbModule.db.execute as ReturnType<typeof vi.fn>).mock.calls;
    expect(executeCalls).toHaveLength(3);
    const statements = executeCalls.map(([query]) =>
      (query as { strings?: string[] }).strings?.join(" ") ?? "",
    );
    expect(statements.some((statement) => statement.includes("UPDATE clients"))).toBe(true);
    expect(statements.some((statement) => statement.includes("INSERT INTO telegram_inbox_messages"))).toBe(true);
    expect(statements.some((statement) => statement.includes("INSERT INTO telegram_atendimento"))).toBe(true);
  });

  it("não persiste telegram_last_test_ok quando o envio é mock (token ausente)", async () => {
    queueForEnviar("123456789");
    vi.mocked(telegramModule.sendTelegram).mockResolvedValueOnce({ sent: true, mock: true });

    const res = await request(buildApp())
      .post("/cockpit/42/telegram-inbox/enviar")
      .send({ texto: "Teste de entrega" });

    expect(res.status).toBe(200);

    const executeCalls = vi.mocked(dbModule.db.execute as ReturnType<typeof vi.fn>).mock.calls;
    expect(executeCalls).toHaveLength(2);
    const statements = executeCalls.map(([query]) =>
      (query as { strings?: string[] }).strings?.join(" ") ?? "",
    );
    expect(statements.some((statement) => statement.includes("UPDATE clients"))).toBe(false);
    expect(statements.some((statement) => statement.includes("INSERT INTO telegram_inbox_messages"))).toBe(true);
    expect(statements.some((statement) => statement.includes("INSERT INTO telegram_atendimento"))).toBe(true);
  });
});
