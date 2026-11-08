import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

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
import { agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable, locationsTable, professionalsTable } from "@workspace/db/schema";
import { computeResourceSlots } from "../lib/agenda-booking";
import { computeConciergeOffer } from "../lib/agenda-concierge";

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

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable, locationsTable, professionalsTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(`
    CREATE TABLE agenda_personal_owners(location_id INTEGER, empresa_id INTEGER, professional_id INTEGER);
    CREATE TABLE agenda_google_sync(enabled BOOLEAN, location_id INTEGER, last_success TIMESTAMPTZ, error TEXT);
    CREATE TABLE agenda_compromissos(id INTEGER, titulo TEXT, inicio TIMESTAMPTZ, fim TIMESTAMPTZ, dia_inteiro BOOLEAN,
      recorrencia TEXT, origem TEXT, location_id INTEGER, status TEXT, chave TEXT, google_calendar_id TEXT);
    CREATE TABLE sessions(id INTEGER, resource_id INTEGER, scheduled_time TEXT, scheduled_date TEXT, duration_minutes INTEGER,
      status TEXT, agenda_archived BOOLEAN, google_event_id TEXT, google_calendar_id TEXT);
    INSERT INTO locations(id,name,empresa_id,active,google_calendar_id) VALUES(8,'Local sintético',5,'true',NULL);
    INSERT INTO professionals(id,name,active,is_primary_doctor) VALUES(101,'Médico sintético',true,true);
    INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active)
      VALUES(11,'Agenda sintética','medico','local',20,8,101,true);
    INSERT INTO agenda_settings(id,block_minutes,trigger_percent,min_lead_hours) VALUES(1,120,60,0);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active)
      VALUES(11,6,'09:00','13:00',2,'2026-11-21',true),
            (11,6,'08:00','18:00',1,NULL,false);
    INSERT INTO agenda_exceptions(resource_id,date,kind) VALUES(11,'2026-12-19','bloqueio');
    INSERT INTO sessions(id,resource_id,scheduled_time,scheduled_date,duration_minutes,status,agenda_archived)
      VALUES(1,11,'09:00','2026-11-21',20,'scheduled',false),
            (2,11,'09:00','2026-12-05',20,'scheduled',false);
  `);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T12:00:00-03:00"));
}, 60_000);

afterAll(async () => {
  vi.useRealTimers();
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("recorrência, ocupação e exceção no motor verdadeiro", () => {
  it("fecha antes da âncora e no sábado intercalado", async () => {
    for (const date of ["2026-11-14", "2026-11-28"]) {
      const result = await computeResourceSlots(11, date);
      expect(result?.result.slots).toEqual([]);
      expect(result?.result.reason).toBe("sem-expediente");
    }
  });

  it("abre os sábados corretos sem oferecer o período ocupado", async () => {
    for (const date of ["2026-11-21", "2026-12-05"]) {
      const result = await computeResourceSlots(11, date);
      expect(result?.result.slots.find(s => s.time === "09:00")?.state).toBe("ocupado");
      expect(result?.result.slots.find(s => s.time === "09:20")?.state).toBe("aberto");
      expect(result?.result.slots.some(s => s.time === "08:00")).toBe(false);
    }
  });

  it("fecha uma data quinzenal quando existe exceção", async () => {
    const result = await computeResourceSlots(11, "2026-12-19");
    expect(result?.result.slots).toEqual([]);
    expect(result?.result.reason).toBe("excecao");
  });

  it("oferece no concierge apenas data aberta e horário livre do motor", async () => {
    const offer = await computeConciergeOffer({
      earliestDate: "2026-11-28", preferredWeekday: 6,
      now: new Date("2026-11-08T12:00:00-03:00"),
    });
    expect(offer?.generated).toBe(false);
    expect(offer?.days.map(d => d.date)).toEqual(["2026-12-05"]);
    expect(offer?.days[0].times.every(t => t.time !== "09:00")).toBe(true);
    expect(offer?.days[0].times.length).toBeGreaterThan(0);
  });
});
