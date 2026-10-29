/**
 * concierge-booking-block.test.ts
 *
 * Confirma que a rota POST /scheduling/requests rejeita (403) o agendamento
 * quando o CPF está bloqueado no motor de penalidade, e permite (201) quando
 * não há bloqueio — garantindo que a trava existe no BACKEND, não só no painel.
 *
 * Cenários cobertos:
 *   B1. CPF bloqueado (bloqueado=true)  → 403 + code CONCIERGE_BLOCKED
 *   B2. CPF com 0 falhas (bloqueado=false) → 201 (agendamento prossegue)
 *   B3. CPF com 1 falha (penalidade_dias=7, bloqueado=false) → 201 (não bloqueia)
 *   B4. Sem CPF informado → guard não dispara (pass-through)
 *   B5. Path=fila (não concierge) → guard não dispara mesmo com CPF bloqueado
 *
 * Estratégia:
 *   - @workspace/db mockado para evitar conexão real.
 *   - Todos os módulos pesados mockados via vi.mock.
 *   - getPenalidade configurado por teste via mockGetPenalidade.
 *   - db.insert().values().returning() mockado via vi.hoisted().
 *   - App Express mínimo com schedulingRouter real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { postSlackAlertChecked } from "../lib/slack-reporter.js";

vi.mock("../lib/slack-reporter.js", () => ({ postSlackAlertChecked: vi.fn().mockResolvedValue(undefined) }));

// ── Hoisted mocks (precisam estar disponíveis nas factories de vi.mock) ────────

const { mockDbInsertReturning, mockDbExecute, mockDbSelect } = vi.hoisted(() => ({
  mockDbInsertReturning: vi.fn(),
  mockDbExecute: vi.fn().mockResolvedValue({ rows: [] }),
  mockDbSelect: vi.fn(),
}));

// ── Mocks de módulos pesados ──────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const makeInsertChain = () => ({
    values: vi.fn().mockReturnValue({
      returning: () => mockDbInsertReturning(),
    }),
  });
  const makeSelectChain = () => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue([]),
        orderBy: vi.fn().mockReturnValue([]),
      }),
      orderBy: vi.fn().mockReturnValue([]),
    }),
  });
  return {
    db: {
      execute:     (...args: unknown[]) => mockDbExecute(...args),
      insert:      () => makeInsertChain(),
      select:      () => makeSelectChain(),
      update:      () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
      transaction: (fn: (tx: unknown) => unknown) => fn({
        execute:     mockDbExecute,
        insert:      () => makeInsertChain(),
        select:      () => makeSelectChain(),
        update:      () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
      }),
    },
    professionalsTable:          {},
    agendaResourcesTable:        {},
    schedulingRequestsTable:     {},
    professionalAreasTable:      {},
    professionalSpecialtiesTable:{},
    clientsTable:                {},
  };
});

vi.mock("drizzle-orm", () => ({
  eq:   vi.fn(),
  and:  vi.fn(),
  desc: vi.fn(),
  asc:  vi.fn(),
  sql:  vi.fn(() => ""),
}));

vi.mock("../lib/portal-token.js", () => ({
  createSchedulingToken:    vi.fn().mockReturnValue("tok-abc"),
  verifySchedulingToken:    vi.fn(),
  verifyBookingStatusToken: vi.fn(),
}));

vi.mock("@workspace/api-zod", () => ({
  CreateConciergeChargeBody:   { safeParse: vi.fn(), parse: vi.fn() },
  CreateSchedulingRequestBody: { safeParse: vi.fn(), parse: vi.fn() },
  UpdateSchedulingRequestBody: { safeParse: vi.fn(), parse: vi.fn() },
}));

vi.mock("../lib/agenda-booking.js", () => ({
  computeResourceSlots: vi.fn(),
}));

vi.mock("../lib/whatsapp.js", () => ({
  sendWhatsapp:         vi.fn(),
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

vi.mock("../lib/agenda-concierge.js", () => ({
  computeConciergeOffer: vi.fn(),
}));

// ── Mocks configuráveis por teste ─────────────────────────────────────────────

const mockGetPenalidade  = vi.fn();
const mockRegistrarFalha = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/concierge-penalidade.js", () => ({
  getPenalidade:  (...args: unknown[]) => mockGetPenalidade(...args),
  registrarFalha: (...args: unknown[]) => mockRegistrarFalha(...args),
}));

const mockCheckDeviceThrottle = vi.fn();
const mockDeriveFingerprint   = vi.fn().mockReturnValue("fp-test-abc123");
const mockIsDeviceVerified    = vi.fn().mockResolvedValue(false);

vi.mock("../lib/concierge-device-throttle.js", () => ({
  checkDeviceThrottle: (...args: unknown[]) => mockCheckDeviceThrottle(...args),
  deriveFingerprint:   (...args: unknown[]) => mockDeriveFingerprint(...args),
  isDeviceVerified:    (...args: unknown[]) => mockIsDeviceVerified(...args),
}));

vi.mock("../lib/device-throttle.js", () => ({
  getOrCreateChallenge:  vi.fn().mockResolvedValue({ challengeId: 1, isNew: false }),
  storeVerificationCode: vi.fn().mockResolvedValue({ challengeId: 1 }),
  verifyDeviceCode:      vi.fn(),
  isDeviceVerified:      vi.fn().mockResolvedValue(false),
}));

// ── Importação do router (após todos os mocks) ────────────────────────────────

import schedulingRouter from "../routes/scheduling.js";
import * as apiZod from "@workspace/api-zod";

// ── App de teste ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).log = {
      error: vi.fn(), info: vi.fn(), warn: vi.fn(),
      debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
      child: vi.fn().mockReturnThis(), silent: vi.fn(), level: "info",
    };
    next();
  });
  app.use(schedulingRouter);
  return app;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CPF_BLOQUEADO  = "11111111111";
const CPF_1_FALHA    = "22222222222";
const CPF_SEM_FALHA  = "33333333333";

/** Corpo válido para o caminho dr_caio → concierge */
function bodyConciergeCpf(cpf: string) {
  return {
    entrada:       "dr_caio",
    path:          "concierge",
    patientName:   "Maria Silva",
    patientPhone:  "11999999999",
    patientCpf:    cpf,
    earliestDate:  "2027-01-01",
  };
}

/** Linha retornada pelo INSERT (satisfaz formatRequest) */
const FAKE_ROW = {
  id:               42,
  entrada:          "dr_caio",
  path:             "concierge",
  patientName:      "Maria Silva",
  patientPhone:     "11999999999",
  patientCpf:       CPF_SEM_FALHA,
  patientEmail:     null,
  desire:           null,
  preferredWeekday: null,
  preferredPeriod:  null,
  earliestDate:     "2027-01-01",
  professionalId:   null,
  resourceId:       null,
  chosenDate:       null,
  chosenTime:       null,
  paymentArm:       "concierge",
  paymentStatus:    "nao_aplicavel",
  status:           "novo",
  notes:            null,
  createdAt:        new Date("2026-08-14T12:00:00Z"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Suite principal: trava de bloqueio na rota de agendamento
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /scheduling/requests — trava de bloqueio Concierge (Guard #159)", () => {
  it.each([
    ["POST", "pendente"], ["GET", "pendente"],
    ["POST", "erro"], ["GET", "erro"],
    ["POST", "sem configuração"], ["GET", "sem configuração"],
  ])("%s mantém 403 com Slack %s", async (method, state) => {
    mockGetPenalidade.mockResolvedValue({ bloqueado: true, penalidade_dias: 0, tentativas: 3 });
    vi.mocked(apiZod.CreateSchedulingRequestBody.safeParse).mockReturnValue({
      success: true, data: bodyConciergeCpf(CPF_BLOQUEADO),
    } as any);
    if (state === "pendente") {
      vi.mocked(postSlackAlertChecked).mockImplementation(() => new Promise(() => {}));
    } else {
      vi.mocked(postSlackAlertChecked).mockRejectedValue(new Error(state));
    }
    const app = buildApp();
    const pending = method === "POST"
      ? request(app).post("/scheduling/requests").send(bodyConciergeCpf(CPF_BLOQUEADO))
      : request(app).get(`/scheduling/concierge-offer?cpf=${CPF_BLOQUEADO}`);
    const res = await pending.timeout({ response: 1500 }).expect(403);
    expect(res.body.code).toBe("CONCIERGE_BLOCKED");
    expect(postSlackAlertChecked).toHaveBeenCalledTimes(1);
    expect(mockDbInsertReturning).not.toHaveBeenCalled();
    expect(mockRegistrarFalha).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postSlackAlertChecked).mockResolvedValue(undefined);
    mockRegistrarFalha.mockResolvedValue(undefined);
    mockCheckDeviceThrottle.mockResolvedValue({
      allowed: true, remaining: 49, throttled: false, requiresVerification: false,
    });
    mockDeriveFingerprint.mockReturnValue("fp-test-abc123");
    mockIsDeviceVerified.mockResolvedValue(false);
    // DB insert retorna row válido por padrão
    mockDbInsertReturning.mockResolvedValue([FAKE_ROW]);
  });

  // ── Cenário B1 ─────────────────────────────────────────────────────────────
  it("B1 — CPF bloqueado permanentemente → 403 CONCIERGE_BLOCKED", async () => {
    // getPenalidade devolve bloqueio total
    mockGetPenalidade.mockResolvedValue({
      bloqueado:       true,
      penalidade_dias: 0,
      tentativas:      3,
    });

    // safeParse aceita o body concierge com CPF bloqueado
    vi.mocked(apiZod.CreateSchedulingRequestBody.safeParse).mockReturnValue({
      success: true,
      data:    bodyConciergeCpf(CPF_BLOQUEADO),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post("/scheduling/requests")
      .send(bodyConciergeCpf(CPF_BLOQUEADO))
      .expect(403);

    expect(res.body.code).toBe("CONCIERGE_BLOCKED");
    expect(postSlackAlertChecked).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("POST /scheduling/requests"),
    );
    expect(res.body.error).toMatch(/suspens/i);

    // Não deve ter chegado ao INSERT
    expect(mockDbInsertReturning).not.toHaveBeenCalled();
  });

  // ── Cenário B2 ─────────────────────────────────────────────────────────────
  it("B2 — CPF com 0 falhas (bloqueado=false) → agendamento prossegue (201)", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado:       false,
      penalidade_dias: 0,
      tentativas:      0,
    });

    vi.mocked(apiZod.CreateSchedulingRequestBody.safeParse).mockReturnValue({
      success: true,
      data:    bodyConciergeCpf(CPF_SEM_FALHA),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post("/scheduling/requests")
      .send(bodyConciergeCpf(CPF_SEM_FALHA))
      .expect(201);

    // Deve ter atingido o INSERT — retornou o agendamento criado
    expect(mockDbInsertReturning).toHaveBeenCalledTimes(1);
    expect(res.body.id).toBe(FAKE_ROW.id);
    // Código de bloqueio não deve aparecer na resposta
    expect(res.body.code).not.toBe("CONCIERGE_BLOCKED");
  });

  // ── Cenário B3 ─────────────────────────────────────────────────────────────
  it("B3 — CPF com 1 falha (penalidade_dias=7, bloqueado=false) → NÃO é bloqueado (201)", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado:       false,
      penalidade_dias: 7,
      tentativas:      1,
    });

    vi.mocked(apiZod.CreateSchedulingRequestBody.safeParse).mockReturnValue({
      success: true,
      data:    bodyConciergeCpf(CPF_1_FALHA),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post("/scheduling/requests")
      .send(bodyConciergeCpf(CPF_1_FALHA))
      .expect(201);

    // Guard não disparou — INSERT executado
    expect(mockDbInsertReturning).toHaveBeenCalledTimes(1);
    // Não retornou código de bloqueio
    expect(res.body.code).not.toBe("CONCIERGE_BLOCKED");
  });

  // ── Cenário B4 ─────────────────────────────────────────────────────────────
  it("B4 — Sem CPF informado → guard não dispara, getPenalidade não é chamado", async () => {
    // Mesmo que getPenalidade retornasse bloqueado, sem CPF o guard não dispara
    mockGetPenalidade.mockResolvedValue({
      bloqueado: true, penalidade_dias: 0, tentativas: 3,
    });

    const bodyNoCpf = {
      entrada:      "dr_caio",
      path:         "concierge",
      patientName:  "Sem CPF",
      patientPhone: "11888888888",
      earliestDate: "2027-01-01",
      // patientCpf omitido intencionalmente
    };

    vi.mocked(apiZod.CreateSchedulingRequestBody.safeParse).mockReturnValue({
      success: true,
      data:    bodyNoCpf,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post("/scheduling/requests")
      .send(bodyNoCpf)
      .expect(201);

    // Guard não disparou — INSERT executado
    expect(mockDbInsertReturning).toHaveBeenCalledTimes(1);
    // getPenalidade NÃO deve ter sido chamado (sem CPF, sem verificação)
    expect(mockGetPenalidade).not.toHaveBeenCalled();
    expect(res.body.code).not.toBe("CONCIERGE_BLOCKED");
  });

  // ── Cenário B5 ─────────────────────────────────────────────────────────────
  it("B5 — Path=fila (não concierge) → guard não dispara, mesmo com CPF bloqueado", async () => {
    mockGetPenalidade.mockResolvedValue({
      bloqueado: true, penalidade_dias: 0, tentativas: 3,
    });

    // Fila requer chosenDate + chosenTime com janela mínima de 3 meses
    const in4months = new Date();
    in4months.setMonth(in4months.getMonth() + 4);
    const chosenDate = in4months.toISOString().slice(0, 10);

    const bodyFila = {
      entrada:      "dr_caio",
      path:         "fila",
      patientName:  "Fila Teste",
      patientPhone: "11777777777",
      patientCpf:   CPF_BLOQUEADO,
      earliestDate: chosenDate,
      chosenDate,
      chosenTime:   "09:00",
    };

    vi.mocked(apiZod.CreateSchedulingRequestBody.safeParse).mockReturnValue({
      success: true,
      data:    bodyFila,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const app = buildApp();
    const res = await request(app)
      .post("/scheduling/requests")
      .send(bodyFila)
      .expect(201);

    // Guard não disparou (path é "fila", não "concierge")
    expect(mockDbInsertReturning).toHaveBeenCalledTimes(1);
    // getPenalidade NÃO deve ter sido chamado
    expect(mockGetPenalidade).not.toHaveBeenCalled();
    expect(res.body.code).not.toBe("CONCIERGE_BLOCKED");
  });
});
