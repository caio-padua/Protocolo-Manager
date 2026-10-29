import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mock = vi.hoisted(() => ({
  results: [] as any[][],
  insert: vi.fn(), pdf: vi.fn(), send: vi.fn(),
}));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    select: () => ({ from: () => ({ where: () => ({
      limit: async () => mock.results.shift() ?? [],
    }) }) }),
    insert: mock.insert,
  },
}));
vi.mock("../lib/exam-request-pdf", () => ({ generateExamRequestPdf: mock.pdf }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: mock.send }));
import { medicalRegistration, validateClinicalIdentity, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { requireCollaborator } from "../routes/collaborator";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import examRouter from "../routes/exam-requests";

// Synthetic objects, isolated from the real database and external services.
const professional = { id: 41, name: "Medico sintetico", professionalType: "medico",
  active: true, crm: "CRM/SP 12345", registrationNumber: null, registrationCouncil: "CRM" } as any;
const client = { id: 71, name: "Cliente sintetico", status: "active", empresaId: 21, locationId: 31 } as any;
const location = { id: 31, name: "Clinica sintetica", empresaId: 21, active: "true" } as any;
const valid = () => ({ professional: { ...professional }, client: { ...client }, location: { ...location }, linked: true });
const app = express().use(express.json()).use(examRouter);
app.get("/context/:id", requireCollaborator, async (req, res) => {
  try { res.json(await resolveClinicalEmitter(req, Number(req.params.id))); }
  catch (err: any) { res.status(err.status ?? 500).json({ error: err.message }); }
});
const token = () => createCollaboratorToken({ professionalId: 41, role: "executor" });
beforeEach(() => { mock.results = []; vi.clearAllMocks(); });

describe("cadastro e autorizacao clinica", () => {
  it("resolve o medico real do cadastro sem medico principal fixo", () => {
    const ctx = validateClinicalIdentity(valid());
    expect(ctx.professional).toEqual({ id: 41, name: "Medico sintetico", crm: "12345", uf: "SP" });
    expect(ctx.clinic.empresaId).toBe(21);
  });
  it("aceita segundo medico com identidade propria", () => {
    const data = valid(); data.professional.id = 42; data.professional.name = "Segundo medico";
    expect(validateClinicalIdentity(data).professional.id).toBe(42);
  });
  it.each(["active", "professionalType"])("recusa profissional sem condicao %s", field => {
    const data = valid(); data.professional[field] = field === "active" ? false : "nao_medico";
    expect(() => validateClinicalIdentity(data)).toThrow("médico ativo");
  });
  it.each(["empresa", "local", "vinculo", "inativo", "clienteAusente", "empresaAusente", "profissionalAusente"])("recusa %s", condition => {
    const data = valid();
    if (condition === "empresa") data.location.empresaId = 22;
    if (condition === "local") data.location.id = 99;
    if (condition === "vinculo") data.linked = false;
    if (condition === "inativo") data.client.status = "inactive";
    if (condition === "clienteAusente") data.client = undefined;
    if (condition === "empresaAusente") data.client.empresaId = null;
    if (condition === "profissionalAusente") data.professional = undefined;
    expect(() => validateClinicalIdentity(data)).toThrow();
  });
  it("nao adivinha UF pela clinica", () => {
    const data = valid(); data.professional.crm = "12345"; data.location.estado = "SP";
    const ctx = validateClinicalIdentity(data);
    expect(ctx.professional.uf).toBeNull(); expect(ctx.canPrescribe).toBe(false);
  });
  it("aceita conselho com UF explicita e registro em minusculas", () => {
    expect(medicalRegistration({ crm: "12345", registrationNumber: null, registrationCouncil: "CRM/RJ" }).uf).toBe("RJ");
    expect(medicalRegistration({ crm: "crm/sp 12345", registrationNumber: null, registrationCouncil: null }).crm).toBe("12345");
  });
  it("rejeita conselho diferente, numero ausente e UF divergente", () => {
    expect(() => medicalRegistration({ crm: "12345", registrationNumber: null, registrationCouncil: "CRN" })).toThrow();
    expect(() => medicalRegistration({ crm: null, registrationNumber: null, registrationCouncil: "CRM" })).toThrow();
    expect(() => medicalRegistration({ crm: "CRM SP 12345", registrationNumber: null, registrationCouncil: "CRM/RJ" })).toThrow();
  });
});

describe("rotas reais com banco e provedores isolados", () => {
  it("contexto anonimo nao consulta nem revela identidade", async () => {
    expect((await request(app).get("/context/71")).status).toBe(401);
  });
  it("contexto usa o identificador autenticado e vinculo explicito", async () => {
    mock.results = [[professional], [client], [location], [{ id: 1 }]];
    const response = await request(app).get("/context/71?empresaId=999").set("Authorization", `Bearer ${token()}`);
    expect(response.status).toBe(200);
    expect(response.body.professional.id).toBe(41);
    expect(response.body.clinic.empresaId).toBe(21);
  });
  it.each([0, -1, 1.5])("rejeita identificador %s", async id => {
    expect((await request(app).get(`/context/${id}`).set("Authorization", `Bearer ${token()}`)).status).toBe(400);
  });
  it("pedido anonimo nao gera arquivo nem envia nem grava", async () => {
    const response = await request(app).post("/exam-requests/emit").send({ clientId: 71, items: [{ nomeExame: "Exame sintetico", tipo: "SANGUE" }] });
    expect(response.status).toBe(401);
    expect(mock.insert).not.toHaveBeenCalled(); expect(mock.pdf).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled();
  });
  it("pedido com outro medico no corpo e rejeitado antes de efeitos", async () => {
    mock.results = [[professional], [client], [location], [{ id: 1 }]];
    const response = await request(app).post("/exam-requests/emit").set("Authorization", `Bearer ${token()}`).send({
      clientId: 71, professionalId: 42, items: [{ nomeExame: "Exame sintetico", tipo: "SANGUE" }],
    });
    expect(response.status).toBe(403);
    expect(mock.insert).not.toHaveBeenCalled(); expect(mock.pdf).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled();
  });
  it("pedido sem vinculo e rejeitado antes de efeitos", async () => {
    mock.results = [[professional], [client], [location], []];
    const response = await request(app).post("/exam-requests/emit").set("Authorization", `Bearer ${token()}`).send({
      clientId: 71, items: [{ nomeExame: "Exame sintetico", tipo: "SANGUE" }],
    });
    expect(response.status).toBe(403);
    expect(mock.insert).not.toHaveBeenCalled(); expect(mock.pdf).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled();
  });
  it("pedido autorizado usa medico e cliente reais, persiste seus ids e nao envia sem escolha", async () => {
    mock.results = [[professional], [client], [location], [{ id: 1 }]];
    mock.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const values = vi.fn(() => ({ returning: async () => [{ id: 101 }] }));
    mock.insert.mockReturnValue({ values });
    const response = await request(app).post("/exam-requests/emit").set("Authorization", `Bearer ${token()}`).send({
      clientId: 71, items: [{ nomeExame: "Exame sintetico", tipo: "SANGUE" }],
    });
    expect(response.status).toBe(200);
    expect(mock.pdf).toHaveBeenCalledWith(expect.objectContaining({
      clientName: client.name, professionalName: professional.name, professionalCrm: "12345 / SP",
    }));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ clientId: 71, professionalId: 41 }));
    expect(mock.send).not.toHaveBeenCalled();
    expect(response.body.email.attempted).toBe(false);
  });
});
