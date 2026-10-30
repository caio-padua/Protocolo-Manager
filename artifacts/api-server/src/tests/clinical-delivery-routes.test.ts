import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  allowed: true, phone: "+5500000000000", email: "patient@example.invalid", presEmail: "patient@example.invalid",
  empresa: 21, locationEmpresa: 21, issuer: 41, status: "emitted", member: true,
  startFails: false, finishFails: false, logs: [] as any[], providerLogs: [] as any[], recurring: [] as any[], conditions: [] as any[],
  wa: vi.fn(), tg: vi.fn(), mail: vi.fn(), motor: vi.fn(),
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("../../../../lib/db/src/schema");
  const rows = (table: unknown): any[] => {
    if (table === schema.prescriptionsTable) return state.allowed ? [{
      id: 101, clientId: 71, clientName: "Paciente sintético", clientEmail: state.presEmail,
      clientPhone: state.phone, clientCpf: null, empresaId: state.empresa, professionalId: state.issuer, status: state.status,
    }] : [];
    if (table === schema.clientsTable) return [{ id: 71, name: "Paciente sintético", status: "active",
      email: state.email, phone: state.phone, cpf: null, telegramChatId: "patient-chat", empresaId: state.empresa, locationId: 31 }];
    if (table === schema.professionalsTable) return [{ id: 41, name: "Médico sintético",
      active: true, professionalType: "medico", crm: "CRM/SP 12345" }];
    if (table === schema.locationsTable) return [{ id: 31, name: "Clínica sintética", empresaId: state.locationEmpresa, active: "true" }];
    if (table === schema.locationProfessionalsTable) return state.member ? [{ id: 1 }] : [];
    if (table === schema.recipesTable) return [
      { id: 1, prescriptionId: 101, pharmacyId: 8, pdfData: "cGRmMQ==", fileName: "um.pdf" },
      { id: 2, prescriptionId: 101, pharmacyId: 9, pdfData: "cGRmMg==", fileName: "dois.pdf" },
    ];
    if (table === schema.pharmaciesTable) return [
      { id: 8, name: "Farmácia vinculada", email: "pharmacy@example.invalid", whatsapp: "pharmacy-phone" },
      { id: 88, name: "Farmácia sem receita", email: "unrelated@example.invalid", whatsapp: "unrelated-phone" },
    ];
    if (table === schema.prescriptionItemsTable) return [{ name: "Fórmula sintética", posologia: "1 ao dia", dose: "10 mg", periodo: "manhã" }];
    if (table === schema.dispatchLogTable) return state.logs;
    if (table === schema.lembreteEnviosTable) return state.recurring;
    if (table === schema.whatsappMensagensLogTable) return state.providerLogs;
    return [];
  };
  return { ...schema, db: {
    select: () => ({ from: (table: unknown) => {
      const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows(table)).then(yes, no) };
      chain.where = (condition: any) => { state.conditions.push(condition); return chain; };
      chain.limit = chain.orderBy = chain.leftJoin = () => chain;
      return chain;
    } }),
    insert: () => ({ values: (value: any) => ({ returning: async () => {
      if (state.startFails) throw new Error("audit offline");
      const log = { ...value, id: state.logs.length + 1, createdAt: new Date() };
      state.logs.push(log); return [{ id: log.id }];
    } }) }),
    update: () => ({ set: (value: any) => ({ where: async () => {
      if (state.finishFails) throw new Error("audit update offline");
      Object.assign(state.logs[state.logs.length - 1], value);
    } }) }),
  } };
});
vi.mock("../lib/receituario-motor", () => ({ emitirReceituarioPdf: state.motor }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: state.wa }));
vi.mock("../lib/telegram", () => ({ sendTelegram: state.tg }));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: state.mail }));
vi.mock("../lib/prescription-reminder-message", () => ({
  prescriptionReminderMessage: vi.fn().mockResolvedValue("Orientações sintéticas"),
}));
import router from "../routes/prescription-delivery";
import { ClinicalIdentityError } from "../lib/clinical-emitter";
import { createCollaboratorToken } from "../lib/collaborator-auth";
const app = express().use(express.json()).use(router);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err instanceof ClinicalIdentityError ? err.status : 500).json({ error: err.message }));
const token = () => createCollaboratorToken({ professionalId: 41, role: "executor" });
const post = (body: unknown, path = "delivery") => request(app).post(`/prescriptions/101/${path}`)
  .set("Authorization", `Bearer ${token()}`).send(body as object);
const get = () => request(app).get("/prescriptions/101/delivery?empresaId=999&professionalId=999")
  .set("Authorization", `Bearer ${token()}`);
const body = (channel = "whatsapp", recipient = state.phone) => ({ confirmed: true, channel, recipient });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { allowed: true, member: true, phone: "+5500000000000",
    email: "patient@example.invalid", presEmail: "patient@example.invalid",
    empresa: 21, locationEmpresa: 21, issuer: 41, status: "emitted", startFails: false, finishFails: false,
    logs: [], providerLogs: [], recurring: [], conditions: [] });
  state.wa.mockResolvedValue({ sent: true, via: "twilio", logId: 501 });
  state.tg.mockResolvedValue({ sent: true });
  state.mail.mockResolvedValue({ success: true });
  state.motor.mockResolvedValue({ emailSent: true });
});

describe("entregas clínicas confirmadas (somente simulações)", () => {
  it.each(["delivery", "enviar-lembrete", "reenviar-email"])("%s bloqueia anônimo antes de qualquer efeito", async path => {
    expect((await request(app).post(`/prescriptions/101/${path}`).send(body())).status).toBe(401);
    expect(state.conditions).toHaveLength(0); expect(state.logs).toHaveLength(0);
    expect(state.wa).not.toHaveBeenCalled(); expect(state.motor).not.toHaveBeenCalled();
  });
  it("GET não expõe contatos sem autenticação", async () => {
    expect((await request(app).get("/prescriptions/101/delivery")).status).toBe(401);
    expect(state.conditions).toHaveLength(0);
  });
  it("consulta exige vínculo e ignora empresa/profissional da query", async () => {
    const result = await get();
    expect(result.status).toBe(200);
    const filter = new PgDialect().sqlToQuery(state.conditions[0]);
    expect(filter.sql).toContain("location_professionals");
    expect(filter.sql).toContain("empresa_id");
    expect(filter.params).toEqual([101, 41]);
    expect(result.body.targets).not.toEqual(expect.arrayContaining([expect.objectContaining({ recipient: "unrelated@example.invalid" })]));
  });
  it.each(["sem acesso", "sem vínculo", "empresa divergente", "contato divergente"])("bloqueia %s sem envio", async scenario => {
    if (scenario === "sem acesso") state.allowed = false;
    if (scenario === "sem vínculo") state.member = false;
    if (scenario === "empresa divergente") state.locationEmpresa = 22;
    if (scenario === "contato divergente") state.presEmail = "other@example.invalid";
    expect([403, 404]).toContain((await post(body())).status);
    expect(state.wa).not.toHaveBeenCalled(); expect(state.logs).toHaveLength(0);
  });
  it.each([{}, { confirmed: false }, { confirmed: true, channel: "ambos", recipient: "x" },
    { confirmed: true, channel: "email", recipient: "arbitrary@example.invalid" },
    { confirmed: true, channel: "whatsapp", recipient: "unrelated-phone", pharmacyId: 88 }])("rejeita ausência de confirmação/contato adulterado", async payload => {
    expect((await post(payload)).status).toBe(400);
    expect(state.logs).toHaveLength(0); expect(state.wa).not.toHaveBeenCalled(); expect(state.motor).not.toHaveBeenCalled();
  });
  it.each(["whatsapp", "telegram", "email"])("envia somente %s e persiste aceitação (não entrega)", async channel => {
    const recipient = channel === "email" ? state.email : channel === "telegram" ? "patient-chat" : state.phone;
    const result = await post(body(channel, recipient));
    expect(result.status).toBe(200); expect(result.body.status).toBe("accepted");
    expect(state.logs[0].status).toBe("accepted");
    expect(JSON.parse(state.logs[0].detail)).toMatchObject({ recipient, actorId: 41, clientId: 71 });
    expect(state.logs[0].empresaId).toBe(21);
    expect(state.wa).toHaveBeenCalledTimes(channel === "whatsapp" ? 1 : 0);
    expect(state.tg).toHaveBeenCalledTimes(channel === "telegram" ? 1 : 0);
    expect(state.motor).toHaveBeenCalledTimes(channel === "email" ? 1 : 0);
    if (channel === "whatsapp") expect(state.wa).toHaveBeenCalledWith(state.phone,
      expect.any(String), expect.objectContaining({ mirrorTelegram: false }));
    if (channel === "email") expect(state.motor).toHaveBeenCalledWith(expect.objectContaining({
      medicoId: 41, clinicaId: 31, emailTo: [state.email],
      identity: expect.objectContaining({
        professional: expect.objectContaining({ id: 41 }),
        client: expect.objectContaining({ id: 71 }),
        clinic: expect.objectContaining({ id: 31, empresaId: 21 }),
      }),
      formulas: [expect.objectContaining({ nome: "Fórmula sintética", posologia: "1 ao dia" })],
    }));
    const history = await get();
    expect(history.body.history[0].status).toBe("accepted");
  });
  it("farmácia recebe apenas os PDFs associados a ela e a esta prescrição", async () => {
    const result = await post({ ...body("email", "pharmacy@example.invalid"), pharmacyId: 8 });
    expect(result.body.status).toBe("accepted");
    expect(state.motor).not.toHaveBeenCalled();
    expect(state.mail).toHaveBeenCalledWith(expect.objectContaining({
      to: "pharmacy@example.invalid", attachments: [expect.objectContaining({ filename: "um.pdf" })],
    }));
  });
  it("outro médico não regenera documento com identidade de emissor errada", async () => {
    state.issuer = 42;
    expect((await post(body("email", state.email))).status).toBe(403);
    expect(state.motor).not.toHaveBeenCalled(); expect(state.logs).toHaveLength(0);
  });
  it.each(["recusa", "link", "exceção"])("registra falha de WhatsApp: %s", async scenario => {
    if (scenario === "exceção") state.wa.mockRejectedValue(new Error("provider down"));
    else state.wa.mockResolvedValue({ sent: false, via: scenario === "link" ? "link" : "twilio", error: scenario === "recusa" ? "63016" : undefined });
    const result = await post(body());
    expect(result.body.accepted).toBe(false); expect(result.body.status).toBe("failed");
    expect(state.logs[0].status).toBe("failed");
  });
  it.each(["email", "telegram"])("não anuncia sucesso quando %s recusa", async channel => {
    state.motor.mockResolvedValue({ emailSent: false, emailError: "recusado" });
    state.tg.mockResolvedValue({ sent: false, error: "chat inválido" });
    const result = await post(body(channel, channel === "email" ? state.email : "patient-chat"));
    expect(result.body.status).toBe("failed"); expect(result.body.accepted).toBe(false);
    expect(JSON.parse(state.logs[0].detail).error).toBeTruthy();
  });
  it("Telegram sem token retorna simulação, nunca aceitação", async () => {
    state.tg.mockResolvedValue({ sent: true, mock: true });
    const result = await post(body("telegram", "patient-chat"));
    expect(result.body.status).toBe("failed"); expect(result.body.accepted).toBe(false);
    expect(result.body.error).toContain("simulação");
  });
  it("não chama provedor se registro inicial falha", async () => {
    state.startFails = true;
    expect((await post(body())).status).toBe(500);
    expect(state.wa).not.toHaveBeenCalled();
  });
  it("registro final falho preserva pending e retorna desconhecido", async () => {
    state.finishFails = true;
    const result = await post(body());
    expect(result.body.status).toBe("unknown"); expect(result.body.accepted).toBe(false);
    expect(state.logs[0].status).toBe("pending");
  });
  it("Cockpit inclui falhas do lembrete recorrente sem chamá-las de entrega", async () => {
    state.recurring = [{ id: 2, status: "ENVIADO", providerStatus: "undelivered",
      recipient: state.phone, erro: "63016", janela: "2026-10-30 07:00", createdAt: new Date() }];
    const result = await get();
    expect(result.body.history[0]).toMatchObject({ channel: "whatsapp", status: "failed" });
    expect(JSON.parse(result.body.history[0].detail).label).toContain("Lembrete recorrente");
  });
  it.each(["undelivered", "failed"])("envio único inicialmente aceito passa a falha após retorno %s", async providerStatus => {
    expect((await post(body())).body.status).toBe("accepted");
    expect(JSON.parse(state.logs[0].detail).whatsappLogId).toBe(501);
    state.providerLogs = [{ id: 501, clienteId: 71, telefone: state.phone, status: providerStatus,
      errorCode: "twilio_63016", via: "whatsapp" }];
    const result = await get();
    expect(result.body.history[0].status).toBe("failed");
    expect(JSON.parse(result.body.history[0].detail)).toMatchObject({ error: "twilio_63016", providerStatus });
    expect(state.wa).toHaveBeenCalledTimes(1); // No automatic retry.
  });
  it("entrega posterior comprovada pelo provedor atualiza histórico", async () => {
    await post(body());
    state.providerLogs = [{ id: 501, clienteId: 71, telefone: state.phone, status: "delivered", via: "whatsapp" }];
    expect((await get()).body.history[0].status).toBe("delivered");
  });
  it("não reconcilia um retorno de destinatário diferente", async () => {
    await post(body());
    state.providerLogs = [{ id: 501, clienteId: 71, telefone: "other-phone", status: "failed", errorCode: "private" }];
    const result = await get();
    expect(result.body.history[0].status).toBe("accepted");
    expect(result.body.history[0].detail).not.toContain("private");
  });
  it.each(["reenviar-email", "enviar-lembrete"])("rota legada %s não envia por padrão", async path => {
    expect((await post({}, path)).status).toBe(400);
    expect(state.motor).not.toHaveBeenCalled(); expect(state.wa).not.toHaveBeenCalled();
  });
  it("rota de teste arbitrário está desativada", async () => {
    const result = await request(app).post("/prescriptions/test-email-receituario")
      .set("Authorization", `Bearer ${token()}`).send({ emailTo: "arbitrary@example.invalid" });
    expect(result.status).toBe(410); expect(state.motor).not.toHaveBeenCalled();
  });
});
