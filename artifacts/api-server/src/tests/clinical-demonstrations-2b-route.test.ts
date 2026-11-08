import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  identity: { professional: { id: 2, name: "PROFISSIONAL DE TESTE", crm: "123", uf: "SP" },
    client: { id: 3, name: "CLIENTE DE TESTE", cpf: null },
    clinic: { id: 4, empresaId: 5, name: "EMPRESA DE TESTE" }, canPrescribe: true },
  visual: { textos: { nomeCabecalho: "EMPRESA DE TESTE", rodapeLinha1: "EMPRESA DE TESTE",
    rodapeLinha2: "ENDERECO DE TESTE", rodapeLinha3: "CIDADE DE TESTE" }, simboloDourado: new Uint8Array([1]) },
  getIdentity: vi.fn(),
  prescription: vi.fn(),
  examination: vi.fn(),
  save: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@workspace/api-zod", () => ({ CreateClinicalDemonstrationBody: { safeParse: (data: unknown) => ({ success: true, data }) } }));
vi.mock("@workspace/db", () => {
  const table = { id: "id", name: "name", address: "address", phone: "phone", birthDate: "birth_date", signatureUrl: "signature_url" };
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{}] }) }) }) };
  return { db, clientsTable: table, locationsTable: table, professionalsTable: table };
});
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (req: any, _res: any, next: any) => {
  req.collaborator = { professionalId: 2 }; next();
} }));
vi.mock("../lib/clinical-emitter", () => ({
  ClinicalIdentityError: class extends Error { constructor(public status: number, msg: string) { super(msg); } },
  resolveClinicalEmitter: vi.fn(async () => state.identity),
}));
vi.mock("../lib/clinical-access", () => ({
  ClinicalAccessError: class extends Error { constructor(public status: number, msg: string) { super(msg); } },
  clinicalToolAccess: vi.fn(async () => ({ mode: "direto" })),
}));
vi.mock("../lib/prescription-signing", () => ({
  resolvePrescriptionSigner: vi.fn(async () => ({ meta: {} })),
  signExistingClinicalPdf: (...args: unknown[]) => state.sign(...args),
}));
vi.mock("../lib/documentos/paxmed-2b-identidade-clinica", () => ({
  IdentidadeEmpresa2bError: class extends Error { constructor(public status: number, msg: string) { super(msg); } },
  carregarIdentidadeClinica2b: (...args: unknown[]) => state.getIdentity(...args),
}));
vi.mock("../lib/receituario-pdf", () => ({ generateReceituarioPdfV2: (...args: unknown[]) => state.prescription(...args) }));
vi.mock("../lib/exam-request-pdf", () => ({ generateExamRequestPdf: (...args: unknown[]) => state.examination(...args) }));
vi.mock("../lib/exam-catalog-validation", () => ({ validateExamCatalogItems: async (items: unknown) => items }));
vi.mock("../lib/prescription-rendering", () => ({ prescriptionItemForDocument: (item: any) => ({ nome: item.name }) }));
vi.mock("../lib/receituario-motor", () => ({ getModeloAtivo: async () => ({ config: {} }) }));
vi.mock("../lib/objectStorage", () => ({ ObjectStorageService: class {} }));
vi.mock("../lib/clinical-demonstration-store", () => ({
  kindFromId: () => null, listDemonstrations: async () => [], readDemonstration: vi.fn(),
  saveDemonstration: (...args: unknown[]) => state.save(...args),
}));

import router from "../routes/clinical-demonstrations";
import { IdentidadeEmpresa2bError } from "../lib/documentos/paxmed-2b-identidade-clinica";
const app = express().use(express.json()).use(router);

describe("Demonstração clínica usa a empresa autorizada", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    state.getIdentity.mockReset().mockResolvedValue(state.visual);
    state.prescription.mockReset().mockResolvedValue(new Uint8Array([1]));
    state.examination.mockReset().mockResolvedValue(new Uint8Array([2]));
    state.sign.mockReset().mockResolvedValue(new Uint8Array([3]));
    state.save.mockReset().mockResolvedValue("documento-teste");
  });

  it.each([
    ["prescricao", { kind: "prescricao", prescriptionItems: [{ name: "FORMULA" }] }],
    ["exames", { kind: "exames", examItems: [{ nomeExame: "EXAME", tipo: "SANGUE" }] }],
  ])("encaminha a identidade correta para o motor de %s", async (kind, body) => {
    const response = await request(app).post("/clinical-demonstrations/3?modelo=paxmed-2b").send(body);
    expect(response.status).toBe(201);
    expect(state.getIdentity).toHaveBeenCalledWith(state.identity.clinic.empresaId);
    const motor = kind === "prescricao" ? state.prescription : state.examination;
    expect(motor.mock.calls[0][0]).toMatchObject({ modelo2bProva: true, identidade2bProva: state.visual, homologacao: true });
    if (kind === "prescricao") {
      expect(motor.mock.calls[0][0]).not.toHaveProperty("designerConfig");
      expect(motor.mock.calls[0][0]).not.toHaveProperty("bandModel");
    }
    expect(state.save).toHaveBeenCalledOnce();
  });

  it("não gera nem salva se a identidade da empresa for recusada", async () => {
    state.getIdentity.mockRejectedValue(new IdentidadeEmpresa2bError(422, "Identidade indisponível."));
    const response = await request(app).post("/clinical-demonstrations/3?modelo=paxmed-2b")
      .send({ kind: "exames", examItems: [{ nomeExame: "EXAME", tipo: "SANGUE" }] });
    expect(response.status).toBe(422);
    expect(state.examination).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("não exige identidade 2B na demonstração anterior", async () => {
    const response = await request(app).post("/clinical-demonstrations/3")
      .send({ kind: "exames", examItems: [{ nomeExame: "EXAME", tipo: "SANGUE" }] });
    expect(response.status).toBe(201);
    expect(state.getIdentity).not.toHaveBeenCalled();
    expect(state.examination.mock.calls[0][0]).not.toHaveProperty("modelo2bProva");
  });

  it("não ativa o modelo de teste em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await request(app).post("/clinical-demonstrations/3?modelo=paxmed-2b")
      .send({ kind: "exames", examItems: [{ nomeExame: "EXAME", tipo: "SANGUE" }] });
    expect(response.status).toBe(404);
    expect(state.getIdentity).not.toHaveBeenCalled();
    expect(state.examination).not.toHaveBeenCalled();
  });
});
