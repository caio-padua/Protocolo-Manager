/** Rubrica dentro do link de cadastro (rota pública por token). Banco, token e armazenamento simulados; imagens sintéticas. */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { rabisco, comoPng, comoJpeg } from "./helpers/rubrica-sintetica";

const mockToken = vi.fn();
vi.mock("../lib/portal-token.js", () => ({
  createRegistrationToken: vi.fn(),
  verifyRegistrationToken: (...a: unknown[]) => mockToken(...a),
}));
vi.mock("../lib/objectStorage.js", () => ({ ObjectStorageService: class { saveUploadObject = vi.fn(async () => undefined); } }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: vi.fn() }));
vi.mock("@workspace/integrations-gemini-ai", () => ({ ai: {} }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: vi.fn(), logAiUsage: vi.fn() }));

let cliente: { id: number; empresaId: number | null } | undefined;
const mockUpdate = vi.fn();
vi.mock("@workspace/db", () => {
  const sel: Record<string, unknown> = { from: () => sel, where: () => sel, limit: async () => (cliente ? [{ ...cliente, name: "Cliente Sintético" }] : []) };
  return {
    db: { select: () => sel, update: () => ({ set: (v: unknown) => ({ where: async () => { mockUpdate(v); } }) }) },
    clientsTable: new Proxy({}, { get: (_t, k) => ({ col: String(k) }) }),
  };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
const mockSalvar = vi.fn();
const mockTem = vi.fn();
vi.mock("../lib/client-rubrica", () => ({
  salvarRubricaCliente: (...a: unknown[]) => mockSalvar(...a),
  temRubricaAtiva: (...a: unknown[]) => mockTem(...a),
}));

import router from "../routes/client-registration";

const app = () => {
  const a = express();
  a.use((q, _s, n) => { (q as unknown as { log: object }).log = { info: vi.fn(), error: vi.fn() }; n(); });
  a.use(router);
  return a;
};
const png = comoPng(rabisco(400, 160, { grossura: 3 }));
const jpg = comoJpeg(rabisco(400, 160, { grossura: 3 }));

const base = (r: request.Test) =>
  r.field("token", "t").field("name", "Cliente Sintético").field("cpf", "00000000000").field("email", "a@b.co").field("phone", "11999999999").field("birthDate", "1980-01-02");

beforeEach(() => {
  vi.clearAllMocks();
  cliente = { id: 7, empresaId: 5 };
  mockToken.mockReturnValue(7);
  mockSalvar.mockResolvedValue({ alterada: true, atualizadaEm: new Date() });
  mockTem.mockResolvedValue(false);
});

describe("POST /client-registration/submit com rubrica", () => {
  it("sem rubrica: cadastro grava e a rubrica não é tocada", async () => {
    const r = await base(request(app()).post("/client-registration/submit"));
    expect(r.status).toBe(200);
    expect(r.body.rubrica).toBe("nao_enviada");
    expect(mockSalvar).not.toHaveBeenCalled();
  });
  it("com rubrica PNG: grava para o cliente do token e a empresa dele, sem profissional", async () => {
    const r = await base(request(app()).post("/client-registration/submit")).attach("rubrica", png, { filename: "r.png", contentType: "image/png" });
    expect(r.status).toBe(200);
    expect(r.body.rubrica).toBe("salva");
    expect(mockSalvar).toHaveBeenCalledTimes(1);
    expect(mockSalvar.mock.calls[0]![0]).toMatchObject({ clientId: 7, empresaId: 5, professionalId: null });
  });
  it("com rubrica JPEG também é aceita", async () => {
    const r = await base(request(app()).post("/client-registration/submit")).attach("rubrica", jpg, { filename: "r.jpg", contentType: "image/jpeg" });
    expect(r.body.rubrica).toBe("salva");
  });
  it("foto do rosto e rubrica juntas: as duas são recebidas, cada uma no seu campo", async () => {
    const r = await base(request(app()).post("/client-registration/submit"))
      .attach("file", png, { filename: "foto.png", contentType: "image/png" })
      .attach("rubrica", png, { filename: "r.png", contentType: "image/png" });
    expect(r.status).toBe(200);
    expect(r.body.photoUrl).toMatch(/^\/api\/storage\/objects\/uploads\/photos\/7-/);
    expect(r.body.rubrica).toBe("salva");
  });
  it("só a foto, sem rubrica: continua funcionando", async () => {
    const r = await base(request(app()).post("/client-registration/submit")).attach("file", png, { filename: "foto.png", contentType: "image/png" });
    expect(r.status).toBe(200);
    expect(r.body.photoUrl).toBeTruthy();
    expect(r.body.rubrica).toBe("nao_enviada");
  });
  it("imagem inválida: 400 e NADA é gravado (nem o cadastro)", async () => {
    const r = await base(request(app()).post("/client-registration/submit")).attach("rubrica", Buffer.from("isto não é imagem"), { filename: "r.png", contentType: "image/png" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/^Rubrica:/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSalvar).not.toHaveBeenCalled();
  });
  it("falha ao guardar a rubrica: cadastro fica salvo e o cliente é avisado", async () => {
    mockSalvar.mockRejectedValue(new Error("storage fora"));
    const r = await base(request(app()).post("/client-registration/submit")).attach("rubrica", png, { filename: "r.png", contentType: "image/png" });
    expect(r.status).toBe(200);
    expect(r.body.rubrica).toBe("falhou");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
  it("cliente sem clínica: recusa a rubrica sem gravar nada", async () => {
    cliente = { id: 7, empresaId: null };
    const r = await base(request(app()).post("/client-registration/submit")).attach("rubrica", png, { filename: "r.png", contentType: "image/png" });
    expect(r.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it("token inválido: 401 e nada é gravado", async () => {
    mockToken.mockReturnValue(null);
    const r = await base(request(app()).post("/client-registration/submit")).attach("rubrica", png, { filename: "r.png", contentType: "image/png" });
    expect(r.status).toBe(401);
    expect(mockSalvar).not.toHaveBeenCalled();
  });
});

describe("GET /client-registration/info", () => {
  it("informa só SE há rubrica, nunca a imagem nem a empresa", async () => {
    mockTem.mockResolvedValue(true);
    const r = await request(app()).get("/client-registration/info?token=t");
    expect(r.status).toBe(200);
    expect(r.body.hasRubrica).toBe(true);
    expect(r.body).not.toHaveProperty("empresaId");
    expect(mockTem).toHaveBeenCalledWith(7, 5);
  });
});
