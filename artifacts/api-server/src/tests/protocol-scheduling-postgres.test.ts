import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

// Banco PostgreSQL descartável, 100% sintético: nada do banco real é lido ou escrito.
const state = vi.hoisted(() => ({ database: null as any }));
// Controle da autorização simulada: a cadeia real (authorizeProtocol, resolveEmpresaId) continua valendo.
const auth = vi.hoisted(() => ({ tenant: 5, memberEmpresa: 5, calls: 0, switchAfterCalls: Infinity, switchedEmpresa: 6 }));
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
vi.mock("../lib/google-calendar.js", () => ({
  createCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(), verifyClinicAccount: vi.fn(),
}));
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
  locationsTable, professionalsTable, professionalEmpresasTable, sessionsTable, substanceApplicationsTable,
  clientsTable, protocolsTable, protocolItemsTable, substancesTable,
  clientPreferredAgendasTable, clientVisitPreferenceRevisionsTable, protocolEmissoesTable, paymentsTable,
} from "@workspace/db/schema";
import protocolsRouter from "../routes/protocols";
import schedulingRouter from "../routes/protocol-scheduling";
import {
  confirmProtocolScheduling, planProtocolScheduling, preferenceRankFor, type SchedulingPreview,
} from "../lib/protocol-scheduling";
import { reserveProtocolVisits } from "../lib/protocol-visit-reservation";

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

// 2030-03-04 é segunda-feira. Agenda 1: segunda e quarta, 09h00 às 11h00 (seis horários de 20 minutos).
// Agenda 5: segunda e sexta, 09h00 às 10h00. "Hoje" simulado: sexta 01/03/2030, com antecedência mínima de 24 h.
const MON1 = "2030-03-04", WED1 = "2030-03-06", FRI1 = "2030-03-08", MON2 = "2030-03-11", WED2 = "2030-03-13";
const FRI2 = "2030-03-15", MON3 = "2030-03-18";
const IM = 1, IV = 2, IMPLANTE = 3, SEM_MEDICO_DEFINIDO = 4, SEM_DURACAO = 5;
const NOW = "2030-03-01T12:00:00-03:00";
let nextProtocol = 100;

async function newProtocol(clientId: number, items: { substanceId: number; total: number; interval?: number }[],
  overrides: { status?: string; empresaId?: number; startDate?: string } = {}) {
  const id = nextProtocol++;
  const start = overrides.startDate ?? MON1;
  await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id,unit,service_type)
    VALUES($1,$2,77,'Protocolo sintético',$3,$4,$5,'Unidade sintética','clinic')`,
    [id, clientId, overrides.status ?? "suggested", start, overrides.empresaId ?? 5]);
  for (const item of items) {
    await query(`INSERT INTO protocol_items(protocol_id,substance_id,dose,total_sessions,interval_days,start_date)
      VALUES($1,$2,$3,$4,$5,$6)`, [id, item.substanceId, `dose ${item.substanceId}`, item.total, item.interval ?? 7, start]);
  }
  return id;
}
/** Ocupa um horário da agenda com uma sessão de outro cliente (compromisso real no motor). */
async function occupy(resourceId: number, date: string, time: string, clientId = 28) {
  await query(`INSERT INTO sessions(protocol_id,client_id,resource_id,scheduled_date,scheduled_time,duration_minutes,status,agenda_archived,empresa_id)
    VALUES(9000,$1,$2,$3,$4,20,'scheduled',false,5)`, [clientId, resourceId, date, time]);
}
const counts = async () => ({
  sessions: (await rows(`SELECT count(*)::int AS n FROM sessions`))[0].n as number,
  applications: (await rows(`SELECT count(*)::int AS n FROM substance_applications`))[0].n as number,
});
const plan = (clientId: number, protocolId: number, nursingResourceId?: number) =>
  planProtocolScheduling({ empresaId: 5, clientId, protocolId, nursingResourceId });
async function previewOf(clientId: number, protocolId: number, nursingResourceId?: number): Promise<SchedulingPreview> {
  const result = await plan(clientId, protocolId, nursingResourceId);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("sem prévia");
  return result.preview;
}
const shape = (preview: SchedulingPreview) =>
  preview.visits.map(v => [v.date, v.time, v.applications.map(a => `${a.substanceId}#${a.sessionNumber}`).join("+")]);

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
    locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable, clientsTable,
    protocolsTable, protocolItemsTable, substancesTable, clientPreferredAgendasTable,
    clientVisitPreferenceRevisionsTable, protocolEmissoesTable, paymentsTable, professionalEmpresasTable]) {
    await query(createTableFromSchema(table));
  }
  await query(`
    CREATE UNIQUE INDEX applications_unique ON substance_applications(session_id, substance_id, session_number);
    CREATE TABLE agenda_personal_owners(location_id INTEGER, empresa_id INTEGER, professional_id INTEGER);
    CREATE TABLE agenda_google_sync(enabled BOOLEAN, location_id INTEGER, last_success TIMESTAMPTZ, error TEXT);
    CREATE TABLE agenda_compromissos(id INTEGER, titulo TEXT, inicio TIMESTAMPTZ, fim TIMESTAMPTZ, dia_inteiro BOOLEAN,
      recorrencia TEXT, origem TEXT, location_id INTEGER, status TEXT, chave TEXT, google_calendar_id TEXT);
    INSERT INTO locations(id,name,empresa_id,active) VALUES (8,'Local sintético A',5,'true'),(9,'Local de outra empresa',6,'true');
    INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active) VALUES
      (1,'Enfermagem sintética','enfermagem','local',20,8,NULL,true),
      (2,'Enfermagem de outra empresa','enfermagem','local',20,9,NULL,true),
      (3,'Enfermagem domiciliar','enfermagem','domiciliar',20,8,NULL,true),
      (5,'Enfermagem segunda e sexta','enfermagem','local',20,8,NULL,true),
      (6,'Agenda médica sintética','medico','local',60,8,NULL,true);
    INSERT INTO agenda_settings(id,block_minutes,trigger_percent,min_lead_hours) VALUES(1,120,60,24);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active) VALUES
      (1,1,'09:00','11:00',1,NULL,true),(1,3,'09:00','11:00',1,NULL,true),(2,1,'09:00','11:00',1,NULL,true),
      (3,1,'09:00','11:00',1,NULL,true),(5,1,'09:00','10:00',1,NULL,true),(5,5,'09:00','10:00',1,NULL,true);
    INSERT INTO clients(id,name,empresa_id,agenda_enfermagem_padrao_id) VALUES
      (21,'Cliente sintético 21',5,1),(22,'Cliente sintético 22',5,1),(23,'Cliente de outra empresa',6,2),
      (24,'Cliente sintético 24',5,1),(25,'Cliente sintético 25',5,1),(26,'Cliente sem agenda padrão',5,NULL),
      (27,'Cliente sintético 27',5,1),(28,'Cliente sintético 28',5,1),(29,'Cliente sintético 29',5,5),
      (30,'Cliente com agenda preferencial',5,NULL),(31,'Cliente sintético 31',5,1),(32,'Cliente sintético 32',5,1);
    INSERT INTO client_preferred_agendas(client_id,agenda_resource_id,active) VALUES (30,5,true);
    INSERT INTO substances(id,name,category,color,procedure_type,doctor_participation,duration_minutes,precise_duration_seconds) VALUES
      (${IM},'IM sintética','x','#000','im',false,3,150),
      (${IV},'IV sintética','x','#000','iv',false,30,1800),
      (${IMPLANTE},'Implante sintético','x','#000','implant',true,30,1800),
      (${SEM_MEDICO_DEFINIDO},'Sem participação definida','x','#000','im',NULL,3,150),
      (${SEM_DURACAO},'Sem duração','x','#000','im',false,0,NULL),
      (6,'IM sintética 2','x','#000','im',false,3,150);
  `);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
}, 60_000);

beforeEach(async () => {
  await query(`TRUNCATE sessions, substance_applications, protocol_items, protocols, client_visit_preference_revisions`);
  await query(`DELETE FROM agenda_exceptions`);
  auth.tenant = 5; auth.memberEmpresa = 5; auth.calls = 0; auth.switchAfterCalls = Infinity;
  vi.setSystemTime(new Date(NOW));
});

afterAll(async () => {
  vi.useRealTimers();
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("Preferência do cliente como ordem (função pura)", () => {
  const prefs = {
    weekdays: [1, 3], times: [{ weekday: 1, time: "10:00" }, { weekday: 3, time: "09:00" }],
    priority: [{ weekday: 3, time: "09:00" }, { weekday: 1, time: "10:00" }],
  };
  it("ordem explícita, depois dia e horário, depois só o dia, depois nada", () => {
    expect(preferenceRankFor(prefs, WED1, "09:00")).toBe(1);
    expect(preferenceRankFor(prefs, MON1, "10:00")).toBe(2);
    expect(preferenceRankFor({ ...prefs, priority: undefined }, MON1, "10:00")).toBe(1);
    expect(preferenceRankFor(prefs, MON1, "09:00")).toBe(4);
    expect(preferenceRankFor(prefs, FRI1, "09:00")).toBeUndefined();
    expect(preferenceRankFor({ weekdays: [], times: [] }, MON1, "09:00")).toBeUndefined();
  });
});

describe("Prévia do agendamento de protocolo (nada é gravado)", () => {
  it("planeja no servidor, mede em períodos e não grava sessão nenhuma", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 3 }, { substanceId: IV, total: 1 }]);
    const before = await counts();
    const preview = await previewOf(21, protocolId);
    // IM nas três segundas; a infusão IV (2 períodos) soma com a IM da primeira visita: 3 períodos.
    expect(shape(preview)).toEqual([
      [MON1, "09:00", `${IM}#1+${IV}#1`], [MON2, "09:00", `${IM}#2`], [MON3, "09:00", `${IM}#3`],
    ]);
    expect(preview.visits.map(v => [v.nursingPeriods, v.reservedMinutes, v.weekday])).toEqual([[3, 60, 1], [1, 20, 1], [1, 20, 1]]);
    expect(preview.visits[0].applications.every(a => a.shiftDays === 0 && a.dose === `dose ${a.substanceId}`)).toBe(true);
    expect(preview).toMatchObject({
      protocolId, nursingResourceId: 1, nursingResourceName: "Enfermagem sintética", visitCount: 3,
      firstDate: MON1, lastDate: MON3, requiresRoutineConfirmation: false,
      matchesClientPreference: false,
    });
    expect(preview.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(preview.searchWasPruned).toBe(true); // 4 aplicações x 12 vagas: a busca é podada e a prévia avisa
    expect(await counts()).toEqual(before);
    expect((await rows(`SELECT status FROM protocols WHERE id=$1`, [protocolId]))[0].status).toBe("suggested");
    // Mesma agenda, mesma prévia: a impressão digital é estável.
    expect((await previewOf(21, protocolId)).fingerprint).toBe(preview.fingerprint);
  });

  it("preferência do cliente ordena as vagas: segunda às 10h00 vence segunda às 09h00", async () => {
    await query(`INSERT INTO client_visit_preference_revisions(client_id,empresa_id,preferences,created_by)
      VALUES(22,5,$1,1)`, [JSON.stringify({
      medical: { weekdays: [], times: [] }, nursing: { weekdays: [1], times: [{ weekday: 1, time: "10:00" }] },
    })]);
    const protocolId = await newProtocol(22, [{ substanceId: IM, total: 2 }]);
    const preview = await previewOf(22, protocolId);
    expect(shape(preview)).toEqual([[MON1, "10:00", `${IM}#1`], [MON2, "10:00", `${IM}#2`]]);
    expect(preview.matchesClientPreference).toBe(true);
    // Protocolo pequeno: a busca cobre todas as combinações. O de 4 aplicações do primeiro teste passa de
    // 1.000 candidatas por etapa e a prévia avisa (searchWasPruned) que pode existir plano melhor.
    expect(preview.searchWasPruned).toBe(false);
  });

  it("preferência nunca exclui vaga: quem só quer terça ainda recebe segunda e quarta (não há terça)", async () => {
    await query(`INSERT INTO client_visit_preference_revisions(client_id,empresa_id,preferences,created_by)
      VALUES(24,5,$1,1)`, [JSON.stringify({
      medical: { weekdays: [], times: [] }, nursing: { weekdays: [2], times: [{ weekday: 2, time: "09:00" }] },
    })]);
    const protocolId = await newProtocol(24, [{ substanceId: IM, total: 2 }]);
    const preview = await previewOf(24, protocolId);
    expect(shape(preview)).toEqual([[MON1, "09:00", `${IM}#1`], [MON2, "09:00", `${IM}#2`]]);
    expect(preview.matchesClientPreference).toBe(false);
  });

  it("respeita a margem: segunda cheia move a sessão para quarta (+2 dias) sem sair dos 4 dias", async () => {
    for (const time of ["09:00", "09:20", "09:40", "10:00", "10:20", "10:40"]) await occupy(1, MON2, time);
    const protocolId = await newProtocol(25, [{ substanceId: IM, total: 2 }]);
    const preview = await previewOf(25, protocolId);
    expect(shape(preview)).toEqual([[MON1, "09:00", `${IM}#1`], [WED2, "09:00", `${IM}#2`]]);
    expect(preview.visits[1].applications[0]).toMatchObject({ nominalDate: MON2, shiftDays: 2 });
  });

  it("usa o intervalo mínimo (frequência - 4 dias): só a sexta, 4 dias depois, resta e é aceita com aviso de rotina", async () => {
    for (const time of ["09:00", "09:20", "09:40"]) { await occupy(5, MON2, time); await occupy(5, FRI2, time); }
    const protocolId = await newProtocol(29, [{ substanceId: IM, total: 2 }]);
    const preview = await previewOf(29, protocolId);
    // Segunda 04/03 e sexta 08/03 (4 dias depois; mínimo = 7 - 4 = 3), deslocamento de -3 dias, mesma semana.
    expect(shape(preview)).toEqual([[MON1, "09:00", `${IM}#1`], [FRI1, "09:00", `${IM}#2`]]);
    expect(preview.visits[1].applications[0]).toMatchObject({ nominalDate: MON2, shiftDays: -3 });
    expect(preview.requiresRoutineConfirmation).toBe(true);
    expect(preview.nursingResourceId).toBe(5);
  });

  it("agenda de enfermagem: padrão do cliente, depois a preferencial, e a escolhida vale", async () => {
    const protocolId = await newProtocol(30, [{ substanceId: IM, total: 1 }]);
    // Cliente 30 não tem padrão; a agenda preferencial dele é a 5.
    expect((await previewOf(30, protocolId)).nursingResourceId).toBe(5);
    expect((await previewOf(30, protocolId, 1)).nursingResourceId).toBe(1);
    const other = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    expect((await previewOf(21, other)).nursingResourceId).toBe(1);
    expect((await previewOf(21, other, 5)).nursingResourceId).toBe(5);
  });
});

describe("Recusas explícitas da prévia (nada é gravado)", () => {
  const refused = async (clientId: number, protocolId: number, nursingResourceId?: number) => {
    const before = await counts();
    const result = await plan(clientId, protocolId, nursingResourceId);
    expect(await counts()).toEqual(before);
    expect(result.ok).toBe(false);
    return result as Extract<typeof result, { ok: false }>;
  };

  it("substância que exige o médico: recusa clara (sem agenda médica com expediente)", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 2 }, { substanceId: IMPLANTE, total: 1 }]);
    expect(await refused(21, protocolId)).toMatchObject({ status: 422, code: "medico_nao_habilitado" });
  });

  it("participação médica ou duração indefinida: recusa, nunca presume", async () => {
    const a = await newProtocol(21, [{ substanceId: SEM_MEDICO_DEFINIDO, total: 1 }]);
    expect(await refused(21, a)).toMatchObject({ status: 422, code: "participacao_medica_indefinida" });
    const b = await newProtocol(21, [{ substanceId: SEM_DURACAO, total: 1 }]);
    expect(await refused(21, b)).toMatchObject({ status: 422, code: "substancia_sem_duracao" });
  });

  it("protocolo que já tem sessões (legado) ou não está sugerido é recusado sem tocar nas sessões", async () => {
    const legacy = await newProtocol(21, [{ substanceId: IM, total: 1 }], { status: "validated" });
    await query(`INSERT INTO sessions(protocol_id,client_id,scheduled_date,scheduled_time,status,empresa_id)
      VALUES($1,21,'${MON1}','09:00','scheduled',5)`, [legacy]);
    expect(await refused(21, legacy)).toMatchObject({ status: 409, code: "protocolo_ja_agendado" });
    expect((await rows(`SELECT resource_id FROM sessions WHERE protocol_id=$1`, [legacy]))[0].resource_id).toBeNull();
    const validated = await newProtocol(21, [{ substanceId: IM, total: 1 }], { status: "validated" });
    expect(await refused(21, validated)).toMatchObject({ status: 409, code: "protocolo_status_invalido" });
  });

  it("isolamento por empresa e por cliente: não revela o que é de outra clínica ou de outro cliente", async () => {
    const other = await newProtocol(23, [{ substanceId: IM, total: 1 }], { empresaId: 6 });
    expect(await refused(23, other)).toMatchObject({ status: 404, code: "cliente_nao_encontrado" });
    const mine = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    expect(await refused(22, mine)).toMatchObject({ status: 404, code: "protocolo_nao_encontrado" });
    expect(await refused(21, 999999)).toMatchObject({ status: 404, code: "protocolo_nao_encontrado" });
  });

  it("agenda: sem padrão nem preferencial, domiciliar, de outra empresa e médica", async () => {
    const noAgenda = await newProtocol(26, [{ substanceId: IM, total: 1 }]);
    expect(await refused(26, noAgenda)).toMatchObject({ status: 422, code: "agenda_enfermagem_indefinida" });
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    expect(await refused(21, protocolId, 3)).toMatchObject({ status: 422, code: "agenda_invalida" });
    expect(await refused(21, protocolId, 2)).toMatchObject({ status: 404, code: "agenda_nao_encontrada" });
    expect(await refused(21, protocolId, 6)).toMatchObject({ status: 422, code: "agenda_invalida" });
    expect(await refused(21, protocolId, 999)).toMatchObject({ status: 404, code: "agenda_nao_encontrada" });
  });

  it("protocolo longo demais para ler a agenda e datas que já passaram", async () => {
    const long = await newProtocol(21, [{ substanceId: IM, total: 40 }]);
    expect(await refused(21, long)).toMatchObject({ status: 422, code: "periodo_longo_demais" });
    const past = await newProtocol(21, [{ substanceId: IM, total: 2 }], { startDate: "2030-02-01" });
    expect(await refused(21, past)).toMatchObject({ status: 409, code: "datas_no_passado" });
    const broken = await newProtocol(21, [{ substanceId: IM, total: 2, interval: 0 }]);
    expect(await refused(21, broken)).toMatchObject({ status: 422, code: "protocolo_incompleto" });
  });

  it("sem plano: exceção cadastrada não vira 'sem vaga' e o diagnóstico diz quais dias", async () => {
    await query(`INSERT INTO agenda_exceptions(resource_id,date,kind,description) VALUES
      (1,'${MON1}','feriado','Exceção sintética'),(1,'${WED1}','feriado','Exceção sintética')`);
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    const result = await refused(21, protocolId);
    expect(result).toMatchObject({ status: 409, code: "sem_plano" });
    expect(result.diagnostics?.nursingDatesWithException).toEqual([MON1, WED1]);
    expect(result.error).toContain("Nada foi agendado");
    // A causa vem escrita e separada: exceção não é "ocupado" nem "desatualizado".
    expect(result.error).toContain("2 com exceção cadastrada (04/03/2030, 06/03/2030)");
    expect(result.error).not.toContain("Google desatualizada");
  });

  it("agenda do Google desatualizada aparece no motivo da recusa, separada de 'sem vaga'", async () => {
    await query(`UPDATE locations SET google_calendar_id='agenda-sintetica@example.invalid' WHERE id=8;
      INSERT INTO agenda_google_sync(enabled,location_id,last_success,error) VALUES(true,8,'2020-01-01T00:00:00Z',NULL)`);
    try {
      const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
      const result = await refused(21, protocolId);
      // Dia desconhecido tem código próprio: nunca vira "sem plano" nem "ocupado".
      expect(result).toMatchObject({ status: 409, code: "agenda_desatualizada" });
      expect(result.diagnostics?.integrationPendingDates.length).toBeGreaterThan(0);
      expect(result.error).toContain("Google desatualizada");
      expect(result.error).toContain("não foram tratados como ocupados");
    } finally {
      await query(`UPDATE locations SET google_calendar_id=NULL WHERE id=8; DELETE FROM agenda_google_sync`);
    }
  });
});

describe("Confirmação: recalcula no servidor e só reserva se o plano for o da prévia", () => {
  it("grava as visitas da prévia (sessões, aplicações, protocolo validado) e nada além disso", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 3 }, { substanceId: IV, total: 1 }]);
    const preview = await previewOf(21, protocolId);
    const result = await confirmProtocolScheduling({
      empresaId: 5, clientId: 21, protocolId, fingerprint: preview.fingerprint,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.protocolStatus).toBe("validated");
    expect(result.reserved.map(v => [v.date, v.time, v.reservedMinutes])).toEqual([
      [MON1, "09:00", 60], [MON2, "09:00", 20], [MON3, "09:00", 20],
    ]);
    const sessions = await rows(`SELECT scheduled_date AS d, scheduled_time AS t, duration_minutes AS m, resource_id AS r, week_number AS w
      FROM sessions WHERE protocol_id=$1 ORDER BY scheduled_date`, [protocolId]);
    expect(sessions).toEqual([
      { d: MON1, t: "09:00", m: 60, r: 1, w: 1 }, { d: MON2, t: "09:00", m: 20, r: 1, w: 2 },
      { d: MON3, t: "09:00", m: 20, r: 1, w: 3 },
    ]);
    const apps = await rows(`SELECT s.scheduled_date AS d, a.substance_id AS sub, a.session_number AS n, a.availability AS av
      FROM substance_applications a JOIN sessions s ON s.id=a.session_id WHERE s.protocol_id=$1
      ORDER BY s.scheduled_date, a.substance_id`, [protocolId]);
    // A IV só acontece uma vez (na primeira visita): não há aplicação "prox" dela nas visitas seguintes.
    expect(apps).toEqual([
      { d: MON1, sub: IM, n: 1, av: "disp" }, { d: MON1, sub: IV, n: 1, av: "disp" },
      { d: MON2, sub: IM, n: 2, av: "disp" }, { d: MON3, sub: IM, n: 3, av: "disp" },
    ]);
    expect((await rows(`SELECT status FROM protocols WHERE id=$1`, [protocolId]))[0].status).toBe("validated");
    // Segunda confirmação do mesmo protocolo: recusada, sem duplicar.
    const again = await confirmProtocolScheduling({ empresaId: 5, clientId: 21, protocolId, fingerprint: preview.fingerprint });
    expect(again).toMatchObject({ ok: false, status: 409, code: "protocolo_ja_agendado" });
    expect((await counts()).sessions).toBe(3);
  });

  it("agenda mudou entre a prévia e a confirmação: recusa com a prévia nova e não grava", async () => {
    const protocolId = await newProtocol(22, [{ substanceId: IM, total: 2 }]);
    const preview = await previewOf(22, protocolId);
    expect(shape(preview)[0][1]).toBe("09:00");
    await occupy(1, MON1, "09:00");
    const before = await counts();
    const stale = await confirmProtocolScheduling({ empresaId: 5, clientId: 22, protocolId, fingerprint: preview.fingerprint });
    expect(stale).toMatchObject({ ok: false, status: 409, code: "plano_mudou" });
    if (stale.ok) return;
    expect(stale.preview && shape(stale.preview)[0]).toEqual([MON1, "09:20", `${IM}#1`]);
    expect(await counts()).toEqual(before);
    // Com a impressão digital da prévia nova, a confirmação passa.
    const fresh = await confirmProtocolScheduling({ empresaId: 5, clientId: 22, protocolId, fingerprint: stale.preview!.fingerprint });
    expect(fresh.ok, JSON.stringify(fresh)).toBe(true);
  });

  it("dose, total, intervalo, data ou duração mudaram depois da prévia: não confirma, mesmo com os mesmos horários", async () => {
    const changes: [string, string, string][] = [
      ["dose", `UPDATE protocol_items SET dose='dose alterada' WHERE protocol_id=$1`, ""],
      ["total de sessões", `UPDATE protocol_items SET total_sessions=3 WHERE protocol_id=$1`, ""],
      ["intervalo", `UPDATE protocol_items SET interval_days=6 WHERE protocol_id=$1`, ""],
      ["data do item", `UPDATE protocol_items SET start_date='${WED1}' WHERE protocol_id=$1`, ""],
      ["data do protocolo", `UPDATE protocols SET start_date='${WED1}' WHERE id=$1`, ""],
    ];
    for (const [label, sql] of changes) {
      const protocolId = await newProtocol(24, [{ substanceId: IM, total: 2 }]);
      const preview = await previewOf(24, protocolId);
      await query(sql, [protocolId]);
      const result = await confirmProtocolScheduling({ empresaId: 5, clientId: 24, protocolId, fingerprint: preview.fingerprint });
      expect(result, label).toMatchObject({ ok: false, status: 409, code: "plano_mudou" });
      expect((await counts()).sessions, label).toBe(0);
    }
    // Duração da substância no catálogo (mesmos períodos de enfermagem, mesma vaga escolhida).
    const protocolId = await newProtocol(25, [{ substanceId: IM, total: 2 }]);
    const preview = await previewOf(25, protocolId);
    await query(`UPDATE substances SET precise_duration_seconds=160 WHERE id=${IM}`);
    try {
      const result = await confirmProtocolScheduling({ empresaId: 5, clientId: 25, protocolId, fingerprint: preview.fingerprint });
      expect(result).toMatchObject({ ok: false, status: 409, code: "plano_mudou" });
    } finally {
      await query(`UPDATE substances SET precise_duration_seconds=150 WHERE id=${IM}`);
    }
    expect((await counts()).sessions).toBe(0);
  });

  it("alteração DEPOIS do recálculo e ANTES do bloqueio: a reserva relê os dados e recusa sem gravar", async () => {
    const protocolId = await newProtocol(27, [{ substanceId: IM, total: 2 }]);
    const preview = await previewOf(27, protocolId);
    const visits = preview.visits.map(v => ({
      date: v.date, time: v.time,
      applications: v.applications.map(a => ({ substanceId: a.substanceId, sessionNumber: a.sessionNumber })),
    }));
    const params = { empresaId: 5, clientId: 27, protocolId, nursingResourceId: 1, visits };
    await query(`UPDATE protocol_items SET dose='dose trocada na janela' WHERE protocol_id=$1`, [protocolId]);
    expect(await reserveProtocolVisits({ ...params, expectedSnapshot: preview.snapshot }))
      .toMatchObject({ ok: false, status: 409, code: "plano_mudou" });
    expect(await counts()).toEqual({ sessions: 0, applications: 0 });
    // Malformada: recusada antes de tocar no banco.
    expect(await reserveProtocolVisits({ ...params, expectedSnapshot: "x" }))
      .toMatchObject({ ok: false, status: 400, code: "visitas_invalidas" });
    // Com a fotografia do estado atual, a mesma reserva passa.
    await query(`UPDATE protocol_items SET dose='dose ${IM}' WHERE protocol_id=$1`, [protocolId]);
    const ok = await reserveProtocolVisits({ ...params, expectedSnapshot: preview.snapshot });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
  });

  it("alteração durante a própria confirmação (entre o recálculo e a reserva): a confirmação não grava", async () => {
    const protocolId = await newProtocol(28, [{ substanceId: IM, total: 2 }]);
    const preview = await previewOf(28, protocolId);
    const result = await confirmProtocolScheduling({
      empresaId: 5, clientId: 28, protocolId, fingerprint: preview.fingerprint,
      // Roda depois da comparação da impressão digital e antes da reserva: simula a edição na janela.
      stillAuthorized: async () => {
        await query(`UPDATE protocol_items SET interval_days=6 WHERE protocol_id=$1`, [protocolId]);
        return true;
      },
    });
    expect(result).toMatchObject({ ok: false, status: 409, code: "plano_mudou" });
    expect(await counts()).toEqual({ sessions: 0, applications: 0 });
  });

  it("sem impressão digital válida não há confirmação", async () => {
    const protocolId = await newProtocol(24, [{ substanceId: IM, total: 1 }]);
    for (const fingerprint of [undefined, "", "abc", "g".repeat(32), 123, null]) {
      expect(await confirmProtocolScheduling({ empresaId: 5, clientId: 24, protocolId, fingerprint }))
        .toMatchObject({ ok: false, status: 400, code: "confirmacao_ausente" });
    }
    expect((await counts()).sessions).toBe(0);
  });

  it("impressão digital de outro protocolo ou de outra agenda não confirma", async () => {
    const a = await newProtocol(24, [{ substanceId: IM, total: 1 }]);
    const b = await newProtocol(25, [{ substanceId: IM, total: 1 }]);
    const previewA = await previewOf(24, a);
    expect(await confirmProtocolScheduling({ empresaId: 5, clientId: 25, protocolId: b, fingerprint: previewA.fingerprint }))
      .toMatchObject({ ok: false, code: "plano_mudou" });
    const onOther = await previewOf(24, a, 5);
    expect(onOther.fingerprint).not.toBe(previewA.fingerprint);
    expect(await confirmProtocolScheduling({ empresaId: 5, clientId: 24, protocolId: a, fingerprint: previewA.fingerprint, nursingResourceId: 5 }))
      .toMatchObject({ ok: false, code: "plano_mudou" });
    expect((await counts()).sessions).toBe(0);
  });

  it("dois protocolos confirmando o mesmo horário ao mesmo tempo: um reserva, o outro é recusado sem gravar", async () => {
    const a = await newProtocol(27, [{ substanceId: IM, total: 1 }]);
    const b = await newProtocol(28, [{ substanceId: IM, total: 1 }]);
    const pa = await previewOf(27, a), pb = await previewOf(28, b);
    // Os dois escolheram segunda 09h00: só um pode ficar com ele.
    expect(shape(pa)[0][1]).toBe("09:00");
    expect(shape(pb)[0][1]).toBe("09:00");
    await query(`CREATE OR REPLACE FUNCTION atraso_sintetico() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.25); RETURN NEW; END $$;
      CREATE TRIGGER atraso_sintetico BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION atraso_sintetico()`);
    let results;
    try {
      results = await Promise.all([
        confirmProtocolScheduling({ empresaId: 5, clientId: 27, protocolId: a, fingerprint: pa.fingerprint }),
        confirmProtocolScheduling({ empresaId: 5, clientId: 28, protocolId: b, fingerprint: pb.fingerprint }),
      ]);
    } finally {
      await query(`DROP TRIGGER atraso_sintetico ON sessions`);
    }
    expect(results.filter(r => r.ok)).toHaveLength(1);
    const loser = results.find(r => !r.ok)!;
    expect(loser).toMatchObject({ ok: false, status: 409 });
    expect(["horario_indisponivel", "plano_mudou"]).toContain((loser as any).code);
    expect((await counts()).sessions).toBe(1);
  });
});

describe("Rotas HTTP: o navegador nunca entrega o plano", () => {
  it("prévia e confirmação ponta a ponta, com autorização real da cadeia", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 2 }]);
    const preview = await post(`/api/protocols/${protocolId}/scheduling/preview`);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.preview.visits).toHaveLength(2);
    expect((await counts()).sessions).toBe(0);
    const confirm = await post(`/api/protocols/${protocolId}/scheduling/confirm`, {
      fingerprint: preview.body.preview.fingerprint,
    });
    expect(confirm.status, JSON.stringify(confirm.body)).toBe(201);
    expect(confirm.body.protocolStatus).toBe("validated");
    expect(confirm.body.reserved).toHaveLength(2);
    expect((await counts()).sessions).toBe(2);
    const again = await post(`/api/protocols/${protocolId}/scheduling/confirm`, { fingerprint: preview.body.preview.fingerprint });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: "protocolo_ja_agendado" });
  });

  it("recusa campos fora do contrato (plano, visitas, doses) e confirmação sem impressão digital", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 2 }]);
    const forged = await post(`/api/protocols/${protocolId}/scheduling/confirm`, {
      fingerprint: "0".repeat(32), visits: [{ date: MON1, time: "09:00", applications: [] }],
    });
    expect(forged.status).toBe(400);
    const noFingerprint = await post(`/api/protocols/${protocolId}/scheduling/confirm`, {});
    expect(noFingerprint.status).toBe(400);
    expect(noFingerprint.body).toMatchObject({ code: "confirmacao_ausente" });
    const wrongPreview = await post(`/api/protocols/${protocolId}/scheduling/preview`, { dose: "99" });
    expect(wrongPreview.status).toBe(400);
    const wrongPrint = await post(`/api/protocols/${protocolId}/scheduling/confirm`, { fingerprint: "0".repeat(32) });
    expect(wrongPrint.status).toBe(409);
    expect(wrongPrint.body).toMatchObject({ code: "plano_mudou" });
    expect(wrongPrint.body.preview.visits).toHaveLength(2);
    expect((await counts()).sessions).toBe(0);
  });

  it("sem login, protocolo inexistente e protocolo de outra clínica", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    expect((await request(app).post(`/api/protocols/${protocolId}/scheduling/preview`)).status).toBe(401);
    expect((await post(`/api/protocols/999999/scheduling/preview`)).status).toBe(404);
    expect((await post(`/api/protocols/abc/scheduling/preview`)).status).toBe(400);
    auth.memberEmpresa = 6; // a cadeia clínica enxerga outra clínica: não revela nem calcula
    const hidden = await post(`/api/protocols/${protocolId}/scheduling/preview`);
    expect(hidden.status).toBe(404);
    expect(hidden.body).not.toHaveProperty("preview");
    auth.memberEmpresa = 5; auth.tenant = 6;
    expect((await post(`/api/protocols/${protocolId}/scheduling/preview`)).status).toBe(404);
  });

  it("acesso clínico que muda durante o cálculo: reconferência antes de reservar recusa e não grava", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    const preview = await post(`/api/protocols/${protocolId}/scheduling/preview`);
    expect(preview.status).toBe(200);
    // A autorização inicial (1ª consulta) passa; a reconferência (2ª consulta) já enxerga outra clínica.
    auth.calls = 0; auth.switchAfterCalls = 1;
    const confirm = await post(`/api/protocols/${protocolId}/scheduling/confirm`, { fingerprint: preview.body.preview.fingerprint });
    expect(confirm.status).toBe(409);
    expect(confirm.body).toMatchObject({ code: "acesso_alterado" });
    expect((await counts()).sessions).toBe(0);
  });

  it("a validação antiga continua funcionando para o mesmo protocolo (rota intacta)", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 2 }]);
    const response = await post(`/api/protocols/${protocolId}/validate`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect((await counts()).sessions).toBeGreaterThan(0);
    // E, depois dela, o agendamento por períodos recusa (já tem sessões) sem mexer nelas.
    const blocked = await post(`/api/protocols/${protocolId}/scheduling/preview`);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "protocolo_ja_agendado" });
  });
});

describe("Custo do cálculo", () => {
  it("protocolo com três substâncias semanais por 12 semanas é planejado em tempo aceitável", async () => {
    // Agenda 1 só tem segunda e quarta; 12 semanas = 84 dias de leitura.
    const protocolId = await newProtocol(31, [
      { substanceId: IM, total: 12 }, { substanceId: IV, total: 12 }, { substanceId: 6, total: 12 },
    ]);
    const start = performance.now();
    const result = await plan(31, protocolId);
    const elapsed = performance.now() - start;
    console.log(`[custo] prévia de 3 substâncias x 12 semanas: ${elapsed.toFixed(0)} ms; ok=${result.ok}`);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(elapsed).toBeLessThan(60_000);
  }, 120_000);
});
