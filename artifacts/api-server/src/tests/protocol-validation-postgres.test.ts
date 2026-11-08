import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Opt-in only: run against a separate, disposable PostgreSQL cluster.
// No DATABASE_URL override, no use of the application's database connection.
const state = vi.hoisted(() => ({ pool: null as any, applicationPool: null as any }));
vi.mock("@workspace/db", async importOriginal => {
  const original = await importOriginal<any>();
  if (process.env.PAXTER_ISOLATED_PG !== "1") return original;
  const Pool = original.pool.constructor;
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    host: "127.0.0.1", port: 55439, user: "runner",
    database: "paxter_isolated_protocols",
  });
  state.pool = pool;
  state.applicationPool = original.pool;
  return { ...original, pool, db: drizzle(pool) };
});
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: any, _s: any, n: any) => n() }));
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: () => 99 }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (r: any, s: any, n: any) => {
    if (r.headers.authorization !== "Bearer synthetic-session") { s.sendStatus(401); return; }
    r.collaborator = { professionalId: 98 }; n();
  },
}));
vi.mock("../lib/clinical-emitter", () => ({
  ClinicalIdentityError: class extends Error {},
  resolveClinicalMember: async () => ({ clinic: { id: 97, empresaId: 99 } }),
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
vi.mock("../lib/prescription-signing", () => ({ withLoggedDoctorCertificate: vi.fn() }));
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

import * as schema from "@workspace/db";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import router from "../routes/protocols";
import { sendProtocolOnboardingEmail } from "../lib/email-service";
import { loadProtocolRasGrid } from "../lib/protocol-ras-grid";

const app = express();
app.use(express.json());
app.use((r, _s, n) => {
  r.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any; n();
});
app.use("/api", router);
app.use((err: Error, _r: any, s: any, _n: any) => s.status(500).json({ error: err.message }));
const validate = () => request(app).post("/api/protocols/1/validate")
  .set("Authorization", "Bearer synthetic-session");

describe.skipIf(process.env.PAXTER_ISOLATED_PG !== "1")("Validação em PostgreSQL isolado real", () => {
  const tables = [
    schema.protocolsTable, schema.protocolItemsTable, schema.clientsTable,
    schema.substancesTable, schema.professionalsTable, schema.sessionsTable,
    schema.substanceApplicationsTable, schema.paymentsTable, schema.protocolEmissoesTable,
  ];
  beforeAll(async () => {
    // Refuse even a locally configured database unless the exact disposable name matches.
    const result = await state.pool.query("SELECT current_database() AS name");
    if (result.rows[0].name !== "paxter_isolated_protocols") throw new Error("Unsafe test target");
    const dialect = new PgDialect();
    for (const table of tables) {
      const config = getTableConfig(table);
      const columns = config.columns.map(col => {
        let def = "";
        if (col.default !== undefined) {
          const value: any = col.default;
          if (value?.queryChunks) {
            def = " DEFAULT " + dialect.sqlToQuery(value).sql;
          } else {
            const encoded = col.mapToDriverValue(value);
            def = " DEFAULT " + (typeof encoded === "number" || typeof encoded === "boolean"
              ? String(encoded) : `'${String(encoded).replaceAll("'", "''")}'`);
          }
        }
        return `"${col.name}" ${col.getSQLType()}${def}${col.notNull ? " NOT NULL" : ""}${col.primary ? " PRIMARY KEY" : ""}`;
      });
      await state.pool.query(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
    }
    await state.pool.query("CREATE UNIQUE INDEX app_unique ON substance_applications(session_id, substance_id, session_number)");
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    await state.pool.query("DROP TRIGGER IF EXISTS synthetic_failure ON substance_applications");
    await state.pool.query("DROP TRIGGER IF EXISTS synthetic_delay ON sessions");
    await state.pool.query(`TRUNCATE ${tables.map(t => `"${getTableConfig(t).name}"`).join(",")} RESTART IDENTITY`);
    await schema.db.insert(schema.clientsTable).values({ id: 96, name: "Cliente sintético", email: "synthetic@example.invalid" });
    await schema.db.insert(schema.protocolsTable).values({
      id: 1, clientId: 96, empresaId: 99, title: "Protocolo sintético",
      startDate: "2030-01-01", scheduledTime: "10:00", status: "suggested",
    });
    await state.pool.query("SELECT setval(pg_get_serial_sequence('protocols','id'), 1, true)");
    await schema.db.insert(schema.protocolItemsTable).values([
      { protocolId: 1, substanceId: 95, dose: "dose sintética A", totalSessions: 5, intervalDays: 7, startDate: "2030-01-01" },
      { protocolId: 1, substanceId: 94, dose: "dose sintética B", totalSessions: 3, intervalDays: 15, startDate: "2030-01-01" },
    ]);
  });
  afterAll(async () => {
    await state.pool?.end();
    await state.applicationPool?.end();
  });
  it("lê horário persistido e grava as oito aplicações pelo consolidado existente", async () => {
    const response = await validate();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const sessions = await state.pool.query("SELECT scheduled_time FROM sessions");
    expect(sessions.rows).toHaveLength(5);
    expect(sessions.rows.every((r: any) => r.scheduled_time === "10:00")).toBe(true);
    const apps = await state.pool.query("SELECT count(*)::int AS n FROM substance_applications WHERE availability='disp'");
    expect(apps.rows[0].n).toBe(8);
  });
  it("bloqueio de linha real impede duas gerações concorrentes", async () => {
    await state.pool.query(`CREATE OR REPLACE FUNCTION synthetic_delay_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.08); RETURN NEW; END $$;
      CREATE TRIGGER synthetic_delay BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION synthetic_delay_fn()`);
    const responses = await Promise.all([validate(), validate()]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const count = await state.pool.query("SELECT count(*)::int AS n FROM sessions");
    expect(count.rows[0].n).toBe(5);
    expect(sendProtocolOnboardingEmail).toHaveBeenCalledTimes(1);
  });
  it("grava datas independentes e o RAS lê exatamente as oito visitas persistidas", async () => {
    await state.pool.query("UPDATE protocols SET scheduling_mode='exact', start_date='2030-01-07' WHERE id=1");
    await state.pool.query("UPDATE protocol_items SET start_date='2030-01-07' WHERE substance_id=95");
    await state.pool.query("UPDATE protocol_items SET start_date='2030-01-12', interval_days=14 WHERE substance_id=94");
    const responses = await Promise.all([validate(), validate()]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const visits = await state.pool.query("SELECT scheduled_date, scheduled_time FROM sessions ORDER BY scheduled_date");
    const dates = ["2030-01-07", "2030-01-12", "2030-01-14", "2030-01-21", "2030-01-26", "2030-01-28", "2030-02-04", "2030-02-09"];
    expect(visits.rows.map((r: any) => r.scheduled_date)).toEqual(dates);
    expect(visits.rows.every((r: any) => r.scheduled_time === "10:00")).toBe(true);
    const grid = await loadProtocolRasGrid({ id: 1, schedulingMode: "exact" }, [95, 94]);
    expect(grid?.map(row => row.date)).toEqual(dates);
    expect(grid?.[1].counters).toEqual([null, "1/3"]);
    expect(grid?.at(-1)?.counters).toEqual([null, "3/3"]);
    expect(sendProtocolOnboardingEmail).toHaveBeenCalledTimes(1);
    expect((await validate()).status).toBe(200);
    expect((await state.pool.query("SELECT count(*)::int AS n FROM sessions")).rows[0].n).toBe(8);
  });
  it("criação pela interface salva modo, horário e início individual sem valores inventados", async () => {
    // Separate synthetic protocol; real HTTP route and real SQL persistence.
    const response = await request(app).post("/api/protocols")
      .set("Authorization", "Bearer synthetic-session")
      .send({
        clientId: 96, title: "Protocolo sintético por datas", startDate: "2030-01-07",
        status: "suggested", serviceType: "clinic", totalValue: 0,
        schedulingMode: "exact", scheduledTime: "10:00",
        items: [
          { substanceId: 95, dose: "dose sintética A", totalSessions: 5, intervalDays: 7, frequency: "weekly", startDate: "2030-01-07" },
          { substanceId: 94, dose: "dose sintética B", totalSessions: 3, intervalDays: 14, frequency: "custom", startDate: "2030-01-12" },
        ],
      });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const record = await state.pool.query("SELECT scheduling_mode, scheduled_time FROM protocols WHERE id=$1", [response.body.id]);
    expect(record.rows[0]).toEqual({ scheduling_mode: "exact", scheduled_time: "10:00" });
    const saved = await state.pool.query("SELECT start_date FROM protocol_items WHERE protocol_id=$1 ORDER BY start_date", [response.body.id]);
    expect(saved.rows.map((r: any) => r.start_date)).toEqual(["2030-01-07", "2030-01-12"]);
  });
  it("erro real no banco reverte todas as sessões e o status", async () => {
    await state.pool.query(`CREATE OR REPLACE FUNCTION synthetic_failure_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER synthetic_failure BEFORE INSERT ON substance_applications FOR EACH ROW EXECUTE FUNCTION synthetic_failure_fn()`);
    expect((await validate()).status).toBe(500);
    const count = await state.pool.query("SELECT count(*)::int AS n FROM sessions");
    expect(count.rows[0].n).toBe(0);
    const protocol = await state.pool.query("SELECT status FROM protocols WHERE id=1");
    expect(protocol.rows[0].status).toBe("suggested");
    expect(sendProtocolOnboardingEmail).not.toHaveBeenCalled();
  });
});
