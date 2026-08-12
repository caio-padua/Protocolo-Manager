/**
 * concierge-offer-route.test.ts
 *
 * Testes de integração controlada da rota GET /scheduling/concierge-offer.
 *
 * Cenários cobertos:
 *  7.  CPF bloqueado  → { blocked: true, motivo: "concierge_bloqueado" }
 *  8.  CPF com 1 falha → earliestDate offsetada +7 dias
 *  8b. CPF com 2 falhas → earliestDate offsetada +30 dias
 *  8c. CPF sem penalidade → earliestDate sem alteração
 *  8d. sem CPF → getPenalidade chamado com null
 *  D1. Fingerprint extraído server-side (deriveFingerprint) — sem query param
 *  D2. ≥ 6 ofertas/dia → requiresVerification:true na resposta, oferta calculada
 *  D3. ≥ 50 ofertas/dia → throttled:true, computeConciergeOffer NÃO chamado
 *  D4. Dispositivo livre → throttled:false, requiresVerification:false
 *  D5. ?verified=1 na query NÃO bypassa (verified é server-side)
 *  D6. Nenhum cenário de device throttle grava penalidade no CPF
 *
 * Estratégia: express mínimo com router real de scheduling; módulos pesados
 * mockados via vi.mock. checkDeviceThrottle, deriveFingerprint e isDeviceVerified
 * são controlados por teste.
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
const mockGetPenalidade       = vi.fn();
const mockRegistrarFalha      = vi.fn().mockResolvedValue(undefined);
const mockComputeOffer        = vi.fn();
const mockCheckDeviceThrottle = vi.fn();
const mockDeriveFingerprint   = vi.fn();
const mockIsDeviceVerified    = vi.fn();

vi.mock("../lib/concierge-penalidade.js", () => ({
  getPenalidade:  (...args: unknown[]) => mockGetPenalidade(...args),
  registrarFalha: (...args: unknown[]) => mockRegistrarFalha(...args),
}));

vi.mock("../lib/agenda-concierge.js", () => ({
  computeConciergeOffer: (...args: unknown[]) => mockComputeOffer(...args),
}));

vi.mock("../lib/concierge-device-throttle.js", () => ({
  checkDeviceThrottle: (...args: unknown[]) => mockCheckDeviceThrottle(...args),
  deriveFingerprint:   (...args: unknown[]) => mockDeriveFingerprint(...args),
  isDeviceVerified:    (...args: unknown[]) => mockIsDeviceVerified(...args),
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

// Default device-throttle result: livre (não throttled, não requiresVerification).
const DEVICE_FREE = {
  allowed: true, remaining: 49, throttled: false, requiresVerification: false,
};
// Fingerprint sintético retornado pelo mock de deriveFingerprint
const FP_MOCK = "abc123def456ab78";

// ─────────────────────────────────────────────────────────────────────────────
// Testes — trava de escassez por CPF
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /scheduling/concierge-offer — trava de escassez (Concierge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistrarFalha.mockResolvedValue(undefined);
    // Por padrão: fingerprint estável, não verificado, device livre.
    mockDeriveFingerprint.mockReturnValue(FP_MOCK);
    mockIsDeviceVerified.mockResolvedValue(false);
    mockCheckDeviceThrottle.mockResolvedValue(DEVICE_FREE);
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

  it("Cenário 8d — sem CPF → getPenalidade chamado com null, oferta normal", async () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// Trava por dispositivo (ARQUITETURA.md §6.2-6.3)
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /scheduling/concierge-offer — trava por dispositivo (device throttle)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistrarFalha.mockResolvedValue(undefined);
    // Penalidade CPF: sem penalidade (não interfere nos cenários de device throttle)
    mockGetPenalidade.mockResolvedValue({ bloqueado: false, penalidade_dias: 0, tentativas: 0 });
    // Fingerprint sempre derivado server-side — não de query param
    mockDeriveFingerprint.mockReturnValue(FP_MOCK);
    mockIsDeviceVerified.mockResolvedValue(false);
  });

  it("Cenário D1 — fingerprint derivado server-side de headers (não de query param)", async () => {
    mockCheckDeviceThrottle.mockResolvedValue(DEVICE_FREE);
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    // Nem ?fingerprint= nem ?verified= enviados — fingerprint vem de deriveFingerprint()
    await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&earliest=2026-09-01")
      .set("User-Agent", "Mozilla/5.0 Test Browser")
      .expect(200);

    // deriveFingerprint deve ter sido chamado com o objeto req
    expect(mockDeriveFingerprint).toHaveBeenCalledTimes(1);
    // checkDeviceThrottle deve receber o fingerprint derivado (FP_MOCK)
    expect(mockCheckDeviceThrottle).toHaveBeenCalledWith(FP_MOCK, false);
  });

  it("Cenário D2 — dispositivo com 6+ ofertas → requiresVerification:true na resposta, oferta ainda calculada", async () => {
    mockCheckDeviceThrottle.mockResolvedValue({
      allowed: true,
      remaining: 44,
      throttled: false,
      requiresVerification: true,
      message: "Para seguir com a reserva, confirme seu contato — enviamos um código para o seu WhatsApp.",
    });
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    const res = await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&earliest=2026-09-01")
      .set("User-Agent", "Mozilla/5.0 Test Browser")
      .expect(200);

    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.throttled).toBe(false);
    // Oferta ainda vem (fricção, não bloqueio)
    expect(res.body.dates).toBeDefined();
    // Não grava penalidade no CPF
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });

  it("Cenário D3 — dispositivo com 50+ ofertas → throttled:true, rota retorna sem chamar computeConciergeOffer", async () => {
    mockCheckDeviceThrottle.mockResolvedValue({
      allowed: false,
      remaining: 0,
      throttled: true,
      requiresVerification: false,
      message: "Limite diário de consultas atingido. Tente novamente amanhã.",
    });

    const app = buildApp();
    const res = await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&earliest=2026-09-01")
      .set("User-Agent", "Mozilla/5.0 Test Browser")
      .expect(200);

    expect(res.body.throttled).toBe(true);
    expect(res.body.requiresVerification).toBe(false);
    // computeConciergeOffer NÃO deve ser chamado quando throttled
    expect(mockComputeOffer).not.toHaveBeenCalled();
    // Não grava penalidade no CPF
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });

  it("Cenário D4 — dispositivo livre → throttled:false e requiresVerification:false na resposta", async () => {
    mockCheckDeviceThrottle.mockResolvedValue(DEVICE_FREE);
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    const res = await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&earliest=2026-09-01")
      .set("User-Agent", "Mozilla/5.0 Test Browser")
      .expect(200);

    expect(res.body.throttled).toBe(false);
    expect(res.body.requiresVerification).toBe(false);
  });

  it("Cenário D5 — ?verified=1 na query NÃO bypassa trava (verified é server-side via isDeviceVerified)", async () => {
    // Mesmo com ?verified=1 no query, a rota usa isDeviceVerified() — que retorna false aqui.
    // O mock de checkDeviceThrottle recebe (fingerprint, false), não (fingerprint, true).
    mockCheckDeviceThrottle.mockResolvedValue({
      allowed: true, remaining: 44, throttled: false, requiresVerification: true,
    });
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&verified=1")
      .set("User-Agent", "Mozilla/5.0 Test Browser")
      .expect(200);

    // verified deve vir de isDeviceVerified (false), não do query param
    expect(mockIsDeviceVerified).toHaveBeenCalledWith(FP_MOCK);
    expect(mockCheckDeviceThrottle).toHaveBeenCalledWith(FP_MOCK, false);
  });

  it("Cenário D6 — dispositivo verificado server-side → nenhum dos flags (sem limite)", async () => {
    // isDeviceVerified retorna true → checkDeviceThrottle recebe verified=true
    mockIsDeviceVerified.mockResolvedValue(true);
    mockCheckDeviceThrottle.mockResolvedValue({
      allowed: true, remaining: 50, throttled: false, requiresVerification: false,
    });
    mockComputeOffer.mockResolvedValue(OFERTA_SAMPLE);

    const app = buildApp();
    const res = await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha")
      .set("User-Agent", "Mozilla/5.0 Test Browser")
      .expect(200);

    expect(mockCheckDeviceThrottle).toHaveBeenCalledWith(FP_MOCK, true);
    expect(res.body.throttled).toBe(false);
    expect(res.body.requiresVerification).toBe(false);
  });

  it("Cenário D7 — nenhum cenário de device throttle grava penalidade no CPF", async () => {
    // Throttled: também não grava
    mockCheckDeviceThrottle.mockResolvedValue({
      allowed: false, remaining: 0, throttled: true, requiresVerification: false,
    });

    const app = buildApp();
    await request(app)
      .get("/scheduling/concierge-offer?weekday=3&period=manha&cpf=12345678901")
      .set("User-Agent", "Mozilla/5.0 Test Browser")
      .expect(200);

    expect(mockRegistrarFalha).not.toHaveBeenCalled();
    // getPenalidade nunca chega a ser chamado (rota retorna antes)
    expect(mockGetPenalidade).not.toHaveBeenCalled();
  });
});
