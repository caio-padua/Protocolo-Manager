import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const mock = vi.hoisted(() => ({ rows: [] as any[][], emit: vi.fn() }));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: { select: () => ({ from: () => ({ where: () => ({
    limit: async () => mock.rows.shift() ?? [],
    then: (yes: any, no: any) => Promise.resolve(mock.rows.shift() ?? []).then(yes, no),
  }) }) }) },
}));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: any, _s: any, next: any) => next() }));
vi.mock("../lib/receituario-motor.js", () => ({
  emitirReceituarioPdf: mock.emit, garantirTabelaTokens: vi.fn(),
}));
import legacyRouter from "../routes/receituario";
import { createCollaboratorToken } from "../lib/collaborator-auth";
const app = express().use(express.json()).use((req, _res, next) => {
  req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  next();
}).use(legacyRouter);
const token = () => createCollaboratorToken({ professionalId: 41, role: "executor" });
const doctor = { id: 41, name: "Medico sintetico", active: true, role: "executor",
  credentialVersion: 0, professionalType: "medico", crm: "CRM/SP 12345" };
const client = { id: 71, name: "Cliente sintetico", status: "active", empresaId: 21, locationId: 31, email: "teste@example.invalid" };
const location = { id: 31, name: "Clinica sintetica", empresaId: 21, active: "true" };
const payload = { clientId: 71, patient: { nome: "Nome falso", email: "outro@example.invalid" },
  formulas: [{ nome: "Formula sintetica" }] };
beforeEach(() => {
  vi.clearAllMocks();
  mock.rows = [];
  mock.emit.mockResolvedValue({ pdf: new Uint8Array([1]), fileName: "sintetico.pdf", emailSent: false });
});
it.each(["emitir-prescricao", "emitir-cliente"])("%s rejeita anonimo e formulario sem cliente", async action => {
  const endpoint = `/receituario/${action}`;
  expect((await request(app).post(endpoint).send(payload)).status).toBe(401);
  mock.rows = [[doctor], [doctor]];
  const response = await request(app).post(endpoint).set("Authorization", `Bearer ${token()}`)
    .send({ patient: payload.patient, formulas: payload.formulas });
  expect(response.status).toBe(400);
  expect(mock.emit).not.toHaveBeenCalled();
});
it.each(["emitir-prescricao", "emitir-cliente"])("%s rejeita clinica de outra empresa", async action => {
  mock.rows = [[doctor], [doctor], [doctor], [client], [{ ...location, empresaId: 99 }], [{ id: 1 }]];
  const response = await request(app).post(`/receituario/${action}`)
    .set("Authorization", `Bearer ${token()}`).send(payload);
  expect(response.status).toBe(403); expect(mock.emit).not.toHaveBeenCalled();
});
it.each(["emitir-prescricao", "emitir-cliente"])("%s passa o medico vinculado e nao copia email livre", async action => {
  mock.rows = [[doctor], [doctor], [doctor], [client], [location], [{ id: 1 }], [client]];
  const response = await request(app).post(`/receituario/${action}`)
    .set("Authorization", `Bearer ${token()}`).send(payload);
  expect(response.status).toBe(200);
  expect(mock.emit).toHaveBeenCalledWith(expect.objectContaining({
    medicoId: 41, clinicaId: 31, emailTo: [],
    patient: expect.objectContaining({ nome: client.name, email: client.email }),
  }));
});
it("assinatura por imagem nao aceita anonimo", async () => {
  const response = await request(app).post("/receituario/assinar-imagem-pdf").send({
    pngBase64: "aW1hZ2Vt", patientName: "Nome falso", patientEmail: "outro@example.invalid",
  });
  expect(response.status).toBe(401);
  expect(mock.emit).not.toHaveBeenCalled();
});
it("assinatura rejeita imagem e destinatário livres antes de qualquer efeito", async () => {
  mock.rows = [[doctor], [doctor]];
  const response = await request(app).post("/receituario/assinar-imagem-pdf")
    .set("Authorization", `Bearer ${token()}`).send({
      pngBase64: "aW1hZ2Vt", patientName: "Nome falso", patientEmail: "outro@example.invalid",
    });
  expect(response.status).toBe(400);
  expect(response.body.error).toContain("Imagens");
  expect(mock.emit).not.toHaveBeenCalled();
});
it("rota reaberta usa médico, paciente e clínica autorizados sem destinatários", async () => {
  mock.rows = [[doctor], [doctor], [doctor], [client], [location], [{ id: 1 }]];
  const response = await request(app).post("/receituario/assinar-imagem-pdf")
    .set("Authorization", `Bearer ${token()}`).send({
      clientId: 71, formulas: [{ nome: "Formula sintetica", posologia: "Uso sintetico" }],
    });
  expect(response.status).toBe(200);
  expect(response.body.pdfBase64).toBe("AQ==");
  expect(response.body.emailSent).toBe(false);
  expect(mock.emit).toHaveBeenCalledWith(expect.objectContaining({
    emailTo: [], identity: expect.objectContaining({
      professional: expect.objectContaining({ id: 41 }),
      client: expect.objectContaining({ id: 71 }),
      clinic: expect.objectContaining({ id: 31 }),
    }),
  }));
});
it("rota reaberta impede outra clínica antes de chamar o motor", async () => {
  mock.rows = [[doctor], [doctor], [doctor], [client], [{ ...location, empresaId: 99 }], [{ id: 1 }]];
  const response = await request(app).post("/receituario/assinar-imagem-pdf")
    .set("Authorization", `Bearer ${token()}`).send({
      clientId: 71, formulas: [{ nome: "Formula sintetica", posologia: "Uso sintetico" }],
    });
  expect(response.status).toBe(403);
  expect(mock.emit).not.toHaveBeenCalled();
});
