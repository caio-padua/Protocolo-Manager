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
import { bookSession, rescheduleSession } from "../lib/agenda-booking";
import { refreshSessionEventInPlace } from "../lib/session-google-sync";
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

const WED1 = "2030-03-06", WED2 = "2030-03-13";
const CAL2 = "online-sintetica@example.invalid", CAL3 = "homecare-sintetica@example.invalid";
const descricao = (i = 0) => buildDescriptionBody(created()[i]);

beforeAll(async () => {
  await query(`
    INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active,google_calendar_id,empresa_id) VALUES
      (2,'Enfermagem online sintética','enfermagem','online',20,NULL,NULL,true,'${CAL2}',5),
      (3,'Enfermagem home care sintética','enfermagem','home_care',20,NULL,NULL,true,'${CAL3}',5);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active) VALUES
      (2,3,'09:00','11:00',1,NULL,true),(3,3,'09:00','11:00',1,NULL,true);
  `);
});

async function protocoloComItens(clientId: number, itens: number[]) {
  const id = nextProtocol++;
  await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id,unit,service_type)
    VALUES($1,$2,77,'Protocolo sintético','suggested',$3,5,'Unidade sintética','clinic')`, [id, clientId, MON1]);
  for (const substanceId of itens) {
    await query(`INSERT INTO protocol_items(protocol_id,substance_id,dose,total_sessions,interval_days,start_date)
      VALUES($1,$2,$3,4,7,$4)`, [id, substanceId, `dose ${substanceId}`, MON1]);
  }
  return id;
}
const marcar = (resourceId: number, clientId: number, protocolId: number, date = WED1, time = "09:00") =>
  bookSession({ resourceId, clientId, protocolId, date, time, syncGoogle: true, empresaId: 5 });

describe("Marcação na agenda envia o MESMO evento completo do protocolo ao Google", () => {
  it("Sede: procedimentos, substâncias do protocolo como constantes, status, legenda e endereço do local", async () => {
    const protocolId = await protocoloComItens(21, [IM, IV]);
    const r = await marcar(1, 21, protocolId);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.googleSyncWarning).toBeUndefined();
    expect(created()).toHaveLength(1);
    const d = descricao();
    expect(d).toContain("Developed by: Padcon");
    expect(d).toContain("Cliente sintético 21");
    expect(d).toContain("Agendamento Número: 1/1");
    expect(d).toContain("SUBSTÂNCIAS PROTOCOLO:");
    expect(d).toContain("IM sintética");
    expect(d).toContain("IV sintética");
    expect(d).toContain("[INDI]");
    expect(d).toContain("NESTA VISITA: 0 de 2");
    expect(d).toContain("LEGENDA:");
    expect(d).toContain("Aplicação Programada");
    expect(d).toContain("RUA SINTÉTICA");
    expect(d).toContain("NAVEGAÇÃO:");
    // Nada presumido: nenhum procedimento marcado sem aplicação disponível.
    expect(d).not.toContain("\u2705");
    expect((await rows(`SELECT google_event_id AS e, google_calendar_id AS c FROM sessions WHERE id=$1`, [r.session!.id]))[0])
      .toEqual({ e: r.googleEventId, c: CAL });
  });

  it("Online: sem endereço físico no evento", async () => {
    const protocolId = await protocoloComItens(22, [IM]);
    const r = await marcar(2, 22, protocolId, WED1);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const d = descricao();
    expect(d).toContain("SUBSTÂNCIAS PROTOCOLO:");
    expect(d).not.toContain("NAVEGAÇÃO:");
    expect(d).not.toContain("RUA SINTÉTICA");
  });

  it("Home Care: usa o endereço do paciente; sem endereço, a marcação fica e o Google não recebe nada", async () => {
    const protocolId = await protocoloComItens(23, [IM]);
    const sem = await marcar(3, 23, protocolId);
    expect(sem.ok, JSON.stringify(sem)).toBe(true);
    expect(sem.googleEventId).toBeNull();
    expect(sem.googleSyncWarning).toContain("endereço do paciente");
    expect(google.create).not.toHaveBeenCalled();
    expect((await rows(`SELECT count(*)::int AS n FROM sessions WHERE protocol_id=$1`, [protocolId]))[0].n).toBe(1);

    await query(`UPDATE clients SET address='Rua do Paciente Sintético, 55, Bairro Teste, Cidade Teste - TS, CEP 11111-111' WHERE id=24`);
    const protocolId2 = await protocoloComItens(24, [IM]);
    const com = await marcar(3, 24, protocolId2, WED1, "10:00");
    expect(com.ok, JSON.stringify(com)).toBe(true);
    expect(com.googleSyncWarning).toBeUndefined();
    expect(descricao()).toContain("RUA DO PACIENTE SINTÉTICO");
  });

  it("conta Google errada: marcação salva e aviso claro, sem evento", async () => {
    google.verify.mockResolvedValue({ ok: false, account: "outra-conta@example.invalid" });
    const protocolId = await protocoloComItens(25, [IM]);
    const r = await marcar(1, 25, protocolId);
    expect(r.ok).toBe(true);
    expect(r.googleEventId).toBeNull();
    expect(r.googleSyncWarning).toContain("conta Google da clínica");
    expect(google.create).not.toHaveBeenCalled();
  });

  it("remarcar visita avulsa: remove o evento antigo e cria o novo, também completo", async () => {
    const protocolId = await protocoloComItens(26, [IM, IV]);
    const r = await marcar(1, 26, protocolId, WED1);
    const antigo = r.googleEventId!;
    google.create.mockClear();
    const moved = await rescheduleSession({ sessionId: r.session!.id, clientId: 26, resourceId: 1, date: WED2, time: "10:00", syncGoogle: true });
    expect(moved.ok, JSON.stringify(moved)).toBe(true);
    expect(google.remove).toHaveBeenCalledWith(antigo, CAL);
    expect(created()).toHaveLength(1);
    const d = descricao();
    expect(d).toContain("SUBSTÂNCIAS PROTOCOLO:");
    expect(d).toContain("Aplicação Remarcada");
    expect(d).toContain("10:00");
    expect(moved.googleEventId).not.toBe(antigo);
  });

  it("atualizar no lugar uma visita marcada e ainda sem aplicações reescreve o mesmo evento completo", async () => {
    const protocolId = await protocoloComItens(21, [IM]);
    const r = await marcar(1, 21, protocolId, WED2);
    google.update.mockClear();
    await query(`UPDATE sessions SET scheduled_time='10:20' WHERE id=$1`, [r.session!.id]);
    const result = await refreshSessionEventInPlace(r.session!.id, 5);
    expect(result).toMatchObject({ status: "sincronizado" });
    expect(google.update).toHaveBeenCalledTimes(1);
    const [eventId, calendarId, data] = google.update.mock.calls[0];
    expect(eventId).toBe(r.googleEventId);
    expect(calendarId).toBe(CAL);
    expect(buildDescriptionBody(data)).toContain("SUBSTÂNCIAS PROTOCOLO:");
    expect(buildDescriptionBody(data)).toContain("10:20");
  });
});
