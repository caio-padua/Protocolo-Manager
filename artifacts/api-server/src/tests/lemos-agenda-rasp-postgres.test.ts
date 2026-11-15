import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

// Clínica piloto Lemos (empresa 2): agendamento de TESTE -> RASP -> consulta, com a cadeia real de
// autenticação e de empresa, em Postgres descartável. Dados 100% sintéticos e identificáveis
// ("TESTE ISOLADO LEMOS"). Nada de Google, Drive, e-mail, WhatsApp, ZapSign ou cobrança (Código Paxter, Art. 82).
const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_t, key) {
      if (!state.database && key === "execute") return async () => ({ rows: [] });
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  });
  return { ...schema, db };
});
vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/google-drive", () => ({
  ensureClientFolderStructure: vi.fn(), uploadFileToDrive: vi.fn(), uploadToFolderById: vi.fn(), shareWithClient: vi.fn(),
  isDriveConnected: vi.fn(async () => false), formatRASFileName: vi.fn(), formatPhysicalRASFileName: vi.fn(),
}));
vi.mock("../lib/pdf-signer", () => ({ generateSignedRASPdf: vi.fn(), generatePhysicalRASPdf: vi.fn(), getCertInfo: vi.fn() }));
vi.mock("../lib/email-service", () => ({ sendProtocolEmail: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ isGmailConnected: vi.fn() }));
vi.mock("../lib/assinatura/service", () => ({ enviarAssinatura: vi.fn() }));
vi.mock("../lib/cadernos-resolver", () => ({ resolverCodigosCadernos: vi.fn() }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: vi.fn(), absoluteBaseUrl: vi.fn() }));

import {
  clientsTable, empresasTable, locationProfessionalsTable, locationsTable, professionalEmpresasTable, professionalsTable,
  protocolsTable, protocolItemsTable, sessionsTable, substanceApplicationsTable, substancesTable, rasTable,
} from "@workspace/db/schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import rasRouter from "../routes/ras";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (text: string, values?: unknown[]) => isolated.pool.query(text, values);

function createTableSql(table: any) {
  const definition = getTableConfig(table);
  const columns = definition.columns.map((column) => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    const defaultNow = ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : "";
    return `"${column.name}" ${column.getSQLType()}${defaultNow}`;
  });
  return `CREATE TABLE "${definition.name}" (${columns.join(", ")});`;
}

const app = express();
app.use(express.json(), tenantContextMiddleware, rasRouter);
const MEDICO_LEMOS = 7;     // vinculado à Lemos por vínculo adicional e por agenda, como no cadastro real
const MEDICO_PADUA = 8;     // médico só da clínica 5
const tokenLemos = createCollaboratorToken({ professionalId: MEDICO_LEMOS, role: "medico", credentialVersion: 0 });
const tokenPadua = createCollaboratorToken({ professionalId: MEDICO_PADUA, role: "medico", credentialVersion: 0 });
const lemos = (token = tokenLemos) => ({ Authorization: `Bearer ${token}`, "x-empresa-id": "2" });

let clienteTeste = 0, protocoloTeste = 0, sessaoTeste = 0, sessaoSemProtocolo = 0;

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const t of [empresasTable, professionalsTable, locationsTable, locationProfessionalsTable, professionalEmpresasTable,
    clientsTable, protocolsTable, protocolItemsTable, sessionsTable, substanceApplicationsTable, substancesTable, rasTable]) {
    await q(createTableSql(t));
  }
  await q(`
    INSERT INTO empresas (id, nome, tipo, ativa, status, razao_social) VALUES
      (2, 'Instituto Lemos', 'clinic', true, 'ATIVO', 'Instituto Lemos Ltda'),
      (5, 'Instituto Padua', 'clinic', true, 'ATIVO', 'Instituto Padua Ltda');
    INSERT INTO professionals (id, name, role, category, active, credential_version, empresa_id, is_platform_owner,
        professional_type, crm) VALUES
      (7, 'MEDICO SINTETICO LEMOS', 'medico', 'Medico', true, 0, 5, false, 'medico', 'CRM SP 234567'),
      (8, 'MEDICO SINTETICO PADUA', 'medico', 'Medico', true, 0, 5, false, 'medico', 'CRM SP 765432');
    INSERT INTO locations (id, name, empresa_id, active) VALUES (16, 'Lemos Sede', 2, 'true'), (1, 'Padua Sede', 5, 'true');
    INSERT INTO location_professionals (location_id, professional_id, role) VALUES (16, 7, 'executor'), (1, 8, 'executor');
    INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (7, 2, 2);
    INSERT INTO substances (id, name, category, color, procedure_type) VALUES (900, 'SUBSTANCIA SINTETICA', 'teste', '#c9a24f', 'im');
  `);
  const c = await q(`INSERT INTO clients (name, empresa_id, location_id, status) VALUES ('TESTE ISOLADO LEMOS', 2, 16, 'active') RETURNING id`);
  clienteTeste = c.rows[0].id;
  const p = await q(`INSERT INTO protocols (client_id, title, start_date, empresa_id, professional_id, unit, status)
    VALUES ($1, 'PROTOCOLO TESTE ISOLADO LEMOS', '2026-12-01', 2, 7, 'Instituto Lemos', 'active') RETURNING id`, [clienteTeste]);
  protocoloTeste = p.rows[0].id;
  const s = await q(`INSERT INTO sessions (protocol_id, client_id, professional_id, scheduled_date, scheduled_time, status,
      unit, service_type, week_number, empresa_id, notes) VALUES ($1,$2,7,'2026-12-01','09:00','scheduled','Instituto Lemos','clinic',1,2,
      'AGENDAMENTO DE TESTE ISOLADO - sem evento externo') RETURNING id`, [protocoloTeste, clienteTeste]);
  sessaoTeste = s.rows[0].id;
  const s2 = await q(`INSERT INTO sessions (client_id, professional_id, scheduled_date, scheduled_time, status,
      unit, service_type, week_number, empresa_id) VALUES ($1,7,'2026-12-02','09:00','scheduled','Instituto Lemos','clinic',1,2) RETURNING id`, [clienteTeste]);
  sessaoSemProtocolo = s2.rows[0].id;
  await q(`INSERT INTO substance_applications (session_id, substance_id, dose, session_number, total_sessions, availability, status)
    VALUES ($1, 900, '1 ampola', 1, 4, 'disp', 'pending')`, [sessaoTeste]);
}, 120_000);
afterAll(async () => { state.database = null; if (isolated) await isolated.stop(); }, 60_000);

describe("Lemos (empresa 2): agendamento de teste -> RASP -> consulta", () => {
  it("médico da Lemos gera o RASP a partir da sessão agendada, identificado pela clínica Lemos", async () => {
    const r = await request(app).post("/ras").set(lemos()).send({ sessionId: sessaoTeste, observations: "TESTE ISOLADO" });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({
      empresaId: 2, clientId: clienteTeste, clientName: "TESTE ISOLADO LEMOS", unit: "Instituto Lemos",
      professionalName: "MEDICO SINTETICO LEMOS", serviceDate: "2026-12-01",
    });
    // O DDL de teste não traz o DEFAULT false do banco real; o que importa é nunca vir verdadeiro.
    expect(r.body.patientSignature === true || r.body.professionalSignature === true).toBe(false);
    expect(r.body.substances).toHaveLength(1);
  });

  it("o RASP não nasce assinado: nenhuma assinatura é declarada sem prova", async () => {
    const [linha] = (await q("SELECT patient_signature, professional_signature FROM ras WHERE session_id=$1", [sessaoTeste])).rows;
    expect(linha.patient_signature ?? false).toBe(false);
    expect(linha.professional_signature ?? false).toBe(false);
  });

  it("consulta por protocolo e por id devolve o RASP da Lemos", async () => {
    const lista = await request(app).get(`/ras?protocolId=${protocoloTeste}`).set(lemos());
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(1);
    const um = await request(app).get(`/ras/${lista.body[0].id}`).set(lemos());
    expect(um.status).toBe(200);
    expect(um.body.clientName).toBe("TESTE ISOLADO LEMOS");
  });

  it("isolamento: a Padua não lista nem lê o RASP da Lemos", async () => {
    const [{ id }] = (await q("SELECT id FROM ras WHERE session_id=$1", [sessaoTeste])).rows;
    const lista = await request(app).get("/ras").set({ Authorization: `Bearer ${tokenPadua}` });
    expect(lista.status).toBe(200);
    expect(lista.body.some((x: any) => x.clientName === "TESTE ISOLADO LEMOS")).toBe(false);
    const um = await request(app).get(`/ras/${id}`).set({ Authorization: `Bearer ${tokenPadua}` });
    expect([403, 404]).toContain(um.status);
    // mesmo médico, mas atuando como clínica 5: o cliente da Lemos não é acessível
    const comoPadua = await request(app).get(`/ras/${id}`).set({ Authorization: `Bearer ${tokenLemos}`, "x-empresa-id": "5" });
    expect([403, 404]).toContain(comoPadua.status);
  });

  it("sessão avulsa sem protocolo não gera RASP", async () => {
    const r = await request(app).post("/ras").set(lemos()).send({ sessionId: sessaoSemProtocolo });
    expect(r.status).toBe(409);
  });

  it("sem login não gera nem consulta", async () => {
    expect((await request(app).post("/ras").send({ sessionId: sessaoTeste })).status).toBeGreaterThanOrEqual(401);
    expect((await request(app).get("/ras")).status).toBeGreaterThanOrEqual(401);
  });
});
