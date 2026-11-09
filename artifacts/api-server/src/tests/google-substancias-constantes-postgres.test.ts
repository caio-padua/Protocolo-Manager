import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { eq } from "drizzle-orm";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

// K7: o protocolo completo fica constante no evento do Google e na tela da agenda.
// Dados 100% sintéticos, banco isolado e Google simulado (nenhuma chamada real).

const state = vi.hoisted(() => ({ database: null as any }));
const google = vi.hoisted(() => ({
  verify: vi.fn(async () => ({ ok: true, account: "conta-sintetica" })),
  create: vi.fn(async (data: { eventId?: string }) => data.eventId ?? null),
  update: vi.fn(async (_eventId: string, _calendarId: string, _data: any, _options?: { timeoutMs?: number }) => undefined),
  remove: vi.fn(async () => undefined),
  exists: vi.fn(async () => true),
}));
vi.mock("../lib/google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/google-calendar")>()),
  verifyClinicAccount: google.verify,
  createCalendarEvent: google.create,
  updateCalendarEvent: google.update,
  deleteCalendarEvent: google.remove,
  calendarEventExists: google.exists,
}));
vi.mock("../lib/clinical-emitter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/clinical-emitter")>()),
  // O vínculo clínico real não é o assunto desta suíte: o chamador sintético pertence à empresa 5.
  resolveClinicalMember: vi.fn(async () => ({ clinic: { id: 1, empresaId: 5 } })),
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
import {
  agendaResourcesTable, clientsTable, empresasTable, locationProfessionalsTable, locationsTable,
  professionalEmpresasTable, professionalsTable, protocolItemsTable, protocolsTable, sessionsTable,
  substanceApplicationsTable, substancesTable,
} from "@workspace/db/schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { buildDescriptionBody } from "../lib/google-calendar";
import { refreshAfterApplication } from "../lib/session-google-sync";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import sessionsRouter from "../routes/sessions";
import googleCalendarRouter from "../routes/google-calendar";
import { CalendarSyncUncertain, reconcilePendingEvent, syncReservedEvent } from "../lib/session-google-sync";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), tenantContextMiddleware, sessionsRouter, googleCalendarRouter);
const auth = `Bearer ${createCollaboratorToken({ professionalId: 101, role: "medico", credentialVersion: 0 })}`;
const lastText = () => buildDescriptionBody(google.update.mock.calls.at(-1)![2]);
const WHITE = "\u2B1C";

function createTableSql(table: any) {
  const definition = getTableConfig(table);
  const columns = definition.columns.map((column) => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const defaultNow = ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : "";
    return `"${column.name}" ${column.getSQLType()}${defaultNow}`;
  });
  return `CREATE TABLE "${definition.name}" (${columns.join(", ")});`;
}

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [empresasTable, professionalsTable, locationsTable, locationProfessionalsTable,
    clientsTable, protocolsTable, protocolItemsTable, sessionsTable, substanceApplicationsTable, substancesTable,
    agendaResourcesTable, professionalEmpresasTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(`
    INSERT INTO empresas (id, ativa, status) VALUES (5,true,'ATIVO');
    INSERT INTO locations (id, empresa_id, active, name, address, phone) VALUES (8,5,'true','Local sintético',NULL,NULL);
    INSERT INTO professionals (id, name, role, category, active, credential_version, empresa_id, is_platform_owner)
      VALUES (101,'Profissional sintético','medico','medico',true,0,5,false);
    INSERT INTO location_professionals (location_id, professional_id, role) VALUES (8,101,'executor');
    INSERT INTO clients (id, name, status, empresa_id, location_id) VALUES (1,'Cliente sintético','active',5,8);
    INSERT INTO protocols (id, client_id, empresa_id, title, status)
      VALUES (1,1,5,'Protocolo com itens','validated'), (2,1,5,'Outro protocolo','validated'), (3,1,5,'Protocolo sem itens','validated');
    INSERT INTO substances (id, name, color, procedure_type) VALUES
      (1,'Substância A','#111111','im'), (2,'Substância B','#222222','im'),
      (3,'Substância C','#333333','im'), (4,'Substância D','#444444','im');
    INSERT INTO protocol_items (protocol_id, substance_id, dose, total_sessions, start_date) VALUES
      (1,1,'Dose A',3,'2030-01-07'), (1,2,'Dose B',4,'2030-01-07'), (1,3,'Dose C',5,'2030-01-07'),
      (1,3,'Dose C repetida',9,'2030-01-07'), (1,99,'Dose X',2,'2030-01-07'),
      (2,4,'Dose D',6,'2030-01-07'), (4,3,'Dose de outra empresa',7,'2030-01-07');
    INSERT INTO agenda_resources (id, name, kind, location_id, google_calendar_id, active)
      VALUES (1,'Agenda sintética','enfermagem',8,'calendario-sintetico',true);
    INSERT INTO sessions (id,protocol_id,client_id,empresa_id,scheduled_date,scheduled_time,status,week_number,agenda_archived,resource_id,duration_minutes)
      VALUES (1,1,1,5,'2030-01-07','09:00','scheduled',1,false,1,20),
             (2,3,1,5,'2030-01-14','09:00','scheduled',1,false,1,20),
             (3,2,1,5,'2030-01-21','09:00','scheduled',1,false,1,20),
             (4,4,1,5,'2030-01-28','09:00','scheduled',1,false,1,20);
    UPDATE sessions SET google_event_id = 'evento-' || id, google_calendar_id = 'calendario-sintetico';
    INSERT INTO substance_applications (id,session_id,substance_id,dose,session_number,total_sessions,status,availability)
      VALUES (1,1,1,'Dose A',1,3,'pending','disp'),
             (2,1,2,'Dose B',0,4,'pending','prox'),
             (3,2,1,'Dose A',1,3,'pending','disp'),
             (4,3,1,'Dose A',1,3,'pending','disp'),
             (5,4,1,'Dose A',1,3,'pending','disp');
  `);
}, 60000);

afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60000);

beforeEach(() => {
  google.verify.mockReset(); google.verify.mockResolvedValue({ ok: true, account: "conta-sintetica" });
  google.update.mockReset(); google.update.mockResolvedValue(undefined);
});

describe("K7 — protocolo completo constante no Google e na tela", () => {
  it("T-K7-3: evento lista as constantes ([INDI], sem duplicar), mostra X de Y e não tira a visita do estado devido", async () => {
    expect(await refreshAfterApplication(1, 5)).toBeUndefined();
    const text = lastText();
    expect(text).toContain("NESTA VISITA: 1 de 4 substâncias do protocolo");
    expect(text).toContain("\uD83D\uDFE9 [1/3] Substância A Dose A [DISP]");
    expect(text).toContain("\uD83D\uDFE8 [–/4] Substância B Dose B [PROX]");
    expect(text).toContain(`${WHITE} [–/5] Substância C Dose C [INDI]`);
    expect(text).not.toContain("Dose C repetida");
    expect(text.match(/Substância B Dose B/g)).toHaveLength(1);
    expect(text).not.toContain("Substância D");

    // Aplicar a única substância devida fecha a visita como "Aplicações Realizadas": constante não conta como devida.
    const done = await request(app).post("/sessions/1/confirm-substance").set("Authorization", auth)
      .send({ substanceId: 1, applicationId: 1, confirmed: true });
    expect(done.status, done.text).toBe(200);
    const after = lastText();
    expect(after).toContain("Aplicações Realizadas");
    expect(after).not.toContain("Parcialmente");
    expect(after).toContain("NESTA VISITA: 1 de 4 substâncias do protocolo");
  });

  it("T-K7-5: substância do item sem cadastro aparece de forma explícita e não bloqueia o envio", async () => {
    expect(await refreshAfterApplication(1, 5)).toBeUndefined();
    expect(lastText()).toContain(`${WHITE} [–/2] Substância não cadastrada (99) Dose X [INDI]`);
  });

  it("T-K7-1b: protocolo sem itens gravados mantém o evento como era (sem constantes e sem linha de contagem)", async () => {
    expect(await refreshAfterApplication(2, 5)).toBeUndefined();
    const text = lastText();
    expect(text).not.toContain("NESTA VISITA");
    // A legenda sempre cita [INDI]; a LISTA de substâncias é que não pode ter constante.
    const list = text.slice(text.indexOf("SUBSTÂNCIAS PROTOCOLO:"), text.indexOf("LEGENDA:"));
    expect(list).not.toContain("[INDI]");
    expect(list).toContain("[1/3] Substância A Dose A [DISP]");
  });

  it("T-K7-4 e T-K7-6: a tela recebe o mesmo resumo; itens de outro protocolo não vazam", async () => {
    const one = await request(app).get("/sessions/1").set("Authorization", auth);
    expect(one.status, one.text).toBe(200);
    expect(one.body.protocolSummary).toEqual({
      visitCount: 1, protocolCount: 4,
      constants: [
        { substanceId: 3, substanceName: "Substância C", substanceColor: "#333333", dose: "Dose C", totalSessions: 5 },
        { substanceId: 99, substanceName: "Substância não cadastrada (99)", substanceColor: "#888888", dose: "Dose X", totalSessions: 2 },
      ],
    });
    expect(JSON.stringify(one.body.protocolSummary)).not.toContain("Substância D");
    // As linhas reais da visita continuam exatamente as gravadas (nada é acrescentado ao banco nem às aplicações).
    expect(one.body.substanceApplications).toHaveLength(2);
    expect((await isolated.pool.query("SELECT count(*)::int AS n FROM substance_applications")).rows[0].n).toBe(5);

    const list = await request(app).get("/sessions?protocolId=1").set("Authorization", auth);
    expect(list.status, list.text).toBe(200);
    expect(list.body[0].protocolSummary.constants.map((c: any) => c.substanceId)).toEqual([3, 99]);

    const bare = await request(app).get("/sessions/2").set("Authorization", auth);
    expect(bare.body.protocolSummary).toBeNull();
  });

  it("T-K7-7: linha da visita sem item no protocolo entra no Y; o X nunca passa do Y", async () => {
    // Visita 3: protocolo 2 tem só o item da substância D; a visita traz a substância A (sem item).
    const res = await request(app).get("/sessions/3").set("Authorization", auth);
    expect(res.status, res.text).toBe(200);
    expect(res.body.protocolSummary.visitCount).toBe(1);
    expect(res.body.protocolSummary.protocolCount).toBe(2);
    expect(res.body.protocolSummary.constants.map((c: any) => c.substanceId)).toEqual([4]);
  });

  it("T-K7-8: protocolo de OUTRA empresa nunca é lido, nem na tela nem no Google (fecha sem expor)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const res = await request(app).get("/sessions/4").set("Authorization", auth);
      expect(res.status, res.text).toBe(200);
      expect(res.body.protocolSummary).toBeNull();
      expect(JSON.stringify(res.body)).not.toContain("Dose de outra empresa");
      expect(await refreshAfterApplication(4, 5)).toBeUndefined();
      expect(lastText()).not.toContain("NESTA VISITA");
      expect(lastText()).not.toContain("Dose de outra empresa");
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it("T-K7-9: o protocolo mudou entre a leitura e a reserva: nada é enviado e a reserva é devolvida", async () => {
    const { rows: [session] } = await isolated.pool.query("SELECT * FROM sessions WHERE id=1");
    const live = await state.database.select().from(sessionsTable).where(eq(sessionsTable.id, 1));
    const apps = await state.database.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, 1));
    expect(session.id).toBe(1);
    const stale = [{ substanceId: 1, dose: "Dose A", totalSessions: 3 }]; // composição antiga: faltam itens
    google.update.mockClear();
    await expect(syncReservedEvent(live[0], { calendarId: "calendario-sintetico" } as any, apps, { expectedProtocolItems: stale }))
      .rejects.toBeInstanceOf(CalendarSyncUncertain);
    expect(google.update).not.toHaveBeenCalled();
    const { rows: [after] } = await isolated.pool.query("SELECT google_sync_pending_operation AS pop FROM sessions WHERE id=1");
    expect(after.pop).toBeNull();
  });

  it("T-K7-10: o envio por sessão (botão de sincronizar da agenda) também leva todo o protocolo", async () => {
    google.update.mockClear();
    const res = await request(app).post("/google-calendar/sync-session/1").set("Authorization", auth).send({});
    expect(res.status, res.text).toBe(200);
    const text = buildDescriptionBody(google.update.mock.calls.at(-1)![2]);
    expect(text).toContain("NESTA VISITA: 1 de 4 substâncias do protocolo");
    expect(text).toContain(`${WHITE} [–/5] Substância C Dose C [INDI]`);
    expect(text).toContain(`${WHITE} [–/2] Substância não cadastrada (99) Dose X [INDI]`);
  });

  /** Faz a N-ésima leitura do banco falhar (as anteriores são reais), para provar a devolução da reserva. */
  const failNthSelect = (n: number) => {
    const real = state.database.select.bind(state.database);
    let calls = 0;
    return vi.spyOn(state.database, "select").mockImplementation(((...args: unknown[]) => {
      calls += 1;
      if (calls === n) throw new Error("falha sintética de leitura");
      return (real as any)(...args);
    }) as any);
  };

  it("T-K7-11: leitura que falha DEPOIS da reserva e ANTES do envio devolve a reserva e não chama o Google", async () => {
    const [live] = await state.database.select().from(sessionsTable).where(eq(sessionsTable.id, 1));
    const apps = await state.database.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, 1));
    const items = [{ substanceId: 1, dose: "x", totalSessions: 1 }];
    google.update.mockClear();
    // Leituras após a reserva: 1 sessão, 2 aplicações, 3 protocolo (itens). Cada uma falha uma vez.
    for (const n of [1, 2, 3]) {
      const spy = failNthSelect(n);
      try {
        await expect(syncReservedEvent(live, { calendarId: "calendario-sintetico" } as any, apps, { expectedProtocolItems: items }))
          .rejects.toThrow("falha sintética de leitura");
      } finally { spy.mockRestore(); }
      const { rows: [after] } = await isolated.pool.query("SELECT google_sync_pending_operation AS pop FROM sessions WHERE id=1");
      expect(after.pop, `leitura ${n}`).toBeNull();
    }
    expect(google.update).not.toHaveBeenCalled();
  });

  it("T-K7-12: conferência de reserva incerta cuja releitura falha restaura a reserva anterior (continua incerta)", async () => {
    await isolated.pool.query(`UPDATE sessions SET google_sync_pending_operation='operacao-incerta',
      google_sync_pending_event_id='evento-3', google_sync_pending_calendar_id='calendario-sintetico' WHERE id=3`);
    const [live] = await state.database.select().from(sessionsTable).where(eq(sessionsTable.id, 3));
    const apps = await state.database.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, 3));
    google.update.mockClear(); google.create.mockClear();
    try {
      for (const n of [1, 2, 3]) {
        const spy = failNthSelect(n);
        try {
          await expect(reconcilePendingEvent(live, { calendarId: "calendario-sintetico" } as any, apps, [{ substanceId: 4, dose: "x", totalSessions: 1 }]))
            .rejects.toThrow("falha sintética de leitura");
        } finally { spy.mockRestore(); }
        const { rows: [after] } = await isolated.pool.query("SELECT google_sync_pending_operation AS pop FROM sessions WHERE id=3");
        expect(after.pop, `leitura ${n}`).toBe("operacao-incerta");
      }
      expect(google.update).not.toHaveBeenCalled();
      expect(google.create).not.toHaveBeenCalled();
    } finally {
      await isolated.pool.query(`UPDATE sessions SET google_sync_pending_operation=NULL,
        google_sync_pending_event_id=NULL, google_sync_pending_calendar_id=NULL WHERE id=3`);
    }
  });
});

