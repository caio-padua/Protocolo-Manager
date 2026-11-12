import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

// Banco PostgreSQL descartável, 100% sintético, com conexões REAIS simultâneas (pool). Google 100% simulado.
const state = vi.hoisted(() => ({ database: null as any, delayMs: 0 }));
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
// Alarga a janela da corrida DE PROPÓSITO: depois de ler os conflitos e antes de gravar, cada transação espera.
// Sem trava, as duas leem "livre" e as duas gravam. Com trava, a segunda só lê depois do COMMIT da primeira.
vi.mock("../lib/agenda-conflitos", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/agenda-conflitos")>();
  return {
    ...actual,
    acharConflitoDeHorario: async (...args: Parameters<typeof actual.acharConflitoDeHorario>) => {
      const found = await actual.acharConflitoDeHorario(...args);
      if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
      return found;
    },
  };
});
const google = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), exists: vi.fn(), verify: vi.fn(), remove: vi.fn() }));
vi.mock("../lib/google-calendar.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/google-calendar")>();
  return {
    ...actual, createCalendarEvent: google.create, updateCalendarEvent: google.update,
    calendarEventExists: google.exists, verifyClinicAccount: google.verify, deleteCalendarEvent: google.remove,
  };
});
import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable, empresasTable,
  locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable,
  clientsTable, protocolsTable, protocolItemsTable, substancesTable, locationProfessionalsTable,
} from "@workspace/db/schema";
import { bookSession, rescheduleSession } from "../lib/agenda-booking";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const query = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const rows = async (text: string, values?: unknown[]) => (await query(text, values)).rows;

// 2030-03-06 e 2030-03-13 são quartas. "Hoje" simulado: sexta 01/03/2030.
const WED1 = "2030-03-06", WED2 = "2030-03-13";
const NOW = "2030-03-01T12:00:00-03:00";
// Clínica 5: agendas 1 (enfermagem), 2 (online, profissional 78), 4 e 5 (médico 77). Clínica 6: agenda 7 (MESMO médico 77).
const ENFERMAGEM = 1, ONLINE = 2, MEDICO = 4, MEDICO_2 = 5, MEDICO_OUTRA_CLINICA = 7, MEDICO_78_CLINICA_6 = 8;
const PROF = 77;
const avulsa = (over: Record<string, unknown> = {}) => bookSession({
  resourceId: MEDICO, clientId: 21, consultaAvulsa: true, date: WED1, time: "09:00", empresaId: 5, ...over,
} as any);
const mover = (sessionId: number, clientId: number, over: Record<string, unknown> = {}) => rescheduleSession({
  sessionId, clientId, resourceId: MEDICO, date: WED1, time: "09:00", ...over,
} as any);
const totalSessoes = async () => (await rows(`SELECT count(*)::int AS n FROM sessions`))[0].n as number;
const novaSessao = async (o: { client: number; resource: number; time: string; duration: number; empresa?: number; date?: string; protocol?: number | null }) =>
  Number((await rows(`INSERT INTO sessions(protocol_id,client_id,resource_id,scheduled_date,scheduled_time,status,duration_minutes,empresa_id,professional_id,week_number)
    VALUES($1,$2,$3,$4,$5,'scheduled',$6,$7,NULL,1) RETURNING id`,
    [o.protocol ?? null, o.client, o.resource, o.date ?? WED1, o.time, o.duration, o.empresa ?? 5]))[0].id);
const dados = async (id: number) => (await rows(`SELECT resource_id, scheduled_date, scheduled_time, duration_minutes, reschedule_count FROM sessions WHERE id=$1`, [id]))[0];

/** Propriedade central: nenhuma sessão ativa se sobrepõe a outra na mesma agenda, no mesmo profissional ou no mesmo cliente. */
async function sobreposicoes(): Promise<string[]> {
  const found = await rows(`
    SELECT a.id AS a, b.id AS b,
      CASE WHEN a.resource_id=b.resource_id THEN 'agenda'
           WHEN ra.professional_id IS NOT NULL AND ra.professional_id=rb.professional_id THEN 'profissional' ELSE 'cliente' END AS tipo
    FROM sessions a JOIN sessions b ON a.id<b.id AND a.scheduled_date=b.scheduled_date
    LEFT JOIN agenda_resources ra ON ra.id=a.resource_id LEFT JOIN agenda_resources rb ON rb.id=b.resource_id
    WHERE a.status IN ('scheduled','confirmed','completed') AND b.status IN ('scheduled','confirmed','completed')
      AND NOT a.agenda_archived AND NOT b.agenda_archived
      AND (a.scheduled_time::time, a.scheduled_time::time + make_interval(mins => COALESCE(a.duration_minutes,20)))
        OVERLAPS (b.scheduled_time::time, b.scheduled_time::time + make_interval(mins => COALESCE(b.duration_minutes,20)))
      AND (a.resource_id=b.resource_id OR (ra.professional_id IS NOT NULL AND ra.professional_id=rb.professional_id) OR a.client_id=b.client_id)
      AND NOT EXISTS (SELECT 1 FROM protocolo_ocorrencia_participantes pa JOIN protocolo_ocorrencia_participantes pb
        ON pa.ocorrencia_id=pb.ocorrencia_id WHERE pa.session_id=a.id AND pb.session_id=b.id)`);
  return found.map((r: any) => `${r.tipo}:${r.a}/${r.b}`);
}

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  for (const table of [agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, agendaExceptionsTable,
    empresasTable, locationsTable, professionalsTable, sessionsTable, substanceApplicationsTable, clientsTable,
    protocolsTable, protocolItemsTable, substancesTable, locationProfessionalsTable]) {
    await query(createTableFromSchema(table));
  }
  await query(`
    INSERT INTO empresas(id,nome,tipo,ativa,status)
      SELECT g,'Clínica sintética '||g,'clinic',true,'ATIVO' FROM generate_series(1,20) g;
    CREATE TABLE agenda_personal_owners(location_id INTEGER, empresa_id INTEGER, professional_id INTEGER);
    CREATE TABLE agenda_google_sync(enabled BOOLEAN, location_id INTEGER, last_success TIMESTAMPTZ, error TEXT);
    CREATE TABLE agenda_compromissos(id INTEGER, titulo TEXT, inicio TIMESTAMPTZ, fim TIMESTAMPTZ, dia_inteiro BOOLEAN,
      recorrencia TEXT, origem TEXT, location_id INTEGER, status TEXT, chave TEXT, google_calendar_id TEXT);
    CREATE TABLE protocolo_ocorrencia_participantes(ocorrencia_id INTEGER, ordem INTEGER, category_id INTEGER,
      professional_id INTEGER, resource_id INTEGER, session_id INTEGER);
    INSERT INTO locations(id,name,empresa_id,active,address,phone) VALUES
      (8,'Local sintético A',5,'true','Rua Sintética, 100','+5500000000000'),
      (9,'Local sintético B',6,'true','Avenida Outra, 200','+5500000000001');
    INSERT INTO agenda_resources(id,name,kind,modality,slot_minutes,location_id,professional_id,active,google_calendar_id,empresa_id) VALUES
      (${ENFERMAGEM},'Enfermagem sintética','enfermagem','local',20,8,NULL,true,'enf@example.invalid',5),
      (${ONLINE},'Médico online sintético','medico','online',20,NULL,${PROF + 1},true,'online@example.invalid',5),
      (${MEDICO},'Consultório médico sintético','medico','local',20,8,${PROF},true,'med@example.invalid',5),
      (${MEDICO_2},'Consultório médico sintético 2','medico','local',20,8,${PROF},true,'med2@example.invalid',5),
      (${MEDICO_OUTRA_CLINICA},'Consultório da outra clínica','medico','local',20,9,${PROF},true,'outra@example.invalid',6),
      (${MEDICO_78_CLINICA_6},'Outro médico da outra clínica','medico','local',20,9,${PROF + 2},true,'outra2@example.invalid',6);
    INSERT INTO agenda_settings(id,block_minutes,trigger_percent,min_lead_hours) VALUES(1,120,60,24);
    INSERT INTO agenda_windows(resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active)
      SELECT r,3,'09:00','11:00',1,NULL,true FROM unnest(ARRAY[${ENFERMAGEM},${ONLINE},${MEDICO},${MEDICO_2},${MEDICO_OUTRA_CLINICA},${MEDICO_78_CLINICA_6}]) r;
    INSERT INTO clients(id,name,cpf,email,empresa_id,clinica_origem_empresa_id) VALUES
      (21,'Cliente sintético 21','000.000.000-21','c21@example.invalid',5,5),
      (22,'Cliente sintético 22','000.000.000-22','c22@example.invalid',5,5),
      (23,'Cliente sintético 23','000.000.000-23','c23@example.invalid',5,5),
      (24,'Cliente sintético 24','000.000.000-24','c24@example.invalid',5,5),
      (31,'Paciente reservado da outra clínica','000.000.000-31','c31@example.invalid',6,6),
      (32,'Paciente 32 da outra clínica','000.000.000-32','c32@example.invalid',6,6);
  `);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
}, 60_000);

beforeEach(async () => {
  await query(`TRUNCATE sessions, substance_applications, protocol_items, protocols, protocolo_ocorrencia_participantes`);
  state.delayMs = 0;
  vi.setSystemTime(new Date(NOW));
  for (const fn of Object.values(google)) fn.mockReset();
  google.create.mockImplementation(async (data: { eventId?: string }) => data.eventId ?? null);
  google.update.mockResolvedValue(undefined);
  google.exists.mockResolvedValue(false);
  google.remove.mockResolvedValue(undefined);
  google.verify.mockResolvedValue({ ok: true, account: "conta-sintetica@example.invalid" });
});

afterAll(async () => {
  vi.useRealTimers();
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("Remarcação revalida o intervalo completo", () => {
  it("paciente: não aceita sobrepor outra marcação do mesmo paciente em outra agenda; nada muda", async () => {
    await novaSessao({ client: 21, resource: ONLINE, time: "10:00", duration: 60 });
    const alvo = await novaSessao({ client: 21, resource: MEDICO, time: "09:00", duration: 20 });
    const r = await mover(alvo, 21, { time: "10:20" });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.error).toContain("O cliente já tem outra marcação");
    expect(await dados(alvo)).toMatchObject({ resource_id: MEDICO, scheduled_time: "09:00", duration_minutes: 20, reschedule_count: 0 });
    // Fora do intervalo da outra marcação: remarca normalmente.
    expect((await mover(alvo, 21, { time: "09:20" })).ok).toBe(true);
  });

  it("intervalo completo: a duração inteira é testada, não só o horário inicial", async () => {
    const alvo = await novaSessao({ client: 21, resource: MEDICO, time: "10:00", duration: 60 });
    await novaSessao({ client: 21, resource: ONLINE, time: "09:20", duration: 20 });
    // 09:00 + 60 min cobre 09:20 do próprio paciente: recusado mesmo com o horário inicial (09:00) livre.
    const r = await mover(alvo, 21, { time: "09:00" });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(await dados(alvo)).toMatchObject({ scheduled_time: "10:00", duration_minutes: 60 });
    // Outro paciente no mesmo intervalo, em outra agenda e com outro profissional, não é conflito.
    await query(`UPDATE sessions SET client_id=22 WHERE resource_id=${ONLINE}`);
    expect((await mover(alvo, 21, { time: "09:00" })).ok).toBe(true);
    expect(await dados(alvo)).toMatchObject({ scheduled_time: "09:00", duration_minutes: 60 });
  });

  it("profissional em outra clínica: bloqueia sem revelar dado de terceiros", async () => {
    await novaSessao({ client: 31, resource: MEDICO_OUTRA_CLINICA, time: "09:00", duration: 60, empresa: 6 });
    const alvo = await novaSessao({ client: 21, resource: MEDICO, time: "10:40", duration: 20 });
    const r = await mover(alvo, 21, { time: "09:20" });
    expect(r).toMatchObject({ ok: false, status: 409, error: "Horário já ocupado" });
    const texto = JSON.stringify(r);
    for (const segredo of ["31", "reservado", "Clínica sintética 6", "Avenida Outra", "outra@example", "empresa"]) {
      expect(texto, segredo).not.toContain(segredo);
    }
    expect(await dados(alvo)).toMatchObject({ scheduled_time: "10:40", reschedule_count: 0 });
    // Logo depois do intervalo da outra clínica (fim exclusivo), a mesma remarcação é aceita.
    expect((await mover(alvo, 21, { time: "10:00" })).ok).toBe(true);
  });

  it("agenda: sobreposição parcial na mesma agenda é recusada", async () => {
    await novaSessao({ client: 22, resource: MEDICO, time: "09:00", duration: 60 });
    const alvo = await novaSessao({ client: 21, resource: MEDICO, time: "10:40", duration: 20 });
    expect(await mover(alvo, 21, { time: "09:40" })).toMatchObject({ ok: false, status: 409 });
    expect((await mover(alvo, 21, { time: "10:00" })).ok).toBe(true);
  });

  it("equipe conjunta legítima: sessões irmãs da mesma ocorrência não conflitam; sem o vínculo, conflitam", async () => {
    const medico = await novaSessao({ client: 21, resource: MEDICO, time: "09:00", duration: 60, protocol: 600 });
    const enfermagem = await novaSessao({ client: 21, resource: ENFERMAGEM, time: "09:00", duration: 20, protocol: 600 });
    await query(`INSERT INTO protocolo_ocorrencia_participantes(ocorrencia_id,ordem,category_id,professional_id,resource_id,session_id) VALUES
      (1,1,1,${PROF},${MEDICO},$1),(1,2,2,NULL,${ENFERMAGEM},$2)`, [medico, enfermagem]);
    const ok = await mover(enfermagem, 21, { resourceId: ENFERMAGEM, time: "09:20" });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
    await query(`DELETE FROM protocolo_ocorrencia_participantes`);
    const sem = await mover(enfermagem, 21, { resourceId: ENFERMAGEM, time: "09:40" });
    expect(sem).toMatchObject({ ok: false, status: 409 });
  });

  it("remarcar visita de protocolo continua arredondando por períodos e sem conflito segue igual", async () => {
    const protocolada = await novaSessao({ client: 23, resource: ENFERMAGEM, time: "09:00", duration: 40, protocol: 601 });
    const r = await mover(protocolada, 23, { resourceId: ENFERMAGEM, date: WED2, time: "10:00" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await dados(protocolada)).toMatchObject({ scheduled_time: "10:00", duration_minutes: 40, reschedule_count: 1 });
  });
});

describe("Corrida real entre transações simultâneas (duas conexões, janela alargada de propósito)", () => {
  const ok = (r: { ok: boolean }) => r.ok;

  it("mesmo profissional em duas clínicas ao mesmo tempo: só uma grava", async () => {
    state.delayMs = 250;
    const [a, b] = await Promise.all([
      avulsa({ resourceId: MEDICO, clientId: 21, empresaId: 5 }),
      avulsa({ resourceId: MEDICO_OUTRA_CLINICA, clientId: 31, empresaId: 6 }),
    ]);
    expect([a, b].filter(ok), JSON.stringify([a, b])).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ status: 409, error: "Horário já ocupado" });
    expect(await totalSessoes()).toBe(1);
    expect(await sobreposicoes()).toEqual([]);
  });

  it("mesmo paciente em duas agendas ao mesmo tempo: só uma grava", async () => {
    state.delayMs = 250;
    const [a, b] = await Promise.all([
      avulsa({ resourceId: MEDICO, clientId: 21, time: "09:00", durationMinutes: 60 }),
      avulsa({ resourceId: ONLINE, clientId: 21, time: "09:20", durationMinutes: 60 }),
    ]);
    expect([a, b].filter(ok), JSON.stringify([a, b])).toHaveLength(1);
    expect(await totalSessoes()).toBe(1);
    expect(await sobreposicoes()).toEqual([]);
  });

  it("criação versus remarcação do mesmo profissional (agendas diferentes): só uma vence", async () => {
    const alvo = await novaSessao({ client: 22, resource: MEDICO, time: "10:40", duration: 20 });
    state.delayMs = 250;
    const [criar, remarcar] = await Promise.all([
      avulsa({ resourceId: MEDICO_2, clientId: 21, time: "09:00", durationMinutes: 60 }),
      mover(alvo, 22, { resourceId: MEDICO, time: "09:20" }),
    ]);
    expect([criar, remarcar].filter(ok), JSON.stringify([criar, remarcar])).toHaveLength(1);
    expect(await sobreposicoes()).toEqual([]);
    const final = await dados(alvo);
    if (!remarcar.ok) expect(final).toMatchObject({ scheduled_time: "10:40", reschedule_count: 0 });
    else expect(final).toMatchObject({ scheduled_time: "09:20", reschedule_count: 1 });
    expect(await totalSessoes()).toBe(2);
  });

  it("criação versus remarcação do mesmo paciente em agendas diferentes: só uma vence", async () => {
    const alvo = await novaSessao({ client: 21, resource: MEDICO, time: "10:40", duration: 20 });
    state.delayMs = 250;
    const [criar, remarcar] = await Promise.all([
      avulsa({ resourceId: ONLINE, clientId: 21, time: "09:00", durationMinutes: 40 }),
      mover(alvo, 21, { resourceId: MEDICO, time: "09:20" }),
    ]);
    expect([criar, remarcar].filter(ok), JSON.stringify([criar, remarcar])).toHaveLength(1);
    expect(await sobreposicoes()).toEqual([]);
  });

  it("duas remarcações para o mesmo intervalo: só uma vence e nenhuma sessão é duplicada", async () => {
    const a = await novaSessao({ client: 21, resource: MEDICO, time: "09:00", duration: 20 });
    const b = await novaSessao({ client: 22, resource: MEDICO_2, time: "10:40", duration: 20 });
    state.delayMs = 250;
    const [ra, rb] = await Promise.all([
      mover(a, 21, { resourceId: MEDICO, time: "10:00" }),
      mover(b, 22, { resourceId: MEDICO_2, time: "10:00" }),
    ]);
    // Mesmo profissional em duas agendas: o mesmo intervalo só serve a um.
    expect([ra, rb].filter(ok), JSON.stringify([ra, rb])).toHaveLength(1);
    expect(await totalSessoes()).toBe(2);
    expect(await sobreposicoes()).toEqual([]);
  });

  it("não bloqueia o que é legítimo: profissionais e pacientes diferentes no mesmo horário gravam todos", async () => {
    state.delayMs = 250;
    const resultados = await Promise.all([
      avulsa({ resourceId: MEDICO, clientId: 21 }),
      avulsa({ resourceId: ONLINE, clientId: 22 }),
      avulsa({ resourceId: MEDICO_78_CLINICA_6, clientId: 32, empresaId: 6 }),
    ]);
    expect(resultados.every(ok), JSON.stringify(resultados)).toBe(true);
    expect(await totalSessoes()).toBe(3);
    expect(await sobreposicoes()).toEqual([]);
  });

  it("sem impasse: rodada mista de marcações e remarcações simultâneas termina sem erro de banco e sem sobreposição", async () => {
    state.delayMs = 20;
    const base = await Promise.all([
      novaSessao({ client: 21, resource: MEDICO, time: "10:40", duration: 20 }),
      novaSessao({ client: 22, resource: ONLINE, time: "10:40", duration: 20 }),
      novaSessao({ client: 23, resource: MEDICO_2, time: "10:20", duration: 20 }),
    ]);
    const tarefas: Promise<{ ok: boolean }>[] = [
      avulsa({ resourceId: MEDICO, clientId: 24, time: "09:00", durationMinutes: 40 }),
      avulsa({ resourceId: MEDICO_2, clientId: 24, time: "09:20", durationMinutes: 40 }),
      avulsa({ resourceId: MEDICO_OUTRA_CLINICA, clientId: 31, time: "09:00", empresaId: 6 }),
      avulsa({ resourceId: ONLINE, clientId: 21, time: "09:40", durationMinutes: 20 }),
      avulsa({ resourceId: MEDICO_78_CLINICA_6, clientId: 32, time: "09:00", empresaId: 6 }),
      mover(base[0], 21, { resourceId: MEDICO_2, time: "09:20" }),
      mover(base[1], 22, { resourceId: MEDICO, time: "09:00" }),
      mover(base[2], 23, { resourceId: ONLINE, time: "09:40" }),
    ];
    const resultados = await Promise.all(tarefas);
    expect(resultados.length).toBe(8);
    expect(await sobreposicoes()).toEqual([]);
    expect(await totalSessoes()).toBeGreaterThanOrEqual(3);
    // Nenhuma duplicação: cada id de sessão existe uma vez; as três de base seguem existindo.
    for (const id of base) expect(await dados(id)).toBeTruthy();
  });
});
