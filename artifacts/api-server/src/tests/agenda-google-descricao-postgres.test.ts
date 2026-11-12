import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("@workspace/db", () => ({
  db: new Proxy({}, {
    get(_target, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  }),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator(req: any, res: any, next: any) {
    if (!req.headers["x-synthetic-owner"]) return res.status(401).json({ error: "Não autenticado" });
    req.tenantContext = { isPlatformOwner: true, empresaId: Number(req.headers["x-synthetic-company"]) };
    next();
  },
}));
import router from "../routes/agenda-google-compromissos";

const app = express();
app.use(router);
let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await isolated.pool.query(`
    CREATE TABLE locations (id int PRIMARY KEY, empresa_id int, active text, name text, color text, agenda_papel text, google_calendar_id text);
    CREATE TABLE agenda_compromissos (id int PRIMARY KEY, location_id int, chave text, ical_uid text, titulo text, descricao text,
      inicio timestamptz, fim timestamptz, dia_inteiro boolean, recorrencia text, origem text, status text, google_calendar_id text);
    CREATE TABLE agenda_google_source (location_id int, event_id text, body jsonb, PRIMARY KEY(location_id,event_id));
    CREATE TABLE agenda_resources (id int PRIMARY KEY, empresa_id int, active boolean, name text, color text, location_id int, google_calendar_id text);
    CREATE TABLE agenda_compromissos_recurso (id int PRIMARY KEY, recurso_id int, chave text, ical_uid text, titulo text, descricao text,
      inicio timestamptz, fim timestamptz, dia_inteiro boolean, recorrencia text, origem text, status text, google_calendar_id text);
    CREATE TABLE agenda_google_source_recurso (recurso_id int, event_id text, body jsonb, PRIMARY KEY(recurso_id,event_id));
    CREATE TABLE sessions (id int PRIMARY KEY, empresa_id int, google_calendar_id text, google_event_id text, google_sync_pending_event_id text);
    INSERT INTO locations VALUES
      (1,5,'true','Local sintético A','#123456','local',null),
      (2,6,'true','Local sintético B','#654321','local',null),
      (3,5,'false','Local inativo','#000000','local',null);
    INSERT INTO agenda_compromissos VALUES
      (1,1,'google:event-a','a@google.com','A','Descrição sintética A','2026-09-02T13:00:00Z','2026-09-02T14:00:00Z',false,null,'google','ativo'),
      (2,2,'google:event-b','b@google.com','B','Descrição sintética B','2026-09-02T13:00:00Z','2026-09-02T14:00:00Z',false,null,'google','ativo'),
      (3,3,'google:event-c','c@google.com','C','Descrição inativa','2026-09-02T13:00:00Z','2026-09-02T14:00:00Z',false,null,'google','ativo'),
      (4,1,'google:event-d','d@google.com','D','Descrição cancelada','2026-09-02T13:00:00Z','2026-09-02T14:00:00Z',false,null,'google','cancelado'),
      (5,1,'google:event-x','x@google.com','E','Outra descrição sintética','2026-09-02T15:00:00Z','2026-09-02T16:00:00Z',false,null,'google','ativo'),
      (6,1,'id|com|20260902','id|com','F','Exceção de arquivo sintética','2026-09-02T16:00:00Z','2026-09-02T17:00:00Z',false,null,'ics','ativo'),
      (7,1,'unico|','unico','G','Único de arquivo sintético','2026-09-02T17:00:00Z','2026-09-02T18:00:00Z',false,null,'ics','ativo'),
      (8,1,'serie|','serie','H','Série de arquivo sintética','2026-09-02T18:00:00Z','2026-09-02T19:00:00Z',false,'FREQ=WEEKLY','ics','ativo');
    INSERT INTO agenda_google_source VALUES
      (1,'event-a','{"recurringEventId":"serie-sintetica"}'),
      (2,'event-x','{"recurringEventId":"outra-clinica"}');
    -- Agendas de atendimento: 10 = dona do calendário do local 1; 11 e 12 = sem local (Home Care).
    INSERT INTO agenda_resources VALUES
      (10,5,true,'AGENDA SEDE','#1d4f8f',1,'cal-sede'),
      (11,5,true,'AGENDA HOME CARE','#7cb342',null,'cal-hc'),
      (12,6,true,'AGENDA OUTRA EMPRESA','#000000',null,'cal-outra');
    UPDATE locations SET google_calendar_id = 'cal-sede' WHERE id = 1;
    INSERT INTO agenda_compromissos_recurso VALUES
      (1,11,'google:hc-1','hc1@google.com','Visita Home Care','Descrição HC','2026-10-05T13:00:00Z','2026-10-05T14:00:00Z',false,null,'google','ativo','cal-hc'),
      (2,12,'google:oc-1','oc1@google.com','Visita outra empresa','Descrição OC','2026-10-05T13:00:00Z','2026-10-05T14:00:00Z',false,null,'google','ativo','cal-outra');
    -- Eco: sessão do sistema enviada ao Google; o evento que volta na leitura do mesmo calendário não pode duplicar o atendimento.
    INSERT INTO agenda_compromissos VALUES
      (20,1,'google:eco-1','eco1@google.com','Eco da sessão','','2026-10-05T15:00:00Z','2026-10-05T16:00:00Z',false,null,'google','ativo','cal-sede'),
      (21,1,'google:so-google','sg@google.com','Só do Google','','2026-10-05T17:00:00Z','2026-10-05T18:00:00Z',false,null,'google','ativo','cal-sede');
    INSERT INTO sessions VALUES (1,5,'cal-sede','eco-1',null), (2,6,'cal-sede','so-google',null);
  `);
}, 60_000);
afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);
const get = (id: number, company: number) => request(app)
  .get(`/agenda/google-compromissos/${id}/descricao?inicio=2026-09-02T13%3A00%3A00.000Z`)
  .set("x-synthetic-owner", "1").set("x-synthetic-company", String(company));

describe("compromissos das agendas sem local e ecos, com banco isolado", () => {
  const lista = () => request(app).get("/agenda/google-compromissos?de=2026-10-05&ate=2026-10-06")
    .set("x-synthetic-owner", "1").set("x-synthetic-company", "5");
  it("traz a visita Home Care com id negativo e a agenda de atendimento; não traz a de outra empresa", async () => {
    const r = await lista();
    expect(r.status).toBe(200);
    const hc = r.body.eventos.find((e: any) => e.titulo === "Visita Home Care");
    expect(hc).toMatchObject({ agendaId: -11, agendaRecursoId: 11, agenda: "AGENDA HOME CARE" });
    expect(r.body.eventos.some((e: any) => e.titulo === "Visita outra empresa")).toBe(false);
    expect(r.body.agendas.some((a: any) => a.id === -11 && a.agendaRecursoId === 11)).toBe(true);
    expect(r.body.agendas.some((a: any) => a.id === -12)).toBe(false);
  });
  it("descarta o eco de sessão da própria empresa, mas mantém o evento do Google igual de outra empresa", async () => {
    const r = await lista();
    const titulos = r.body.eventos.map((e: any) => e.titulo);
    expect(titulos).not.toContain("Eco da sessão");
    expect(titulos).toContain("Só do Google"); // a sessão com o mesmo id é de OUTRA empresa: não esconde nada daqui
  });
  it("liga o calendário do local à agenda de atendimento só quando há exatamente uma dona", async () => {
    const r = await lista();
    const local = r.body.agendas.find((a: any) => a.id === 1);
    expect(local.agendaRecursoId).toBe(10);
  });
});

describe("descrição importada com banco isolado", () => {
  it("restringe o acesso efetivamente à empresa selecionada", async () => {
    expect((await get(1, 5)).body).toEqual({ descricao: "Descrição sintética A" });
    const foreign = await get(2, 5);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain("Descrição sintética B");
    expect((await get(2, 6)).body).toEqual({ descricao: "Descrição sintética B" });
  });
  it("não retorna eventos em local inativo nem compromissos cancelados", async () => {
    expect((await get(3, 5)).status).toBe(404);
    expect((await get(4, 5)).status).toBe(404);
  });
  it("identifica exceção recorrente sem usar fonte de outro local", async () => {
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-02&ate=2026-09-02")
      .set("x-synthetic-owner", "1").set("x-synthetic-company", "5");
    expect(response.status).toBe(200);
    expect(response.body.eventos.map((e: any) => [e.titulo, e.recorrente])).toEqual([
      ["A", true], ["E", false], ["F", true], ["G", false], ["H", true],
    ]);
  });
});
