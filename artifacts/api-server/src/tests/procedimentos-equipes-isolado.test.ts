import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
import substancesRouter from "../routes/substances";

const app = express().use(express.json(), tenantContextMiddleware, router, substancesRouter);
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
      credential_version integer, empresa_id integer, is_platform_owner boolean, name text, area_id integer,
      professional_type text NOT NULL DEFAULT 'medico');
    INSERT INTO professionals(id,role,category,active,credential_version,empresa_id,is_platform_owner,name,area_id) VALUES
      (1,'admin','medico',true,0,1,true,'Dona A',10),(2,'admin','medico',true,0,2,true,'Dono B',10),
      (3,'executor','medico',true,0,1,false,'Profissional sem gestão',10),
      (11,'executor','medico',true,0,1,false,'Médico A',10),(12,'executor','medico',true,0,1,false,'Médico B',10),
      (13,'executor','enfermagem',true,0,1,false,'Enfermagem A',20),(14,'executor','outro',true,0,1,false,'Biomédico A',30),
      (15,'executor','enfermagem',true,0,2,false,'Enfermagem B',20);
    INSERT INTO professionals VALUES (16,'admin','outro',true,0,1,true,'Gestor sintético',30,'nao_medico');
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
    CREATE TABLE substances (id integer primary key, name text, procedure_type text, doctor_participation boolean,
      default_dose text, duration_minutes integer, precise_duration_seconds integer, is_blend boolean NOT NULL DEFAULT false,
      concentration_mg text, volume_ampola text, presentation_quantity real, presentation_unit text, ampoule_volume_ml real);
    INSERT INTO substances(id,name,procedure_type,doctor_participation) VALUES
      (100,'Implante sintético','implant',true),(101,'Produto sintético','im',false),
      (102,'Produto sintético','im',false),(103,'Produto composto','im',false);
    UPDATE substances SET precise_duration_seconds=150 WHERE id IN (101,102);
    INSERT INTO substances(id,name,procedure_type,doctor_participation,default_dose,duration_minutes,precise_duration_seconds) VALUES
      (104,'Produto vinculado','im',false,'100 mg',2,150),(105,'Produto vinculado','im',false,'200 mg',2,150),
      (106,'ADEK (VITAMINAS A, D, E, K)','im',false,'mistura / 2 mL',2,150);
    CREATE TABLE substance_blend_components (id serial primary key, substance_id integer, sort_order integer,
      component_name text, dose_value real, dose_unit text, component_substance_id integer,
      quantity real, quantity_unit text, notes text, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO substance_blend_components(substance_id,sort_order,component_name,dose_value,dose_unit) VALUES
      (106,1,'Vitamina A',25000,'UI'),(106,2,'Vitamina D3',100000,'UI'),
      (106,3,'Vitamina E',200,'UI'),(106,4,'Vitamina K2',1300,'mcg');
  `);
  await state.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
  await state.pool.query("ALTER TABLE procedimentos_clinicos ADD COLUMN fontes_campos JSONB NOT NULL DEFAULT '{}'::jsonb");
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
  it("preserva três categorias conjuntas e médicos alternativos na mesma clínica", async () => {
    const r = await post({ ...consulta, nome: "Procedimento com três categorias",
      profissionaisNecessarios: [medicos, enfermagem, biomedico] });
    expect(r.status).toBe(201);
    const groups = r.body.profissionaisNecessarios;
    expect(groups).toEqual([medicos, enfermagem, biomedico]);
    const persisted = (await get("/procedimentos")).body.procedimentos.find((p: { id: number }) => p.id === r.body.id);
    expect(persisted.profissionaisNecessarios).toEqual(groups);
    expect((await get("/procedimentos", 2)).body.procedimentos.some((p: { id: number }) => p.id === r.body.id)).toBe(false);
  });
  it.skip("aguarda proteção completa antes de atualizar campos vinculados", async () => {
    const entrada = { ...consulta, nome: "Produto vinculado", dose: "100 mg", duracaoMinutos: 2.5,
      produtoIds: [104], profissionaisNecessarios: [enfermagem],
      fontesCampos: { nome: 104, dose: 104, duracaoMinutos: 104 }, confirmarDoseAtual: true };
    const criado = await post(entrada);
    expect(criado.status).toBe(201);
    expect((await post({ ...entrada, confirmarDoseAtual: false })).status).toBe(409);
    expect((await post(entrada, 16)).status).toBe(403);
    await state.pool.query("UPDATE substances SET default_dose='300 mg' WHERE id=105");
    expect((await get("/procedimentos")).body.procedimentos.find((p: { id: number }) => p.id === criado.body.id).dose).toBe("100 mg");
    const manual = await post({ ...consulta, nome: "Nome manual", dose: "80 mg", produtoIds: [104], confirmarDoseAtual: true });
    expect(manual.status).toBe(201);
    await state.pool.query("UPDATE substances SET name=$1,default_dose=$2,precise_duration_seconds=$3 WHERE id=104",
      ["Produto novo", "150 mg", 300]);
    const lista = (await get("/procedimentos")).body.procedimentos;
    const atualizado = lista.find((p: { id: number }) => p.id === criado.body.id);
    expect(atualizado).toMatchObject({ nome: "Produto novo", dose: "150 mg", duracaoMinutos: 5, dosePendenteRevisao: true });
    expect(lista.find((p: { id: number }) => p.id === manual.body.id)).toMatchObject({ nome: "Nome manual", dose: "80 mg", duracaoMinutos: 60 });
    const tentar = { ...entrada, nome: "Produto novo", dose: "150 mg", duracaoMinutos: 5, confirmarDoseAtual: false };
    expect((await request(app).put(`/procedimentos/${criado.body.id}`).set("Authorization", `Bearer ${token(1)}`).send(entrada)).status).toBe(409);
    expect((await request(app).put(`/procedimentos/${criado.body.id}`).set("Authorization", `Bearer ${token(1)}`).send(tentar)).status).toBe(409);
    const confirmado = await request(app).put(`/procedimentos/${criado.body.id}`).set("Authorization", `Bearer ${token(1)}`).send({ ...tentar, confirmarDoseAtual: true });
    expect(confirmado.status).toBe(200);
    expect(confirmado.body.dosePendenteRevisao).toBe(false);
    const manualDuration = { ...tentar, duracaoMinutos: 7.5, fontesCampos: { nome: 104, dose: 104 } };
    expect((await request(app).put(`/procedimentos/${criado.body.id}`).set("Authorization", `Bearer ${token(1)}`).send(manualDuration)).status).toBe(200);
    await state.pool.query("UPDATE substances SET precise_duration_seconds=600,default_dose='150 mg / 2 mL' WHERE id=104");
    const final = (await get("/procedimentos")).body.procedimentos.find((p: { id: number }) => p.id === criado.body.id);
    expect(final.duracaoMinutos).toBe(7.5);
    expect(final.dose).toBeNull();
    expect(final.dosePendenteRevisao).toBe(true);
    expect(final.camposOrigemIndisponivel).toContain("dose");
    expect((await get("/procedimentos", 2)).body.procedimentos.some((p: { id: number }) => p.id === criado.body.id)).toBe(false);
  });
  it.skip("aguarda proteção completa antes de sincronizar componentes de produto composto", async () => {
    const dose = "25.000 UI + 100.000 UI + 200 UI + 1.300 mcg";
    const entrada = { ...consulta, nome: "ADEK (VITAMINAS A, D, E, K)", dose, duracaoMinutos: 2.5,
      produtoIds: [106], profissionaisNecessarios: [enfermagem],
      fontesCampos: { nome: 106, dose: 106, duracaoMinutos: 106 }, confirmarDoseAtual: true };
    const criado = await post(entrada);
    expect(criado.status).toBe(201);
    await state.pool.query("UPDATE substance_blend_components SET dose_value=1500 WHERE substance_id=106 AND sort_order=4");
    const encontrado = (await get("/procedimentos")).body.procedimentos.find((p: { id: number }) => p.id === criado.body.id);
    expect(encontrado.produtoIds).toEqual([106]);
    expect(encontrado.dose).toBe("25.000 UI + 100.000 UI + 200 UI + 1.500 mcg");
    expect(encontrado.dosePendenteRevisao).toBe(true);
    expect(encontrado.dose).not.toMatch(/ml|ampola/i);
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
  it("permite duas necessidades da mesma categoria quando existem duas pessoas distintas", async () => {
    const grupos = [medicos, { areaId: 10, localId: 101, professionalIds: [11] }];
    const resposta = await post({ ...consulta, nome: "Dois profissionais sintéticos", profissionaisNecessarios: grupos });
    expect(resposta.status).toBe(201);
    expect(resposta.body.profissionaisNecessarios).toEqual(grupos);
    const salvo = (await get("/procedimentos")).body.procedimentos.find((p: { id: number }) => p.id === resposta.body.id);
    expect(salvo.profissionaisNecessarios).toEqual(grupos);
  });
  it("rejeita quarta necessidade e impossibilidade de pessoas distintas", async () => {
    const quatro = [medicos, enfermagem, biomedico, { areaId: 10, localId: 101, professionalIds: [11] }];
    expect((await post({ ...consulta, profissionaisNecessarios: quatro })).status).toBe(400);
    const soUm = { areaId: 10, localId: 101, professionalIds: [11] };
    expect((await post({ ...consulta, profissionaisNecessarios: [soUm, soUm] })).status).toBe(400);
  });
  it("recusa vínculo entre clínicas, área errada e quantidade ambígua de recursos", async () => {
    for (const grupos of [
      [{ areaId: 20, localId: 102, professionalIds: [15] }],
      [{ areaId: 20, localId: 101, professionalIds: [11] }],
      [{ ...medicos, professionalIds: [11, 11] }],
      [{ ...medicos, professionalIds: [11] }, { ...medicos, professionalIds: [11] }],
    ]) expect((await post({ ...consulta, profissionaisNecessarios: grupos })).status).toBe(400);
  });
  it("preserva a identidade de homônimos e de produto composto sem alterar catálogo", async () => {
    const before = (await state.pool.query("SELECT * FROM substances ORDER BY id")).rows;
    const r = await post({ ...consulta, nome: "Produto escolhido", dose: "100 mg", duracaoMinutos: 2.5, produtoIds: [102, 103], confirmarDoseAtual: true });
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
      page.setDefaultTimeout(10_000);
      let nomeProduto = "Produto sintético - 100 MG / 2 ML";
      let duracaoProduto = 2.5;
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
          { id: 101, name: nomeProduto, defaultDose: "100 MG / 2 ML", durationMinutes: duracaoProduto },
          { id: 102, name: "Produto sintético - 200 MG / 2 ML", defaultDose: "200 MG / 2 ML", durationMinutes: 2.5 },
          { id: 107, name: "Produto verificado - 10 MG / 2 ML", defaultDose: "10 MG / 2 ML", durationMinutes: 2.5,
            presentationQuantity: 1, presentationUnit: "ampola", ampouleVolumeMl: 2,
            concentrationMg: "5 mg/mL", viaUso: "IM" },
          { id: 106, name: "ADEK (VITAMINAS A, D, E, K)", defaultDose: "A 25.000 UI + D3 100.000 UI + E 200 UI + K2 1.300 MCG / 2 ML", durationMinutes: 2.5,
            isBlend: true, presentationQuantity: 1, presentationUnit: "ampola", ampouleVolumeMl: 2, components: [
            { id: 1, componentName: "Vitamina A", doseValue: 25000, doseUnit: "UI" },
            { id: 2, componentName: "Vitamina D3", doseValue: 100000, doseUnit: "UI" },
            { id: 3, componentName: "Vitamina E", doseValue: 200, doseUnit: "UI" },
            { id: 4, componentName: "Vitamina K2", doseValue: 1300, doseUnit: "mcg" },
          ] },
        ]);
        if (path.startsWith("/api/procedimentos")) {
          const url = path.replace("/api", "");
          const authorization = req.headers().authorization ?? "";
          const result = req.method() === "GET"
            ? await request(app).get(url).set("Authorization", authorization)
            : req.method() === "PUT"
              ? await request(app).put(url).set("Authorization", authorization).send(req.postDataJSON())
              : await request(app).post(url).set("Authorization", authorization).send(req.postDataJSON());
          return json(result.body, result.status);
        }
        return json([]);
      });
      await page.goto("http://localhost:80/procedimentos");
      await page.getByTestId("button-new-procedimento").click();
      const itemVerificado = page.getByTestId("row-substancia-107");
      expect(await itemVerificado.getByText("10 MG", { exact: false }).count()).toBeGreaterThan(0);
      expect(await itemVerificado.getByText("5 mg/mL", { exact: false }).count()).toBeGreaterThan(0);
      expect(await itemVerificado.getByText("intramuscular", { exact: false }).count()).toBeGreaterThan(0);
      await itemVerificado.getByTestId("checkbox-substancia-107").click();
      expect(await page.getByTestId("input-procedimento-dose").inputValue()).toBe("10 MG");
      await itemVerificado.getByTestId("checkbox-substancia-107").click();
      await page.getByTestId("checkbox-substancia-106").click();
      expect(await page.getByTestId("input-procedimento-dose").inputValue()).toBe("25.000 UI + 100.000 UI + 200 UI + 1.300 mcg");
      const componentes = page.getByTestId("componentes-dose-padrao");
      for (const texto of ["Vitamina A: 25.000 UI", "Vitamina D3: 100.000 UI", "Vitamina E: 200 UI", "Vitamina K2: 1.300 mcg"]) {
        expect(await componentes.getByText(texto).count()).toBe(1);
      }
      await page.getByTestId("checkbox-substancia-106").click();
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
      await page.getByRole("button", { name: "Adicionar categoria necessária" }).click();
      await page.getByLabel("Local da clínica").nth(1).selectOption("101");
      await page.getByLabel("Categoria profissional").nth(1).selectOption("20");
      await page.getByLabel("Selecionar Enfermagem A").click();
      await page.getByRole("button", { name: "Adicionar categoria necessária" }).click();
      await page.getByLabel("Local da clínica").nth(2).selectOption("101");
      await page.getByLabel("Categoria profissional").nth(2).selectOption("30");
      await page.getByLabel("Selecionar Biomédico A").click();
      expect(await page.getByRole("button", { name: /^Consulta$/ }).count()).toBe(0);
      await page.getByTestId("button-save-procedimento").click();
      await page.getByText("Confirme a dose padrão antes de salvar.").waitFor();
      await page.getByLabel("Conferi que esta é a dose padrão.").click();
      await page.getByTestId("button-save-procedimento").click();
      await page.getByText("Procedimento cadastrado.").waitFor();
      const stored = await state.pool.query("SELECT dose,duracao_segundos FROM procedimentos_clinicos WHERE empresa_id=1 AND nome='Produto sintético'");
      expect(stored.rows).toEqual([{ dose: "100 mg", duracao_segundos: 150 }]);
      const groups = await state.pool.query(`SELECT area_id FROM procedimento_equipes
        WHERE ativo AND procedimento_id=(SELECT id FROM procedimentos_clinicos WHERE empresa_id=1 AND nome='Produto sintético')
        ORDER BY area_id`);
      expect(groups.rows.map((row: { area_id: number }) => row.area_id)).toEqual([10, 20, 30]);
    } finally { await browser.close(); }
  }, 120_000);
  it("mantém a atualização automática bloqueada enquanto falta revisão", async () => {
    const lista = await get("/procedimentos");
    expect(lista.body.vinculosCamposHabilitados).toBe(false);
    const resposta = await post({ ...consulta, nome: "Produto vinculado", dose: "100 mg", duracaoMinutos: 2.5,
      produtoIds: [104], profissionaisNecessarios: [enfermagem],
      fontesCampos: { nome: 104, dose: 104, duracaoMinutos: 104 }, confirmarDoseAtual: true });
    expect(resposta.status).toBe(503);
    expect(resposta.body.error).toContain("revisão de segurança");
  });
  it("não altera nem apresenta como conferida uma origem vinculada já existente", async () => {
    const criado = await post({ ...consulta, nome: "Origem protegida", dose: "100 mg", produtoIds: [105],
      confirmarDoseAtual: true, profissionaisNecessarios: [enfermagem] });
    expect(criado.status).toBe(201);
    await state.pool.query("UPDATE procedimentos_clinicos SET fontes_campos=$1::jsonb WHERE id=$2",
      [JSON.stringify({ nome: 105, dose: 105, duracaoMinutos: 105 }), criado.body.id]);
    await state.pool.query("UPDATE substances SET name='Valor novo',default_dose='300 mg',precise_duration_seconds=180 WHERE id=105");
    const linha = (await get("/procedimentos")).body.procedimentos.find((p: { id: number }) => p.id === criado.body.id);
    expect(linha).toMatchObject({ nome: "Origem protegida", dose: "100 mg", duracaoMinutos: 60, dosePendenteRevisao: true });
    const url = `/procedimentos/${criado.body.id}`;
    const body = { ...consulta, nome: "Origem protegida", dose: "100 mg", produtoIds: [105], profissionaisNecessarios: [enfermagem] };
    expect((await request(app).put(url).set("Authorization", `Bearer ${token(1)}`).send(body)).status).toBe(503);
    expect((await request(app).put(url).set("Authorization", `Bearer ${token(1)}`).send({ ...body, fontesCampos: {} })).status).toBe(503);
    const armazenado = await state.pool.query("SELECT nome,dose,fontes_campos FROM procedimentos_clinicos WHERE id=$1", [criado.body.id]);
    expect(armazenado.rows[0]).toMatchObject({ nome: "Origem protegida", dose: "100 mg", fontes_campos: { dose: 105 } });
  });
  it("serializa duas substituições concorrentes reais de um produto composto", async () => {
    const lock = await state.pool.connect();
    try {
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM substances WHERE id=106 FOR UPDATE");
      const atualizar = (prefixo: string) => request(app).put("/substances/106/components")
        .set("Authorization", `Bearer ${token(1)}`)
        .send({ isBlend: true, components: [{ componentName: `${prefixo}1` }, { componentName: `${prefixo}2` }] })
        .then((res) => res);
      const primeira = atualizar("A");
      const segunda = atualizar("B");
      const prazo = Date.now() + 7000;
      let esperando = 0;
      do {
        const resultado = await state.pool.query(`SELECT count(*)::int AS total FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%from "substances"%' AND query ILIKE '%for update%'`);
        esperando = resultado.rows[0].total;
        if (esperando < 2) await new Promise((resolve) => setTimeout(resolve, 30));
      } while (esperando < 2 && Date.now() < prazo);
      expect(esperando).toBe(2);
      await lock.query("COMMIT");
      const resultados = await Promise.all([primeira, segunda]);
      expect(resultados.map((r) => r.status)).toEqual([200, 200]);
      const componentes = await state.pool.query("SELECT component_name FROM substance_blend_components WHERE substance_id=106 ORDER BY sort_order");
      const nomes = componentes.rows.map((row: { component_name: string }) => row.component_name);
      expect([["A1", "A2"], ["B1", "B2"]]).toContainEqual(nomes);
    } finally {
      await lock.query("ROLLBACK").catch(() => undefined);
      lock.release();
    }
  }, 20000);
  it("registra na revisão as mudanças A → B → A pela rota real de componentes", async () => {
    const sql = await readFile(new URL("../../../../lib/db/migrations/20261111-revisao-dose-substancia.sql", import.meta.url), "utf8");
    await state.pool.query(sql);
    const editar = (dose: number) => request(app).put("/substances/103/components")
      .set("Authorization", `Bearer ${token(1)}`)
      .send({ isBlend: true, components: [
        { componentName: "Vitamina A", doseValue: dose, doseUnit: "UI" },
        { componentName: "Vitamina D", doseValue: 100, doseUnit: "UI" },
      ] });
    expect((await editar(10)).status).toBe(200);
    const depoisA = (await state.pool.query("SELECT revisao_dose FROM substances WHERE id=103")).rows[0].revisao_dose;
    expect((await editar(20)).status).toBe(200);
    expect((await editar(10)).status).toBe(200);
    const depoisABA = (await state.pool.query("SELECT revisao_dose FROM substances WHERE id=103")).rows[0].revisao_dose;
    expect(BigInt(depoisABA)).toBeGreaterThan(BigInt(depoisA));
    const componentes = await state.pool.query("SELECT component_name,dose_value,dose_unit FROM substance_blend_components WHERE substance_id=103 ORDER BY sort_order");
    expect(componentes.rows).toEqual([
      { component_name: "Vitamina A", dose_value: 10, dose_unit: "UI" },
      { component_name: "Vitamina D", dose_value: 100, dose_unit: "UI" },
    ]);
  });
  it("preserva revisão e identificadores ao salvar composição idêntica", async () => {
    const atual = await state.pool.query(`SELECT id,component_name,dose_value,dose_unit FROM substance_blend_components
      WHERE substance_id=103 ORDER BY sort_order,id`);
    const antes = (await state.pool.query("SELECT revisao_dose FROM substances WHERE id=103")).rows[0].revisao_dose;
    const componentes = atual.rows.map((c: any) => ({ componentName: c.component_name, doseValue: c.dose_value, doseUnit: c.dose_unit }));
    const resposta = await request(app).put("/substances/103/components")
      .set("Authorization", `Bearer ${token(1)}`).send({ isBlend: true, components: componentes });
    expect(resposta.status).toBe(200);
    const depois = await state.pool.query(`SELECT id,component_name,dose_value,dose_unit FROM substance_blend_components
      WHERE substance_id=103 ORDER BY sort_order,id`);
    expect(depois.rows).toEqual(atual.rows);
    expect((await state.pool.query("SELECT revisao_dose FROM substances WHERE id=103")).rows[0].revisao_dose).toBe(antes);
  });
  it("mantém componentes completos e arredondamento real idêntico", async () => {
    await state.pool.query("INSERT INTO substances(id,name,procedure_type,doctor_participation) VALUES (107,'Produto sintético decimal','im',false)");
    const componente = { componentSubstanceId: 101, componentName: "Componente completo",
      doseValue: 0.1, doseUnit: "mg", quantity: 0.3, quantityUnit: "unidade", notes: "Observação preservada" };
    const editar = (body: object) => request(app).put("/substances/107/components")
      .set("Authorization", `Bearer ${token(1)}`).send({ isBlend: true, components: [body] });
    expect((await editar(componente)).status).toBe(200);
    const antes = await state.pool.query("SELECT * FROM substance_blend_components WHERE substance_id=107");
    const versao = (await state.pool.query("SELECT revisao_dose FROM substances WHERE id=107")).rows[0].revisao_dose;
    expect((await editar({ ...componente, quantity: 0.3000000001 })).status).toBe(200);
    const depois = await state.pool.query("SELECT * FROM substance_blend_components WHERE substance_id=107");
    expect(depois.rows).toEqual(antes.rows);
    expect((await state.pool.query("SELECT revisao_dose FROM substances WHERE id=107")).rows[0].revisao_dose).toBe(versao);
    expect((await editar({ ...componente, notes: "Observação alterada" })).status).toBe(200);
    expect(BigInt((await state.pool.query("SELECT revisao_dose FROM substances WHERE id=107")).rows[0].revisao_dose)).toBeGreaterThan(BigInt(versao));
  });
  it("registra mudanças na ordem, em anotações e no indicador de composto", async () => {
    const componentes = [
      { componentName: "Vitamina A", doseValue: 10, doseUnit: "UI", notes: "Conferir" },
      { componentName: "Vitamina D", doseValue: 100, doseUnit: "UI" },
    ];
    const editar = (isBlend: boolean, items: typeof componentes) => request(app).put("/substances/103/components")
      .set("Authorization", `Bearer ${token(1)}`).send({ isBlend, components: items });
    const revisao = async () => BigInt((await state.pool.query("SELECT revisao_dose FROM substances WHERE id=103")).rows[0].revisao_dose);
    const inicio = await revisao();
    expect((await editar(true, componentes)).status).toBe(200);
    const anotacao = await revisao();
    expect(anotacao).toBeGreaterThan(inicio);
    expect((await editar(true, [...componentes].reverse())).status).toBe(200);
    const ordem = await revisao();
    expect(ordem).toBeGreaterThan(anotacao);
    expect((await editar(false, [...componentes].reverse())).status).toBe(200);
    expect(await revisao()).toBeGreaterThan(ordem);
    expect((await editar(true, [
      { componentName: "Vitamina A", doseValue: 10, doseUnit: "UI" },
      { componentName: "Vitamina D", doseValue: 100, doseUnit: "UI" },
    ])).status).toBe(200);
  });
  it("desfaz integralmente a operação que perder disputa entre rota e escritor direto", async () => {
    const componente = (await state.pool.query("SELECT id FROM substance_blend_components WHERE substance_id=103 ORDER BY sort_order LIMIT 1")).rows[0].id;
    const antes = BigInt((await state.pool.query("SELECT revisao_dose FROM substances WHERE id=103")).rows[0].revisao_dose);
    const externo = await state.pool.connect();
    try {
      await externo.query("BEGIN");
      await externo.query("SELECT id FROM substance_blend_components WHERE id=$1 FOR UPDATE", [componente]);
      const rota = request(app).put("/substances/103/components")
        .set("Authorization", `Bearer ${token(1)}`)
        .send({ isBlend: true, components: [
          { componentName: "Rota A", doseValue: 1, doseUnit: "UI" },
          { componentName: "Rota B", doseValue: 2, doseUnit: "UI" },
        ] }).then((res) => res);
      const prazo = Date.now() + 5000;
      let aguardando = 0;
      do {
        const result = await state.pool.query(`SELECT count(*)::int AS total FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE 'delete%substance_blend_components%'`);
        aguardando = result.rows[0].total;
        if (!aguardando) await new Promise((resolve) => setTimeout(resolve, 25));
      } while (!aguardando && Date.now() < prazo);
      expect(aguardando).toBeGreaterThan(0);
      let externoErro: string | null = null;
      try {
        await externo.query("UPDATE substance_blend_components SET dose_value=99 WHERE id=$1", [componente]);
        await externo.query("COMMIT");
      } catch (error: any) {
        externoErro = error.code;
        await externo.query("ROLLBACK");
      }
      const resposta = await rota;
      const rows = (await state.pool.query("SELECT component_name,dose_value FROM substance_blend_components WHERE substance_id=103 ORDER BY sort_order")).rows;
      const depois = BigInt((await state.pool.query("SELECT revisao_dose FROM substances WHERE id=103")).rows[0].revisao_dose);
      if (externoErro === "40P01") {
        expect(resposta.status).toBe(200);
        expect(rows).toEqual([{ component_name: "Rota A", dose_value: 1 }, { component_name: "Rota B", dose_value: 2 }]);
        expect(depois).toBe(antes + 4n);
      } else {
        expect(externoErro).toBeNull();
        expect(resposta.status).toBe(409);
        expect(resposta.body.error).toContain("Recarregue");
        expect(rows).toEqual([{ component_name: "Vitamina A", dose_value: 99 }, { component_name: "Vitamina D", dose_value: 100 }]);
        expect(depois).toBe(antes + 1n);
      }
    } finally {
      await externo.query("ROLLBACK").catch(() => undefined);
      externo.release();
    }
  }, 20000);
  it("preserva listagem e gravação mesmo sem a nova coluna", async () => {
    await state.pool.query("ALTER TABLE procedimentos_clinicos DROP COLUMN fontes_campos");
    expect((await get("/procedimentos")).status).toBe(200);
    expect((await post({ ...consulta, nome: "Consulta sem coluna nova" })).status).toBe(201);
  });
});
