/**
 * verify-device-route.test.ts
 *
 * Testes de integração da rota POST /scheduling/verify-device via supertest.
 * A lib device-throttle.ts é mockada aqui; os testes unitários da lib
 * ficam em verify-device-lib.test.ts.
 *
 * Cenários cobertos:
 *  A1. Código vazio              → 400 "Código não informado."
 *  A2. CPF curto/inválido        → 400 "CPF inválido."
 *  A3. verifyDeviceCode ok:false → 400 com mensagem da lib
 *  A4. verifyDeviceCode ok:true  → 200 { verified: true }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks pesados do router ────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }), transaction: vi.fn() },
  professionalsTable:          {},
  agendaResourcesTable:        {},
  schedulingRequestsTable:     {},
  professionalAreasTable:      {},
  professionalSpecialtiesTable:{},
  clientsTable:                {},
}));

vi.mock("drizzle-orm", () => ({
  eq:     vi.fn((...a) => a),
  and:    vi.fn((...a) => a),
  desc:   vi.fn((...a) => a),
  asc:    vi.fn((...a) => a),
  isNull: vi.fn((...a) => a),
  gt:     vi.fn((...a) => a),
  sql:    vi.fn(() => ({ toSQL: () => ({ sql: "__sql__", params: [] }) })),
}));

vi.mock("../lib/portal-token.js", () => ({
  createSchedulingToken:    vi.fn(),
  verifySchedulingToken:    vi.fn(),
  verifyBookingStatusToken: vi.fn(),
}));

vi.mock("@workspace/api-zod", () => ({
  CreateConciergeChargeBody:   { safeParse: vi.fn() },
  CreateSchedulingRequestBody: { safeParse: vi.fn() },
  UpdateSchedulingRequestBody: { safeParse: vi.fn() },
}));

vi.mock("../lib/agenda-booking.js",     () => ({ computeResourceSlots: vi.fn() }));
vi.mock("../lib/whatsapp.js",           () => ({ sendWhatsapp: vi.fn(), isWhatsappConfigured: vi.fn().mockReturnValue(false) }));
vi.mock("../lib/asaas.js",              () => ({ asaasCreateCustomer: vi.fn(), asaasCreateCharge: vi.fn(), asaasGetCharge: vi.fn(), asaasGetPixQrCode: vi.fn() }));
vi.mock("../lib/secure-settings.js",    () => ({ getSetting: vi.fn().mockResolvedValue(null) }));
vi.mock("../lib/concierge-finalize.js", () => ({ finalizeConciergeBooking: vi.fn() }));
vi.mock("../lib/concierge-penalidade.js", () => ({
  getPenalidade:  vi.fn().mockResolvedValue({ bloqueado: false, penalidade_dias: 0, tentativas: 0 }),
  registrarFalha: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/agenda-concierge.js", () => ({
  computeConciergeOffer: vi.fn().mockResolvedValue(null),
}));

// ── Mock controlável de device-throttle ───────────────────────────────────
type VerifyResult = { ok: boolean; message?: string };
const mockVerifyDeviceCode = vi.fn<
  (cpf: string, code: string, challengeId: number) => Promise<VerifyResult>
>();

vi.mock("../lib/device-throttle.js", () => ({
  verifyDeviceCode:      (cpf: string, code: string, challengeId: number) =>
    mockVerifyDeviceCode(cpf, code, challengeId),
  storeVerificationCode:   vi.fn().mockResolvedValue({ challengeId: 1 }),
  getOrCreateChallenge:    vi.fn().mockResolvedValue({ challengeId: 1, isNew: false }),
  isDeviceVerified:        vi.fn().mockResolvedValue(false),
}));

// ── Router importado após todos os mocks ─────────────────────────────────
import schedulingRouter from "../routes/scheduling.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { log?: unknown }).log = {
      error: vi.fn(), info: vi.fn(), warn: vi.fn(),
      debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
      child: vi.fn().mockReturnThis(), silent: vi.fn(), level: "info",
    };
    next();
  });
  app.use(schedulingRouter);
  return app;
}

const VALID_CPF  = "12345678901";
const VALID_CODE = "654321";

describe("POST /scheduling/verify-device — rota", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("A1 — código vazio → 400 Código não informado", async () => {
    const res = await request(buildApp())
      .post("/scheduling/verify-device")
      .send({ code: "", cpf: VALID_CPF })
      .expect(400);
    expect(res.body.message).toMatch(/código não informado/i);
  });

  it("A2 — CPF curto → 400 CPF inválido", async () => {
    const res = await request(buildApp())
      .post("/scheduling/verify-device")
      .send({ code: VALID_CODE, cpf: "123" })
      .expect(400);
    expect(res.body.message).toMatch(/cpf inválido/i);
  });

  it("A3 — lib retorna ok:false → 400 com mensagem da lib", async () => {
    mockVerifyDeviceCode.mockResolvedValue({
      ok: false,
      message: "Código inválido. Verifique e tente novamente.",
    });
    const res = await request(buildApp())
      .post("/scheduling/verify-device")
      .send({ code: "000000", cpf: VALID_CPF, challengeId: 42 })
      .expect(400);
    expect(res.body.message).toMatch(/código inválido/i);
  });

  it("A4 — lib retorna ok:true → 200 { verified: true }", async () => {
    mockVerifyDeviceCode.mockResolvedValue({ ok: true });
    const res = await request(buildApp())
      .post("/scheduling/verify-device")
      .send({ code: VALID_CODE, cpf: VALID_CPF, challengeId: 42 })
      .expect(200);
    expect(res.body.verified).toBe(true);
  });

  it("A5 — sem challengeId → 400 Identificador de desafio ausente", async () => {
    const res = await request(buildApp())
      .post("/scheduling/verify-device")
      .send({ code: VALID_CODE, cpf: VALID_CPF })
      .expect(400);
    expect(res.body.message).toMatch(/identificador de desafio/i);
  });

  it.each([0, -1, 1.5, "Infinity", "inválido"])("challengeId inválido (%s) não chega ao motor", async (challengeId) => {
    mockVerifyDeviceCode.mockClear();
    const response = await request(buildApp())
      .post("/scheduling/verify-device")
      .send({ code: VALID_CODE, cpf: VALID_CPF, challengeId });
    expect(response.status).toBe(400);
    expect(mockVerifyDeviceCode).not.toHaveBeenCalled();
  });

  it("A6 — challengeId=0 (inválido) → 400 Identificador de desafio ausente", async () => {
    const res = await request(buildApp())
      .post("/scheduling/verify-device")
      .send({ code: VALID_CODE, cpf: VALID_CPF, challengeId: 0 })
      .expect(400);
    expect(res.body.message).toMatch(/identificador de desafio/i);
  });
});
