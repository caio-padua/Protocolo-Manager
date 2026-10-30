import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { isolatedPostgres } from "./helpers/isolated-postgres";

const mock = vi.hoisted(() => ({
  rows: [] as any[][], insert: vi.fn(), update: vi.fn(), send: vi.fn(), generate: vi.fn(), identity: vi.fn(),
  writes: [] as any[], nextId: 1, execute: vi.fn(),
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
    insert: mock.insert, update: mock.update, execute: mock.execute,
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
import { reserveDispatchOperation, type DispatchScope } from "../lib/exam-dispatch-operation";
const app = express().use(express.json()).use("/api", router);
const authorization = { Authorization: "Bearer synthetic-test" };
const payload = { operationKey: "synthetic-operation-573", clientId: 101, documentIds: [91], channels: ["EMAIL", "TELEGRAM"], confirmed: true };
const document = { id: 91, clientId: 101, tipo: "OUTROS", token: "a".repeat(48), fileName: "Exame sintetico.pdf",
  examCount: 1, pdfData: Buffer.from("NOT A REAL PDF").toString("base64"), createdAt: new Date("2026-10-29T15:00:00Z") };

let postgres: Awaited<ReturnType<typeof isolatedPostgres>>;
let scopeNumber = 0;
beforeAll(async () => { postgres = await isolatedPostgres(); }, 30_000);
afterAll(async () => { await postgres?.stop(); });
beforeEach(() => {
  vi.clearAllMocks(); mock.rows = []; mock.writes = []; mock.nextId = 1;
  mock.execute.mockImplementation(postgres.execute);
  mock.identity.mockResolvedValue({
    client: { id: 101, name: "Cliente Sintetico", email: "synthetic@example.invalid", phone: "00000000000", cpf: null },
    professional: { id: 202, name: "Medico Sintetico", crm: "000", uf: "SP" },
    clinic: { id: 303 + scopeNumber++, empresaId: 404 },
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

const send = (body = payload) => request(app).post("/api/exam-requests/send").set(authorization).send(body);
const available = () => { mock.rows = [[document], [{ telegramChatId: "synthetic-chat" }]]; };

it("requires an operation key before reserving or contacting providers", async () => {
  expect((await send({ ...payload, operationKey: undefined } as any)).status).toBe(400);
  expect(mock.execute).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
});
it("replays the saved result and audit ids without contacting providers again", async () => {
  available();
  const first = await send();
  const previous = await send();
  expect(previous.status).toBe(200);
  expect(previous.body).toMatchObject({ replayed: true, state: "completed", results: first.body.results });
  expect(previous.body.message).toContain("Nenhuma mensagem foi reenviada");
  expect(mock.send).toHaveBeenCalledTimes(2);
  expect(mock.insert).toHaveBeenCalledTimes(1);
});
it("recognizes unordered sets and a second window using another key", async () => {
  available();
  const first = await send();
  const previous = await send({ ...payload, operationKey: "another-window-operation", channels: ["TELEGRAM", "EMAIL", "EMAIL"], documentIds: [91, 91] });
  expect(previous.body).toMatchObject({ replayed: true, operationKey: first.body.operationKey, results: first.body.results });
  expect(mock.send).toHaveBeenCalledTimes(2);
});
it("rejects key reuse with different documents, channels or patient", async () => {
  available(); await send();
  for (const change of [{ channels: ["EMAIL"] }, { documentIds: [92] }, { clientId: 102 }]) {
    if (change.clientId) {
      const identity = await mock.identity();
      mock.identity.mockResolvedValue({ ...identity, client: { ...identity.client, id: 102 } });
    }
    expect((await send({ ...payload, ...change })).status).toBe(409);
  }
  expect(mock.send).toHaveBeenCalledTimes(2);
});
it("returns the reserved operation while the first request is waiting on a provider", async () => {
  available();
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  mock.send.mockImplementationOnce(async () => {
    started(); await gate;
    return { resultados: [{ sent: true, via: "email" }] };
  });
  const first = send().then(response => response);
  await waiting;
  const duplicate = await send();
  expect(duplicate.body).toMatchObject({ replayed: true, state: "in_progress", needsReview: true, results: [] });
  expect(mock.send).toHaveBeenCalledTimes(1);
  release();
  expect((await first).body.state).toBe("completed");
  expect(mock.send).toHaveBeenCalledTimes(2);
});
it("allows only one provider owner under concurrent PostgreSQL reservations with equal or different keys", async () => {
  const scope: DispatchScope = {
    professionalId: 202, empresaId: 404, clinicId: 10000 + scopeNumber,
    clientId: 101, documentIds: [91], channels: ["EMAIL"], operationKey: payload.operationKey,
  };
  const provider = vi.fn(async () => undefined);
  const attempts = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const reservation = await reserveDispatchOperation({ ...scope, operationKey: index % 2 ? `second-window-key-${index}` : scope.operationKey });
    if (reservation.owned) await provider();
    return reservation;
  }));
  expect(attempts.filter(value => value.owned)).toHaveLength(1);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(new Set(attempts.map(value => value.operation.operation_key)).size).toBe(1);
});
it("never retries an unknown provider outcome", async () => {
  available();
  mock.send.mockRejectedValueOnce(new Error("synthetic connection lost after acceptance"));
  const first = await send();
  expect(first.body).toMatchObject({ state: "needs_review", needsReview: true });
  expect((await send()).body).toMatchObject({ replayed: true, state: "needs_review", results: first.body.results });
  expect(mock.send).toHaveBeenCalledTimes(2);
});
it("rejects concurrent reuse of one key for different contents in PostgreSQL", async () => {
  const scope: DispatchScope = {
    professionalId: 202, empresaId: 404, clinicId: 20000 + scopeNumber,
    clientId: 101, documentIds: [91], channels: ["EMAIL"], operationKey: payload.operationKey,
  };
  const outcomes = await Promise.allSettled([
    reserveDispatchOperation(scope), reserveDispatchOperation({ ...scope, documentIds: [92] }),
  ]);
  expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
  const rejected = outcomes.find(outcome => outcome.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason.constructor.name).toBe("DispatchKeyConflict");
});
it("treats swallowed transport failures as unknown rather than retryable", async () => {
  available();
  mock.send.mockResolvedValue({ resultados: [{ sent: false, erro: "timeout" }] });
  expect((await send()).body.state).toBe("needs_review");
  await send();
  expect(mock.send).toHaveBeenCalledTimes(2);
});
it("retains a blocking reservation if the audit fails before any provider call", async () => {
  available();
  mock.insert.mockImplementationOnce(() => { throw new Error("synthetic audit offline"); });
  expect((await send()).status).toBe(500);
  expect((await send()).body).toMatchObject({ replayed: true, state: "needs_review" });
  expect(mock.send).not.toHaveBeenCalled();
});
it("requires review if provider acceptance cannot be written to channel audit", async () => {
  available();
  mock.update.mockReturnValue({ set: () => ({ where: async () => { throw new Error("synthetic write failure"); } }) });
  const first = await send();
  expect(first.body).toMatchObject({ state: "needs_review", needsReview: true });
  await send();
  expect(mock.send).toHaveBeenCalledTimes(2);
});
it("keeps the reservation blocking even when all final operation writes fail", async () => {
  available();
  mock.execute.mockImplementation(async query => {
    // SQL content detection without including any patient data.
    const { PgDialect } = await import("drizzle-orm/pg-core");
    if (new PgDialect().sqlToQuery(query).sql.includes("UPDATE exam_request_dispatch_operations")) throw new Error("synthetic store offline");
    return postgres.execute(query);
  });
  expect((await send()).status).toBe(500);
  expect((await send()).body).toMatchObject({ replayed: true, state: "in_progress", needsReview: true });
  expect(mock.send).toHaveBeenCalledTimes(1);
});
it("checks authorization again before exposing an existing operation", async () => {
  available(); await send();
  mock.identity.mockRejectedValue(new ClinicalIdentityError(403, "Vínculo removido"));
  expect((await send()).status).toBe(403);
  expect(mock.send).toHaveBeenCalledTimes(2);
});
it("does not share operation results across authorized professionals or clinics", async () => {
  available(); await send();
  const identity = await mock.identity();
  for (const changed of [
    { ...identity, professional: { ...identity.professional, id: 203 } },
    { ...identity, clinic: { id: 9999, empresaId: 8888 } },
  ]) {
    mock.identity.mockResolvedValue(changed); available();
    expect((await send()).body.replayed).toBe(false);
  }
  expect(mock.send).toHaveBeenCalledTimes(6);
});
