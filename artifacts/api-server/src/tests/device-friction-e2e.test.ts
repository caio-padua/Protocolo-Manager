/**
 * device-friction-e2e.test.ts
 *
 * Prova fim-a-fim do fluxo de fricção de dispositivo:
 *   1. concierge-offer (isNew=true)  → gera desafio, envia OTP, retorna challengeId
 *   2. verify-device                 → código recebido no passo 1 é aceito (ok:true)
 *   3. concierge-offer (isNew=false) → desafio existente NÃO reemite OTP (cooldown)
 *
 * Módulos de I/O (DB, WhatsApp, Telegram) são mockados para isolar a lógica da rota.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks pesados (declarados ANTES do import do router) ─────────────────────

const mockDbExecute = vi.fn();
const mockDbSelect  = vi.fn(() => ({
  from: () => ({ where: () => ({ limit: () => [] }) }),
}));

vi.mock("@workspace/db", () => ({
  db: {
    execute:     (...a: unknown[]) => mockDbExecute(...a),
    select:      (...a: unknown[]) => mockDbSelect(...a),
    transaction: vi.fn(),
  },
  professionalsTable:           {},
  agendaResourcesTable:         {},
  schedulingRequestsTable:      {},
  professionalAreasTable:       {},
  professionalSpecialtiesTable: {},
  clientsTable:                 {},
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
  CreateConciergeChargeBody:   { safeParse: vi.fn(), parse: vi.fn() },
  CreateSchedulingRequestBody: { safeParse: vi.fn(), parse: vi.fn() },
  UpdateSchedulingRequestBody: { safeParse: vi.fn(), parse: vi.fn() },
}));

vi.mock("../lib/agenda-booking.js",     () => ({ computeResourceSlots: vi.fn() }));
vi.mock("../lib/asaas.js",              () => ({
  asaasCreateCustomer: vi.fn(), asaasCreateCharge: vi.fn(),
  asaasGetCharge: vi.fn(), asaasGetPixQrCode: vi.fn(),
}));
vi.mock("../lib/secure-settings.js",    () => ({ getSetting: vi.fn().mockResolvedValue(null) }));
vi.mock("../lib/concierge-finalize.js", () => ({ finalizeConciergeBooking: vi.fn() }));

vi.mock("../lib/concierge-penalidade.js", () => ({
  getPenalidade:  vi.fn().mockResolvedValue({ bloqueado: false, penalidade_dias: 0, tentativas: 0 }),
  registrarFalha: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/agenda-concierge.js", () => ({
  computeConciergeOffer: vi.fn().mockResolvedValue({
    dates: ["2026-10-01"], slots: [{ time: "09:00", label: "manhã" }],
    weekday: 3, period: "manha",
  }),
}));

// ── Mocks configuráveis por teste ─────────────────────────────────────────────
const mockCheckDeviceThrottle = vi.fn();
const mockDeriveFingerprint   = vi.fn().mockReturnValue("fp-test-abc");
const mockIsDeviceVerified    = vi.fn().mockResolvedValue(false);

vi.mock("../lib/concierge-device-throttle.js", () => ({
  checkDeviceThrottle: (...a: unknown[]) => mockCheckDeviceThrottle(...a),
  deriveFingerprint:   (...a: unknown[]) => mockDeriveFingerprint(...a),
  isDeviceVerified:    (...a: unknown[]) => mockIsDeviceVerified(...a),
}));

const CHALLENGE_ID   = 77;
const OTP_CODE       = "482931";
const PATIENT_PHONE  = "+5511999990000";
const PATIENT_CPF    = "12345678901";

const mockGetOrCreateChallenge = vi.fn();
const mockVerifyDeviceCode     = vi.fn();
const mockSendWhatsapp         = vi.fn();
const mockSendTelegram         = vi.fn();

vi.mock("../lib/device-throttle.js", () => ({
  getOrCreateChallenge:  (...a: unknown[]) => mockGetOrCreateChallenge(...a),
  storeVerificationCode: vi.fn().mockResolvedValue({ challengeId: 77 }),
  verifyDeviceCode:      (...a: unknown[]) => mockVerifyDeviceCode(...a),
  isDeviceVerified:      vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/whatsapp.js", () => ({
  sendWhatsapp:         (...a: unknown[]) => mockSendWhatsapp(...a),
  isWhatsappConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/telegram.js", () => ({
  sendTelegram: (...a: unknown[]) => mockSendTelegram(...a),
}));

// ── Router importado após todos os mocks ─────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** concierge-offer com CPF e fricção ativa */
function doOffer(app: ReturnType<typeof buildApp>) {
  return request(app)
    .get(`/scheduling/concierge-offer?weekday=3&period=manha&cpf=${PATIENT_CPF}`)
    .set("User-Agent", "Mozilla/5.0 E2E");
}

/** verify-device com código e challengeId */
function doVerify(app: ReturnType<typeof buildApp>, code: string, challengeId: number) {
  return request(app)
    .post("/scheduling/verify-device")
    .send({ code, cpf: PATIENT_CPF, challengeId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Testes
// ─────────────────────────────────────────────────────────────────────────────

describe("Fluxo fim-a-fim: fricção de dispositivo → OTP → verificação", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Fricção ativa (6ª oferta do dia, dispositivo não verificado).
    mockCheckDeviceThrottle.mockResolvedValue({
      allowed: true, remaining: 44, throttled: false, requiresVerification: true,
    });

    // DB::execute — simula SELECT code FROM device_contact_verifications
    mockDbExecute.mockResolvedValue({ rows: [{ code: OTP_CODE }] });
  });

  // ── E1: concierge-offer isNew=true entrega o OTP e retorna challengeId ──────
  it("E1 — isNew=true: concierge-offer entrega OTP via WhatsApp e retorna challengeId", async () => {
    mockGetOrCreateChallenge.mockResolvedValue({ challengeId: CHALLENGE_ID, isNew: true });
    mockSendWhatsapp.mockResolvedValue({ sent: true, via: "whatsapp" });

    // db.select → paciente com telefone
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => [{ phone: PATIENT_PHONE, telegramChatId: null }],
        }),
      }),
    });

    const res = await doOffer(buildApp()).expect(200);

    // Oferta calculada normalmente
    expect(res.body.requiresVerification).toBe(true);

    // challengeId emitido pelo servidor
    expect(res.body.challengeId).toBe(CHALLENGE_ID);

    // OTP entregue
    expect(res.body.codeSent).toBe(true);

    // WhatsApp chamado com o código gerado
    expect(mockSendWhatsapp).toHaveBeenCalledOnce();
    const [toNum, msg] = mockSendWhatsapp.mock.calls[0] as [string, string];
    expect(toNum).toBe(PATIENT_PHONE);
    expect(msg).toContain(OTP_CODE);
  });

  // ── E2: código recebido é aceito por verify-device (mesmo challengeId) ───────
  it("E2 — verify-device aceita o código vinculado ao challengeId emitido por concierge-offer", async () => {
    mockVerifyDeviceCode.mockResolvedValue({ ok: true });

    const res = await doVerify(buildApp(), OTP_CODE, CHALLENGE_ID).expect(200);

    expect(res.body.verified).toBe(true);

    // Lib chamada com os mesmos (cpf, code, challengeId) que chegaram na rota
    expect(mockVerifyDeviceCode).toHaveBeenCalledWith(
      PATIENT_CPF,
      OTP_CODE,
      CHALLENGE_ID,
    );
  });

  // ── E3: isNew=false NÃO reemite OTP (cooldown de reenvio) ────────────────────
  it("E3 — isNew=false: concierge-offer retorna challengeId mas NÃO chama sendWhatsapp", async () => {
    mockGetOrCreateChallenge.mockResolvedValue({ challengeId: CHALLENGE_ID, isNew: false });

    const res = await doOffer(buildApp()).expect(200);

    // challengeId presente para que o frontend possa verificar
    expect(res.body.challengeId).toBe(CHALLENGE_ID);

    // Nenhum envio — cooldown de reenvio ativo
    expect(mockSendWhatsapp).not.toHaveBeenCalled();
    expect(mockSendTelegram).not.toHaveBeenCalled();
    expect(res.body.codeSent).toBe(false);
  });

  // ── E4: código errado → verify-device rejeita ────────────────────────────────
  it("E4 — verify-device rejeita código incorreto com 400", async () => {
    mockVerifyDeviceCode.mockResolvedValue({
      ok: false,
      message: "Código inválido. Verifique e tente novamente.",
    });

    const res = await doVerify(buildApp(), "000000", CHALLENGE_ID).expect(400);

    expect(res.body.message).toMatch(/código inválido/i);
    expect(res.body.verified).toBeUndefined();
  });

  // ── E5: isNew=true mas sem telefone cai no Telegram como fallback ─────────────
  it("E5 — isNew=true sem telefone: entrega via Telegram como fallback", async () => {
    mockGetOrCreateChallenge.mockResolvedValue({ challengeId: CHALLENGE_ID, isNew: true });
    mockSendWhatsapp.mockResolvedValue({ sent: false });
    mockSendTelegram.mockResolvedValue({ sent: true });

    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => [{ phone: null, telegramChatId: "tg-chat-999" }],
        }),
      }),
    });

    const res = await doOffer(buildApp()).expect(200);

    expect(res.body.codeSent).toBe(true);
    expect(mockSendTelegram).toHaveBeenCalledOnce();
    const [chatId, msg] = mockSendTelegram.mock.calls[0] as [string, string];
    expect(chatId).toBe("tg-chat-999");
    expect(msg).toContain(OTP_CODE);
  });
});
