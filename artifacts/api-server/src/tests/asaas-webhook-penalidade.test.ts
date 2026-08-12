/**
 * asaas-webhook-penalidade.test.ts
 *
 * Confirma que o webhook do Asaas chama registrarFalha() quando o pagamento
 * de uma solicitação concierge expira (PAYMENT_OVERDUE) ou é cancelado
 * (PAYMENT_DELETED), e que NÃO chama em PAYMENT_RECEIVED.
 *
 * Cenários cobertos:
 *  1. PAYMENT_OVERDUE de um sreq concierge → registrarFalha() chamado com CPF correto
 *  2. PAYMENT_DELETED de um sreq concierge → registrarFalha() chamado com CPF correto
 *  3. PAYMENT_RECEIVED                     → registrarFalha() NÃO é chamado
 *  4. PAYMENT_OVERDUE de sreq com path≠concierge → registrarFalha() NÃO é chamado
 *  5. PAYMENT_OVERDUE onde só paymentsTable tem linha (sem sreq) → registrarFalha() NÃO chamado
 *  6. PAYMENT_REFUNDED de um sreq concierge → registrarFalha() chamado
 *  7. Token inválido no header             → 401, registrarFalha() NÃO chamado
 *  8. PAYMENT_OVERDUE com ambas as tabelas tendo linha → registrarFalha() chamado uma vez
 *  9. Payload sem payment.id               → 200 ignorado, registrarFalha() NÃO chamado
 * 10. PAYMENT_CHARGEBACK_REQUESTED de sreq concierge → registrarFalha() chamado
 * 11. PAYMENT_CHARGEBACK_REQUESTED de sreq com path≠concierge → registrarFalha() NÃO chamado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoist mocks antes de qualquer import sujeito a vi.mock ───────────────────
const {
  mockDbSelect,
  mockDbUpdate,
  mockRegistrarFalha,
  mockGetSecret,
  mockFinalizeConcierge,
} = vi.hoisted(() => ({
  mockDbSelect:        vi.fn(),
  mockDbUpdate:        vi.fn(),
  mockRegistrarFalha:  vi.fn().mockResolvedValue(undefined),
  mockGetSecret:       vi.fn(),
  mockFinalizeConcierge: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock @workspace/db ───────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  paymentsTable:          { asaasChargeId: "asaasChargeId", id: "id", status: "status" },
  schedulingRequestsTable:{ asaasChargeId: "asaasChargeId", id: "id" },
  bankAccountsTable:      {},
  clientsTable:           {},
  collaboratorAuditTable: {},
  professionalsTable:     {},
}));

// ── Mock drizzle-orm ─────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq:   vi.fn((_col: unknown, _val: unknown) => "eq-expr"),
  desc: vi.fn(() => "desc-expr"),
  sql:  vi.fn(() => "sql-expr"),
}));

// ── Mock secure-settings ─────────────────────────────────────────────────────
vi.mock("../lib/secure-settings.js", () => ({
  getSecret: (...args: unknown[]) => mockGetSecret(...args),
  getSetting: vi.fn().mockResolvedValue(null),
}));

// ── Mock concierge-penalidade ────────────────────────────────────────────────
vi.mock("../lib/concierge-penalidade.js", () => ({
  registrarFalha: (...args: unknown[]) => mockRegistrarFalha(...args),
  getPenalidade:  vi.fn().mockResolvedValue({ bloqueado: false, penalidade_dias: 0, tentativas: 0 }),
}));

// ── Mock concierge-finalize ──────────────────────────────────────────────────
vi.mock("../lib/concierge-finalize.js", () => ({
  finalizeConciergeBooking: (...args: unknown[]) => mockFinalizeConcierge(...args),
}));

// ── Mock dos módulos de mensageria (não usados pelo webhook, mas importados) ─
vi.mock("../lib/messaging/index.js", () => ({
  enviarMensagemPaxter: vi.fn().mockResolvedValue({ resultados: [] }),
  absoluteBaseUrl:      vi.fn().mockReturnValue("http://localhost"),
}));

vi.mock("../lib/cobranca-mensagem.js", () => ({
  montarAssuntoCobranca: vi.fn().mockReturnValue("Cobrança"),
  formatBRL:             vi.fn((v: number) => String(v)),
  formatDataBR:          vi.fn((v: string) => v),
}));

vi.mock("../lib/asaas.js", () => ({
  asaasCreateCustomer:       vi.fn(),
  asaasCreateCharge:         vi.fn(),
  asaasCreateInvoice:        vi.fn(),
  asaasListMunicipalServices: vi.fn(),
  asaasCreateTransfer:       vi.fn(),
  asaasListTransfers:        vi.fn(),
}));

// requireCollaborator: em rotas não protegidas (webhook é público), o guard
// não roda. Mas o módulo é importado pelo router, então precisamos do mock.
vi.mock("./collaborator.js", () => ({
  requireCollaborator: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Import do router após todos os mocks ─────────────────────────────────────
import asaasRouter from "../routes/asaas.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de fixture
// ─────────────────────────────────────────────────────────────────────────────
const WEBHOOK_TOKEN  = "test-webhook-secret";
const CHARGE_ID      = "pay_abc123";
const PATIENT_CPF    = "12345678901";

/** Scheduling request concierge válido (path + entrada corretos). */
const SREQ_CONCIERGE = {
  id:            99,
  asaasChargeId: CHARGE_ID,
  path:          "concierge",
  entrada:       "dr_caio",
  patientCpf:    PATIENT_CPF,
  paymentStatus: "pendente",
  paidAt:        null,
  finalizedAt:   null,
};

/** Scheduling request com path diferente (não concierge). */
const SREQ_NORMAL = {
  ...SREQ_CONCIERGE,
  id:    98,
  path:  "normal",
  entrada: "padrao",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Monta app Express mínimo com o router do Asaas. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).log = {
      error: vi.fn(), info: vi.fn(), warn: vi.fn(),
      debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
      child: vi.fn().mockReturnThis(), silent: vi.fn(), level: "info",
    };
    next();
  });
  app.use(asaasRouter);
  return app;
}

/**
 * Configura o mockDbSelect para devolver:
 *   - primeira chamada (paymentsTable): paymentRow
 *   - segunda chamada (schedulingRequestsTable): sreqRow
 */
function setupSelectMocks(paymentRow: object | null, sreqRow: object | null) {
  let callIndex = 0;
  const responses = [
    paymentRow ? [paymentRow] : [],
    sreqRow    ? [sreqRow]    : [],
  ];

  // db.select() → { from: fn }
  mockDbSelect.mockImplementation(() => ({
    from: (_table: unknown) => ({
      where: (_expr: unknown) => Promise.resolve(responses[callIndex++] ?? []),
    }),
  }));

  // db.update().set().where() → no-op
  mockDbUpdate.mockImplementation(() => ({
    set: () => ({
      where: () => Promise.resolve([]),
    }),
  }));
}

/** Envia o evento de webhook com token correto por padrão. */
function postWebhook(
  app: ReturnType<typeof buildApp>,
  event: string,
  overrideToken?: string,
) {
  return request(app)
    .post("/asaas/webhook")
    .set("asaas-access-token", overrideToken ?? WEBHOOK_TOKEN)
    .send({
      event,
      payment: { id: CHARGE_ID, paymentDate: "2026-08-12" },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Testes
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /asaas/webhook — gatilho de penalidade concierge", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Token correto por padrão
    mockGetSecret.mockResolvedValue(WEBHOOK_TOKEN);
    app = buildApp();
  });

  // ── Cenário 1: PAYMENT_OVERDUE ───────────────────────────────────────────
  it("Cenário 1 — PAYMENT_OVERDUE com sreq concierge → chama registrarFalha com CPF correto", async () => {
    setupSelectMocks(null, SREQ_CONCIERGE);

    const res = await postWebhook(app, "PAYMENT_OVERDUE");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockRegistrarFalha).toHaveBeenCalledTimes(1);
    expect(mockRegistrarFalha).toHaveBeenCalledWith(PATIENT_CPF);
  });

  // ── Cenário 2: PAYMENT_DELETED ───────────────────────────────────────────
  it("Cenário 2 — PAYMENT_DELETED com sreq concierge → chama registrarFalha com CPF correto", async () => {
    setupSelectMocks(null, SREQ_CONCIERGE);

    const res = await postWebhook(app, "PAYMENT_DELETED");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockRegistrarFalha).toHaveBeenCalledTimes(1);
    expect(mockRegistrarFalha).toHaveBeenCalledWith(PATIENT_CPF);
  });

  // ── Cenário 3: PAYMENT_RECEIVED ──────────────────────────────────────────
  it("Cenário 3 — PAYMENT_RECEIVED → registrarFalha NÃO é chamado", async () => {
    setupSelectMocks(null, SREQ_CONCIERGE);

    const res = await postWebhook(app, "PAYMENT_RECEIVED");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });

  // ── Cenário 4: PAYMENT_OVERDUE, sreq com path diferente ─────────────────
  it("Cenário 4 — PAYMENT_OVERDUE com sreq path≠concierge → registrarFalha NÃO é chamado", async () => {
    setupSelectMocks(null, SREQ_NORMAL);

    const res = await postWebhook(app, "PAYMENT_OVERDUE");

    expect(res.status).toBe(200);
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });

  // ── Cenário 5: PAYMENT_OVERDUE, apenas paymentsTable tem linha ───────────
  it("Cenário 5 — PAYMENT_OVERDUE com linha em paymentsTable mas sem sreq → registrarFalha NÃO é chamado", async () => {
    setupSelectMocks({ id: 1, status: "pending", asaasChargeId: CHARGE_ID }, null);

    const res = await postWebhook(app, "PAYMENT_OVERDUE");

    expect(res.status).toBe(200);
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });

  // ── Cenário 6: PAYMENT_REFUNDED ──────────────────────────────────────────
  it("Cenário 6 — PAYMENT_REFUNDED com sreq concierge → chama registrarFalha", async () => {
    setupSelectMocks(null, SREQ_CONCIERGE);

    const res = await postWebhook(app, "PAYMENT_REFUNDED");

    expect(res.status).toBe(200);
    expect(mockRegistrarFalha).toHaveBeenCalledTimes(1);
    expect(mockRegistrarFalha).toHaveBeenCalledWith(PATIENT_CPF);
  });

  // ── Cenário 7: Token inválido ────────────────────────────────────────────
  it("Cenário 7 — token inválido → 401, registrarFalha NÃO é chamado", async () => {
    setupSelectMocks(null, SREQ_CONCIERGE);

    const res = await postWebhook(app, "PAYMENT_OVERDUE", "token-errado");

    expect(res.status).toBe(401);
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });

  // ── Cenário 8: PAYMENT_OVERDUE com ambas as tabelas tendo linha ──────────
  it("Cenário 8 — PAYMENT_OVERDUE com row em payments E sreq concierge → chama registrarFalha uma vez", async () => {
    setupSelectMocks(
      { id: 1, status: "pending", asaasChargeId: CHARGE_ID },
      SREQ_CONCIERGE,
    );

    const res = await postWebhook(app, "PAYMENT_OVERDUE");

    expect(res.status).toBe(200);
    // Deve chamar exatamente uma vez (pelo sreq concierge)
    expect(mockRegistrarFalha).toHaveBeenCalledTimes(1);
    expect(mockRegistrarFalha).toHaveBeenCalledWith(PATIENT_CPF);
  });

  // ── Cenário 9: body sem payment.id → ignorado, sem chamar registrarFalha ─
  it("Cenário 9 — payload sem payment.id → 200 ignorado, sem chamar registrarFalha", async () => {
    const res = await request(app)
      .post("/asaas/webhook")
      .set("asaas-access-token", WEBHOOK_TOKEN)
      .send({ event: "PAYMENT_OVERDUE", payment: {} });

    expect(res.status).toBe(200);
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });

  // ── Cenário 10: PAYMENT_CHARGEBACK_REQUESTED ─────────────────────────────
  it("Cenário 10 — PAYMENT_CHARGEBACK_REQUESTED com sreq concierge → chama registrarFalha com CPF correto", async () => {
    setupSelectMocks(null, SREQ_CONCIERGE);

    const res = await postWebhook(app, "PAYMENT_CHARGEBACK_REQUESTED");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockRegistrarFalha).toHaveBeenCalledTimes(1);
    expect(mockRegistrarFalha).toHaveBeenCalledWith(PATIENT_CPF);
  });

  // ── Cenário 11: PAYMENT_CHARGEBACK_REQUESTED, pagamento comum ────────────
  it("Cenário 11 — PAYMENT_CHARGEBACK_REQUESTED com sreq path≠concierge → registrarFalha NÃO é chamado", async () => {
    setupSelectMocks(null, SREQ_NORMAL);

    const res = await postWebhook(app, "PAYMENT_CHARGEBACK_REQUESTED");

    expect(res.status).toBe(200);
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });
});
