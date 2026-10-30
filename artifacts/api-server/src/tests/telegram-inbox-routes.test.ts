/**
 * telegram-inbox-routes.test.ts
 *
 * Testes de integração HTTP para routes/telegram-inbox.ts.
 *
 * Exercita as 3 rotas reais (badge, listar, marcar-lidas) via HTTP usando
 * supertest. As funções da lib (obterBadge, listarInbox, marcarLidas) são
 * mockadas — o objetivo é validar o comportamento HTTP da camada de rota:
 *   - Status codes (200, 400, 404)
 *   - Formato JSON da resposta
 *   - Repasse correto de parâmetros para a lib (clienteId, empresaId, marcarLidas)
 *   - Isolamento de tenant (empresaId vem do tenantContextMiddleware, não da URL)
 *
 * Pré-condição: o servidor NÃO precisa estar rodando. O supertest monta um
 * app Express em memória com o inboxRouter real e a lib mockada.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks OBRIGATORIAMENTE antes dos imports das rotas ───────────────────────

// Previne o throw "DATABASE_URL must be set" em lib/db/src/index.ts
vi.mock("@workspace/db", () => ({
  db:                  {},
  clientsTable:        {},
  telegramInboxTable:  {},
  // tabelas importadas indiretamente por outros módulos que cockpit.ts usa:
  budgetsTable:        {},
  protocolsTable:      {},
  anamneseRespostaTable:   {},
  perguntaDoencaTable: {},
  itemDoencaTable:     {},
  catalogoDoencasTable: {},
  whatsappMensagensLogTable: {},
  assinaturaTogglesAdminTable: {},
}));

// Mockamos as 3 funções da lib — cada teste controla os valores de retorno
vi.mock("../lib/telegram-inbox-flow", () => ({
  obterBadge:           vi.fn(),
  listarInbox:          vi.fn(),
  marcarLidas:          vi.fn(),
  processarWebhookInbox: vi.fn(),
}));

// requireCollaborator como passthrough — injeta colaborador sem validar JWT.
// Caminho relativo ao arquivo de ROTA (src/routes/collaborator.ts), não ao teste.
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, _res: any, next: any) => {
    req.collaborator = { professionalId: 1, role: "medico" };
    next();
  },
  collaboratorGuard: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../middleware/messageClinic", () => ({
  requireMessageClinic: (req: any, _res: any, next: any) => {
    req.messageEmpresaId = 5;
    next();
  },
}));

// drizzle-orm é puro (sem DB) — não precisa de mock
// tenantContextMiddleware é puro (sem DB) — usamos o real

// ── Imports após os mocks ────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { inboxRouter } from "../routes/telegram-inbox";
import * as flow from "../lib/telegram-inbox-flow";

// ── App mínimo de teste ───────────────────────────────────────────────────────

/**
 * Monta um Express app isolado com:
 *   - express.json() para parsear body
 *   - tenantContextMiddleware (real) — injeta empresaId=5 na requisição
 *   - inboxRouter (real) — as 3 rotas chamam as funções da lib (mockadas)
 *
 * Cada teste usa um app fresco para evitar estado compartilhado.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantContextMiddleware);
  app.use(inboxRouter);
  return app;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EMPRESA_ID = 5;   // valor hardcoded pelo tenantContextMiddleware em single-tenant
const CLIENTE_ID = 42;
const TEXTO      = "Olá, tenho dúvida sobre meu tratamento";
const MSG_ID     = 1001;

const MSG_OK = {
  id: MSG_ID,
  texto: TEXTO,
  recebidaEm: "2026-08-10T10:00:00.000Z",
  lida: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /telegram-inbox/badge
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /telegram-inbox/badge — HTTP layer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("HTTP 200 + { naoLidas: 2 } quando a lib retorna 2", async () => {
    vi.mocked(flow.obterBadge).mockResolvedValue({ naoLidas: 2 });

    const res = await request(buildApp()).get("/telegram-inbox/badge");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ naoLidas: 2 });
  });

  it("chama obterBadge com empresaId=5 (tenant da sessão, não da URL)", async () => {
    vi.mocked(flow.obterBadge).mockResolvedValue({ naoLidas: 0 });

    await request(buildApp()).get("/telegram-inbox/badge");

    expect(flow.obterBadge).toHaveBeenCalledOnce();
    expect(flow.obterBadge).toHaveBeenCalledWith(
      { empresaId: EMPRESA_ID },
      expect.any(Object), // deps Drizzle — verificados nos testes unitários da lib
    );
  });

  it("HTTP 200 + { naoLidas: 0 } quando não há não-lidas", async () => {
    vi.mocked(flow.obterBadge).mockResolvedValue({ naoLidas: 0 });

    const res = await request(buildApp()).get("/telegram-inbox/badge");

    expect(res.status).toBe(200);
    expect(res.body.naoLidas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /cockpit/:clientId/telegram-inbox
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /cockpit/:clientId/telegram-inbox — HTTP layer", () => {
  it.each(["20", "50", "100"])("permite quantidade %s com filtro recebido", async (quantidade) => {
    vi.mocked(flow.listarInbox).mockResolvedValue({
      kind: "ok", mensagens: [], naoLidas: 0, temMais: false,
    });
    const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox?quantidade=${quantidade}&direcao=entrada`);
    expect(res.status).toBe(200);
    expect(flow.listarInbox).toHaveBeenLastCalledWith(
      expect.objectContaining({ tamanhoPagina: Number(quantidade), empresaId: EMPRESA_ID }),
      expect.anything(),
    );
  });
  it.each(["quantidade=10000", "quantidade=0", "direcao=grave", "direcao=entrada&direcao=saida"])(
    "rejeita filtro inválido %s", async (params) => {
      const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox?${params}`);
      expect(res.status).toBe(400);
      expect(flow.listarInbox).not.toHaveBeenCalled();
    },
  );
  it.each(["NaN", "Infinity", "-1", "0", "1.5", "999999999999999999999"])(
    "normaliza página inválida %s sem produzir OFFSET inseguro", async (pagina) => {
      vi.mocked(flow.listarInbox).mockResolvedValue({
        kind: "ok", mensagens: [], naoLidas: 0, temMais: false,
      });
      const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox?pagina=${pagina}`);
      expect(res.status).toBe(200);
      expect(flow.listarInbox).toHaveBeenLastCalledWith(
        expect.objectContaining({ pagina: 1, clienteId: CLIENTE_ID, empresaId: EMPRESA_ID }),
        expect.anything(),
      );
    },
  );
  const LISTA_OK = {
    kind: "ok" as const,
    mensagens: [MSG_OK],
    naoLidas: 1,
    temMais: false,
  };

  beforeEach(() => vi.clearAllMocks());

  it("HTTP 200 com { mensagens, naoLidas } — sem vazar o campo kind", async () => {
    vi.mocked(flow.listarInbox).mockResolvedValue(LISTA_OK);

    const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox`);

    expect(res.status).toBe(200);
    expect(res.body.mensagens).toHaveLength(1);
    expect(res.body.naoLidas).toBe(1);
    expect(res.body.kind).toBeUndefined(); // kind não deve vazar para o cliente
  });

  it("HTTP 404 quando a lib retorna nao_encontrado (cross-tenant bloqueado)", async () => {
    vi.mocked(flow.listarInbox).mockResolvedValue({ kind: "nao_encontrado" });

    const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("cliente nao encontrado");
  });

  it("HTTP 400 quando clientId não é número válido", async () => {
    const res = await request(buildApp()).get("/cockpit/abc/telegram-inbox");
    expect(res.status).toBe(400);
    expect(flow.listarInbox).not.toHaveBeenCalled();
  });

  it("HTTP 400 quando clientId é zero", async () => {
    const res = await request(buildApp()).get("/cockpit/0/telegram-inbox");
    expect(res.status).toBe(400);
  });

  it("chama listarInbox com clienteId=42, empresaId=5 e marcarLidas=false por padrão", async () => {
    vi.mocked(flow.listarInbox).mockResolvedValue(LISTA_OK);

    await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox`);

    expect(flow.listarInbox).toHaveBeenCalledWith(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID, marcarLidas: false, pagina: 1, tamanhoPagina: 20 },
      expect.any(Object),
    );
  });

  it("passa marcarLidas=true quando query param marcar_lidas=1", async () => {
    vi.mocked(flow.listarInbox).mockResolvedValue(LISTA_OK);

    await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox?marcar_lidas=1`);

    expect(flow.listarInbox).toHaveBeenCalledWith(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID, marcarLidas: true, pagina: 1, tamanhoPagina: 20 },
      expect.any(Object),
    );
  });

  it("mensagem retornada tem lida=false quando não-lida", async () => {
    vi.mocked(flow.listarInbox).mockResolvedValue(LISTA_OK);

    const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox`);

    expect(res.body.mensagens[0].lida).toBe(false);
    expect(res.body.mensagens[0].texto).toBe(TEXTO);
    expect(res.body.mensagens[0].id).toBe(MSG_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /cockpit/:clientId/telegram-inbox/marcar-lidas
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /cockpit/:clientId/telegram-inbox/marcar-lidas — HTTP layer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("HTTP 200 com { ok: true, marcadas: 1 } no caminho feliz", async () => {
    vi.mocked(flow.marcarLidas).mockResolvedValue({ kind: "ok", marcadas: 1 });

    const res = await request(buildApp())
      .post(`/cockpit/${CLIENTE_ID}/telegram-inbox/marcar-lidas`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, marcadas: 1 });
  });

  it("HTTP 404 quando a lib retorna nao_encontrado (cross-tenant bloqueado)", async () => {
    vi.mocked(flow.marcarLidas).mockResolvedValue({ kind: "nao_encontrado" });

    const res = await request(buildApp())
      .post(`/cockpit/${CLIENTE_ID}/telegram-inbox/marcar-lidas`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("cliente nao encontrado");
  });

  it("HTTP 400 quando clientId é zero", async () => {
    const res = await request(buildApp())
      .post("/cockpit/0/telegram-inbox/marcar-lidas");
    expect(res.status).toBe(400);
    expect(flow.marcarLidas).not.toHaveBeenCalled();
  });

  it("HTTP 400 quando clientId é negativo", async () => {
    const res = await request(buildApp())
      .post("/cockpit/-1/telegram-inbox/marcar-lidas");
    expect(res.status).toBe(400);
  });

  it("chama marcarLidas com clienteId=42 e empresaId=5 (tenant-scoped)", async () => {
    vi.mocked(flow.marcarLidas).mockResolvedValue({ kind: "ok", marcadas: 0 });

    await request(buildApp())
      .post(`/cockpit/${CLIENTE_ID}/telegram-inbox/marcar-lidas`);

    expect(flow.marcarLidas).toHaveBeenCalledWith(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID },
      expect.any(Object),
    );
  });

  it("retorna marcadas=0 quando todas as mensagens já estavam lidas", async () => {
    vi.mocked(flow.marcarLidas).mockResolvedValue({ kind: "ok", marcadas: 0 });

    const res = await request(buildApp())
      .post(`/cockpit/${CLIENTE_ID}/telegram-inbox/marcar-lidas`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.marcadas).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Direção de mensagem — saida vs entrada
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /cockpit/:clientId/telegram-inbox — campo direcao no DTO", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mensagem de entrada (paciente→bot) tem direcao='entrada' no DTO", async () => {
    vi.mocked(flow.listarInbox).mockResolvedValue({
      kind: "ok",
      mensagens: [{ ...MSG_OK, direcao: "entrada" }],
      naoLidas: 1,
      temMais: false,
    });

    const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox`);

    expect(res.status).toBe(200);
    expect(res.body.mensagens[0].direcao).toBe("entrada");
  });

  it("mensagem de saida (CEO→paciente) tem direcao='saida' no DTO e não se torna entrada", async () => {
    vi.mocked(flow.listarInbox).mockResolvedValue({
      kind: "ok",
      mensagens: [{ ...MSG_OK, lida: true, direcao: "saida" }],
      naoLidas: 0,
      temMais: false,
    });

    const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox`);

    expect(res.status).toBe(200);
    expect(res.body.mensagens[0].direcao).toBe("saida");
  });

  it("mix de entrada e saida em paginas diferentes preserva direcao em cada item", async () => {
    const msgEntrada = { ...MSG_OK, id: 1, direcao: "entrada" };
    const msgSaida   = { ...MSG_OK, id: 2, lida: true, direcao: "saida" };

    vi.mocked(flow.listarInbox).mockResolvedValue({
      kind: "ok",
      mensagens: [msgSaida, msgEntrada],
      naoLidas: 1,
      temMais: false,
    });

    const res = await request(buildApp()).get(`/cockpit/${CLIENTE_ID}/telegram-inbox`);

    expect(res.status).toBe(200);
    expect(res.body.mensagens.find((m: any) => m.id === 2).direcao).toBe("saida");
    expect(res.body.mensagens.find((m: any) => m.id === 1).direcao).toBe("entrada");
  });
});

// Fluxo integrado HTTP: webhook → badge → lista → marcar-lidas → badge zero
// ─────────────────────────────────────────────────────────────────────────────

describe("Fluxo HTTP completo ponta a ponta (4 etapas encadeadas)", () => {
  it("badge acende após mensagem e zera após marcar-lidas", async () => {
    const app = buildApp();

    // Etapa 1 — Badge mostra 1 não-lida (webhook já gravou no banco)
    vi.mocked(flow.obterBadge).mockResolvedValueOnce({ naoLidas: 1 });
    const badgeAntes = await request(app).get("/telegram-inbox/badge");
    expect(badgeAntes.status).toBe(200);
    expect(badgeAntes.body.naoLidas).toBeGreaterThanOrEqual(1);

    // Etapa 2 — Inbox lista a mensagem com lida=false
    vi.mocked(flow.listarInbox).mockResolvedValueOnce({
      kind: "ok",
      mensagens: [MSG_OK],
      naoLidas: 1,
      temMais: false,
    });
    const listar = await request(app).get(`/cockpit/${CLIENTE_ID}/telegram-inbox`);
    expect(listar.status).toBe(200);
    expect(listar.body.mensagens).toHaveLength(1);
    expect(listar.body.mensagens[0].lida).toBe(false);
    expect(listar.body.naoLidas).toBe(1);

    // Etapa 3 — Marcar-lidas retorna ok + marcadas=1
    vi.mocked(flow.marcarLidas).mockResolvedValueOnce({ kind: "ok", marcadas: 1 });
    const marcar = await request(app)
      .post(`/cockpit/${CLIENTE_ID}/telegram-inbox/marcar-lidas`);
    expect(marcar.status).toBe(200);
    expect(marcar.body.ok).toBe(true);
    expect(marcar.body.marcadas).toBe(1);

    // Etapa 4 — Badge zera após marcar-lidas
    vi.mocked(flow.obterBadge).mockResolvedValueOnce({ naoLidas: 0 });
    const badgeDepois = await request(app).get("/telegram-inbox/badge");
    expect(badgeDepois.status).toBe(200);
    expect(badgeDepois.body.naoLidas).toBe(0);
  });
});
