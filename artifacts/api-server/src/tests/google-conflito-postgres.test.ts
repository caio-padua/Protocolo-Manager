import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

// Conflito de edição concorrente com o Google: o sistema nunca sobrescreve em silêncio.
// Dados 100% sintéticos, banco isolado e Google simulado no nível do pacote googleapis (a lógica real roda).

const state = vi.hoisted(() => ({ database: null as any, podeGerir: true }));
const calls = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), get: vi.fn(), remove: vi.fn() }));
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    calendar: () => ({ events: { insert: calls.insert, update: calls.update, get: calls.get, delete: calls.remove } }),
  },
}));
vi.mock("../lib/google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/google-calendar")>()),
  verifyClinicAccount: vi.fn(async () => ({ ok: true, account: "conta-sintetica" })),
}));
vi.mock("../lib/agenda-governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/agenda-governance")>()),
  mayManageAgendaEmpresa: vi.fn(async () => state.podeGerir),
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
  professionalEmpresasTable, professionalsTable, protocolItemsTable, protocolsTable, sessionsTable, substanceApplicationsTable, substancesTable,
} from "@workspace/db/schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { AGENDA_GOOGLE_CONFLITOS_E_RECURSOS_DDL } from "../lib/agenda-integracao-schema";
import { refreshAfterApplication, refreshSessionEventInPlace } from "../lib/session-google-sync";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import conflitosRouter from "../routes/agenda-google-conflitos";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), tenantContextMiddleware, conflitosRouter);
const auth = `Bearer ${createCollaboratorToken({ professionalId: 101, role: "medico", credentialVersion: 0 })}`;
const row = async (sql: string, values: unknown[] = []) => (await isolated.pool.query(sql, values)).rows[0];
const all = async (sql: string, values: unknown[] = []) => (await isolated.pool.query(sql, values)).rows;
const CAL = "calendario-sintetico";

function createTableSql(table: any) {
  const definition = getTableConfig(table);
  const columns = definition.columns.map((column) => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const defaultNow = ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : "";
    return `"${column.name}" ${column.getSQLType()}${defaultNow}`;
  });
  return `CREATE TABLE "${definition.name}" (${columns.join(", ")});`;
}

/** Estado do evento no Google logo depois de o sistema gravá-lo (o que events.get devolveria). */
function remotoGravado(body: any) {
  return {
    status: "confirmed", summary: body.summary, description: body.description,
    start: { dateTime: body.start.dateTime }, end: { dateTime: body.end.dateTime },
    extendedProperties: body.extendedProperties,
  };
}
const movidoNoGoogle = (remoto: any) => ({
  ...remoto, start: { dateTime: "2030-01-07T15:00:00-03:00" }, end: { dateTime: "2030-01-07T15:20:00-03:00" },
});

beforeAll(async () => {
  process.env.REPL_IDENTITY = "identidade-sintetica";
  process.env.REPLIT_CONNECTORS_HOSTNAME = "conectores.example.invalid";
  vi.stubGlobal("fetch", vi.fn(async () => ({
    json: async () => ({ items: [{ connector_name: "google-calendar", settings: { access_token: "token-sintetico", expires_at: null } }] }),
  })));
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [empresasTable, professionalsTable, locationsTable, locationProfessionalsTable,
    clientsTable, protocolsTable, protocolItemsTable, sessionsTable, substanceApplicationsTable, substancesTable, agendaResourcesTable,
    professionalEmpresasTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(AGENDA_GOOGLE_CONFLITOS_E_RECURSOS_DDL);
  await isolated.pool.query(`
    INSERT INTO empresas (id, ativa, status) VALUES (5,true,'ATIVO'),(6,true,'ATIVO');
    INSERT INTO locations (id, empresa_id, active, name, address, phone) VALUES (8,5,'true','Local sintético',NULL,NULL);
    INSERT INTO professionals (id, name, role, category, active, credential_version, empresa_id, is_platform_owner)
      VALUES (101,'Profissional sintético','medico','medico',true,0,5,false);
    INSERT INTO location_professionals (location_id, professional_id, role) VALUES (8,101,'executor');
    INSERT INTO clients (id, name, status, empresa_id, location_id) VALUES (1,'Cliente sintético','active',5,8);
    INSERT INTO protocols (id, client_id, empresa_id, title, status) VALUES (1,1,5,'Protocolo sintético','validated');
    INSERT INTO substances (id, name, color, procedure_type) VALUES (1,'Substância sintética','#000000','im');
    INSERT INTO agenda_resources (id, name, kind, location_id, google_calendar_id, active)
      VALUES (1,'Agenda sintética','enfermagem',8,'${CAL}',true);
    INSERT INTO sessions (id,protocol_id,client_id,empresa_id,scheduled_date,scheduled_time,status,week_number,agenda_archived,resource_id,duration_minutes)
      VALUES (1,1,1,5,'2030-01-07','09:00','scheduled',1,false,1,20),
             (2,1,1,5,'2030-01-14','09:00','scheduled',2,false,1,20);
    UPDATE sessions SET google_event_id = 'evento-' || id, google_calendar_id = '${CAL}';
    INSERT INTO substance_applications (id,session_id,substance_id,dose,session_number,total_sessions,status,availability)
      VALUES (1,1,1,'Dose A',1,3,'pending','disp'), (2,2,1,'Dose A',1,3,'pending','disp');
  `);
}, 60000);

afterAll(async () => {
  state.database = null;
  vi.unstubAllGlobals();
  if (isolated) await isolated.stop();
}, 60000);

beforeEach(async () => {
  for (const fn of Object.values(calls)) fn.mockReset();
  calls.update.mockResolvedValue({ data: {} });
  calls.get.mockResolvedValue({ data: { status: "confirmed" } });
  state.podeGerir = true;
  await isolated.pool.query("DELETE FROM agenda_google_conflitos");
  await isolated.pool.query("UPDATE sessions SET google_sync_pending_operation=NULL, google_sync_pending_event_id=NULL, google_sync_pending_calendar_id=NULL");
});

/** Primeiro envio normal (evento ainda sem alteração remota) para descobrir o que o sistema grava, e devolve o remoto "movido". */
async function prepararRemotoMovido(sessionId: number) {
  const primeiro = await refreshSessionEventInPlace(sessionId, 5, { releaseUpdateFailure: true });
  expect(primeiro?.status).toBe("sincronizado");
  const gravado = remotoGravado(calls.update.mock.calls.at(-1)![0].requestBody);
  calls.update.mockClear();
  calls.get.mockResolvedValue({ data: movidoNoGoogle(gravado) });
  return gravado;
}

describe("Conflito com o Google — nunca sobrescrever em silêncio", () => {
  it("C1: alguém moveu o evento no Google: a atualização é bloqueada, nada é gravado, a reserva é devolvida e o conflito é registrado", async () => {
    await prepararRemotoMovido(1);
    const resultado = await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    expect(resultado).toMatchObject({ status: "falhou", code: "google_conflito" });
    expect(calls.update).not.toHaveBeenCalled();
    expect(calls.insert).not.toHaveBeenCalled();
    expect(await row("SELECT google_event_id, google_sync_pending_operation AS pop FROM sessions WHERE id=1"))
      .toMatchObject({ google_event_id: "evento-1", pop: null });
    const conflitos = await all("SELECT * FROM agenda_google_conflitos WHERE sessao_id=1");
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]).toMatchObject({ estado: "aberto", tipo: "alterado", google_event_id: "evento-1", empresa_id: 5 });
    expect(conflitos[0].remoto_inicio).toBe("2030-01-07T18:00:00.000Z");
    // Nunca guarda título, nome de cliente ou CPF na trilha.
    expect(JSON.stringify(conflitos)).not.toContain("sintético");
  });

  it("C2: repetir a tentativa não duplica o registro do conflito", async () => {
    await prepararRemotoMovido(1);
    await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    expect((await row("SELECT count(*)::int AS n FROM agenda_google_conflitos WHERE sessao_id=1 AND estado='aberto'")).n).toBe(1);
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("C3: o registro clínico vale e o aviso diz que o Google foi alterado e que há decisão pendente", async () => {
    await prepararRemotoMovido(1);
    const aviso = await refreshAfterApplication(1, 5);
    expect(aviso).toContain("alterado direto no Google");
    expect(aviso).toContain("Conflitos com o Google");
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("C4: listar mostra o conflito da empresa, sem título/cliente, e outra empresa não vê", async () => {
    await prepararRemotoMovido(1);
    await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    const r = await request(app).get("/agenda/google/conflitos").set("Authorization", auth);
    expect(r.status, r.text).toBe(200);
    expect(r.body.conflitos).toHaveLength(1);
    expect(r.body.conflitos[0]).toMatchObject({ sessaoId: 1, tipo: "alterado", estado: "aberto", agenda: "Agenda sintética" });
    expect(JSON.stringify(r.body)).not.toContain("sintético\"");
    expect(JSON.stringify(r.body)).not.toMatch(/titulo|clientName|cpf/i);
    await isolated.pool.query("UPDATE agenda_google_conflitos SET empresa_id=6");
    const outra = await request(app).get("/agenda/google/conflitos").set("Authorization", auth);
    expect(outra.body.conflitos).toHaveLength(0);
  });

  it("C5: sem autorização de gestão da agenda: 403 e nada muda", async () => {
    await prepararRemotoMovido(1);
    await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    state.podeGerir = false;
    const id = (await row("SELECT id FROM agenda_google_conflitos")).id;
    const r = await request(app).post(`/agenda/google/conflitos/${id}/resolver`).set("Authorization", auth)
      .send({ decisao: "enviar_sistema", confirmar: true });
    expect(r.status).toBe(403);
    expect(calls.update).not.toHaveBeenCalled();
    expect((await row("SELECT estado FROM agenda_google_conflitos WHERE id=$1", [id])).estado).toBe("aberto");
  });

  it("C6: decidir exige confirmação explícita e decisão válida", async () => {
    await prepararRemotoMovido(1);
    await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    const id = (await row("SELECT id FROM agenda_google_conflitos")).id;
    const semConfirmar = await request(app).post(`/agenda/google/conflitos/${id}/resolver`).set("Authorization", auth).send({ decisao: "enviar_sistema" });
    expect(semConfirmar.status).toBe(400);
    const invalida = await request(app).post(`/agenda/google/conflitos/${id}/resolver`).set("Authorization", auth).send({ decisao: "apagar", confirmar: true });
    expect(invalida.status).toBe(400);
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("C7: 'enviar o do sistema' grava no MESMO evento (mesmo identificador, sem criar outro), fecha o conflito e registra o autor", async () => {
    await prepararRemotoMovido(1);
    await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    const id = (await row("SELECT id FROM agenda_google_conflitos")).id;
    const r = await request(app).post(`/agenda/google/conflitos/${id}/resolver`).set("Authorization", auth)
      .send({ decisao: "enviar_sistema", confirmar: true });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ ok: true, estado: "resolvido" });
    expect(calls.update).toHaveBeenCalledTimes(1);
    expect(calls.update.mock.calls[0][0]).toMatchObject({ calendarId: CAL, eventId: "evento-1", sendUpdates: "none" });
    expect(calls.insert).not.toHaveBeenCalled();
    expect(await row("SELECT estado, decisao, ator_id FROM agenda_google_conflitos WHERE id=$1", [id]))
      .toMatchObject({ estado: "resolvido", decisao: "enviar_sistema", ator_id: 101 });
    const repetido = await request(app).post(`/agenda/google/conflitos/${id}/resolver`).set("Authorization", auth)
      .send({ decisao: "enviar_sistema", confirmar: true });
    expect(repetido.status).toBe(409);
    expect(calls.update).toHaveBeenCalledTimes(1);
  });

  it("C8: falha do Google ao enviar por decisão humana: conflito continua ABERTO e nada é dito como resolvido", async () => {
    await prepararRemotoMovido(1);
    await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    const id = (await row("SELECT id FROM agenda_google_conflitos")).id;
    calls.update.mockRejectedValueOnce(new Error("detalhe interno do Google"));
    const r = await request(app).post(`/agenda/google/conflitos/${id}/resolver`).set("Authorization", auth)
      .send({ decisao: "enviar_sistema", confirmar: true });
    expect(r.status).toBeGreaterThanOrEqual(409);
    expect(r.body.error).toContain("continua aberto");
    expect(JSON.stringify(r.body)).not.toContain("detalhe interno");
    expect((await row("SELECT estado FROM agenda_google_conflitos WHERE id=$1", [id])).estado).toBe("aberto");
  });

  it("C9: 'dispensar' mantém o Google como está e não envia nada; a próxima atualização volta a ser bloqueada", async () => {
    await prepararRemotoMovido(1);
    await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    const id = (await row("SELECT id FROM agenda_google_conflitos")).id;
    const r = await request(app).post(`/agenda/google/conflitos/${id}/resolver`).set("Authorization", auth)
      .send({ decisao: "dispensar", confirmar: true });
    expect(r.status, r.text).toBe(200);
    expect(r.body.estado).toBe("dispensado");
    expect(calls.update).not.toHaveBeenCalled();
    const outra = await refreshSessionEventInPlace(1, 5, { releaseUpdateFailure: true });
    expect(outra).toMatchObject({ code: "google_conflito" });
    expect((await all("SELECT estado FROM agenda_google_conflitos WHERE sessao_id=1 ORDER BY id")).map((c) => c.estado))
      .toEqual(["dispensado", "aberto"]);
  });

  it("C10: evento apagado no Google vira conflito 'apagado' e NÃO é recriado", async () => {
    calls.get.mockResolvedValue({ data: { status: "cancelled" } });
    const resultado = await refreshSessionEventInPlace(2, 5, { releaseUpdateFailure: true });
    expect(resultado).toMatchObject({ status: "falhou", code: "google_conflito" });
    expect(calls.update).not.toHaveBeenCalled();
    expect(calls.insert).not.toHaveBeenCalled();
    expect((await row("SELECT tipo FROM agenda_google_conflitos WHERE sessao_id=2")).tipo).toBe("apagado");
  });

  it("C11: evento legado sem marca segue (sem base para provar edição) e passa a levar a marca", async () => {
    calls.get.mockResolvedValue({ data: { status: "confirmed" } });
    const resultado = await refreshSessionEventInPlace(2, 5, { releaseUpdateFailure: true });
    expect(resultado?.status).toBe("sincronizado");
    expect(calls.update.mock.calls[0][0].requestBody.extendedProperties.private.paxterFp).toMatch(/^[0-9a-f]{24}$/);
    expect(await all("SELECT 1 FROM agenda_google_conflitos")).toHaveLength(0);
  });
});
