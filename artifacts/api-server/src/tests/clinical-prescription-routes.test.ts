import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const mock = vi.hoisted(() => ({
  results: [] as any[][], insert: vi.fn(), send: vi.fn(), generate: vi.fn(), authorize: vi.fn(),
  generatePdf: vi.fn(async (..._args: unknown[]) => new Uint8Array([1])),
  values: vi.fn(), alert: vi.fn(), baseUrl: "https://test.invalid",
  accessMode: "direto" as "direto" | "conferir" | "bloqueado",
}));
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
    update: () => ({ set: () => ({ where: async () => [] }) }),
    transaction: async (callback: (tx: any) => Promise<any>) => callback({
      select: () => ({ from: () => {
        const rows = mock.results.shift() ?? [];
        const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows).then(yes, no) };
        chain.where = () => chain;
        chain.limit = async () => rows;
        return chain;
      } }),
      insert: mock.insert,
      update: () => ({ set: () => ({ where: async () => [] }) }),
    }),
  },
}));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: any, _s: any, next: any) => next() }));
vi.mock("../lib/clinical-access", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/clinical-access")>(),
  clinicalToolAccess: async () => ({ mode: mock.accessMode }),
  currentResponsibleDoctor: async () => null,
}));
vi.mock("../lib/desmembramento", () => ({ planDesmembramento: mock.generate }));
vi.mock("../lib/sncr", () => ({ consumeSncrNumber: mock.generate }));
vi.mock("../lib/prescription-pdf", () => ({ generateRecipePdf: mock.generate }));
vi.mock("../lib/prescription-signing", () => ({
  resolvePrescriptionSigner: vi.fn().mockResolvedValue({ meta: { validTo: "2035-01-01" } }),
  signExistingPrescriptionPdf: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));
vi.mock("../lib/google-drive", () => ({ ensurePharmacyDayFolder: mock.generate, uploadFileToDrive: mock.generate }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: mock.send }));
vi.mock("../lib/telegram", () => ({ sendTelegram: mock.send }));
vi.mock("../lib/anvisa-catalog", () => ({ recipeTypeForControlledClass: vi.fn() }));
vi.mock("../lib/sncr-alerts", () => ({ handleSncrAlert: mock.alert }));
vi.mock("../lib/receituario-motor.js", () => ({
  emitirReceituarioPdf: mock.send, getModeloAtivo: async () => ({ config: {} }),
}));
vi.mock("../lib/documentos/paxmed-2b-identidade-clinica", async (original) => ({
  ...await original<typeof import("../lib/documentos/paxmed-2b-identidade-clinica")>(),
  carregarIdentidadeClinica2b: async (empresaId: number) => ({
    empresaId, textos: { nomeCabecalho: "Empresa sintética", rodapeLinha1: "Empresa sintética",
      rodapeLinha2: "Endereço sintético", rodapeLinha3: "Cidade sintética" },
    simboloDourado: new Uint8Array([1]),
  }),
}));
vi.mock("../lib/receituario-pdf", () => ({ generateReceituarioPdfV2: mock.generatePdf }));
vi.mock("../routes/prescription-delivery", async (original) => ({
  ...await original<typeof import("../routes/prescription-delivery")>(),
  authorizedPrescription: mock.authorize,
}));
vi.mock("../lib/messaging/base-url.js", () => ({ baseUrlFromEnv: () => mock.baseUrl }));
vi.mock("../lib/lembrete-periodo", () => ({ sincronizarLembretePrescricao: mock.generate }));
vi.mock("../lib/lembrete-templates", () => ({ templateLembretePrescricao: vi.fn() }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: vi.fn() }));
import router, { protectedRecipeHash } from "../routes/prescriptions";
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
const authenticatedProfessional = { id: 41, role: "executor", active: true, credentialVersion: 0 };
beforeEach(() => { vi.clearAllMocks(); mock.results = []; mock.accessMode = "direto"; mock.baseUrl = "https://test.invalid"; mock.alert.mockResolvedValue(undefined); });
function setAuthenticatedQueryResults(...results: any[][]) {
  // requireCollaborator reads the authenticated account before clinical identity queries.
  mock.results = [[authenticatedProfessional], ...results];
}
function noEffects() {
  expect(mock.insert).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.generate).not.toHaveBeenCalled();
}
it("emissao anonima retorna 401 antes de gravar ou gerar", async () => {
  expect((await request(app).post("/prescriptions/emit").send(body)).status).toBe(401);
  noEffects();
});
it.each(["conferir", "bloqueado"] as const)("emissão direta recusa o modo %s sem criar documento nem enviar", async mode => {
  mock.accessMode = mode;
  setAuthenticatedQueryResults();
  const response = await request(app).post("/prescriptions/emit")
    .set("Authorization", `Bearer ${token()}`).send(body);
  expect(response.status).toBe(403);
  noEffects();
});
it("identidade explicita de outro medico retorna 403", async () => {
  setAuthenticatedQueryResults([professional], [client], [location], [{ id: 1 }]);
  const response = await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`)
    .send({ ...body, professionalId: 42 });
  expect(response.status).toBe(403); noEffects();
});
it("ausencia de UF bloqueia antes de gravar, mesmo com UF falsificada no corpo", async () => {
  setAuthenticatedQueryResults([{ ...professional, crm: "12345" }], [client], [location], [{ id: 1 }]);
  const response = await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`)
    .send({ ...body, professionalUf: "SP" });
  expect(response.status).toBe(422); expect(response.body.error).toContain("federativa"); noEffects();
});
it("cliente de empresa diferente e rejeitado antes de gravar", async () => {
  setAuthenticatedQueryResults([professional], [{ ...client, empresaId: 22 }], [location], [{ id: 1 }]);
  expect((await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`).send(body)).status).toBe(403);
  noEffects();
});
it("contexto protegido nao revela dados sem login", async () => {
  const response = await request(app).get("/clinical-context/71");
  expect(response.status).toBe(401); expect(response.body.professional).toBeUndefined(); noEffects();
});
it("acesso à receita exige sessão, médico original e cópia íntegra", async () => {
  const { createHash } = await import("node:crypto");
  expect(protectedRecipeHash("a".repeat(43))).not.toBe(createHash("sha256").update("a".repeat(43)).digest("hex"));
  const route = `/recipes/secure/${"a".repeat(43)}`;
  expect((await request(app).get(route)).status).toBe(401);
  const pdf = Buffer.from("pdf sintetico");
  const recipe = { prescriptionId: 100, status: "generated", pdfData: pdf.toString("base64"),
    qrPdfSha256: createHash("sha256").update(pdf).digest("hex"), qrExpiresAt: new Date(Date.now() + 60_000) };
  const get = () => request(app).get(route).set("Authorization", `Bearer ${token()}`);
  const context = { pres: { status: "emitted", signatureStatus: "signed", professionalId: 41 },
    identity: { professional: { id: 41 } } };
  mock.authorize.mockResolvedValue(context);
  setAuthenticatedQueryResults([recipe]);
  const valid = await get();
  expect(valid.status).toBe(200);
  expect(valid.headers["content-type"]).toContain("application/pdf");
  setAuthenticatedQueryResults([{ ...recipe, qrPdfSha256: "0".repeat(64) }]);
  expect((await get()).status).toBe(404);
  mock.authorize.mockResolvedValue({ ...context, identity: { professional: { id: 42 } } });
  setAuthenticatedQueryResults([recipe]);
  expect((await get()).status).toBe(404);
  setAuthenticatedQueryResults([{ ...recipe, qrExpiresAt: new Date(0) }]);
  expect((await get()).status).toBe(404);
});
it("contexto autenticado usa cadastro e nao identificadores da query", async () => {
  setAuthenticatedQueryResults([professional], [client], [location], [{ id: 1 }]);
  const response = await request(app).get("/clinical-context/71?professionalId=42&empresaId=22")
    .set("Authorization", `Bearer ${token()}`);
  expect(response.status).toBe(200); expect(response.body.professional.id).toBe(41);
  expect(response.body.clinic.empresaId).toBe(21);
  expect(response.headers["cache-control"]).toBe("no-store"); noEffects();
});
it("prescricao autorizada grava identidade canonica e passa ids corretos ao motor sem copia fixa", async () => {
  // Authentication lookup + four identity lookups + client resolver + reminder + pharmacies.
  setAuthenticatedQueryResults([professional], [client], [location], [{ id: 1 }], [client], [], []);
  mock.values.mockReturnValue({ returning: async () => [{ id: 101 }] });
  mock.insert.mockReturnValue({ values: mock.values });
  mock.generate.mockReturnValue([]);
  mock.send.mockResolvedValue({ fileName: "sintetico.pdf", emailSent: false });
  const response = await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`).send({
    ...body, professionalName: "Nome falsificado", professionalCrm: "99999", professionalUf: "RJ",
    clientEmail: "destino-nao-autorizado@example.invalid",
    items: [{ name: "Formula sintetica" }],
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  expect(mock.values).toHaveBeenCalledWith(expect.objectContaining({
    clientId: 71, clientName: client.name, clientEmail: null, professionalId: 41,
    professionalName: professional.name, professionalCrm: "12345", professionalUf: "SP", empresaId: 21,
  }));
  expect(mock.send).not.toHaveBeenCalled();
});
it("domínio inválido bloqueia a emissão antes de gravar prescrição ou consumir numeração", async () => {
  setAuthenticatedQueryResults([professional], [client], [location], [{ id: 1 }], [client], [], []);
  mock.baseUrl = "http://inseguro.invalid";
  mock.generate.mockReturnValue([]);
  const response = await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`)
    .send({ ...body, items: [{ name: "Fórmula sintética" }] });
  expect(response.status).toBe(503);
  expect(mock.insert).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
});
it.each([
  { status: "consumed", low: true, remaining: 4, number: "1234", expected: "low" },
  { status: "exhausted", low: true, remaining: 0, number: null, expected: "exhausted" },
  { status: "no_range", low: true, remaining: null, number: null, expected: "no_range" },
])("emissão preserva cartões SNCR $expected sem destinatários externos", async sncr => {
  setAuthenticatedQueryResults([professional], [client], [location], [{ id: 1 }], [client], [], []);
  mock.values.mockReturnValue({ returning: async () => [{ id: 101 }] });
  mock.insert.mockReturnValue({ values: mock.values });
  const plan = { needsSncr: true, recipeType: "controlado_isolado", anvisaType: "A",
    pharmacyId: null, title: "Receita sintética", items: [] };
  mock.generate.mockImplementation((arg: any) => {
    if (Array.isArray(arg)) return [plan];
    if (typeof arg === "number") return Promise.resolve({ ativo: false });
    if ("controlledType" in arg) return Promise.resolve({ ...sncr, rangeId: 1 });
    return Promise.resolve(new Uint8Array([1, 2, 3]));
  });
  mock.send.mockResolvedValue({ fileName: "sintetico.pdf", emailSent: false });
  const result = await request(app).post("/prescriptions/emit").set("Authorization", `Bearer ${token()}`)
    .send({ ...body, items: [{ name: "Fórmula sintética", isControlled: true, anvisaType: "A" }] });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  expect(mock.generatePdf).toHaveBeenCalledOnce();
  expect(mock.generatePdf.mock.calls[0][0]).toMatchObject({
    modeloGrandFinaleClinico: true,
    contextoGrandFinale: expect.objectContaining({ clinic: expect.objectContaining({ empresaId: 21 }) }),
    identidade2bClinica: expect.objectContaining({ empresaId: 21 }),
    numeroReceita: sncr.number ?? undefined,
  });
  expect(mock.generatePdf.mock.calls[0][0]).not.toHaveProperty("designerConfig");
  expect(mock.generatePdf.mock.calls[0][0]).not.toHaveProperty("bandModel");
  expect(mock.alert).toHaveBeenCalledWith(expect.objectContaining({
    status: sncr.expected, controlledType: "A", uf: "SP", clientId: 71, prescriptionId: 101,
  }), { notifyEmail: false });
  expect(mock.send).not.toHaveBeenCalled();
});
