import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

// Banco PostgreSQL descartável, 100% sintético: nada do banco real é lido ou escrito.
// Google 100% simulado: nenhum evento real é criado. A montagem da descrição é a real.
const state = vi.hoisted(() => ({ database: null as any }));
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
const google = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), exists: vi.fn(), verify: vi.fn(), remove: vi.fn() }));
vi.mock("../lib/google-calendar.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/google-calendar")>();
  return {
    ...actual, createCalendarEvent: google.create, updateCalendarEvent: google.update,
    calendarEventExists: google.exists, verifyClinicAccount: google.verify, deleteCalendarEvent: google.remove,
  };
});
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: any, _s: any, n: any) => n() }));
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_r: any, _s: any, n: any) => n() }));
import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable, empresasTable,
  locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable,
  clientsTable, protocolsTable, protocolItemsTable, substancesTable, locationProfessionalsTable,
} from "@workspace/db/schema";
import agendaRouter from "../routes/agenda";
import { bookSession, rescheduleSession } from "../lib/agenda-booking";
import { syncBookedSession } from "../lib/session-google-sync";
import { buildDescriptionBody, type CalendarEventData } from "../lib/google-calendar";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const query = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const rows = async (text: string, values?: unknown[]) => (await query(text, values)).rows;

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantContext = { authenticated: req.headers["x-test-anon"] !== "1", empresaId: Number(req.headers["x-test-empresa"] ?? 5) };
  req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  next();
});
app.use("/api", agendaRouter);
app.use((err: Error, _r: any, s: any, _n: any) => s.status(500).json({ error: err.message }));
const post = (path: string, body: unknown, empresa = 5) =>
  request(app).post(path).set("x-test-empresa", String(empresa)).send(body as object);

// 2030-03-04 é segunda; 2030-03-06 é quarta. "Hoje" simulado: sexta 01/03/2030.
const WED1 = "2030-03-06", WED2 = "2030-03-13";
const NOW = "2030-03-01T12:00:00-03:00";
const CAL_MED = "medico-sintetico@example.invalid", CAL_MED2 = "medico2-sintetico@example.invalid";
const CAL_ENF = "enfermagem-sintetica@example.invalid", CAL_ONLINE = "online-sintetica@example.invalid";
const MEDICO = 4, MEDICO_MESMO_PROF = 5, ENFERMAGEM = 1, ONLINE = 2;
const PROF = 77;
const created = () => google.create.mock.calls.map((c) => c[0] as CalendarEventData & { eventId: string });
const descricao = (i = 0) => buildDescriptionBody(created()[i]);
const totalSessoes = async () => (await rows(`SELECT count(*)::int AS n FROM sessions`))[0].n as number;
const avulsa = (over: Record<string, unknown> = {}) => bookSession({
  resourceId: MEDICO, clientId: 21, consultaAvulsa: true, date: WED1, time: "09:00", empresaId: 5, ...over,
} as any);

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
    empresasTable, locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable, clientsTable,
    protocolsTable, protocolItemsTable, substancesTable, locationProfessionalsTable]) {
    await query(createTableFromSchema(table));
  }
  await query(`
    INSERT INTO empresas(id,nome,tipo,ativa,status)
      SELECT g,'Clínica sintética '||g,'clinic',true,'ATIVO' FROM generate_series(1,20) g;
    CREATE UNIQUE INDEX applications_unique ON substance_applications(session_id, substance_id, session_number);
    CREATE TABLE agenda_personal_owners(location_id INTEGER, empresa_id INTEGER, professional_id INTEGER);
    CREATE TABLE agenda_google_sync(enabled BOOLEAN, location_id INTEGER, last_success TIMESTAMPTZ, error TEXT);
    CREATE TABLE agenda_compromissos(id INTEGER, titulo TEXT, inicio TIMESTAMPTZ, fim TIMESTAMPTZ, dia_inteiro BOOLEAN,
      recorrencia TEXT, origem TEXT, location_id INTEGER, status TEXT, chave TEXT, google_calendar_id TEXT);
    INSERT INTO locations(id,name,empresa_id,active,address,phone) VALUES
      (8,'Local sintético A',5,'true','Rua Sintética, 100, Centro, Cidade Teste - TS, CEP 00000-000','+5500000000000');
    INSERT INTO location_professionals(location_id,professional_id) VALUES (8,98);
    INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active,google_calendar_id,empresa_id) VALUES
      (${ENFERMAGEM},'Enfermagem sintética','enfermagem','local',20,8,NULL,true,'${CAL_ENF}',5),
      (${ONLINE},'Médico online sintético','medico','online',20,NULL,${PROF + 1},true,'${CAL_ONLINE}',5),
      (${MEDICO},'Consultório médico sintético','medico','local',20,8,${PROF},true,'${CAL_MED}',5),
      (${MEDICO_MESMO_PROF},'Consultório médico sintético 2','medico','local',20,8,${PROF},true,'${CAL_MED2}',5);
    INSERT INTO agenda_settings(id,block_minutes,trigger_percent,min_lead_hours) VALUES(1,120,60,24);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active)
      SELECT r,3,'09:00','11:00',1,NULL,true FROM unnest(ARRAY[${ENFERMAGEM},${ONLINE},${MEDICO},${MEDICO_MESMO_PROF}]) r;
    INSERT INTO clients(id,name,cpf,email,empresa_id,clinica_origem_empresa_id,agenda_enfermagem_padrao_id) VALUES
      (21,'Cliente sintético 21','000.000.000-21','cliente21@example.invalid',5,5,1),
      (22,'Cliente sintético 22','000.000.000-22','cliente22@example.invalid',5,5,1),
      (23,'Cliente sintético 23','000.000.000-23','cliente23@example.invalid',5,5,1),
      (31,'Cliente sintético outra clínica','000.000.000-31','cliente31@example.invalid',6,6,1);
    INSERT INTO substances(id,name,category,color,procedure_type,doctor_participation,duration_minutes,precise_duration_seconds) VALUES
      (1,'IM sintética','x','#000','im',false,3,150);
  `);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
}, 60_000);

beforeEach(async () => {
  await query(`TRUNCATE sessions, substance_applications, protocol_items, protocols`);
  vi.setSystemTime(new Date(NOW));
  for (const fn of Object.values(google)) fn.mockReset();
  google.create.mockImplementation(async (data: CalendarEventData & { eventId?: string }) => data.eventId ?? null);
  google.update.mockResolvedValue(undefined);
  google.exists.mockResolvedValue(false);
  google.remove.mockResolvedValue(undefined);
  google.verify.mockResolvedValue({ ok: true, account: "conta-sintetica@example.invalid" });
});

afterAll(async () => {
  vi.useRealTimers();
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("Migração: protocol_id deixa de ser obrigatório sem alterar dados", () => {
  it("remove só o NOT NULL, preserva linhas e pode rodar duas vezes", async () => {
    await query(`INSERT INTO sessions(protocol_id,client_id,scheduled_date,scheduled_time,empresa_id) VALUES (900,21,'2030-01-01','09:00',5)`);
    await query(`ALTER TABLE sessions ALTER COLUMN protocol_id SET NOT NULL`);
    await expect(query(`INSERT INTO sessions(client_id,scheduled_date,scheduled_time) VALUES (21,'2030-01-02','09:00')`)).rejects.toThrow();
    const sql = await readFile(new URL("../../../../scripts/migrations/20261123_consulta_avulsa_sem_protocolo.sql", import.meta.url), "utf8");
    await query(sql);
    await query(sql);
    expect((await rows(`SELECT is_nullable FROM information_schema.columns WHERE table_name='sessions' AND column_name='protocol_id'`))[0].is_nullable).toBe("YES");
    expect((await rows(`SELECT protocol_id FROM sessions WHERE scheduled_date='2030-01-01'`))[0].protocol_id).toBe(900);
  });
});

describe("Consulta avulsa: marcação sem protocolo", () => {
  it("grava sem protocolo, com profissional da agenda, empresa, período padrão e numeração fixa", async () => {
    const r = await avulsa();
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const [s] = await rows(`SELECT protocol_id, client_id, resource_id, professional_id, empresa_id, duration_minutes, week_number, service_type, unit, status FROM sessions`);
    expect(s).toEqual({ protocol_id: null, client_id: 21, resource_id: MEDICO, professional_id: PROF, empresa_id: 5,
      duration_minutes: 20, week_number: 1, service_type: "clinic", unit: "Consultório médico sintético", status: "scheduled" });
    expect((await rows(`SELECT count(*)::int AS n FROM substance_applications`))[0].n).toBe(0);
  });

  it("duração editável: grava 60 minutos e bloqueia os períodos seguintes", async () => {
    const r = await avulsa({ durationMinutes: 60 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.session!.durationMinutes).toBe(60);
    for (const time of ["09:20", "09:40"]) {
      const dentro = await avulsa({ clientId: 22, time });
      expect(dentro.ok, time).toBe(false);
      expect(dentro.status).toBe(409);
    }
    const depois = await avulsa({ clientId: 22, time: "10:00" });
    expect(depois.ok, JSON.stringify(depois)).toBe(true);
    expect(await totalSessoes()).toBe(2);
  });

  it("duração que passa do expediente ou inválida é recusada e nada é gravado", async () => {
    const passa = await avulsa({ time: "10:40", durationMinutes: 60 });
    expect(passa).toMatchObject({ ok: false, status: 409 });
    for (const durationMinutes of [4, 481, 2.5, Number.NaN]) {
      expect(await avulsa({ durationMinutes }), String(durationMinutes)).toMatchObject({ ok: false, status: 400 });
    }
    expect(await totalSessoes()).toBe(0);
  });

  it("conflitos continuam bloqueados: mesmo horário, sobreposição parcial, mesmo profissional e mesmo cliente", async () => {
    expect((await avulsa({ durationMinutes: 60 })).ok).toBe(true);
    expect(await avulsa({ clientId: 22 })).toMatchObject({ ok: false, status: 409 });
    expect(await avulsa({ clientId: 22, time: "09:20" })).toMatchObject({ ok: false, status: 409 });
    // Outra agenda do MESMO profissional no meio da consulta.
    expect(await avulsa({ clientId: 22, resourceId: MEDICO_MESMO_PROF, time: "09:20" })).toMatchObject({ ok: false, status: 409 });
    // Mesmo cliente, outra agenda e outro profissional, no meio da consulta dele.
    expect(await avulsa({ clientId: 21, resourceId: ONLINE, time: "09:20" })).toMatchObject({ ok: false, status: 409 });
    expect(await totalSessoes()).toBe(1);
  });

  it("consulta avulsa no mesmo horário de uma marcação de protocolo também fica bloqueada", async () => {
    await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id) VALUES (500,22,77,'Protocolo sintético','active','2030-03-06',5)`);
    expect((await bookSession({ resourceId: MEDICO, clientId: 22, protocolId: 500, date: WED1, time: "09:00", empresaId: 5 })).ok).toBe(true);
    expect(await avulsa({ clientId: 23 })).toMatchObject({ ok: false, status: 409 });
    expect(await totalSessoes()).toBe(1);
  });

  it("empresa errada: agenda de outra clínica ou cliente de outra clínica retornam 404 sem gravar", async () => {
    expect(await avulsa({ empresaId: 6 })).toMatchObject({ ok: false, status: 404, error: "Agenda não encontrada" });
    expect(await avulsa({ clientId: 31 })).toMatchObject({ ok: false, status: 404, error: "Cliente não encontrado" });
    expect(await totalSessoes()).toBe(0);
    expect(google.create).not.toHaveBeenCalled();
  });

  it("explícito: sem protocolo e sem marca de avulsa, ou com os dois, é recusado", async () => {
    expect(await bookSession({ resourceId: MEDICO, clientId: 21, date: WED1, time: "09:00", empresaId: 5 })).toMatchObject({ ok: false, status: 400 });
    expect(await avulsa({ protocolId: 500 })).toMatchObject({ ok: false, status: 400 });
    expect(await totalSessoes()).toBe(0);
  });
});

describe("Marcação vinculada a protocolo permanece igual", () => {
  it("grava o protocolo, conta a sequência e usa um período; duração editável é recusada", async () => {
    await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id) VALUES (501,21,77,'Protocolo sintético','active','2030-03-06',5)`);
    const a = await bookSession({ resourceId: ENFERMAGEM, clientId: 21, protocolId: 501, date: WED1, time: "09:00", empresaId: 5 });
    const b = await bookSession({ resourceId: ENFERMAGEM, clientId: 21, protocolId: 501, date: WED2, time: "09:00", empresaId: 5 });
    expect(a.ok && b.ok, JSON.stringify([a, b])).toBe(true);
    expect([a.session!.protocolId, a.session!.weekNumber, a.session!.durationMinutes]).toEqual([501, 1, 20]);
    expect([b.session!.protocolId, b.session!.weekNumber, b.session!.durationMinutes]).toEqual([501, 2, 20]);
    expect(await bookSession({ resourceId: ENFERMAGEM, clientId: 21, protocolId: 501, date: WED1, time: "09:20", durationMinutes: 60, empresaId: 5 }))
      .toMatchObject({ ok: false, status: 400 });
  });

  it("protocolo de outro cliente continua 404 e rota antiga continua exigindo protocolId", async () => {
    await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id) VALUES (502,22,77,'Protocolo sintético','active','2030-03-06',5)`);
    expect(await bookSession({ resourceId: ENFERMAGEM, clientId: 21, protocolId: 502, date: WED1, time: "09:00", empresaId: 5 }))
      .toMatchObject({ ok: false, status: 404, error: "Protocolo não pertence ao cliente" });
    const semProtocolo = await post("/api/agenda/book", { resourceId: ENFERMAGEM, clientId: 21, date: WED1, time: "09:00" });
    expect(semProtocolo.status).toBe(400);
    await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id) VALUES (503,21,77,'Protocolo sintético','active','2030-03-06',5)`);
    const ok = await post("/api/agenda/book", { resourceId: ENFERMAGEM, clientId: 21, protocolId: 503, date: WED1, time: "09:00" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.session.protocolId).toBe(503);
  });
});

describe("Google na consulta avulsa", () => {
  it("evento com horário pela duração, sem substâncias, sem legenda e sem procedimento presumido", async () => {
    const r = await avulsa({ durationMinutes: 60, syncGoogle: true });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.googleSyncWarning).toBeUndefined();
    expect(created()).toHaveLength(1);
    const d = descricao();
    expect(d).toContain("Cliente sintético 21");
    expect(d).toContain("Agendamento Número: 1/1");
    expect(d).toContain("09:00 às 10:00");
    expect(d).toContain("Consulta avulsa");
    expect(d).not.toContain("SUBSTÂNCIAS PROTOCOLO");
    expect(d).not.toContain("LEGENDA");
    expect(d).not.toContain("\u2705");
    expect(created()[0].calendarId).toBe(CAL_MED);
    expect((await rows(`SELECT google_event_id AS e FROM sessions`))[0].e).toBe(r.googleEventId);
  });

  it("falha do Google: reserva mantida, aviso claro e nova tentativa reaproveita o mesmo evento", async () => {
    const tentativas: string[] = [];
    google.create.mockImplementationOnce(async (data: any) => { tentativas.push(data.eventId); throw new Error("falha sintética do Google"); });
    const r = await avulsa({ syncGoogle: true });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.googleEventId ?? null).toBeNull();
    expect(r.googleSyncWarning).toContain("Marcação salva, mas o Google Agenda não recebeu o evento");
    const [salva] = await rows(`SELECT id, google_event_id AS e, google_sync_pending_event_id AS pev FROM sessions`);
    expect(salva.e).toBeNull();
    expect(salva.pev).toBe(tentativas[0]);
    expect(await totalSessoes()).toBe(1);

    // Nova tentativa (Google voltou): MESMO identificador, um único evento.
    const retry = await syncBookedSession(salva.id, 5);
    expect(retry.warning).toBeUndefined();
    // O registro de chamadas inclui a tentativa que falhou: as duas usam o MESMO identificador (nenhum evento novo).
    expect(created().map((c) => c.eventId)).toEqual([tentativas[0], tentativas[0]]);
    expect((await rows(`SELECT google_event_id AS e, google_sync_pending_operation AS p FROM sessions`))[0]).toEqual({ e: tentativas[0], p: null });
    // Terceira chamada: atualiza o mesmo evento, não cria outro.
    google.exists.mockResolvedValue(true);
    await syncBookedSession(salva.id, 5);
    expect(created()).toHaveLength(2); // nenhuma criação nova
    expect(google.update).toHaveBeenCalledTimes(1);
  });

  it("conta Google não confirmada: marcação salva, aviso e nenhum evento", async () => {
    google.verify.mockResolvedValue({ ok: false, account: null });
    const r = await avulsa({ syncGoogle: true });
    expect(r.ok).toBe(true);
    expect(r.googleSyncWarning).toContain("conta Google da clínica");
    expect(google.create).not.toHaveBeenCalled();
    expect(await totalSessoes()).toBe(1);
  });

  it("não expõe dados entre clínicas: sincronização com a empresa errada não envia nada", async () => {
    const r = await avulsa();
    const wrong = await syncBookedSession(r.session!.id, 6);
    expect(wrong.warning).toContain("visita não encontrada");
    expect(google.create).not.toHaveBeenCalled();
  });

  it("remarcar mantém a duração exata e move o evento sem duplicar", async () => {
    const r = await avulsa({ durationMinutes: 60, syncGoogle: true });
    const antigo = r.googleEventId!;
    google.create.mockClear();
    const moved = await rescheduleSession({ sessionId: r.session!.id, clientId: 21, resourceId: MEDICO, date: WED2, time: "10:00", syncGoogle: true });
    expect(moved.ok, JSON.stringify(moved)).toBe(true);
    expect(moved.session!.durationMinutes).toBe(60);
    expect(moved.session!.protocolId).toBeNull();
    expect(google.remove).toHaveBeenCalledWith(antigo, CAL_MED);
    expect(created()).toHaveLength(1);
    expect(descricao()).toContain("10:00 às 11:00");
  });
});

describe("Rota explícita POST /agenda/book-avulsa", () => {
  it("exige acesso profissional (a guarda real cobre a nova rota)", async () => {
    const anon = await request(app).post("/api/agenda/book-avulsa").set("x-test-anon", "1")
      .send({ resourceId: MEDICO, clientId: 21, date: WED1, time: "09:00" });
    expect(anon.status).toBe(401);
    expect(await totalSessoes()).toBe(0);
  });

  it("cria a consulta sem protocolo e recusa protocolId no corpo", async () => {
    const ok = await post("/api/agenda/book-avulsa", { resourceId: MEDICO, clientId: 21, date: WED1, time: "09:00", durationMinutes: 40 });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.session.protocolId).toBeNull();
    expect(ok.body.session.durationMinutes).toBe(40);
    const comProtocolo = await post("/api/agenda/book-avulsa", { resourceId: MEDICO, clientId: 22, protocolId: 1, date: WED1, time: "10:00" });
    expect(comProtocolo.status).toBe(400);
    expect(await totalSessoes()).toBe(1);
  });

  it("empresa errada no acesso: 404 e nada gravado; conflito: 409", async () => {
    const errada = await post("/api/agenda/book-avulsa", { resourceId: MEDICO, clientId: 21, date: WED1, time: "09:00" }, 6);
    expect(errada.status).toBe(404);
    expect(errada.body.error).toBe("Agenda não encontrada");
    expect(await totalSessoes()).toBe(0);
    expect((await post("/api/agenda/book-avulsa", { resourceId: MEDICO, clientId: 21, date: WED1, time: "09:00" })).status).toBe(201);
    expect((await post("/api/agenda/book-avulsa", { resourceId: MEDICO, clientId: 22, date: WED1, time: "09:00" })).status).toBe(409);
    expect(await totalSessoes()).toBe(1);
  });
});
