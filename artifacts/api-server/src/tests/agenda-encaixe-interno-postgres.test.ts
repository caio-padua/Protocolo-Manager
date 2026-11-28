import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

// Banco PostgreSQL descartável, 100% sintético: nada do banco real é lido ou escrito.
// Google 100% simulado: nenhum evento real é criado. A autorização, o motor, a decisão do encaixe e as travas são as reais.
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
const google = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), exists: vi.fn(), verify: vi.fn(), remove: vi.fn(), list: vi.fn() }));
vi.mock("../lib/google-calendar.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/google-calendar")>();
  return {
    ...actual, createCalendarEvent: google.create, updateCalendarEvent: google.update,
    calendarEventExists: google.exists, verifyClinicAccount: google.verify, deleteCalendarEvent: google.remove,
    getUncachableGoogleCalendarClient: async () => ({ events: { list: google.list } }),
  };
});
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: any, _s: any, n: any) => n() }));
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_r: any, _s: any, n: any) => n() }));
import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable, empresasTable,
  locationsTable, professionalsTable, professionalEmpresasTable, sessionsTable, substanceApplicationsTable,
  clientsTable, protocolsTable, protocolItemsTable, substancesTable, locationProfessionalsTable, appSettingsTable,
} from "@workspace/db/schema";
import agendaRouter from "../routes/agenda";
import agendaEncaixeRouter from "../routes/agenda-encaixe";
import { bookSession } from "../lib/agenda-booking";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const query = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const rows = async (text: string, values?: unknown[]) => (await query(text, values)).rows;

// Cada requisição declara QUEM é (profissional) e a clínica; a regra de antecedência nunca vem do navegador.
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  const prof = Number(req.headers["x-test-prof"] ?? 101);
  req.tenantContext = {
    authenticated: req.headers["x-test-anon"] !== "1", empresaId: Number(req.headers["x-test-empresa"] ?? 5),
    professionalId: prof, isPlatformOwner: req.headers["x-test-owner"] === "1",
  };
  req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  next();
});
app.use("/api", agendaRouter, agendaEncaixeRouter);
app.use((err: Error, _r: any, s: any, _n: any) => s.status(500).json({ error: err.message }));
const get = (path: string, prof = 101, extra: Record<string, string> = {}) => {
  let r = request(app).get(path).set("x-test-prof", String(prof));
  for (const [k, v] of Object.entries(extra)) r = r.set(k, v);
  return r;
};
const post = (path: string, body: unknown, prof = 101, extra: Record<string, string> = {}) => {
  let r = request(app).post(path).set("x-test-prof", String(prof));
  for (const [k, v] of Object.entries(extra)) r = r.set(k, v);
  return r.send(body as object);
};

// 2030-03-01 é sexta (hoje simulado, 12:00 BRT). 2030-03-08 é a sexta seguinte. Janelas das sextas: 09-11 e 14-18.
const HOJE = "2030-03-01", SEXTA2 = "2030-03-08", SABADO = "2030-03-02";
const NOW = "2030-03-01T12:00:00-03:00";
const MEDICO = 4, MEDICO_OUTRA_AGENDA = 5, ENFERMAGEM = 1, MADRUGADA = 9;
const PROF = 77;
const MEDICO_P = 101, ENFERM_P = 102, RECEP_P = 103, OUTRO_P = 104, INATIVO_P = 105, OUTRA_CLINICA_P = 106, DONO_P = 107;
const slotsDe = (res: any) => new Map<string, any>(res.body.slots.map((s: any) => [s.time, s]));
const disp = (over: Record<string, string | number | undefined> = {}, prof = MEDICO_P) => {
  const q = new URLSearchParams(Object.entries({ resourceId: MEDICO, date: SEXTA2, durationMinutes: 20, ...over })
    .filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  return get(`/api/agenda/encaixe/disponibilidade?${q}`, prof);
};
const encaixe = (over: Record<string, unknown> = {}, prof = MEDICO_P) =>
  post("/api/agenda/encaixe", { resourceId: MEDICO, clientId: 21, date: SEXTA2, time: "14:00", durationMinutes: 20, ...over }, prof);
const totalSessoes = async () => (await rows(`SELECT count(*)::int AS n FROM sessions`))[0].n as number;
const setNow = (iso: string) => vi.setSystemTime(new Date(iso));
const sessao = (resource: number, client: number, date: string, time: string, dur = 20, prof: number | null = null) =>
  query(`INSERT INTO sessions(client_id,resource_id,professional_id,scheduled_date,scheduled_time,duration_minutes,status,empresa_id)
    VALUES ($1,$2,$3,$4,$5,$6,'scheduled',5)`, [client, resource, prof, date, time, dur]);

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
    empresasTable, locationsTable, professionalsTable, professionalEmpresasTable, sessionsTable, substanceApplicationsTable,
    clientsTable, protocolsTable, protocolItemsTable, substancesTable, locationProfessionalsTable, appSettingsTable]) {
    await query(createTableFromSchema(table));
  }
  await query(`
    INSERT INTO empresas(id,nome,tipo,ativa,status)
      SELECT g,'Clínica sintética '||g,'clinic',true,'ATIVO' FROM generate_series(1,20) g;
    CREATE UNIQUE INDEX applications_unique ON substance_applications(session_id, substance_id, session_number);
    CREATE TABLE agenda_personal_owners(location_id INTEGER, empresa_id INTEGER, professional_id INTEGER);
    CREATE TABLE agenda_google_sync(location_id INTEGER PRIMARY KEY, cursor TEXT, source_calendar_id TEXT, last_success TIMESTAMPTZ,
      last_attempt TIMESTAMPTZ, error TEXT, enabled BOOLEAN NOT NULL DEFAULT true);
    CREATE TABLE agenda_google_source(location_id INTEGER NOT NULL, event_id TEXT NOT NULL, body JSONB NOT NULL, PRIMARY KEY(location_id,event_id));
    CREATE TABLE agenda_compromissos(id SERIAL PRIMARY KEY, location_id INTEGER NOT NULL, google_calendar_id TEXT, chave TEXT NOT NULL,
      ical_uid TEXT NOT NULL DEFAULT '', titulo TEXT, descricao TEXT, local_texto TEXT, inicio TIMESTAMPTZ, fim TIMESTAMPTZ,
      dia_inteiro BOOLEAN NOT NULL DEFAULT false, recorrencia TEXT, status TEXT NOT NULL DEFAULT 'ativo', origem TEXT NOT NULL DEFAULT 'ics',
      UNIQUE(location_id,chave));
    INSERT INTO locations(id,name,empresa_id,active,address,phone) VALUES
      (8,'Local sintético A',5,'true','Rua Sintética, 100, Centro, Cidade Teste - TS, CEP 00000-000','+5500000000000');
    INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active,empresa_id) VALUES
      (${ENFERMAGEM},'Enfermagem sintética','enfermagem','local',20,8,NULL,true,5),
      (${MEDICO},'Consultório médico sintético','medico','local',20,8,${PROF},true,5),
      (${MEDICO_OUTRA_AGENDA},'Consultório médico sintético 2','medico','local',20,8,${PROF},true,5),
      (${MADRUGADA},'Agenda de virada de dia','medico','online',20,NULL,${PROF + 5},true,5);
    INSERT INTO agenda_settings(id,block_minutes,trigger_percent,min_lead_hours) VALUES(1,120,60,24);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active)
      SELECT r,5,t.i,t.f,1,NULL,true FROM unnest(ARRAY[${ENFERMAGEM},${MEDICO},${MEDICO_OUTRA_AGENDA}]) r,
        (VALUES ('09:00','11:00'),('14:00','18:00')) AS t(i,f);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active) VALUES
      (${MADRUGADA},5,'22:00','23:40',1,NULL,true),(${MADRUGADA},6,'00:00','01:00',1,NULL,true);
    INSERT INTO clients(id,name,cpf,email,empresa_id,clinica_origem_empresa_id,agenda_enfermagem_padrao_id) VALUES
      (21,'Cliente sintético 21','000.000.000-21','cliente21@example.invalid',5,5,1),
      (22,'Cliente sintético 22','000.000.000-22','cliente22@example.invalid',5,5,1),
      (23,'Cliente sintético 23','000.000.000-23','cliente23@example.invalid',5,5,1),
      (31,'Cliente sintético outra clínica','000.000.000-31','cliente31@example.invalid',6,6,1);
    INSERT INTO professionals(id,name,category,active,empresa_id,is_platform_owner) VALUES
      (${MEDICO_P},'Médico sintético','medico',true,5,false),
      (${ENFERM_P},'Enfermagem sintética','enfermagem',true,5,false),
      (${RECEP_P},'Recepção sintética','recepcao',true,5,false),
      (${OUTRO_P},'Outro sintético','outro',true,5,false),
      (${INATIVO_P},'Médico inativo sintético','medico',false,5,false),
      (${OUTRA_CLINICA_P},'Médico de outra clínica sintético','medico',true,6,false),
      (${DONO_P},'Dono sintético','outro',true,5,true);
  `);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
}, 60_000);

beforeEach(async () => {
  await query(`TRUNCATE sessions, substance_applications, protocol_items, protocols, agenda_compromissos, agenda_google_sync, agenda_google_source, agenda_exceptions, app_settings`);
  await query(`UPDATE locations SET google_calendar_id=NULL WHERE id=8`);
  await query(`UPDATE agenda_resources SET google_calendar_id=NULL`);
  process.env.TZ = "America/Sao_Paulo";
  setNow(NOW);
  for (const fn of Object.values(google)) fn.mockReset();
  google.create.mockImplementation(async (data: { eventId?: string }) => data.eventId ?? null);
  google.update.mockResolvedValue(undefined);
  google.exists.mockResolvedValue(false);
  google.remove.mockResolvedValue(undefined);
  google.verify.mockResolvedValue({ ok: true, account: "conta-sintetica@example.invalid" });
  // Google sintético: calendário vazio e marcador de sincronização; cada teste troca isto para simular o que quiser.
  google.list.mockResolvedValue({ data: { items: [], nextSyncToken: "marcador-sintetico" } });
});

afterAll(async () => {
  vi.useRealTimers();
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("Canal e autorização: decididos no servidor", () => {
  it("sem sessão: 401 nas três rotas", async () => {
    const anon = { "x-test-anon": "1" };
    expect((await get("/api/agenda/encaixe/politica", 101, anon)).status).toBe(401);
    expect((await get(`/api/agenda/encaixe/disponibilidade?resourceId=${MEDICO}&date=${SEXTA2}&durationMinutes=20`, 101, anon)).status).toBe(401);
    expect((await post("/api/agenda/encaixe", { resourceId: MEDICO, clientId: 21, date: SEXTA2, time: "14:00", durationMinutes: 20 }, 101, anon)).status).toBe(401);
    expect(await totalSessoes()).toBe(0);
  });

  it("médico, enfermagem, recepção (padrão) e proprietário entram; outro, inativo e de outra clínica não", async () => {
    for (const prof of [MEDICO_P, ENFERM_P, RECEP_P, DONO_P]) {
      const r = await get("/api/agenda/encaixe/politica", prof, prof === DONO_P ? { "x-test-owner": "1" } : {});
      expect(r.body, String(prof)).toMatchObject({ autorizado: true, antecedenciaMinutos: 5, antecedenciaConfigurada: false });
    }
    for (const [prof, codigo] of [[OUTRO_P, "sem_permissao_encaixe"], [INATIVO_P, "profissional_inativo"], [OUTRA_CLINICA_P, "fora_da_empresa"]] as const) {
      const r = await get("/api/agenda/encaixe/politica", prof);
      expect(r.body, String(prof)).toMatchObject({ autorizado: false, codigo });
      expect((await disp({}, prof)).status).toBe(403);
      expect((await encaixe({}, prof)).status).toBe(403);
    }
    expect(await totalSessoes()).toBe(0);
  });

  it("a Governança desliga a ferramenta por papel e o servidor obedece", async () => {
    await query(`INSERT INTO app_settings(key,value) VALUES ('governanca.matriz',$1)`, [JSON.stringify({ agenda_encaixe_interno: { recepcao: false } })]);
    expect((await get("/api/agenda/encaixe/politica", RECEP_P)).body.autorizado).toBe(false);
    expect((await encaixe({}, RECEP_P)).status).toBe(403);
    expect((await get("/api/agenda/encaixe/politica", MEDICO_P)).body.autorizado).toBe(true);
  });

  it("o navegador não escolhe a regra: campo de canal ou de antecedência é recusado", async () => {
    for (const extra of [{ canal: "interno" }, { leadMinutes: 0 }, { antecedenciaMinutos: 0 }, { empresaId: 6 }]) {
      const r = await encaixe(extra);
      expect(r.status, JSON.stringify(extra)).toBe(400);
    }
    const q = await get(`/api/agenda/encaixe/disponibilidade?resourceId=${MEDICO}&date=${SEXTA2}&durationMinutes=20&canal=interno`, MEDICO_P);
    expect(q.status).toBe(400);
    expect(await totalSessoes()).toBe(0);
  });

  it("agenda e cliente de outra clínica: 404, nada é gravado", async () => {
    expect((await encaixe({ clientId: 31 })).status).toBe(404);
    expect((await disp({ clientId: 31 })).status).toBe(404);
    const outraClinica = await post("/api/agenda/encaixe", { resourceId: MEDICO, clientId: 31, date: SEXTA2, time: "14:00", durationMinutes: 20 }, MEDICO_P, { "x-test-empresa": "6" });
    expect(outraClinica.status).toBe(403); // o médico da clínica 5 não é do corpo clínico da clínica 6
    expect(await totalSessoes()).toBe(0);
  });
});

describe("Antecedência interna em minutos (limites de 5 minutos)", () => {
  it("4min59 bloqueia, 5min00 abre, passado é passado e o motivo é dito", async () => {
    setNow("2030-03-01T13:55:00.000-03:00"); // 14:00 está exatamente 5 minutos à frente
    expect(slotsDe(await disp({ date: HOJE })).get("14:00")).toMatchObject({ state: "aberto", reason: null });
    setNow("2030-03-01T13:55:00.001-03:00"); // 4min59s999
    const quase = slotsDe(await disp({ date: HOJE })).get("14:00");
    expect(quase).toMatchObject({ state: "bloqueado", reason: "antecedencia" });
    expect(quase.message).toContain("menos de 5 minutos");
    setNow("2030-03-01T13:56:00.000-03:00");
    expect(slotsDe(await disp({ date: HOJE })).get("14:00")).toMatchObject({ state: "bloqueado", reason: "antecedencia" });
    setNow("2030-03-01T14:00:01.000-03:00");
    expect(slotsDe(await disp({ date: HOJE })).get("14:00")).toMatchObject({ state: "bloqueado", reason: "passado" });
    // Dia anterior inteiro: passado.
    setNow("2030-03-02T08:00:00.000-03:00");
    const ontem = await disp({ date: HOJE });
    expect([...slotsDe(ontem).values()].every((s) => s.state === "bloqueado" && s.reason === "passado")).toBe(true);
  });

  it("a confirmação usa a mesma regra: aceita em 5min00, recusa em 4min59 e no passado", async () => {
    setNow("2030-03-01T13:55:00.001-03:00");
    const quase = await encaixe({ date: HOJE, time: "14:00" });
    expect(quase.status).toBe(409);
    expect(quase.body).toMatchObject({ codigo: "antecedencia" });
    expect(quase.body.alternativas.mesmoDia[0]).toBe("14:20");
    setNow("2030-03-01T14:00:01.000-03:00");
    expect((await encaixe({ date: HOJE, time: "14:00" })).body.codigo).toBe("passado");
    setNow("2030-03-01T13:55:00.000-03:00");
    const ok = await encaixe({ date: HOJE, time: "14:00" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body).toMatchObject({ canal: "encaixe-interno", duplicada: false });
    expect(ok.body.session).toMatchObject({ protocolId: null, durationMinutes: 20, scheduledTime: "14:00", professionalId: PROF });
  });

  it("antecedência configurável pelo proprietário; a regra de 24 horas do paciente não muda", async () => {
    const negado = await request(app).put("/api/agenda/settings").set("x-test-prof", String(MEDICO_P)).send({ internalLeadMinutes: 30 });
    expect(negado.status).toBe(403);
    const salvo = await request(app).put("/api/agenda/settings").set("x-test-prof", String(DONO_P)).set("x-test-owner", "1").send({ internalLeadMinutes: 30 });
    expect(salvo.status, JSON.stringify(salvo.body)).toBe(200);
    expect(salvo.body).toMatchObject({ internalLeadMinutes: 30, minLeadHours: 24 });
    expect((await rows(`SELECT min_lead_hours FROM agenda_settings`))[0].min_lead_hours).toBe(24);
    setNow("2030-03-01T13:30:00.000-03:00");
    expect(slotsDe(await disp({ date: HOJE })).get("14:00")).toMatchObject({ state: "aberto" });
    setNow("2030-03-01T13:30:00.001-03:00");
    expect(slotsDe(await disp({ date: HOJE })).get("14:00")).toMatchObject({ state: "bloqueado", reason: "antecedencia" });
    expect((await get("/api/agenda/settings", MEDICO_P)).body).toMatchObject({ internalLeadMinutes: 30 });
    const invalido = await request(app).put("/api/agenda/settings").set("x-test-prof", String(DONO_P)).set("x-test-owner", "1").send({ internalLeadMinutes: -1 });
    expect(invalido.status).toBe(400);
  });
});

describe("Regras do paciente, do protocolo e da marcação padrão continuam intactas", () => {
  it("rota padrão (book-avulsa e slots) segue com 24 horas e liberação em cadeia", async () => {
    // 2 horas à frente: o encaixe aceita; a rota padrão recusa por antecedência (24 h).
    const padrao = await post("/api/agenda/book-avulsa", { resourceId: MEDICO, clientId: 21, date: HOJE, time: "14:00" });
    expect(padrao.status).toBe(409);
    expect(padrao.body.error).toMatch(/antecedência/);
    const slots = await get(`/api/agenda/slots?resourceId=${MEDICO}&date=${HOJE}`, MEDICO_P);
    expect(slots.body.slots.every((s: any) => s.state === "bloqueado")).toBe(true);
    // Cadeia: na sexta seguinte o 2o bloco (16:00) só abre com 60% do 1o; o encaixe não depende disso.
    const cadeia = await get(`/api/agenda/slots?resourceId=${MEDICO}&date=${SEXTA2}`, MEDICO_P);
    expect(cadeia.body.slots.find((s: any) => s.time === "16:00")).toMatchObject({ state: "bloqueado", reason: "cadeia" });
    const padraoCadeia = await post("/api/agenda/book-avulsa", { resourceId: MEDICO, clientId: 21, date: SEXTA2, time: "16:00" });
    expect(padraoCadeia.status).toBe(409);
    expect(await totalSessoes()).toBe(0);
  });

  it("encaixe ignora a cadeia só no canal interno; o mesmo horário abre na disponibilidade e grava", async () => {
    expect(slotsDe(await disp()).get("16:00")).toMatchObject({ state: "aberto" });
    const ok = await encaixe({ time: "16:00" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(await totalSessoes()).toBe(1);
  });

  it("protocolo e paciente: bookSession com protocolo continua exigindo 24 horas e cadeia", async () => {
    await query(`INSERT INTO protocols(id,client_id,title,start_date,empresa_id) VALUES (700,21,'Protocolo sintético','2030-03-01',5)`);
    const cedo = await bookSession({ resourceId: MEDICO, clientId: 21, protocolId: 700, date: HOJE, time: "14:00", empresaId: 5 });
    expect(cedo).toMatchObject({ ok: false, status: 409 });
    expect(cedo.error).toMatch(/antecedência/);
    const cadeia = await bookSession({ resourceId: MEDICO, clientId: 21, protocolId: 700, date: SEXTA2, time: "16:00", empresaId: 5 });
    expect(cadeia).toMatchObject({ ok: false, status: 409 });
    expect(await totalSessoes()).toBe(0);
  });
});

describe("Expediente, intervalo completo e conflitos", () => {
  it("fora do expediente e intervalo que passa do fim: recusado com motivo", async () => {
    const d = await disp({ durationMinutes: 60 });
    const slots = slotsDe(d);
    expect(slots.has("08:40")).toBe(false);
    expect(slots.has("18:00")).toBe(false);
    expect(slots.get("17:20")).toMatchObject({ state: "bloqueado", reason: "intervalo" });
    expect(slots.get("17:20").message).toContain("passa do fim do expediente");
    expect(slots.get("17:00")).toMatchObject({ state: "aberto" });
    const fora = await encaixe({ time: "08:40" });
    expect(fora).toMatchObject({ status: 409 });
    expect(fora.body.codigo).toBe("fora-expediente");
    expect((await encaixe({ time: "17:20", durationMinutes: 60 })).body.codigo).toBe("intervalo");
    expect(await totalSessoes()).toBe(0);
  });

  it("feriado ou bloqueio fecha o dia", async () => {
    await query(`INSERT INTO agenda_exceptions(resource_id,date,kind,description) VALUES (NULL,$1,'feriado','Feriado sintético')`, [SEXTA2]);
    const d = await disp();
    expect(d.body).toMatchObject({ motivoDia: "excecao", slots: [] });
    const r = await encaixe();
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/fechada/);
  });

  it("conflito parcial: sessão fora da grade invalida os períodos que ela toca", async () => {
    await sessao(MEDICO, 22, SEXTA2, "14:30", 10); // 14:30-14:40, dentro do período das 14:20
    const slots = slotsDe(await disp({ durationMinutes: 40 }));
    expect(slots.get("14:00")).toMatchObject({ state: "bloqueado", reason: "intervalo" }); // 14:00-14:40 toca o período das 14:20
    expect(slots.get("14:20")).toMatchObject({ state: "ocupado", reason: "ocupado" });
    expect(slots.get("14:40")).toMatchObject({ state: "aberto" });
    const r = await encaixe({ time: "14:00", durationMinutes: 40 });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("intervalo");
    expect(await totalSessoes()).toBe(1);
  });

  it("mesmo profissional em outra agenda: o intervalo inteiro fica indisponível", async () => {
    await sessao(MEDICO_OUTRA_AGENDA, 22, SEXTA2, "14:20", 40, PROF);
    const slots = slotsDe(await disp({ durationMinutes: 40 }));
    expect(slots.get("14:00")).toMatchObject({ state: "bloqueado", reason: "intervalo" });
    expect(slots.get("14:20")).toMatchObject({ state: "bloqueado", reason: "profissional" });
    expect(slots.get("14:40")).toMatchObject({ state: "bloqueado", reason: "profissional" });
    expect(slots.get("15:00")).toMatchObject({ state: "aberto" });
    const r = await encaixe({ time: "14:20", durationMinutes: 40 });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("profissional");
    expect(r.body.alternativas.mesmoDia.length).toBeGreaterThan(0);
    expect(await totalSessoes()).toBe(1);
  });

  it("mesmo paciente em outra agenda: recusa só quando o cliente é informado e diz que não verificou sem ele", async () => {
    await sessao(ENFERMAGEM, 21, SEXTA2, "14:00", 20);
    const sem = await disp({});
    expect(sem.body.clienteVerificado).toBe(false);
    expect(slotsDe(sem).get("14:00")).toMatchObject({ state: "aberto" });
    const com = await disp({ clientId: 21 });
    expect(com.body.clienteVerificado).toBe(true);
    expect(slotsDe(com).get("14:00")).toMatchObject({ state: "bloqueado", reason: "cliente" });
    const r = await encaixe({ time: "14:00" });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("cliente");
    expect((await encaixe({ time: "14:00", clientId: 22 })).status).toBe(201);
  });

  it("sem dia livre, sugere o próximo dia com horário", async () => {
    await query(`INSERT INTO agenda_exceptions(resource_id,date,kind,description) VALUES (${MEDICO},$1,'bloqueio','Bloqueio sintético')`, [SEXTA2]);
    const d = await disp();
    expect(d.body.alternativas.mesmoDia).toEqual([]);
    expect(d.body.alternativas.proximoDia).toEqual({ date: "2030-03-15", time: "09:00" });
  });
});

describe("Google: ocupado, indisponível, desatualizado e alterado depois", () => {
  const CAL = "agenda-sintetica@example.invalid";
  const ligarGoogle = async (ultimoSucesso = "now()", erro: string | null = null) => {
    await query(`UPDATE locations SET google_calendar_id='${CAL}' WHERE id=8`);
    await query(`INSERT INTO agenda_google_sync(enabled,location_id,last_success,error) VALUES (true,8,${ultimoSucesso},$1)`, [erro]);
  };
  const eventoGoogle = (ini: string, fim: string) => ({
    id: "sintetico", status: "confirmed", summary: "Compromisso sintético", start: { dateTime: ini }, end: { dateTime: fim },
  });
  /** O compromisso existe na cópia local E no Google simulado (a conferência ao vivo relê o Google). */
  const compromisso = async (ini: string, fim: string) => {
    await query(`INSERT INTO agenda_compromissos(titulo,inicio,fim,dia_inteiro,recorrencia,origem,location_id,status,chave,google_calendar_id)
      VALUES ('Compromisso sintético',$1,$2,false,NULL,'google',8,'ativo','google:sintetico','${CAL}')`, [ini, fim]);
    google.list.mockResolvedValue({ data: { items: [eventoGoogle(ini, fim)], nextSyncToken: "marcador-sintetico" } });
  };

  it("compromisso do Google ocupa o trecho e é explicado", async () => {
    await ligarGoogle();
    await compromisso("2030-03-08T14:20:00-03:00", "2030-03-08T14:40:00-03:00");
    const slots = slotsDe(await disp({ durationMinutes: 40 }));
    expect(slots.get("14:00")).toMatchObject({ state: "bloqueado", reason: "intervalo" });
    expect(slots.get("14:20")).toMatchObject({ state: "bloqueado", reason: "compromisso" });
    expect(slots.get("14:40")).toMatchObject({ state: "aberto" });
    expect((await encaixe({ time: "14:00", durationMinutes: 40 })).body.codigo).toBe("intervalo");
    expect((await encaixe({ time: "14:20" })).body.codigo).toBe("compromisso");
  });

  it("cópia velha, mas Google responde: a conferência ao vivo atualiza e o encaixe é aceito (sem esperar o ciclo de 60 s)", async () => {
    await ligarGoogle("now() - interval '10 minutes'");
    const d = await disp();
    expect(d.body.integracao.atualizada).toBe(false); // o seletor mostra a cópia, que está velha
    expect([...slotsDe(d).values()].every((s) => s.state !== "aberto" && s.reason === "integracao")).toBe(true);
    const r = await encaixe();
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(google.list).toHaveBeenCalledTimes(1);
    expect((await rows(`SELECT error, last_success > now() - interval '1 minute' AS recente FROM agenda_google_sync`))[0]).toEqual({ error: null, recente: true });
    // Depois da leitura ao vivo o seletor também vê o Google em dia.
    expect((await disp({ time: undefined })).body.integracao.atualizada).toBe(true);
  });

  it("a conferência ao vivo é incremental: a segunda leitura usa o marcador devolvido pelo Google", async () => {
    await ligarGoogle();
    expect((await encaixe({ time: "14:00" })).status).toBe(201);
    expect((await encaixe({ time: "14:20", clientId: 22 })).status).toBe(201);
    expect(google.list).toHaveBeenCalledTimes(2);
    expect(google.list.mock.calls[0][0].syncToken).toBeUndefined();
    expect(google.list.mock.calls[1][0].syncToken).toBe("marcador-sintetico");
    expect(google.list.mock.calls.every((c) => c[0].calendarId === CAL)).toBe(true);
  });

  it("evento criado direto no Google que a cópia ainda não tem: visto na confirmação, recusado, nada gravado", async () => {
    await ligarGoogle(); // cópia em dia (parece livre) e sem o evento
    expect(slotsDe(await disp()).get("14:00")).toMatchObject({ state: "aberto" });
    google.list.mockResolvedValue({ data: { items: [eventoGoogle("2030-03-08T14:00:00-03:00", "2030-03-08T14:20:00-03:00")], nextSyncToken: "t2" } });
    const r = await encaixe({ time: "14:00" });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("compromisso");
    expect(await totalSessoes()).toBe(0);
    // Outro horário livre continua aceito.
    expect((await encaixe({ time: "14:20" })).status).toBe(201);
  });

  it("Google fora do ar na confirmação, mesmo com a cópia em dia: recusa, avisa e registra o erro", async () => {
    await ligarGoogle();
    google.list.mockRejectedValue(new Error("falha sintética de rede"));
    const r = await encaixe();
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("integracao");
    expect(r.body.error).toMatch(/não pode ser garantida/);
    expect(r.body.error).toMatch(/leitura do Google Agenda falhou/);
    expect(r.body.error).toMatch(/Nada foi agendado/);
    expect(await totalSessoes()).toBe(0);
    const [estado] = await rows(`SELECT error FROM agenda_google_sync`);
    expect(estado.error).toMatch(/Falha ao atualizar o Google/);
    expect(estado.error).not.toMatch(/sintética de rede/); // detalhe do provedor nunca vai para o estado público
  });

  it("conta Google não confirmada na confirmação: recusa com o motivo", async () => {
    await ligarGoogle();
    google.verify.mockResolvedValue({ ok: false });
    const r = await encaixe();
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("integracao");
    expect(r.body.error).toMatch(/conta Google da clínica não foi confirmada/);
    expect(google.list).not.toHaveBeenCalled();
    expect(await totalSessoes()).toBe(0);
  });

  it("integração desatualizada ou com erro e o Google também falha: não promete disponibilidade e recusa", async () => {
    google.list.mockRejectedValue(new Error("Google indisponível (sintético)"));
    await ligarGoogle("now() - interval '10 minutes'");
    const d = await disp();
    expect(d.body.integracao.atualizada).toBe(false);
    expect(d.body.integracao.mensagem).toMatch(/não pode ser garantida/);
    expect(d.body.motivoDia).toBe("sincronizacao-pendente");
    expect([...slotsDe(d).values()].every((s) => s.state !== "aberto" && s.reason === "integracao")).toBe(true);
    expect((await encaixe()).body.codigo).toBe("integracao");
    await query(`TRUNCATE agenda_google_sync`);
    await ligarGoogle("now()", "token expirado (sintético)");
    expect((await encaixe()).body.codigo).toBe("integracao");
    expect(await totalSessoes()).toBe(0);
  });

  it("o seletor NÃO chama o Google (usa a cópia); só a confirmação confere ao vivo", async () => {
    await ligarGoogle();
    await disp();
    await disp({ durationMinutes: 40 });
    expect(google.list).not.toHaveBeenCalled();
    expect((await encaixe()).status).toBe(201);
    expect(google.list).toHaveBeenCalledTimes(1);
  });

  it("agenda sem Google ligado: nada a ler, a confirmação não chama o Google", async () => {
    expect((await encaixe()).status).toBe(201);
    expect(google.list).not.toHaveBeenCalled();
    expect(google.verify).not.toHaveBeenCalled();
  });

  it("alteração direta no Google DEPOIS da leitura é vista na confirmação", async () => {
    await ligarGoogle();
    expect(slotsDe(await disp()).get("14:00")).toMatchObject({ state: "aberto" });
    await compromisso("2030-03-08T14:00:00-03:00", "2030-03-08T14:20:00-03:00");
    const r = await encaixe({ time: "14:00" });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("compromisso");
    // O Google some do ar entre a leitura e a confirmação: recusa por segurança, não usa mais a cópia.
    google.list.mockRejectedValue(new Error("falha sintética"));
    await query(`TRUNCATE agenda_compromissos`);
    expect((await encaixe({ time: "14:00" })).body.codigo).toBe("integracao");
  });

  it("leitura do mesmo local em andamento: espera um pouco e, se não terminar, recusa (nunca usa cópia velha)", async () => {
    await ligarGoogle("now() - interval '10 minutes'");
    const segurando = await isolated.pool.connect();
    try {
      await segurando.query("BEGIN");
      await segurando.query("SELECT pg_advisory_xact_lock(19872027, 8)");
      const { atualizarLocaisAoVivo } = await import("../lib/agenda-google-sync");
      expect(await atualizarLocaisAoVivo([8], { esperaMs: 10 })).toEqual({ ok: false, motivo: "ocupado" });
      expect(google.list).not.toHaveBeenCalled();
      await segurando.query("COMMIT"); // a outra leitura terminou
      expect(await atualizarLocaisAoVivo([8], { esperaMs: 10 })).toEqual({ ok: true, atualizados: 1 });
    } finally {
      segurando.release();
    }
  });

  it("Google que não responde estoura o prazo e não trava a confirmação", async () => {
    await ligarGoogle();
    let soltar: () => void = () => {};
    google.list.mockImplementation(() => new Promise((_ok, falhar) => { soltar = () => falhar(new Error("resposta tardia sintética")); }));
    const { atualizarLocaisAoVivo } = await import("../lib/agenda-google-sync");
    const t0 = Date.now();
    expect(await atualizarLocaisAoVivo([8], { prazoMs: 80 })).toEqual({ ok: false, motivo: "prazo" });
    expect(Date.now() - t0).toBeLessThan(2000);
    // A leitura abandonada termina sozinha (no real, no limite de 30 s da chamada) e libera a transação.
    soltar();
    await new Promise((r) => setTimeout(r, 300));
  });

  it("evento do Google criado pelo sistema depois da marcação (simulado) e falha do Google não desfaz a marcação", async () => {
    await query(`UPDATE agenda_resources SET google_calendar_id='medico-sintetico@example.invalid' WHERE id=${MEDICO}`);
    const ok = await encaixe({ syncGoogle: true });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(google.create).toHaveBeenCalledTimes(1);
    google.create.mockRejectedValue(new Error("falha sintética do Google"));
    const falha = await encaixe({ time: "14:20", clientId: 22, syncGoogle: true });
    expect(falha.status).toBe(201);
    expect(falha.body.googleSyncWarning).toBeTruthy();
    expect(await totalSessoes()).toBe(2);
  });
});

describe("Concorrência e repetição", () => {
  it("dois usuários ao mesmo tempo no mesmo horário: um grava, o outro é recusado", async () => {
    const [a, b] = await Promise.all([
      encaixe({ clientId: 21 }, MEDICO_P),
      encaixe({ clientId: 22 }, ENFERM_P),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await totalSessoes()).toBe(1);
    const perdedor = a.status === 409 ? a : b;
    expect(perdedor.body.codigo).toBe("ocupado");
    expect(perdedor.body.alternativas.mesmoDia.length).toBeGreaterThan(0);
  });

  it("mesmo cliente em duas agendas ao mesmo tempo: só uma marcação", async () => {
    const [a, b] = await Promise.all([
      encaixe({ resourceId: MEDICO, clientId: 21 }),
      encaixe({ resourceId: ENFERMAGEM, clientId: 21 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await totalSessoes()).toBe(1);
  });

  it("mesmo profissional em duas agendas ao mesmo tempo: só uma marcação", async () => {
    const [a, b] = await Promise.all([
      encaixe({ resourceId: MEDICO, clientId: 21 }),
      encaixe({ resourceId: MEDICO_OUTRA_AGENDA, clientId: 22 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await totalSessoes()).toBe(1);
  });

  it("requisição duplicada (duplo clique): uma só marcação e a repetição devolve a existente", async () => {
    const [a, b] = await Promise.all([encaixe(), encaixe()]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    const duplicada = a.status === 200 ? a : b;
    const criada = a.status === 201 ? a : b;
    expect(duplicada.body.duplicada).toBe(true);
    expect(duplicada.body.session.id).toBe(criada.body.session.id);
    expect(await totalSessoes()).toBe(1);
    const depois = await encaixe();
    expect(depois.status).toBe(200);
    expect(depois.body.duplicada).toBe(true);
    expect(await totalSessoes()).toBe(1);
    // Outro horário igual não é duplicata: segue a regra normal.
    expect((await encaixe({ clientId: 22 })).status).toBe(409);
  });

  it("alteração concorrente entre a leitura e a confirmação: recusa com alternativas", async () => {
    expect(slotsDe(await disp()).get("14:00")).toMatchObject({ state: "aberto" });
    await sessao(MEDICO, 23, SEXTA2, "14:00", 20, PROF); // outra pessoa marcou antes
    const r = await encaixe({ time: "14:00" });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("ocupado");
    expect(r.body.alternativas.mesmoDia[0]).toBe("14:20");
    expect(await totalSessoes()).toBe(1);
  });
});

describe("Data, hora e fuso", () => {
  it("o servidor em outro fuso decide igual (a clínica é sempre BRT)", async () => {
    for (const tz of ["Pacific/Kiritimati", "America/Los_Angeles", "UTC"]) {
      process.env.TZ = tz;
      setNow("2030-03-01T13:55:00.000-03:00");
      expect(slotsDe(await disp({ date: HOJE })).get("14:00"), tz).toMatchObject({ state: "aberto" });
      setNow("2030-03-01T13:55:00.001-03:00");
      expect(slotsDe(await disp({ date: HOJE })).get("14:00"), tz).toMatchObject({ state: "bloqueado", reason: "antecedencia" });
    }
  });

  it("virada do dia: 23h12 em BRT já é dia 02 em UTC; a data da agenda segue a clínica", async () => {
    setNow("2030-03-01T23:12:00.000-03:00"); // 02h12 UTC do dia 02
    const sexta = slotsDe(await disp({ resourceId: MADRUGADA, date: HOJE }));
    expect(sexta.get("23:00")).toMatchObject({ state: "bloqueado", reason: "passado" });
    expect(sexta.get("23:20")).toMatchObject({ state: "aberto" }); // 23:12 + 5 min = 23:17
    const sabado = slotsDe(await disp({ resourceId: MADRUGADA, date: SABADO }));
    expect(sabado.get("00:00")).toMatchObject({ state: "aberto" });
    setNow("2030-03-01T23:56:00.000-03:00"); // 00:00 do sábado fica a 4 minutos
    expect(slotsDe(await disp({ resourceId: MADRUGADA, date: SABADO })).get("00:00")).toMatchObject({ state: "bloqueado", reason: "antecedencia" });
    setNow("2030-03-01T23:55:00.000-03:00"); // exatamente 5 minutos
    const ok = await encaixe({ resourceId: MADRUGADA, date: SABADO, time: "00:00" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.session).toMatchObject({ scheduledDate: SABADO, scheduledTime: "00:00" });
  });

  it("validações: data impossível, duração inválida e horário malformado", async () => {
    expect((await encaixe({ date: "2030-02-30" })).status).toBe(400);
    for (const durationMinutes of [4, 481, 2.5]) expect((await encaixe({ durationMinutes })).status, String(durationMinutes)).toBe(400);
    expect((await encaixe({ time: "25:00" })).status).toBe(400);
    expect((await disp({ durationMinutes: 4 })).status).toBe(400);
    expect(await totalSessoes()).toBe(0);
  });
});
