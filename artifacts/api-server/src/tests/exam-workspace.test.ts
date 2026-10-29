import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mock = vi.hoisted(() => ({
  rows: [] as any[][], insert: vi.fn(), update: vi.fn(), send: vi.fn(), generate: vi.fn(), identity: vi.fn(),
  writes: [] as any[], nextId: 1,
}));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    select: () => {
      const rows = mock.rows.shift() ?? [];
      const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows).then(yes, no) };
      for (const method of ["from", "where", "limit", "offset", "orderBy"]) chain[method] = () => chain;
      return chain;
    },
    insert: mock.insert, update: mock.update,
  },
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) =>
    req.get("Authorization") === "Bearer synthetic-test" ? next() : res.status(401).json({ error: "Login obrigatório" }),
}));
vi.mock("../lib/clinical-emitter", async () => {
  const actual = await vi.importActual<any>("../lib/clinical-emitter");
  return { ...actual, resolveClinicalEmitter: mock.identity };
});
vi.mock("../lib/exam-request-pdf", () => ({ generateExamRequestPdf: mock.generate }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: mock.send }));

import router from "../routes/exam-requests";
import { ClinicalIdentityError } from "../lib/clinical-emitter";
import { renderTelegramCaption } from "../lib/messaging/render-text";
const app = express().use(express.json()).use("/api", router);
const authorization = { Authorization: "Bearer synthetic-test" };
const payload = { clientId: 101, documentIds: [91], channels: ["EMAIL", "TELEGRAM"], confirmed: true };
const document = { id: 91, clientId: 101, tipo: "OUTROS", token: "a".repeat(48), fileName: "Exame sintetico.pdf",
  examCount: 1, pdfData: Buffer.from("NOT A REAL PDF").toString("base64"), createdAt: new Date("2026-10-29T15:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks(); mock.rows = []; mock.writes = []; mock.nextId = 1;
  mock.identity.mockResolvedValue({
    client: { id: 101, name: "Cliente Sintetico", email: "synthetic@example.invalid", phone: "00000000000", cpf: null },
    professional: { id: 202, name: "Medico Sintetico", crm: "000", uf: "SP" },
    clinic: { id: 303, empresaId: 404 },
  });
  mock.generate.mockResolvedValue(Buffer.from("NOT A REAL PDF"));
  mock.send.mockImplementation(async (_doc, _destination, channels) => ({
    resultados: [{ canal: channels[0], sent: true, via: "telegram" }],
  }));
  mock.insert.mockImplementation(() => ({
    values: (values: any) => {
      mock.writes.push(values);
      return { returning: async () => (Array.isArray(values) ? values : [values]).map(value => ({
        id: mock.nextId++, detail: value.detail,
      })) };
    },
  }));
  mock.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
});

it("rejects anonymous history and dispatch before querying identity", async () => {
  expect((await request(app).get("/api/exam-requests/101/history")).status).toBe(401);
  expect((await request(app).post("/api/exam-requests/send").send(payload)).status).toBe(401);
  expect(mock.identity).not.toHaveBeenCalled();
});
it("rejects a missing or false confirmation before any send", async () => {
  for (const confirmed of [undefined, false]) {
    expect((await request(app).post("/api/exam-requests/send").set(authorization).send({ ...payload, confirmed })).status).toBe(400);
  }
  expect(mock.send).not.toHaveBeenCalled();
});
it("rejects another clinic before retrieving documents", async () => {
  mock.identity.mockRejectedValue(new ClinicalIdentityError(403, "Vínculo não autorizado"));
  expect((await request(app).post("/api/exam-requests/send").set(authorization).send(payload)).status).toBe(403);
  expect(mock.send).not.toHaveBeenCalled(); expect(mock.insert).not.toHaveBeenCalled();
});
it("does not send when one requested document is unavailable", async () => {
  mock.rows = [[]];
  expect((await request(app).post("/api/exam-requests/send").set(authorization).send(payload)).status).toBe(422);
  expect(mock.send).not.toHaveBeenCalled(); expect(mock.insert).not.toHaveBeenCalled();
});
it("checks every selected destination before sending any channel", async () => {
  mock.rows = [[document], [{ telegramChatId: null }]];
  expect((await request(app).post("/api/exam-requests/send").set(authorization).send(payload)).status).toBe(422);
  expect(mock.send).not.toHaveBeenCalled(); expect(mock.insert).not.toHaveBeenCalled();
});
it("sends existing documents to confirmed channels and audits metadata without clinical content", async () => {
  mock.rows = [[document], [{ telegramChatId: "synthetic-chat" }]];
  const response = await request(app).post("/api/exam-requests/send").set(authorization).send(payload);
  expect(response.status).toBe(200);
  expect(response.body.results.map((r: any) => r.success)).toEqual([true, true]);
  expect(mock.send).toHaveBeenCalledTimes(2);
  expect(mock.generate).not.toHaveBeenCalled();
  expect(mock.writes[0]).toHaveLength(2);
  expect(JSON.stringify(mock.writes)).not.toContain(document.pdfData);
  expect(JSON.stringify(mock.writes)).not.toContain("synthetic@example.invalid");
  expect(mock.update).toHaveBeenCalledTimes(2);
});
it("refuses provider contact if the initial audit cannot be stored", async () => {
  mock.rows = [[document], [{ telegramChatId: "synthetic-chat" }]];
  mock.insert.mockImplementationOnce(() => { throw new Error("synthetic unavailable audit"); });
  expect((await request(app).post("/api/exam-requests/send").set(authorization).send(payload)).status).toBe(500);
  expect(mock.send).not.toHaveBeenCalled();
});
it("reports simulation honestly, not as successful delivery", async () => {
  mock.rows = [[document], [{ telegramChatId: "synthetic-chat" }]];
  mock.send.mockResolvedValue({ resultados: [{ canal: "EMAIL", sent: true, via: "mock", mock: true }] });
  const response = await request(app).post("/api/exam-requests/send").set(authorization).send({ ...payload, channels: ["EMAIL"] });
  expect(response.body.results[0].success).toBe(false);
});
it("keeps independent channel results when a provider throws", async () => {
  mock.rows = [[document], [{ telegramChatId: "synthetic-chat" }]];
  mock.send.mockRejectedValueOnce(new Error("synthetic timeout"));
  const response = await request(app).post("/api/exam-requests/send").set(authorization).send(payload);
  expect(response.body.results.map((r: any) => r.success)).toEqual([false, true]);
  expect(mock.update).toHaveBeenCalledTimes(2);
});
it("lists persisted documents without returning PDF bytes and paginates", async () => {
  mock.rows = [Array.from({ length: 21 }, (_, i) => ({ ...document, id: 91 + i }))];
  const response = await request(app).get("/api/exam-requests/101/history?offset=0").set(authorization);
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body.documents).toHaveLength(20);
  expect(response.body.nextOffset).toBe(20);
  expect(response.body.documents[0]).not.toHaveProperty("pdfData");
});
it("rejects invalid pagination instead of pretending history is empty", async () => {
  expect((await request(app).get("/api/exam-requests/101/history?offset=-1").set(authorization)).status).toBe(400);
});
it("returns persisted dispatch history without revealing recipient addresses or raw audit detail", async () => {
  mock.rows = [[document], [{
    id: 808, createdAt: document.createdAt,
    detail: { clientId: 101, empresaId: 404, channel: "TELEGRAM", state: "provider_accepted", documentIds: [91], traceId: "private-internal" },
  }]];
  const response = await request(app).get("/api/exam-requests/101/history").set(authorization);
  expect(response.body.dispatches[0]).toMatchObject({ id: 808, channel: "TELEGRAM", documentIds: [91] });
  expect(response.body.dispatches[0]).not.toHaveProperty("detail");
  expect(JSON.stringify(response.body)).not.toContain("private-internal");
});
it("preserves every link in a large Telegram batch rather than truncating the caption", async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    ...document, id: 91 + i, token: String(i).padStart(48, "0"), fileName: `${"Exame & especial ".repeat(10)}${i}.pdf`,
  }));
  mock.rows = [rows, [{ telegramChatId: "synthetic-chat" }]];
  const response = await request(app).post("/api/exam-requests/send").set(authorization)
    .send({ ...payload, documentIds: rows.map(row => row.id), channels: ["TELEGRAM"] });
  expect(response.status).toBe(200);
  expect(mock.send.mock.calls.length).toBeGreaterThan(1);
  const captions = mock.send.mock.calls.map(call => renderTelegramCaption(call[0]));
  for (const row of rows) expect(captions.join("\n")).toContain(`/file/${row.token}`);
  for (const caption of captions) expect(caption.length).toBeLessThan(1024);
});
it("generates one file per selected exam in one request without messaging", async () => {
  const items = ["Holter 24 horas", "Mapa 24 horas"].map(nomeExame => ({ nomeExame, tipo: "OUTROS" }));
  const response = await request(app).post("/api/exam-requests/emit").set(authorization)
    .send({ clientId: 101, individualDocuments: true, items });
  expect(response.status).toBe(200);
  expect(response.body.pdfs).toHaveLength(2);
  expect(mock.generate).toHaveBeenCalledTimes(2);
  expect(mock.send).not.toHaveBeenCalled();
});
