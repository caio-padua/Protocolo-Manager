import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

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
  locationsTable, professionalsTable,
} from "@workspace/db/schema";
import { loadProtocolSlots } from "../lib/protocol-slot-source";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
function createTableSql(table: any) {
  const definition = getTableConfig(table);
  const columns = definition.columns.map(column => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const defaultNow = ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : "";
    return `"${column.name}" ${column.getSQLType()}${defaultNow}`;
  });
  return `CREATE TABLE "${definition.name}" (${columns.join(", ")});`;
}

// 2030-03-04 é segunda-feira; a "hora atual" simulada deixa a data além da antecedência de 24 h.
const MONDAY = "2030-03-04";
const base = { empresaId: 5, nursingResourceId: 1, fromDate: MONDAY, toDate: "2030-03-06" };

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
    locationsTable, professionalsTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(`
    CREATE TABLE agenda_personal_owners(location_id INTEGER, empresa_id INTEGER, professional_id INTEGER);
    CREATE TABLE agenda_google_sync(enabled BOOLEAN, location_id INTEGER, last_success TIMESTAMPTZ, error TEXT);
    CREATE TABLE agenda_compromissos(id INTEGER, titulo TEXT, inicio TIMESTAMPTZ, fim TIMESTAMPTZ, dia_inteiro BOOLEAN,
      recorrencia TEXT, origem TEXT, location_id INTEGER, status TEXT, chave TEXT, google_calendar_id TEXT);
    CREATE TABLE sessions(id INTEGER, resource_id INTEGER, scheduled_time TEXT, scheduled_date TEXT, duration_minutes INTEGER,
      status TEXT, agenda_archived BOOLEAN, google_event_id TEXT, google_calendar_id TEXT);
    INSERT INTO locations(id,name,empresa_id,active) VALUES
      (8,'Local sintético A',5,'true'), (9,'Local de outra empresa',6,'true'),
      (10,'Local inativo',5,'false'), (11,'Local sem empresa',NULL,'true');
    INSERT INTO professionals(id,name,active,is_primary_doctor) VALUES(101,'Médico sintético',true,true);
    INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active) VALUES
      (1,'Enfermagem sintética','enfermagem','local',20,8,NULL,true),
      (2,'Médico sintético','medico','local',60,8,101,true),
      (3,'Enfermagem de outra empresa','enfermagem','local',20,9,NULL,true),
      (4,'Enfermagem em local inativo','enfermagem','local',20,10,NULL,true),
      (5,'Enfermagem em local sem empresa','enfermagem','local',20,11,NULL,true),
      (6,'Enfermagem desativada','enfermagem','local',20,8,NULL,false),
      (7,'Enfermagem de 30 minutos','enfermagem','local',30,8,NULL,true),
      (8,'Médico de outra empresa','medico','local',60,9,NULL,true);
    INSERT INTO agenda_settings(id,block_minutes,trigger_percent,min_lead_hours) VALUES(1,120,60,24);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active) VALUES
      (1,1,'09:00','11:00',1,NULL,true), (2,1,'10:00','12:00',1,NULL,true);
    INSERT INTO sessions(id,resource_id,scheduled_time,scheduled_date,duration_minutes,status,agenda_archived)
      VALUES(1,1,'09:20','${MONDAY}',40,'scheduled',false);
  `);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-03-01T12:00:00-03:00"));
}, 60_000);

afterAll(async () => {
  vi.useRealTimers();
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("Fonte de vagas lendo o motor verdadeiro em banco descartável", () => {
  it("sessão de 40 minutos ocupa dois períodos e as vagas se dividem antes e depois dela", async () => {
    const result = await loadProtocolSlots(base);
    expect(result.slots.map(s => `${s.time}:${s.capacityPeriods}`)).toEqual([
      "09:00:1", "10:00:3", "10:20:2", "10:40:1",
    ]);
    expect(result.diagnostics.nursingDatesWithoutSchedule).toEqual(["2030-03-05", "2030-03-06"]);
    expect(result.diagnostics.integrationPendingDates).toEqual([]);
  });

  it("agenda médica com expediente cobre os períodos de enfermagem pela grade de 60 minutos", async () => {
    const result = await loadProtocolSlots({ ...base, doctorResourceId: 2 });
    expect(result.slots.map(s => `${s.time}:${s.capacityPeriods}:${s.doctorCapacityPeriods}`)).toEqual([
      "09:00:1:0", "10:00:3:3", "10:20:2:2", "10:40:1:1",
    ]);
    expect(result.diagnostics.doctorDatesWithoutSchedule).toEqual([]);
  });

  it("médico informado sem janela cadastrada dá cobertura zero e diagnóstico próprio", async () => {
    await isolated.pool.query(`UPDATE agenda_windows SET active=false WHERE resource_id=2`);
    try {
      const result = await loadProtocolSlots({ ...base, doctorResourceId: 2, toDate: MONDAY });
      expect(result.slots.every(s => s.doctorCapacityPeriods === 0)).toBe(true);
      expect(result.diagnostics.doctorDatesWithoutSchedule).toEqual([MONDAY]);
    } finally {
      await isolated.pool.query(`UPDATE agenda_windows SET active=true WHERE resource_id=2`);
    }
  });

  it("recusa, com a mesma mensagem, agenda de outra empresa, de local inativo, de local sem empresa, desativada ou inexistente", async () => {
    for (const nursingResourceId of [3, 4, 5, 6, 999]) {
      await expect(loadProtocolSlots({ ...base, nursingResourceId })).rejects.toThrow("Agenda não encontrada ou inativa");
    }
    await expect(loadProtocolSlots({ ...base, empresaId: 6 })).rejects.toThrow("Agenda não encontrada ou inativa");
    await expect(loadProtocolSlots({ ...base, doctorResourceId: 8 })).rejects.toThrow("Agenda não encontrada ou inativa");
  });

  it("recusa agenda de enfermagem fora da grade de 20 minutos e tipo trocado", async () => {
    await expect(loadProtocolSlots({ ...base, nursingResourceId: 7 })).rejects.toThrow("horários de 20 minutos");
    await expect(loadProtocolSlots({ ...base, nursingResourceId: 2 })).rejects.toThrow("não é de enfermagem");
  });

  it("agenda do Google desatualizada aparece como pendente, não como dia sem vaga", async () => {
    await isolated.pool.query(`UPDATE locations SET google_calendar_id='agenda-sintetica@example.invalid' WHERE id=8;
      INSERT INTO agenda_google_sync(enabled,location_id,last_success,error)
        VALUES(true,8,'2020-01-01T00:00:00Z',NULL)`);
    try {
      const result = await loadProtocolSlots({ ...base, toDate: MONDAY });
      expect(result.slots).toEqual([]);
      expect(result.diagnostics.integrationPendingDates).toEqual([MONDAY]);
      expect(result.diagnostics.nursingDatesWithoutOpenSlot).toEqual([]);
    } finally {
      await isolated.pool.query(`UPDATE locations SET google_calendar_id=NULL WHERE id=8; DELETE FROM agenda_google_sync`);
    }
  });
});
