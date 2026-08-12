/**
 * concierge-admin-routes.test.ts
 *
 * Testes HTTP das rotas CEO de penalidades do Concierge:
 *   GET  /api/admin/concierge-penalidade          — lista penalidades
 *   PATCH /api/admin/concierge-penalidade/:cpf    — zera tentativas e desbloqueio
 *
 * Cobre:
 *   - GET: 200 + ok=true + rows, bloqueado=true no row
 *   - GET: filtro ?cpf= repassado para a lib
 *   - GET: lista vazia
 *   - GET: 500 quando a lib lança exceção
 *   - PATCH: 200 + resetou=true quando CPF existe
 *   - PATCH: 200 + resetou=false quando CPF não existe
 *   - PATCH: 400 quando CPF tem menos de 11 dígitos
 *   - PATCH: 500 quando a lib lança exceção
 *   - Ciclo completo STATEFUL: registrarFalha×3 → GET (bloqueado) → PATCH reset → GET (limpo)
 *
 * Estratégia:
 *   - @workspace/db mockado para evitar conexão real.
 *   - lib/concierge-penalidade inteira mockada.
 *   - Ciclo completo usa um store em memória compartilhado entre os mocks de
 *     registrarFalha / listPenalidades / resetarPenalidade para demonstrar
 *     que o PATCH muda o estado que o GET subsequente efetivamente devolve.
 *   - App Express mínimo: json + tenantContextMiddleware + conciergeAdminRouter.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ANTES dos imports das rotas ────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn() },
}));

vi.mock("../lib/concierge-penalidade", () => ({
  listPenalidades:     vi.fn(),
  resetarPenalidade:   vi.fn(),
  getPenalidade:       vi.fn(),
  registrarFalha:      vi.fn(),
  listAuditoriaResets: vi.fn(),
}));

// ── Imports APÓS os mocks ────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import conciergeAdminRouter from "../routes/concierge-admin";
import * as penLib from "../lib/concierge-penalidade";

// ── App de teste ─────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantContextMiddleware); // injeta isPlatformOwner=true (single-tenant)
  app.use("/api", conciergeAdminRouter);
  return app;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CPF_VALIDO = "12345678901";

const ROW_BLOQUEADO: import("../lib/concierge-penalidade").PenalidadeRow = {
  cpf_mascarado:        "123.***.***-01",
  tentativas_falha:     3,
  bloqueado_permanente: true,
  ultima_falha_at:      "2026-08-12T10:00:00.000Z",
  criado_at:            "2026-08-01T00:00:00.000Z",
  atualizado_at:        "2026-08-12T10:00:00.000Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/concierge-penalidade
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/concierge-penalidade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("HTTP 200 + ok=true + row com bloqueado_permanente=true e tentativas=3", async () => {
    vi.mocked(penLib.listPenalidades).mockResolvedValue([ROW_BLOQUEADO]);

    const res = await request(buildApp()).get("/api/admin/concierge-penalidade");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].bloqueado_permanente).toBe(true);
    expect(res.body.rows[0].tentativas_falha).toBe(3);
  });

  it("passa filtro ?cpf= para listPenalidades", async () => {
    vi.mocked(penLib.listPenalidades).mockResolvedValue([]);

    await request(buildApp()).get("/api/admin/concierge-penalidade?cpf=123");

    expect(penLib.listPenalidades).toHaveBeenCalledWith("123");
  });

  it("chama listPenalidades sem filtro quando ?cpf= ausente", async () => {
    vi.mocked(penLib.listPenalidades).mockResolvedValue([]);

    await request(buildApp()).get("/api/admin/concierge-penalidade");

    expect(penLib.listPenalidades).toHaveBeenCalledWith(undefined);
  });

  it("HTTP 200 + rows=[] + total=0 quando tabela está limpa", async () => {
    vi.mocked(penLib.listPenalidades).mockResolvedValue([]);

    const res = await request(buildApp()).get("/api/admin/concierge-penalidade");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBe(0);
    expect(res.body.rows).toEqual([]);
  });

  it("HTTP 500 + ok=false quando a lib lança exceção", async () => {
    vi.mocked(penLib.listPenalidades).mockRejectedValue(new Error("DB offline"));

    const res = await request(buildApp()).get("/api/admin/concierge-penalidade");

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/DB offline/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/concierge-penalidade/:cpf
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/concierge-penalidade/:cpf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("HTTP 200 + resetou=true quando CPF existe na tabela", async () => {
    vi.mocked(penLib.resetarPenalidade).mockResolvedValue(true);

    const res = await request(buildApp())
      .patch(`/api/admin/concierge-penalidade/${CPF_VALIDO}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resetou).toBe(true);
    expect(penLib.resetarPenalidade).toHaveBeenCalledWith(CPF_VALIDO, "CEO");
  });

  it("HTTP 200 + resetou=false + mensagem 'não encontrado' quando CPF não existe", async () => {
    vi.mocked(penLib.resetarPenalidade).mockResolvedValue(false);

    const res = await request(buildApp())
      .patch("/api/admin/concierge-penalidade/99999999999");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resetou).toBe(false);
    expect(res.body.message).toMatch(/não encontrado/i);
  });

  it("HTTP 400 + ok=false quando CPF tem menos de 11 dígitos", async () => {
    const res = await request(buildApp())
      .patch("/api/admin/concierge-penalidade/123");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/inválido/i);
    expect(penLib.resetarPenalidade).not.toHaveBeenCalled();
  });

  it("HTTP 400 quando CPF tem 1 dígito", async () => {
    const res = await request(buildApp())
      .patch("/api/admin/concierge-penalidade/1");

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("HTTP 500 + ok=false quando a lib lança exceção", async () => {
    vi.mocked(penLib.resetarPenalidade).mockRejectedValue(new Error("Falha crítica no DB"));

    const res = await request(buildApp())
      .patch(`/api/admin/concierge-penalidade/${CPF_VALIDO}`);

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/Falha crítica/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo completo STATEFUL:
//   registrarFalha×3 → GET (bloqueado) → PATCH reset → GET (limpo)
//
// Um store em memória (Map<cpf, row>) é compartilhado pelos mocks de
// registrarFalha, listPenalidades e resetarPenalidade.  Assim o PATCH
// efetivamente muda o estado que o GET subsequente devolve — verificando o
// ciclo ponta a ponta sem depender de retornos enfileirados independentes.
// ─────────────────────────────────────────────────────────────────────────────

describe("Ciclo completo STATEFUL — registrarFalha×3 → listar → reset → listar", () => {
  it("CEO vê bloqueio após 3 falhas, reseta, e a listagem reflete imediatamente", async () => {
    // ── Store em memória compartilhado pelos mocks ───────────────────────────
    type StoredRow = import("../lib/concierge-penalidade").PenalidadeRow;
    const store = new Map<string, StoredRow>();

    const LIMITE = 3;

    // registrarFalha: insere ou incrementa tentativas no store
    vi.mocked(penLib.registrarFalha).mockImplementation(async (rawCpf) => {
      const cpf = String(rawCpf ?? "").replace(/\D/g, "");
      if (cpf.length < 11) return;
      const existing = store.get(cpf);
      const tentativas = (existing?.tentativas_falha ?? 0) + 1;
      store.set(cpf, {
        cpf_mascarado:        cpf.slice(0, 3) + ".***.***-" + cpf.slice(-2),
        tentativas_falha:     tentativas,
        bloqueado_permanente: tentativas >= LIMITE,
        ultima_falha_at:      new Date().toISOString(),
        criado_at:            existing?.criado_at ?? new Date().toISOString(),
        atualizado_at:        new Date().toISOString(),
      });
    });

    // resetarPenalidade: zera o registro no store
    vi.mocked(penLib.resetarPenalidade).mockImplementation(async (rawCpf) => {
      const cpf = String(rawCpf ?? "").replace(/\D/g, "");
      if (!store.has(cpf)) return false;
      const existing = store.get(cpf)!;
      store.set(cpf, {
        ...existing,
        tentativas_falha:     0,
        bloqueado_permanente: false,
        ultima_falha_at:      null,
        atualizado_at:        new Date().toISOString(),
      });
      return true;
    });

    // listPenalidades: lê do store, excluindo registros já zerados
    // (espelha o filtro WHERE tentativas_falha > 0 OR bloqueado_permanente = TRUE da lib real)
    vi.mocked(penLib.listPenalidades).mockImplementation(async () =>
      Array.from(store.values()).filter(
        (r) => r.tentativas_falha > 0 || r.bloqueado_permanente,
      ),
    );

    const app = buildApp();

    // ── Passo 1: simular 3 falhas de pagamento para o CPF_VALIDO ─────────────
    await penLib.registrarFalha(CPF_VALIDO);
    await penLib.registrarFalha(CPF_VALIDO);
    await penLib.registrarFalha(CPF_VALIDO);

    // ── Passo 2: CEO lista penalidades — deve ver o cliente bloqueado ─────────
    const lista1 = await request(app).get("/api/admin/concierge-penalidade");

    expect(lista1.status).toBe(200);
    expect(lista1.body.ok).toBe(true);
    expect(lista1.body.total).toBe(1);
    const row1 = lista1.body.rows[0];
    expect(row1.tentativas_falha).toBe(3);
    expect(row1.bloqueado_permanente).toBe(true);

    // ── Passo 3: CEO aciona PATCH para resetar o CPF ─────────────────────────
    const patch = await request(app)
      .patch(`/api/admin/concierge-penalidade/${CPF_VALIDO}`);

    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);
    expect(patch.body.resetou).toBe(true);

    // ── Passo 4: CEO relista — linha zerada NÃO aparece (filtro da lib) ────────
    const lista2 = await request(app).get("/api/admin/concierge-penalidade");

    expect(lista2.status).toBe(200);
    expect(lista2.body.total).toBe(0);
    expect(lista2.body.rows).toEqual([]);
  });
});
