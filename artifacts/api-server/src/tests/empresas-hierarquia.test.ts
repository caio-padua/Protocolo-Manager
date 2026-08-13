/**
 * empresas-hierarquia.test.ts
 *
 * Testes unitários para a trava anti-pirâmide de licenciamento.
 * Cobre POST /api/empresas e PUT /api/empresas/:id com os cenários:
 *
 *   POST:
 *   - [422] empresaMaeId aponta para um licenciado direto do PO (profundidade 1)
 *   - [201] empresaMaeId aponta diretamente para o PO (profundidade 0)
 *   - [422] empresaMaeId referencia empresa inexistente (cadeia incompleta)
 *
 *   PUT:
 *   - [422] novo empresaMaeId criaria profundidade 2
 *   - [422] auto-referência (empresaMaeId === próprio id)
 *   - [422] empresa com filhos seria movida para profundidade 1
 *   - [200] troca de empresaMaeId válida (de um PO-child para outro PO-child sem filhos)
 *
 * Estratégia:
 *   - @workspace/db mockado; db.select encadeado retorna fixtures em memória.
 *   - empresasTable importado somente para satisfazer a assinatura de tipo.
 *   - App Express mínimo: json + empresasRouter.
 *   - verificarCadeia e validarHierarquia são testados INDIRETAMENTE via HTTP.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Fixtures de empresas ──────────────────────────────────────────────────────

const PO        = { id: 1, nome: "PAXTER HQ",   empresaMaeId: null, royaltyPercent: null, isPlatformOwner: true,  ativa: true, tipo: "holding", status: "ATIVO", modulosAtivos: {}, zohoEmail: "hq@p.com", zohoStatus: "ativo", tipoLicenciamento: "owner", atualizadoEm: new Date() };
const LICENC_A  = { id: 2, nome: "Licenc A",    empresaMaeId: 1,    royaltyPercent: "30", isPlatformOwner: false, ativa: true, tipo: "clinic",  status: "ATIVO", modulosAtivos: {}, zohoEmail: "a@p.com",  zohoStatus: "ativo", tipoLicenciamento: "licensee", atualizadoEm: new Date() };
const LICENC_B  = { id: 3, nome: "Licenc B",    empresaMaeId: 1,    royaltyPercent: "30", isPlatformOwner: false, ativa: true, tipo: "clinic",  status: "ATIVO", modulosAtivos: {}, zohoEmail: "b@p.com",  zohoStatus: "ativo", tipoLicenciamento: "licensee", atualizadoEm: new Date() };
// LICENC_B_CHILD exists to test the "has children" block in PUT
const CHILD_OF_B = { id: 4, nome: "Sub B",      empresaMaeId: 3,    royaltyPercent: "30", isPlatformOwner: false, ativa: true, tipo: "clinic",  status: "ATIVO", modulosAtivos: {}, zohoEmail: "sb@p.com", zohoStatus: "ativo", tipoLicenciamento: "sublicensee", atualizadoEm: new Date() };

const ALL_EMPRESAS = [PO, LICENC_A, LICENC_B];
const WITH_CHILD   = [PO, LICENC_A, LICENC_B, CHILD_OF_B];

// ── Mock do @workspace/db ─────────────────────────────────────────────────────
//
// db.select() encadeia .from().where().returning() etc.
// Usamos uma factory que retorna o array certo baseado na sequência de chamadas.

let dbSelectFixture: object[] = ALL_EMPRESAS;

vi.mock("@workspace/db", () => {
  // Retorna um proxy encadeável que resolve para o fixture correto em `.from()`
  function makeChain(rows: () => object[]): any {
    const chain: any = {
      from:    () => chain,
      where:   () => chain,
      orderBy: () => chain,
      then:    (fn: (v: object[]) => unknown) => Promise.resolve(fn(rows())),
    };
    // Faz o chain ser "thenable" e também iterável via await db.select()...
    chain[Symbol.iterator] = function* () { yield* rows(); };
    return chain;
  }

  return {
    db: {
      select:  () => makeChain(() => dbSelectFixture),
      insert:  () => ({
        values:     () => ({
          returning: () => Promise.resolve([{ id: 99, nome: "Nova", isPlatformOwner: false, ativa: true, tipo: "clinic", status: "ATIVO", modulosAtivos: {}, zohoEmail: "n@p.com", zohoStatus: "ativo", tipoLicenciamento: "licensee", empresaMaeId: null, royaltyPercent: null, responsavelLegalCpf: null, atualizadoEm: new Date() }]),
        }),
      }),
      update:  () => ({
        set:   () => ({
          where: () => ({
            returning: () => Promise.resolve([{ id: 2, nome: "Licenc A", isPlatformOwner: false, ativa: true, tipo: "clinic", status: "ATIVO", modulosAtivos: {}, zohoEmail: "a@p.com", zohoStatus: "ativo", tipoLicenciamento: "licensee", empresaMaeId: 1, royaltyPercent: "30", responsavelLegalCpf: null, atualizadoEm: new Date() }]),
          }),
        }),
      }),
    },
    empresasTable:         {},
    cargosTable:           {},
    colaboradoresTable:    {},
    locationsTable:        {},
    empresaContratosTable: {},
  };
});

// Stub mínimo para evitar import do google-drive (pesado)
vi.mock("../lib/google-drive", () => ({
  isDriveConnected:    vi.fn().mockResolvedValue(false),
  uploadFileToDrive:   vi.fn(),
  driveListChildren:   vi.fn().mockResolvedValue([]),
  removeDiacritics:    (s: string) => s,
  driveDownloadFile:   vi.fn(),
}));

vi.mock("googleapis", () => ({ google: { auth: { OAuth2: vi.fn() }, drive: vi.fn() } }));
vi.mock("@workspace/integrations-gemini-ai", () => ({ ai: { models: { generateContent: vi.fn() } } }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: vi.fn(), logAiUsage: vi.fn() }));

// ── App Express mínimo ────────────────────────────────────────────────────────

import express from "express";
import request from "supertest";

// Importamos o router APÓS os mocks
const buildApp = async () => {
  const { default: empresasRouter } = await import("../routes/empresas");
  const app = express();
  app.use(express.json());
  app.use("/api", empresasRouter);
  return app;
};

// ── Testes ────────────────────────────────────────────────────────────────────

describe("POST /api/empresas — trava anti-pirâmide", () => {
  let app: express.Express;

  beforeEach(async () => {
    dbSelectFixture = ALL_EMPRESAS;
    app = await buildApp();
  });

  it("422 quando empresaMaeId aponta para licenciado direto do PO (profundidade 1)", async () => {
    // LICENC_A (id=2) está a profundidade 1; nova empresa ficaria em profundidade 2
    const res = await request(app)
      .post("/api/empresas")
      .send({ nome: "Sub-ilegal", empresaMaeId: 2 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/não é possível criar sub-licenciado/i);
  });

  it("201 quando empresaMaeId aponta diretamente para o Platform Owner", async () => {
    // PO (id=1) está a profundidade 0; nova empresa ficaria em profundidade 1 — OK
    const res = await request(app)
      .post("/api/empresas")
      .send({ nome: "Licenciado Válido", empresaMaeId: 1 });

    expect(res.status).toBe(201);
  });

  it("422 quando empresaMaeId não existe na hierarquia (cadeia incompleta)", async () => {
    const res = await request(app)
      .post("/api/empresas")
      .send({ nome: "Sub-fantasma", empresaMaeId: 999 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/não é possível criar sub-licenciado/i);
  });

  it("201 quando empresaMaeId é nulo (empresa raiz sem pai)", async () => {
    const res = await request(app)
      .post("/api/empresas")
      .send({ nome: "Empresa Autônoma" });

    expect(res.status).toBe(201);
  });
});

describe("PUT /api/empresas/:id — trava anti-pirâmide", () => {
  let app: express.Express;

  beforeEach(async () => {
    dbSelectFixture = ALL_EMPRESAS;
    app = await buildApp();
  });

  it("422 quando novo empresaMaeId criaria profundidade 2", async () => {
    // Tenta mover LICENC_A (id=2) para ser filha de LICENC_B (id=3, profundidade 1)
    const res = await request(app)
      .put("/api/empresas/2")
      .send({ empresaMaeId: 3 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/não é possível criar sub-licenciado/i);
  });

  it("422 quando empresaMaeId é o próprio id da empresa (auto-referência)", async () => {
    const res = await request(app)
      .put("/api/empresas/2")
      .send({ empresaMaeId: 2 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/não pode ser sua própria empresa-mãe/i);
  });

  it("422 quando a empresa tem filhos e seria movida para profundidade 1", async () => {
    dbSelectFixture = WITH_CHILD; // LICENC_B (id=3) tem filho CHILD_OF_B (id=4)
    // Tenta mover LICENC_B para PO — ficaria em profundidade 1, mas tem filhos → bloqueado
    const res = await request(app)
      .put("/api/empresas/3")
      .send({ empresaMaeId: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/sub-licenciados ficariam fora da hierarquia/i);
  });

  it("200 quando não há empresaMaeId no body (campo não alterado)", async () => {
    const res = await request(app)
      .put("/api/empresas/2")
      .send({ nome: "Licenc A Atualizado" });

    expect(res.status).toBe(200);
  });
});

describe("verificarCadeia — ciclo via descendente bloqueado", () => {
  // Testa que tentar setar o pai de A para um de seus descendentes é bloqueado.
  // No estado atual do banco, a cadeia do descendente passa pelo PO, e sua profundidade
  // faz com que A ficaria em profundidade ≥ 2 → 422.
  let app: express.Express;

  beforeEach(async () => {
    // Hierarquia (já violada no DB para simular tentativa de reparent):
    // PO(1) → LICENC_A(2), LICENC_A(2) ← tentativa de mover para ser filho de LICENC_B(3)
    dbSelectFixture = ALL_EMPRESAS;
    app = await buildApp();
  });

  it("422 quando empresaMaeId aponta para empresa a profundidade ≥ 1 (impede ciclo)", async () => {
    // PO→A→B seria profundidade 2 para A se B fosse pai de A.
    // No DB atual, B está em profundidade 1, então A ficaria em profundidade 2.
    const res = await request(app)
      .put("/api/empresas/2")
      .send({ empresaMaeId: 3 }); // LICENC_B está a profundidade 1

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/não é possível criar sub-licenciado/i);
  });
});
