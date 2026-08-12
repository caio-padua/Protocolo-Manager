/**
 * concierge-offer-route.test.ts
 *
 * Testes de integração controlada da rota GET /scheduling/concierge-offer.
 *
 * Cenários cobertos:
 *  7. CPF bloqueado  → resposta { blocked: true, motivo: "concierge_bloqueado" }
 *  8. CPF com 1 falha → earliestDate é offsetada em +7 dias antes de chamar computeConciergeOffer
 *
 * Estratégia: montar um express mínimo que usa o router real de scheduling,
 * mas com todos os módulos pesados mockados via vi.mock. Apenas
 * concierge-penalidade e agenda-concierge são configurados por teste.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks de módulos pesados (declarados ANTES dos imports do router) ─────────

vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
  professionalsTable:          {},
  agendaResourcesTable:        {},
  schedulingRequestsTable:     {},
  professionalAreasTable:      {},
  professionalSpecialtiesTable:{},
  clientsTable:                {},
}));

vi.mock("drizzle-orm", () => ({
  eq:   vi.fn(),
  and:  vi.fn(),
  desc: vi.fn(),
  asc:  vi.fn(),
  sql:  vi.fn(() => ""),
}));

vi.mock("../lib/portal-token.js", () => ({
  createSchedulingToken:   vi.fn(),
  verifySchedulingToken:   vi.fn(),
  verifyBookingStatusToken: vi.fn(),
}));

vi.mock("@workspace/api-zod", () => ({
  CreateConciergeChargeBody:    { parse: vi.fn() },
  CreateSchedulingRequestBody:  { parse: vi.fn() },
  UpdateSchedulingRequestBody:  { parse: vi.fn() },
}));

vi.mock("../lib/agenda-booking.js", () => ({
  computeResourceSlots: vi.fn(),
}));

vi.mock("../lib/whatsapp.js", () => ({
  sendWhatsapp:        vi.fn(),
  isWhatsappConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/asaas.js", () => ({
  asaasCreateCustomer: vi.fn(),
  asaasCreateCharge:   vi.fn(),
  asaasGetCharge:      vi.fn(),
  asaasGetPixQrCode:   vi.fn(),
}));

vi.mock("../lib/secure-settings.js", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/concierge-finalize.js", () => ({
  finalizeConciergeBooking: vi.fn(),
}));

// ── Mocks configuráveis por teste ─────────────────────────────────────────────
const mockGetPenalidade    = vi.fn();
const mockRegistrarFalha   = vi.fn().mockResolvedValue(undefined);
const mockComputeOffer     = vi.fn();

vi.mock("../lib/concierge-penalidade.js", () => ({
  getPenalidade:  (...args: unknown[]) => mockGetPenalidade(...args),
  registrarFalha: (...args: unknown[]) => mockRegistrarFalha(...args),
}));

vi.mock("../lib/agenda-concierge.js", () => ({
  computeConciergeOffer: (...args: unknown[]) => mockComputeOffer(...args),
}));

// ── Importação do router (após todos os mocks) ────────────────────────────────
import schedulingRouter from "../routes/scheduling.js";

// ── App de teste ──────────────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  // Adiciona req.log mínimo compatível com pino (evita TypeError na rota)
  app.use((req, _res, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).log = {
      error: vi.fn(), info:  vi.fn(), warn:  vi.fn(),
      debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
      silent: vi.fn(),
      level: "info",
    };
    next();
  });
  app.use(schedulingRouter);
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const OFERTA_SAMPLE = {
  dates:        ["2026-09-10", "2026-09-17"],
  slots:        [{ time: "09:00", label: "manhã" }],
  weekday:      3,
  period:       "manha",
};

const CPF_BLOQUEADO = "11111111111";
const CPF_1_FALHA   = "22222222222";

// ─────────────────────────────────────────────────────────────────────────────
// Testes
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /scheduling/concierge-offer — trava de escassez (Concierge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistrarFalha.mockResolvedValue(undefined);
  });

  // ── Cenário 7 ──────────────────────────────────────────────────────────────
  it("Cenário 7 — CPF bloqueado → retorna { blocked: true } sem chamar computeConciergeOffer", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado:      true,
      penalidade_dias: 0,
      tentativas:     3,
    });

    const app = buildApp();
    const res = await request(app)
      .get(`/scheduling/concierge-offer?cpf=${CPF_BLOQUEADO}&weekday=3&period=manha&earliest=2026-09-01`)
      .expect(200);

    expect(res.body.blocked).toBe(true);
    expect(res.body.motivo).toBe("concierge_bloqueado");
    expect(res.body.tentativas).toBe(3);

    // computeConciergeOffer NÃO deve ter sido chamado
    expect(mockComputeOffer).not.toHaveBeenCalled();
  });

  // ── Cenário 8 ──────────────────────────────────────────────────────────────
  it("Cenário 8 — CPF com 1 falha → earliestDate offsetada +7 dias antes de chamar computeConciergeOffer", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado:      false,
      penalidade_dias: 7,
      tentativas:     1,
    });
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    await request(app)
      .get(`/scheduling/concierge-offer?cpf=${CPF_1_FALHA}&weekday=3&period=manha&earliest=2026-09-01`)
      .expect(200);

    expect(mockComputeOffer).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeOffer.mock.calls[0][0] as { earliestDate: string | null };

    // earliestDate passada ao motor deve ser pelo menos 7 dias após 2026-09-01
    const original  = new Date("2026-09-01T12:00:00Z");
    const effective = new Date(`${callArgs.earliestDate}T12:00:00Z`);
    const diffDias  = (effective.getTime() - original.getTime()) / 86_400_000;

    expect(diffDias).toBe(7);
  });

  it("Cenário 8b — CPF com 2 falhas → earliestDate offsetada +30 dias", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado:      false,
      penalidade_dias: 30,
      tentativas:     2,
    });
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    await request(app)
      .get(`/scheduling/concierge-offer?cpf=${CPF_1_FALHA}&weekday=3&period=manha&earliest=2026-09-01`)
      .expect(200);

    const callArgs = mockComputeOffer.mock.calls[0][0] as { earliestDate: string | null };
    const original  = new Date("2026-09-01T12:00:00Z");
    const effective = new Date(`${callArgs.earliestDate}T12:00:00Z`);
    const diffDias  = (effective.getTime() - original.getTime()) / 86_400_000;

    expect(diffDias).toBe(30);
  });

  it("Cenário 8c — CPF sem penalidade → earliestDate passada sem alteração", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado:      false,
      penalidade_dias: 0,
      tentativas:     0,
    });
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    await request(app)
      .get(`/scheduling/concierge-offer?cpf=${CPF_1_FALHA}&weekday=3&period=manha&earliest=2026-09-01`)
      .expect(200);

    const callArgs = mockComputeOffer.mock.calls[0][0] as { earliestDate: string | null };
    expect(callArgs.earliestDate).toBe("2026-09-01");
  });

  it("Cenário 8c — sem CPF → getPenalidade chamado com null, oferta normal", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado:      false,
      penalidade_dias: 0,
      tentativas:     0,
    });
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&earliest=2026-09-01")
      .expect(200);

    // CPF não fornecido → null
    expect(mockGetPenalidade).toHaveBeenCalledWith(null);
    expect(mockComputeOffer).toHaveBeenCalled();
  });

  it("Agenda indisponível → 404", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado:      false,
      penalidade_dias: 0,
      tentativas:     0,
    });
    mockComputeOffer.mockResolvedValue(null); // sem oferta

    const app = buildApp();
    const res = await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&earliest=2026-09-01")
      .expect(404);

    expect(res.body.error).toContain("indisponível");
  });

  it("Erro interno → 500", async () => {
    mockGetPenalidade.mockRejectedValue(new Error("DB offline"));

    const app = buildApp();
    const res = await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&earliest=2026-09-01")
      .expect(500);

    expect(res.body.error).toBeDefined();
  });
});
