import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const state = vi.hoisted(() => ({
  member: true, locationEmpresa: 21, writes: [] as any[], wa: vi.fn(), tg: vi.fn(), sync: vi.fn(),
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("../../../../lib/db/src/schema");
  function rows(table: unknown) {
    if (table === schema.professionalsTable) return [{ id: 41, name: "Médico sintético",
      active: true, professionalType: "medico", crm: "CRM/SP 12345" }];
    if (table === schema.clientsTable) return [{ id: 71, name: "Paciente sintético", status: "active",
      empresaId: 21, locationId: 31, phone: "+5500000000000", email: "patient@example.invalid" }];
    if (table === schema.locationsTable) return [{ id: 31, name: "Clínica sintética", active: "true", empresaId: state.locationEmpresa }];
    if (table === schema.locationProfessionalsTable) return state.member ? [{ id: 1 }] : [];
    if (table === schema.budgetsTable) return [{ id: 8, clientId: 71, status: "presented" }];
    return [];
  }
  return { ...schema, db: {
    select: () => ({ from: (table: unknown) => {
      const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows(table)).then(yes, no) };
      chain.where = chain.limit = chain.orderBy = () => chain;
      return chain;
    } }),
    update: () => ({ set: (value: any) => ({ where: async () => { state.writes.push(value); } }) }),
  } };
});
vi.mock("../lib/motor-anamnese", () => ({
  computeMotor: vi.fn().mockResolvedValue({ gradeGlobal: "BASICA", exames: [] }), gatilhoBate: vi.fn(),
}));
vi.mock("../lib/lembrete-periodo", () => ({
  sincronizarLembretePrescricao: state.sync, executarLembretesPeriodo: vi.fn(),
}));
vi.mock("../lib/formula-manipulada", () => ({ enriquecerItemFormula: vi.fn() }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: state.wa, registrarLogMensagem: vi.fn() }));
vi.mock("../lib/telegram", () => ({ sendTelegram: state.tg }));
vi.mock("../routes/telegram-inbox", async () => ({ inboxRouter: (await import("express")).Router() }));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: unknown, _s: unknown, next: () => void) => next() }));
import router from "../routes/cockpit";
import { createCollaboratorToken } from "../lib/collaborator-auth";
const app = express().use(express.json()).use((req, _res, next) => {
  req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any; next();
}).use(router);
const finalize = () => request(app).post("/cockpit/71/emitir?empresaId=999")
  .set("Authorization", `Bearer ${createCollaboratorToken({ professionalId: 41, role: "executor" })}`);
beforeEach(() => {
  vi.clearAllMocks(); state.member = true; state.locationEmpresa = 21; state.writes = [];
  state.sync.mockResolvedValue({ formulas: 0, periodos: 0, horarios: [], ativo: false });
});
describe("finalização clínica do Cockpit não autoriza mensagens", () => {
  it("exige login antes de alterar orçamentos ou conteúdo", async () => {
    expect((await request(app).post("/cockpit/71/emitir")).status).toBe(401);
    expect(state.writes).toHaveLength(0); expect(state.sync).not.toHaveBeenCalled();
  });
  it.each(["sem vínculo", "empresa divergente"])("recusa %s antes dos efeitos", async scenario => {
    if (scenario === "sem vínculo") state.member = false;
    else state.locationEmpresa = 99;
    expect((await finalize()).status).toBe(403);
    expect(state.writes).toHaveLength(0); expect(state.sync).not.toHaveBeenCalled();
    expect(state.wa).not.toHaveBeenCalled();
  });
  it("prepara conteúdo e aprova orçamento, mas não dispara WhatsApp/Telegram nem abre fallback", async () => {
    const result = await finalize();
    expect(result.status).toBe(200);
    expect(result.body.orcamentosAprovados).toBe(1);
    expect(result.body.lembretes.ativo).toBe(false);
    expect(result.body.messaging).toEqual({ automaticSend: false, requiresRecipientConfirmation: true });
    expect(result.body.whatsapp).toBeUndefined();
    expect(state.sync).toHaveBeenCalledWith(71, []);
    expect(state.wa).not.toHaveBeenCalled(); expect(state.tg).not.toHaveBeenCalled();
  });
  it("falha ao preparar lembrete não transforma finalização em envio ou falso agendamento", async () => {
    state.sync.mockRejectedValue(new Error("db unavailable"));
    const result = await finalize();
    expect(result.status).toBe(200); expect(result.body.lembretes.ativo).toBe(false);
    expect(state.wa).not.toHaveBeenCalled(); expect(state.tg).not.toHaveBeenCalled();
  });
});
