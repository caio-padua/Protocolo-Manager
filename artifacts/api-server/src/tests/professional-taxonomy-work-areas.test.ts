import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { chromium } from "@playwright/test";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { createTableFromSchema } from "./helpers/schema-ddl";

const state = vi.hoisted(() => ({ database: null as any, pool: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { ...schema, get db() { return state.database; }, get pool() { return state.pool; } };
});
vi.mock("../lib/objectStorage.js", () => ({ ObjectStorageService: class {} }));
import { empresasTable, locationsTable, locationProfessionalsTable, professionalsTable, professionalAreasTable, professionalSpecialtiesTable } from "@workspace/db/schema";
import { PROFESSIONAL_EMPRESAS_DDL } from "../lib/ensure-professional-empresas-schema";
import { PROFESSIONAL_WORK_AREAS_SCHEMA_SQL } from "../lib/professional-work-areas-schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import professionalsRouter from "../routes/professionals";
import procedimentosRouter from "../routes/procedimentos";

const app = express().use(express.json(), tenantContextMiddleware, professionalsRouter, procedimentosRouter);
app.use((error: any, _req: any, res: any, _next: any) => {
  console.error("Erro na aplicação de teste:", error);
  res.status(500).json({ error: "Erro interno no teste" });
});
let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const token = (id: number) => createCollaboratorToken({ professionalId: id, role: id === 3 ? "executor" : "admin" });
const auth = (r: ReturnType<ReturnType<typeof request>["get"]>, id = 1) => r.set("Authorization", `Bearer ${token(id)}`);
const get = (url: string, id = 1) => auth(request(app).get(url), id);
const post = (url: string, data: object, id = 1) => auth(request(app).post(url), id).send(data);

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.pool = isolated.pool;
  state.database = drizzle(state.pool);
  for (const table of [empresasTable, locationsTable, professionalsTable, locationProfessionalsTable, professionalAreasTable, professionalSpecialtiesTable]) {
    await state.pool.query(createTableFromSchema(table));
  }
  for (const statement of PROFESSIONAL_EMPRESAS_DDL) await state.pool.query(statement);
  await state.pool.query(PROFESSIONAL_WORK_AREAS_SCHEMA_SQL);
  await state.pool.query(PROFESSIONAL_WORK_AREAS_SCHEMA_SQL);
  await state.pool.query(`
    CREATE TABLE agenda_resources (id serial primary key, name text, active boolean, location_id integer, professional_id integer);
    CREATE TABLE agenda_calendars (id serial primary key, name text, active boolean, location_id integer);
    INSERT INTO empresas(id,nome,tipo,status,ativa) VALUES (1,'Clínica A','clinic','ATIVO',true),(2,'Clínica B','clinic','ATIVO',true);
    INSERT INTO locations(id,name,empresa_id,active) VALUES (101,'Local A',1,'true'),(102,'Local B',2,'true');
    INSERT INTO professionals(id,name,empresa_id,active,is_platform_owner,category,credential_version) VALUES
      (1,'Dono A',1,true,true,'administrativo',0),(2,'Dono B',2,true,true,'administrativo',0),
      (3,'Colaborador',1,true,false,'outro',0);
    INSERT INTO professional_areas(id,professional_type,name,slug) VALUES
      (10,'medico','Medicina','medicina'),(20,'nao_medico','Enfermagem','enfermagem');
    SELECT setval(pg_get_serial_sequence('professionals','id'),100);
    SELECT setval(pg_get_serial_sequence('professional_areas','id'),100);
  `);
}, 90_000);
afterAll(async () => { state.database = null; state.pool = null; if (isolated) await isolated.stop(); }, 60_000);

describe("categorias e áreas de atuação", () => {
  it("exige sessão e autorização de proprietário para criar", async () => {
    expect((await request(app).post("/professional-areas").send({ name: "Biomedicina", professionalType: "nao_medico" })).status).toBe(401);
    expect((await post("/professional-areas", { name: "Biomedicina", professionalType: "nao_medico" }, 3)).status).toBe(403);
    expect((await post("/professional-work-areas", { name: "Saúde" }, 3)).status).toBe(403);
  });
  it("cria categoria não médica sem duplicar, inclusive com concorrência e diferença de acento", async () => {
    const bodies = [{ name: "Biomedicina", professionalType: "nao_medico" }, { name: "BIOMEDICINA", professionalType: "nao_medico" }];
    const results = await Promise.all(bodies.map((body) => post("/professional-areas", body)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const item = results.find((r) => r.status === 201)!.body;
    expect(item.professionalType).toBe("nao_medico");
    expect((await get("/professional-areas")).body.find((x: any) => x.id === item.id).name).toBe("Biomedicina");
    expect((await state.pool.query("SELECT count(*)::int AS n FROM professional_category_history WHERE category_id=$1", [item.id])).rows[0].n).toBe(1);
    expect((await post("/professional-areas", { name: "Enfermágem", professionalType: "nao_medico" })).status).toBe(409);
  });
  it("cria e vincula duas áreas, com histórico e sem trocar perfil", async () => {
    const health = await post("/professional-work-areas", { name: "Saúde" });
    const management = await post("/professional-work-areas", { name: "Gestão" });
    expect([health.status, management.status]).toEqual([201, 201]);
    expect((await post("/professional-work-areas", { name: "SAUDE" })).status).toBe(409);
    const categories = (await get("/professional-areas")).body;
    const category = categories.find((a: any) => a.name === "Biomedicina");
    const created = await post("/professionals", {
      name: "Profissional sintético",
      email: "profissional@example.test",
      serviceTypes: ["presencial"],
      professionalType: "nao_medico",
      category: "outro",
      areaId: category.id,
      workAreaIds: [health.body.id, management.body.id],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ category: "outro", professionalType: "nao_medico", areaId: category.id });
    const id = created.body.id;
    expect((await get(`/professionals/${id}/work-areas`)).body).toEqual([health.body.id, management.body.id]);
    expect((await get(`/professionals/${id}/work-areas`, 2)).status).toBe(404);
    const update = await auth(request(app).put(`/professionals/${id}`)).send({ workAreaIds: [health.body.id] });
    expect(update.status).toBe(200);
    expect((await get(`/professionals/${id}/work-areas`)).body).toEqual([health.body.id]);
    const history = await state.pool.query("SELECT work_area_id,active FROM professional_work_area_history WHERE professional_id=$1 ORDER BY id", [id]);
    expect(history.rows).toEqual([{ work_area_id: health.body.id, active: true }, { work_area_id: management.body.id, active: true }, { work_area_id: management.body.id, active: false }]);
    const row = (await state.pool.query("SELECT category, professional_type, area_id FROM professionals WHERE id=$1", [id])).rows[0];
    expect(row).toEqual({ category: "outro", professional_type: "nao_medico", area_id: category.id });
    await state.pool.query("INSERT INTO location_professionals(location_id,professional_id,role) VALUES (101,$1,'executor')", [id]);
    const options = await get("/procedimentos/opcoes-profissionais");
    expect(options.status).toBe(200);
    expect(options.body.profissionais).toContainEqual(expect.objectContaining({ id, areaId: category.id, localId: 101 }));
    expect((await get("/procedimentos/opcoes-profissionais", 2)).body.profissionais.some((p: any) => p.id === id)).toBe(false);
  });
  it("recusa áreas inexistentes e não deixa profissional parcial", async () => {
    const email = "sem-area@example.test";
    const response = await post("/professionals", { name: "Não gravar", email, serviceTypes: ["presencial"], category: "outro", workAreaIds: [999999] });
    expect(response.status).toBe(400);
    expect((await state.pool.query("SELECT id FROM professionals WHERE email=$1", [email])).rowCount).toBe(0);
  });
  it("cadastra uma categoria e duas áreas pela interface, com gravação no banco isolado", async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1134, height: 720 } });
      page.setDefaultTimeout(8_000);
      await page.addInitScript(({ credential }) => {
        localStorage.setItem("padcom_collab_token", credential);
        localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Dono sintético", role: "admin" }));
      }, { credential: token(1) });
      await page.route("**/api/**", async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
        if (path === "/api/collaborator/me") return json({ professional: { id: 1, name: "Dono sintético", role: "admin", isPlatformOwner: true } });
        if (path === "/api/empresas") return json([{ id: 1, nome: "Clínica A", ativa: true }]);
        if (path.startsWith("/api/professional") || path.startsWith("/api/procedimentos")) {
          const url = path.replace("/api", "") + new URL(req.url()).search;
          const method = req.method().toLowerCase() as "get" | "post" | "put";
          let call = request(app)[method](url).set("Authorization", req.headers().authorization ?? "");
          if (method !== "get") call = call.send(req.postDataJSON());
          const result = await call;
          return json(result.body, result.status);
        }
        return json([]);
      });
      await page.goto("http://localhost:80/professionals", { waitUntil: "domcontentloaded", timeout: 40_000 });
      await page.getByRole("button", { name: "NOVO PROFISSIONAL" }).click();
      await page.getByPlaceholder("Nome completo do profissional").fill("Profissional de teste da interface");
      await page.getByPlaceholder("nome@clinica.com.br").fill("interface@example.test");
      await page.getByRole("combobox", { name: "Vínculo originário" }).click();
      await page.getByRole("option", { name: "Clínica A" }).click();
      await page.getByText("Perfil de acesso", { exact: false }).locator("..").getByRole("combobox").click();
      await page.getByRole("option", { name: "Outro" }).click();
      await page.getByRole("button", { name: "Adicionar categoria profissional" }).click();
      await page.getByLabel("Nome da categoria profissional").fill("Fisioterapia");
      await page.getByLabel("Tipo profissional da categoria").selectOption("nao_medico");
      await page.getByRole("button", { name: "Salvar categoria" }).click();
      await page.getByText("Fisioterapia", { exact: true }).first().waitFor();
      await page.getByLabel("Saúde", { exact: true }).check();
      await page.getByLabel("Gestão", { exact: true }).check();
      await page.getByRole("button", { name: "CADASTRAR", exact: true }).click();
      await page.getByText("Profissional cadastrado!", { exact: true }).waitFor();
      await page.getByText("Fisioterapia", { exact: true }).waitFor();
      await page.getByText("Categoria não informada", { exact: true }).waitFor();
      const result = await state.pool.query(`
        SELECT p.id,p.category,p.professional_type,a.name AS category_name
        FROM professionals p JOIN professional_areas a ON a.id=p.area_id WHERE p.email='interface@example.test'
      `);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ category: "outro", professional_type: "nao_medico", category_name: "Fisioterapia" });
      const links = await state.pool.query("SELECT count(*)::int AS n FROM professional_work_area_links WHERE professional_id=$1 AND empresa_id=1 AND active", [result.rows[0].id]);
      expect(links.rows[0].n).toBe(2);
    } finally { await browser.close(); }
  }, 60_000);
});
