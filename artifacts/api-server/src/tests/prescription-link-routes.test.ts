import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  results: [] as any[][], conditions: [] as any[],
  insert: vi.fn(), send: vi.fn(), sync: vi.fn(),
}));
vi.mock("@workspace/db", async () => {
  const { clientsTable } = await import("../../../../lib/db/src/schema/clients");
  const prescriptions = await import("../../../../lib/db/src/schema/prescriptions");
  return {
    ...prescriptions, clientsTable, pharmaciesTable: {}, dispatchLogTable: {},
    catalogoItensTable: {}, catalogoFormulasTable: {}, lembretesPrescricaoTable: {},
    db: {
      insert: mocks.insert,
      select: () => ({ from: () => ({ where: (condition: unknown) => {
        mocks.conditions.push(condition);
        const rows = mocks.results.shift() ?? [];
        return Object.assign(Promise.resolve(rows), { limit: async () => rows });
      } }) }),
    },
  };
});
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: () => 5 }));
vi.mock("../lib/desmembramento", () => ({ planDesmembramento: vi.fn() }));
vi.mock("../lib/sncr", () => ({ consumeSncrNumber: vi.fn() }));
vi.mock("../lib/prescription-pdf", () => ({ generateRecipePdf: vi.fn() }));
vi.mock("../lib/google-drive", () => ({ ensurePharmacyDayFolder: vi.fn(), uploadFileToDrive: vi.fn() }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: mocks.send }));
vi.mock("../lib/telegram", () => ({ sendTelegram: mocks.send }));
vi.mock("../lib/anvisa-catalog", () => ({ recipeTypeForControlledClass: vi.fn() }));
vi.mock("../lib/sncr-alerts", () => ({ handleSncrAlert: vi.fn() }));
vi.mock("../lib/receituario-motor.js", () => ({ emitirReceituarioPdf: mocks.send }));
vi.mock("../lib/messaging/base-url.js", () => ({ baseUrlFromEnv: () => "" }));
vi.mock("../lib/lembrete-periodo", () => ({ sincronizarLembretePrescricao: mocks.sync }));
vi.mock("../lib/lembrete-templates", () => ({ templateLembretePrescricao: vi.fn() }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: vi.fn() }));
import router from "../routes/prescriptions";

const app = express().use(express.json()).use(router);
beforeEach(() => {
  mocks.results = [];
  mocks.conditions = [];
  vi.clearAllMocks();
});
function noSideEffects() {
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
}
it("emissão com CPF ausente e email divergente falha antes de salvar/enviar", async () => {
  mocks.results = [[{ id: 11, name: "Paciente teste", email: "one@test", cpf: null }]];
  const res = await request(app).post("/prescriptions/emit").send({
    clientId: 11, clientName: "Paciente teste", clientEmail: "other@test", items: [],
  });
  expect(res.status).toBe(422);
  noSideEffects();
});
it("reenvio não carrega prescrição de outra empresa", async () => {
  mocks.results = [[]];
  expect((await request(app).post("/prescriptions/1/enviar-lembrete").send({})).status).toBe(404);
  expect(new PgDialect().sqlToQuery(mocks.conditions[0]).params).toEqual([1, 5]);
  noSideEffects();
});
it("reenvio de CPF duplicado não escolhe primeiro e consulta apenas a empresa atual", async () => {
  mocks.results = [
    [{ id: 1, empresaId: 5, clientId: null, clientCpf: "111.222.333-44" }],
    [{ id: 11, cpf: "11122233344" }, { id: 12, cpf: "11122233344" }],
  ];
  expect((await request(app).post("/prescriptions/1/enviar-lembrete").send({})).status).toBe(422);
  const lookup = new PgDialect().sqlToQuery(mocks.conditions[1]);
  expect(lookup.params).toEqual([5, "11122233344"]);
  expect(lookup.sql).toContain("empresa_id");
  noSideEffects();
});
it("reenvio com vínculo existente e contato divergente não envia", async () => {
  mocks.results = [
    [{ id: 1, empresaId: 5, clientId: 11, clientEmail: "other@test" }],
    [{ id: 11, email: "one@test", cpf: null }],
  ];
  expect((await request(app).post("/prescriptions/1/enviar-lembrete").send({})).status).toBe(422);
  noSideEffects();
});
