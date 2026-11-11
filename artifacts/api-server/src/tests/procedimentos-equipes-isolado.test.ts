import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { chromium } from "@playwright/test";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ pool: null as any, db: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { ...schema, get pool() { return state.pool; }, get db() { return state.db; } };
});
import { PROCEDIMENTOS_SCHEMA_SQL } from "../lib/procedimentos-schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import router from "../routes/procedimentos";

const app = express().use(express.json(), tenantContextMiddleware, router);
let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const token = (professionalId: number, role = "admin") => createCollaboratorToken({ professionalId, role });
const post = (body: object, professionalId = 1) => request(app).post("/procedimentos")
  .set("Authorization", `Bearer ${token(professionalId, professionalId === 3 ? "executor" : "admin")}`).send(body);
const get = (path: string, professionalId = 1) => request(app).get(path).set("Authorization", `Bearer ${token(professionalId)}`);
const medicos = { areaId: 10, localId: 101, professionalIds: [11, 12] };
const enfermagem = { areaId: 20, localId: 101, professionalIds: [13] };
const biomedico = { areaId: 30, localId: 101, professionalIds: [14] };
const consulta = { nome: "Consulta sintética", descricao: null, dose: null, duracaoMinutos: 60, ativo: true, produtoIds: [], profissionaisNecessarios: [medicos] };

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.pool = isolated.pool;
  const schema = await import("@workspace/db/schema");
  state.db = drizzle(state.pool, { schema });
  await state.pool.query(`
    CREATE TABLE empresas (id integer primary key, nome text, nome_fantasia text, ativa boolean, status text);
    INSERT INTO empresas VALUES (1,'Clínica A',null,true,'ATIVO'),(2,'Clínica B',null,true,'ATIVO');
    CREATE TABLE professional_areas (id integer primary key, name text, slug text, active boolean);
    INSERT INTO professional_areas VALUES (10,'Medicina','medicina',true),(20,'Enfermagem','enfermagem',true),
      (30,'Biomedicina','biomedicina',true),(40,'Área inativa','inativa',false);
    CREATE TABLE professionals (id integer primary key, role text, category text, active boolean,
      credential_version integer, empresa_id integer, is_platform_owner boolean, name text, area_id integer);
    INSERT INTO professionals VALUES
      (1,'admin','medico',true,0,1,true,'Dona A',10),(2,'admin','medico',true,0,2,true,'Dono B',10),
      (3,'executor','medico',true,0,1,false,'Profissional sem gestão',10),
      (11,'executor','medico',true,0,1,false,'Médico A',10),(12,'executor','medico',true,0,1,false,'Médico B',10),
      (13,'executor','enfermagem',true,0,1,false,'Enfermagem A',20),(14,'executor','outro',true,0,1,false,'Biomédico A',30),
      (15,'executor','enfermagem',true,0,2,false,'Enfermagem B',20);
    CREATE TABLE locations (id integer primary key, empresa_id integer, active text, name text);
    INSERT INTO locations VALUES (101,1,'true','Local A'),(102,2,'true','Local B');
    CREATE TABLE agenda_calendars (id integer primary key, name text, active boolean, location_id integer);
    INSERT INTO agenda_calendars VALUES (500,'Agenda vinculada A',true,101),(501,'Agenda B',true,102);
    CREATE TABLE location_professionals (id serial primary key, professional_id integer, location_id integer, agenda_calendar_id integer);
    INSERT INTO location_professionals(professional_id,location_id,agenda_calendar_id)
      VALUES (11,101,500),(12,101,null),(13,101,null),(14,101,null),(15,102,501);
    CREATE TABLE agenda_resources (id integer primary key, name text, active boolean, location_id integer, professional_id integer);
    INSERT INTO agenda_resources VALUES (600,'Agenda interna A',true,101,11),(601,'Agenda interna B',true,102,15);
    CREATE TABLE professional_empresas (id integer primary key, professional_id integer, empresa_id integer);
    CREATE TABLE substances (id integer primary key, name text, procedure_type text, doctor_participation boolean);
    INSERT INTO substances VALUES (100,'Implante sintético','implant',true),(101,'Produto sintético','im',false),
      (102,'Produto sintético','im',false),(103,'Produto composto','im',false);
  `);
  await state.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
  await state.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
}, 60_000);
afterAll(async () => { if (isolated) await isolated.stop(); }, 60_000);

describe("profissionais necessários — rotas e banco isolados", () => {
  it("rejeita sessão ausente, inválida e profissional não autorizado a alterar", async () => {
    expect((await request(app).get("/procedimentos/opcoes-profissionais")).status).toBe(401);
    expect((await request(app).post("/procedimentos").send(consulta)).status).toBe(401);
    expect((await request(app).get("/procedimentos").set("Authorization", "Bearer inválido")).status).toBe(401);
    expect((await post(consulta, 3)).status).toBe(403);
  });
  it("mostra somente vínculos da clínica e agendas realmente vinculadas", async () => {
    const a = await get("/procedimentos/opcoes-profissionais");
    const b = await get("/procedimentos/opcoes-profissionais", 2);
    expect(a.status).toBe(200);
    expect(a.body.locais.map((l: any) => l.id)).toEqual([101]);
    expect(a.body.profissionais.find((p: any) => p.id === 11).agendas).toEqual([
      { nome: "Agenda interna A", origem: "Sistema" }, { nome: "Agenda vinculada A", origem: "Google" },
    ]);
    expect(a.body.profissionais.find((p: any) => p.id === 12).agendas).toEqual([]);
    expect(a.body.profissionais.some((p: any) => p.id === 15)).toBe(false);
    expect(b.body.profissionais.map((p: any) => p.id)).toEqual([15]);
  });
  it("salva consulta sem produto e dois médicos alternativos, relendo os dados", async () => {
    const r = await post(consulta);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ...consulta, tipo: null, empresaId: 1 });
    expect((await get("/procedimentos")).body.procedimentos).toContainEqual(r.body);
    expect((await get("/procedimentos", 2)).body.procedimentos).toEqual([]);
  });
  it("exige medicina e enfermagem para implante e preserva a duração 2,5 minutos", async () => {
    const body = { ...consulta, nome: "Implante", duracaoMinutos: 2.5, produtoIds: [100], profissionaisNecessarios: [medicos, enfermagem] };
    const fail = await post({ ...body, profissionaisNecessarios: [medicos] });
    expect(fail.status).toBe(400);
    const ok = await post(body);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject(body);
    expect((await state.pool.query("SELECT duracao_segundos FROM procedimentos_clinicos WHERE id=$1", [ok.body.id])).rows[0].duracao_segundos).toBe(150);
  });
  it("permite biomédico e não exige produto nem inventa dose", async () => {
    const r = await post({ ...consulta, nome: "Ozonioterapia", profissionaisNecessarios: [biomedico] });
    expect(r.status).toBe(201);
    expect(r.body.dose).toBeNull();
  });
  it("permite procedimento que exige somente médico", async () => {
    const r = await post({ ...consulta, nome: "Botox sintético", profissionaisNecessarios: [medicos] });
    expect(r.status).toBe(201);
    expect(r.body.profissionaisNecessarios).toEqual([medicos]);
  });
  it("recusa vínculo entre clínicas, área errada e quantidade ambígua de recursos", async () => {
    for (const grupos of [
      [{ areaId: 20, localId: 102, professionalIds: [15] }],
      [{ areaId: 20, localId: 101, professionalIds: [11] }],
      [{ ...medicos, professionalIds: [11, 11] }],
      [medicos, medicos],
    ]) expect((await post({ ...consulta, profissionaisNecessarios: grupos })).status).toBe(400);
  });
  it("preserva a identidade de homônimos e de produto composto sem alterar catálogo", async () => {
    const before = (await state.pool.query("SELECT * FROM substances ORDER BY id")).rows;
    const r = await post({ ...consulta, nome: "Produto escolhido", dose: "100 mg", duracaoMinutos: 2.5, produtoIds: [102, 103] });
    expect(r.status).toBe(201);
    expect(r.body.produtoIds).toEqual([102, 103]);
    expect((await state.pool.query("SELECT * FROM substances ORDER BY id")).rows).toEqual(before);
    expect((await post({ ...consulta, produtoIds: [101], dose: "100 mg / 2 mL" })).status).toBe(400);
    expect((await post({ ...consulta, produtoIds: [101], dose: "100 mg 2mL" })).status).toBe(400);
  });
  it("guarda versão anterior dos requisitos ao editar, sem editar outra clínica", async () => {
    const created = await post(consulta);
    const id = created.body.id;
    const changed = { ...consulta, profissionaisNecessarios: [biomedico] };
    const r = await request(app).put(`/procedimentos/${id}`).set("Authorization", `Bearer ${token(1)}`).send(changed);
    expect(r.status).toBe(200);
    expect(r.body.profissionaisNecessarios).toEqual([biomedico]);
    const history = await state.pool.query("SELECT conteudo_anterior FROM procedimento_revisoes WHERE procedimento_id=$1", [id]);
    expect(history.rows[0].conteudo_anterior.profissionaisNecessarios).toEqual([medicos]);
    expect((await request(app).put(`/procedimentos/${id}`).set("Authorization", `Bearer ${token(2)}`).send(changed)).status).toBe(404);
  });
  it("cria pela interface em navegador com sessão e banco isolados", async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1134, height: 720 } });
      await page.addInitScript(({ credential }) => {
        localStorage.setItem("padcom_collab_token", credential);
        localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Profissional sintético", role: "admin" }));
      }, { credential: token(1) });
      await page.route("**/api/**", async route => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
        if (path === "/api/collaborator/me") return json({ professional: { id: 1, name: "Profissional sintético", role: "admin", isPlatformOwner: true } });
        if (path === "/api/substances") return json([
          { id: 101, name: "Produto sintético - 100 MG / 2 ML", defaultDose: "100 MG / 2 ML", durationMinutes: 2.5 },
          { id: 102, name: "Produto sintético - 200 MG / 2 ML", defaultDose: "200 MG / 2 ML", durationMinutes: 2.5 },
        ]);
        if (path.startsWith("/api/procedimentos")) {
          const url = path.replace("/api", "");
          const authorization = req.headers().authorization ?? "";
          const result = req.method() === "GET"
            ? await request(app).get(url).set("Authorization", authorization)
            : await request(app).post(url).set("Authorization", authorization).send(req.postDataJSON());
          return json(result.body, result.status);
        }
        return json([]);
      });
      await page.goto("http://localhost:80/procedimentos");
      await page.getByTestId("button-new-procedimento").click();
      await page.getByTestId("checkbox-substancia-101").click();
      expect(await page.getByTestId("input-procedimento-nome").inputValue()).toBe("Produto sintético");
      expect(await page.getByTestId("input-procedimento-duracao").inputValue()).toBe("2,5");
      expect(await page.getByTestId("input-procedimento-dose").inputValue()).toBe("");
      await page.getByTestId("input-procedimento-dose").fill("100 mg");
      await page.getByRole("button", { name: "Adicionar categoria necessária" }).click();
      await page.getByLabel("Local da clínica").selectOption("101");
      await page.getByLabel("Categoria profissional").selectOption("10");
      await page.getByLabel("Selecionar Médico A").click();
      await page.getByLabel("Selecionar Médico B").click();
      await page.getByTestId("button-save-procedimento").click();
      await page.getByText("Confirme a dose prescrita antes de salvar.").waitFor();
      await page.getByLabel("Conferi que esta é a dose prescrita.").click();
      await page.getByTestId("button-save-procedimento").click();
      await page.getByText("Procedimento cadastrado.").waitFor();
      const stored = await state.pool.query("SELECT dose,duracao_segundos FROM procedimentos_clinicos WHERE empresa_id=1 AND nome='Produto sintético'");
      expect(stored.rows).toEqual([{ dose: "100 mg", duracao_segundos: 150 }]);
    } finally { await browser.close(); }
  }, 60_000);
});
