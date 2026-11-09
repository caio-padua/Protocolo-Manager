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
const google = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), exists: vi.fn(), verify: vi.fn() }));
vi.mock("../lib/google-calendar.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/google-calendar")>();
  return {
    ...actual, createCalendarEvent: google.create, updateCalendarEvent: google.update,
    calendarEventExists: google.exists, verifyClinicAccount: google.verify, deleteCalendarEvent: vi.fn(),
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
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
  locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable,
  clientsTable, protocolsTable, protocolItemsTable, substancesTable,
  clientPreferredAgendasTable, clientVisitPreferenceRevisionsTable, protocolEmissoesTable, paymentsTable,
  locationProfessionalsTable,
} from "@workspace/db/schema";
import protocolsRouter from "../routes/protocols";
import schedulingRouter from "../routes/protocol-scheduling";
import { buildDescriptionBody, type CalendarEventData } from "../lib/google-calendar";
import { googleReadinessWarning } from "../lib/session-google-sync";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const query = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const rows = async (text: string, values?: unknown[]) => (await query(text, values)).rows;

const app = express();
app.use(express.json());
app.use((r, _s, n) => { r.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any; n(); });
app.use("/api", protocolsRouter);
app.use("/api", schedulingRouter);
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
    locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable, clientsTable,
    protocolsTable, protocolItemsTable, substancesTable, clientPreferredAgendasTable,
    clientVisitPreferenceRevisionsTable, protocolEmissoesTable, paymentsTable, locationProfessionalsTable]) {
    await query(createTableFromSchema(table));
  }
  await query(`
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
    INSERT INTO clients(id,name,cpf,email,empresa_id,agenda_enfermagem_padrao_id) VALUES
      (21,'Cliente sintético 21','000.000.000-21','cliente21@example.invalid',5,1),
      (22,'Cliente sintético 22','000.000.000-22','cliente22@example.invalid',5,1),
      (23,'Cliente sintético 23','000.000.000-23','cliente23@example.invalid',5,1),
      (24,'Cliente sintético 24','000.000.000-24','cliente24@example.invalid',5,1),
      (25,'Cliente sintético 25','000.000.000-25','cliente25@example.invalid',5,1),
      (26,'Cliente sintético 26','000.000.000-26','cliente26@example.invalid',5,1);
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
  google.verify.mockResolvedValue({ ok: true, account: "conta-sintetica@example.invalid" });
});

afterAll(async () => {
  vi.useRealTimers();
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("Envio das visitas ao Google Agenda: um evento por visita, todas as substâncias na descrição", () => {
  it("cria um evento por visita com o identificador reservado e a descrição completa", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 3 }, { substanceId: IV, total: 1 }]);
    const response = await sync(protocolId);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(statuses(response.body)).toEqual(["sincronizado", "sincronizado", "sincronizado"]);
    expect(response.body).toMatchObject({ synced: 3, alreadySynced: 0, failed: 0, remaining: 0 });
    expect(google.verify).toHaveBeenCalledTimes(1);

    const events = created();
    expect(events).toHaveLength(3);
    expect(events.map(e => [e.scheduledDate, e.scheduledTime, e.calendarId, e.durationMinutes])).toEqual([
      [MON1, "09:00", CAL, 60], [MON2, "09:00", CAL, 20], [MON3, "09:00", CAL, 20],
    ]);
    // Primeira visita: duas substâncias no MESMO evento, cada uma com dose e posição "n/total".
    const first = buildDescriptionBody(events[0]);
    expect(first).toContain("IM sintética dose 1");
    expect(first).toContain("[1/3] IM sintética dose 1");
    expect(first).toContain("[1/1] IV sintética dose 2");
    expect(first).toContain("Agendamento Número: 1/3");
    expect(first).toContain("Cliente sintético 21");
    expect(buildDescriptionBody(events[1])).toContain("[2/3] IM sintética dose 1");
    expect(buildDescriptionBody(events[1])).not.toContain("IV sintética");
    expect(buildDescriptionBody(events[2])).toContain("[3/3] IM sintética dose 1");
    // O que vai ao Google não tem participante nenhum.
    for (const event of events) expect(Object.keys(event)).not.toContain("attendees");

    const saved = await sessionRows(protocolId);
    expect(saved.map(s => s.ev)).toEqual(events.map(e => e.eventId));
    expect(new Set(saved.map(s => s.ev)).size).toBe(3);
    expect(saved.every(s => s.cal === CAL && s.pop === null && s.pev === null)).toBe(true);
    expect(saved.every(s => /^[0-9a-f]{32}$/.test(String(s.ev)))).toBe(true);
  });

  it("repetir o envio não toca no Google; atualizar reutiliza o MESMO evento", async () => {
    const protocolId = await scheduled(22, [{ substanceId: IM, total: 2 }]);
    await sync(protocolId);
    const ids = (await sessionRows(protocolId)).map(s => s.ev);
    google.create.mockClear();
    const again = await sync(protocolId);
    expect(statuses(again.body)).toEqual(["ja_sincronizado", "ja_sincronizado"]);
    expect(google.create).not.toHaveBeenCalled();
    expect(google.update).not.toHaveBeenCalled();
    expect(google.verify).toHaveBeenCalledTimes(1); // nada a enviar: nem a conta é consultada de novo

    const refreshed = await sync(protocolId, { refresh: true });
    expect(statuses(refreshed.body)).toEqual(["sincronizado", "sincronizado"]);
    expect(google.create).not.toHaveBeenCalled();
    expect(google.update.mock.calls.map(c => c[0])).toEqual(ids);
    expect(google.update.mock.calls.every(c => c[1] === CAL)).toBe(true);
    expect((await sessionRows(protocolId)).map(s => s.ev)).toEqual(ids);
  });

  it("falha do Google nunca desfaz a reserva; a repetição reaproveita o identificador, sem duplicar", async () => {
    const protocolId = await scheduled(23, [{ substanceId: IM, total: 3 }]);
    const before = await counts();
    google.create.mockImplementationOnce(async (d: any) => d.eventId)
      .mockRejectedValueOnce(new Error("falha simulada do Google"));
    const failed = await sync(protocolId);
    expect(failed.status).toBe(200);
    expect(statuses(failed.body)).toEqual(["sincronizado", "incerto", "sincronizado"]);
    expect(failed.body).toMatchObject({ synced: 2, failed: 1 });
    expect(await counts()).toEqual(before); // sessões e aplicações intactas
    const afterFailure = await sessionRows(protocolId);
    expect(afterFailure[1].ev).toBeNull();
    expect(afterFailure[1].pop).not.toBeNull();
    const reserved = afterFailure[1].pev as string;
    expect(reserved).toMatch(/^[0-9a-f]{32}$/);
    // O erro do Google não vaza para o cliente; só a orientação.
    expect(JSON.stringify(failed.body)).not.toContain("falha simulada");

    // Repetição: o evento não existe no Google -> cria com o MESMO identificador reservado.
    google.create.mockClear(); google.exists.mockResolvedValue(false);
    const retry = await sync(protocolId);
    expect(statuses(retry.body)).toEqual(["ja_sincronizado", "sincronizado", "ja_sincronizado"]);
    expect(google.exists).toHaveBeenCalledWith(reserved, CAL);
    expect(created().map(e => e.eventId)).toEqual([reserved]);
    const healed = await sessionRows(protocolId);
    expect(healed[1]).toMatchObject({ ev: reserved, pop: null, pev: null });
    expect(new Set(healed.map(s => s.ev)).size).toBe(3);
  });

  it("resultado incerto em que o Google JÁ recebeu o evento: a conferência atualiza, não cria outro", async () => {
    const protocolId = await scheduled(24, [{ substanceId: IM, total: 2 }]);
    google.create.mockRejectedValueOnce(new Error("resposta perdida"));
    const first = await sync(protocolId);
    expect(statuses(first.body)).toEqual(["incerto", "sincronizado"]);
    const reserved = (await sessionRows(protocolId))[0].pev as string;
    google.create.mockClear(); google.exists.mockResolvedValue(true);
    const retry = await sync(protocolId);
    expect(statuses(retry.body)).toEqual(["sincronizado", "ja_sincronizado"]);
    expect(google.create).not.toHaveBeenCalled();
    expect(google.update).toHaveBeenCalledTimes(1);
    expect(google.update.mock.calls[0][0]).toBe(reserved);
    expect((await sessionRows(protocolId))[0]).toMatchObject({ ev: reserved, pop: null, pev: null });
  });

  it("falha na própria conferência mantém a reserva incerta e não grava evento nenhum", async () => {
    const protocolId = await scheduled(25, [{ substanceId: IM, total: 1 }]);
    google.create.mockRejectedValueOnce(new Error("falha 1"));
    await sync(protocolId);
    const reserved = (await sessionRows(protocolId))[0].pev;
    google.exists.mockRejectedValue(new Error("Google fora do ar")); // erro NÃO é "não existe"
    const retry = await sync(protocolId);
    expect(statuses(retry.body)).toEqual(["incerto"]);
    expect(google.create).toHaveBeenCalledTimes(1); // só a primeira tentativa
    expect((await sessionRows(protocolId))[0]).toMatchObject({ ev: null, pev: reserved });
  });

  it("conta Google não confirmada: 503, nada enviado, visitas continuam reservadas", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 2 }]);
    google.verify.mockResolvedValue({ ok: false, account: null });
    const response = await sync(protocolId);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: "google_indisponivel" });
    expect(google.create).not.toHaveBeenCalled();
    expect((await sessionRows(protocolId)).every(s => s.ev === null && s.pop === null)).toBe(true);
    expect((await counts()).sessions).toBe(2);
  });
});

describe("Destinos recusados: nada é enviado e o motivo é dito", () => {
  const onlyCodes = (body: any) => [...new Set(body.visits.map((v: any) => v.code))];

  it("agenda sem calendário Google, agenda inativa, local inativo ou profissional sem vínculo", async () => {
    const cases: [string, string, string][] = [
      ["UPDATE agenda_resources SET google_calendar_id=NULL WHERE id=1", "agenda_sem_google", "UPDATE agenda_resources SET google_calendar_id='" + CAL + "' WHERE id=1"],
      ["UPDATE agenda_resources SET active=false WHERE id=1", "agenda_inativa", "UPDATE agenda_resources SET active=true WHERE id=1"],
      ["UPDATE locations SET active='false' WHERE id=8", "local_invalido", "UPDATE locations SET active='true' WHERE id=8"],
      ["DELETE FROM location_professionals", "sem_vinculo_local", "INSERT INTO location_professionals(location_id,professional_id) VALUES (8,98)"],
    ];
    for (const [break_, code, fix] of cases) {
      const protocolId = await scheduled(26, [{ substanceId: IM, total: 1 }]);
      await query(break_);
      try {
        const response = await sync(protocolId);
        expect(response.status, code).toBe(200);
        expect(onlyCodes(response.body), code).toEqual([code]);
        expect(statuses(response.body), code).toEqual(["falhou"]);
        expect(google.create, code).not.toHaveBeenCalled();
        expect((await sessionRows(protocolId))[0].ev, code).toBeNull();
      } finally {
        await query(fix);
      }
      await query(`TRUNCATE sessions, substance_applications, protocol_items, protocols`);
    }
  });

  it("visita no formato antigo (sem agenda) é informada e não enviada; cancelada é ignorada", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 3 }]);
    const sessions = await sessionRows(protocolId);
    await query(`UPDATE sessions SET resource_id=NULL WHERE id=$1`, [sessions[0].id]);
    await query(`UPDATE sessions SET status='cancelled' WHERE id=$1`, [sessions[2].id]);
    const response = await sync(protocolId);
    expect(response.body.visits.map((v: any) => [v.date, v.status, v.code ?? null])).toEqual([
      [MON1, "falhou", "visita_sem_agenda"], [MON2, "sincronizado", null],
    ]);
    expect(created()).toHaveLength(1);
  });

  it("visita já ligada a OUTRA agenda Google não é movida; pendência de outra agenda exige conferência manual", async () => {
    const protocolId = await scheduled(23, [{ substanceId: IM, total: 2 }]);
    const sessions = await sessionRows(protocolId);
    await query(`UPDATE sessions SET google_event_id='evento-antigo', google_calendar_id='outra@example.invalid' WHERE id=$1`, [sessions[0].id]);
    await query(`UPDATE sessions SET google_sync_pending_operation='op-antiga', google_sync_pending_event_id=$2,
      google_sync_pending_calendar_id='outra@example.invalid' WHERE id=$1`, [sessions[1].id, "a".repeat(32)]);
    const response = await sync(protocolId, { refresh: true });
    expect(response.body.visits.map((v: any) => [v.status, v.code])).toEqual([
      ["falhou", "outra_agenda_google"], ["incerto", "resultado_incerto"],
    ]);
    expect(google.create).not.toHaveBeenCalled();
    expect(google.update).not.toHaveBeenCalled();
    expect(google.exists).not.toHaveBeenCalled();
    const after = await sessionRows(protocolId);
    expect(after[0]).toMatchObject({ ev: "evento-antigo", cal: "outra@example.invalid" });
    expect(after[1]).toMatchObject({ ev: null, pop: "op-antiga", pev: "a".repeat(32) });
  });

  it("protocolo sem visitas devolve 409 e nem consulta o Google", async () => {
    await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id,unit,service_type)
      VALUES(900,21,77,'Sem sessões','suggested','${MON1}',5,'U','clinic')`);
    const response = await sync(900);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "sem_visitas" });
    expect(google.verify).not.toHaveBeenCalled();
  });
});

describe("Autorização e contrato da rota de envio", () => {
  it("sem login 401; campos fora do contrato 400; protocolo de outra clínica 404", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 1 }]);
    expect((await request(app).post(`/api/protocols/${protocolId}/scheduling/google-sync`)).status).toBe(401);
    expect((await sync(protocolId, { attendees: ["x@example.invalid"] })).status).toBe(400);
    expect((await sync(protocolId, { refresh: "sim" })).status).toBe(400);
    expect((await post(`/api/protocols/abc/scheduling/google-sync`)).status).toBe(400);
    expect((await sync(999999)).status).toBe(404);
    auth.memberEmpresa = 6;
    const hidden = await sync(protocolId);
    expect(hidden.status).toBe(404);
    expect(hidden.body).not.toHaveProperty("visits");
    expect(google.verify).not.toHaveBeenCalled();
    expect(google.create).not.toHaveBeenCalled();
  });

  it("acesso que muda no meio do envio: a visita seguinte não é enviada", async () => {
    const protocolId = await scheduled(21, [{ substanceId: IM, total: 3 }]);
    auth.calls = 0; auth.switchAfterCalls = 2; // 1ª: autorização inicial; 2ª: antes da visita 1; 3ª: antes da visita 2
    const response = await sync(protocolId);
    expect(statuses(response.body)).toEqual(["sincronizado", "nao_processada", "nao_processada"]);
    expect(response.body.visits[1]).toMatchObject({ code: "acesso_alterado" });
    expect(response.body.remaining).toBe(2);
    expect(created()).toHaveLength(1);
  });

  it("visita cancelada durante o envio (depois de listada): não é enviada e o motivo é dito", async () => {
    const protocolId = await scheduled(23, [{ substanceId: IM, total: 3 }]);
    const sessions = await sessionRows(protocolId);
    auth.calls = 0;
    // 1ª consulta: autorização inicial; 2ª: antes da visita 1; 3ª: antes da visita 2 (cancela a visita 2 agora).
    auth.onCall = async (call) => {
      if (call === 3) await query(`UPDATE sessions SET status='cancelled' WHERE id=$1`, [sessions[1].id]);
    };
    const response = await sync(protocolId);
    expect(response.body.visits.map((v: any) => [v.status, v.code ?? null])).toEqual([
      ["sincronizado", null], ["falhou", "visita_mudou"], ["sincronizado", null],
    ]);
    expect(created().map(e => e.scheduledDate)).toEqual([MON1, MON3]);
  });

  it("dois envios simultâneos do mesmo protocolo nunca criam mais de um identificador por visita", async () => {
    const protocolId = await scheduled(22, [{ substanceId: IM, total: 3 }]);
    google.create.mockImplementation(async (d: any) => { await new Promise(r => setTimeout(r, 150)); return d.eventId; });
    const [a, b] = await Promise.all([sync(protocolId), sync(protocolId)]);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    // Mesmo que as duas chamadas disputem a visita, o identificador é o reservado: nunca há mais de 3 diferentes.
    expect(new Set(created().map(e => e.eventId)).size).toBeLessThanOrEqual(3);
    const final = await sessionRows(protocolId);
    // Estado final consistente: ou concluída, ou incerta com identificador reservado; nunca evento sem dono.
    for (const s of final) {
      if (s.ev) { expect(s.pop).toBeNull(); expect(created().some(e => e.eventId === s.ev)).toBe(true); }
      else { expect(s.pev).toMatch(/^[0-9a-f]{32}$/); }
    }
    // Uma terceira chamada fecha o que sobrou.
    google.create.mockImplementation(async (d: any) => d.eventId);
    google.exists.mockResolvedValue(true);
    await sync(protocolId);
    const closed = await sessionRows(protocolId);
    expect(closed.every(s => s.ev && s.pop === null)).toBe(true);
    expect(new Set(closed.map(s => s.ev)).size).toBe(3);
  });
});

async function suggested(clientId: number, items: { substanceId: number; total: number }[]) {
  const id = nextProtocol++;
  await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id,unit,service_type)
    VALUES($1,$2,77,'Protocolo sintético','suggested',$3,5,'Unidade sintética','clinic')`, [id, clientId, MON1]);
  for (const item of items) {
    await query(`INSERT INTO protocol_items(protocol_id,substance_id,dose,total_sessions,interval_days,start_date)
      VALUES($1,$2,$3,$4,7,$5)`, [id, item.substanceId, `dose ${item.substanceId}`, item.total, MON1]);
  }
  return id;
}

describe("Aviso antes de agendar: o Google vai receber os eventos desta agenda? (etapa 7)", () => {
  const items = [{ substanceId: IM, total: 2 }];

  it("agenda pronta: sem aviso", async () => {
    const id = await suggested(21, items);
    const preview = await post(`/api/protocols/${id}/scheduling/preview`);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.googleWarning).toBeNull();
  });

  it.each([
    ["agenda sem calendário Google", `UPDATE agenda_resources SET google_calendar_id=NULL WHERE id=1`, "agenda_sem_google"],
    ["profissional logado sem vínculo ao local", `DELETE FROM location_professionals`, "sem_vinculo_local"],
  ])("%s: avisa com o motivo, não muda a impressão digital e não impede agendar", async (_name, sql, code) => {
    const id = await suggested(21, items);
    const ready = await post(`/api/protocols/${id}/scheduling/preview`);
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    await query(sql);
    const warned = await post(`/api/protocols/${id}/scheduling/preview`);
    expect(warned.status, JSON.stringify(warned.body)).toBe(200);
    expect(warned.body.googleWarning.code).toBe(code);
    expect(warned.body.googleWarning.message).toContain("salvo no sistema");
    expect(warned.body.preview.fingerprint).toBe(ready.body.preview.fingerprint);
    // Aviso não bloqueia: a reserva no sistema continua valendo.
    const confirm = await post(`/api/protocols/${id}/scheduling/confirm`, { fingerprint: warned.body.preview.fingerprint });
    expect(confirm.status, JSON.stringify(confirm.body)).toBe(201);
  });

  it("a prévia só lê: nada é gravado e o Google não é chamado", async () => {
    const id = await suggested(21, items);
    expect((await post(`/api/protocols/${id}/scheduling/preview`)).status).toBe(200);
    expect((await counts()).sessions).toBe(0);
    for (const fn of Object.values(google)) expect(fn).not.toHaveBeenCalled();
  });

  it("local inativo ou de outra clínica e falha na verificação viram aviso explícito, nunca silêncio", async () => {
    await query(`UPDATE locations SET active='false' WHERE id=8`);
    expect(await googleReadinessWarning(1, 5, 98)).toMatchObject({ code: "local_invalido" });
    await query(`UPDATE locations SET active='true' WHERE id=8`);
    expect(await googleReadinessWarning(1, 6, 98)).toMatchObject({ code: "local_invalido" });
    expect(await googleReadinessWarning(1, 5, 98)).toBeNull();
    // Falha real ao consultar o banco: aviso próprio, não "pronto".
    const database = state.database;
    state.database = { select: () => { throw new Error("banco indisponível"); } };
    try {
      expect(await googleReadinessWarning(1, 5, 98)).toMatchObject({ code: "verificacao_indisponivel" });
    } finally {
      state.database = database;
    }
  });

  it("plano que mudou devolve a prévia nova com o aviso da agenda dela", async () => {
    const id = await suggested(21, items);
    await query(`UPDATE agenda_resources SET google_calendar_id=NULL WHERE id=1`);
    const stale = await post(`/api/protocols/${id}/scheduling/confirm`, { fingerprint: "0".repeat(32) });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("plano_mudou");
    expect(stale.body.googleWarning.code).toBe("agenda_sem_google");
    expect((await counts()).sessions).toBe(0);
  });

  it("outra clínica não recebe prévia nem aviso", async () => {
    const id = await suggested(21, items);
    auth.tenant = 6; auth.memberEmpresa = 6;
    const response = await post(`/api/protocols/${id}/scheduling/preview`);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toHaveProperty("googleWarning");
    expect(response.body).not.toHaveProperty("preview");
  });
});
