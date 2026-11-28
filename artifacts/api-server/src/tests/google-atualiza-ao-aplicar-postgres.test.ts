import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

// K1 da Linha do Tempo Viva: registrar a ação clínica atualiza o MESMO evento no Google.
// Dados 100% sintéticos, banco isolado e Google simulado (nenhuma chamada real).

const state = vi.hoisted(() => ({ database: null as any }));
const google = vi.hoisted(() => ({
  verify: vi.fn(async () => ({ ok: true, account: "conta-sintetica" })),
  create: vi.fn(async (data: { eventId?: string }) => data.eventId ?? null),
  update: vi.fn(async (_eventId: string, _calendarId: string, _data: any, _options?: { timeoutMs?: number }) => undefined),
  remove: vi.fn(async () => undefined),
  exists: vi.fn(async () => true),
}));
vi.mock("../lib/google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/google-calendar")>()),
  verifyClinicAccount: google.verify,
  createCalendarEvent: google.create,
  updateCalendarEvent: google.update,
  deleteCalendarEvent: google.remove,
  calendarEventExists: google.exists,
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_target, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  });
  return { ...schema, db };
});
import {
  agendaResourcesTable, clientsTable, empresasTable, locationProfessionalsTable, locationsTable,
  professionalEmpresasTable, professionalsTable, protocolItemsTable, protocolsTable, sessionsTable, substanceApplicationsTable, substancesTable,
} from "@workspace/db/schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { buildDescriptionBody } from "../lib/google-calendar";
import { refreshAfterApplication } from "../lib/session-google-sync";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import sessionsRouter from "../routes/sessions";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), tenantContextMiddleware, sessionsRouter);
const auth = `Bearer ${createCollaboratorToken({ professionalId: 101, role: "medico", credentialVersion: 0 })}`;
const confirm = (sessionId: number, applicationId: number, confirmed = true) =>
  request(app).post(`/sessions/${sessionId}/confirm-substance`).set("Authorization", auth)
    .send({ substanceId: 1, applicationId, confirmed }).then(r => r);
const lastEventData = () => google.update.mock.calls.at(-1)![2];
const row = async (sql: string, values: unknown[] = []) => (await isolated.pool.query(sql, values)).rows[0];
const pending = (id: number) => row("SELECT google_event_id, google_sync_pending_operation AS pop FROM sessions WHERE id=$1", [id]);
async function waitUntil(check: () => Promise<boolean>, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise(r => setTimeout(r, 25)); }
  return false;
}

function createTableSql(table: any) {
  const definition = getTableConfig(table);
  const columns = definition.columns.map((column) => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const defaultNow = ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : "";
    return `"${column.name}" ${column.getSQLType()}${defaultNow}`;
  });
  return `CREATE TABLE "${definition.name}" (${columns.join(", ")});`;
}

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [empresasTable, professionalsTable, locationsTable, locationProfessionalsTable,
    clientsTable, protocolsTable, protocolItemsTable, sessionsTable, substanceApplicationsTable, substancesTable, agendaResourcesTable,
    professionalEmpresasTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(`
    INSERT INTO empresas (id, ativa, status) VALUES (5,true,'ATIVO');
    INSERT INTO locations (id, empresa_id, active, name, address, phone) VALUES (8,5,'true','Local sintético',NULL,NULL);
    INSERT INTO professionals (id, name, role, category, active, credential_version, empresa_id, is_platform_owner)
      VALUES (101,'Profissional sintético','medico','medico',true,0,5,false);
    INSERT INTO location_professionals (location_id, professional_id, role) VALUES (8,101,'executor');
    INSERT INTO clients (id, name, status, empresa_id, location_id) VALUES (1,'Cliente sintético','active',5,8);
    INSERT INTO protocols (id, client_id, empresa_id, title, status) VALUES (1,1,5,'Protocolo sintético','validated');
    INSERT INTO substances (id, name, color, procedure_type) VALUES (1,'Substância sintética','#000000','im');
    INSERT INTO agenda_resources (id, name, kind, location_id, google_calendar_id, active)
      VALUES (1,'Agenda sintética','enfermagem',8,'calendario-sintetico',true);
    INSERT INTO sessions (id,protocol_id,client_id,empresa_id,scheduled_date,scheduled_time,status,week_number,agenda_archived,resource_id,duration_minutes)
      VALUES (1,1,1,5,'2030-01-07','09:00','scheduled',1,false,1,20),
             (2,1,1,5,'2030-01-14','09:00','scheduled',2,false,1,20),
             (3,1,1,5,'2030-01-21','09:00','scheduled',3,false,1,20),
             (4,1,1,5,'2030-01-28','09:00','scheduled',4,false,1,20),
             (5,1,1,5,'2030-02-04','09:00','scheduled',5,false,1,20),
             (6,1,1,5,'2030-02-11','09:00','scheduled',6,false,1,20),
             (7,1,1,5,'2030-02-18','09:00','scheduled',7,false,1,20),
             (8,1,1,5,'2030-02-25','09:00','scheduled',8,false,1,20),
             (9,1,1,5,'2030-03-04','09:00','scheduled',9,false,1,20),
             (10,1,1,5,'2030-03-11','09:00','scheduled',10,false,1,20),
             (11,1,1,5,'2030-03-18','09:00','scheduled',11,false,1,20);
    UPDATE sessions SET google_event_id = 'evento-' || id, google_calendar_id = 'calendario-sintetico' WHERE id <> 3;
    INSERT INTO substance_applications (id,session_id,substance_id,dose,session_number,total_sessions,status,availability)
      VALUES (1,1,1,'Dose A',1,3,'pending','disp'), (2,1,1,'Dose B',2,3,'pending','disp'),
             (3,2,1,'Dose A',1,3,'pending','disp'), (4,2,1,'Dose B',2,3,'pending','disp'),
             (5,3,1,'Dose A',1,3,'pending','disp'),
             (6,4,1,'Dose A',1,3,'pending','disp'),
             (7,5,1,'Dose A',1,3,'pending','disp'),
             (8,6,1,'Dose A',1,3,'pending','disp'), (9,6,1,'Dose B',2,3,'pending','disp'),
             (10,7,1,'Dose A',1,3,'pending','disp'),
             (11,8,1,'Dose A',1,3,'pending','disp'),
             (12,9,1,'Dose A',1,3,'pending','disp'),
             (13,10,1,'Dose A',1,3,'pending','disp'),
             (14,11,1,'Dose A',1,3,'pending','disp'), (15,11,1,'Dose B',2,3,'pending','disp');
  `);
}, 60000);

afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60000);

beforeEach(() => {
  google.verify.mockReset(); google.verify.mockResolvedValue({ ok: true, account: "conta-sintetica" });
  google.update.mockReset(); google.update.mockResolvedValue(undefined);
  google.create.mockClear(); google.remove.mockClear();
});

describe("K1 — registrar a ação atualiza o mesmo evento no Google", () => {
  it("T-K1-1: aplicada muda o quadrado no MESMO evento; fechar a visita muda o status; repetir reenvia", async () => {
    const first = await confirm(1, 1);
    expect(first.status, first.text).toBe(200);
    expect(first.body).not.toHaveProperty("googleSyncWarning");
    expect(google.update).toHaveBeenCalledOnce();
    expect(google.update.mock.calls[0].slice(0, 2)).toEqual(["evento-1", "calendario-sintetico"]);
    let text = buildDescriptionBody(lastEventData());
    expect(text).toContain("\uD83D\uDFE6 [1/3] Substância sintética Dose A [APLI]");
    expect(text).toContain("\uD83D\uDFE9 [2/3] Substância sintética Dose B [DISP]");
    expect(text).toContain("Aplicação Programada");

    const second = await confirm(1, 2, false);
    expect(second.status, second.text).toBe(200);
    text = buildDescriptionBody(lastEventData());
    expect(text).toContain("\uD83D\uDFE5 [2/3] Substância sintética Dose B [NREA]");
    expect(text).toContain("Sessão Encerrada — Aplicações Parcialmente Realizadas");
    expect(google.create).not.toHaveBeenCalled();
    expect(await pending(1)).toMatchObject({ google_event_id: "evento-1", pop: null });

    const repeated = await confirm(1, 1);
    expect(repeated.status).toBe(200);
    expect(google.update).toHaveBeenCalledTimes(3);
  });

  it("T-K1-2 e T-K1-3: Google fora do ar vira aviso, o registro vale, a reserva não fica presa e a próxima aplicação passa", async () => {
    google.update.mockRejectedValueOnce(new Error("detalhe interno do Google"));
    const failed = await confirm(2, 3);
    expect(failed.status, failed.text).toBe(200);
    expect(failed.body.googleSyncWarning).toContain("Google Agenda");
    expect(JSON.stringify(failed.body)).not.toContain("detalhe interno");
    expect(await row("SELECT status FROM substance_applications WHERE id=3")).toMatchObject({ status: "applied" });
    expect(await pending(2)).toMatchObject({ google_event_id: "evento-2", pop: null });

    const next = await confirm(2, 4);
    expect(next.status, next.text).toBe(200);
    expect(next.body).not.toHaveProperty("googleSyncWarning");
    const text = buildDescriptionBody(lastEventData());
    expect(text).toContain("[1/3] Substância sintética Dose A [APLI]");
    expect(text).toContain("[2/3] Substância sintética Dose B [APLI]");
    expect(text).toContain("Aplicações Realizadas");
  });

  it("T-K1-4: conta Google da clínica não confirmada não toca o evento, mas o registro vale", async () => {
    google.verify.mockResolvedValue({ ok: false } as any);
    const response = await confirm(4, 6);
    expect(response.status, response.text).toBe(200);
    expect(response.body.googleSyncWarning).toContain("conta Google da clínica não foi confirmada");
    expect(google.update).not.toHaveBeenCalled();
    expect(await row("SELECT status FROM substance_applications WHERE id=6")).toMatchObject({ status: "applied" });
    expect(await pending(4)).toMatchObject({ pop: null });
  });

  it("T-K1-5: visita que nunca foi ao Google não chama o Google", async () => {
    const response = await confirm(3, 5);
    expect(response.status, response.text).toBe(200);
    expect(response.body).not.toHaveProperty("googleSyncWarning");
    for (const fn of [google.verify, google.update, google.create, google.remove]) expect(fn).not.toHaveBeenCalled();
    expect(await pending(3)).toMatchObject({ google_event_id: null, pop: null });
  });

  it("T-K1-6: Google lento passa do limite com aviso e libera a reserva quando termina (com erro ou com sucesso)", async () => {
    // Limite generoso e sinal de entrada: o resultado não depende da carga da máquina.
    let fail!: (e: Error) => void;
    let inFail!: () => void;
    const enteredFail = new Promise<void>(resolve => { inFail = resolve; });
    google.update.mockImplementationOnce((() => new Promise<void>((_ok, reject) => { fail = reject; inFail(); })) as any);
    const slowFail = await refreshAfterApplication(5, 5, { timeoutMs: 1500 });
    expect(slowFail).toContain("demorou para responder");
    await enteredFail;
    expect((await pending(5)).pop).not.toBeNull();
    fail(new Error("terminou com erro"));
    expect(await waitUntil(async () => (await pending(5)).pop === null)).toBe(true);

    let done!: () => void;
    let inOk!: () => void;
    const enteredOk = new Promise<void>(resolve => { inOk = resolve; });
    google.update.mockImplementationOnce((() => new Promise<void>(resolve => { done = resolve; inOk(); })) as any);
    const slowOk = await refreshAfterApplication(8, 5, { timeoutMs: 1500 });
    expect(slowOk).toContain("demorou para responder");
    await enteredOk;
    done();
    expect(await waitUntil(async () => (await pending(8)).pop === null)).toBe(true);
    expect((await pending(8)).google_event_id).toBe("evento-8");
  });

  it("T-K1-7: segundo registro da mesma visita feito durante a atualização do primeiro espera e passa", async () => {
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    google.update.mockImplementationOnce(async () => { entered(); await gate; });
    const first = confirm(6, 8);
    await started;
    const second = confirm(6, 9);
    setTimeout(release, 300);
    const [a, b] = await Promise.all([first, second]);
    expect(a.status, a.text).toBe(200);
    expect(b.status, b.text).toBe(200);
    expect(google.update).toHaveBeenCalledTimes(2);
    const text = buildDescriptionBody(lastEventData());
    expect(text).toContain("[1/3] Substância sintética Dose A [APLI]");
    expect(text).toContain("[2/3] Substância sintética Dose B [APLI]");
    expect(await pending(6)).toMatchObject({ pop: null });
  });

  it("T-K1-8: concluir ou marcar falta pela sessão atualiza o mesmo evento; falha vira aviso", async () => {
    const done = await request(app).put("/sessions/7").set("Authorization", auth).send({ status: "completed" });
    expect(done.status, done.text).toBe(200);
    expect(done.body).not.toHaveProperty("googleSyncWarning");
    expect(google.update).toHaveBeenCalledOnce();
    expect(google.update.mock.calls[0][0]).toBe("evento-7");
    expect(lastEventData().sessionStatus).toBe("completed");

    google.update.mockRejectedValueOnce(new Error("detalhe interno do Google"));
    const missed = await request(app).put("/sessions/9").set("Authorization", auth).send({ status: "missed" });
    expect(missed.status, missed.text).toBe(200);
    expect(missed.body.googleSyncWarning).toContain("Situação da visita salva");
    expect(JSON.stringify(missed.body)).not.toContain("detalhe interno");
    expect(await row("SELECT status FROM sessions WHERE id=9")).toMatchObject({ status: "missed" });
    expect(await pending(9)).toMatchObject({ pop: null });

    google.update.mockClear();
    const same = await request(app).put("/sessions/7").set("Authorization", auth).send({ status: "completed" });
    expect(same.status).toBe(200);
    expect(google.update).not.toHaveBeenCalled();
  });

  it("T-K1-9: reserva de primeiro envio (criação) continua recusando o registro, sem espera", async () => {
    await isolated.pool.query(`UPDATE sessions SET google_event_id=NULL, google_sync_pending_operation='op-sintetica',
      google_sync_pending_event_id='novo-sintetico', google_sync_pending_calendar_id='calendario-sintetico' WHERE id=8`);
    const started = Date.now();
    const response = await confirm(8, 11);
    expect(response.status).toBe(409);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(google.update).not.toHaveBeenCalled();
    expect(await row("SELECT status FROM substance_applications WHERE id=11")).toMatchObject({ status: "pending" });
  });

  it("T-K1-10: reserva de outra operação (envio manual em andamento) não é reivindicada pela ação clínica", async () => {
    await isolated.pool.query(`UPDATE sessions SET google_sync_pending_operation='op-manual-sintetica',
      google_sync_pending_event_id='evento-10', google_sync_pending_calendar_id='calendario-sintetico' WHERE id=10`);
    const warning = await refreshAfterApplication(10, 5);
    expect(warning).toContain("há outra sincronização com o Google em andamento");
    for (const fn of [google.verify, google.update, google.create, google.remove]) expect(fn).not.toHaveBeenCalled();
    expect(await pending(10)).toMatchObject({ google_event_id: "evento-10", pop: "op-manual-sintetica" });
  });

  it("T-K1-11: Google que nunca responde estoura o prazo, libera a reserva e a próxima aplicação passa", async () => {
    google.update.mockImplementationOnce((() => new Promise<void>(() => undefined)) as any);
    const warning = await refreshAfterApplication(11, 5, { timeoutMs: 3000, updateDeadlineMs: 150 });
    expect(warning).toContain("o Google não confirmou a atualização");
    expect(google.update.mock.calls[0][3]).toEqual({ timeoutMs: 150 });
    expect(await pending(11)).toMatchObject({ google_event_id: "evento-11", pop: null });

    const next = await confirm(11, 14);
    expect(next.status, next.text).toBe(200);
    expect(next.body).not.toHaveProperty("googleSyncWarning");
    expect(buildDescriptionBody(lastEventData())).toContain("[1/3] Substância sintética Dose A [APLI]");
  });
});
