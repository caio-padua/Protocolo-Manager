import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
const google = vi.hoisted(() => ({
  verify: vi.fn(async () => ({ ok: true, account: "conta-sintetica" })),
  create: vi.fn(async (data: { eventId?: string }) => data.eventId ?? null),
  update: vi.fn(async (_eventId: string, _calendarId: string, _data: unknown) => undefined),
  remove: vi.fn(async () => undefined),
  list: vi.fn(async () => []),
}));
vi.mock("../lib/google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/google-calendar")>()),
  verifyClinicAccount: google.verify,
  createCalendarEvent: google.create,
  updateCalendarEvent: google.update,
  deleteCalendarEvent: google.remove,
  listCalendars: google.list,
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
  professionalEmpresasTable, professionalsTable, protocolsTable, sessionsTable, substanceApplicationsTable, substancesTable,
} from "@workspace/db/schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import sessionsRouter from "../routes/sessions";
import googleRouter from "../routes/google-calendar";
import { cancelBooking, rescheduleSession, clearSimulations } from "../lib/agenda-booking";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), tenantContextMiddleware, sessionsRouter, googleRouter);
const token = (professionalId: number) => `Bearer ${createCollaboratorToken({ professionalId, role: "medico", credentialVersion: 0 })}`;

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
    clientsTable, protocolsTable, sessionsTable, substanceApplicationsTable, substancesTable, agendaResourcesTable,
    professionalEmpresasTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(`
    INSERT INTO empresas (id, ativa, status) VALUES (5,true,'ATIVO'),(6,true,'ATIVO');
    INSERT INTO locations (id, empresa_id, active, name, address, phone)
      VALUES (8,5,'true','Local sintético',NULL,NULL),(9,6,'true','Outro local',NULL,NULL),
      (10,5,'true','Local de atendimento vinculado','Rua sintética, 100','11900000000');
    INSERT INTO professionals (id, name, role, category, active, credential_version, empresa_id, is_platform_owner)
      VALUES (101,'Profissional sintético','medico','medico',true,0,5,false),
             (102,'Outro profissional','medico','medico',true,0,6,false),
             (103,'Sem vínculo','medico','medico',true,0,5,false);
    INSERT INTO location_professionals (location_id, professional_id, role)
      VALUES (8,101,'executor'),(9,102,'executor'),(10,101,'executor');
    INSERT INTO clients (id, name, status, empresa_id, location_id)
      VALUES (1,'Cliente sintético','active',5,8),(2,'Outro cliente','active',6,9);
    INSERT INTO protocols (id, client_id, empresa_id, title, status)
      VALUES (1,1,5,'Protocolo sintético','validated'),(2,2,6,'Outro protocolo','validated');
    INSERT INTO substances (id, name, color, procedure_type)
      VALUES (1,'Substância sintética','#000000','im');
    INSERT INTO agenda_resources (id, name, kind, location_id, google_calendar_id, active)
      VALUES (1,'Agenda sintética','enfermagem',8,'calendario-sintetico',true),
             (2,'Agenda de outra clínica','enfermagem',9,'outra-agenda-sintetica',true),
             (3,'Agenda da mesma empresa','enfermagem',10,'outra-agenda-da-mesma-empresa',true);
    INSERT INTO sessions (id,protocol_id,client_id,empresa_id,scheduled_date,scheduled_time,status,week_number,agenda_archived,resource_id,duration_minutes)
      VALUES (1,1,1,5,'2030-01-07','09:00','scheduled',1,false,1,20),
             (2,2,2,6,'2030-02-01','09:00','scheduled',1,false,2,20),
             (3,1,1,5,'2030-01-14','09:00','scheduled',2,false,1,20),
             (4,1,1,5,'2030-01-21','09:00','scheduled',3,false,2,20),
             (5,1,1,5,'2030-01-28','09:00','scheduled',4,false,1,20),
             (6,1,1,5,'2030-02-04','09:00','scheduled',5,false,1,20),
             (7,1,1,5,'2030-02-11','09:00','scheduled',6,false,1,20),
             (8,1,1,5,'2030-02-18','09:00','scheduled',7,false,1,20),
             (9,2,2,6,'2030-02-18','09:00','scheduled',7,false,2,20),
             (10,1,1,5,'2030-02-25','09:00','scheduled',8,false,3,20),
             (11,1,1,5,'2030-03-04','09:00','scheduled',9,false,1,20);
    UPDATE sessions SET notes='[SIMULACAO]', google_event_id='evento-preexistente', google_calendar_id='calendario-sintetico' WHERE id IN (8,9);
    INSERT INTO substance_applications (id,session_id,substance_id,dose,session_number,total_sessions,status,availability)
      VALUES (1,1,1,'Dose sintética',1,3,'pending','disp'),
             (2,1,1,'Dose sintética',2,3,'pending','disp'),
             (3,2,1,'Dose sintética',1,1,'pending','disp'),
             (4,3,1,'Dose sintética',3,3,'pending','disp'),
             (5,5,1,'Dose sintética',1,1,'pending','disp'),
             (6,6,1,'Dose sintética',1,1,'pending','disp'),
             (7,7,1,'Dose sintética',1,1,'pending','disp'),
             (10,10,1,'Dose sintética',1,1,'pending','disp'),
             (11,11,1,'Dose sintética',0,1,'pending','prox');
  `);
}, 60000);

afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60000);

describe("Confirmação de aplicação clínica", () => {
  const base = { substanceId: 1, confirmed: true };
  it("recusa ausência de acesso, outra empresa e profissional sem vínculo clínico", async () => {
    expect((await request(app).post("/sessions/1/confirm-substance").send(base)).status).toBe(401);
    expect((await request(app).post("/sessions/1/confirm-substance").set("Authorization", token(102)).send(base)).status).toBe(404);
    expect((await request(app).post("/sessions/1/confirm-substance").set("Authorization", token(103)).send(base)).status).toBe(404);
    const rows = await isolated.pool.query("SELECT status, applied_at FROM substance_applications WHERE session_id=1 ORDER BY id");
    expect(rows.rows).toEqual([{ status: "pending", applied_at: null }, { status: "pending", applied_at: null }]);
  });

  it("recusa ocorrência ambígua e confirma somente a ocorrência identificada", async () => {
    const authorization = { Authorization: token(101) };
    expect((await request(app).post("/sessions/1/confirm-substance").set(authorization).send(base)).status).toBe(409);
    expect((await request(app).post("/sessions/1/confirm-substance").set(authorization).send({ ...base, applicationId: 3 })).status).toBe(404);
    const first = await request(app).post("/sessions/1/confirm-substance").set(authorization).send({ ...base, applicationId: 1 });
    expect(first.status, first.text).toBe(200);
    expect(first.body.status).toBe("scheduled");
    const rows = await isolated.pool.query("SELECT id, status, applied_at, confirmed_by, confirmed_at FROM substance_applications WHERE session_id=1 ORDER BY id");
    expect(rows.rows[0].status).toBe("applied");
    expect(rows.rows[0].applied_at).toBeTruthy();
    expect(rows.rows[0].confirmed_by).toBe(101);
    expect(rows.rows[0].confirmed_at).toBeTruthy();
    expect(rows.rows[1]).toMatchObject({ id: 2, status: "pending", applied_at: null });
    expect((await request(app).post("/sessions/1/confirm-substance").set(authorization).send({ ...base, applicationId: 1 })).status).toBe(200);
    expect((await request(app).post("/sessions/1/confirm-substance").set(authorization)
      .send({ ...base, applicationId: 1, confirmed: false })).status).toBe(409);
    const second = await request(app).post("/sessions/1/confirm-substance").set(authorization)
      .send({ ...base, applicationId: 2, confirmed: false });
    expect(second.status, second.text).toBe(200);
    expect(second.body.status).toBe("completed");
    expect(second.body.substanceApplications.map((a: any) => a.status)).toEqual(["applied", "missed"]);
  });

  it("serializa resultados contraditórios sem sobrescrever o primeiro registro", async () => {
    const authorization = { Authorization: token(101) };
    const results = await Promise.all([true, false].map(confirmed =>
      request(app).post("/sessions/3/confirm-substance").set(authorization)
        .send({ ...base, applicationId: 4, confirmed }),
    ));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const row = await isolated.pool.query("SELECT status, applied_at FROM substance_applications WHERE id=4");
    expect(["applied", "missed"]).toContain(row.rows[0].status);
    expect(!!row.rows[0].applied_at).toBe(row.rows[0].status === "applied");
  });
});

describe("Proteção da sincronização com o Google", () => {
  it("não acessa o Google sem autenticação, com empresa errada ou sem vínculo", async () => {
    google.verify.mockClear(); google.create.mockClear(); google.update.mockClear(); google.list.mockClear();
    expect((await request(app).post("/google-calendar/sync-session/1")).status).toBe(401);
    expect((await request(app).post("/google-calendar/sync-week").send({ dateFrom: "2030-02-01", dateTo: "2030-02-01" })).status).toBe(401);
    expect((await request(app).post("/google-calendar/sync-session/2").set("Authorization", token(101))).status).toBe(404);
    expect((await request(app).post("/google-calendar/sync-session/1").set("Authorization", token(103))).status).toBe(404);
    const week = await request(app).post("/google-calendar/sync-week").set("Authorization", token(101))
      .send({ dateFrom: "2030-02-01", dateTo: "2030-02-01" });
    expect(week.status, week.text).toBe(200);
    expect(week.body.details).toEqual([]);
    expect(google.verify).not.toHaveBeenCalled();
    expect(google.create).not.toHaveBeenCalled();
    expect(google.update).not.toHaveBeenCalled();
    expect(google.list).not.toHaveBeenCalled();
  });

  it("recusa recurso de outra clínica e intervalo de lote excessivo sem chamar Google", async () => {
    google.verify.mockClear(); google.create.mockClear(); google.update.mockClear();
    expect((await request(app).post("/google-calendar/sync-session/4").set("Authorization", token(101))).status).toBe(409);
    expect((await request(app).post("/google-calendar/sync-week").set("Authorization", token(101))
      .send({ dateFrom: "2030-01-01", dateTo: "2030-02-01" })).status).toBe(400);
    expect(google.verify).not.toHaveBeenCalled();
    expect(google.create).not.toHaveBeenCalled();
    expect(google.update).not.toHaveBeenCalled();
  });

  it("usa recurso explícito e duração salva para sessão autorizada", async () => {
    google.create.mockClear(); google.update.mockClear();
    const response = await request(app).post("/google-calendar/sync-session/1").set("Authorization", token(101));
    expect(response.status, response.text).toBe(200);
    expect(google.create).toHaveBeenCalledOnce();
    expect(google.create.mock.calls[0][0]).toMatchObject({ calendarId: "calendario-sintetico", durationMinutes: 20, locationPhone: undefined });
    expect(google.update).not.toHaveBeenCalled();
  });

  it("aceita local operacional diferente do cadastro quando profissional e empresa estão vinculados", async () => {
    google.create.mockClear();
    const response = await request(app).post("/google-calendar/sync-session/10").set("Authorization", token(101));
    expect(response.status, response.text).toBe(200);
    expect(google.create.mock.calls[0][0]).toMatchObject({ calendarId: "outra-agenda-da-mesma-empresa",
      unit: "Local de atendimento vinculado", locationAddress: "Rua sintética, 100", locationPhone: "11900000000" });
    google.update.mockClear();
    const week = await request(app).post("/google-calendar/sync-week").set("Authorization", token(101))
      .send({ dateFrom: "2030-02-25", dateTo: "2030-02-25" });
    expect(week.status, week.text).toBe(200);
    expect(google.update.mock.calls[0][2]).toMatchObject({ unit: "Local de atendimento vinculado",
      locationAddress: "Rua sintética, 100", locationPhone: "11900000000" });
  });

  it("não inventa consulta para sessão com apenas substância futura", async () => {
    google.create.mockClear(); google.update.mockClear();
    const one = await request(app).post("/google-calendar/sync-session/11").set("Authorization", token(101));
    expect(one.status).toBe(409);
    const week = await request(app).post("/google-calendar/sync-week").set("Authorization", token(101))
      .send({ dateFrom: "2030-03-04", dateTo: "2030-03-04" });
    expect(week.body).toMatchObject({ synced: 0, failed: 1 });
    expect(google.create).not.toHaveBeenCalled();
    expect(google.update).not.toHaveBeenCalled();
  });

  it("duas sincronizações simultâneas não criam dois eventos", async () => {
    google.create.mockClear();
    google.create.mockImplementationOnce(async data => {
      await new Promise(resolve => setTimeout(resolve, 150));
      return data.eventId ?? null;
    });
    const results = await Promise.all([1, 2].map(() =>
      request(app).post("/google-calendar/sync-session/5").set("Authorization", token(101))));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(google.create).toHaveBeenCalledOnce();
    const saved = await isolated.pool.query("SELECT google_event_id, google_sync_pending_operation FROM sessions WHERE id=5");
    expect(saved.rows[0].google_event_id).toBe(google.create.mock.calls[0][0].eventId);
    expect(saved.rows[0].google_sync_pending_operation).toBeNull();
  });

  it("falha ao gravar resposta mantém identificador e bloqueia repetição", async () => {
    google.create.mockClear();
    await isolated.pool.query(`
      CREATE FUNCTION recusar_gravacao_sintetica() RETURNS trigger AS $$
      BEGIN IF NEW.id = 6 AND NEW.google_event_id IS NOT NULL THEN RAISE EXCEPTION 'falha sintética'; END IF; RETURN NEW; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER recusar_gravacao_sintetica BEFORE UPDATE ON sessions
      FOR EACH ROW EXECUTE FUNCTION recusar_gravacao_sintetica();
    `);
    const first = await request(app).post("/google-calendar/sync-session/6").set("Authorization", token(101));
    expect(first.status, first.text).toBe(409);
    expect(first.body.error).toContain("confirmar o resultado");
    const pending = await isolated.pool.query("SELECT google_event_id, google_sync_pending_event_id, google_sync_pending_calendar_id FROM sessions WHERE id=6");
    expect(pending.rows[0].google_event_id).toBeNull();
    expect(pending.rows[0].google_sync_pending_event_id).toBe(google.create.mock.calls[0][0].eventId);
    expect(pending.rows[0].google_sync_pending_calendar_id).toBe("calendario-sintetico");
    const second = await request(app).post("/google-calendar/sync-session/6").set("Authorization", token(101));
    expect(second.status).toBe(409);
    expect(google.create).toHaveBeenCalledOnce();
  });

  it("bloqueia cancelamento, remarcação e confirmação enquanto o Google responde", async () => {
    google.create.mockClear(); google.remove.mockClear();
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    google.create.mockImplementationOnce(async data => {
      started();
      await wait;
      return data.eventId ?? null;
    });
    const sending = request(app).post("/google-calendar/sync-session/7").set("Authorization", token(101)).then(r => r);
    await entered;
    try {
      expect((await cancelBooking(7, 5)).status).toBe(409);
      expect((await rescheduleSession({ sessionId: 7, clientId: 1, resourceId: 1,
        date: "2030-02-12", time: "09:00", syncGoogle: false })).status).toBe(409);
      expect((await request(app).post("/sessions/7/confirm-substance").set("Authorization", token(101))
        .send({ substanceId: 1, applicationId: 7, confirmed: true })).status).toBe(409);
      expect((await request(app).put("/sessions/7").set("Authorization", token(101)).send({ status: "missed" })).status).toBe(409);
    } finally { release(); }
    expect((await sending).status).toBe(200);
    const row = await isolated.pool.query("SELECT status,google_event_id FROM sessions WHERE id=7");
    expect(row.rows[0].status).toBe("scheduled");
    expect(row.rows[0].google_event_id).toBeTruthy();
    expect(google.remove).not.toHaveBeenCalled();
  });

  it("recusa remarcação combinada com outra alteração antes de gravar qualquer campo", async () => {
    const before = await isolated.pool.query("SELECT scheduled_date,scheduled_time,notes FROM sessions WHERE id=7");
    const response = await request(app).put("/sessions/7").set("Authorization", token(101))
      .send({ scheduledDate: "2030-02-12", notes: "Alteração sintética" });
    expect(response.status, response.text).toBe(422);
    expect(response.body.error).toContain("nenhuma mudança foi salva");
    const after = await isolated.pool.query("SELECT scheduled_date,scheduled_time,notes FROM sessions WHERE id=7");
    expect(after.rows).toEqual(before.rows);
  });

  it("oculta apenas simulações da empresa sem apagar registros ou eventos Google", async () => {
    google.remove.mockClear();
    const result = await clearSimulations({ empresaId: 5 });
    expect(result).toMatchObject({ removed: 1, googleRemoved: 0 });
    const rows = await isolated.pool.query("SELECT id,agenda_archived,google_event_id FROM sessions WHERE id IN (8,9) ORDER BY id");
    expect(rows.rows).toEqual([
      { id: 8, agenda_archived: true, google_event_id: "evento-preexistente" },
      { id: 9, agenda_archived: false, google_event_id: "evento-preexistente" },
    ]);
    expect(google.remove).not.toHaveBeenCalled();
  });
});
