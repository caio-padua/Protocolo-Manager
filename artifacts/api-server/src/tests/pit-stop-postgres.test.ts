import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
// Google simulado: nenhum evento real é criado. "fail" simula erro do Google; "accountOk" simula a conta da clínica.
const gcal = vi.hoisted(() => ({ fail: false, accountOk: true, created: [] as any[], updated: 0, calendars: [] as any[] }));
const armazem = vi.hoisted(() => new Map<string, Buffer>());
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
vi.mock("../lib/google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/google-calendar")>()),
  createCalendarEvent: async (data: any) => { if (gcal.fail) throw new Error("falha sintetica do Google"); gcal.created.push(data); return data.eventId; },
  updateCalendarEvent: async () => { if (gcal.fail) throw new Error("falha sintetica do Google"); gcal.updated++; },
  deleteCalendarEvent: async () => undefined,
  calendarEventExists: async (id: string) => gcal.created.some((d) => d.eventId === id),
  listCalendars: async () => gcal.calendars.map((c) => ({ id: c.id, summary: c.nome, backgroundColor: c.cor ?? "#112233", accessRole: c.accessRole ?? "owner" })),
  verifyClinicAccount: async () => gcal.accountOk ? { ok: true, account: "clinica@sintetico.test" } : { ok: false, account: null },
}));
// Matriz de Governança simulada (a leitura real vai ao banco de configurações): `matriz.valor` = null usa o padrão do sistema.
const gov = vi.hoisted(() => ({ matriz: null as any }));
vi.mock("../lib/secure-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/secure-settings")>()),
  getJsonSetting: async () => gov.matriz,
}));
vi.mock("../lib/objectStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/objectStorage")>()),
  ObjectStorageService: class {
    async savePrivateObject(p: string, b: Buffer) { armazem.set(p, b); return p; }
    async readPrivateObject(p: string) { const b = armazem.get(p); if (!b) throw new Error("objeto inexistente"); return b; }
    async deletePrivateObject(p: string) { armazem.delete(p); }
  },
}));
// Quem administra agendas da clínica: simulado por cabeçalho (a regra real é coberta em agenda-governance.test.ts).
vi.mock("../lib/agenda-governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/agenda-governance")>()),
  mayManageAgendaEmpresa: async (req: any) => req.headers["x-test-admin"] === "1",
}));
vi.mock("../routes/professionals", async () => {
  const { sql } = await import("drizzle-orm");
  return { professionalIdsForCompany: async (empresaId: number) =>
    (await state.database.execute(sql`SELECT id FROM professionals WHERE empresa_id=${empresaId}`)).rows.map((r: any) => Number(r.id)) };
});
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: (req: any) => req.tenantContext.empresaId }));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-role"]) { res.status(401).json({ error: "Não autenticado" }); return; }
    req.collaborator = { professionalId: Number(req.headers["x-test-prof"] ?? 101) }; next();
  },
}));
// A autorização clínica real do protocolo é pesada e coberta em outro teste; aqui ela é simulada com
// uma regra equivalente e explícita: o protocolo precisa pertencer à clínica da sessão.
vi.mock("../routes/protocols", () => ({
  authorizeProtocol: async (req: any, protocol: any, res: any) => {
    if (protocol.empresaId !== req.tenantContext.empresaId) { res.status(404).json({ error: "Registro não encontrado" }); return null; }
    return { clinic: { empresaId: protocol.empresaId } };
  },
}));
import router from "../routes/protocolo-procedimentos";
import pitRouter from "../routes/pit-stop";
import reconciliacaoRouter from "../routes/agenda-google-reconciliacao";
import documentosRouter from "../routes/profissional-documentos";
import preferidosRouter from "../routes/agenda-profissionais-preferidos";
import { protocoloTemPlanoVivo } from "../lib/pit-stop";
import { PROCEDIMENTOS_SCHEMA_SQL } from "../lib/procedimentos-schema";
import { AGENDA_CATEGORIA_AUDITORIA_DDL } from "../lib/agenda-recurso-categoria";
import { brtISODate } from "../lib/brt";
import { getTableColumns } from "drizzle-orm";
import { sessionsTable, clientsTable, locationsTable, agendaResourcesTable, protocolsTable, locationProfessionalsTable } from "@workspace/db/schema";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), (req: any, _res: any, next: any) => {
  const role = req.headers["x-test-role"];
  req.tenantContext = { authenticated: !!role, empresaId: Number(req.headers["x-test-empresa"] ?? 5), professionalId: Number(req.headers["x-test-prof"] ?? 101) } as any;
  next();
}, router, pitRouter, reconciliacaoRouter, documentosRouter, preferidosRouter, (err: any, _req: any, res: any, _next: any) => { res.status(500).json({ error: String(err?.message ?? err), cause: String(err?.cause?.message ?? "") }); });
const q = (text: string, params?: any[]) => isolated.pool.query(text, params);
const api = (method: "get" | "post" | "put" | "patch", url: string, body?: any, prof = 101, extra: Record<string, string> = {}) => {
  let r = (request(app) as any)[method](url).set("x-test-role", "admin").set("x-test-prof", String(prof));
  for (const [k, v] of Object.entries(extra)) r = r.set(k, v);
  return r.send(body);
};
const day = (n: number) => { const d = new Date(`${brtISODate()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DATE = day(10);
const DATE2 = day(11); // dia limpo, para testes que não dependem da ocupação dos anteriores
const DATE3 = day(12); // dia limpo do cenário do Botox (médico OU biomédico)

const PROC = { consulta: 1, aplicacao: 2, biomed: 3, fisio: 4, conjunta: 5, trio: 6, implante: 7, outraClinica: 8, botox: 9 };
let protoSeq = 0;
// Cada teste usa um cliente e um protocolo próprios (sintéticos).
async function novoProtocolo(empresa = 5) {
  const n = ++protoSeq;
  await q("INSERT INTO clients(id,status,empresa_id,clinica_origem_empresa_id,name,location_id) VALUES ($1,'active',$2,$2,$3,$4)",
    [1000 + n, empresa, `Cliente Sintetico ${n}`, empresa === 5 ? 50 : 60]);
  await q(`INSERT INTO protocols(id,client_id,title,start_date,empresa_id) VALUES ($1,$2,'Protocolo sintetico',$3,$4)`, [2000 + n, 1000 + n, DATE, empresa]);
  return 2000 + n;
}
const incluir = (proto: number, body: any) => api("post", `/protocols/${proto}/procedimentos`, body);
const sessoes = async (proto: number) => (await q("SELECT resource_id, professional_id, scheduled_time, duration_minutes FROM sessions WHERE protocol_id=$1 ORDER BY resource_id", [proto])).rows;

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await q(`
    CREATE TABLE empresas (id integer PRIMARY KEY);
    CREATE TABLE professional_areas (id integer PRIMARY KEY, name text, slug text, professional_type text, active boolean, sort_order integer DEFAULT 0);
    CREATE TABLE locations (id integer PRIMARY KEY, empresa_id integer, active text, google_calendar_id text, name text, color text, agenda_papel text);
    CREATE TABLE professionals (id integer PRIMARY KEY, name text, area_id integer, active boolean DEFAULT true, empresa_id integer);
    CREATE TABLE professional_empresas (professional_id integer, empresa_id integer);
    CREATE TABLE location_professionals (professional_id integer, location_id integer);
    CREATE TABLE clients (id integer PRIMARY KEY, status text, empresa_id integer, clinica_origem_empresa_id integer);
    CREATE TABLE substances (id integer PRIMARY KEY, procedure_type text);
    CREATE TABLE protocols (id integer PRIMARY KEY, client_id integer NOT NULL, professional_id integer, title text NOT NULL, status text NOT NULL DEFAULT 'suggested',
      start_date text NOT NULL, end_date text, unit text, service_type text NOT NULL DEFAULT 'clinic', total_sessions integer NOT NULL DEFAULT 0,
      completed_sessions integer NOT NULL DEFAULT 0, total_value real NOT NULL DEFAULT 0, notes text, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), nurse_id integer, nurse_service_fee real, empresa_id integer, linha_venda text,
      scheduled_time text NOT NULL DEFAULT '09:00', scheduling_mode text NOT NULL DEFAULT 'weekly');
    CREATE TABLE sessions (id serial PRIMARY KEY, protocol_id integer NOT NULL, client_id integer NOT NULL, professional_id integer,
      scheduled_date text NOT NULL, scheduled_time text NOT NULL, status text NOT NULL DEFAULT 'scheduled', unit text,
      service_type text NOT NULL DEFAULT 'clinic', week_number integer NOT NULL DEFAULT 1, notes text, created_at timestamptz DEFAULT now(),
      google_event_id text, google_calendar_id text, resource_id integer, empresa_id integer, agenda_archived boolean NOT NULL DEFAULT false,
      duration_minutes integer);
    CREATE TABLE agenda_resources (id serial PRIMARY KEY, name text NOT NULL, kind text NOT NULL DEFAULT 'enfermagem', modality text NOT NULL DEFAULT 'local',
      color text NOT NULL DEFAULT '#3D7A7A', slot_minutes integer NOT NULL DEFAULT 30, professional_id integer, location_id integer,
      google_calendar_id text, category_id integer, active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
      external_cep text, external_logradouro text, external_bairro text, external_cidade text, external_uf text, external_numero text, external_complemento text, empresa_id integer,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE agenda_windows (id serial PRIMARY KEY, resource_id integer NOT NULL, weekday integer NOT NULL, start_time text NOT NULL, end_time text NOT NULL,
      repeat_weeks integer NOT NULL DEFAULT 1, anchor_date text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE agenda_exceptions (id serial PRIMARY KEY, resource_id integer, date text NOT NULL, kind text NOT NULL DEFAULT 'feriado', description text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE agenda_settings (id serial PRIMARY KEY, block_minutes integer NOT NULL DEFAULT 120, trigger_percent integer NOT NULL DEFAULT 60,
      min_lead_hours integer NOT NULL DEFAULT 24, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE agenda_personal_owners (location_id integer, empresa_id integer, professional_id integer);
    CREATE TABLE agenda_google_sync (location_id integer, enabled boolean, last_success timestamptz, error text);
    CREATE TABLE client_visit_preference_revisions (id serial PRIMARY KEY, client_id int NOT NULL, empresa_id int NOT NULL,
      preferences jsonb NOT NULL, created_by int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      executor_kind text NOT NULL DEFAULT 'professional', executor_label text, authorizer_professional_id int);
    CREATE TABLE agenda_compromissos (id serial PRIMARY KEY, titulo text, inicio timestamptz, fim timestamptz, dia_inteiro boolean, recorrencia text,
      origem text, status text, location_id integer, chave text, google_calendar_id text);
    INSERT INTO empresas VALUES (5),(6);
    INSERT INTO professional_areas VALUES (1,'Medicina','medicina','medico',true,1),(2,'Enfermagem','enfermagem','nao_medico',true,2),
      (8,'Biomedicina','biomedicina','nao_medico',true,8),(20,'Fisioterapia','fisioterapia','nao_medico',true,20),(40,'Terapia Nova','terapia-nova','nao_medico',true,40);
    INSERT INTO locations VALUES (50,5,'true',NULL,'Sala 50',NULL,'local'),(60,6,'true',NULL,'Sala outra clinica',NULL,'local');
    INSERT INTO professionals VALUES (201,'Medico Sintetico',1,true,5),(202,'Enfermeira Sintetica A',2,true,5),(207,'Enfermeira Sintetica B',2,true,5),
      (203,'Biomedica Sintetica',8,true,5),(204,'Biomedica Outra Clinica',8,true,6),(206,'Fisio Sintetico',20,true,5),(101,'Admin Sintetico',1,true,5);
    INSERT INTO location_professionals VALUES (201,50),(202,50),(207,50),(203,50),(206,50),(204,60);
    INSERT INTO agenda_settings DEFAULT VALUES;
    -- Agendas (category_id GRAVADA). R7 e legado SEM categoria e sort_order -1: se fosse usado, apareceria primeiro.
    INSERT INTO agenda_resources(id,name,kind,professional_id,location_id,category_id,sort_order) VALUES
      (1,'Agenda medico individual','medico',201,50,1,0),
      (2,'Agenda enfermagem A','enfermagem',202,50,2,0),
      (3,'Agenda enfermagem B','enfermagem',207,50,2,1),
      (4,'Agenda biomedico local','categoria',203,50,8,0),
      (5,'Agenda fisioterapeuta compartilhada','categoria',NULL,50,20,0),
      (6,'Agenda medico outra clinica','medico',NULL,60,1,0),
      (7,'AGENDA ENFERMAGEM - LOCAL (legado)','enfermagem',NULL,50,NULL,-1);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time)
      SELECT r, d, '08:00', '12:00' FROM generate_series(1,7) r, generate_series(0,6) d;
    INSERT INTO procedimentos_clinicos_placeholder SELECT 1 WHERE false;
  `.replace("INSERT INTO procedimentos_clinicos_placeholder SELECT 1 WHERE false;", ""));
  await q(PROCEDIMENTOS_SCHEMA_SQL);
  await q(AGENDA_CATEGORIA_AUDITORIA_DDL);
  await q(await readFile(new URL("../../../../scripts/migrations/20261112_protocolo_procedimentos_equipe.sql", import.meta.url), "utf8"));
  // Aplicar a migração duas vezes não pode falhar nem duplicar nada.
  await q(await readFile(new URL("../../../../scripts/migrations/20261112_protocolo_procedimentos_equipe.sql", import.meta.url), "utf8"));
  // Pit Stop: modalidade e agenda escolhida na equipe do protocolo (também idempotente).
  await q(await readFile(new URL("../../../../scripts/migrations/20261121_pit_stop_agendamento.sql", import.meta.url), "utf8"));
  await q(await readFile(new URL("../../../../scripts/migrations/20261121_pit_stop_agendamento.sql", import.meta.url), "utf8"));
  // Home Care, auditoria do Pit Stop, habilitação e documentos (também idempotente).
  await q(`ALTER TABLE professionals ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'medico';
    ALTER TABLE professionals ADD COLUMN IF NOT EXISTS is_platform_owner boolean NOT NULL DEFAULT false;
    ALTER TABLE professionals ADD COLUMN IF NOT EXISTS registration_council text; ALTER TABLE professionals ADD COLUMN IF NOT EXISTS registration_number text;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS address text; ALTER TABLE clients ADD COLUMN IF NOT EXISTS name text;`);
  await q(await readFile(new URL("../../../../scripts/migrations/20261122_home_care_documentos_reconciliacao.sql", import.meta.url), "utf8"));
  await q(await readFile(new URL("../../../../scripts/migrations/20261122_home_care_documentos_reconciliacao.sql", import.meta.url), "utf8"));
  await q(`
    INSERT INTO substances VALUES (900,'implant'),(901,'iv');
    INSERT INTO procedimentos_clinicos(id,empresa_id,nome,duracao_segundos,ativo) VALUES
      (1,5,'Consulta medica',1800,true),(2,5,'Aplicacao de substancia',1800,true),(3,5,'Procedimento biomedico',1800,true),
      (4,5,'Sessao de fisioterapia',3600,true),(5,5,'Consulta com aplicacao',1800,true),(6,5,'Procedimento em trio',1800,true),
      (7,5,'Implante hormonal',1800,true),(8,6,'Procedimento da outra clinica',1800,true),(9,5,'Botox (ficticio)',1800,true);
    INSERT INTO procedimento_equipes(procedimento_id,area_id,location_id) VALUES
      (1,1,50),(2,2,50),(3,8,50),(4,20,50),(5,1,50),(5,2,50),(6,1,50),(6,2,50),(6,8,50),(7,1,50),(7,2,50),(8,1,60),(9,1,50);
    INSERT INTO procedimento_produtos(procedimento_id,produto_id) VALUES (7,900),(2,901);
  `);
}, 90_000);
afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);


// ───────────────────────── Pit Stop ─────────────────────────
const D = (n: number) => day(20 + n); // dias limpos e distintos por teste
const criar = (proto: number, procedimentos: any[], assumir = false, prof = 101) =>
  api("post", `/protocols/${proto}/plano-agendamento`, { procedimentos, assumir }, prof);
const ver = (id: number, prof = 101) => api("get", `/agendamento/planos/${id}`, undefined, prof);
const abrir = async (id: number, prof = 101) => (await api("post", `/agendamento/planos/${id}/abrir`, {}, prof));
const confirmar = (id: number, versao: number, prof = 101) => api("post", `/agendamento/planos/${id}/confirmar`, { versao }, prof);

const nSessoes = async (proto: number) => (await q("SELECT count(*)::int n FROM sessions WHERE protocol_id=$1", [proto])).rows[0].n as number;
const consultaMedica = (inicio: string, extra: any = {}) => ({ procedimentoId: PROC.consulta, dataInicio: inicio, ...extra });
const aplicacao = (inicio: string, extra: any = {}) => ({ procedimentoId: PROC.aplicacao, produtoId: 901, dose: "10 mg", dataInicio: inicio, ...extra });

describe("Pit Stop: plano de agendamento compartilhado, no banco isolado", () => {
  beforeAll(async () => {
    // Completa as tabelas feitas à mão com TODAS as colunas do esquema real (consultas do drizzle selecionam todas).
    for (const [tabela, t] of [["sessions", sessionsTable], ["clients", clientsTable], ["locations", locationsTable],
      ["agenda_resources", agendaResourcesTable], ["protocols", protocolsTable], ["location_professionals", locationProfessionalsTable]] as const) {
      const existentes = new Set((await q("SELECT column_name FROM information_schema.columns WHERE table_name=$1", [tabela])).rows.map((r) => r.column_name));
      for (const col of Object.values(getTableColumns(t as any)) as any[]) {
        if (!existentes.has(col.name)) await q(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS "${col.name}" ${col.getSQLType()}`);
      }
    }
    await q(`
      CREATE TABLE IF NOT EXISTS substance_applications (id serial PRIMARY KEY, session_id integer, substance_id integer, dose text, session_number integer,
        total_sessions integer, status text, availability text, applied_at timestamptz, confirmed_by integer, confirmed_at timestamptz, notes text, created_at timestamptz DEFAULT now());
      CREATE TABLE client_clinic_agenda_defaults (empresa_id integer, enfermagem_resource_id integer, medico_resource_id integer);
      INSERT INTO client_clinic_agenda_defaults VALUES (5, 2, 1);
      INSERT INTO professionals VALUES (102,'Recepcionista Sintetica',1,true,5);
      INSERT INTO location_professionals VALUES (101,50),(102,50);
      UPDATE agenda_resources SET google_calendar_id='cal-sede' WHERE id IN (1,2,3,4,5);
      INSERT INTO agenda_resources(id,name,kind,modality,professional_id,location_id,category_id,google_calendar_id)
        VALUES (30,'Agenda enfermagem ONLINE','enfermagem','online',202,50,2,'cal-online');
      INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time) SELECT 30, d, '08:00', '12:00' FROM generate_series(0,6) d;
    `);
  });

  it("cria o plano sem reservar nada, sugere agenda sem usar a ordem de exibição e propõe datas pela frequência", async () => {
    const proto = await novoProtocolo();
    const r = await criar(proto, [{ procedimentoId: PROC.conjunta, totalSessoes: 2, intervaloDias: 7, dataInicio: D(1) }, { procedimentoId: PROC.biomed, dataInicio: D(1) }]);
    expect(r.status).toBe(201);
    const plano = r.body.plano;
    expect(plano.estado).toBe("pendente");
    expect(plano.itens).toHaveLength(2);
    const conj = plano.itens.find((i: any) => i.procedimentoId === PROC.conjunta);
    expect(conj.equipe.map((e: any) => [e.categoryId, e.agendaId, e.agendaOrigem])).toEqual([[1, 1, "sugerida"], [2, 2, "sugerida"]]);
    // Opções da enfermagem local: só as agendas locais da categoria (a online e a legada sem categoria ficam de fora).
    expect(conj.equipe[1].opcoesAgenda.map((o: any) => o.id)).toEqual([2, 3]);
    expect(conj.problema).toBeNull();
    expect(conj.ocorrencias).toHaveLength(2);
    expect(conj.ocorrencias.every((o: any) => o.data && o.hora && !o.reservada)).toBe(true);
    const dias = (Date.parse(conj.ocorrencias[1].data) - Date.parse(conj.ocorrencias[0].data)) / 86_400_000;
    expect(dias).toBeGreaterThanOrEqual(7);
    expect(await nSessoes(proto)).toBe(0); // proposta não reserva
    expect(await protocoloTemPlanoVivo(proto)).toBe(true);
    expect(await protocoloTemPlanoVivo(await novoProtocolo())).toBe(false);
    // Um segundo plano vivo para o mesmo protocolo é recusado.
    const dup = await criar(proto, [consultaMedica(D(1))]);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("plano_ja_existe");
  });

  it("sem padrão inequívoco a escolha fica pendente, impede confirmar e a escolha explícita resolve", async () => {
    await q("DELETE FROM client_clinic_agenda_defaults");
    try {
      const proto = await novoProtocolo();
      const r = await criar(proto, [aplicacao(D(2))], true);
      expect(r.status).toBe(201);
      let item = r.body.plano.itens[0];
      expect(item.equipe[0].agendaId).toBeNull();
      expect(item.problema.code).toBe("escolha_agenda_pendente");
      expect(item.ocorrencias[0]).toMatchObject({ data: null, motivo: "escolha_agenda_pendente" });
      const c = await confirmar(r.body.planoId, r.body.plano.versao);
      expect(c.status).toBe(409);
      expect(c.body.code).toBe("plano_com_conflitos");
      expect(await nSessoes(proto)).toBe(0);
      const ok = await api("put", `/agendamento/planos/${r.body.planoId}/itens/${item.id}/equipe`,
        { versao: r.body.plano.versao, equipe: [{ categoryId: 2, agendaId: 3 }] });
      expect(ok.status).toBe(200);
      item = ok.body.plano.itens[0];
      expect(item.problema).toBeNull();
      expect(item.equipe[0]).toMatchObject({ agendaId: 3, agendaOrigem: "escolhida" });
      expect(item.ocorrencias[0].data).toBeTruthy();
    } finally {
      await q("INSERT INTO client_clinic_agenda_defaults VALUES (5, 2, 1)");
    }
  });

  it("agenda de outra empresa é recusada e categoria sem agenda mostra o motivo sem inventar disponibilidade", async () => {
    const proto = await novoProtocolo();
    const r = await criar(proto, [consultaMedica(D(3))], true);
    const item = r.body.plano.itens[0];
    const outra = await api("put", `/agendamento/planos/${r.body.planoId}/itens/${item.id}/equipe`,
      { versao: r.body.plano.versao, equipe: [{ categoryId: 1, agendaId: 6 }] });
    expect(outra.status).toBe(404);
    const semAgenda = await criar(await novoProtocolo(), [consultaMedica(D(3), { equipe: [{ categoryId: 40 }] })]);
    expect(semAgenda.status).toBe(201);
    const it2 = semAgenda.body.plano.itens[0];
    expect(it2.problema.code).toBe("sem_agenda_da_categoria");
    expect(it2.ocorrencias[0]).toMatchObject({ data: null, hora: null });
    expect(it2.ocorrencias[0].motivo).toBe("sem_agenda_da_categoria");
  });

  it("várias empresas: protocolo e plano de outra clínica nunca aparecem nem são acessíveis", async () => {
    const outro = await novoProtocolo(6);
    expect((await criar(outro, [consultaMedica(D(4))])).status).toBe(404);
    await q("INSERT INTO agendamento_planos(empresa_id, protocol_id, client_id, estado) VALUES (6, $1, $2, 'pendente')", [outro, outro - 1000]);
    const idOutra = (await q("SELECT id FROM agendamento_planos WHERE protocol_id=$1", [outro])).rows[0].id;
    expect((await ver(idOutra)).status).toBe(404);
    const fila = await api("get", "/agendamento/pit-stop");
    expect(fila.status).toBe(200);
    expect(fila.body.planos.some((p: any) => p.id === idOutra)).toBe(false);
    expect((await request(app).get("/agendamento/pit-stop")).status).toBe(401);
  });

  it("revisão exclusiva: duas pessoas não revisam nem confirmam o mesmo plano; concessão expirada pode ser assumida", async () => {
    const proto = await novoProtocolo();
    const r = await criar(proto, [consultaMedica(D(5))]);
    const id = r.body.planoId;
    expect((await abrir(id, 101)).status).toBe(200);
    const outro = await abrir(id, 102);
    expect(outro.status).toBe(409);
    expect(outro.body.code).toBe("em_revisao_por_outro");
    const v = (await ver(id, 101)).body.plano.versao;
    const conf = await confirmar(id, v, 102);
    expect(conf.status).toBe(409);
    expect(conf.body.code).toBe("em_revisao_por_outro");
    expect((await api("post", `/agendamento/planos/${id}/liberar`, {}, 102)).status).toBe(409);
    expect((await api("post", `/agendamento/planos/${id}/liberar`, {}, 101)).status).toBe(200);
    expect((await abrir(id, 102)).status).toBe(200);
    await q("UPDATE agendamento_planos SET revisao_expira_em = now() - interval '1 minute' WHERE id=$1", [id]);
    expect((await abrir(id, 101)).status).toBe(200); // assume a concessão vencida
    const v2 = (await ver(id, 101)).body.plano.versao;
    const antigo = await confirmar(id, v2, 102);
    expect(antigo.status).toBe(409);
    expect(antigo.body.code).toBe("em_revisao_por_outro");
    expect(await nSessoes(proto)).toBe(0);
  });

  it("revalidar não grava; confirmar duplicado da mesma pessoa não duplica; outra pessoa recebe 409; versão antiga é recusada", async () => {
    const proto = await novoProtocolo();
    const r = await criar(proto, [consultaMedica(D(6))], true);
    const id = r.body.planoId;
    const rev = await api("post", `/agendamento/planos/${id}/revalidar`, {});
    expect(rev.status).toBe(200);
    expect(rev.body.ok).toBe(true);
    expect(await nSessoes(proto)).toBe(0);
    const velha = await confirmar(id, r.body.plano.versao + 5);
    expect(velha.status).toBe(409);
    expect(velha.body.code).toBe("plano_mudou");
    const [a, b] = await Promise.all([confirmar(id, r.body.plano.versao), confirmar(id, r.body.plano.versao)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.repetido, b.body.repetido].sort()).toEqual([false, true]);
    expect(await nSessoes(proto)).toBe(1);
    expect((await ver(id)).body.plano).toMatchObject({ estado: "confirmado", syncEstado: "sincronizado" });
    const intruso = await confirmar(id, 1, 102);
    expect(intruso.status).toBe(409);
    expect(intruso.body.code).toBe("plano_ja_confirmado");
    expect(await nSessoes(proto)).toBe(1);
  });

  it("dois planos disputando o mesmo horário: o segundo vê o conflito, nada é gravado e uma troca de horário resolve", async () => {
    const p1 = await novoProtocolo(); const p2 = await novoProtocolo();
    const a = await criar(p1, [consultaMedica(D(7))], true, 101);
    const b = await criar(p2, [consultaMedica(D(7))], true, 102);
    const oa = a.body.plano.itens[0].ocorrencias[0]; const ob = b.body.plano.itens[0].ocorrencias[0];
    expect([oa.data, oa.hora]).toEqual([ob.data, ob.hora]); // as duas propostas coincidem: nada foi reservado ainda
    expect((await confirmar(a.body.planoId, a.body.plano.versao, 101)).status).toBe(200);
    const rev = await api("post", `/agendamento/planos/${b.body.planoId}/revalidar`, {}, 102);
    expect(rev.body.ok).toBe(false);
    expect(rev.body.resultados[0].code).toBe("horario_indisponivel");
    const c = await confirmar(b.body.planoId, b.body.plano.versao, 102);
    expect(c.status).toBe(409);
    expect(c.body.code).toBe("plano_com_conflitos");
    expect(await nSessoes(p2)).toBe(0);
    expect((await ver(b.body.planoId, 102)).body.plano.estado).toBe("em_revisao");
    const v = (await ver(b.body.planoId, 102)).body.plano;
    const troca = await api("put", `/agendamento/planos/${b.body.planoId}/ocorrencias`,
      { versao: v.versao, ajustes: [{ id: v.itens[0].ocorrencias[0].id, data: ob.data, hora: "08:30" }] }, 102);
    expect(troca.status).toBe(200);
    const cc = await confirmar(b.body.planoId, troca.body.plano.versao, 102);
    expect(cc.status).toBe(200);
    expect(await nSessoes(p2)).toBe(1);
  });

  it("confirmação simultânea de dois planos no mesmo horário: exatamente um vence", async () => {
    const p1 = await novoProtocolo(); const p2 = await novoProtocolo();
    const a = await criar(p1, [consultaMedica(D(8))], true, 101);
    const b = await criar(p2, [consultaMedica(D(8))], true, 102);
    const rs = await Promise.all([confirmar(a.body.planoId, a.body.plano.versao, 101), confirmar(b.body.planoId, b.body.plano.versao, 102)]);
    expect(rs.map((x) => x.status).sort()).toEqual([200, 409]);
    expect((await nSessoes(p1)) + (await nSessoes(p2))).toBe(1);
  });

  it("mesma profissional em duas agendas (local e online) não atende dois clientes ao mesmo tempo", async () => {
    const p1 = await novoProtocolo(); const p2 = await novoProtocolo();
    const a = await criar(p1, [aplicacao(D(9), { equipe: [{ categoryId: 2, agendaId: 2 }] })], true);
    expect(a.status).toBe(201);
    const oa = a.body.plano.itens[0].ocorrencias[0];
    expect((await confirmar(a.body.planoId, a.body.plano.versao)).status).toBe(200);
    const b = await criar(p2, [aplicacao(D(9), { equipe: [{ categoryId: 2, modalidade: "online" }] })], true);
    const it = b.body.plano.itens[0];
    expect(it.equipe[0]).toMatchObject({ agendaId: 30, modalidade: "online" });
    expect(it.equipe[0].opcoesAgenda.map((o: any) => o.id)).toEqual([30]);
    // A proposta automática já evita o horário da mesma profissional na agenda local.
    expect(it.ocorrencias[0].data === oa.data && it.ocorrencias[0].hora === oa.hora).toBe(false);
    // Forçado manualmente no mesmo horário, a confirmação recusa.
    const forca = await api("put", `/agendamento/planos/${b.body.planoId}/ocorrencias`,
      { versao: b.body.plano.versao, ajustes: [{ id: it.ocorrencias[0].id, data: oa.data, hora: oa.hora }] });
    expect(forca.status).toBe(200);
    const c = await confirmar(b.body.planoId, forca.body.plano.versao);
    expect(c.status).toBe(409);
    expect(c.body.code).toBe("plano_com_conflitos");
    expect(await nSessoes(p2)).toBe(0);
  });

  it("agenda online reserva e envia ao Google sem endereço físico", async () => {
    gcal.created.length = 0;
    const proto = await novoProtocolo();
    const r = await criar(proto, [aplicacao(D(10), { equipe: [{ categoryId: 2, modalidade: "online" }] })], true);
    expect(r.status).toBe(201);
    const c = await confirmar(r.body.planoId, r.body.plano.versao);
    expect(c.status).toBe(200);
    expect(c.body.sincronizacao.estado).toBe("sincronizado");
    expect(await sessoes(proto)).toMatchObject([{ resource_id: 30, professional_id: 202 }]);
    expect(gcal.created).toHaveLength(1);
    expect(gcal.created[0]).toMatchObject({ calendarId: "cal-online", procedureName: "Aplicacao de substancia" });
    expect(gcal.created[0].locationAddress).toBeUndefined();
  });

  it("repetição semanal: 3 ocorrências em datas distintas, 3 sessões e 3 eventos Google sem repetição", async () => {
    gcal.created.length = 0;
    const proto = await novoProtocolo();
    const r = await criar(proto, [consultaMedica(D(11), { totalSessoes: 3, intervaloDias: 7 })], true);
    const datas = r.body.plano.itens[0].ocorrencias.map((o: any) => o.data);
    expect(new Set(datas).size).toBe(3);
    const c = await confirmar(r.body.planoId, r.body.plano.versao);
    expect(c.status).toBe(200);
    expect(await nSessoes(proto)).toBe(3);
    expect(gcal.created).toHaveLength(3);
    expect(new Set(gcal.created.map((e) => e.eventId)).size).toBe(3);
    expect(gcal.created.map((e) => `${e.weekNumber}/${e.totalAppointments}`)).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("falha do Google: a reserva interna vale, o plano NÃO aparece como sincronizado e o reprocesso não duplica", async () => {
    gcal.created.length = 0; gcal.fail = true;
    try {
      const proto = await novoProtocolo();
      const r = await criar(proto, [consultaMedica(D(12), { totalSessoes: 2, intervaloDias: 7 })], true);
      const c = await confirmar(r.body.planoId, r.body.plano.versao);
      expect(c.status).toBe(200);
      expect(await nSessoes(proto)).toBe(2);
      expect(c.body.sincronizacao.estado).toBe("erro");
      expect(c.body.plano.syncEstado).toBe("erro");
      expect(gcal.created).toHaveLength(0);
      // Conta Google indisponível: continua erro e explica o motivo.
      gcal.fail = false; gcal.accountOk = false;
      const sem = await api("post", `/agendamento/planos/${r.body.planoId}/sincronizar`, {});
      expect(sem.body.sincronizacao).toMatchObject({ estado: "erro", motivo: "google_indisponivel" });
      expect(gcal.created).toHaveLength(0);
      gcal.accountOk = true;
      const ok = await api("post", `/agendamento/planos/${r.body.planoId}/sincronizar`, {});
      expect(ok.body.sincronizacao.estado).toBe("sincronizado");
      expect(ok.body.plano.syncEstado).toBe("sincronizado");
      expect(gcal.created).toHaveLength(2);
      expect(new Set(gcal.created.map((e) => e.eventId)).size).toBe(2);
      // Repetir não cria de novo.
      const de_novo = await api("post", `/agendamento/planos/${r.body.planoId}/sincronizar`, {});
      expect(de_novo.body.sincronizacao.visitas.every((v: any) => v.status === "ja_sincronizado")).toBe(true);
      expect(gcal.created).toHaveLength(2);
    } finally { gcal.fail = false; gcal.accountOk = true; }
  });

  it("cancelar libera o protocolo para um novo plano", async () => {
    const proto = await novoProtocolo();
    const r = await criar(proto, [consultaMedica(D(13))]);
    expect((await api("post", `/agendamento/planos/${r.body.planoId}/cancelar`, {})).status).toBe(200);
    expect(await protocoloTemPlanoVivo(proto)).toBe(false);
    expect((await criar(proto, [consultaMedica(D(13))])).status).toBe(201);
  });

  describe("Recepção da empresa: permissão + empresa, sem depender de vínculo legado com local", () => {
    const RECEPCAO_LIGADA = { agenda_gerenciamento: { recepcao: true } };
    beforeAll(async () => {
      await q(`INSERT INTO professionals(id,name,area_id,active,empresa_id,category) VALUES
        (103,'Recepcao Sintetica A',1,true,5,'recepcao'),(104,'Recepcao Outra Clinica',1,true,6,'recepcao'),
        (105,'Enfermagem Sem Vinculo',2,true,5,'enfermagem')`);
    });

    it("recepção sem a permissão na matriz é recusada; ligada, vê a fila, assume, confirma e envia ao Google, e tudo fica auditado", async () => {
      gcal.created.length = 0;
      const proto = await novoProtocolo();
      const r = await criar(proto, [consultaMedica(D(15))]); // lançado pelo médico (101), plano pendente
      gov.matriz = null; // padrão do sistema: recepção desligada
      const negada = await api("get", "/agendamento/pit-stop", undefined, 103);
      expect(negada.status).toBe(403);
      expect(negada.body.code).toBe("sem_permissao_pit_stop");
      expect((await abrir(r.body.planoId, 103)).status).toBe(403);
      gov.matriz = RECEPCAO_LIGADA;
      try {
        // 103 NÃO está em location_professionals e não é a executora da consulta.
        expect((await q("SELECT count(*)::int n FROM location_professionals WHERE professional_id=103")).rows[0].n).toBe(0);
        const fila = await api("get", "/agendamento/pit-stop?estado=pendente", undefined, 103);
        expect(fila.status).toBe(200);
        expect(fila.body.planos.some((p: any) => p.id === r.body.planoId)).toBe(true);
        const aberto = await abrir(r.body.planoId, 103);
        expect(aberto.status).toBe(200);
        const c = await confirmar(r.body.planoId, aberto.body.plano.versao, 103);
        expect(c.status).toBe(200);
        expect(c.body.sincronizacao.estado).toBe("sincronizado");
        expect(gcal.created).toHaveLength(1);
        const trilha = (await q("SELECT ator_id, acao FROM agendamento_plano_auditoria WHERE plano_id=$1 ORDER BY id", [r.body.planoId])).rows;
        expect(trilha.map((x) => x.acao)).toEqual(["abriu_revisao", "confirmou_plano", "enviou_ao_google"]);
        expect(trilha.every((x) => x.ator_id === 103)).toBe(true);
      } finally { gov.matriz = null; }
    });

    it("nunca amplia entre empresas: recepção de outra clínica é recusada mesmo com a permissão ligada", async () => {
      const proto = await novoProtocolo();
      const r = await criar(proto, [consultaMedica(D(16))]);
      gov.matriz = RECEPCAO_LIGADA;
      try {
        const fila = await api("get", "/agendamento/pit-stop", undefined, 104);
        expect(fila.status).toBe(403);
        expect(fila.body.code).toBe("fora_da_empresa");
        expect((await ver(r.body.planoId, 104)).status).toBe(403);
        expect((await abrir(r.body.planoId, 104)).status).toBe(403);
        expect((await q("SELECT estado FROM agendamento_planos WHERE id=$1", [r.body.planoId])).rows[0].estado).toBe("pendente");
      } finally { gov.matriz = null; }
    });

    it("enfermagem (ligada por padrão) também gerencia sem vínculo com o local", async () => {
      const proto = await novoProtocolo();
      const r = await criar(proto, [consultaMedica(D(17))]);
      expect((await abrir(r.body.planoId, 105)).status).toBe(200);
    });
  });

  describe("Home Care: quarta forma, endereço da visita e nível exigido", () => {
    beforeAll(async () => {
      await q(`INSERT INTO agenda_resources(id,name,kind,modality,professional_id,location_id,category_id,google_calendar_id,empresa_id)
          VALUES (40,'AGENDA ENFERMAGEM - HOME CARE','enfermagem','home_care',NULL,NULL,2,'cal-homecare',5);
        INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time) SELECT 40, d, '08:00', '12:00' FROM generate_series(0,6) d;
        INSERT INTO professional_empresas SELECT 202, 5 WHERE false;`);
    });
    const homeCare = (inicio: string) => aplicacao(inicio, { equipe: [{ categoryId: 2, modalidade: "home_care" }] });

    it("Home Care usa a agenda Home Care (sem local fixo), exige endereço e envia ao Google com o endereço da visita, nunca o da sede", async () => {
      gcal.created.length = 0;
      const proto = await novoProtocolo();
      // Sem preferência cadastrada: nenhum profissional é inventado (a pessoa escolhe depois).
      const semPref = await criar(await novoProtocolo(), [homeCare(D(18))], true);
      expect(semPref.body.plano.itens[0].equipe[0]).toMatchObject({ agendaId: 40, professionalIds: [], profissionalOrigem: null });
      await q("INSERT INTO agenda_profissionais_preferidos(empresa_id,agenda_id,professional_id) VALUES (5,40,202)");
      const r = await criar(proto, [homeCare(D(18))], true);
      expect(r.status).toBe(201);
      const item = r.body.plano.itens[0];
      expect(item.homeCare).toBe(true);
      // Preferência única e compatível vira sugestão editável, marcada como tal.
      expect(item.equipe[0]).toMatchObject({ modalidade: "home_care", agendaId: 40, professionalIds: [202], profissionalOrigem: "preferencia" });
      // Sem endereço, a confirmação é recusada e nada é reservado.
      const sem = await confirmar(r.body.planoId, r.body.plano.versao);
      expect(sem.status).toBe(409);
      expect(JSON.stringify(sem.body)).toContain("home_care_sem_endereco");
      expect(await nSessoes(proto)).toBe(0);
      // Paciente sem endereço cadastrado: pedir o do paciente falha de forma explícita.
      const oc = item.ocorrencias[0];
      const semCadastro = await api("put", `/agendamento/planos/${r.body.planoId}/ocorrencias`,
        { versao: r.body.plano.versao, ajustes: [{ id: oc.id, data: oc.data, hora: oc.hora, usarEnderecoPaciente: true }] });
      expect(semCadastro.status).toBe(422);
      expect(semCadastro.body.code).toBe("paciente_sem_endereco");
      // Endereço informado.
      const ok = await api("put", `/agendamento/planos/${r.body.planoId}/ocorrencias`,
        { versao: r.body.plano.versao, ajustes: [{ id: oc.id, data: oc.data, hora: oc.hora, enderecoVisita: "Rua Sintetica 100, Casa B" }] });
      expect(ok.status).toBe(200);
      expect(ok.body.plano.itens[0].ocorrencias[0]).toMatchObject({ enderecoVisita: "Rua Sintetica 100, Casa B", enderecoVisitaOrigem: "informado" });
      const c = await confirmar(r.body.planoId, ok.body.plano.versao);
      expect(c.status).toBe(200);
      expect(c.body.sincronizacao.estado).toBe("sincronizado");
      expect(await sessoes(proto)).toMatchObject([{ resource_id: 40, professional_id: 202 }]);
      expect(gcal.created[0]).toMatchObject({ calendarId: "cal-homecare", locationAddress: "Rua Sintetica 100, Casa B" });
      expect((await q("SELECT service_type FROM sessions WHERE protocol_id=$1", [proto])).rows[0].service_type).toBe("home");
    });

    it("endereço do paciente copiado do cadastro fica marcado como origem paciente; endereço em item que não é Home Care é recusado", async () => {
      const proto = await novoProtocolo();
      await q("UPDATE clients SET address='Av. Sintetica 7, apto 12' WHERE id=$1", [proto - 1000]);
      const r = await criar(proto, [homeCare(D(19))], true);
      const oc = r.body.plano.itens[0].ocorrencias[0];
      expect(r.body.plano.enderecoPaciente).toBe("Av. Sintetica 7, apto 12");
      const ok = await api("put", `/agendamento/planos/${r.body.planoId}/ocorrencias`,
        { versao: r.body.plano.versao, ajustes: [{ id: oc.id, data: oc.data, hora: oc.hora, usarEnderecoPaciente: true }] });
      expect(ok.body.plano.itens[0].ocorrencias[0]).toMatchObject({ enderecoVisita: "Av. Sintetica 7, apto 12", enderecoVisitaOrigem: "paciente" });
      const proto2 = await novoProtocolo();
      const r2 = await criar(proto2, [consultaMedica(D(19))], true);
      const oc2 = r2.body.plano.itens[0].ocorrencias[0];
      const negado = await api("put", `/agendamento/planos/${r2.body.planoId}/ocorrencias`,
        { versao: r2.body.plano.versao, ajustes: [{ id: oc2.id, data: oc2.data, hora: oc2.hora, enderecoVisita: "Rua X" }] });
      expect(negado.status).toBe(400);
      expect(negado.body.code).toBe("endereco_so_home_care");
    });

    it("procedimento que exige enfermeiro não aceita técnica; o servidor reaplica o requisito mesmo se a tela o omitir", async () => {
      await q(`INSERT INTO procedimentos_clinicos(id,empresa_id,nome,duracao_segundos,ativo) VALUES (10,5,'Procedimento so enfermeiro',1800,true);
        INSERT INTO procedimento_equipes(procedimento_id,area_id,location_id,exige_nivel) VALUES (10,2,50,'enfermeiro');
        UPDATE professionals SET habilitacao_nivel='tecnico_enfermagem' WHERE id=202;
        UPDATE professionals SET habilitacao_nivel='enfermeiro' WHERE id=207;`);
      const proto = await novoProtocolo();
      const tecnica = await criar(proto, [{ procedimentoId: 10, dataInicio: D(20), equipe: [{ categoryId: 2, professionalIds: [202] }] }]);
      expect(tecnica.status).toBe(409);
      expect(JSON.stringify(tecnica.body)).toContain("nivel_exigido_nao_atendido");
      const semNivel = await criar(await novoProtocolo(), [{ procedimentoId: 10, dataInicio: D(20), equipe: [{ categoryId: 2, professionalIds: [202], exigeNivel: null }] }]);
      expect(semNivel.status).toBe(409);
      const enfermeira = await criar(await novoProtocolo(), [{ procedimentoId: 10, dataInicio: D(20), equipe: [{ categoryId: 2, professionalIds: [207] }] }]);
      expect(enfermeira.status).toBe(201);
      expect(enfermeira.body.plano.itens[0].equipe[0].exigeNivel).toBe("enfermeiro");
    });
  });
});


// ───────────────────────── Conferência Google x sistema ─────────────────────────
describe("Conferência Google: renomeia por id real do calendário, cria o que falta e nunca cruza empresas", () => {
  const ADMIN = { "x-test-admin": "1" };
  const prev = (empresa = 5, extra: Record<string, string> = ADMIN) => api("get", "/agenda/google/reconciliacao", undefined, 101, { "x-test-empresa": String(empresa), ...extra });
  const aplicar = (body: any, empresa = 5, extra: Record<string, string> = ADMIN) => api("post", "/agenda/google/reconciliacao/aplicar", body, 101, { "x-test-empresa": String(empresa), ...extra });
  const nomeDe = async (id: number) => (await q("SELECT name FROM agenda_resources WHERE id=$1", [id])).rows[0].name as string;

  beforeAll(async () => {
    await q(`SELECT setval('agenda_resources_id_seq', 500);
      INSERT INTO locations(id,empresa_id,active,google_calendar_id,name,agenda_papel) VALUES (51,5,'true','g-enf-local','AGENDA ENFERMAGEM - LOCAL','local');
      INSERT INTO agenda_resources(id,name,kind,modality,professional_id,location_id,category_id,google_calendar_id,empresa_id) VALUES
        (51,'AGENDA ENFERMAGEM - LOCAL','enfermagem','local',NULL,51,2,'g-enf-local',5),
        (52,'AGENDA MEDICO - CAIO PADUA - LOCAL','medico','local',201,NULL,1,'g-caio-local',5),
        (53,'AGENDA MEDICO - CAIO PADUA - ONLINE','medico','online',201,NULL,1,'g-caio-online',5),
        (54,'NOME INTERNO DA OUTRA CLINICA','medico','local',204,NULL,1,'g-outra',6);`);
    gcal.calendars = [
      { id: "g-enf-local", nome: "AGENDA ENFERMAGEM - SEDE" }, { id: "g-caio-local", nome: "AGENDA MEDICO - CAIO PADUA - SEDE" },
      { id: "g-caio-online", nome: "AGENDA MEDICO - CAIO PADUA - ON LINE" }, { id: "g-caio-hc", nome: "AGENDA MEDICO - CAIO PADUA - HOME CARE" },
      { id: "g-enf-hc", nome: "AGENDA ENFERMAGEM - HOME CARE" }, { id: "g-outra", nome: "AGENDA PRIVADA DA OUTRA CLINICA" },
      { id: "g-pessoal", nome: "AGENDA PESSOAL - CAIO HENRIQUE PADUA" }, { id: "g-niver", nome: "Aniversários" }, { id: "g-geral", nome: "AGENDA GERAL" },
      { id: "g-desconhecida", nome: "Agenda do churrasco" },
    ];
  });

  it("sem permissão administrativa é recusado; pré-visualizar não altera nada", async () => {
    expect((await prev(5, {})).status).toBe(403);
    const r = await prev();
    expect(r.status).toBe(200);
    const por = (id: string) => r.body.itens.find((i: any) => i.googleCalendarId === id);
    expect(por("g-enf-local")).toMatchObject({ acao: "renomear", agendaId: 51, localId: 51, nomeDepois: "AGENDA ENFERMAGEM - SEDE" });
    expect(por("g-caio-online")).toMatchObject({ acao: "renomear", nomeDepois: "AGENDA MEDICO - CAIO PADUA - ON LINE" });
    expect(por("g-caio-hc")).toMatchObject({ acao: "criar", forma: "home_care", professionalId: 201 });
    expect(por("g-enf-hc")).toMatchObject({ acao: "criar", forma: "home_care", professionalId: null });
    expect(por("g-outra")).toMatchObject({ acao: "relatar", motivo: "de_outra_empresa" });
    expect(JSON.stringify(por("g-outra"))).not.toContain("INTERNO"); // não revela dado da outra empresa
    expect(por("g-pessoal").motivo).toBe("agenda_pessoal_ou_geral");
    expect(por("g-niver").motivo).toBe("agenda_pessoal_ou_geral");
    expect(por("g-geral").motivo).toBe("agenda_pessoal_ou_geral");
    expect(por("g-desconhecida").motivo).toBe("fora_do_padrao");
    expect(await nomeDe(51)).toBe("AGENDA ENFERMAGEM - LOCAL");
  });

  it("sem confirmação explícita ou sem conta Google confirmada, nada é aplicado e a falta é mostrada", async () => {
    expect((await aplicar({})).status).toBe(400);
    gcal.accountOk = false;
    try {
      const r = await aplicar({ confirmar: true });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("google_conta_nao_confirmada");
      expect(r.body.faltando.length).toBeGreaterThan(0);
      expect(await nomeDe(51)).toBe("AGENDA ENFERMAGEM - LOCAL");
    } finally { gcal.accountOk = true; }
  });

  it("aplicar renomeia pelo id (agenda e local), cria as agendas novas sem local, preserva sessões e a outra empresa, e repetir não duplica", async () => {
    const sessoesAntes = (await q("SELECT count(*)::int n FROM sessions")).rows[0].n;
    const r = await aplicar({ confirmar: true });
    expect(r.status).toBe(200);
    expect(r.body.falhas).toEqual([]);
    expect(await nomeDe(51)).toBe("AGENDA ENFERMAGEM - SEDE");
    expect(await nomeDe(52)).toBe("AGENDA MEDICO - CAIO PADUA - SEDE");
    expect(await nomeDe(53)).toBe("AGENDA MEDICO - CAIO PADUA - ON LINE");
    expect((await q("SELECT name FROM locations WHERE id=51")).rows[0].name).toBe("AGENDA ENFERMAGEM - SEDE");
    expect(await nomeDe(54)).toBe("NOME INTERNO DA OUTRA CLINICA");
    const novas = (await q("SELECT id,name,modality,professional_id,location_id,empresa_id,category_id FROM agenda_resources WHERE google_calendar_id IN ('g-caio-hc','g-enf-hc') ORDER BY google_calendar_id")).rows;
    expect(novas).toMatchObject([
      { name: "AGENDA MEDICO - CAIO PADUA - HOME CARE", modality: "home_care", professional_id: 201, location_id: null, empresa_id: 5, category_id: 1 },
      { name: "AGENDA ENFERMAGEM - HOME CARE", modality: "home_care", professional_id: null, location_id: null, empresa_id: 5, category_id: 2 },
    ]);
    expect((await q("SELECT count(*)::int n FROM sessions")).rows[0].n).toBe(sessoesAntes);
    expect((await q("SELECT count(*)::int n FROM agenda_google_reconciliacoes WHERE empresa_id=5")).rows[0].n).toBeGreaterThanOrEqual(5);
    // Repetir: nada a fazer, nenhuma agenda duplicada.
    const total = (await q("SELECT count(*)::int n FROM agenda_resources")).rows[0].n;
    const de_novo = await aplicar({ confirmar: true });
    expect(de_novo.body.aplicados).toEqual([]);
    expect((await q("SELECT count(*)::int n FROM agenda_resources")).rows[0].n).toBe(total);
    expect(de_novo.body.depois.resumo.renomear ?? 0).toBe(0);
    expect(de_novo.body.depois.resumo.criar ?? 0).toBe(0);
  });

  it("empresa 6 nunca renomeia nem enxerga as agendas da empresa 5", async () => {
    const r = await prev(6);
    expect(r.status).toBe(200);
    const doCinco = r.body.itens.filter((i: any) => ["g-enf-local", "g-caio-local", "g-caio-online"].includes(i.googleCalendarId));
    expect(doCinco.every((i: any) => i.acao === "relatar" && i.motivo === "de_outra_empresa")).toBe(true);
    const nomeAntes = await nomeDe(51);
    await aplicar({ confirmar: true }, 6);
    expect(await nomeDe(51)).toBe(nomeAntes);
    expect((await q("SELECT count(*)::int n FROM agenda_resources WHERE empresa_id=6 AND google_calendar_id IN ('g-enf-local','g-caio-local')")).rows[0].n).toBe(0);
  });

  it("preferência de profissional da agenda: só do corpo clínico da empresa e da mesma categoria", async () => {
    const hc = (await q("SELECT id FROM agenda_resources WHERE google_calendar_id='g-enf-hc'")).rows[0].id;
    const put = (ids: number[], empresa = 5, extra = ADMIN) => api("put", `/agenda/resources/${hc}/profissionais-preferidos`, { professionalIds: ids }, 101, { "x-test-empresa": String(empresa), ...extra });
    expect((await put([207], 5, {} as any)).status).toBe(403);
    expect((await put([201])).status).toBe(409); // médico em agenda de enfermagem
    expect((await put([204])).status).toBe(409); // outra empresa
    expect((await put([207])).status).toBe(200);
    expect((await put([207], 6)).status).toBe(404); // agenda de outra empresa
    const lista = await api("get", `/agenda/resources/${hc}/profissionais-preferidos`);
    expect(lista.body.profissionais.map((p: any) => p.id)).toEqual([207]);
  });
});

// ───────────────────────── Documentos dos profissionais ─────────────────────────
describe("Documentos do profissional: upload, visualização protegida, empresa, permissão e auditoria", () => {
  const png = (extra = "a") => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`documento-sintetico-${extra}`)]);
  const DONO = 106, TITULAR = 107, RECEP = 103, OUTRA = 104;
  const enviar = (alvo: number, ator: number, buf: Buffer, campos: Record<string, string> = { tipo: "carteira_conselho" }, nome = "carteira.png", empresa = 5) => {
    let r = (request(app) as any).post(`/professionals/${alvo}/documentos`).set("x-test-role", "admin").set("x-test-prof", String(ator)).set("x-test-empresa", String(empresa));
    for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
    return r.attach("file", buf, nome);
  };
  const anexos = (alvo: number, ator: number, empresa = 5) => api("get", `/professionals/${alvo}/documentos`, undefined, ator, { "x-test-empresa": String(empresa) });
  let docId = 0;

  beforeAll(async () => {
    await q(`INSERT INTO professionals(id,name,area_id,active,empresa_id,category,is_platform_owner) VALUES
      (106,'Dono Sintetico',1,true,5,'medico',true),(107,'Tecnica Sintetica',2,true,5,'enfermagem',false)`);
  });

  it("proprietário envia; arquivo vai ao armazenamento privado fora de uploads/ e o registro guarda metadados e impressão digital", async () => {
    const r = await enviar(TITULAR, DONO, png("1"), { tipo: "carteira_conselho", titulo: "Carteira COREN" });
    expect(r.status).toBe(201);
    docId = r.body.documento.id;
    expect(r.body.documento).toMatchObject({ tipo: "carteira_conselho", mime: "image/png", situacao: "pendente_confirmacao", enviadoPor: DONO });
    const linha = (await q("SELECT storage_path, sha256 FROM profissional_documentos WHERE id=$1", [docId])).rows[0];
    expect(linha.storage_path.startsWith("uploads/")).toBe(false);
    expect(linha.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(armazem.has(linha.storage_path)).toBe(true);
    expect((await q("SELECT acao FROM profissional_documento_auditoria WHERE documento_id=$1", [docId])).rows.map((x) => x.acao)).toEqual(["enviou"]);
  });

  it("recusa conteúdo que não é PDF/imagem (mesmo com nome .png), arquivo repetido e tipo inválido", async () => {
    expect((await enviar(TITULAR, DONO, Buffer.from("MZ executavel disfarcado"), { tipo: "outro" }, "foto.png")).status).toBe(415);
    const dup = await enviar(TITULAR, DONO, png("1"));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("documento_duplicado");
    expect((await enviar(TITULAR, DONO, png("2"), { tipo: "inventado" })).status).toBe(400);
    expect((await q("SELECT count(*)::int n FROM profissional_documentos WHERE professional_id=$1", [TITULAR])).rows[0].n).toBe(1);
  });

  it("visualização devolve os mesmos bytes, sem cache, e registra quem viu", async () => {
    const r = await api("get", `/professionals/${TITULAR}/documentos/${docId}/arquivo`, undefined, DONO).buffer(true).parse((res: any, cb: any) => {
      const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["content-type"]).toContain("image/png");
    expect(Buffer.compare(r.body, png("1"))).toBe(0);
    expect((await q("SELECT ator_id FROM profissional_documento_auditoria WHERE documento_id=$1 AND acao='visualizou'", [docId])).rows).toEqual([{ ator_id: DONO }]);
  });

  it("permissão: recepção sem liberação é recusada; liberada na matriz, vê; o titular vê os próprios; outro colega não", async () => {
    gov.matriz = null;
    expect((await anexos(TITULAR, RECEP)).status).toBe(403);
    expect((await enviar(TITULAR, RECEP, png("3"))).status).toBe(403);
    expect((await anexos(TITULAR, 105)).status).toBe(403); // colega de enfermagem
    expect((await anexos(TITULAR, TITULAR)).status).toBe(200);
    gov.matriz = { documentos_profissionais: { recepcao: true } };
    try {
      const r = await anexos(TITULAR, RECEP);
      expect(r.status).toBe(200);
      expect(r.body.documentos).toHaveLength(1);
    } finally { gov.matriz = null; }
  });

  it("empresa: profissional de outra empresa responde 404 e recepção de outra empresa não vê nada, mesmo liberada", async () => {
    gov.matriz = { documentos_profissionais: { recepcao: true } };
    try {
      expect((await anexos(TITULAR, OUTRA, 6)).status).toBe(404);
      expect((await api("get", `/professionals/${TITULAR}/documentos/${docId}/arquivo`, undefined, OUTRA, { "x-test-empresa": "6" })).status).toBe(404);
      expect((await enviar(204, DONO, png("4"), { tipo: "outro" })).status).toBe(404); // alvo de outra empresa
    } finally { gov.matriz = null; }
  });

  it("o titular não confirma o próprio documento; o proprietário confirma, marca titular divergente e arquiva sem apagar o arquivo", async () => {
    const auto = await api("patch", `/professionals/${TITULAR}/documentos/${docId}`, { situacao: "confirmado" }, TITULAR);
    expect(auto.status).toBe(403);
    const conf = await api("patch", `/professionals/${TITULAR}/documentos/${docId}`, { situacao: "confirmado" }, DONO);
    expect(conf.body.documento.situacao).toBe("confirmado");
    const comp = await enviar(TITULAR, DONO, png("5"), { tipo: "comprovante_endereco", titularDeclarado: "Outra Pessoa", titularDivergente: "true", observacao: "Conta em nome de terceiro" }, "conta.png");
    expect(comp.body.documento).toMatchObject({ situacao: "titular_divergente", titularDeclarado: "Outra Pessoa" });
    const arq = await api("patch", `/professionals/${TITULAR}/documentos/${comp.body.documento.id}`, { situacao: "arquivado" }, DONO);
    expect(arq.body.documento.arquivadoEm).toBeTruthy();
    expect((await anexos(TITULAR, DONO)).body.documentos.map((d: any) => d.id)).toEqual([docId]);
    expect((await api("get", `/professionals/${TITULAR}/documentos?arquivados=1`, undefined, DONO)).body.documentos).toHaveLength(2);
    const caminho = (await q("SELECT storage_path FROM profissional_documentos WHERE id=$1", [comp.body.documento.id])).rows[0].storage_path;
    expect(armazem.has(caminho)).toBe(true); // arquivar não apaga o original
  });

  it("dados lidos do documento ficam como sugestão; só aceitar grava no cadastro, guarda o valor anterior e o titular não aceita", async () => {
    const sug = await api("post", `/professionals/${TITULAR}/documentos/${docId}/dados`, { dados: [
      { campo: "registro_conselho", valor: "COREN-SP" }, { campo: "registro_numero", valor: "001.752.003" }, { campo: "habilitacao", valor: "tecnico_enfermagem" }] }, DONO);
    expect(sug.status).toBe(201);
    const antes = (await q("SELECT registration_council, registration_number, habilitacao_nivel FROM professionals WHERE id=$1", [TITULAR])).rows[0];
    expect(antes).toMatchObject({ registration_council: null, registration_number: null, habilitacao_nivel: null }); // sugerir não grava
    expect((await api("patch", `/professionals/${TITULAR}/documentos/${docId}/dados/registro_numero`, { acao: "aceitar" }, TITULAR)).status).toBe(403);
    expect((await api("patch", `/professionals/${TITULAR}/documentos/${docId}/dados/registro_numero`, { acao: "aceitar" }, DONO)).status).toBe(200);
    expect((await api("patch", `/professionals/${TITULAR}/documentos/${docId}/dados/habilitacao`, { acao: "recusar" }, DONO)).status).toBe(200);
    const depois = (await q("SELECT registration_number, habilitacao_nivel FROM professionals WHERE id=$1", [TITULAR])).rows[0];
    expect(depois).toMatchObject({ registration_number: "001.752.003", habilitacao_nivel: null }); // recusado não grava
    expect((await api("patch", `/professionals/${TITULAR}/documentos/${docId}/dados/registro_numero`, { acao: "aceitar" }, DONO)).status).toBe(409);
    expect((await api("post", `/professionals/${TITULAR}/documentos/${docId}/dados`, { dados: [{ campo: "cpf", valor: "123" }] }, DONO)).status).toBe(400);
  });
});
