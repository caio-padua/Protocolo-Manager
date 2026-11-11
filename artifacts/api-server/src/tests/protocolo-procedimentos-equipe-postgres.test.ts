import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
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
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-role"]) { res.status(401).json({ error: "Não autenticado" }); return; }
    req.collaborator = { professionalId: 101 }; next();
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
import { PROCEDIMENTOS_SCHEMA_SQL } from "../lib/procedimentos-schema";
import { AGENDA_CATEGORIA_AUDITORIA_DDL } from "../lib/agenda-recurso-categoria";
import { brtISODate } from "../lib/brt";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), (req: any, _res: any, next: any) => {
  const role = req.headers["x-test-role"];
  req.tenantContext = { authenticated: !!role, empresaId: 5, professionalId: 101 } as any;
  next();
}, router, (err: any, _req: any, res: any, _next: any) => { res.status(500).json({ error: String(err?.message ?? err), cause: String(err?.cause?.message ?? "") }); });
const q = (text: string, params?: any[]) => isolated.pool.query(text, params);
const api = (method: "get" | "post", url: string, body?: any) =>
  (request(app) as any)[method](url).set("x-test-role", "admin").send(body);
const day = (n: number) => { const d = new Date(`${brtISODate()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DATE = day(10);
const DATE2 = day(11); // dia limpo, para testes que não dependem da ocupação dos anteriores
const DATE3 = day(12); // dia limpo do cenário do Botox (médico OU biomédico)

const PROC = { consulta: 1, aplicacao: 2, biomed: 3, fisio: 4, conjunta: 5, trio: 6, implante: 7, outraClinica: 8, botox: 9 };
let protoSeq = 0;
// Cada teste usa um cliente e um protocolo próprios (sintéticos).
async function novoProtocolo(empresa = 5) {
  const n = ++protoSeq;
  await q("INSERT INTO clients(id,status,empresa_id,clinica_origem_empresa_id) VALUES ($1,'active',$2,$2)", [1000 + n, empresa]);
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

describe("protocolo por procedimento com equipe, no banco isolado", () => {
  it("exige sessão autenticada e a clínica do protocolo", async () => {
    const proto = await novoProtocolo();
    expect((await request(app).post(`/protocols/${proto}/procedimentos`).send({ procedimentoId: PROC.consulta })).status).toBe(401);
    const outra = await novoProtocolo(6);
    expect((await incluir(outra, { procedimentoId: PROC.consulta })).status).toBe(404);
    expect((await q("SELECT count(*)::int n FROM protocolo_procedimentos")).rows[0].n).toBe(0);
  });

  it("consulta só médica, sem substância nem dose, não exige agenda de enfermagem", async () => {
    const proto = await novoProtocolo();
    const add = await incluir(proto, { procedimentoId: PROC.consulta });
    expect(add.status).toBe(201);
    expect(add.body.itens[0]).toMatchObject({ nome: "Consulta medica", equipeOrigem: "padrao_procedimento", produtoId: null, dose: null });
    const horarios = await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/horarios`, { from: DATE, to: DATE });
    expect(horarios.status).toBe(200);
    const h = horarios.body.dias[0].horarios;
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((x: any) => x.participantes.length === 1 && x.participantes[0].resourceId === 1)).toBe(true);
    const res = await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/reservar`, { numero: 1, date: DATE, time: "08:00" });
    expect(res.status).toBe(201);
    expect(await sessoes(proto)).toEqual([{ resource_id: 1, professional_id: 201, scheduled_time: "08:00", duration_minutes: 30 }]);
  });

  it("aplicação só de enfermagem não exige agenda médica e nunca usa agenda legada sem categoria", async () => {
    const proto = await novoProtocolo();
    const add = await incluir(proto, { procedimentoId: PROC.aplicacao, produtoId: 901, dose: "10 mg" });
    expect(add.status).toBe(201);
    const res = await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/reservar`, { numero: 1, date: DATE, time: "08:00" });
    expect(res.status).toBe(201);
    const rows = await sessoes(proto);
    expect(rows).toHaveLength(1);
    expect([2, 3]).toContain(rows[0].resource_id);
    expect(rows[0].resource_id).not.toBe(7);
  });

  it("biomédico individual e categoria nova (fisioterapia, agenda compartilhada, 60 min) reservam e bloqueiam a duração inteira", async () => {
    const bio = await novoProtocolo();
    const addBio = await incluir(bio, { procedimentoId: PROC.biomed });
    expect((await api("post", `/protocols/${bio}/procedimentos/${addBio.body.itemId}/reservar`, { numero: 1, date: DATE, time: "08:30" })).status).toBe(201);
    expect(await sessoes(bio)).toMatchObject([{ resource_id: 4, professional_id: 203 }]);

    const fisio = await novoProtocolo();
    const addFisio = await incluir(fisio, { procedimentoId: PROC.fisio });
    expect((await api("post", `/protocols/${fisio}/procedimentos/${addFisio.body.itemId}/reservar`, { numero: 1, date: DATE, time: "08:00" })).status).toBe(201);
    expect(await sessoes(fisio)).toEqual([{ resource_id: 5, professional_id: null, scheduled_time: "08:00", duration_minutes: 60 }]);
    // Segundo cliente no meio da hora já ocupada: recusado, nada gravado.
    const outro = await novoProtocolo();
    const addOutro = await incluir(outro, { procedimentoId: PROC.fisio });
    const meio = await api("post", `/protocols/${outro}/procedimentos/${addOutro.body.itemId}/reservar`, { numero: 1, date: DATE, time: "08:30" });
    expect(meio.status).toBe(409);
    expect(meio.body.code).toBe("horario_indisponivel");
    expect(await sessoes(outro)).toEqual([]);
  });

  it("equipe conjunta reserva médico e enfermagem juntos; se um deles está ocupado, nada é gravado", async () => {
    const proto = await novoProtocolo();
    const add = await incluir(proto, { procedimentoId: PROC.conjunta });
    // 08:00 já tem o médico ocupado (consulta anterior): a busca não oferece esse horário.
    const horarios = (await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/horarios`, { from: DATE, to: DATE })).body.dias[0].horarios;
    expect(horarios.some((h: any) => h.time === "08:00")).toBe(false);
    expect(horarios.length).toBeGreaterThan(0);
    const antes = (await q("SELECT count(*)::int n FROM sessions")).rows[0].n;
    const recusa = await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/reservar`, { numero: 1, date: DATE, time: "08:00" });
    expect(recusa.status).toBe(409);
    expect((await q("SELECT count(*)::int n FROM sessions")).rows[0].n).toBe(antes);
    expect((await q("SELECT count(*)::int n FROM protocolo_ocorrencias WHERE protocolo_procedimento_id=$1", [add.body.itemId])).rows[0].n).toBe(0);
    const livre = horarios[0];
    const ok = await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/reservar`, { numero: 1, date: DATE, time: livre.time });
    expect(ok.status).toBe(201);
    expect(ok.body.participantes).toHaveLength(2);
    const rows = await sessoes(proto);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r: any) => r.scheduled_time))).toEqual(new Set([livre.time]));
    expect(rows.some((r: any) => r.resource_id === 1 && r.professional_id === 201)).toBe(true);
    expect(rows.some((r: any) => [2, 3].includes(r.resource_id))).toBe(true);
  });

  it("equipe de três participantes reserva três agendas distintas", async () => {
    const proto = await novoProtocolo();
    const add = await incluir(proto, { procedimentoId: PROC.trio });
    const horarios = (await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/horarios`, { from: DATE, to: DATE })).body.dias[0].horarios;
    const ok = await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/reservar`, { numero: 1, date: DATE, time: horarios[0].time });
    expect(ok.status).toBe(201);
    const rows = await sessoes(proto);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r: any) => r.resource_id)).size).toBe(3);
  });

  it("o prescritor altera a equipe (até 3) sem mudar o cadastro do procedimento", async () => {
    const antes = (await q("SELECT count(*)::int n FROM procedimento_equipes WHERE ativo")).rows[0].n;
    const proto = await novoProtocolo();
    const add = await incluir(proto, { procedimentoId: PROC.aplicacao, equipe: [{ categoryId: 2 }, { categoryId: 8, professionalIds: [203] }] });
    expect(add.status).toBe(201);
    expect(add.body.itens[0]).toMatchObject({ equipeOrigem: "prescritor" });
    expect(add.body.itens[0].equipe.map((e: any) => e.categoryName)).toEqual(["Enfermagem", "Biomedicina"]);
    expect((await q("SELECT count(*)::int n FROM procedimento_equipes WHERE ativo")).rows[0].n).toBe(antes);
    expect((await incluir(proto, { procedimentoId: PROC.aplicacao, equipe: [{ categoryId: 1 }, { categoryId: 2 }, { categoryId: 8 }, { categoryId: 20 }] })).status).toBe(400);
  });

  it("implante mantém médico e enfermagem mesmo com equipe alterada", async () => {
    const proto = await novoProtocolo();
    expect((await incluir(proto, { procedimentoId: PROC.implante, equipe: [{ categoryId: 2 }] })).status).toBe(422);
    expect((await incluir(proto, { procedimentoId: PROC.implante })).status).toBe(201);
  });

  it("recusa categoria sem agenda confirmada, profissional incompatível e procedimento de outra clínica", async () => {
    const proto = await novoProtocolo();
    const semAgenda = await incluir(proto, { procedimentoId: PROC.aplicacao, equipe: [{ categoryId: 40 }] });
    expect(semAgenda.status).toBe(201); // equipe válida: a categoria existe
    const horarios = await api("post", `/protocols/${proto}/procedimentos/${semAgenda.body.itemId}/horarios`, { from: DATE, to: DATE });
    expect(horarios.status).toBe(422);
    expect(horarios.body.code).toBe("sem_agenda_da_categoria");
    expect((await incluir(proto, { procedimentoId: PROC.aplicacao, equipe: [{ categoryId: 8, professionalIds: [202] }] })).status).toBe(409);
    expect((await incluir(proto, { procedimentoId: PROC.aplicacao, equipe: [{ categoryId: 8, professionalIds: [204] }] })).status).toBe(409);
    expect((await incluir(proto, { procedimentoId: PROC.aplicacao, equipe: [{ categoryId: 999 }] })).status).toBe(404);
    expect((await incluir(proto, { procedimentoId: PROC.outraClinica })).status).toBe(404);
    expect((await incluir(proto, { procedimentoId: PROC.aplicacao, equipe: [{ categoryId: 2, professionalIds: [202] }, { categoryId: 2, professionalIds: [202] }] })).status).toBe(409);
  });

  it("ocorrência repetida, número fora do total e data passada são recusados", async () => {
    const proto = await novoProtocolo();
    const add = await incluir(proto, { procedimentoId: PROC.biomed, totalSessoes: 2 });
    const url = `/protocols/${proto}/procedimentos/${add.body.itemId}/reservar`;
    expect((await api("post", url, { numero: 1, date: DATE2, time: "09:00" })).status).toBe(201);
    expect((await api("post", url, { numero: 1, date: DATE2, time: "09:30" })).body.code).toBe("ocorrencia_ja_reservada");
    expect((await api("post", url, { numero: 3, date: DATE2, time: "09:30" })).body.code).toBe("numero_invalido");
    expect((await api("post", url, { numero: 2, date: day(-2), time: "09:30" })).body.code).toBe("data_passada");
    expect((await sessoes(proto))).toHaveLength(1);
  });

  it("duas reservas simultâneas do mesmo horário: uma vence, a outra é recusada", async () => {
    const a = await novoProtocolo();
    const b = await novoProtocolo();
    const ia = (await incluir(a, { procedimentoId: PROC.consulta })).body.itemId;
    const ib = (await incluir(b, { procedimentoId: PROC.consulta })).body.itemId;
    const [ra, rb] = await Promise.all([
      api("post", `/protocols/${a}/procedimentos/${ia}/reservar`, { numero: 1, date: DATE, time: "10:00" }),
      api("post", `/protocols/${b}/procedimentos/${ib}/reservar`, { numero: 1, date: DATE, time: "10:00" }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    expect((await q("SELECT count(*)::int n FROM sessions WHERE resource_id=1 AND scheduled_time='10:00'")).rows[0].n).toBe(1);
  });
});

describe("Botox fictício: uma necessidade, médico OU biomédico (Márcio-like sem vínculo de local)", () => {
  beforeAll(async () => {
    await q(`
      INSERT INTO professionals VALUES (208,'MARCIO SINTETICO',8,true,5),(209,'Biomedico inativo',8,false,5);
      -- Agendas NOVAS: sem registro de local, a clínica fica na própria agenda.
      INSERT INTO agenda_resources(id,name,kind,professional_id,location_id,category_id,sort_order,empresa_id) VALUES
        (20,'Agenda Marcio (nova, sem local)','categoria',208,NULL,8,5,5),
        (21,'Agenda biomedico inativo (nova)','categoria',209,NULL,8,0,5),
        (22,'Agenda biomedico outra clinica (nova)','categoria',204,NULL,8,0,6);
      INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time)
        SELECT r, d, '08:00', '12:00' FROM unnest(ARRAY[20,21,22]) r, generate_series(0,6) d;
      -- Configuração da clínica: a equipe padrão do Botox aceita médico OU biomédico para a MESMA pessoa.
      INSERT INTO procedimento_equipes_alternativas(equipe_id, area_id)
        SELECT id, 8 FROM procedimento_equipes WHERE procedimento_id=9 AND area_id=1;
    `);
  });
  const botox = async (equipe?: any[]) => {
    const proto = await novoProtocolo();
    const add = await incluir(proto, { procedimentoId: PROC.botox, ...(equipe ? { equipe } : {}) });
    expect(add.status).toBe(201);
    return { proto, item: add.body.itemId as number, add };
  };
  const reservar = (proto: number, item: number, time: string) =>
    api("post", `/protocols/${proto}/procedimentos/${item}/reservar`, { numero: 1, date: DATE3, time });

  it("a equipe padrão traz as alternativas e a ficha de teste não prova habilitação", async () => {
    const { add } = await botox();
    expect(add.body.itens[0].equipe).toHaveLength(1);
    expect(add.body.itens[0].equipe[0]).toMatchObject({ categoryName: "Medicina", alternativeCategoryIds: [8] });
  });

  it("atende UMA pessoa: médico quando livre; senão um biomédico (inclusive o da agenda nova sem local); nunca os dois; nunca inativo nem outra clínica", async () => {
    // 1º Botox às 09:00: médico (agenda 1) livre e primeiro na ordem.
    const a = await botox(); expect((await reservar(a.proto, a.item, "09:00")).status).toBe(201);
    expect(await sessoes(a.proto)).toMatchObject([{ resource_id: 1, professional_id: 201 }]);
    // 2º e 3º no mesmo horário: médico ocupado -> os dois biomédicos ativos da clínica (agenda 4, e agenda 20 sem local).
    const b = await botox(); expect((await reservar(b.proto, b.item, "09:00")).status).toBe(201);
    const c1 = await botox(); expect((await reservar(c1.proto, c1.item, "09:00")).status).toBe(201);
    const usadasB = [...(await sessoes(b.proto)), ...(await sessoes(c1.proto))];
    expect(usadasB).toHaveLength(2); // UMA sessão por Botox, nunca médico + biomédico juntos
    expect(usadasB.map((r: any) => r.resource_id).sort((x: number, y: number) => x - y)).toEqual([4, 20]);
    expect(usadasB.find((r: any) => r.resource_id === 20)).toMatchObject({ professional_id: 208, duration_minutes: 30 });
    // 4º: ninguém livre. Agendas 21 (profissional inativo) e 22 (outra clínica) não entram.
    const c = await botox(); const rc = await reservar(c.proto, c.item, "09:00");
    expect(rc.status).toBe(409);
    expect(rc.body.code).toBe("horario_indisponivel");
    expect(await sessoes(c.proto)).toEqual([]);
    const usadas = (await q("SELECT DISTINCT resource_id FROM sessions WHERE resource_id IN (21,22)")).rows;
    expect(usadas).toEqual([]);
  });

  it("a busca de horários oferece o horário se QUALQUER alternativa estiver livre (e só uma pessoa por horário)", async () => {
    const x = await botox();
    const h = (await api("post", `/protocols/${x.proto}/procedimentos/${x.item}/horarios`, { from: DATE3, to: DATE3 })).body.dias[0].horarios;
    expect(h.some((i: any) => i.time === "09:00")).toBe(false);
    expect(h.some((i: any) => i.time === "09:30")).toBe(true);
    expect(h.every((i: any) => i.participantes.length === 1)).toBe(true);
  });

  it("habilitação configurável: lista de profissionais habilitados restringe quem atende, sem lista fixa por categoria", async () => {
    const x = await botox([{ categoryId: 1, alternativeCategoryIds: [8], professionalIds: [208] }]);
    expect(x.add.body.itens[0]).toMatchObject({ equipeOrigem: "prescritor" });
    // 08:00 fica no primeiro bloco do dia (blocos seguintes só abrem depois que o anterior enche).
    expect((await reservar(x.proto, x.item, "08:00")).status).toBe(201);
    // Médico 201 estava livre, mas não está na lista habilitada: atende só Márcio.
    expect(await sessoes(x.proto)).toMatchObject([{ resource_id: 20, professional_id: 208 }]);
  });

  it("recusa alternativa igual à principal, profissional inativo/outra clínica/categoria fora do conjunto e implante sem exigência", async () => {
    const proto = await novoProtocolo();
    const tenta = (equipe: any[], procedimentoId = PROC.botox) => incluir(proto, { procedimentoId, equipe });
    expect((await tenta([{ categoryId: 1, alternativeCategoryIds: [1] }])).status).toBe(400);
    expect((await tenta([{ categoryId: 1, alternativeCategoryIds: [8], professionalIds: [209] }])).status).toBe(409);
    expect((await tenta([{ categoryId: 1, alternativeCategoryIds: [8], professionalIds: [204] }])).status).toBe(409);
    expect((await tenta([{ categoryId: 1, alternativeCategoryIds: [8], professionalIds: [206] }])).status).toBe(409);
    expect((await tenta([{ categoryId: 1, alternativeCategoryIds: [999] }])).status).toBe(404);
    // Implante exige médico E enfermagem: alternativa "médico OU biomédico" não satisfaz a exigência médica.
    expect((await tenta([{ categoryId: 1, alternativeCategoryIds: [8] }, { categoryId: 2 }], PROC.implante)).status).toBe(422);
    expect((await tenta([{ categoryId: 1 }, { categoryId: 2, alternativeCategoryIds: [20] }], PROC.implante)).status).toBe(422);
    expect((await tenta([{ categoryId: 1 }, { categoryId: 2 }], PROC.implante)).status).toBe(201);
  });

  it("duas necessidades distintas (consulta + biomédico) continuam exigindo duas pessoas diferentes", async () => {
    const proto = await novoProtocolo();
    const add = await incluir(proto, { procedimentoId: PROC.botox, equipe: [{ categoryId: 1, alternativeCategoryIds: [8] }, { categoryId: 8 }] });
    expect(add.status).toBe(201);
    const ok = await api("post", `/protocols/${proto}/procedimentos/${add.body.itemId}/reservar`, { numero: 1, date: DATE3, time: "08:30" });
    expect(ok.status).toBe(201);
    const rows = await sessoes(proto);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r: any) => r.professional_id)).size).toBe(2);
  });
});
