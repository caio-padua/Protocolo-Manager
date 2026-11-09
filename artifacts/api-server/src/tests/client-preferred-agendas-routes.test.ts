import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_target, key) {
      // O módulo legado da rota executa migrações ao ser importado: os testes
      // nunca devem aplicá-las a qualquer banco configurado da aplicação.
      if (!state.database && key === "execute") return async () => ({ rows: [] });
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  });
  return { ...schema, db };
});
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn(), isWhatsappConfigured: vi.fn() }));
vi.mock("../lib/email-service", () => ({ sendTelegramOnboardingEmail: vi.fn() }));
vi.mock("../lib/telegram-magic-link", () => ({ emitirLinkMagico: vi.fn() }));
vi.mock("../routes/agentes-integracoes", () => ({ logIntegracao: vi.fn() }));

import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, clientPreferredAgendasTable, clientVisitPreferenceRevisionsTable, clientsTable, empresasTable, clientClinicAgendaDefaultsTable,
  locationProfessionalsTable, locationsTable, professionalsTable,
} from "@workspace/db/schema";
import { readFileSync } from "node:fs";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import clientsRouter from "../routes/clients";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), tenantContextMiddleware, clientsRouter);
const collaborator = createCollaboratorToken({ professionalId: 101, role: "admin", credentialVersion: 0 });
const otherCompany = createCollaboratorToken({ professionalId: 102, role: "admin", credentialVersion: 0 });

function createTableSql(table: any, extras = "") {
  const definition = getTableConfig(table);
  const columns = definition.columns.map((column) => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const defaultNow = ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : "";
    return `"${column.name}" ${column.getSQLType()}${defaultNow}`;
  });
  return `CREATE TABLE "${definition.name}" (${columns.join(", ")}${extras});`;
}

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [clientsTable, professionalsTable, empresasTable, locationsTable, locationProfessionalsTable, agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, clientVisitPreferenceRevisionsTable, clientClinicAgendaDefaultsTable]) {
    await isolated.pool.query(createTableSql(table));
  }
  await isolated.pool.query(createTableSql(clientPreferredAgendasTable, ", UNIQUE(client_id, agenda_resource_id)"));
  await isolated.pool.query(`
    INSERT INTO empresas (id, nome, tipo, ativa, status, razao_social) VALUES
      (5, 'Clínica A', 'clinic', true, 'ATIVO', 'Clínica A Ltda'),
      (6, 'Clínica B', 'clinic', true, 'ATIVO', 'Clínica B Ltda'),
      (7, 'Clínica C', 'clinic', true, 'ATIVO', 'Clínica C Ltda'),
      (8, 'Clínica inativa', 'clinic', false, 'ATIVO', 'Inativa Ltda'),
      (9, 'Laboratório', 'genesis_seed', true, 'ATIVO', 'Laboratório Ltda');
    INSERT INTO professionals (id, role, category, active, credential_version, empresa_id, is_platform_owner)
      VALUES (101, 'admin', 'admin', true, 0, 5, false), (102, 'admin', 'admin', true, 0, 6, false);
    INSERT INTO locations (id, empresa_id, active) VALUES (8, 5, 'true'), (9, 6, 'true');
    INSERT INTO agenda_resources (id, name, kind, slot_minutes, location_id, active) VALUES
      (11, 'Enfermagem sintética', 'enfermagem', 20, 8, true),
      (12, 'Médico sintético', 'medico', 60, 8, true),
      (13, 'Outra empresa', 'enfermagem', 20, 9, true);
    INSERT INTO agenda_windows (resource_id, weekday, start_time, end_time, active) VALUES
      (11,1,'09:00','13:00',true), (11,1,'14:00','16:00',true),
      (12,1,'09:00','12:00',true), (13,1,'10:00','12:00',true);
    INSERT INTO agenda_settings (id, block_minutes, trigger_percent, min_lead_hours) VALUES (1,120,60,24);
  `);
}, 60000);

afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60000);

describe("Cadastro de cliente e agendas preferenciais", () => {
  let clientId = 0;
  const base = {
    name: "Cliente sintético", cpf: "12345678901", email: "teste@example.invalid",
    phone: "11999999999", status: "active", locationId: 8, preferredAgendaResourceIds: [11],
  };

  it("exige colaborador e cadastra a preferência junto com o cliente", async () => {
    expect((await request(app).post("/clients").send(base)).status).toBe(401);
    expect((await request(app).post("/clients").send({ name: base.name })).status).toBe(401);
    expect((await request(app).get("/clients")).status).toBe(401);
    const created = await request(app).post("/clients")
      .set("Authorization", `Bearer ${collaborator}`).send(base);
    expect(created.status).toBe(201);
    clientId = created.body.id;
    expect(created.body.preferredAgendaResourceIds).toEqual([11]);
    await isolated.pool.query(
      "UPDATE clients SET password_hash=$1, password_set_token=$2, telegram_magic_token=$3, validation_password=$4 WHERE id=$5",
      ["hash-sintetico", "redefinicao-sintetica", "telegram-sintetico", "validacao-sintetica", clientId],
    );
  });

  it("altera, relê e limpa as preferências sem excluir o histórico", async () => {
    const changed = await request(app).put(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`).send({ preferredAgendaResourceIds: [12] });
    expect(changed.status).toBe(200);
    expect(changed.body.preferredAgendaResourceIds).toEqual([12]);
    const read = await request(app).get(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`);
    expect(read.body.preferredAgendaResourceIds).toEqual([12]);
    expect(read.body.hasValidationPassword).toBe(true);
    for (const field of ["validationPassword", "passwordHash", "passwordSetToken", "telegramMagicToken"]) {
      expect(read.body).not.toHaveProperty(field);
    }
    expect((await request(app).get(`/clients/${clientId}`)).status).toBe(401);
    expect((await request(app).patch(`/clients/${clientId}`).send({ name: "Alteração não autorizada" })).status).toBe(401);
    expect((await request(app).put(`/clients/${clientId}`).send({ name: "Alteração não autorizada" })).status).toBe(401);
    const list = await request(app).get("/clients").set("Authorization", `Bearer ${collaborator}`);
    expect(list.body[0]).not.toHaveProperty("passwordHash");
    expect(list.body[0]).not.toHaveProperty("telegramMagicToken");
    const cleared = await request(app).patch(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`).send({ preferredAgendaResourceIds: [] });
    expect(cleared.status).toBe(200);
    const entries = await isolated.pool.query(
      "SELECT agenda_resource_id, active FROM client_preferred_agendas WHERE client_id=$1 ORDER BY agenda_resource_id", [clientId],
    );
    expect(entries.rows).toEqual([{ agenda_resource_id: 11, active: false }, { agenda_resource_id: 12, active: false }]);
  });

  it("rejeita agenda de outra empresa sem gravar alteração parcial", async () => {
    await request(app).patch(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`).send({ preferredAgendaResourceIds: [11] });
    const wrong = await request(app).put(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`)
      .send({ name: "Não deve salvar", preferredAgendaResourceIds: [13] });
    expect(wrong.status).toBe(400);
    const read = await request(app).get(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`);
    expect(read.body.name).toBe(base.name);
    expect(read.body.preferredAgendaResourceIds).toEqual([11]);
    const moved = await request(app).patch(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`).send({ locationId: 9 });
    expect(moved.status).toBe(400);
    const reread = await request(app).get(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`);
    expect(reread.body.locationId).toBe(8);
    expect(reread.body.preferredAgendaResourceIds).toEqual([11]);
    const foreign = await request(app).patch(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${otherCompany}`).send({ preferredAgendaResourceIds: [] });
    expect(foreign.status).toBe(404);
    expect((await request(app).get(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${otherCompany}`)).status).toBe(404);
  });

  it("nega local de outra empresa mesmo sem agendas selecionadas", async () => {
    for (const preferred of [undefined, []]) {
      const candidate = { ...base, name: "Cliente não cadastrado", locationId: 9, preferredAgendaResourceIds: preferred };
      const response = await request(app).post("/clients")
        .set("Authorization", `Bearer ${collaborator}`).send(candidate);
      expect(response.status).toBe(400);
    }
    await request(app).patch(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`).send({ preferredAgendaResourceIds: [] });
    for (const preferred of [undefined, []]) {
      const response = await request(app).patch(`/clients/${clientId}`)
        .set("Authorization", `Bearer ${collaborator}`).send({ locationId: 9, preferredAgendaResourceIds: preferred });
      expect(response.status).toBe(400);
    }
    const rows = await isolated.pool.query("SELECT location_id FROM clients WHERE id=$1", [clientId]);
    expect(rows.rows[0].location_id).toBe(8);
  });

  it("ações em lote exigem acesso e nunca alteram cliente de outra empresa", async () => {
    await isolated.pool.query(
      "INSERT INTO clients (id, name, empresa_id, location_id, status) VALUES (100, 'Cliente Sintético A', 5, 8, 'active'), (101, 'Cliente Sintético B', 6, 9, 'active')",
    );
    expect((await request(app).post("/clients/bulk").send({ ids: [100], action: "deactivate" })).status).toBe(401);
    for (const action of ["activate", "deactivate", "delete", "restore"]) {
      const status = action === "activate" ? "inactive" : "active";
      const deletedAt = action === "restore" ? new Date("2026-01-01T12:00:00Z") : null;
      await isolated.pool.query("UPDATE clients SET status=$1, deleted_at=$2 WHERE id IN (100,101)", [status, deletedAt]);
      const response = await request(app).post("/clients/bulk")
        .set("Authorization", `Bearer ${collaborator}`).send({ ids: [100, 101], action });
      expect(response.status).toBe(200);
      expect(response.body.affected).toBe(1);
      const result = await isolated.pool.query("SELECT id, status, deleted_at FROM clients WHERE id IN (100,101) ORDER BY id");
      expect(result.rows[1].status).toBe(status);
      expect(result.rows[1].deleted_at).toEqual(deletedAt);
      if (action === "activate") expect(result.rows[0].status).toBe("active");
      if (action === "deactivate") expect(result.rows[0].status).toBe("inactive");
      if (action === "delete") expect(result.rows[0].deleted_at).toBeInstanceOf(Date);
      if (action === "restore") expect(result.rows[0].deleted_at).toBeNull();
    }
  });

  it("serializa alterações concorrentes sem misturar escolhas", async () => {
    const results = await Promise.all([11, 12].map((agenda) =>
      request(app).patch(`/clients/${clientId}`)
        .set("Authorization", `Bearer ${collaborator}`).send({ preferredAgendaResourceIds: [agenda] }),
    ));
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const read = await request(app).get(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${collaborator}`);
    expect([[11], [12]]).toContainEqual(read.body.preferredAgendaResourceIds);
  });

  it("oferece somente grades ativas da empresa e protege a leitura", async () => {
    expect((await request(app).get("/clients/visit-preference-options")).status).toBe(401);
    const response = await request(app).get("/clients/visit-preference-options")
      .set("Authorization", `Bearer ${collaborator}`);
    expect(response.status).toBe(200);
    expect(response.body.medical.days).toEqual([{ weekday: 1, times: ["09:00", "10:00", "11:00"] }]);
    expect(response.body.nursing.days[0].times).toContain("14:00");
    expect(response.body.nursing.days[0].times).not.toContain("13:00");
  });

  it("segue a geometria de blocos do motor na criação e alteração", async () => {
    const token = { Authorization: `Bearer ${collaborator}` };
    await isolated.pool.query("UPDATE agenda_settings SET block_minutes=90 WHERE id=1");
    try {
      const options = await request(app).get("/clients/visit-preference-options").set(token);
      expect(options.body.medical.days).toEqual([{ weekday: 1, times: ["09:00", "10:30"] }]);
      const preference = (time: string) => ({
        medical: { weekdays: [1], times: [{ weekday: 1, time }] },
        nursing: { weekdays: [], times: [] },
      });
      const invalidCreate = await request(app).post("/clients").set(token)
        .send({ ...base, name: "Não gravar", visitPreferences: preference("10:00"), visitPreferencesRevision: 0 });
      expect(invalidCreate.status).toBe(400);
      const validCreate = await request(app).post("/clients").set(token)
        .send({ ...base, name: "Cliente sintético bloco", visitPreferences: preference("10:30"), visitPreferencesRevision: 0 });
      expect(validCreate.status).toBe(201);
      const invalidEdit = await request(app).patch(`/clients/${validCreate.body.id}`).set(token)
        .send({ visitPreferences: preference("10:00"), visitPreferencesRevision: validCreate.body.visitPreferencesRevision });
      expect(invalidEdit.status).toBe(400);
    } finally {
      await isolated.pool.query("UPDATE agenda_settings SET block_minutes=120 WHERE id=1");
    }
  });

  it("salva revisões sem perda, impede alterações antigas e recusa horário fora da grade", async () => {
    const token = { Authorization: `Bearer ${collaborator}` };
    const preferences = {
      medical: { weekdays: [1], times: [{ weekday: 1, time: "09:00" }] },
      nursing: { weekdays: [1], times: [{ weekday: 1, time: "14:00" }] },
    };
    const created = await request(app).patch(`/clients/${clientId}`).set(token)
      .send({ visitPreferences: preferences, visitPreferencesRevision: 0 });
    expect(created.status, created.text).toBe(200);
    expect(created.body.visitPreferences).toEqual(preferences);
    const revision = created.body.visitPreferencesRevision;
    expect(revision).toBeGreaterThan(0);
    const reread = await request(app).get(`/clients/${clientId}`).set(token);
    expect(reread.body.visitPreferences).toEqual(preferences);
    expect(reread.body.visitPreferencesRevision).toBe(revision);
    const invalid = structuredClone(preferences);
    invalid.nursing.times = [{ weekday: 1, time: "13:00" }];
    const rejected = await request(app).patch(`/clients/${clientId}`).set(token)
      .send({ name: "Não salvar", visitPreferences: invalid, visitPreferencesRevision: revision });
    expect(rejected.status).toBe(400);
    const empty = { medical: { weekdays: [], times: [] }, nursing: { weekdays: [], times: [] } };
    const writes = await Promise.all([
      request(app).patch(`/clients/${clientId}`).set(token).send({ visitPreferences: empty, visitPreferencesRevision: revision }),
      request(app).patch(`/clients/${clientId}`).set(token).send({ visitPreferences: empty, visitPreferencesRevision: revision }),
    ]);
    expect(writes.map(r => r.status).sort()).toEqual([200, 409]);
    const history = await isolated.pool.query("SELECT preferences FROM client_visit_preference_revisions WHERE client_id=$1 ORDER BY id", [clientId]);
    expect(history.rows.map((r: { preferences: unknown }) => r.preferences)).toEqual([preferences, empty]);
    expect((await request(app).get(`/clients/${clientId}`).set(token)).body.name).toBe(base.name);
  });

  it("preserva três dias de enfermagem e o horário próprio de cada dia", async () => {
    const token = { Authorization: `Bearer ${collaborator}` };
    await isolated.pool.query(`
      INSERT INTO agenda_windows (resource_id, weekday, start_time, end_time, active)
      VALUES (11,3,'09:00','12:00',true), (11,5,'09:00','13:00',true)
    `);
    const preferences = {
      medical: { weekdays: [], times: [] },
      nursing: {
        weekdays: [1, 3, 5],
        times: [
          { weekday: 1, time: "09:20" },
          { weekday: 3, time: "10:00" },
          { weekday: 5, time: "11:20" },
        ],
        priority: [
          { weekday: 5, time: "11:20" },
          { weekday: 1, time: "09:20" },
          { weekday: 3, time: "10:00" },
        ],
      },
    };
    const created = await request(app).post("/clients").set(token)
      .send({ ...base, name: "Cliente sintético com três dias", visitPreferences: preferences, visitPreferencesRevision: 0 });
    expect(created.status, created.text).toBe(201);
    const reread = await request(app).get(`/clients/${created.body.id}`).set(token);
    expect(reread.status).toBe(200);
    expect(reread.body.visitPreferences).toEqual(preferences);
    const legacy = structuredClone(preferences);
    delete (legacy.nursing as { priority?: unknown }).priority;
    const fromLegacy = await request(app).patch(`/clients/${created.body.id}`).set(token)
      .send({ visitPreferences: legacy, visitPreferencesRevision: reread.body.visitPreferencesRevision });
    expect(fromLegacy.status, fromLegacy.text).toBe(200);
    expect(fromLegacy.body.visitPreferences).toEqual(preferences);
    const invalid = structuredClone(preferences);
    invalid.nursing.priority = [{ weekday: 5, time: "09:00" }];
    const rejected = await request(app).patch(`/clients/${created.body.id}`).set(token)
      .send({ visitPreferences: invalid, visitPreferencesRevision: fromLegacy.body.visitPreferencesRevision });
    expect(rejected.status).toBe(400);
    expect((await request(app).get(`/clients/${created.body.id}`).set(token)).body.visitPreferences).toEqual(preferences);
    invalid.nursing.priority = [preferences.nursing.priority[0], preferences.nursing.priority[0]];
    expect((await request(app).patch(`/clients/${created.body.id}`).set(token)
      .send({ visitPreferences: invalid, visitPreferencesRevision: fromLegacy.body.visitPreferencesRevision })).status).toBe(400);
    const legacyRemove = structuredClone(legacy);
    legacyRemove.nursing.weekdays = [1, 3];
    legacyRemove.nursing.times = legacyRemove.nursing.times.filter(t => t.weekday !== 5);
    const removed = await request(app).patch(`/clients/${created.body.id}`).set(token)
      .send({ visitPreferences: legacyRemove, visitPreferencesRevision: fromLegacy.body.visitPreferencesRevision });
    expect(removed.status, removed.text).toBe(200);
    expect(removed.body.visitPreferences.nursing.priority).toEqual(preferences.nursing.priority.slice(1));
    const clear = structuredClone(removed.body.visitPreferences);
    clear.nursing.priority = [];
    const cleared = await request(app).patch(`/clients/${created.body.id}`).set(token)
      .send({ visitPreferences: clear, visitPreferencesRevision: removed.body.visitPreferencesRevision });
    expect(cleared.status).toBe(200);
    expect(cleared.body.visitPreferences.nursing.priority).toEqual([]);
    expect(cleared.body.visitPreferences.nursing.times).toEqual(legacyRemove.nursing.times);
    const forbidden = await request(app).get(`/clients/${created.body.id}`)
      .set("Authorization", `Bearer ${otherCompany}`);
    expect(forbidden.status).not.toBe(200);
    expect(JSON.stringify(forbidden.body)).not.toContain("11:20");
  });

  it("relê a ordem alterada e impede duas reordenações concorrentes de sobrescreverem uma à outra", async () => {
    const token = { Authorization: `Bearer ${collaborator}` };
    await isolated.pool.query(`
      INSERT INTO agenda_windows (resource_id, weekday, start_time, end_time, active)
      VALUES (11,3,'09:00','12:00',true), (11,5,'09:00','13:00',true)
    `);
    const entries = [
      { weekday: 1, time: "09:20" }, { weekday: 3, time: "10:00" }, { weekday: 5, time: "11:20" },
    ];
    const preferences = {
      medical: { weekdays: [], times: [] },
      nursing: { weekdays: [1, 3, 5], times: entries, priority: entries },
    };
    const created = await request(app).post("/clients").set(token).send({
      ...base, name: "Cliente sintético ordenação concorrente",
      visitPreferences: preferences, visitPreferencesRevision: 0,
    });
    expect(created.status, created.text).toBe(201);
    const reordered = structuredClone(preferences);
    reordered.nursing.priority = [entries[2], entries[0], entries[1]];
    const saved = await request(app).patch(`/clients/${created.body.id}`).set(token).send({
      visitPreferences: reordered, visitPreferencesRevision: created.body.visitPreferencesRevision,
    });
    expect(saved.status, saved.text).toBe(200);
    const reread = await request(app).get(`/clients/${created.body.id}`).set(token);
    expect(reread.body.visitPreferences.nursing.priority).toEqual(reordered.nursing.priority);
    const choices = [
      [entries[1], entries[0], entries[2]],
      [entries[0], entries[2], entries[1]],
    ];
    const results = await Promise.all(choices.map(priority => request(app).patch(`/clients/${created.body.id}`).set(token).send({
      visitPreferences: { ...reordered, nursing: { ...reordered.nursing, priority } },
      visitPreferencesRevision: reread.body.visitPreferencesRevision,
    })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = choices[results.findIndex(r => r.status === 200)];
    const final = await request(app).get(`/clients/${created.body.id}`).set(token);
    expect(final.body.visitPreferences.nursing.priority).toEqual(winner);
    const history = await isolated.pool.query(
      "SELECT preferences FROM client_visit_preference_revisions WHERE client_id=$1 ORDER BY id",
      [created.body.id],
    );
    expect(history.rows.map((row: { preferences: { nursing: { priority: unknown } } }) => row.preferences.nursing.priority))
      .toEqual([entries, reordered.nursing.priority, winner]);
  });

  it("cadastra e altera clínica de origem sem trocar a empresa nem o local", async () => {
    const auth = { Authorization: `Bearer ${collaborator}` };
    expect((await request(app).get("/clients/clinicas-origem")).status).toBe(401);
    const options = await request(app).get("/clients/clinicas-origem").set(auth);
    expect(options.status).toBe(200);
    expect(options.body.empresaAtualId).toBe(5);
    expect(options.body.clinicas.map((c: { id: number }) => c.id).sort()).toEqual([5, 6, 7]);
    expect(options.body.clinicas.find((c: { id: number }) => c.id === 5).razaoSocial).toBe("Clínica A Ltda");

    const made = await request(app).post("/clients").set(auth)
      .send({ ...base, name: "Cliente sintético origem" });
    expect(made.status, made.text).toBe(201);
    expect(made.body.clinicaOrigemEmpresaId).toBe(5);
    expect(made.body.locationId).toBe(8);
    const withoutLocation = await request(app).post("/clients").set(auth)
      .send({ ...base, name: "Cliente sintético sem local", locationId: null,
        preferredAgendaResourceIds: [], clinicaOrigemEmpresaId: 6 });
    expect(withoutLocation.status, withoutLocation.text).toBe(201);
    expect(withoutLocation.body.clinicaOrigemEmpresaId).toBe(6);
    expect(withoutLocation.body.locationId).toBeNull();
    expect(withoutLocation.body.empresaId).toBe(5);
    const invalid = await request(app).patch(`/clients/${made.body.id}`).set(auth)
      .send({ clinicaOrigemEmpresaId: 8, clinicaOrigemEsperada: 5 });
    expect(invalid.status).toBe(400);
    const unconfirmed = await request(app).put(`/clients/${made.body.id}`).set(auth)
      .send({ clinicaOrigemEmpresaId: 6 });
    expect(unconfirmed.status).toBe(409);
    const forbidden = await request(app).patch(`/clients/${made.body.id}`)
      .set("Authorization", `Bearer ${otherCompany}`)
      .send({ clinicaOrigemEmpresaId: 6, clinicaOrigemEsperada: 5 });
    expect(forbidden.status).toBe(404);
    expect((await request(app).patch(`/clients/${made.body.id}`).set(auth)
      .send({ clinicaOrigemEmpresaId: 6, clinicaOrigemEsperada: 5 })).status).toBe(400);
    const responses = await Promise.all([6, 7].map(clinicaOrigemEmpresaId =>
      request(app).patch(`/clients/${made.body.id}`).set(auth)
        .send({ clinicaOrigemEmpresaId, clinicaOrigemEsperada: 5, locationId: null, preferredAgendaResourceIds: [] })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const result = await request(app).get(`/clients/${made.body.id}`).set(auth);
    expect(result.body.clinicaOrigemEmpresaId).toBe(responses.find(r => r.status === 200)!.body.clinicaOrigemEmpresaId);
    expect(result.body.empresaId).toBe(5);
    expect(result.body.locationId).toBeNull();
    expect(result.body.preferredAgendaResourceIds).toEqual([]);
  });

  it("filtra e persiste uma agenda por tipo sem trocar o local ou aceitar outra empresa", async () => {
    const auth = { Authorization: `Bearer ${collaborator}` };
    await isolated.pool.query(`
      INSERT INTO locations (id, empresa_id, active, name) VALUES (10, 5, 'true', 'Segundo local');
      INSERT INTO agenda_resources (id, name, kind, slot_minutes, location_id, active, sort_order)
        VALUES (14, 'Enfermagem outro local', 'enfermagem', 20, 10, true, 1),
               (15, 'Enfermagem inativa', 'enfermagem', 20, 8, false, 2),
               (16, 'Nutrição', 'nutricao', 60, 8, true, 3);
      INSERT INTO client_clinic_agenda_defaults (empresa_id, enfermagem_resource_id, medico_resource_id) VALUES (5, 11, 12);
    `);
    expect((await request(app).get("/clients/agenda-opcoes?clinicaId=5")).status).toBe(401);
    expect((await request(app).get("/clients/agenda-opcoes?clinicaId=6").set(auth)).status).toBe(403);
    const options = await request(app).get("/clients/agenda-opcoes?clinicaId=5").set(auth);
    expect(options.status).toBe(200);
    expect(options.body.agendas.map((a: { id: number }) => a.id).sort()).toEqual([11, 12, 14, 16]);
    expect(options.body.locais.map((l: { id: number }) => l.id).sort((a: number, b: number) => a - b)).toEqual([8, 10]);
    const created = await request(app).post("/clients").set(auth).send({ ...base, name: "Cliente agendas padrão" });
    expect(created.status, created.text).toBe(201);
    expect(created.body.agendaEnfermagemPadraoId).toBe(11);
    expect(created.body.agendaMedicoPadraoId).toBe(12);
    const id = created.body.id;
    const invalidType = await request(app).patch(`/clients/${id}`).set(auth).send({ clinicaOrigemEsperada: 5, agendaEnfermagemEsperada: 11, agendaMedicoEsperada: 12, agendaEnfermagemPadraoId: 12 });
    expect(invalidType.status).toBe(400);
    const other = await request(app).patch(`/clients/${id}`).set(auth).send({ clinicaOrigemEsperada: 5, agendaEnfermagemEsperada: 11, agendaMedicoEsperada: 12, agendaEnfermagemPadraoId: 13 });
    expect(other.status).toBe(400);
    expect((await request(app).patch(`/clients/${id}`).set(auth).send({ clinicaOrigemEsperada: 5, agendaEnfermagemPadraoId: 14 })).status).toBe(409);
    const updated = await request(app).patch(`/clients/${id}`).set(auth).send({ clinicaOrigemEsperada: 5, agendaEnfermagemEsperada: 11, agendaMedicoEsperada: 12, agendaEnfermagemPadraoId: 14 });
    expect(updated.status, updated.text).toBe(200);
    const read = await request(app).get(`/clients/${id}`).set(auth);
    expect(read.body.agendaEnfermagemPadraoId).toBe(14);
    expect(read.body.agendaMedicoPadraoId).toBe(12);
    expect(read.body.locationId).toBe(8);
    expect(read.body.preferredAgendaResourceIds).toEqual([11]);
    expect((await request(app).patch(`/clients/${id}`).set(auth).send({ clinicaOrigemEsperada: 5, agendaEnfermagemEsperada: 11, agendaMedicoEsperada: 12, agendaEnfermagemPadraoId: null })).status).toBe(409);
    expect((await request(app).put(`/clients/${id}`).set(auth).send({ ...base, clinicaOrigemEsperada: 5, agendaEnfermagemEsperada: 11, agendaMedicoEsperada: 12, agendaMedicoPadraoId: null })).status).toBe(409);
    expect((await request(app).patch(`/clients/${id}`).set(auth).send({ clinicaOrigemEsperada: 5, agendaEnfermagemEsperada: 14, agendaMedicoEsperada: 12, clinicaOrigemEmpresaId: 6 })).status).toBe(400);
  });

  it("preenche padrões apenas uma vez e preserva escolhas existentes em banco isolado", async () => {
    await isolated.pool.query(`
      DELETE FROM client_clinic_agenda_defaults WHERE empresa_id = 5;
      UPDATE empresas SET nome = 'Instituto Padua' WHERE id = 5;
      INSERT INTO agenda_resources (id, name, kind, slot_minutes, location_id, active)
        VALUES (23, 'AGENDA ENFERMAGEM - LOCAL', 'enfermagem', 20, 8, true),
               (22, 'AGENDA MEDICO - CAIO PADUA - LOCAL', 'medico', 60, 10, true);
      INSERT INTO clients (id, name, empresa_id, clinica_origem_empresa_id, location_id, agenda_enfermagem_padrao_id)
        VALUES (9001, 'Sintético sem padrão', 5, 5, 8, NULL),
               (9002, 'Sintético com escolha', 5, 5, 8, 14),
               (9003, 'Outra clínica', 6, 6, 9, NULL);
    `);
    const script = readFileSync(new URL("../../../../scripts/preencher-agendas-padrao-instituto-padua.sql", import.meta.url), "utf8");
    await isolated.pool.query(script);
    const { rows } = await isolated.pool.query("SELECT id, location_id, agenda_enfermagem_padrao_id, agenda_medico_padrao_id FROM clients WHERE id IN (9001,9002,9003) ORDER BY id");
    expect(rows).toEqual([
      { id: 9001, location_id: 8, agenda_enfermagem_padrao_id: 23, agenda_medico_padrao_id: 22 },
      { id: 9002, location_id: 8, agenda_enfermagem_padrao_id: 14, agenda_medico_padrao_id: 22 },
      { id: 9003, location_id: 9, agenda_enfermagem_padrao_id: null, agenda_medico_padrao_id: null },
    ]);
    await expect(isolated.pool.query(script)).rejects.toThrow("operação única não será repetida");
  });
});
