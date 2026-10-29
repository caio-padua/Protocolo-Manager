import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mock = vi.hoisted(() => ({ rows: [] as unknown[][], where: vi.fn(), emit: vi.fn() }));
vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({}, { get: (_, key) => `${name}.${String(key)}` });
  return {
    db: { select: () => {
      const rows = mock.rows.shift() ?? [];
      const chain: any = { then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
      for (const method of ["from", "orderBy", "limit"]) chain[method] = () => chain;
      chain.where = (condition: unknown) => { mock.where(condition); return chain; };
      return chain;
    } },
    ...Object.fromEntries(["prescriptionsTable", "prescriptionItemsTable", "recipesTable", "pharmaciesTable",
      "dispatchLogTable", "catalogoItensTable", "catalogoFormulasTable", "lembretesPrescricaoTable",
      "clientsTable", "professionalsTable"].map((name) => [name, table(name)])),
  };
});
vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  and: (...conditions: unknown[]) => conditions,
  desc: vi.fn(), asc: vi.fn(), sql: vi.fn(),
}));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: () => 5 }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: () => void) => {
    if (!req.headers.authorization) return res.status(401).json({ error: "Login obrigatório" });
    req.collaborator = { professionalId: 1 };
    next();
  },
}));
vi.mock("../lib/receituario-motor.js", () => ({ emitirReceituarioPdf: mock.emit }));
vi.mock("../lib/desmembramento", () => ({ planDesmembramento: vi.fn() }));
vi.mock("../lib/sncr", () => ({ consumeSncrNumber: vi.fn() }));
vi.mock("../lib/prescription-pdf", () => ({ generateRecipePdf: vi.fn() }));
vi.mock("../lib/google-drive", () => ({ ensurePharmacyDayFolder: vi.fn(), uploadFileToDrive: vi.fn() }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/telegram", () => ({ sendTelegram: vi.fn() }));
vi.mock("../lib/anvisa-catalog", () => ({ recipeTypeForControlledClass: vi.fn() }));
vi.mock("../lib/sncr-alerts", () => ({ handleSncrAlert: vi.fn() }));
vi.mock("../lib/messaging/base-url.js", () => ({ baseUrlFromEnv: () => "https://example.com" }));
vi.mock("../lib/lembrete-periodo", () => ({ sincronizarLembretePrescricao: vi.fn() }));
vi.mock("../lib/lembrete-templates", () => ({ templateLembretePrescricao: vi.fn() }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: vi.fn() }));

import router from "../routes/prescriptions";
const app = express();
app.use(express.json(), router);
const post = () => request(app).post("/prescriptions/71/reenviar-email").set("Authorization", "Bearer test");

beforeEach(() => {
  mock.rows = [];
  mock.where.mockClear();
  mock.emit.mockReset();
});

describe("Reenvio de prescrição", () => {
  it("exige login antes de consultar ou enviar", async () => {
    expect((await request(app).post("/prescriptions/71/reenviar-email")).status).toBe(401);
    expect(mock.where).not.toHaveBeenCalled();
    expect(mock.emit).not.toHaveBeenCalled();
  });
  it("rejeita colaborador que não é CEO", async () => {
    mock.rows = [[{ isPrimaryDoctor: false }]];
    expect((await post()).status).toBe(403);
    expect(mock.where).toHaveBeenCalledTimes(1);
    expect(mock.emit).not.toHaveBeenCalled();
  });
  it("consulta a prescrição por ID e empresa; ausência no escopo não envia", async () => {
    mock.rows = [[{ isPrimaryDoctor: true }], []];
    expect((await post()).status).toBe(404);
    expect(mock.where).toHaveBeenLastCalledWith([
      { column: "prescriptionsTable.id", value: 71 },
      { column: "prescriptionsTable.empresaId", value: 5 },
    ]);
    expect(mock.emit).not.toHaveBeenCalled();
  });
  it("rejeita rascunho antes de gerar PDF", async () => {
    mock.rows = [[{ isPrimaryDoctor: true }], [{ status: "draft" }]];
    expect((await post()).status).toBe(422);
    expect(mock.emit).not.toHaveBeenCalled();
  });
  it("envia as fórmulas persistidas e retorna os destinatários", async () => {
    mock.rows = [[{ isPrimaryDoctor: true }], [{
      status: "emitted", clientName: "Teste", clientEmail: "patient@example.com",
    }], [{ name: "Fórmula persistida", posologia: "1 ao dia" }]];
    mock.emit.mockResolvedValue({ emailSent: true, fileName: "receita.pdf" });
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.body.destinatarios).toContain("patient@example.com");
    expect(response.body.emailSent).toBe(true);
    expect(mock.emit).toHaveBeenCalledWith(expect.objectContaining({
      formulas: [expect.objectContaining({ nome: "Fórmula persistida", posologia: "1 ao dia" })],
    }));
  });
});
