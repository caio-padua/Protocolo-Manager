import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
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
// Quem administra agendas da clínica: simulado por cabeçalho (a regra real é coberta em agenda-governance.test.ts).
vi.mock("../lib/agenda-governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/agenda-governance")>()),
  mayManageAgendaEmpresa: async (req: any) => req.headers["x-test-admin"] === "1",
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-role"]) { res.status(401).json({ error: "Não autenticado" }); return; }
    req.collaborator = { professionalId: Number(req.headers["x-test-prof"] ?? 101) }; next();
  },
}));
import router from "../routes/agenda-profissionais-preferidos";
import { mesclarVinculos } from "../lib/agenda-vinculos";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), (req: any, _res: any, next: any) => {
  req.tenantContext = { authenticated: !!req.headers["x-test-role"], empresaId: Number(req.headers["x-test-empresa"] ?? 5), professionalId: 101 };
  next();
}, router, (err: any, _req: any, res: any, _next: any) => { res.status(500).json({ error: String(err?.message ?? err) }); });
const q = (text: string, params?: any[]) => isolated.pool.query(text, params);
const api = (method: "get" | "put", url: string, body?: unknown, extra: Record<string, string> = {}) => {
  let r = (request(app) as any)[method](url).set("x-test-role", "admin");
  for (const [k, v] of Object.entries(extra)) r = r.set(k, v);
  return r.send(body);
};
const ADMIN = { "x-test-admin": "1" };

// Ids sintéticos. Enfermagem = categoria 2; Medicina = categoria 1.
const FABIA = 26, DAYANA = 13, CAIO = 6, DR_OUTRA_CLINICA = 77, ENF_INATIVA = 128;
const HOME_CARE_ENF = 27, OUTRO_LOCAL_ENF = 28, HOME_CARE_MED_CAIO = 29, SEDE_MED_CAIO = 22, SEDE_ENF = 23, AGENDA_OUTRA_CLINICA = 90;

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await q(`
    CREATE TABLE empresas (id integer PRIMARY KEY, nome text);
    CREATE TABLE professional_areas (id integer PRIMARY KEY, name text);
    CREATE TABLE locations (id integer PRIMARY KEY, empresa_id integer, active text);
    CREATE TABLE professionals (id integer PRIMARY KEY, name text, area_id integer, active boolean DEFAULT true, empresa_id integer, habilitacao_nivel text);
    CREATE TABLE professional_empresas (professional_id integer, empresa_id integer);
    CREATE TABLE location_professionals (professional_id integer, location_id integer);
    CREATE TABLE agenda_resources (id integer PRIMARY KEY, name text, modality text, color text, professional_id integer, location_id integer,
      category_id integer, active boolean DEFAULT true, sort_order integer DEFAULT 0, empresa_id integer);
    CREATE TABLE agenda_profissionais_preferidos (
      id SERIAL PRIMARY KEY, empresa_id integer NOT NULL, agenda_id integer NOT NULL, professional_id integer NOT NULL,
      criado_por integer, criado_em timestamptz NOT NULL DEFAULT now(), UNIQUE (agenda_id, professional_id));
    INSERT INTO empresas VALUES (5,'Clinica Sintetica A'),(6,'Clinica Sintetica B');
    INSERT INTO professional_areas VALUES (1,'Medicina'),(2,'Enfermagem');
    INSERT INTO locations VALUES (35,5,'true'),(31,5,'true');
    INSERT INTO professionals VALUES
      (${FABIA},'Enf. Sintetica Fabia',2,true,5,'enfermeiro'),
      (${DAYANA},'Enf. Sintetica Dayana',2,true,5,'enfermeiro'),
      (${CAIO},'Dr. Sintetico Caio',1,true,5,NULL),
      (${DR_OUTRA_CLINICA},'Enf. Outra Clinica',2,true,6,'enfermeiro'),
      (${ENF_INATIVA},'Enf. Inativa',2,false,5,'tecnico');
    INSERT INTO location_professionals VALUES (${CAIO},35),(${DAYANA},31);
    INSERT INTO agenda_resources(id,name,modality,color,professional_id,location_id,category_id,active,sort_order,empresa_id) VALUES
      (${HOME_CARE_ENF},'AGENDA ENFERMAGEM - HOME CARE','home_care','#111111',NULL,NULL,2,true,1,5),
      (${OUTRO_LOCAL_ENF},'AGENDA ENFERMAGEM - OUTRO LOCAL','externo','#222222',NULL,NULL,2,true,2,5),
      (${HOME_CARE_MED_CAIO},'AGENDA MEDICO - CAIO - HOME CARE','home_care','#333333',${CAIO},NULL,1,true,3,5),
      (${SEDE_MED_CAIO},'AGENDA MEDICO - CAIO - SEDE','local','#444444',${CAIO},35,1,true,4,5),
      (${SEDE_ENF},'AGENDA ENFERMAGEM - SEDE','local','#555555',NULL,31,2,true,5,5),
      (${AGENDA_OUTRA_CLINICA},'AGENDA OUTRA CLINICA','home_care','#666666',NULL,NULL,2,true,6,6),
      (91,'AGENDA INATIVA','home_care','#777777',NULL,NULL,2,false,7,5);
  `);
}, 90000);
afterAll(async () => { if (isolated) await isolated.stop(); }, 60000);

const agendasDe = async (prof: number, extra: Record<string, string> = {}) => (await api("get", `/professionals/${prof}/agendas`, undefined, extra)).body.agendas as any[];
const linhas = async () => (await q("SELECT agenda_id, professional_id FROM agenda_profissionais_preferidos ORDER BY agenda_id, professional_id")).rows;

describe("Cadastro do profissional: agendas sem local aparecem e podem ser ligadas", () => {
  it("lista a agenda Home Care (sem local) e marca as com local como vínculo pelo local", async () => {
    const lista = await agendasDe(FABIA);
    const home = lista.find((a) => a.id === HOME_CARE_ENF);
    expect(home).toMatchObject({ locationId: null, empresaId: 5, vinculado: false, editavelNoCadastro: true, motivoBloqueio: null });
    expect(lista.find((a) => a.id === OUTRO_LOCAL_ENF)).toMatchObject({ locationId: null, editavelNoCadastro: true });
    expect(lista.find((a) => a.id === SEDE_ENF)).toMatchObject({ editavelNoCadastro: false });
    expect(lista.find((a) => a.id === SEDE_ENF).motivoBloqueio).toMatch(/pelo local/);
    // inativa e de outra clínica nunca aparecem
    expect(lista.map((a) => a.id)).not.toContain(91);
    expect(lista.map((a) => a.id)).not.toContain(AGENDA_OUTRA_CLINICA);
  });

  it("agenda individual de outro profissional bloqueia no cadastro e o servidor também recusa (409)", async () => {
    const home = (await agendasDe(FABIA)).find((a) => a.id === HOME_CARE_MED_CAIO);
    expect(home.editavelNoCadastro).toBe(false);
    expect(home.motivoBloqueio).toMatch(/Categoria profissional diferente/);
    const r = await api("put", `/professionals/${FABIA}/agendas/${HOME_CARE_MED_CAIO}/preferencia`, { vinculado: true }, ADMIN);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("agenda_individual");
    expect(await linhas()).toEqual([]);
  });

  it("categoria profissional diferente da categoria da agenda é recusada (409) e explicada", async () => {
    const home = (await agendasDe(CAIO)).find((a) => a.id === HOME_CARE_ENF);
    expect(home).toMatchObject({ editavelNoCadastro: false, motivoBloqueio: "Categoria profissional diferente da categoria da agenda." });
    const r = await api("put", `/professionals/${CAIO}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: true }, ADMIN);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("profissional_incompativel");
    expect(await linhas()).toEqual([]);
  });

  it("o titular de uma agenda individual aparece ligado e bloqueado (muda em Agenda Configuração)", async () => {
    const minha = (await agendasDe(CAIO)).find((a) => a.id === HOME_CARE_MED_CAIO);
    expect(minha).toMatchObject({ vinculado: true, origens: ["individual"], editavelNoCadastro: false });
    expect(minha.motivoBloqueio).toMatch(/Agenda Configuração/);
  });

  it("ligar grava uma linha, é idempotente e aparece nos DOIS lados (cadastro e Agenda Configuração)", async () => {
    const ligar = () => api("put", `/professionals/${FABIA}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: true }, ADMIN);
    expect((await ligar()).status).toBe(200);
    expect((await ligar()).status).toBe(200);
    expect(await linhas()).toEqual([{ agenda_id: HOME_CARE_ENF, professional_id: FABIA }]);
    // lado do cadastro
    expect((await agendasDe(FABIA)).find((a) => a.id === HOME_CARE_ENF)).toMatchObject({ vinculado: true, origens: ["preferencia"] });
    // lado da Agenda Configuração
    const vinc = (await api("get", `/agenda/resources/${HOME_CARE_ENF}/profissionais-vinculados`)).body;
    expect(vinc.agenda).toMatchObject({ id: HOME_CARE_ENF, locationId: null });
    expect(vinc.profissionais).toEqual([expect.objectContaining({ id: FABIA, origens: ["preferencia"], categoriaNome: "Enfermagem" })]);
    // outra pessoa da mesma categoria continua desligada
    expect((await agendasDe(DAYANA)).find((a) => a.id === HOME_CARE_ENF).vinculado).toBe(false);
  });

  it("desligar remove só aquela pessoa e some dos dois lados", async () => {
    await api("put", `/professionals/${DAYANA}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: true }, ADMIN);
    expect((await api("put", `/professionals/${FABIA}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: false }, ADMIN)).status).toBe(200);
    expect(await linhas()).toEqual([{ agenda_id: HOME_CARE_ENF, professional_id: DAYANA }]);
    const vinc = (await api("get", `/agenda/resources/${HOME_CARE_ENF}/profissionais-vinculados`)).body;
    expect(vinc.profissionais.map((p: any) => p.id)).toEqual([DAYANA]);
    await api("put", `/professionals/${DAYANA}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: false }, ADMIN);
    expect(await linhas()).toEqual([]);
  });

  it("sem autoridade administrativa nada é gravado (403)", async () => {
    const r = await api("put", `/professionals/${FABIA}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: true });
    expect(r.status).toBe(403);
    expect(await linhas()).toEqual([]);
  });

  it("agenda com local, agenda de outra clínica, inativa e pessoa de outra clínica são recusadas", async () => {
    const com = await api("put", `/professionals/${DAYANA}/agendas/${SEDE_ENF}/preferencia`, { vinculado: true }, ADMIN);
    expect(com.status).toBe(409); expect(com.body.code).toBe("agenda_com_local");
    expect((await api("put", `/professionals/${FABIA}/agendas/${AGENDA_OUTRA_CLINICA}/preferencia`, { vinculado: true }, ADMIN)).status).toBe(404);
    expect((await api("put", `/professionals/${FABIA}/agendas/91/preferencia`, { vinculado: true }, ADMIN)).status).toBe(404);
    const estranha = await api("put", `/professionals/${DR_OUTRA_CLINICA}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: true }, ADMIN);
    expect(estranha.status).toBe(409); expect(estranha.body.code).toBe("profissional_incompativel");
    const inativa = await api("put", `/professionals/${ENF_INATIVA}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: true }, ADMIN);
    expect(inativa.status).toBe(409);
    expect(await linhas()).toEqual([]);
  });

  it("a clínica 6 não enxerga a agenda da clínica 5 nem o profissional dela", async () => {
    expect((await api("get", `/agenda/resources/${HOME_CARE_ENF}/profissionais-vinculados`, undefined, { "x-test-empresa": "6" })).status).toBe(404);
    expect((await api("get", `/professionals/${FABIA}/agendas`, undefined, { "x-test-empresa": "6" })).status).toBe(404);
    const dela = await agendasDe(DR_OUTRA_CLINICA, { "x-test-empresa": "6" });
    expect(dela.map((a) => a.id)).toEqual([AGENDA_OUTRA_CLINICA]);
  });

  it("pedido mal formado é recusado sem gravar", async () => {
    expect((await api("put", `/professionals/${FABIA}/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: "sim" }, ADMIN)).status).toBe(400);
    expect((await api("put", `/professionals/abc/agendas/${HOME_CARE_ENF}/preferencia`, { vinculado: true }, ADMIN)).status).toBe(400);
    expect((await api("get", `/agenda/resources/0/profissionais-vinculados`)).status).toBe(400);
    expect(await linhas()).toEqual([]);
  });
});

describe("Agenda Configuração puxa o profissional do cadastro", () => {
  it("agenda com local mostra quem está ligado ao local; titular individual acumula as origens", async () => {
    const vinc = (await api("get", `/agenda/resources/${SEDE_MED_CAIO}/profissionais-vinculados`)).body;
    expect(vinc.agenda).toMatchObject({ locationId: 35, professionalId: CAIO });
    expect(vinc.profissionais).toEqual([expect.objectContaining({ id: CAIO, origens: ["individual", "local"] })]);
    const enf = (await api("get", `/agenda/resources/${SEDE_ENF}/profissionais-vinculados`)).body;
    expect(enf.profissionais.map((p: any) => p.id)).toEqual([DAYANA]);
  });

  it("agenda sem ninguém ligado devolve lista vazia (não inventa profissional)", async () => {
    const vinc = (await api("get", `/agenda/resources/${OUTRO_LOCAL_ENF}/profissionais-vinculados`)).body;
    expect(vinc.profissionais).toEqual([]);
  });

  it("agenda individual sem local (Home Care do médico) mostra o titular", async () => {
    const vinc = (await api("get", `/agenda/resources/${HOME_CARE_MED_CAIO}/profissionais-vinculados`)).body;
    expect(vinc.profissionais).toEqual([expect.objectContaining({ id: CAIO, origens: ["individual"] })]);
  });
});

describe("mesclarVinculos (regra pura)", () => {
  const linha = (id: number, name: string) => ({ id, name, active: true, categoriaId: 2, categoriaNome: "Enfermagem", habilitacaoNivel: null });
  it("junta origens da mesma pessoa sem repetir e ordena por nome", () => {
    const r = mesclarVinculos([
      { origem: "preferencia", linhas: [linha(2, "Zeca"), linha(1, "Ana")] },
      { origem: "individual", linhas: [linha(1, "Ana")] },
      { origem: "local", linhas: [linha(1, "Ana")] },
    ]);
    expect(r.map((p) => p.name)).toEqual(["Ana", "Zeca"]);
    expect(r[0].origens).toEqual(["individual", "local", "preferencia"]);
    expect(r[1].origens).toEqual(["preferencia"]);
  });
});
