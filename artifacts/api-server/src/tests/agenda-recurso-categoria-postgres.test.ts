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
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_req: any, _res: any, next: any) => next() }));
// Guard real; a concessão clínica é controlada por identidades sintéticas (101 = admin da clínica 5).
vi.mock("../lib/clinical-access", () => ({
  clinicManagementPermission: async (professionalId: number) => ({ allowed: professionalId === 101 }),
  currentResponsibleDoctor: async () => null,
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (_req: any, _res: any, next: any) => next(),
}));
import router from "../routes/agenda";
import { AGENDA_CATEGORIA_AUDITORIA_DDL } from "../lib/agenda-recurso-categoria";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const app = express();
app.use(express.json(), (req, _res, next) => {
  const role = req.headers["x-test-role"];
  req.tenantContext = { authenticated: !!role, empresaId: 5, professionalId: role === "admin" ? 101 : 102 } as any;
  next();
}, router);

// Dados 100% sintéticos. Clínica 5 = sessão; clínica 6 = outra clínica.
// Categorias: 1 Medicina(medico) 2 Enfermagem 8 Biomedicina 20 Fisioterapia (criada "no futuro", sem profissional).
const CAT = { medicina: 1, enfermagem: 2, biomed: 8, fisio: 20 };
const q = (text: string, params?: any[]) => isolated.pool.query(text, params);
const post = (body: any, role = "admin") => request(app).post("/agenda/resources").set("x-test-role", role).send(body);
const put = (id: number, body: any, role = "admin") =>
  request(app).put(`/agenda/resources/${id}`).set("x-test-role", role).send(body);
const base = { name: "Agenda X", modality: "local", locationId: 50 };

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await q(`
    CREATE TABLE professional_areas (id integer PRIMARY KEY, name text, slug text, professional_type text, active boolean, sort_order integer DEFAULT 0);
    CREATE TABLE locations (id integer PRIMARY KEY, empresa_id integer, active text, google_calendar_id text, name text, agenda_papel text);
    CREATE TABLE professionals (id integer PRIMARY KEY, name text, area_id integer, active boolean DEFAULT true, empresa_id integer);
    CREATE TABLE professional_empresas (professional_id integer, empresa_id integer);
    CREATE TABLE location_professionals (professional_id integer, location_id integer);
    CREATE TABLE sessions (id serial PRIMARY KEY, resource_id integer, status text, scheduled_date text);
    CREATE TABLE agenda_resources (
      id serial PRIMARY KEY, name text NOT NULL, kind text NOT NULL DEFAULT 'enfermagem', modality text NOT NULL DEFAULT 'local',
      color text NOT NULL DEFAULT '#3D7A7A', slot_minutes integer NOT NULL DEFAULT 30, professional_id integer, location_id integer,
      google_calendar_id text, category_id integer, active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
      external_cep text, external_logradouro text, external_bairro text, external_cidade text, external_uf text, external_numero text, external_complemento text, empresa_id integer,
      created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO professional_areas VALUES
      (1,'Medicina','medicina','medico',true,1),(2,'Enfermagem','enfermagem','nao_medico',true,2),
      (8,'Biomedicina','biomedicina','nao_medico',true,8),(20,'Fisioterapia','fisioterapia','nao_medico',true,20),
      (30,'Antiga','antiga','nao_medico',false,30);
    INSERT INTO locations VALUES (50,5,'true','cal-50','Sala 50','local'),(51,5,'true','cal-51','Sala 51','local'),(60,6,'true','cal-60','Sala outra clinica','local'),(52,5,'false','cal-52','Sala inativa','local'),
      (53,5,'true','cal-53','AGENDA PESSOAL','pessoal'),(54,5,'true','cal-54','AGENDA GERAL','geral'),(55,5,'true','cal-55','AGENDA REMOTO','remoto'),(56,5,'true',NULL,'Sala fisica sem calendario',NULL);
    INSERT INTO professionals VALUES (201,'Medico Sintetico',1,true,5),(202,'Enfermeira Sintetica',2,true,5),
      (203,'Biomedica Sintetica',8,true,5),(204,'Biomedica Outra Clinica',8,true,6),(205,'Biomedica Inativa',8,false,5),
      (206,'Fisio Sintetico',20,true,5);
    INSERT INTO location_professionals VALUES (201,50),(202,50),(203,50),(206,50),(204,60),(205,50);
    -- Legados: 1 = medico com profissional (prova), 2 = compartilhada sem profissional (sem prova)
    INSERT INTO agenda_resources(name,kind,professional_id,location_id,google_calendar_id) VALUES
      ('AGENDA ENFERMAGEM - LOCAL','enfermagem',NULL,50,'cal-50'),('AGENDA MEDICO','medico',201,50,'cal-50');
  `);
  await q(AGENDA_CATEGORIA_AUDITORIA_DDL);
}, 60_000);
afterAll(async () => {
  state.database = null;
  if (isolated) await isolated.stop();
}, 60_000);

describe("agenda x categoria profissional no banco isolado", () => {
  it("recusa sem sessão (401) e sem permissão administrativa (403)", async () => {
    expect((await request(app).post("/agenda/resources").send({ ...base, categoryId: CAT.biomed })).status).toBe(401);
    expect((await post({ ...base, categoryId: CAT.biomed }, "comum")).status).toBe(403);
    expect((await q("SELECT count(*)::int n FROM agenda_resources")).rows[0].n).toBe(2);
  });

  it("legado sem categoria aparece pendente, nunca deduzida do nome ou do tipo", async () => {
    const list = (await request(app).get("/agenda/resources").set("x-test-role", "admin")).body;
    const enf = list.find((r: any) => r.name === "AGENDA ENFERMAGEM - LOCAL");
    expect(enf).toMatchObject({ categoryId: null, categoryName: null, categoryStatus: "pendente", sharing: "compartilhada" });
    expect(list.find((r: any) => r.name === "AGENDA MEDICO")).toMatchObject({ categoryStatus: "pendente", sharing: "individual" });
  });

  it("cria agenda de categoria nova (Fisioterapia) sem profissional, derivando kind e calendário no servidor", async () => {
    const res = await post({ ...base, name: "agenda fisioterapeuta local", categoryId: CAT.fisio });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: "categoria", categoryId: CAT.fisio, categoryName: "Fisioterapia", categoryStatus: "confirmada",
      sharing: "compartilhada", googleCalendarId: "cal-50", locationId: 50, professionalId: null,
    });
    const audit = await q("SELECT origin, category_id, actor_professional_id FROM agenda_resource_category_audit WHERE resource_id=$1", [res.body.id]);
    expect(audit.rows).toEqual([{ origin: "criacao", category_id: CAT.fisio, actor_professional_id: 101 }]);
  });

  it("ignora kind enviado pelo navegador e cria médico/enfermagem/biomédico individuais", async () => {
    const med = await post({ ...base, name: "Medico ind", categoryId: CAT.medicina, professionalId: 201, kind: "enfermagem" });
    expect(med.status).toBe(201);
    expect(med.body).toMatchObject({ kind: "medico", sharing: "individual", professionalId: 201 });
    const enf = await post({ ...base, name: "Enf ind", categoryId: CAT.enfermagem, professionalId: 202 });
    expect(enf.body).toMatchObject({ kind: "enfermagem", categoryName: "Enfermagem" });
    const bio = await post({ ...base, name: "agenda biomedico local", categoryId: CAT.biomed, professionalId: 203 });
    expect(bio.body).toMatchObject({ kind: "categoria", categoryName: "Biomedicina", professionalId: 203 });
  });

  it("recusa profissional de outra categoria, de outra clínica, inativo, e categoria/local inválidos", async () => {
    expect((await post({ ...base, categoryId: CAT.biomed, professionalId: 202 })).status).toBe(409);
    expect((await post({ ...base, categoryId: CAT.biomed, professionalId: 204 })).status).toBe(403);
    expect((await post({ ...base, categoryId: CAT.biomed, professionalId: 205 })).status).toBe(403);
    expect((await post({ ...base, categoryId: 30 })).status).toBe(404);
    expect((await post({ ...base, categoryId: 999 })).status).toBe(404);
    expect((await post({ ...base, categoryId: CAT.biomed, locationId: 60 })).status).toBe(403);
    expect((await post({ ...base, categoryId: CAT.biomed, locationId: 52 })).status).toBe(403);
    expect((await post({ ...base, locationId: 50 })).status).toBe(400);
  });

  it("confirma categoria de legado com auditoria e só dentro da mesma classe", async () => {
    const legacy = (await q("SELECT id FROM agenda_resources WHERE name='AGENDA ENFERMAGEM - LOCAL'")).rows[0].id;
    // Mudar a classe de enfermagem para biomedicina muda o tipo da agenda: recusado.
    const wrong = await put(legacy, { categoryId: CAT.biomed });
    expect(wrong.status).toBe(409);
    expect((await q("SELECT category_id FROM agenda_resources WHERE id=$1", [legacy])).rows[0].category_id).toBeNull();
    const ok = await put(legacy, { categoryId: CAT.enfermagem });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ categoryStatus: "confirmada", categoryName: "Enfermagem", sharing: "compartilhada" });
    const audit = await q("SELECT origin, previous_category_id, category_id FROM agenda_resource_category_audit WHERE resource_id=$1", [legacy]);
    expect(audit.rows).toEqual([{ origin: "confirmacao_manual", previous_category_id: null, category_id: CAT.enfermagem }]);
  });

  it("não altera profissional/local de agenda legada ainda sem categoria", async () => {
    const legacy = (await q("SELECT id FROM agenda_resources WHERE name='AGENDA MEDICO'")).rows[0].id;
    const res = await put(legacy, { professionalId: 201 });
    expect(res.status).toBe(409);
  });

  it("recusa troca de local com sessões futuras e aceita sem elas", async () => {
    const created = (await post({ ...base, name: "Fisio 2", categoryId: CAT.fisio })).body;
    await q("INSERT INTO sessions(resource_id,status,scheduled_date) VALUES ($1,'scheduled','2999-01-01')", [created.id]);
    const blocked = await put(created.id, { locationId: 51 });
    expect(blocked.status).toBe(409);
    expect((await q("SELECT location_id FROM agenda_resources WHERE id=$1", [created.id])).rows[0].location_id).toBe(50);
    await q("UPDATE sessions SET status='completed' WHERE resource_id=$1", [created.id]);
    const ok = await put(created.id, { locationId: 51 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ locationId: 51, googleCalendarId: "cal-51" });
  });

  it("não troca categoria para outra classe de agenda já criada (preserva histórico)", async () => {
    const bio = (await q("SELECT id FROM agenda_resources WHERE name='agenda biomedico local'")).rows[0].id;
    expect((await put(bio, { categoryId: CAT.medicina })).status).toBe(409);
    // O profissional vinculado é biomédico: outra categoria da mesma classe também é recusada.
    const mismatch = await put(bio, { categoryId: CAT.fisio });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toContain("Fisioterapia");
    // Sem profissional individual, trocar entre categorias da mesma classe é permitido e auditado.
    const shared = (await q("SELECT id FROM agenda_resources WHERE name='agenda fisioterapeuta local'")).rows[0].id;
    const swapped = await put(shared, { categoryId: CAT.biomed });
    expect(swapped.status).toBe(200);
    const audit = await q("SELECT origin, previous_category_id, category_id FROM agenda_resource_category_audit WHERE resource_id=$1 ORDER BY id", [shared]);
    expect(audit.rows[1]).toEqual({ origin: "alteracao", previous_category_id: CAT.fisio, category_id: CAT.biomed });
  });

  it("distingue registros de local por papel: pessoal e geral não atendem; modalidade precisa combinar", async () => {
    const pessoal = await post({ ...base, name: "x", categoryId: CAT.fisio, locationId: 53 });
    expect(pessoal.status).toBe(409);
    expect((await post({ ...base, name: "x", categoryId: CAT.fisio, locationId: 54 })).status).toBe(409);
    // Presencial em agenda remota e online em agenda local: recusados.
    expect((await post({ ...base, name: "x", categoryId: CAT.fisio, locationId: 55 })).status).toBe(409);
    expect((await post({ ...base, name: "x", categoryId: CAT.fisio, locationId: 50, modality: "online" })).status).toBe(409);
    // Online na agenda remota e presencial em espaço físico sem calendário: aceitos, sem fundir registros.
    const online = await post({ ...base, name: "Fisio online", categoryId: CAT.fisio, locationId: 55, modality: "online" });
    expect(online.status).toBe(201);
    expect(online.body).toMatchObject({ locationId: 55, googleCalendarId: "cal-55" });
    const fisico = await post({ ...base, name: "Fisio sala fisica", categoryId: CAT.fisio, locationId: 56 });
    expect(fisico.status).toBe(201);
    expect(fisico.body.googleCalendarId).toBeNull();
    expect((await q("SELECT count(*)::int n FROM locations")).rows[0].n).toBe(8);
  });

  it("renomear não mexe no vínculo nem na categoria", async () => {
    const res = (await q("SELECT id FROM agenda_resources WHERE name='Enf ind'")).rows[0].id;
    const r = await put(res, { name: "Enfermagem renomeada" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ categoryId: CAT.enfermagem, professionalId: 202, kind: "enfermagem" });
  });
});

describe("Nova agenda: Sede / Externo / Remoto, sem exigir outra agenda e com Corpo Clínico", () => {
  const ENDERECO = { cep: "01001000", logradouro: "Praça da Sé", bairro: "Sé", cidade: "São Paulo", uf: "sp", numero: "100", complemento: "Sala 2" };
  const semLocal = { name: "Agenda sem local", modality: "local" };

  it("Márcio-like (biomédico do Corpo Clínico, sem vínculo de local nem agenda) cria a PRIMEIRA agenda sem escolher outra agenda", async () => {
    await q("INSERT INTO professionals VALUES (207,'MARCIO SINTETICO',8,true,5)");
    const res = await post({ ...semLocal, name: "Agenda biomedico Marcio", categoryId: CAT.biomed, professionalId: 207 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ locationId: null, empresaId: 5, professionalId: 207, categoryId: CAT.biomed, kind: "categoria", googleCalendarId: null });
    const lista = (await request(app).get("/agenda/resources").set("x-test-role", "admin")).body;
    expect(lista.find((r: any) => r.id === res.body.id)).toMatchObject({ canManage: true, sharing: "individual" });
    // Renomear a agenda sem local continua autorizado e não mexe no vínculo.
    const ren = await put(res.body.id, { name: "Agenda Marcio renomeada" });
    expect(ren.status).toBe(200);
    expect(ren.body).toMatchObject({ professionalId: 207, categoryId: CAT.biomed, locationId: null });
  });

  it("a regra do Corpo Clínico vale também por vínculo profissional-empresa, e recusa inativo e outra clínica", async () => {
    await q("INSERT INTO professionals VALUES (208,'VINCULADO POR EMPRESA',8,true,NULL)");
    await q("INSERT INTO professional_empresas VALUES (208,5)");
    expect((await post({ ...semLocal, categoryId: CAT.biomed, professionalId: 208 })).status).toBe(201);
    expect((await post({ ...semLocal, categoryId: CAT.biomed, professionalId: 205 })).status).toBe(403); // inativo
    expect((await post({ ...semLocal, categoryId: CAT.biomed, professionalId: 204 })).status).toBe(403); // outra clínica
    expect((await post({ ...semLocal, categoryId: CAT.medicina, professionalId: 207 })).status).toBe(409); // outra categoria (id)
  });

  it("EXTERNO exige endereço; guarda normalizado e expõe texto, Google Maps e Waze", async () => {
    const sem = await post({ ...semLocal, categoryId: CAT.fisio, modality: "externo" });
    expect(sem.status).toBe(400);
    expect((await post({ ...semLocal, categoryId: CAT.fisio, modality: "externo", externalAddress: { ...ENDERECO, cep: "123" } })).status).toBe(400);
    const ok = await post({ ...semLocal, name: "Assistente externo", categoryId: CAT.fisio, modality: "externo", externalAddress: ENDERECO });
    expect(ok.status).toBe(201);
    expect(ok.body.externalAddressStatus).toBe("confirmado");
    expect(ok.body.externalAddress).toMatchObject({ cep: "01001-000", uf: "SP", numero: "100", complemento: "Sala 2" });
    expect(ok.body.externalAddressText).toContain("Praça da Sé, 100");
    expect(ok.body.externalAddressText).toContain("CEP 01001-000");
    expect(ok.body.mapsUrl).toContain("google.com/maps");
    expect(ok.body.wazeUrl).toContain("waze.com");
    expect(ok.body).not.toHaveProperty("externalCep");
    // Endereço em agenda que não é externa: recusado.
    expect((await post({ ...semLocal, categoryId: CAT.fisio, modality: "local", externalAddress: ENDERECO })).status).toBe(400);
  });

  it("troca de modalidade: virar EXTERNO exige endereço; trocar o endereço da externa funciona; endereço em Sede é recusado", async () => {
    const a = (await post({ ...semLocal, name: "Troca", categoryId: CAT.fisio })).body;
    expect((await put(a.id, { modality: "externo" })).status).toBe(400);
    expect((await put(a.id, { externalAddress: ENDERECO })).status).toBe(400);
    const virou = await put(a.id, { modality: "externo", externalAddress: ENDERECO });
    expect(virou.status).toBe(200);
    const novo = await put(a.id, { externalAddress: { ...ENDERECO, numero: "200", complemento: null } });
    expect(novo.status).toBe(200);
    expect(novo.body.externalAddressText).toContain("Praça da Sé, 200");
    expect(novo.body.externalAddressText).not.toContain("Sala 2");
  });

  it("Remoto e Sede sem local; o legado com local mantém as regras de papel; agenda de outra clínica não é alterada", async () => {
    expect((await post({ ...semLocal, categoryId: CAT.fisio, modality: "online" })).status).toBe(201);
    await q("INSERT INTO agenda_resources(name,kind,modality,category_id,empresa_id) VALUES ('Agenda outra clinica','categoria','local',20,6)");
    const outra = (await q("SELECT id FROM agenda_resources WHERE name='Agenda outra clinica'")).rows[0].id;
    expect((await put(outra, { name: "invasao" })).status).toBe(403);
    expect((await q("SELECT name FROM agenda_resources WHERE id=$1", [outra])).rows[0].name).toBe("Agenda outra clinica");
    const lista = (await request(app).get("/agenda/resources").set("x-test-role", "admin")).body;
    expect(lista.some((r: any) => r.id === outra)).toBe(false);
    // Não pode desligar uma agenda existente do seu local.
    const comLocal = (await post({ ...base, name: "Com local", categoryId: CAT.fisio })).body;
    expect((await put(comLocal.id, { locationId: null })).status).toBe(409);
    // Sem permissão administrativa: recusado também para agenda sem local.
    expect((await post({ ...semLocal, categoryId: CAT.fisio }, "comum")).status).toBe(403);
  });
});
