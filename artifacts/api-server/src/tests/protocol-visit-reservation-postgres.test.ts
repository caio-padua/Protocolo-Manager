import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

// Banco PostgreSQL descartável, 100% sintético: nada do banco real é lido ou escrito.
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
vi.mock("../lib/google-calendar.js", () => ({
  createCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(), verifyClinicAccount: vi.fn(),
}));
import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
  locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable,
  clientsTable, protocolsTable, protocolItemsTable, substancesTable,
} from "@workspace/db/schema";
import { bookSession } from "../lib/agenda-booking";
import { loadProtocolSlots } from "../lib/protocol-slot-source";
import { MAX_RESERVATION_VISITS, reserveProtocolVisits } from "../lib/protocol-visit-reservation";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const query = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const rows = async (text: string, values?: unknown[]) => (await query(text, values)).rows;

// 2030-03-04 é segunda-feira. Expediente da enfermagem: segunda e quarta, 09h00 às 11h00
// (seis horários de 20 minutos). A "hora atual" simulada deixa as datas além das 24 h de antecedência.
const MON1 = "2030-03-04", WED1 = "2030-03-06", MON2 = "2030-03-11", WED2 = "2030-03-13";
const MON3 = "2030-03-18", TUE = "2030-03-05";
const IM = 1, IV = 2, IMPLANTE = 3, SEM_MEDICO_DEFINIDO = 4, SEM_DURACAO = 5, OUTRO_PROTOCOLO = 6;
const NOW = "2030-03-01T12:00:00-03:00";
const base = { empresaId: 5, nursingResourceId: 1 };
let nextProtocol = 100;

/** Cria um protocolo sintético, reserva as visitas e exige sucesso: preparação de cenário autônomo. */
async function reserved(clientId: number, items: { substanceId: number; total: number }[],
  visits: ReturnType<typeof visit>[]) {
  const protocolId = await newProtocol(clientId, items);
  const result = await reserveProtocolVisits({ ...base, clientId, protocolId, visits });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return protocolId;
}

/** Cria um protocolo sintético "suggested" e devolve seu id. */
async function newProtocol(clientId: number, items: { substanceId: number; total: number }[],
  overrides: { status?: string; empresaId?: number } = {}) {
  const id = nextProtocol++;
  await query(`INSERT INTO protocols(id,client_id,professional_id,title,status,start_date,empresa_id,unit,service_type)
    VALUES($1,$2,77,'Protocolo sintético',$3,'2030-03-04',$4,'Unidade sintética','clinic')`,
    [id, clientId, overrides.status ?? "suggested", overrides.empresaId ?? 5]);
  for (const item of items) {
    await query(`INSERT INTO protocol_items(protocol_id,substance_id,dose,total_sessions,interval_days,start_date)
      VALUES($1,$2,$3,$4,7,'2030-03-04')`, [id, item.substanceId, `dose ${item.substanceId}`, item.total]);
  }
  return id;
}
/**
 * Atrasa cada gravação de sessão no próprio banco para forçar a sobreposição das
 * transações: sem o bloqueio por empresa, as duas leem "livre" antes de qualquer
 * gravação aparecer, e a corrida deixa de depender de sorte de agendamento.
 */
async function withInsertDelay<T>(work: () => Promise<T>): Promise<T> {
  await query(`CREATE OR REPLACE FUNCTION atraso_sintetico() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_sleep(0.25); RETURN NEW; END $$;
    CREATE TRIGGER atraso_sintetico BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION atraso_sintetico()`);
  try {
    return await work();
  } finally {
    await query(`DROP TRIGGER atraso_sintetico ON sessions`);
  }
}
const counts = async () => ({
  sessions: (await rows(`SELECT count(*)::int AS n FROM sessions`))[0].n as number,
  applications: (await rows(`SELECT count(*)::int AS n FROM substance_applications`))[0].n as number,
});
const visit = (date: string, time: string, ...apps: [number, number][]) => ({
  date, time, applications: apps.map(([substanceId, sessionNumber]) => ({ substanceId, sessionNumber })),
});

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
    locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable, clientsTable,
    protocolsTable, protocolItemsTable, substancesTable]) {
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
      (4,'Enfermagem online','enfermagem','online',20,8,NULL,true);
    INSERT INTO agenda_settings(id,block_minutes,trigger_percent,min_lead_hours) VALUES(1,120,60,24);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active) VALUES
      (1,1,'09:00','11:00',1,NULL,true),(1,3,'09:00','11:00',1,NULL,true),(2,1,'09:00','11:00',1,NULL,true),
      (3,1,'09:00','11:00',1,NULL,true),(4,1,'09:00','11:00',1,NULL,true);
    INSERT INTO clients(id,name,empresa_id) VALUES
      (21,'Cliente sintético 21',5),(22,'Cliente sintético 22',5),(23,'Cliente de outra empresa',6),
      (24,'Cliente sintético 24',5),(25,'Cliente sintético 25',5),(26,'Cliente sintético 26',5),
      (27,'Cliente sintético 27',5),(28,'Cliente sintético 28',5);
    INSERT INTO substances(id,name,category,color,procedure_type,doctor_participation,duration_minutes,precise_duration_seconds) VALUES
      (${IM},'IM sintética','x','#000','im',false,3,150),
      (${IV},'IV sintética','x','#000','iv',false,30,1800),
      (${IMPLANTE},'Implante sintético','x','#000','implant',true,30,1800),
      (${SEM_MEDICO_DEFINIDO},'Sem participação definida','x','#000','im',NULL,3,150),
      (${SEM_DURACAO},'Sem duração','x','#000','im',false,0,NULL),
      (${OUTRO_PROTOCOLO},'IM de outro protocolo','x','#000','im',false,3,150);
  `);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
}, 60_000);

// Cada teste começa sem sessões, aplicações e protocolos: nenhum depende da gravação de outro.
beforeEach(async () => {
  await query(`TRUNCATE sessions, substance_applications, protocol_items, protocols`);
  vi.setSystemTime(new Date(NOW));
});

afterAll(async () => {
  vi.useRealTimers();
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("Reserva atômica de visitas do protocolo em banco descartável", () => {
  it("grava uma sessão por visita, com períodos reservados, aplicações disp e prox e protocolo validado", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 2 }, { substanceId: IV, total: 1 }]);
    const result = await reserveProtocolVisits({
      ...base, clientId: 21, protocolId,
      visits: [visit(WED1, "09:00", [IM, 2], [IV, 1]), visit(MON1, "09:20", [IM, 1])],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A função ordena por data: primeira visita segunda (1 período), depois quarta (3 períodos).
    expect(result.visits.map(v => [v.date, v.time, v.nursingPeriods, v.reservedMinutes])).toEqual([
      [MON1, "09:20", 1, 20], [WED1, "09:00", 3, 60],
    ]);
    const sessions = await rows(`SELECT scheduled_date AS d, scheduled_time AS t, duration_minutes AS m, resource_id AS r,
      week_number AS w, empresa_id AS e, status, notes, unit, service_type AS st, professional_id AS p
      FROM sessions WHERE protocol_id=$1 ORDER BY scheduled_date`, [protocolId]);
    expect(sessions).toEqual([
      { d: MON1, t: "09:20", m: 20, r: 1, w: 1, e: 5, status: "scheduled", notes: null, unit: "Local sintético A", st: "clinic", p: 77 },
      { d: WED1, t: "09:00", m: 60, r: 1, w: 2, e: 5, status: "scheduled", notes: null, unit: "Local sintético A", st: "clinic", p: 77 },
    ]);
    const apps = await rows(`SELECT s.scheduled_date AS d, a.substance_id AS sub, a.session_number AS n, a.total_sessions AS total,
      a.availability AS av, a.status, a.dose FROM substance_applications a JOIN sessions s ON s.id=a.session_id
      WHERE s.protocol_id=$1 ORDER BY s.scheduled_date, a.substance_id`, [protocolId]);
    expect(apps).toEqual([
      { d: MON1, sub: IM, n: 1, total: 2, av: "disp", status: "pending", dose: `dose ${IM}` },
      { d: MON1, sub: IV, n: 0, total: 1, av: "prox", status: "pending", dose: `dose ${IV}` },
      { d: WED1, sub: IM, n: 2, total: 2, av: "disp", status: "pending", dose: `dose ${IM}` },
      { d: WED1, sub: IV, n: 1, total: 1, av: "disp", status: "pending", dose: `dose ${IV}` },
    ]);
    const [protocol] = await rows(`SELECT status, scheduled_time FROM protocols WHERE id=$1`, [protocolId]);
    expect(protocol).toEqual({ status: "validated", scheduled_time: "09:20" });
  });

  it("a visita reservada ocupa os períodos no motor: marcação avulsa no meio dela é recusada", async () => {
    // Quarta 09h00 reserva 3 períodos (09h00, 09h20, 09h40); 10h00 continua livre.
    await reserved(21, [{ substanceId: IM, total: 1 }, { substanceId: IV, total: 1 }],
      [visit(WED1, "09:00", [IM, 1], [IV, 1])]);
    const protocolId = await newProtocol(22, [{ substanceId: IM, total: 1 }]);
    const clash = await bookSession({ resourceId: 1, clientId: 22, protocolId, date: WED1, time: "09:40", empresaId: 5 });
    expect(clash).toMatchObject({ ok: false, status: 409, error: "Horário já ocupado" });
    const free = await reserveProtocolVisits({ ...base, clientId: 22, protocolId, visits: [visit(WED1, "10:00", [IM, 1])] });
    expect(free.ok).toBe(true);
  });

  it("sobreposição parcial com sessão existente é recusada sem gravar nada", async () => {
    // Quarta: 09h00-10h00 (cliente 21, 3 períodos), 10h00 (cliente 22), 10h20 (cliente 24); sobra só o último horário, 10h40.
    await reserved(21, [{ substanceId: IM, total: 1 }, { substanceId: IV, total: 1 }], [visit(WED1, "09:00", [IM, 1], [IV, 1])]);
    await reserved(22, [{ substanceId: IM, total: 1 }], [visit(WED1, "10:00", [IM, 1])]);
    await reserved(24, [{ substanceId: IM, total: 1 }], [visit(WED1, "10:20", [IM, 1])]);
    const before = await counts();
    const second = await newProtocol(25, [{ substanceId: IV, total: 1 }]);
    const partial = await reserveProtocolVisits({ ...base, clientId: 25, protocolId: second, visits: [visit(WED1, "10:40", [IV, 1])] });
    // 10h40 está livre, mas a infusão precisa de 2 períodos seguidos e o expediente acaba às 11h00.
    expect(partial).toMatchObject({ ok: false, status: 409, code: "horario_indisponivel", date: WED1, time: "10:40" });
    expect(partial).toMatchObject({ error: expect.stringContaining("precisa de 2 período(s)") });
    expect(partial).toMatchObject({ error: expect.stringContaining("há 1") });
    // E um horário já tomado por outra sessão (10h20) é recusado com 0 períodos.
    expect(await reserveProtocolVisits({ ...base, clientId: 25, protocolId: second, visits: [visit(WED1, "10:20", [IV, 1])] }))
      .toMatchObject({ ok: false, code: "horario_indisponivel", error: expect.stringContaining("há 0") });
    expect(await counts()).toEqual(before);
    expect((await rows(`SELECT status FROM protocols WHERE id=$1`, [second]))[0].status).toBe("suggested");
  });

  it("duas reservas simultâneas no mesmo horário: só uma vence e a outra não deixa rastro", async () => {
    const a = await newProtocol(26, [{ substanceId: IV, total: 1 }]);
    const b = await newProtocol(27, [{ substanceId: IV, total: 1 }]);
    const [first, second] = await withInsertDelay(() => Promise.all([
      reserveProtocolVisits({ ...base, clientId: 26, protocolId: a, visits: [visit(MON2, "10:00", [IV, 1])] }),
      reserveProtocolVisits({ ...base, clientId: 27, protocolId: b, visits: [visit(MON2, "10:00", [IV, 1])] }),
    ]));
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const loser = first.ok ? second : first;
    expect(loser).toMatchObject({ ok: false, status: 409, code: "horario_indisponivel" });
    expect(await rows(`SELECT count(*)::int AS n FROM sessions WHERE scheduled_date=$1 AND scheduled_time='10:00'`, [MON2]))
      .toEqual([{ n: 1 }]);
    const loserProtocol = first.ok ? b : a;
    expect(await rows(`SELECT (SELECT count(*)::int FROM sessions WHERE protocol_id=$1) AS s, status FROM protocols WHERE id=$1`, [loserProtocol]))
      .toEqual([{ s: 0, status: "suggested" }]);
  });

  it("duas reservas simultâneas em horários parcialmente sobrepostos: só uma vence", async () => {
    const a = await newProtocol(21, [{ substanceId: IV, total: 1 }]);
    const b = await newProtocol(22, [{ substanceId: IV, total: 1 }]);
    // 09h20 ocupa 09h20-10h00; 09h40 ocupa 09h40-10h20: dividem o período das 09h40.
    const results = await withInsertDelay(() => Promise.all([
      reserveProtocolVisits({ ...base, clientId: 21, protocolId: a, visits: [visit(WED2, "09:20", [IV, 1])] }),
      reserveProtocolVisits({ ...base, clientId: 22, protocolId: b, visits: [visit(WED2, "09:40", [IV, 1])] }),
    ]));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.find(r => !r.ok)).toMatchObject({ code: "horario_indisponivel" });
    expect(await rows(`SELECT count(*)::int AS n FROM sessions WHERE scheduled_date=$1`, [WED2])).toEqual([{ n: 1 }]);
  });

  it("reserva do protocolo e marcação avulsa disputando o mesmo horário: só uma vence", async () => {
    const reservedProtocol = await newProtocol(28, [{ substanceId: IM, total: 1 }]);
    const directProtocol = await newProtocol(27, [{ substanceId: IM, total: 1 }]);
    const [reservation, direct] = await withInsertDelay(() => Promise.all([
      reserveProtocolVisits({ ...base, clientId: 28, protocolId: reservedProtocol, visits: [visit(MON3, "09:00", [IM, 1])] }),
      bookSession({ resourceId: 1, clientId: 27, protocolId: directProtocol, date: MON3, time: "09:00", empresaId: 5 }),
    ]));
    expect([reservation.ok, direct.ok].filter(Boolean)).toHaveLength(1);
    expect(await rows(`SELECT count(*)::int AS n FROM sessions WHERE scheduled_date=$1 AND scheduled_time='09:00'`, [MON3]))
      .toEqual([{ n: 1 }]);
  });

  it("repetir uma reserva já gravada (resposta perdida) recusa como já agendado e não duplica", async () => {
    const plan = [visit(MON1, "09:20", [IM, 1]), visit(WED1, "09:00", [IM, 2], [IV, 1])];
    const protocolId = await reserved(21, [{ substanceId: IM, total: 2 }, { substanceId: IV, total: 1 }], plan);
    const before = await counts();
    const again = await reserveProtocolVisits({ ...base, clientId: 21, protocolId, visits: plan });
    expect(again).toMatchObject({ ok: false, status: 409, code: "protocolo_ja_agendado" });
    expect(await counts()).toEqual(before);
  });

  it("recusa sem gravar: empresa, cliente e protocolo trocados", async () => {
    const before = await counts();
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    const plan = [visit(MON3, "10:00", [IM, 1])];
    expect(await reserveProtocolVisits({ ...base, empresaId: 6, clientId: 21, protocolId, visits: plan }))
      .toMatchObject({ ok: false, status: 404, code: "agenda_nao_encontrada" });
    expect(await reserveProtocolVisits({ ...base, nursingResourceId: 2, clientId: 21, protocolId, visits: plan }))
      .toMatchObject({ ok: false, status: 404, code: "agenda_nao_encontrada" });
    expect(await reserveProtocolVisits({ ...base, nursingResourceId: 999, clientId: 21, protocolId, visits: plan }))
      .toMatchObject({ ok: false, status: 404, code: "agenda_nao_encontrada" });
    expect(await reserveProtocolVisits({ ...base, clientId: 23, protocolId, visits: plan }))
      .toMatchObject({ ok: false, status: 404, code: "cliente_nao_encontrado" });
    expect(await reserveProtocolVisits({ ...base, clientId: 22, protocolId, visits: plan }))
      .toMatchObject({ ok: false, status: 404, code: "protocolo_nao_encontrado" });
    expect(await reserveProtocolVisits({ ...base, clientId: 21, protocolId: 987654, visits: plan }))
      .toMatchObject({ ok: false, status: 404, code: "protocolo_nao_encontrado" });
    const foreign = await newProtocol(21, [{ substanceId: IM, total: 1 }], { empresaId: 6 });
    expect(await reserveProtocolVisits({ ...base, clientId: 21, protocolId: foreign, visits: plan }))
      .toMatchObject({ ok: false, status: 404, code: "protocolo_nao_encontrado" });
    const invalidStatus = await newProtocol(21, [{ substanceId: IM, total: 1 }], { status: "completed" });
    expect(await reserveProtocolVisits({ ...base, clientId: 21, protocolId: invalidStatus, visits: plan }))
      .toMatchObject({ ok: false, status: 409, code: "protocolo_status_invalido" });
    expect(await counts()).toEqual(before);
  });

  it("recusa sem gravar: visita com médico, participação ou duração indefinida", async () => {
    const before = await counts();
    const doctor = await newProtocol(21, [{ substanceId: IMPLANTE, total: 1 }]);
    expect(await reserveProtocolVisits({ ...base, clientId: 21, protocolId: doctor, visits: [visit(MON3, "10:00", [IMPLANTE, 1])] }))
      .toMatchObject({ ok: false, status: 422, code: "medico_nao_habilitado" });
    const undefinedDoctor = await newProtocol(21, [{ substanceId: SEM_MEDICO_DEFINIDO, total: 1 }]);
    expect(await reserveProtocolVisits({ ...base, clientId: 21, protocolId: undefinedDoctor,
      visits: [visit(MON3, "10:00", [SEM_MEDICO_DEFINIDO, 1])] }))
      .toMatchObject({ ok: false, status: 422, code: "participacao_medica_indefinida" });
    const noDuration = await newProtocol(21, [{ substanceId: SEM_DURACAO, total: 1 }]);
    expect(await reserveProtocolVisits({ ...base, clientId: 21, protocolId: noDuration,
      visits: [visit(MON3, "10:00", [SEM_DURACAO, 1])] }))
      .toMatchObject({ ok: false, status: 422, code: "substancia_sem_duracao" });
    expect(await counts()).toEqual(before);
  });

  it("recusa sem gravar: plano adulterado (a mais, a menos, repetido, fora de ordem, de outro protocolo)", async () => {
    const before = await counts();
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 2 }]);
    const attempt = (...visits: ReturnType<typeof visit>[]) => reserveProtocolVisits({ ...base, clientId: 21, protocolId, visits });
    const incoherent = { ok: false, status: 422, code: "plano_incoerente" };
    expect(await attempt(visit(MON3, "10:00", [IM, 1]))).toMatchObject(incoherent); // falta a 2ª aplicação
    expect(await attempt(visit(MON3, "10:00", [IM, 1]), visit(WED2, "10:00", [IM, 2], [OUTRO_PROTOCOLO, 1])))
      .toMatchObject(incoherent); // substância de outro protocolo
    expect(await attempt(visit(MON3, "10:00", [IM, 1]), visit(WED2, "10:00", [IM, 3]))).toMatchObject(incoherent); // número além do total
    expect(await attempt(visit(MON3, "10:00", [IM, 1]), visit(WED2, "10:00", [IM, 1]))).toMatchObject(incoherent); // repetida
    expect(await attempt(visit(WED2, "10:00", [IM, 2]), visit(MON3, "10:00", [IM, 1]))).toMatchObject(incoherent); // fora de ordem
    expect(await attempt(visit(MON3, "10:00", [IM, 1], [IM, 2]))).toMatchObject(incoherent); // mesma substância na mesma visita
    expect(await counts()).toEqual(before);
  });

  it("recusa sem gravar: entrada malformada", async () => {
    const before = await counts();
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    const call = (visits: any) => reserveProtocolVisits({ ...base, clientId: 21, protocolId, visits });
    const bad = { ok: false, status: 400, code: "visitas_invalidas" };
    expect(await call([])).toMatchObject(bad);
    expect(await call(undefined)).toMatchObject(bad);
    expect(await call([visit(MON3, "10:60", [IM, 1])])).toMatchObject(bad);
    expect(await call([visit("2030-02-30", "10:00", [IM, 1])])).toMatchObject(bad);
    expect(await call([visit(MON3, "10:00", [IM, 1]), visit(MON3, "10:20", [IM, 1])])).toMatchObject(bad);
    expect(await call([{ date: MON3, time: "10:00", applications: [] }])).toMatchObject(bad);
    expect(await call([visit(MON3, "10:00", [IM, 0])])).toMatchObject(bad);
    expect(await call([visit(MON3, "10:00", [IM, 1.5])])).toMatchObject(bad);
    const many = Array.from({ length: MAX_RESERVATION_VISITS + 1 }, (_, i) =>
      visit(new Date(Date.parse("2031-01-01T12:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), "10:00", [IM, 1]));
    expect(await call(many)).toMatchObject(bad);
    expect(await reserveProtocolVisits({ ...base, empresaId: 0, clientId: 21, protocolId, visits: [visit(MON3, "10:00", [IM, 1])] }))
      .toMatchObject(bad);
    expect(await counts()).toEqual(before);
  });

  it("recusa dia sem expediente, dia com exceção, Google desatualizado e antecedência mínima", async () => {
    const before = await counts();
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    const attempt = (date: string, time = "10:00") =>
      reserveProtocolVisits({ ...base, clientId: 21, protocolId, visits: [visit(date, time, [IM, 1])] });
    expect(await attempt(TUE)).toMatchObject({ ok: false, status: 409, code: "dia_sem_expediente", date: TUE });
    await query(`INSERT INTO agenda_exceptions(resource_id,date,kind,description) VALUES(1,'${MON3}','feriado','Exceção sintética')`);
    try {
      expect(await attempt(MON3)).toMatchObject({ ok: false, status: 409, code: "dia_com_excecao", date: MON3 });
    } finally {
      await query(`DELETE FROM agenda_exceptions`);
    }
    await query(`UPDATE locations SET google_calendar_id='agenda-sintetica@example.invalid' WHERE id=8;
      INSERT INTO agenda_google_sync(enabled,location_id,last_success,error) VALUES(true,8,'2020-01-01T00:00:00Z',NULL)`);
    try {
      expect(await attempt(MON3)).toMatchObject({ ok: false, status: 409, code: "agenda_desatualizada", date: MON3 });
    } finally {
      await query(`UPDATE locations SET google_calendar_id=NULL WHERE id=8; DELETE FROM agenda_google_sync`);
    }
    // Horário fora do expediente (não existe) e dentro da antecedência de 24 horas.
    expect(await attempt(MON3, "08:00")).toMatchObject({ ok: false, status: 409, code: "horario_indisponivel" });
    const LEAD = "2030-04-01"; // segunda-feira livre; com a hora simulada comum o horário 09h00 existe
    const opens = async () => (await loadProtocolSlots({ ...base, nursingResourceId: 1, fromDate: LEAD, toDate: LEAD }))
      .slots.some(slot => slot.time === "09:00");
    expect(await opens()).toBe(true);
    vi.setSystemTime(new Date("2030-03-31T12:00:00-03:00")); // domingo, 21 h antes de segunda 09h00
    try {
      expect(await opens()).toBe(false);
      expect(await attempt(LEAD, "09:00")).toMatchObject({ ok: false, status: 409, code: "horario_indisponivel" });
    } finally {
      vi.setSystemTime(new Date(NOW));
    }
    expect(await counts()).toEqual(before);
  });

  it("cliente com visita viva no mesmo dia é recusado; sessão cancelada ou arquivada não conta", async () => {
    await reserved(21, [{ substanceId: IM, total: 1 }], [visit(MON1, "09:20", [IM, 1])]);
    const before = await counts();
    const conflict = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    expect(await reserveProtocolVisits({ ...base, clientId: 21, protocolId: conflict, visits: [visit(MON1, "10:00", [IM, 1])] }))
      .toMatchObject({ ok: false, status: 409, code: "cliente_ja_tem_visita_no_dia", date: MON1 });
    expect(await counts()).toEqual(before);
    await query(`UPDATE sessions SET status='cancelled' WHERE client_id=21 AND scheduled_date='${MON1}'`);
    const afterCancel = await reserveProtocolVisits({ ...base, clientId: 21, protocolId: conflict, visits: [visit(MON1, "10:00", [IM, 1])] });
    expect(afterCancel.ok).toBe(true);

    // Sessão arquivada da agenda também não conta como visita viva.
    await reserved(22, [{ substanceId: IM, total: 1 }], [visit(WED1, "09:00", [IM, 1])]);
    const archivedConflict = await newProtocol(22, [{ substanceId: IM, total: 1 }]);
    expect(await reserveProtocolVisits({ ...base, clientId: 22, protocolId: archivedConflict, visits: [visit(WED1, "10:00", [IM, 1])] }))
      .toMatchObject({ ok: false, code: "cliente_ja_tem_visita_no_dia" });
    await query(`UPDATE sessions SET agenda_archived=true WHERE client_id=22 AND scheduled_date='${WED1}'`);
    expect((await reserveProtocolVisits({ ...base, clientId: 22, protocolId: archivedConflict, visits: [visit(WED1, "10:00", [IM, 1])] })).ok)
      .toBe(true);
  });

  it("uma visita sem horário no meio do plano desfaz o plano inteiro (nada da primeira visita fica)", async () => {
    const before = await counts();
    const protocolId = await newProtocol(24, [{ substanceId: IM, total: 2 }]);
    const result = await reserveProtocolVisits({ ...base, clientId: 24, protocolId,
      visits: [visit(MON3, "10:20", [IM, 1]), visit("2030-03-19" /* terça */, "10:00", [IM, 2])] });
    expect(result).toMatchObject({ ok: false, code: "dia_sem_expediente", date: "2030-03-19" });
    expect(await counts()).toEqual(before);
  });

  it("falha no meio da gravação desfaz tudo: nenhuma sessão, aplicação ou mudança de protocolo", async () => {
    const protocolId = await newProtocol(25, [{ substanceId: IM, total: 2 }]);
    await query(`CREATE OR REPLACE FUNCTION falha_sintetica() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.session_number = 2 THEN RAISE EXCEPTION 'falha sintética de gravação'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER falha_sintetica BEFORE INSERT ON substance_applications FOR EACH ROW EXECUTE FUNCTION falha_sintetica()`);
    const before = await counts();
    try {
      await expect(reserveProtocolVisits({ ...base, clientId: 25, protocolId,
        visits: [visit(MON3, "10:00", [IM, 1]), visit("2030-03-20", "10:00", [IM, 2])] }))
        .rejects.toThrow();
    } finally {
      await query(`DROP TRIGGER falha_sintetica ON substance_applications`);
    }
    expect(await counts()).toEqual(before);
    expect(await rows(`SELECT status, scheduled_time FROM protocols WHERE id=$1`, [protocolId]))
      .toEqual([{ status: "suggested", scheduled_time: "09:00" }]);
    // Sem rastro, o mesmo plano passa em seguida.
    const retry = await reserveProtocolVisits({ ...base, clientId: 25, protocolId,
      visits: [visit(MON3, "10:00", [IM, 1]), visit("2030-03-20", "10:00", [IM, 2])] });
    expect(retry.ok).toBe(true);
  });

  it("recusa agenda de enfermagem domiciliar ou online, mesmo com expediente e horários de 20 minutos", async () => {
    const before = await counts();
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 1 }]);
    for (const nursingResourceId of [3, 4]) {
      expect(await reserveProtocolVisits({ ...base, nursingResourceId, clientId: 21, protocolId, visits: [visit(MON3, "09:00", [IM, 1])] }))
        .toMatchObject({ ok: false, status: 422, code: "agenda_invalida" });
    }
    // Prova de não-vacuidade: a mesma agenda domiciliar tem horário aberto no motor; só a modalidade a recusa.
    const open = await loadProtocolSlots({ ...base, nursingResourceId: 3, fromDate: MON3, toDate: MON3 });
    expect(open.slots.some(slot => slot.time === "09:00")).toBe(true);
    expect(await counts()).toEqual(before);
    expect((await rows(`SELECT status FROM protocols WHERE id=$1`, [protocolId]))[0].status).toBe("suggested");
  });

  it("recusa rápido um protocolo com total de sessões absurdo no banco, sem percorrer o total", async () => {
    const protocolId = await newProtocol(21, [{ substanceId: IM, total: 2_000_000_000 }]);
    const started = performance.now(); // o relógio Date está congelado pelo teste
    const result = await reserveProtocolVisits({ ...base, clientId: 21, protocolId, visits: [visit(MON3, "10:00", [IM, 1])] });
    expect(result).toMatchObject({ ok: false, status: 422, code: "plano_incoerente" });
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(await counts()).toEqual({ sessions: 0, applications: 0 });
  });

  it("simulação marca as sessões com a etiqueta de simulação", async () => {
    const protocolId = await newProtocol(26, [{ substanceId: IM, total: 1 }]);
    const result = await reserveProtocolVisits({ ...base, clientId: 26, protocolId, simulate: true,
      visits: [visit("2030-03-25", "09:00", [IM, 1])] });
    expect(result.ok).toBe(true);
    expect(await rows(`SELECT notes FROM sessions WHERE protocol_id=$1`, [protocolId])).toEqual([{ notes: "[SIMULACAO]" }]);
  });
});
