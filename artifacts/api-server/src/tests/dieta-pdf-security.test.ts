import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mock = vi.hoisted(() => ({
  results: [] as any[][],
  insertValues: [] as any[],
  updateValues: [] as any[],
  updateResults: [] as any[][],
  pdf: vi.fn(),
  ensure: vi.fn(),
  upload: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  getPlan: vi.fn(),
  send: vi.fn(),
  db: {
    select: () => ({ from: () => ({ where: () => ({
      limit: async () => mock.results.shift() ?? [],
    }) }) }),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(async (callback: (tx: any) => Promise<any>) =>
      callback({ insert: mock.db.insert }),
    ),
  },
}));

vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: mock.db,
}));
vi.mock("../lib/dieta-pdf", () => ({ gerarDietaPdf: mock.pdf }));
vi.mock("../lib/dieta-planos-storage", () => ({
  ensureDietaPlanosTable: mock.ensure,
  uploadDietaPdf: mock.upload,
  readDietaPdf: mock.read,
  listPlanosByCliente: mock.list,
  getPlanoById: mock.getPlan,
}));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: mock.send }));
vi.mock("../lib/messaging/render-email", () => ({ renderPaxterEmail: () => "<p>synthetic</p>" }));
vi.mock("../lib/messaging/base-url", () => ({ baseUrlFromEnv: () => "https://example.invalid" }));
vi.mock("../lib/dieta-calc", () => ({
  calcularTdee: () => ({ tmb: 1500, tdee: 2200, caloriasAlvo: 2200 }),
}));

import dietaPdfRouter from "../routes/dieta-pdf";
import prontuarioRouter from "../routes/prontuario";
import { createCollaboratorToken } from "../lib/collaborator-auth";

const app = express().use(express.json()).use(dietaPdfRouter);
const prontuarioApp = express().use(express.json()).use(prontuarioRouter);
const token = () => createCollaboratorToken({ professionalId: 41, role: "executor" });
const pdfBytes = Buffer.from("%PDF-synthetic-plan");
const professional = {
  id: 41,
  name: "Medico Sintetico",
  professionalType: "medico",
  active: true,
  role: "executor",
  credentialVersion: 0,
  crm: "CRM/SP 12345",
  registrationNumber: null,
  registrationCouncil: "CRM",
  specialty: "Endocrinologia",
  signatureUrl: null,
  isPrimaryDoctor: false,
} as any;
const client = {
  id: 71,
  name: "Cliente Sintetico",
  email: "cliente@example.invalid",
  status: "active",
  empresaId: 21,
  locationId: 31,
} as any;
const location = { id: 31, name: "Clinica Sintetica", empresaId: 21, active: "true" } as any;
const validResults = () => [
  [{ id: 41, role: "executor", active: true, credentialVersion: 0 }],
  [professional],
  [client],
  [location],
  [{ id: 1 }],
];
const plan = (overrides: Record<string, unknown> = {}) => ({
  id: 901,
  clienteId: 71,
  empresaId: 21,
  professionalId: 41,
  locationId: 31,
  nomePaciente: "Cliente Sintetico",
  caloriasAlvo: 2200,
  estrategia: "Personalizada",
  emailDestino: "cliente@example.invalid",
  emailEnviado: false,
  emailStatus: "not_sent",
  pdfStorageKey: "private/dieta-planos/901.pdf",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mock.results = [];
  mock.insertValues = [];
  mock.updateValues = [];
  mock.updateResults = [];
  mock.db.insert.mockImplementation(() => ({
    values: (values: unknown) => {
      mock.insertValues.push(values);
      const id = mock.insertValues.length === 1 ? 901 : 501;
      return { returning: async () => [{ id }] };
    },
  }));
  mock.db.update.mockImplementation(() => ({
    set: (values: unknown) => {
      mock.updateValues.push(values);
      return {
        where: () => {
          const rows = mock.updateResults.shift() ?? [];
          const result: any = Promise.resolve(rows);
          result.returning = async () => rows;
          return result;
        },
      };
    },
  }));
  mock.ensure.mockResolvedValue(undefined);
  mock.upload.mockResolvedValue("private/dieta-planos/901.pdf");
  mock.read.mockResolvedValue(pdfBytes);
  mock.pdf.mockResolvedValue({
    pdfBytes: new Uint8Array(pdfBytes),
    plano: { refeicoes: [] },
    signatureImageEmbedded: false,
  });
  mock.send.mockResolvedValue({ success: true, messageId: "synthetic-message" });
});

describe("emissão e envio protegido do Plano Nutricional", () => {
  it("recusa emissão sem sessão antes de gerar, gravar ou armazenar", async () => {
    const response = await request(app).post("/dieta/emitir-pdf").send({
      clientId: 71, pesoKg: 70, alturaCm: 170, idade: 35,
    });

    expect(response.status).toBe(401);
    expect(mock.pdf).not.toHaveBeenCalled();
    expect(mock.db.insert).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
  });

  it("recusa cliente sem vínculo explícito antes de qualquer emissão", async () => {
    mock.results = validResults();
    mock.results[4] = [];
    const response = await request(app)
      .post("/dieta/emitir-pdf")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, pesoKg: 70, alturaCm: 170, idade: 35 });

    expect(response.status).toBe(403);
    expect(mock.pdf).not.toHaveBeenCalled();
    expect(mock.db.insert).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("recusa médico sem UF no registro antes de gerar o PDF", async () => {
    const noStateProfessional = { ...professional, crm: "12345", registrationCouncil: "CRM" };
    mock.results = validResults();
    mock.results[1] = [noStateProfessional];
    const response = await request(app)
      .post("/dieta/emitir-pdf")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, pesoKg: 70, alturaCm: 170, idade: 35 });

    expect(response.status).toBe(422);
    expect(mock.pdf).not.toHaveBeenCalled();
    expect(mock.db.insert).not.toHaveBeenCalled();
  });

  it("emite com o médico da sessão e grava cliente, unidade e empresa validados", async () => {
    mock.results = [...validResults(), [{
      nome: "Medico Sintetico",
      crm: "12345",
      registrationCouncil: "CRM",
      registrationNumber: null,
      especialidade: "Endocrinologia",
      signatureUrl: null,
    }]];
    mock.updateResults = [[{ id: 901 }]];
    const response = await request(app)
      .post("/dieta/emitir-pdf")
      .set("Authorization", `Bearer ${token()}`)
      .send({
        clientId: 71,
        nomePaciente: "Nome adulterado pelo navegador",
        email: "outro@example.invalid",
        professionalId: 99,
        locationId: 99,
        empresaId: 99,
        pesoKg: 70,
        alturaCm: 170,
        idade: 35,
      });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.headers["x-dieta-plan-id"]).toBe("901");
    expect(response.headers["x-dieta-email-target"]).toBe("cliente@example.invalid");
    expect(mock.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        nomePaciente: "Cliente Sintetico",
        email: "cliente@example.invalid",
        medico: expect.objectContaining({
          nome: "Medico Sintetico",
          crm: "12345",
          registrationCouncil: "CRM/SP",
        }),
      }),
      expect.any(AbortSignal),
    );
    expect(mock.insertValues[0]).toEqual(expect.objectContaining({
      clienteId: 71,
      empresaId: 21,
      professionalId: 41,
      locationId: 31,
      emailDestino: "cliente@example.invalid",
    }));
    expect(mock.insertValues[1]).toEqual(expect.objectContaining({
      clientId: 71,
      professionalId: 41,
    }));
    expect(mock.upload).toHaveBeenCalledWith(901, expect.any(Buffer));
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("não grava prescrição quando o PDF não foi persistido no armazenamento", async () => {
    mock.results = [...validResults(), [{
      nome: "Medico Sintetico",
      crm: "12345",
      registrationCouncil: "CRM",
      registrationNumber: null,
      especialidade: "Endocrinologia",
      signatureUrl: null,
    }]];
    mock.upload.mockRejectedValue(new Error("Falha simulada no armazenamento"));

    const response = await request(app)
      .post("/dieta/emitir-pdf")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, pesoKg: 70, alturaCm: 170, idade: 35 });

    expect(response.status).toBe(500);
    expect(mock.insertValues).toHaveLength(1); // apenas a linha histórica sem PDF
    expect(mock.db.transaction).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("não grava prescrição se o registro do arquivo no histórico falhar", async () => {
    mock.results = [...validResults(), [{
      nome: "Medico Sintetico",
      crm: "12345",
      registrationCouncil: "CRM",
      registrationNumber: null,
      especialidade: "Endocrinologia",
      signatureUrl: null,
    }]];
    mock.updateResults = [[]];

    const response = await request(app)
      .post("/dieta/emitir-pdf")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, pesoKg: 70, alturaCm: 170, idade: 35 });

    expect(response.status).toBe(500);
    expect(mock.upload).toHaveBeenCalledWith(901, expect.any(Buffer));
    expect(mock.db.transaction).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("envia o arquivo guardado, ignora PDF adulterado no corpo e registra quem confirmou", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan());
    mock.updateResults = [[{ id: 901 }], [{ id: 901 }]];

    const response = await request(app)
      .post("/dieta/enviar-pdf-email")
      .set("Authorization", `Bearer ${token()}`)
      .send({
        clientId: 71,
        planId: 901,
        pdfBase64: Buffer.from("PDF adulterado pelo navegador").toString("base64"),
        email: "attacker@example.invalid",
      });

    expect(response.status).toBe(200);
    expect(mock.getPlan).toHaveBeenCalledWith(901, 21, 31);
    expect(mock.read).toHaveBeenCalledWith("private/dieta-planos/901.pdf");
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "cliente@example.invalid",
      attachments: [expect.objectContaining({ content: pdfBytes })],
    }));
    expect(mock.updateValues).toContainEqual({ emailStatus: "sending" });
    expect(mock.updateValues).toContainEqual(expect.objectContaining({
      emailEnviado: true,
      emailStatus: "sent",
      emailEnviadoPor: 41,
      emailDestino: "cliente@example.invalid",
    }));
  });

  it("recusa envio se o plano pertence a outro cliente ou emissor", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan({ clienteId: 72, professionalId: 42 }));

    const response = await request(app)
      .post("/dieta/enviar-pdf-email")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, planId: 901 });

    expect(response.status).toBe(404);
    expect(mock.read).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("bloqueia confirmação repetida sem chamar o provedor", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan({ emailEnviado: true, emailStatus: "sent" }));

    const response = await request(app)
      .post("/dieta/enviar-pdf-email")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, planId: 901 });

    expect(response.status).toBe(409);
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.db.update).not.toHaveBeenCalled();
  });

  it("bloqueia corrida quando outra confirmação já reservou o envio", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan());
    mock.updateResults = [[]];

    const response = await request(app)
      .post("/dieta/enviar-pdf-email")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, planId: 901 });

    expect(response.status).toBe(409);
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("não marca como enviado quando o provedor simulado retorna falha", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan());
    mock.updateResults = [[{ id: 901 }], []];
    mock.send.mockResolvedValue({ success: false, error: "Falha simulada" });

    const response = await request(app)
      .post("/dieta/enviar-pdf-email")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, planId: 901 });

    expect(response.status).toBe(502);
    expect(mock.updateValues).toContainEqual({ emailStatus: "failed" });
    expect(mock.updateValues).not.toContainEqual(expect.objectContaining({ emailEnviado: true }));
  });

  it("não declara sucesso quando a entrega simulada ocorre mas o histórico não confirma", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan());
    mock.updateResults = [[{ id: 901 }], []];

    const response = await request(app)
      .post("/dieta/enviar-pdf-email")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, planId: 901 });

    expect(response.status).toBe(502);
    expect(response.body.error).toContain("Confira o histórico");
    expect(mock.send).toHaveBeenCalledTimes(1);
  });

  it("lista o histórico somente para o cliente e a unidade autenticados", async () => {
    mock.results = validResults();
    mock.list.mockResolvedValue([plan()]);

    const response = await request(app)
      .get("/dieta/planos-emitidos?clienteId=71")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(mock.list).toHaveBeenCalledWith(71, 21, 31);
    expect(response.body).toEqual([
      expect.objectContaining({ clienteId: 71, locationId: 31, emailStatus: "not_sent" }),
    ]);
  });

  it("baixa o PDF privado só no escopo autenticado", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan());

    const response = await request(app)
      .get("/dieta/planos-emitidos/901/pdf?clienteId=71")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(mock.getPlan).toHaveBeenCalledWith(901, 21, 31);
    expect(mock.read).toHaveBeenCalledWith("private/dieta-planos/901.pdf");
  });

  it("não baixa o PDF quando a unidade registrada não corresponde", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan({ locationId: 32 }));

    const response = await request(app)
      .get("/dieta/planos-emitidos/901/pdf?clienteId=71")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(404);
    expect(mock.read).not.toHaveBeenCalled();
  });

  it("não lê nem reenvia o PDF de outro cliente ou unidade", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan({ locationId: 32 }));

    const response = await request(app)
      .post("/dieta/planos-emitidos/901/reenviar")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, email: "alternativo@example.invalid" });

    expect(response.status).toBe(404);
    expect(mock.read).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("reenvia para o endereço confirmado sem alterar o e-mail do cliente", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan({ emailEnviado: true, emailStatus: "sent" }));
    mock.updateResults = [[{ id: 901 }], [{ id: 901 }]];

    const response = await request(app)
      .post("/dieta/planos-emitidos/901/reenviar")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71, email: "alternativo@example.invalid" });

    expect(response.status).toBe(200);
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "alternativo@example.invalid",
      attachments: [expect.objectContaining({ content: pdfBytes })],
    }));
    expect(mock.updateValues).toContainEqual(expect.objectContaining({
      emailDestino: "alternativo@example.invalid",
      emailEnviadoPor: 41,
      emailStatus: "sent",
    }));
  });

  it("impede dois reenvios concorrentes do mesmo plano", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan({ emailEnviado: true, emailStatus: "sent" }));
    mock.updateResults = [[]];

    const response = await request(app)
      .post("/dieta/planos-emitidos/901/reenviar")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71 });

    expect(response.status).toBe(409);
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("marca reenvio com resposta incerta sem permitir repetição automática", async () => {
    mock.results = validResults();
    mock.getPlan.mockResolvedValue(plan({ emailEnviado: true, emailStatus: "sent" }));
    mock.updateResults = [[{ id: 901 }]];
    mock.send.mockRejectedValue(new Error("Falha simulada após possível entrega"));

    const response = await request(app)
      .post("/dieta/planos-emitidos/901/reenviar")
      .set("Authorization", `Bearer ${token()}`)
      .send({ clientId: 71 });

    expect(response.status).toBe(502);
    expect(response.body.error).toContain("incerto");
    expect(mock.updateValues).toContainEqual(expect.objectContaining({
      emailStatus: "sending",
      emailDestino: "cliente@example.invalid",
      emailEnviadoPor: 41,
    }));
    expect(mock.updateValues).not.toContainEqual(expect.objectContaining({ emailStatus: "sent" }));
  });

  it("exige colaborador e vínculo clínico também no prontuário que exibe Dieta", async () => {
    const response = await request(prontuarioApp).get("/prontuario/71");

    expect(response.status).toBe(401);
    expect(mock.pdf).not.toHaveBeenCalled();
    expect(mock.list).not.toHaveBeenCalled();
  });
});
