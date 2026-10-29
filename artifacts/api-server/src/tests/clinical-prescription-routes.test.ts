import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const mock = vi.hoisted(() => ({ results: [] as any[][], insert: vi.fn(), send: vi.fn(), generate: vi.fn(), values: vi.fn() }));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    select: () => ({ from: () => {
      const rows = mock.results.shift() ?? [];
      const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows).then(yes, no) };
      chain.where = () => chain;
      chain.limit = async () => rows;
      return chain;
    } }),
    insert: mock.insert,
  },
}));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: any, _s: any, next: any) => next() }));
vi.mock("../lib/desmembramento", () => ({ planDesmembramento: mock.generate }));
vi.mock("../lib/sncr", () => ({ consumeSncrNumber: mock.generate }));
vi.mock("../lib/prescription-pdf", () => ({ generateRecipePdf: mock.generate }));
vi.mock("../lib/google-drive", () => ({ ensurePharmacyDayFolder: mock.generate, uploadFileToDrive: mock.generate }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: mock.send }));
vi.mock("../lib/telegram", () => ({ sendTelegram: mock.send }));
vi.mock("../lib/anvisa-catalog", () => ({ recipeTypeForControlledClass: vi.fn() }));
vi.mock("../lib/sncr-alerts", () => ({ handleSncrAlert: mock.send }));
vi.mock("../lib/receituario-motor.js", () => ({ emitirReceituarioPdf: mock.send }));
vi.mock("../lib/messaging/base-url.js", () => ({ baseUrlFromEnv: () => "" }));
vi.mock("../lib/lembrete-periodo", () => ({ sincronizarLembretePrescricao: mock.generate }));
vi.mock("../lib/lembrete-templates", () => ({ templateLembretePrescricao: vi.fn() }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: vi.fn() }));
import router from "../routes/prescriptions";
import { createCollaboratorToken } from "../lib/collaborator-auth";
const app = express().use(express.json()).use((req, _res, next) => {
  req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  next();
}).use(router);
app.use((error: any, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const professional = { id: 41, name: "Medico sintetico", active: true, professionalType: "medico", crm: "CRM/SP 12345" };
const client = { id: 71, name: "Cliente sintetico", cpf: null, email: null, phone: null, locationId: 31, empresaId: 21, status: "active" };
const location = { id: 31, name: "Clinica sintetica", empresaId: 21, active: "true" };
const token = () => createCollaboratorToken({ professionalId: 41, role: "executor" });
const body = { clientId: 71, clientName: "Nome enviado nao confiavel", items: [] };
beforeEach(() => { vi.clearAllMocks(); mock.results = []; });
function noEffects() {
  expect(mock.insert).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.generate).not.toHaveBeenCalled();
}
it("emissao anonima retorna 401 antes de gravar ou gerar", async () => {
  expect((await request(app).post("/prescriptions/emit").send(body)).status).toBe(401);
  noEffects();
});
it("identidade explicita de outro medico retorna 403", async () => {
  mock.results = [[professional], [client], [location], [{ id: 1 }]];
  const response = await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`)
    .send({ ...body, professionalId: 42 });
  expect(response.status).toBe(403); noEffects();
});
it("ausencia de UF bloqueia antes de gravar, mesmo com UF falsificada no corpo", async () => {
  mock.results = [[{ ...professional, crm: "12345" }], [client], [location], [{ id: 1 }]];
  const response = await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`)
    .send({ ...body, professionalUf: "SP" });
  expect(response.status).toBe(422); expect(response.body.error).toContain("federativa"); noEffects();
});
it("cliente de empresa diferente e rejeitado antes de gravar", async () => {
  mock.results = [[professional], [{ ...client, empresaId: 22 }], [location], [{ id: 1 }]];
  expect((await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`).send(body)).status).toBe(403);
  noEffects();
});
it("contexto protegido nao revela dados sem login", async () => {
  const response = await request(app).get("/clinical-context/71");
  expect(response.status).toBe(401); expect(response.body.professional).toBeUndefined(); noEffects();
});
it("contexto autenticado usa cadastro e nao identificadores da query", async () => {
  mock.results = [[professional], [client], [location], [{ id: 1 }]];
  const response = await request(app).get("/clinical-context/71?professionalId=42&empresaId=22")
    .set("Authorization", `Bearer ${token()}`);
  expect(response.status).toBe(200); expect(response.body.professional.id).toBe(41);
  expect(response.body.clinic.empresaId).toBe(21);
  expect(response.headers["cache-control"]).toBe("no-store"); noEffects();
});
it("prescricao autorizada grava identidade canonica e passa ids corretos ao motor sem copia fixa", async () => {
  // Four context lookups + safe client resolver + reminder lookup + pharmacies.
  mock.results = [[professional], [client], [location], [{ id: 1 }], [client], [], []];
  mock.values.mockReturnValue({ returning: async () => [{ id: 101 }] });
  mock.insert.mockReturnValue({ values: mock.values });
  mock.generate.mockReturnValue([]);
  mock.send.mockResolvedValue({ fileName: "sintetico.pdf", emailSent: false });
  const response = await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`).send({
    ...body, professionalName: "Nome falsificado", professionalCrm: "99999", professionalUf: "RJ",
    clientEmail: "destino-nao-autorizado@example.invalid",
    items: [{ name: "Formula sintetica" }],
  });
  expect(response.status).toBe(201);
  expect(mock.values).toHaveBeenCalledWith(expect.objectContaining({
    clientId: 71, clientName: client.name, clientEmail: null, professionalId: 41,
    professionalName: professional.name, professionalCrm: "12345", professionalUf: "SP", empresaId: 21,
  }));
  expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
    medicoId: 41, clinicaId: 31, emailTo: [], patient: expect.objectContaining({ nome: client.name }),
  }));
});
