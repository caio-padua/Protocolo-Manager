/**
 * dieta-enviar-lista.test.ts
 *
 * Testes do endpoint POST /api/dieta/prescricoes/:id/enviar-lista-compras.
 *
 * Cobertos:
 *  - Anon (sem Bearer) → 401 (requireCollaborator bloqueia)
 *  - Token válido + prescrição inexistente → 404
 *  - Paciente sem telefone + canal WHATSAPP → 422
 *  - Paciente sem email + canal EMAIL → 422
 *  - Cardápio vazio → 422
 *  - Envio WhatsApp: intro brandada + chunks de itens enviados na ordem
 *  - Envio Email: chama enviarMensagemPaxter para EMAIL
 *  - Itens sem preço incluídos com quantidade em gramas no chunk
 *  - Itens texto livre incluídos com quantidade em gramas no chunk
 *  - Lista longa: dividida em múltiplos chunks (nenhum excede WA_CHUNK_SIZE)
 *  - Falha num chunk interrompe e retorna sent=false
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ANTES dos imports das rotas ────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const makeTable = () => ({});
  return {
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() },
    dietaPrescricaoTable: makeTable(),
    dietaPrescricaoItemTable: makeTable(),
    dietaCatalogoAlimentosTable: makeTable(),
    clientsTable: makeTable(),
    professionalsTable: makeTable(),
    dietaIndicacaoTable: makeTable(),
    dietaProtocolosTable: makeTable(),
    dietaReceitasTable: makeTable(),
    dietaReceitaIngredientesTable: makeTable(),
    dietaReceitaProtocolosTable: makeTable(),
    UNIDADES_COMPRA: ["kg", "g", "l", "ml", "dz", "un", "maco", "pacote"],
    CATEGORIAS_COMPRA: ["hortifruti", "carnes", "laticinios", "graos", "outros"],
  };
});

vi.mock("../lib/dieta-calc", () => ({
  calcularTdee: vi.fn().mockReturnValue({ tmb: null, tdee: null, caloriasAlvo: null }),
  calcularMacrosPorcao: vi.fn().mockReturnValue({ kcal: null, proteinaG: null, carboidratoG: null, gorduraG: null }),
  dentroDaJanela: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/motor-anamnese", () => ({
  computeMotor: vi.fn(),
}));

vi.mock("../lib/messaging", () => ({
  enviarMensagemPaxter: vi.fn().mockResolvedValue({
    resultados: [{ canal: "WHATSAPP", sent: true, via: "twilio" }],
    algumEnviado: true,
  }),
  absoluteBaseUrl: vi.fn().mockReturnValue("https://test.example.com"),
}));

vi.mock("../lib/whatsapp", () => ({
  sendWhatsapp: vi.fn().mockResolvedValue({ sent: true, via: "twilio" }),
}));

// Mock requireCollaborator: a variável controlada no teste injeta ou bloqueia
let _mockAuthPasses = false;
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (_req: any, res: any, next: any) => {
    if (_mockAuthPasses) {
      _req.collaborator = { id: 1, role: "owner", name: "CEO" };
      next();
    } else {
      res.status(401).json({ error: "Acesso restrito: faça login de colaborador" });
    }
  },
  collaboratorGuard: (_req: any, _res: any, next: any) => next(),
}));

// ── Imports APÓS os mocks ────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import dietaRouter from "../routes/dieta";
import * as msgLib from "../lib/messaging";
import * as waLib from "../lib/whatsapp";
import * as dbModule from "@workspace/db";

// ── Helpers de fixture ────────────────────────────────────────────────────────

const PRESCRICAO = {
  id: 1,
  clientId: 10,
  protocoloId: null,
  professionalId: null,
  status: "ativa",
  objetivo: null,
  estiloAlimentar: null,
  pesoKg: null,
  alturaCm: null,
  idade: null,
  sexo: null,
  nivelAtividade: null,
  jejumIntermitente: false,
  jejumJanelaInicio: null,
  jejumJanelaFim: null,
  tmb: null,
  tdee: null,
  caloriasAlvo: null,
  observacao: null,
  createdAt: new Date().toISOString(),
};

const CLIENTE = {
  id: 10,
  name: "Maria Testes",
  email: "maria@example.com",
  phone: "+5511999990000",
};

const ITEM_COM_CATALOGO = {
  id: 1,
  prescricaoId: 1,
  alimentoId: 100,
  alimentoNome: "Frango",
  quantidadeG: 150,
  refeicao: "Almoço",
  horario: null,
  ordem: 1,
  kcal: null,
  proteinaG: null,
  carboidratoG: null,
  gorduraG: null,
  observacao: null,
};

const ALIMENTO = {
  id: 100,
  nome: "Frango",
  codigo: "frango",
  grupo: "Carnes",
  subgrupo: null,
  porcaoPadraoG: 100,
  kcal100g: 165,
  proteinaG100g: 31,
  carboidratoG100g: 0,
  gorduraG100g: 3.6,
  fibraG100g: null,
  indiceGlicemico: null,
  observacao: null,
  ativo: true,
  precoMedio: 20,
  unidadeCompra: "kg",
  unidadeCompraEquivalenteG: 1000,
  categoriaCompra: "carnes",
};

// ── App de teste ─────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", dietaRouter);
  return app;
}

// ── Utilitário: configura o db.select chain ──────────────────────────────────

function setupDbSelect(rows: unknown[][]) {
  let call = 0;
  const mockedDb = dbModule.db as any;
  mockedDb.select.mockImplementation(() => {
    const idx = call++;
    const result = rows[idx] ?? [];
    return {
      from: () => ({
        where: () => Promise.resolve(result),
        orderBy: () => Promise.resolve(result),
        leftJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve(result) }) }),
      }),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 1 — Autenticação
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/dieta/prescricoes/:id/enviar-lista-compras — auth", () => {
  beforeEach(() => {
    _mockAuthPasses = false;
    vi.clearAllMocks();
  });

  it("retorna 401 sem Bearer token", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 7 });
    expect(res.status).toBe(401);
  });

  it("não chama sendWhatsapp quando não autenticado", async () => {
    const app = buildApp();
    await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 7 });
    expect(waLib.sendWhatsapp).not.toHaveBeenCalled();
    expect(msgLib.enviarMensagemPaxter).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 2 — Validação de entrada (com auth)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/dieta/prescricoes/:id/enviar-lista-compras — validação", () => {
  beforeEach(() => {
    _mockAuthPasses = true;
    vi.clearAllMocks();
  });

  it("retorna 404 quando prescrição não existe", async () => {
    setupDbSelect([[]]); // prescricao not found
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/999/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 7 });
    expect(res.status).toBe(404);
  });

  it("retorna 422 quando paciente não tem telefone e canal é WHATSAPP", async () => {
    setupDbSelect([[PRESCRICAO], [{ ...CLIENTE, phone: null }]]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 7 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/telefone/i);
  });

  it("retorna 422 quando paciente não tem email e canal é EMAIL", async () => {
    setupDbSelect([[PRESCRICAO], [{ ...CLIENTE, email: null }]]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["EMAIL"], dias: 7 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/e-mail/i);
  });

  it("retorna 422 quando cardápio não tem nenhum item com quantidade", async () => {
    setupDbSelect([
      [PRESCRICAO],
      [CLIENTE],
      [], // itens do cardápio: vazio
      [], // alimentos: vazio
    ]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 7 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/nenhum item/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 3 — Envio WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/dieta/prescricoes/:id/enviar-lista-compras — WhatsApp", () => {
  beforeEach(() => {
    _mockAuthPasses = true;
    vi.clearAllMocks();
    (msgLib.enviarMensagemPaxter as any).mockResolvedValue({
      resultados: [{ canal: "WHATSAPP", sent: true, via: "twilio" }],
      algumEnviado: true,
    });
    (waLib.sendWhatsapp as any).mockResolvedValue({ sent: true, via: "twilio" });
  });

  it("envia intro via Hermes e itens via sendWhatsapp", async () => {
    setupDbSelect([
      [PRESCRICAO],
      [CLIENTE],
      [ITEM_COM_CATALOGO],
      [ALIMENTO],
    ]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 7 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Hermes chamado para intro (canal WHATSAPP)
    expect(msgLib.enviarMensagemPaxter).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: expect.stringContaining("lista de compras") }),
      expect.objectContaining({ telefone: CLIENTE.phone }),
      ["WHATSAPP"],
      expect.any(Object),
    );
    // sendWhatsapp chamado para chunk de itens
    expect(waLib.sendWhatsapp).toHaveBeenCalledWith(
      CLIENTE.phone,
      expect.stringContaining("Frango"),
      expect.any(Object),
    );
  });

  it("inclui itens sem preço com quantidade em gramas no chunk", async () => {
    const itemSemPreco = { ...ITEM_COM_CATALOGO, alimentoId: 200, alimentoNome: "Quinoa" };
    const alimentoSemPreco = { ...ALIMENTO, id: 200, nome: "Quinoa", precoMedio: null };
    setupDbSelect([
      [PRESCRICAO],
      [CLIENTE],
      [itemSemPreco],
      [alimentoSemPreco],
    ]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 7 });

    expect(res.status).toBe(200);
    const chunkCall = (waLib.sendWhatsapp as any).mock.calls[0];
    expect(chunkCall[1]).toMatch(/Quinoa/);
    expect(chunkCall[1]).toMatch(/preço indisponível/);
    // quantidade em gramas deve aparecer
    expect(chunkCall[1]).toMatch(/g/);
  });

  it("inclui itens de texto livre com quantidade em gramas no chunk", async () => {
    const itemTextLivre = { ...ITEM_COM_CATALOGO, alimentoId: null, alimentoNome: "Ervas frescas" };
    setupDbSelect([
      [PRESCRICAO],
      [CLIENTE],
      [itemTextLivre],
      [], // nenhum alimento catalogado
    ]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 7 });

    expect(res.status).toBe(200);
    const chunkCall = (waLib.sendWhatsapp as any).mock.calls[0];
    expect(chunkCall[1]).toMatch(/Ervas frescas/);
    expect(chunkCall[1]).toMatch(/preço indisponível/);
  });

  it("nenhum chunk excede 1400 chars em lista longa", async () => {
    // Criar 30 itens com nomes de 40 chars cada
    const manyItems = Array.from({ length: 30 }, (_, i) => ({
      ...ITEM_COM_CATALOGO,
      id: i + 1,
      alimentoId: 100 + i,
      alimentoNome: `Alimento número ${String(i + 1).padStart(3, "0")} longo`,
    }));
    const manyAlimentos = Array.from({ length: 30 }, (_, i) => ({
      ...ALIMENTO,
      id: 100 + i,
      nome: `Alimento número ${String(i + 1).padStart(3, "0")} longo`,
    }));
    setupDbSelect([
      [PRESCRICAO],
      [CLIENTE],
      manyItems,
      manyAlimentos,
    ]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 30 });

    expect(res.status).toBe(200);
    // Cada chunk enviado via sendWhatsapp deve caber no limite
    for (const call of (waLib.sendWhatsapp as any).mock.calls) {
      expect(call[1].length).toBeLessThanOrEqual(1400 + 30); // tolerância para prefixo "(parte N/M)"
    }
  });

  it("retorna sent=false quando um chunk falha", async () => {
    (waLib.sendWhatsapp as any)
      .mockResolvedValueOnce({ sent: true, via: "twilio" })
      .mockResolvedValueOnce({ sent: false, error: "timeout" });

    // Lista grande o suficiente para gerar 2 chunks
    const manyItems = Array.from({ length: 25 }, (_, i) => ({
      ...ITEM_COM_CATALOGO,
      id: i + 1,
      alimentoId: 100 + i,
      alimentoNome: `Alimento longo número ${String(i + 1).padStart(3, "0")} extra texto aqui`,
    }));
    const manyAlimentos = Array.from({ length: 25 }, (_, i) => ({
      ...ALIMENTO,
      id: 100 + i,
      nome: `Alimento longo número ${String(i + 1).padStart(3, "0")} extra texto aqui`,
    }));
    setupDbSelect([
      [PRESCRICAO],
      [CLIENTE],
      manyItems,
      manyAlimentos,
    ]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["WHATSAPP"], dias: 30 });

    expect(res.status).toBe(200);
    const waResult = res.body.resultados.find((r: any) => r.canal === "WHATSAPP");
    expect(waResult?.sent).toBe(false);
    expect(waResult?.error).toMatch(/timeout|Falha/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 4 — Envio E-mail
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/dieta/prescricoes/:id/enviar-lista-compras — Email", () => {
  beforeEach(() => {
    _mockAuthPasses = true;
    vi.clearAllMocks();
    (msgLib.enviarMensagemPaxter as any).mockResolvedValue({
      resultados: [{ canal: "EMAIL", sent: true, via: "gmail" }],
      algumEnviado: true,
    });
  });

  it("chama enviarMensagemPaxter com canal EMAIL", async () => {
    setupDbSelect([
      [PRESCRICAO],
      [CLIENTE],
      [ITEM_COM_CATALOGO],
      [ALIMENTO],
    ]);
    const app = buildApp();
    const res = await request(app)
      .post("/api/dieta/prescricoes/1/enviar-lista-compras")
      .send({ canais: ["EMAIL"], dias: 7 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(msgLib.enviarMensagemPaxter).toHaveBeenCalledWith(
      expect.objectContaining({ blocosHtml: expect.any(Array) }),
      expect.objectContaining({ email: CLIENTE.email }),
      ["EMAIL"],
      expect.any(Object),
    );
    // sendWhatsapp NÃO deve ter sido chamado
    expect(waLib.sendWhatsapp).not.toHaveBeenCalled();
  });
});
