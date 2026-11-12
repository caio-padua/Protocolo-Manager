import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFile } from "node:fs/promises";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
// Google simulado: nenhum evento real é criado. "fail" simula erro do Google; "accountOk" simula a conta da clínica.
const gcal = vi.hoisted(() => ({ fail: false, accountOk: true, created: [] as any[], updated: 0 }));
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
  verifyClinicAccount: async () => gcal.accountOk ? { ok: true, account: "clinica@sintetico.test" } : { ok: false, account: null },
}));
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
  req.tenantContext = { authenticated: !!role, empresaId: 5, professionalId: 101 } as any;
  next();
}, router, pitRouter, (err: any, _req: any, res: any, _next: any) => { res.status(500).json({ error: String(err?.message ?? err), cause: String(err?.cause?.message ?? "") }); });
const q = (text: string, params?: any[]) => isolated.pool.query(text, params);
const api = (method: "get" | "post" | "put", url: string, body?: any, prof = 101) =>
  (request(app) as any)[method](url).set("x-test-role", "admin").set("x-test-prof", String(prof)).send(body);
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

  it("a fila do Pit Stop mostra o plano para quem tem vínculo com o local do cliente e esconde de quem não tem", async () => {
    const proto = await novoProtocolo();
    const r = await criar(proto, [consultaMedica(D(14))]);
    const fila = await api("get", "/agendamento/pit-stop?estado=pendente", undefined, 102);
    expect(fila.body.planos.some((p: any) => p.id === r.body.planoId)).toBe(true);
    await q("INSERT INTO professionals VALUES (103,'Sem vinculo Sintetico',2,true,5)");
    const vazia = await api("get", "/agendamento/pit-stop", undefined, 103);
    expect(vazia.body.planos.some((p: any) => p.id === r.body.planoId)).toBe(false);
  });
});
