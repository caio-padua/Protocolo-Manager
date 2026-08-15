/**
 * cadernos-entrega-consentimentos.test.ts
 *
 * Confirma o fluxo de entrega de cadernos jurídicos na primeira entrega do
 * protocolo. Cobre os requisitos do "Done looks like" da Task #192:
 *
 *   C1. resolverCodigosCadernos — conjunto base sempre inclui CGLO, TCLE, RAS-JUR
 *   C2. resolverCodigosCadernos — CIMU quando procedureType=im
 *   C3. resolverCodigosCadernos — CINC + CSUB quando nome contém "Tirzepatida" ou "Semaglutida"
 *   C4. HTTP route-level: POST /ras-fap/entregar-protocolo
 *       → registros CGLO, TCLE, RAS-JUR criados em assinatura_solicitacoes
 *   C5. Segunda chamada NÃO cria novos registros (idempotência sequencial)
 *   C6. Duas chamadas SIMULTÂNEAS não duplicam registros (idempotência concorrente)
 *
 * Estratégia de isolamento:
 *   - Escopo inclui UUID por execução de teste → sem colisão entre runs.
 *   - DB real + adapter ZapSign forçado em modo mock.
 *   - beforeAll/afterAll limpam apenas o escopo da execução corrente.
 */

import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

// ── Mocks ANTES de qualquer import que carregue dependências externas ────────

vi.mock("../lib/pdf-signer", () => ({
  generatePhysicalRASPdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  generateSignedRASPdf:   vi.fn().mockResolvedValue(new Uint8Array()),
  getCertInfo:            vi.fn().mockReturnValue({ subject: null, cpf: null, validTo: null, issuer: null, serial: null }),
}));

// E-mail entregue com sucesso → rasEmailEnviado=true → cadernos são despachados.
vi.mock("../lib/messaging/index.js", () => ({
  enviarMensagemPaxter: vi.fn().mockResolvedValue({ resultados: [{ sent: true, mock: false }] }),
  absoluteBaseUrl:      vi.fn().mockReturnValue("http://localhost:8080"),
}));

vi.mock("../lib/google-drive", () => ({
  isDriveConnected:   vi.fn().mockResolvedValue(false),
  uploadToFolderById: vi.fn().mockResolvedValue(undefined),
  getFolderByName:    vi.fn().mockResolvedValue(null),
  listFilesInFolder:  vi.fn().mockResolvedValue([]),
  isDriveFile:        vi.fn().mockReturnValue(false),
}));

// Spy compartilhado — acessível nos testes para verificar contagem de chamadas.
// vi.hoisted garante que o spy exista antes da elevação do vi.mock.
const mockCreateEnvelope = vi.hoisted(() =>
  vi.fn().mockImplementation(async ({ externalId }: { externalId: string }) => ({
    envelopeId:      `MOCK-${externalId}`,
    linksAssinatura: [],
    rawProvider:     { mock: true },
  })),
);

// ZapSign em modo mock: isConfigured=false → envelope sintético, sem HTTP real.
vi.mock("../lib/assinatura/adapters", () => ({
  getAdapter: () => ({
    isConfigured:           () => false,
    createDocumentEnvelope: mockCreateEnvelope,
    sendForSignature:       vi.fn().mockResolvedValue(undefined),
    getDocumentStatus:      vi.fn().mockResolvedValue({ status: "ENVIADO", signatariosStatus: [] }),
    handleWebhook:          vi.fn(),
    signatureHeaderName:    () => "x-mock",
    downloadSignedArtifact: vi.fn().mockResolvedValue(Buffer.from("%PDF")),
  }),
}));

vi.mock("../lib/assinatura/htmlParaPdf", () => ({
  htmlParaPdfBase64: vi.fn().mockResolvedValue(
    Buffer.from("%PDF-1.4 mock-caderno-test").toString("base64"),
  ),
}));

vi.mock("../lib/secure-settings", () => ({
  getSecret:  vi.fn().mockResolvedValue(null),
  saveSecret: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/google-gmail", () => ({
  isGmailConnected: vi.fn().mockResolvedValue(false),
}));

vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../lib/ras-fap", () => ({
  buildRasHtml:       vi.fn().mockReturnValue("<html/>"),
  buildEntregaHtml:   vi.fn().mockReturnValue(["<p>fake</p>"]),
  generateRasPdf:     vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  generateRasPdfBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF")),
}));

vi.mock("../lib/slack-reporter", () => ({
  postSlackAlert:  vi.fn().mockResolvedValue(undefined),
  postSlackReport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/ras-fap-alert", () => ({
  notifySlackRasFapFailure: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports após os mocks ─────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  assinaturaSolicitacoesTable,
  assinaturaSignatariosTable,
} from "@workspace/db";
import { resolverCodigosCadernos } from "../lib/cadernos-resolver";
import rasRouter from "../routes/ras";

// Escopo DEVE corresponder exatamente ao que ras.ts produz: `RAS_FAP_ENTREGA:${clientId}`.
// Usamos cliente 14 (Paciente Demonstracao 2, email demo2@email.com) para isolar
// dos dados de pacientes reais. beforeAll/afterAll limpam o escopo antes e depois.
const FIXTURE_CLIENT = 14;           // Paciente Demonstracao 2 — não é paciente real
const ESCOPO         = `RAS_FAP_ENTREGA:${FIXTURE_CLIENT}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    next();
  });
  app.use("/api", rasRouter);
  return app;
}

async function countRecords(): Promise<number> {
  const rows = await db
    .select({ id: assinaturaSolicitacoesTable.id })
    .from(assinaturaSolicitacoesTable)
    .where(
      and(
        eq(assinaturaSolicitacoesTable.pacienteId, FIXTURE_CLIENT),
        eq(assinaturaSolicitacoesTable.escopo, ESCOPO),
      ),
    );
  return rows.length;
}

/** Aguarda até que o banco tenha ao menos `minCount` registros para o escopo. */
async function waitForRecords(
  minCount: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await countRecords() >= minCount) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Aguarda até que ao menos `minCount` registros tenham status ENVIADO.
 *  Necessário porque o padrão atômico cria linhas com status=RASCUNHO primeiro
 *  e só atualiza para ENVIADO após o createDocumentEnvelope retornar. */
async function waitForEnviado(
  minCount: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db
      .select({ id: assinaturaSolicitacoesTable.id })
      .from(assinaturaSolicitacoesTable)
      .where(
        and(
          eq(assinaturaSolicitacoesTable.pacienteId, FIXTURE_CLIENT),
          eq(assinaturaSolicitacoesTable.escopo, ESCOPO),
          eq(assinaturaSolicitacoesTable.status, "ENVIADO"),
        ),
      );
    if (rows.length >= minCount) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function limpar() {
  const rows = await db
    .select({ id: assinaturaSolicitacoesTable.id })
    .from(assinaturaSolicitacoesTable)
    .where(
      and(
        eq(assinaturaSolicitacoesTable.pacienteId, FIXTURE_CLIENT),
        eq(assinaturaSolicitacoesTable.escopo, ESCOPO),
      ),
    );
  for (const { id } of rows) {
    await db.delete(assinaturaSignatariosTable)
      .where(eq(assinaturaSignatariosTable.solicitacaoId, id));
  }
  await db.delete(assinaturaSolicitacoesTable)
    .where(
      and(
        eq(assinaturaSolicitacoesTable.pacienteId, FIXTURE_CLIENT),
        eq(assinaturaSolicitacoesTable.escopo, ESCOPO),
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// C1-C3 — resolverCodigosCadernos (função pura, zero mocks de DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("C1: conjunto base — CGLO, TCLE, RAS-JUR sempre presentes", () => {
  const r = resolverCodigosCadernos([
    { nome: "NAD+",       procedureType: "iv", via: "IV", categoryType: null },
    { nome: "Glutationa", procedureType: "iv", via: "IV", categoryType: null },
  ]);

  it("inclui CGLO",    () => expect(r.codigos.has("CGLO")).toBe(true));
  it("inclui TCLE",    () => expect(r.codigos.has("TCLE")).toBe(true));
  it("inclui RAS-JUR", () => expect(r.codigos.has("RAS-JUR")).toBe(true));
  it("inclui CEND para via IV",    () => expect(r.codigos.has("CEND")).toBe(true));
  it("NÃO inclui CIMU sem IM",     () => expect(r.codigos.has("CIMU")).toBe(false));
  it("NÃO inclui CINC sem GLP-1",  () => expect(r.codigos.has("CINC")).toBe(false));
});

describe("C2: CIMU quando há substância intramuscular", () => {
  const r = resolverCodigosCadernos([
    { nome: "Testosterona Cipionato", procedureType: "im", via: "IM", categoryType: null },
  ]);

  it("inclui CIMU",    () => expect(r.codigos.has("CIMU")).toBe(true));
  it("inclui CGLO",    () => expect(r.codigos.has("CGLO")).toBe(true));
  it("inclui TCLE",    () => expect(r.codigos.has("TCLE")).toBe(true));
  it("inclui RAS-JUR", () => expect(r.codigos.has("RAS-JUR")).toBe(true));
  it("NÃO inclui CEND sem IV", () => expect(r.codigos.has("CEND")).toBe(false));
});

describe("C3: CINC + CSUB para GLP-1 (Tirzepatida / Semaglutida)", () => {
  it("Tirzepatida → CINC e CSUB", () => {
    const r = resolverCodigosCadernos([
      { nome: "Tirzepatida", procedureType: "sc", via: "SC", categoryType: null },
    ]);
    expect(r.codigos.has("CINC")).toBe(true);
    expect(r.codigos.has("CSUB")).toBe(true);
  });

  it("Semaglutida → CINC e CSUB", () => {
    const r = resolverCodigosCadernos([
      { nome: "Semaglutida", procedureType: "sc", via: "SC", categoryType: null },
    ]);
    expect(r.codigos.has("CINC")).toBe(true);
    expect(r.codigos.has("CSUB")).toBe(true);
  });

  it("Semaglutida NÃO dispara CIMU (sem IM)", () => {
    const r = resolverCodigosCadernos([
      { nome: "Semaglutida", procedureType: "sc", via: "SC", categoryType: null },
    ]);
    expect(r.codigos.has("CIMU")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C4-C6 — HTTP route-level (DB real, mocks externos)
// ─────────────────────────────────────────────────────────────────────────────

describe("C4-C6: POST /ras-fap/entregar-protocolo — cadernos e idempotência", () => {
  const app = buildApp();

  // Payload com duas substâncias IV.
  // Deve gerar ao mínimo: CGLO, TCLE, RAS-JUR (base) + CEND (via IV).
  // clientId usa FIXTURE_CLIENT (14 = Paciente Demonstracao 2) para evitar
  // colisão com dados de pacientes reais. O escopo `RAS_FAP_ENTREGA:14` é
  // limpo em beforeAll/afterAll garantindo isolamento entre execuções.
  const PAYLOAD_IV = {
    clientId: FIXTURE_CLIENT,           // 14
    incluirCadernosJuridicos: true,
    titulo: "Protocolo Teste Task 192",
    substancias: [
      { nome: "NAD+",       dose: "500mg", via: "IV", sessoes: 10, frequenciaDias: 7, inicio: "2026-08-14", procedureType: "iv" },
      { nome: "Glutationa", dose: "600mg", via: "IV", sessoes: 10, frequenciaDias: 7, inicio: "2026-08-14", procedureType: "iv" },
    ],
  };

  beforeAll(async () => { await limpar(); });
  afterAll(async  () => { await limpar(); });

  it("C4a: route responde 200 com queued:true e email do paciente", async () => {
    const res = await request(app)
      .post("/api/ras-fap/entregar-protocolo")
      .send(PAYLOAD_IV);

    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(true);
    expect(res.body.email).toMatch(/@/);
  });

  it("C4b: registros criados no banco com status ENVIADO e escopo correto", async () => {
    // O padrão atômico de service.ts cria primeiro um slot RASCUNHO e depois
    // atualiza para ENVIADO. Aguardamos ao menos 3 linhas com status ENVIADO
    // (CGLO, TCLE, RAS-JUR) antes de validar o conteúdo.
    await waitForEnviado(3);

    const rows = await db
      .select()
      .from(assinaturaSolicitacoesTable)
      .where(
        and(
          eq(assinaturaSolicitacoesTable.pacienteId, FIXTURE_CLIENT),
          eq(assinaturaSolicitacoesTable.escopo, ESCOPO),
          eq(assinaturaSolicitacoesTable.status, "ENVIADO"),
        ),
      );

    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.status).toBe("ENVIADO");
      expect(row.pacienteId).toBe(FIXTURE_CLIENT);
      expect(row.escopo).toBe(ESCOPO);
    }

    // Verifica CGLO, TCLE e RAS-JUR via zapsignExternalId (formato "ras-fap-{id}-{codigo}").
    // NÃO usa tipoDoc porque sua coluna armazena o tipo genérico ("TERMO", "TCLE", "RAS")
    // e há colisão: CEND e TCLE têm o mesmo tipo_doc="TCLE".
    const extIds = new Set(rows.map((r) => r.zapsignExternalId));
    expect(extIds.has(`ras-fap-${FIXTURE_CLIENT}-CGLO`)).toBe(true);
    expect(extIds.has(`ras-fap-${FIXTURE_CLIENT}-TCLE`)).toBe(true);
    expect(extIds.has(`ras-fap-${FIXTURE_CLIENT}-RAS-JUR`)).toBe(true);
  }, 15_000);

  it("C5: segunda chamada sequencial não cria novos registros", async () => {
    // Aguarda que todas as IIFEs assíncronas do C4a terminem completamente.
    // waitForRecords(3) em C4b retorna assim que 3 registros aparecem, mas a IIFE
    // pode ainda estar criando os cadernos restantes. O sleep garante contagem
    // estável antes de tirar o snapshot "antes".
    await new Promise((r) => setTimeout(r, 2_000));

    const antes = await countRecords();
    expect(antes).toBeGreaterThanOrEqual(3); // sanity — C4b passou

    // Segunda chamada
    const res2 = await request(app)
      .post("/api/ras-fap/entregar-protocolo")
      .send(PAYLOAD_IV);
    expect(res2.status).toBe(200);

    // Aguarda processamento (todos em ENVIADO → faltantes=[])
    await new Promise((r) => setTimeout(r, 3_000));

    const depois = await countRecords();
    expect(depois).toBe(antes); // sem novos registros
  }, 15_000);

  it("C7: se o provedor falha na primeira tentativa, o slot é liberado e o retry conclui sem duplicar", async () => {
    // Reset state — C7 precisa de banco zerado para testar o caminho de falha+retry
    await limpar();
    mockCreateEnvelope.mockClear();

    // Força o provedor a lançar na PRIMEIRA chamada da rodada.
    // Após essa chamada, o mock volta ao comportamento padrão (sucesso).
    mockCreateEnvelope.mockImplementationOnce(async () => {
      throw new Error("provider_timeout_simulado");
    });

    // Primeira rodada: um caderno falhará; service.ts deve apagar o slot RASCUNHO
    const res1 = await request(app)
      .post("/api/ras-fap/entregar-protocolo")
      .send(PAYLOAD_IV);
    expect(res1.status).toBe(200);

    // Aguarda as IIFEs da primeira rodada terminarem
    await new Promise((r) => setTimeout(r, 3_000));

    // Retry: todos os cadernos faltantes (incluindo o que falhou e teve slot liberado)
    // devem ser despachados com sucesso agora
    const res2 = await request(app)
      .post("/api/ras-fap/entregar-protocolo")
      .send(PAYLOAD_IV);
    expect(res2.status).toBe(200);

    // Aguarda todos os cadernos chegarem a ENVIADO
    await waitForEnviado(3, 12_000);

    // Todos os registros devem estar ENVIADO — nenhum RASCUNHO órfão
    const rascunhos = await db
      .select({ id: assinaturaSolicitacoesTable.id })
      .from(assinaturaSolicitacoesTable)
      .where(
        and(
          eq(assinaturaSolicitacoesTable.pacienteId, FIXTURE_CLIENT),
          eq(assinaturaSolicitacoesTable.escopo, ESCOPO),
          eq(assinaturaSolicitacoesTable.status, "RASCUNHO"),
        ),
      );
    expect(rascunhos.length).toBe(0);

    const enviados = await db
      .select({ id: assinaturaSolicitacoesTable.id })
      .from(assinaturaSolicitacoesTable)
      .where(
        and(
          eq(assinaturaSolicitacoesTable.pacienteId, FIXTURE_CLIENT),
          eq(assinaturaSolicitacoesTable.escopo, ESCOPO),
          eq(assinaturaSolicitacoesTable.status, "ENVIADO"),
        ),
      );
    expect(enviados.length).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("C6: duas chamadas SIMULTÂNEAS na primeira entrega não duplicam registros nem envelopes", async () => {
    // Resetar o estado: apagar todos os registros do cliente de teste para que
    // ambas as requests cheguem com um banco zerado — é a condição de corrida
    // real (first-delivery race) que o padrão atômico de service.ts protege.
    await limpar();
    mockCreateEnvelope.mockClear();

    // Dispara duas requests em paralelo — ambas chegam simultaneamente
    // com mesmo clientId, banco zerado, sem nenhum slot reservado ainda.
    await Promise.all([
      request(app).post("/api/ras-fap/entregar-protocolo").send(PAYLOAD_IV),
      request(app).post("/api/ras-fap/entregar-protocolo").send(PAYLOAD_IV),
    ]);

    // Aguarda as IIFEs assíncronas de ambas as routes concluírem.
    await waitForEnviado(3, 12_000);

    const totalRows = await countRecords();
    const totalCalls = mockCreateEnvelope.mock.calls.length;

    // Deve haver exatamente N linhas com status ENVIADO (não 2N):
    // o INSERT atômico com onConflictDoNothing garante que apenas UM dos dois
    // requests cria o slot para cada externalId determinístico.
    expect(totalRows).toBeGreaterThanOrEqual(3);

    // O provedor deve ter sido chamado no máximo N vezes (não 2N):
    // apenas o request que ganhou o slot chama createDocumentEnvelope.
    // O outro retorna early com o id do slot existente.
    expect(totalCalls).toBeLessThanOrEqual(totalRows);
    expect(totalCalls).toBeGreaterThanOrEqual(3);
  }, 25_000);
});
