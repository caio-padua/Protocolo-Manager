import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

// Banco PostgreSQL descartável, 100% sintético: nada do banco real é lido ou escrito.
const state = vi.hoisted(() => ({ database: null as any }));
// Controle da autorização simulada: a cadeia real (authorizeProtocol, resolveEmpresaId) continua valendo.
const auth = vi.hoisted(() => ({
  tenant: 5, memberEmpresa: 5, calls: 0, switchAfterCalls: Infinity, switchedEmpresa: 6,
  onCall: null as null | ((call: number) => Promise<void>),
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
// Google 100% simulado: nenhum evento real é criado. A montagem da descrição é a real.
const google = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), exists: vi.fn(), verify: vi.fn(), remove: vi.fn() }));
vi.mock("../lib/google-calendar.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/google-calendar")>();
  return {
    ...actual, createCalendarEvent: google.create, updateCalendarEvent: google.update,
    calendarEventExists: google.exists, verifyClinicAccount: google.verify, deleteCalendarEvent: google.remove,
  };
});
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: any, _s: any, n: any) => n() }));
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: () => auth.tenant }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (r: any, s: any, n: any) => {
    if (r.headers.authorization !== "Bearer synthetic-session") { s.sendStatus(401); return; }
    r.collaborator = { professionalId: 98 }; n();
  },
}));
vi.mock("../lib/clinical-emitter", () => ({
  ClinicalIdentityError: class extends Error {},
  resolveClinicalMember: async () => {
    auth.calls++;
    await auth.onCall?.(auth.calls);
    const empresaId = auth.calls > auth.switchAfterCalls ? auth.switchedEmpresa : auth.memberEmpresa;
    return { clinic: { id: 97, empresaId } };
  },
}));
vi.mock("../lib/google-drive", () => ({
  ensureClientFolderStructure: vi.fn(), uploadFileToDrive: vi.fn(), uploadToFolderById: vi.fn(),
  shareWithClient: vi.fn(), isDriveConnected: vi.fn(), formatPhysicalRASFileName: vi.fn(),
}));
vi.mock("../lib/pdf-signer", () => ({
  generateProtocolDocumentPdf: vi.fn(), generatePhysicalRASPdf: vi.fn(), getCertInfo: vi.fn(),
}));
vi.mock("../lib/pdf-carta-tratamento", () => ({
  generateProtocolLetterPdf: vi.fn(), buildCartaTratamentoDto: vi.fn(),
}));
vi.mock("../lib/prescription-signing", () => ({ withLoggedDoctorCertificate: vi.fn(), resolveProtocolDoctor: vi.fn() }));
vi.mock("../lib/assinatura/service", () => ({ enviarAssinatura: vi.fn() }));
vi.mock("../lib/cadernos-resolver", () => ({ resolverCodigosCadernos: vi.fn() }));
vi.mock("../lib/ras-fap-alert", () => ({ notifySlackRasFapFailure: vi.fn() }));
vi.mock("../lib/slack-reporter", () => ({ postSlackAlert: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ isGmailConnected: vi.fn(async () => true) }));
vi.mock("../lib/email-service", () => ({
  sendProtocolEmail: vi.fn(), sendCartaTratamentoEmail: vi.fn(),
  sendProtocolOnboardingEmail: vi.fn(async () => ({ success: true })),
}));
vi.mock("../lib/session-ics", () => ({ buildEventsForSessions: vi.fn(async () => []) }));
vi.mock("../lib/ics", () => ({ buildVCalendar: vi.fn() }));
import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable, empresasTable,
  locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable,
  clientsTable, protocolsTable, protocolItemsTable, substancesTable,
  clientPreferredAgendasTable, clientVisitPreferenceRevisionsTable, protocolEmissoesTable, paymentsTable,
  locationProfessionalsTable,
} from "@workspace/db/schema";
import protocolsRouter from "../routes/protocols";
import schedulingRouter from "../routes/protocol-scheduling";
import sessionsRouter from "../routes/sessions";
import { cancelBooking, computeResourceSlots, rescheduleSession } from "../lib/agenda-booking";
import { refreshSessionEventInPlace, removeSessionEvent } from "../lib/session-google-sync";
import { buildDescriptionBody, type CalendarEventData } from "../lib/google-calendar";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const query = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const rows = async (text: string, values?: unknown[]) => (await query(text, values)).rows;

const app = express();
app.use(express.json());
app.use((r, _s, n) => { r.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any; n(); });
app.use("/api", protocolsRouter);
app.use("/api", schedulingRouter);
app.use("/api", sessionsRouter);
app.use((err: Error, _r: any, s: any, _n: any) => s.status(500).json({ error: err.message }));
const post = (path: string, body: unknown = {}) =>
  request(app).post(path).set("Authorization", "Bearer synthetic-session").send(body as object);

// 2030-03-04 é segunda-feira. Agenda 1: segunda e quarta, 09h00 às 11h00. "Hoje" simulado: sexta 01/03/2030.
const MON1 = "2030-03-04", MON2 = "2030-03-11", MON3 = "2030-03-18";
const IM = 1, IV = 2;
const CAL = "agenda-sintetica@example.invalid";
const NOW = "2030-03-01T12:00:00-03:00";
let nextProtocol = 100;

/** Cria o protocolo e agenda pelas rotas reais (prévia + confirmação). Devolve as sessões reservadas. */
async function scheduled(clientId: number, items: { substanceId: number; total: number }[]) {
  const id = nextProtocol++;
  await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id,unit,service_type)
    VALUES($1,$2,77,'Protocolo sintético','suggested',$3,5,'Unidade sintética','clinic')`, [id, clientId, MON1]);
  for (const item of items) {
    await query(`INSERT INTO protocol_items(protocol_id,substance_id,dose,total_sessions,interval_days,start_date)
      VALUES($1,$2,$3,$4,7,$5)`, [id, item.substanceId, `dose ${item.substanceId}`, item.total, MON1]);
  }
  const preview = await post(`/api/protocols/${id}/scheduling/preview`);
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const confirm = await post(`/api/protocols/${id}/scheduling/confirm`, { fingerprint: preview.body.preview.fingerprint });
  expect(confirm.status, JSON.stringify(confirm.body)).toBe(201);
  return id;
}
const put = (path: string, body: unknown) =>
  request(app).put(path).set("Authorization", "Bearer synthetic-session").send(body as object);
const sync = (protocolId: number, body: object = {}) => post(`/api/protocols/${protocolId}/scheduling/google-sync`, body);
interface SessionState {
  id: number; d: string; ev: string | null; cal: string | null; pop: string | null; pev: string | null;
}
const sessionRows = (protocolId: number): Promise<SessionState[]> => rows(
  `SELECT id, scheduled_date AS d, google_event_id AS ev, google_calendar_id AS cal,
     google_sync_pending_operation AS pop, google_sync_pending_event_id AS pev
   FROM sessions WHERE protocol_id=$1 ORDER BY scheduled_date`, [protocolId]);
const counts = async () => ({
  sessions: (await rows(`SELECT count(*)::int AS n FROM sessions`))[0].n as number,
  applications: (await rows(`SELECT count(*)::int AS n FROM substance_applications`))[0].n as number,
});
const created = () => google.create.mock.calls.map(c => c[0] as CalendarEventData & { eventId: string });
const statuses = (body: any) => body.visits.map((v: any) => v.status);

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
    empresasTable, locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable, clientsTable,
    protocolsTable, protocolItemsTable, substancesTable, clientPreferredAgendasTable,
    clientVisitPreferenceRevisionsTable, protocolEmissoesTable, paymentsTable, locationProfessionalsTable]) {
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
    INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active,google_calendar_id) VALUES
      (1,'Enfermagem sintética','enfermagem','local',20,8,NULL,true,'${CAL}');
    INSERT INTO agenda_settings(id,block_minutes,trigger_percent,min_lead_hours) VALUES(1,120,60,24);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active) VALUES
      (1,1,'09:00','11:00',1,NULL,true),(1,3,'09:00','11:00',1,NULL,true);
    INSERT INTO clients(id,name,cpf,email,empresa_id,clinica_origem_empresa_id,agenda_enfermagem_padrao_id) VALUES
      (21,'Cliente sintético 21','000.000.000-21','cliente21@example.invalid',5,5,1),
      (22,'Cliente sintético 22','000.000.000-22','cliente22@example.invalid',5,5,1),
      (23,'Cliente sintético 23','000.000.000-23','cliente23@example.invalid',5,5,1),
      (24,'Cliente sintético 24','000.000.000-24','cliente24@example.invalid',5,5,1),
      (25,'Cliente sintético 25','000.000.000-25','cliente25@example.invalid',5,5,1),
      (26,'Cliente sintético 26','000.000.000-26','cliente26@example.invalid',5,5,1);
    INSERT INTO substances(id,name,category,color,procedure_type,doctor_participation,duration_minutes,precise_duration_seconds) VALUES
      (${IM},'IM sintética','x','#000','im',false,3,150),
      (${IV},'IV sintética','x','#000','iv',false,30,1800);
  `);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
}, 60_000);

beforeEach(async () => {
  await query(`TRUNCATE sessions, substance_applications, protocol_items, protocols, client_visit_preference_revisions`);
  await query(`UPDATE agenda_resources SET google_calendar_id='${CAL}', active=true WHERE id=1`);
  await query(`UPDATE locations SET active='true' WHERE id=8`);
  await query(`DELETE FROM location_professionals; INSERT INTO location_professionals(location_id,professional_id) VALUES (8,98)`);
  auth.tenant = 5; auth.memberEmpresa = 5; auth.calls = 0; auth.switchAfterCalls = Infinity; auth.onCall = null;
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

const WED1 = "2030-03-06", WED3 = "2030-03-20";
const detail = async (id: number) => (await rows(
  `SELECT status, scheduled_date AS d, scheduled_time AS t, duration_minutes AS dur, professional_id AS prof, unit,
     service_type AS service, resource_id AS res, reschedule_count AS moved, google_event_id AS ev, google_calendar_id AS cal,
     google_sync_pending_operation AS pop, (SELECT count(*)::int FROM substance_applications a WHERE a.session_id=sessions.id) AS apps
   FROM sessions WHERE id=$1`, [id]))[0];
async function occupy(date: string, time: string, clientId = 22) {
  await query(`INSERT INTO sessions(protocol_id,client_id,resource_id,scheduled_date,scheduled_time,duration_minutes,status,
    agenda_archived,empresa_id,week_number) VALUES(9000,$1,1,$2,$3,20,'scheduled',false,5,1)`, [clientId, date, time]);
}
const descriptionsByEvent = () => new Map(google.update.mock.calls.map(c => [c[0] as string, buildDescriptionBody(c[2])]));

describe("Remarcar visita de protocolo: duração reservada, trecho inteiro, mesmo evento no Google", () => {
  it("a visita de 60 minutos continua com 60 minutos, profissional e unidade, e ocupa os três períodos", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 3 }, { substanceId: IV, total: 1 }]);
    const [first] = await sessionRows(protocolId);
    const before = await detail(first.id);
    expect(before).toMatchObject({ dur: 60, prof: 77, unit: "Local sintético A" });
    const response = await put(`/api/sessions/${first.id}`, { scheduledDate: WED1, scheduledTime: "09:00" });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(await detail(first.id)).toMatchObject({
      d: WED1, t: "09:00", dur: 60, prof: 77, unit: "Local sintético A", service: before.service, res: 1, moved: 1,
    });
    // O motor enxerga o trecho inteiro ocupado: ninguém marca 09h20 nem 09h40 em cima da visita.
    const day = await computeResourceSlots(1, WED1);
    const states = Object.fromEntries(day!.result.slots.map(s => [s.time, s.state]));
    expect([states["09:00"], states["09:20"], states["09:40"]].every(s => s !== "aberto"), JSON.stringify(states)).toBe(true);
    expect(states["10:00"], JSON.stringify(states)).toBe("aberto");
  });

  it("recusa o novo horário quando o trecho inteiro não cabe (fim do expediente ou período ocupado) e não muda nada", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 3 }, { substanceId: IV, total: 1 }]);
    const [first] = await sessionRows(protocolId);
    const before = await detail(first.id);
    // Expediente termina às 11h00: 10h20 + 60 minutos não cabe.
    const late = await put(`/api/sessions/${first.id}`, { scheduledDate: WED1, scheduledTime: "10:20" });
    expect(late.status).toBe(409);
    expect(late.body.error).toContain("60 minutos seguidos");
    // Período do meio ocupado por outro cliente.
    await occupy(WED1, "09:40");
    const middle = await put(`/api/sessions/${first.id}`, { scheduledDate: WED1, scheduledTime: "09:00" });
    expect(middle.status).toBe(409);
    expect(middle.body.error).toContain("09:40");
    expect(await detail(first.id)).toEqual(before);
  });

  it("sessão avulsa de um período remarca exatamente como antes", async () => {
    await query(`INSERT INTO sessions(id,protocol_id,client_id,resource_id,scheduled_date,scheduled_time,duration_minutes,status,
      agenda_archived,empresa_id,week_number,unit) VALUES(7001,9100,22,1,'${MON1}','10:00',20,'scheduled',false,5,1,'Enfermagem sintética')`);
    const moved = await rescheduleSession({ sessionId: 7001, clientId: 22, resourceId: 1, date: WED1, time: "10:00", syncGoogle: false });
    expect(moved).toMatchObject({ ok: true, status: 200 });
    expect(moved.googleRefreshNeeded).toBe(false);
    expect(await detail(7001)).toMatchObject({ d: WED1, t: "10:00", dur: 20 });
    expect(google.create).not.toHaveBeenCalled();
  });

  it("visita já no Google: o MESMO evento é atualizado (sem apagar nem criar) com tudo na descrição e a posição cronológica", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 3 }, { substanceId: IV, total: 1 }]);
    await sync(protocolId);
    const [first, second, third] = await sessionRows(protocolId);
    google.create.mockClear(); google.update.mockClear();
    // A 1ª visita passa para depois da 3ª: vira "3/3" na descrição; as outras só mudam quando atualizadas.
    const response = await put(`/api/sessions/${first.id}`, { scheduledDate: WED3, scheduledTime: "09:00" });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).not.toHaveProperty("googleSyncWarning");
    expect(google.create).not.toHaveBeenCalled();
    expect(google.remove).not.toHaveBeenCalled();
    expect(google.update).toHaveBeenCalledTimes(1);
    const [eventId, calendarId, data] = google.update.mock.calls[0];
    expect([eventId, calendarId]).toEqual([first.ev, CAL]);
    expect(data.scheduledDate).toBe(WED3);
    const text = buildDescriptionBody(data);
    expect(text).toContain("Agendamento Número: 3/3");
    expect(text).toContain("[1/3] IM sintética dose 1");
    expect(text).toContain("[1/1] IV sintética dose 2");
    expect(await detail(first.id)).toMatchObject({ ev: first.ev, cal: CAL, pop: null });
    expect(await detail(second.id)).toMatchObject({ ev: second.ev });
    expect(await detail(third.id)).toMatchObject({ ev: third.ev });
  });

  it("falha do Google na remarcação: a remarcação vale, vem o aviso e a repetição conserta com o mesmo identificador", async () => {
    const protocolId = await scheduled(23, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const [first] = await sessionRows(protocolId);
    google.update.mockRejectedValueOnce(new Error("Google fora do ar"));
    const response = await put(`/api/sessions/${first.id}`, { scheduledDate: WED1, scheduledTime: "09:00" });
    expect(response.status).toBe(200);
    expect(response.body.googleSyncWarning).toContain("Google");
    expect(JSON.stringify(response.body)).not.toContain("fora do ar");
    const hurt = await detail(first.id);
    expect(hurt).toMatchObject({ d: WED1, ev: first.ev });
    expect(hurt.pop).not.toBeNull();
    google.update.mockClear(); google.create.mockClear(); google.exists.mockResolvedValue(true);
    const retry = await sync(protocolId);
    expect(statuses(retry.body)).toEqual(["sincronizado", "ja_sincronizado"]);
    expect(google.create).not.toHaveBeenCalled();
    expect(google.update.mock.calls.map(c => c[0])).toEqual([first.ev]);
    expect(await detail(first.id)).toMatchObject({ ev: first.ev, pop: null });
  });

  it("visita que ainda não está no Google não chama o Google ao remarcar", async () => {
    const protocolId = await scheduled(24, [{ substanceId: IM, total: 2 }]);
    const [first] = await sessionRows(protocolId);
    // A prévia do agendamento (montagem do cenário acima) confere a conta Google de propósito. Só o que a REMARCAÇÃO faz conta aqui.
    for (const fn of [google.create, google.update, google.remove, google.exists, google.verify]) fn.mockClear();
    const response = await put(`/api/sessions/${first.id}`, { scheduledDate: WED1, scheduledTime: "09:00" });
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("googleSyncWarning");
    for (const fn of [google.create, google.update, google.remove, google.exists, google.verify]) expect(fn).not.toHaveBeenCalled();
  });

  it("outra clínica não remarca nem cancela", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const [first] = await sessionRows(protocolId);
    const before = await detail(first.id);
    google.update.mockClear(); google.remove.mockClear();
    auth.tenant = 6;
    expect((await put(`/api/sessions/${first.id}`, { scheduledDate: WED1, scheduledTime: "09:00" })).status).toBe(404);
    expect((await put(`/api/sessions/${first.id}`, { status: "cancelled" })).status).toBe(404);
    expect(await detail(first.id)).toEqual(before);
    expect(google.update).not.toHaveBeenCalled();
    expect(google.remove).not.toHaveBeenCalled();
  });
});

describe("Cancelar visita de protocolo: evento sai do Google, dados ficam, numeração acompanha", () => {
  it("cancelar remove o evento, limpa o ponteiro, preserva as aplicações e renumera as visitas ativas", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 3 }]);
    await sync(protocolId);
    const [first, second, third] = await sessionRows(protocolId);
    const response = await put(`/api/sessions/${second.id}`, { status: "cancelled" });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).not.toHaveProperty("googleSyncWarning");
    expect(google.remove).toHaveBeenCalledTimes(1);
    expect(google.remove.mock.calls[0]).toEqual([second.ev, CAL]);
    expect(await detail(second.id)).toMatchObject({ status: "cancelled", ev: null, cal: null, apps: 1 });
    // Atualizar o restante: duas visitas ativas, numeradas 1/2 e 2/2 (nunca "3/2").
    google.update.mockClear();
    const refreshed = await sync(protocolId, { refresh: true });
    expect(statuses(refreshed.body)).toEqual(["sincronizado", "sincronizado"]);
    const texts = descriptionsByEvent();
    expect(texts.get(first.ev!)).toContain("Agendamento Número: 1/2");
    expect(texts.get(third.ev!)).toContain("Agendamento Número: 2/2");
    expect([...texts.values()].some(t => t.includes("/3\n") && t.includes("Agendamento Número: 3/"))).toBe(false);
  });

  it("falha do Google ao remover: cancelamento vale, ponteiro é mantido e há aviso; evento já inexistente conta como removido", async () => {
    const protocolId = await scheduled(22, [{ substanceId: IM, total: 3 }]);
    await sync(protocolId);
    const [first, second, third] = await sessionRows(protocolId);
    google.remove.mockRejectedValueOnce(Object.assign(new Error("Backend Error"), { code: 500 }));
    const failed = await put(`/api/sessions/${first.id}`, { status: "cancelled" });
    expect(failed.status).toBe(200);
    expect(failed.body.googleSyncWarning).toContain("continua lá");
    expect(await detail(first.id)).toMatchObject({ status: "cancelled", ev: first.ev, cal: CAL });
    for (const code of [404, 410]) {
      const target = code === 404 ? second : third;
      google.remove.mockRejectedValueOnce(Object.assign(new Error("gone"), { code }));
      const gone = await put(`/api/sessions/${target.id}`, { status: "cancelled" });
      expect(gone.status).toBe(200);
      expect(gone.body).not.toHaveProperty("googleSyncWarning");
      expect(await detail(target.id)).toMatchObject({ status: "cancelled", ev: null, cal: null });
    }
  });

  it("cancelar visita sem evento não chama o Google; cancelar de novo não remove nada", async () => {
    const protocolId = await scheduled(23, [{ substanceId: IM, total: 2 }]);
    const [first] = await sessionRows(protocolId);
    const response = await put(`/api/sessions/${first.id}`, { status: "cancelled" });
    expect(response.status).toBe(200);
    expect(google.remove).not.toHaveBeenCalled();
    const again = await put(`/api/sessions/${first.id}`, { status: "cancelled" });
    expect(again.status).toBe(200);
    expect(google.remove).not.toHaveBeenCalled();
  });

  it("cancelamento pela rota de marcação (cancelBooking) segue a mesma regra: limpa ou mantém o rastro", async () => {
    const protocolId = await scheduled(24, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const [first, second] = await sessionRows(protocolId);
    google.remove.mockRejectedValueOnce(Object.assign(new Error("Backend Error"), { code: 500 }));
    const failed = await cancelBooking(first.id, 5);
    expect(failed).toMatchObject({ ok: true });
    expect(failed.googleSyncWarning).toContain("continua lá");
    expect(await detail(first.id)).toMatchObject({ status: "cancelled", ev: first.ev, cal: CAL });
    const done = await cancelBooking(second.id, 5);
    expect(done.googleSyncWarning).toBeUndefined();
    expect(await detail(second.id)).toMatchObject({ status: "cancelled", ev: null, cal: null });
    expect(await cancelBooking(second.id, 6)).toMatchObject({ ok: false, status: 404 });
  });

  it("cancelBooking: evento que já não existe no Google (404/410) conta como removido, sem aviso", async () => {
    const protocolId = await scheduled(25, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const [first, second] = await sessionRows(protocolId);
    for (const [target, code] of [[first, 404], [second, 410]] as const) {
      google.remove.mockRejectedValueOnce(Object.assign(new Error("gone"), { code }));
      const result = await cancelBooking(target.id, 5);
      expect(result).toMatchObject({ ok: true });
      expect(result.googleSyncWarning).toBeUndefined();
      expect(await detail(target.id)).toMatchObject({ status: "cancelled", ev: null, cal: null });
    }
  });
});

describe("Revisão independente: conta Google, repetição do cancelamento e leitura entre clínicas", () => {
  it("cancelar de novo uma visita cujo evento ficou no Google tenta remover outra vez e limpa o ponteiro", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const [first] = await sessionRows(protocolId);
    google.remove.mockRejectedValueOnce(Object.assign(new Error("Backend Error"), { code: 500 }));
    expect((await put(`/api/sessions/${first.id}`, { status: "cancelled" })).body.googleSyncWarning).toContain("continua lá");
    expect(await detail(first.id)).toMatchObject({ status: "cancelled", ev: first.ev });
    const again = await put(`/api/sessions/${first.id}`, { status: "cancelled" });
    expect(again.status).toBe(200);
    expect(again.body).not.toHaveProperty("googleSyncWarning");
    expect(google.remove).toHaveBeenCalledTimes(2);
    expect(await detail(first.id)).toMatchObject({ status: "cancelled", ev: null, cal: null });
  });

  it("conta Google da clínica não confirmada: remarcação não altera o evento e avisa", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const [first] = await sessionRows(protocolId);
    google.update.mockClear();
    google.verify.mockResolvedValueOnce({ ok: false, account: "outra-conta@example.invalid" });
    const result = await refreshSessionEventInPlace(first.id, 5);
    expect(result).toMatchObject({ status: "falhou", code: "google_indisponivel" });
    google.verify.mockRejectedValueOnce(new Error("Google fora do ar"));
    expect(await refreshSessionEventInPlace(first.id, 5)).toMatchObject({ status: "falhou", code: "google_indisponivel" });
    expect(google.update).not.toHaveBeenCalled();
    expect(google.create).toHaveBeenCalledTimes(2);
  });

  it("conta Google não confirmada: cancelar mantém o ponteiro, não chama a exclusão e avisa (404 não prova remoção)", async () => {
    const protocolId = await scheduled(22, [{ substanceId: IM, total: 3 }]);
    await sync(protocolId);
    const [first, second, third] = await sessionRows(protocolId);
    google.verify.mockResolvedValueOnce({ ok: false, account: "outra-conta@example.invalid" });
    const viaRoute = await put(`/api/sessions/${first.id}`, { status: "cancelled" });
    expect(viaRoute.status).toBe(200);
    expect(viaRoute.body.googleSyncWarning).toContain("conta Google da clínica não foi confirmada");
    expect(await detail(first.id)).toMatchObject({ status: "cancelled", ev: first.ev, cal: CAL });
    google.verify.mockRejectedValueOnce(new Error("Google fora do ar"));
    const viaBooking = await cancelBooking(second.id, 5);
    expect(viaBooking).toMatchObject({ ok: true });
    expect(viaBooking.googleSyncWarning).toContain("conta Google da clínica não foi confirmada");
    expect(await detail(second.id)).toMatchObject({ status: "cancelled", ev: second.ev, cal: CAL });
    google.verify.mockResolvedValueOnce({ ok: false });
    expect(await removeSessionEvent(third.id, 5)).toMatchObject({ removed: false });
    expect(google.remove).not.toHaveBeenCalled();
    expect(await detail(third.id)).toMatchObject({ ev: third.ev });
  });

  it("GET /sessions/:id: da mesma clínica devolve; de outra clínica é 'não encontrada'", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 2 }]);
    const [first] = await sessionRows(protocolId);
    const own = await request(app).get(`/api/sessions/${first.id}`);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect(own.body.id).toBe(first.id);
    auth.tenant = 6;
    const other = await request(app).get(`/api/sessions/${first.id}`);
    expect(other.status).toBe(404);
    expect(JSON.stringify(other.body)).not.toContain("Cliente sintético");
  });
});

describe("Remarcar: limites do comportamento (outra agenda Google, sessão avulsa, arredondamento, defesa em profundidade)", () => {
  it("mudar para outra agenda com outro calendário Google não atualiza o evento no lugar e mantém a duração reservada", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 3 }, { substanceId: IV, total: 1 }]);
    await sync(protocolId);
    const [first] = await sessionRows(protocolId);
    await query(`INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active,google_calendar_id)
      VALUES(2,'Enfermagem sintética 2','enfermagem','local',20,8,NULL,true,'outra-agenda@example.invalid')`);
    await query(`INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active) VALUES(2,3,'09:00','11:00',1,NULL,true)`);
    try {
      const moved = await rescheduleSession({ sessionId: first.id, clientId: 21, resourceId: 2, date: WED1, time: "09:00", syncGoogle: false });
      expect(moved).toMatchObject({ ok: true, status: 200 });
      expect(moved.googleRefreshNeeded).toBe(false);
      // O evento antigo não acompanha: a tela precisa ser avisada, nunca receber sucesso silencioso.
      expect(moved.googleSyncWarning).toContain("continua no dia e horário antigos");
      expect(await detail(first.id)).toMatchObject({ res: 2, dur: 60, d: WED1, unit: "Enfermagem sintética 2", ev: first.ev });
    } finally {
      await query(`DELETE FROM agenda_windows WHERE resource_id=2; DELETE FROM agenda_resources WHERE id=2`);
    }
  });

  it("sessão avulsa (sem aplicações) já no Google continua com o comportamento antigo: apaga e recria", async () => {
    await query(`INSERT INTO sessions(id,protocol_id,client_id,resource_id,scheduled_date,scheduled_time,duration_minutes,status,
      agenda_archived,empresa_id,week_number,unit,google_event_id,google_calendar_id)
      VALUES(7002,9100,22,1,'${MON1}','10:00',20,'scheduled',false,5,1,'Enfermagem sintética','evento-antigo','${CAL}')`);
    const moved = await rescheduleSession({ sessionId: 7002, clientId: 22, resourceId: 1, date: WED1, time: "10:00", syncGoogle: true });
    expect(moved).toMatchObject({ ok: true });
    expect(moved.googleRefreshNeeded).toBe(false);
    expect(google.remove).toHaveBeenCalledWith("evento-antigo", CAL);
    expect(google.create).toHaveBeenCalledTimes(1);
    expect(google.update).not.toHaveBeenCalled();
  });

  it("duração gravada fora do múltiplo do período arredonda para cima, nunca para baixo", async () => {
    await query(`INSERT INTO sessions(id,protocol_id,client_id,resource_id,scheduled_date,scheduled_time,duration_minutes,status,
      agenda_archived,empresa_id,week_number,unit) VALUES(7003,9100,22,1,'${MON1}','10:00',30,'scheduled',false,5,1,'Enfermagem sintética')`);
    const moved = await rescheduleSession({ sessionId: 7003, clientId: 22, resourceId: 1, date: WED1, time: "09:00", syncGoogle: false });
    expect(moved).toMatchObject({ ok: true });
    expect(await detail(7003)).toMatchObject({ dur: 40 });
  });

  it("a atualização no lugar confere a clínica e ignora visita cancelada, sem evento ou inexistente", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const [first, second] = await sessionRows(protocolId);
    google.update.mockClear();
    expect(await refreshSessionEventInPlace(first.id, 6)).toBeNull();
    // Defesa em profundidade: sessão de outra clínica é recusada mesmo que o cliente seja da clínica certa.
    await query(`UPDATE sessions SET empresa_id=6 WHERE id=$1`, [first.id]);
    expect(await refreshSessionEventInPlace(first.id, 5)).toBeNull();
    await query(`UPDATE sessions SET empresa_id=5 WHERE id=$1`, [first.id]);
    expect(await refreshSessionEventInPlace(999999, 5)).toBeNull();
    await query(`UPDATE sessions SET status='cancelled' WHERE id=$1`, [second.id]);
    expect(await refreshSessionEventInPlace(second.id, 5)).toBeNull();
    await query(`UPDATE sessions SET google_event_id=NULL, google_calendar_id=NULL WHERE id=$1`, [first.id]);
    expect(await refreshSessionEventInPlace(first.id, 5)).toBeNull();
    expect(google.update).not.toHaveBeenCalled();
  });

  it("a remoção do evento confere a clínica: outra clínica não apaga o evento nem o ponteiro", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const [first] = await sessionRows(protocolId);
    google.remove.mockClear();
    expect(await removeSessionEvent(first.id, 6)).toEqual({ removed: false });
    expect(google.remove).not.toHaveBeenCalled();
    expect(await detail(first.id)).toMatchObject({ ev: first.ev, cal: CAL });
  });
});
