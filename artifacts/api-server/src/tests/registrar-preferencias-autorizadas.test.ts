import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFile } from "node:fs/promises";
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
import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, clientVisitPreferenceRevisionsTable,
  clientsTable, collaboratorAuditTable, locationsTable, professionalsTable,
} from "@workspace/db/schema";
import { registrarPreferenciasAutorizadas } from "../scripts/registrar-preferencias-autorizadas";

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

const windows = [
  ...[1, 2, 3, 4].flatMap(weekday => [
    { weekday, startTime: "09:00", endTime: "13:00", repeatWeeks: 1 as const, anchorDate: null },
    { weekday, startTime: "14:00", endTime: "16:00", repeatWeeks: 1 as const, anchorDate: null },
  ]),
  { weekday: 5, startTime: "09:00", endTime: "13:00", repeatWeeks: 1 as const, anchorDate: null },
  { weekday: 6, startTime: "09:00", endTime: "13:00", repeatWeeks: 2 as const, anchorDate: "2026-11-21" },
];
const input = {
  expectedDevelopmentDatabase: "", expectedDevelopmentSystemIdentifier: "",
  empresaId: 5, professionalId: 101, professionalName: "Profissional sintético",
  clientId: 501, clientName: "Cliente sintético", resourceId: 11, resourceName: "Enfermagem sintética",
  expectedSlotMinutes: 30 as const, slotMinutes: 20 as const, expectedRevision: 0, windows,
  priority: [{ weekday: 1, time: "10:00" }, { weekday: 6, time: "10:00" }, { weekday: 3, time: "10:00" }],
};

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [clientsTable, professionalsTable, locationsTable, agendaResourcesTable,
    agendaWindowsTable, agendaSettingsTable, collaboratorAuditTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(`CREATE TABLE client_visit_preference_revisions (
    id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL,
    preferences JSONB NOT NULL, created_by INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
  );
  INSERT INTO client_visit_preference_revisions (client_id,empresa_id,preferences,created_by)
    VALUES(77,5,'{}'::jsonb,101);`);
  const migration = await readFile(new URL("../../../../scripts/migrations/20261108_preferencias_visitas_proveniencia.sql", import.meta.url), "utf8");
  await isolated.pool.query(migration);
  await isolated.pool.query(migration);
  const legacy = await isolated.pool.query(`SELECT executor_kind,executor_label,authorizer_professional_id
    FROM client_visit_preference_revisions WHERE client_id=77`);
  expect(legacy.rows[0]).toEqual({ executor_kind: "professional", executor_label: null, authorizer_professional_id: null });
  const fingerprint = await isolated.pool.query(`SELECT current_database() AS name,
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier`);
  input.expectedDevelopmentDatabase = fingerprint.rows[0].name;
  input.expectedDevelopmentSystemIdentifier = fingerprint.rows[0].system_identifier;
}, 60000);

beforeEach(async () => {
  await isolated.pool.query(`TRUNCATE clients, professionals, locations, agenda_resources, agenda_windows,
    agenda_settings, client_visit_preference_revisions, collaborator_audit RESTART IDENTITY;
    INSERT INTO professionals (id,name,active,is_platform_owner) VALUES (101,'Profissional sintético',true,true);
    INSERT INTO clients (id,name,empresa_id,status) VALUES (501,'Cliente sintético',5,'active');
    INSERT INTO locations (id,empresa_id,active) VALUES (8,5,'true');
    INSERT INTO agenda_resources (id,name,kind,modality,slot_minutes,location_id,active)
      VALUES (11,'Enfermagem sintética','enfermagem','local',30,8,true);
    INSERT INTO agenda_settings (id,block_minutes,trigger_percent,min_lead_hours) VALUES (1,120,60,24);
  `);
});
afterAll(async () => { state.database = null; await isolated?.stop(); }, 60000);

describe("operação administrativa delegada com motor existente", () => {
  it("grava expediente e ordem juntos, mantendo a identidade do executor distinta", async () => {
    const result = await registrarPreferenciasAutorizadas(state.database, input);
    expect(result).toEqual({ revision: 1, windowCount: 10 });
    const resource = await isolated.pool.query("SELECT slot_minutes FROM agenda_resources WHERE id=11");
    expect(resource.rows[0].slot_minutes).toBe(20);
    const saved = await isolated.pool.query(`SELECT preferences,created_by,executor_kind,executor_label,
      authorizer_professional_id FROM client_visit_preference_revisions`);
    expect(saved.rows[0].preferences.nursing.priority).toEqual(input.priority);
    expect(saved.rows[0].preferences.medical).toEqual({ weekdays: [], times: [] });
    expect(saved.rows[0].created_by).toBe(101);
    expect(saved.rows[0]).toMatchObject({ executor_kind: "agent", executor_label: "Replit Agent", authorizer_professional_id: 101 });
    const audit = await isolated.pool.query("SELECT professional_id,subject_professional_id,action,detail FROM collaborator_audit");
    expect(audit.rows[0]).toMatchObject({
      professional_id: null, subject_professional_id: 101, action: "agent_delegated_configuration",
      detail: { executor: "Replit Agent", preferenceRevision: 1 },
    });
  });

  it("recusa profissional não autorizado e empresa divergente", async () => {
    await isolated.pool.query("UPDATE professionals SET is_platform_owner=false WHERE id=101");
    await expect(registrarPreferenciasAutorizadas(state.database, input)).rejects.toThrow("proprietário ativo");
    await isolated.pool.query("UPDATE professionals SET is_platform_owner=true WHERE id=101");
    await expect(registrarPreferenciasAutorizadas(state.database, { ...input, empresaId: 6 })).rejects.toThrow("Cliente");
    const rows = await isolated.pool.query("SELECT slot_minutes FROM agenda_resources WHERE id=11");
    expect(rows.rows[0].slot_minutes).toBe(30);
  });

  it("recusa banco diferente e execução em ambiente publicado", async () => {
    await expect(registrarPreferenciasAutorizadas(state.database, {
      ...input, expectedDevelopmentSystemIdentifier: "123456789",
    })).rejects.toThrow("não corresponde ao banco de desenvolvimento");
    const old = process.env.REPLIT_DEPLOYMENT;
    try {
      process.env.REPLIT_DEPLOYMENT = "1";
      await expect(registrarPreferenciasAutorizadas(state.database, input)).rejects.toThrow("ambiente publicado");
    } finally {
      if (old === undefined) delete process.env.REPLIT_DEPLOYMENT;
      else process.env.REPLIT_DEPLOYMENT = old;
    }
    const result = await isolated.pool.query("SELECT slot_minutes FROM agenda_resources WHERE id=11");
    expect(result.rows[0].slot_minutes).toBe(30);
  });

  it("não altera preferência existente mesmo com ordem órfã", async () => {
    const preferences = { medical: { weekdays: [], times: [] }, nursing: {
      weekdays: [], times: [], priority: [{ weekday: 1, time: "10:00" }],
    }};
    const row = await isolated.pool.query(`INSERT INTO client_visit_preference_revisions
      (client_id,empresa_id,preferences,created_by) VALUES(501,5,$1::jsonb,101) RETURNING id`, [JSON.stringify(preferences)]);
    await expect(registrarPreferenciasAutorizadas(state.database, { ...input, expectedRevision: row.rows[0].id }))
      .rejects.toThrow("já tem escolhas de enfermagem");
    const result = await isolated.pool.query("SELECT slot_minutes FROM agenda_resources WHERE id=11");
    expect(result.rows[0].slot_minutes).toBe(30);
  });

  it("restrição impede provenance de agente incompleta ou profissional com rótulo de agente", async () => {
    for (const [kind, label, authorizer] of [
      ["agent", null, 101], ["agent", "Replit Agent", null], ["professional", "Replit Agent", null],
    ]) {
      await expect(isolated.pool.query(`INSERT INTO client_visit_preference_revisions
        (client_id,empresa_id,preferences,created_by,executor_kind,executor_label,authorizer_professional_id)
        VALUES(501,5,'{}'::jsonb,101,$1,$2,$3)`, [kind, label, authorizer])).rejects.toThrow();
    }
  });

  it("não substitui expediente existente nem aceita repetição inválida", async () => {
    await isolated.pool.query("INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,active) VALUES(11,1,'09:00','12:00',true)");
    await expect(registrarPreferenciasAutorizadas(state.database, input)).rejects.toThrow("já tem expediente");
    const badWindows = windows.map(w => w.weekday === 6 ? { ...w, anchorDate: "2026-11-20" } : w);
    await expect(registrarPreferenciasAutorizadas(state.database, { ...input, windows: badWindows })).rejects.toThrow("inválido");
    const count = await isolated.pool.query("SELECT COUNT(*)::int AS n FROM agenda_windows");
    expect(count.rows[0].n).toBe(1);
  });

  it("reverte expediente quando o horário não pertence à grade", async () => {
    const bad = { ...input, priority: [{ weekday: 1, time: "13:20" }] };
    await expect(registrarPreferenciasAutorizadas(state.database, bad)).rejects.toThrow("não pertence à grade");
    const slots = await isolated.pool.query("SELECT slot_minutes FROM agenda_resources WHERE id=11");
    const count = await isolated.pool.query("SELECT COUNT(*)::int AS n FROM agenda_windows");
    expect(slots.rows[0].slot_minutes).toBe(30);
    expect(count.rows[0].n).toBe(0);
  });

  it("não aceita grade de trinta minutos mesmo havendo outro recurso compatível", async () => {
    await isolated.pool.query(`INSERT INTO agenda_resources (id,name,kind,modality,slot_minutes,location_id,active)
      VALUES (12,'Outro recurso sintético','enfermagem','local',20,8,true);
      INSERT INTO agenda_windows (resource_id,weekday,start_time,end_time,active)
      VALUES (12,1,'09:00','13:00',true)`);
    await expect(registrarPreferenciasAutorizadas(state.database, { ...input, slotMinutes: 30 } as any)).rejects.toThrow();
    const result = await isolated.pool.query("SELECT slot_minutes FROM agenda_resources WHERE id=11");
    expect(result.rows[0].slot_minutes).toBe(30);
  });

  it("não usa janela de outro recurso para validar a preferência do alvo", async () => {
    await isolated.pool.query(`INSERT INTO agenda_resources (id,name,kind,modality,slot_minutes,location_id,active)
      VALUES (12,'Outro recurso sintético','enfermagem','local',20,8,true);
      INSERT INTO agenda_windows (resource_id,weekday,start_time,end_time,active)
      VALUES (12,6,'09:00','13:00',true)`);
    await expect(registrarPreferenciasAutorizadas(state.database, {
      ...input, windows: input.windows.filter(w => w.weekday !== 6),
    })).rejects.toThrow("não pertence à grade do recurso selecionado");
    const result = await isolated.pool.query("SELECT slot_minutes FROM agenda_resources WHERE id=11");
    expect(result.rows[0].slot_minutes).toBe(30);
  });

  it("duas operações simultâneas não duplicam os registros", async () => {
    const results = await Promise.allSettled([
      registrarPreferenciasAutorizadas(state.database, input),
      registrarPreferenciasAutorizadas(state.database, input),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const counts = await isolated.pool.query(`SELECT
      (SELECT COUNT(*)::int FROM agenda_windows) AS windows,
      (SELECT COUNT(*)::int FROM client_visit_preference_revisions) AS revisions,
      (SELECT COUNT(*)::int FROM collaborator_audit) AS audits`);
    expect(counts.rows[0]).toEqual({ windows: 10, revisions: 1, audits: 1 });
  });
});
