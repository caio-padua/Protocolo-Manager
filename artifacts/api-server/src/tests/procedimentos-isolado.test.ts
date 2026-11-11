import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { chromium } from "@playwright/test";

const state = vi.hoisted(() => ({ pool: null as any, db: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { ...schema, get pool() { return state.pool; }, get db() { return state.db; } };
});

import { PROCEDIMENTOS_SCHEMA_SQL } from "../lib/procedimentos-schema";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import procedimentosRouter from "../routes/procedimentos";

const app = express().use(express.json(), tenantContextMiddleware, procedimentosRouter);
let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const ownerA = () => createCollaboratorToken({ professionalId: 1, role: "admin" });
const ownerB = () => createCollaboratorToken({ professionalId: 2, role: "admin" });
const clinicianB = () => createCollaboratorToken({ professionalId: 3, role: "executor" });
function novoContrato(token: string, body: any) {
  const professionalId = Number(Buffer.from(token, "base64url").toString().split(":")[1]);
  const b = professionalId === 2 || professionalId === 3;
  const localId = b ? 9 : 8;
  const medico = { areaId: 1, localId, professionalIds: [b ? 2 : 1] };
  const enfermeiro = { areaId: 2, localId, professionalIds: [b ? 6 : 5] };
  return { dose: null, profissionaisNecessarios: body.tipo === "enfermagem" ? [enfermeiro] : [medico, enfermeiro], ...body };
}
const post = (token: string, body: object) => request(app).post("/procedimentos").set("Authorization", `Bearer ${token}`).send(novoContrato(token, body));
const put = (token: string, id: number, body: object) => request(app).put(`/procedimentos/${id}`).set("Authorization", `Bearer ${token}`).send(novoContrato(token, body));
const get = (token: string) => request(app).get("/procedimentos").set("Authorization", `Bearer ${token}`);
const consulta = { nome: "Consulta sintética", tipo: "consulta", descricao: null, duracaoMinutos: 60, ativo: true, produtoIds: [] };

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  state.pool = isolated.pool;
  const schema = await import("@workspace/db/schema");
  state.db = drizzle(state.pool, { schema });
  await state.pool.query(`
    CREATE TABLE empresas (id integer primary key, nome text, nome_fantasia text, ativa boolean, status text);
    INSERT INTO empresas VALUES (1,'Clínica A',null,true,'ATIVO'), (2,'Clínica B',null,true,'ATIVO');
    CREATE TABLE professionals (id integer primary key, role text, category text, active boolean,
      credential_version integer, empresa_id integer, is_platform_owner boolean, name text, area_id integer);
    INSERT INTO professionals VALUES
      (1,'admin','medico',true,0,1,true,'Médico A',1), (2,'admin','medico',true,0,2,true,'Médico B',1),
      (3,'executor','medico',true,0,2,false,'Profissional B',1), (4,'admin','medico',false,0,1,true,'Inativo',1),
      (5,'executor','enfermagem',true,0,1,false,'Enfermagem A',2), (6,'executor','enfermagem',true,0,2,false,'Enfermagem B',2);
    CREATE TABLE professional_areas (id integer primary key, name text, slug text, active boolean);
    INSERT INTO professional_areas VALUES (1,'Medicina','medicina',true),(2,'Enfermagem','enfermagem',true);
    CREATE TABLE locations (id integer primary key, empresa_id integer, active text, name text);
    INSERT INTO locations VALUES (8,1,'true','Local A'),(9,2,'true','Local B');
    CREATE TABLE location_professionals (id serial primary key, professional_id integer, location_id integer, agenda_calendar_id integer);
    INSERT INTO location_professionals(professional_id,location_id) VALUES (1,8),(5,8),(2,9),(6,9);
    CREATE TABLE agenda_calendars (id integer primary key, name text, active boolean, location_id integer);
    CREATE TABLE agenda_resources (id integer primary key, name text, active boolean, location_id integer, professional_id integer);
    CREATE TABLE professional_empresas (id integer primary key, professional_id integer, empresa_id integer);
    CREATE TABLE substances (id integer primary key, name text, procedure_type text, doctor_participation boolean);
    INSERT INTO substances VALUES (10,'Produto sintético IM','im',false),
      (11,'Implante sintético','implant',true), (12,'Produto médico sintético','im',true),
      (13,'ADEK sintético','im',false);
  `);
  await state.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
  await state.pool.query(PROCEDIMENTOS_SCHEMA_SQL);
}, 60000);

afterAll(async () => { if (isolated) await isolated.stop(); }, 60000);

describe("Cadastro de procedimentos — banco e autenticação isolados", () => {
  let consultaId: number;
  let implantId: number;
  it("recusa leitura e escrita sem sessão e sessão inválida", async () => {
    expect((await request(app).get("/procedimentos")).status).toBe(401);
    expect((await request(app).post("/procedimentos").send(consulta)).status).toBe(401);
    expect((await get("invalido")).status).toBe(401);
    const inactive = createCollaboratorToken({ professionalId: 4, role: "admin" });
    expect((await get(inactive)).status).toBe(401);
    const revoked = createCollaboratorToken({ professionalId: 1, role: "admin", credentialVersion: 1 });
    expect((await get(revoked)).status).toBe(401);
  });
  it("não usa estrutura incompatível nem tenta modificá-la", async () => {
    const client = await state.pool.connect();
    try {
      await client.query("CREATE SCHEMA teste_incompativel; CREATE TABLE teste_incompativel.procedimentos_clinicos (duracao_minutos REAL)");
      await client.query("SET search_path TO teste_incompativel, public");
      const previous = state.pool;
      state.pool = client;
      try {
        expect((await get(ownerA())).status).toBe(503);
      } finally {
        state.pool = previous;
      }
      const structure = await client.query("SELECT data_type FROM information_schema.columns WHERE table_schema='teste_incompativel' AND table_name='procedimentos_clinicos' AND column_name='duracao_minutos'");
      expect(structure.rows[0].data_type).toBe("real");
      await client.query("RESET search_path");
    } finally {
      client.release();
    }
  });
  it("salva consulta sem substância e a relê da clínica correta", async () => {
    const result = await post(ownerA(), consulta);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ ...consulta, tipo: null, empresaId: 1 });
    consultaId = result.body.id;
    const list = await get(ownerA());
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ empresaId: 1, empresaNome: "Clínica A" });
    expect(list.body.procedimentos).toContainEqual(result.body);
    expect((await get(ownerB())).body.procedimentos).toEqual([]);
  });
  it("vincula produto existente sem alterá-lo e admite duração decimal", async () => {
    const before = await state.pool.query("SELECT * FROM substances ORDER BY id");
    const result = await post(ownerB(), {
      nome: "Implante sintético", tipo: "medico", descricao: null, duracaoMinutos: 2.5,
      ativo: true, produtoIds: [11],
    });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ empresaId: 2, tipo: null, produtoIds: [11], duracaoMinutos: 2.5 });
    implantId = result.body.id;
    expect((await state.pool.query("SELECT * FROM substances ORDER BY id")).rows).toEqual(before.rows);
  });
  it("impede edição cruzada e troca de clínica por profissional sem vínculo", async () => {
    expect((await put(ownerA(), implantId, consulta)).status).toBe(404);
    expect((await put(clinicianB(), consultaId, consulta)).status).toBe(403);
    const resposta = await get(clinicianB()).set("x-empresa-id", "1");
    expect(resposta.status).toBe(403);
    expect((await get(clinicianB())).body.procedimentos.map((p: any) => p.id)).toEqual([implantId]);
  });
  it("recusa campos inválidos, produto ausente e implante como enfermagem", async () => {
    for (const body of [
      { ...consulta, nome: "  " }, { ...consulta, tipo: "desconhecido" },
      { ...consulta, produtoIds: [10, 10] }, { ...consulta, produtoIds: [10.5] },
      { ...consulta, produtoIds: [999] }, { ...consulta, tipo: "enfermagem", produtoIds: [11] },
      { ...consulta, dose: "100 mg / 2 ml" }, { ...consulta, empresaId: 2 },
      { ...consulta, duracaoMinutos: 0.001 }, { ...consulta, duracaoMinutos: null },
      { ...consulta, duracaoMinutos: 2.51 }, { ...consulta, duracaoMinutos: -1 },
    ]) expect((await post(ownerA(), body)).status, JSON.stringify(body)).toBe(400);
  });
  it("preserva 2,5 minutos e durações que não cabem em duas casas decimais sem arredondar segundos", async () => {
    for (const duracaoMinutos of [2.5, 1 / 60, 151 / 60]) {
      const result = await post(ownerA(), { ...consulta, nome: `Duração ${duracaoMinutos}`, duracaoMinutos });
      expect(result.status).toBe(201);
      expect(result.body.duracaoMinutos).toBe(duracaoMinutos);
      const stored = await state.pool.query("SELECT duracao_minutos::text AS n, duracao_segundos AS segundos FROM procedimentos_clinicos WHERE id=$1", [result.body.id]);
      expect(stored.rows[0].segundos).toBe(Math.round(duracaoMinutos * 60));
      if (duracaoMinutos === 2.5) expect(stored.rows[0].n).toBe("2.50");
      else expect(stored.rows[0].n).toBeNull();
    }
  });
  it("preserva um registro antigo sem duração ao inativar e não permite reativá-lo incompleto", async () => {
    const antigo = await state.pool.query(`INSERT INTO procedimentos_clinicos
      (empresa_id,nome,tipo,duracao_minutos,ativo) VALUES (1,'Legado','consulta',null,true) RETURNING id`);
    const id = antigo.rows[0].id;
    const legado = { ...consulta, nome: "Legado", duracaoMinutos: null, ativo: false };
    expect((await put(ownerA(), id, legado)).status).toBe(200);
    expect((await put(ownerA(), id, { ...legado, ativo: true })).status).toBe(400);
    expect((await state.pool.query("SELECT ativo FROM procedimentos_clinicos WHERE id=$1", [id])).rows[0].ativo).toBe(false);
  });
  it("grava pela interface com autenticação real e banco descartável, e preserva os campos após 401", async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      await page.addInitScript(({ token }) => {
        localStorage.setItem("padcom_collab_token", token);
        localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Profissional sintético", role: "admin" }));
      }, { token: ownerA() });
      await page.route("**/api/**", async route => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
        if (path === "/api/collaborator/me") return json({ professional: { id: 1, name: "Profissional sintético", role: "admin", isPlatformOwner: true } });
        if (path === "/api/substances") return json([
          { id: 10, name: "Produto sintético IM", defaultDose: "100 mg", durationMinutes: 2.5 },
          { id: 11, name: "Produto sintético IM", defaultDose: "200 mg / 2 mL", durationMinutes: 2.5 },
          { id: 13, name: "ADEK (VITAMINAS A, D, E, K)", defaultDose: "mistura / 2 mL", durationMinutes: 2.5, components: [
            { id: 1, componentName: "Vitamina A", doseValue: 25000, doseUnit: "UI", sortOrder: 1 },
            { id: 2, componentName: "Vitamina D3", doseValue: 100000, doseUnit: "UI", sortOrder: 2 },
            { id: 3, componentName: "Vitamina E", doseValue: 200, doseUnit: "UI", sortOrder: 3 },
            { id: 4, componentName: "Vitamina K2", doseValue: 1300, doseUnit: "mcg", sortOrder: 4 },
          ] },
        ]);
        if (path === "/api/procedimentos/opcoes-profissionais") {
          const result = await request(app).get("/procedimentos/opcoes-profissionais").set("Authorization", req.headers().authorization ?? "");
          return json(result.body, result.status);
        }
        if (path === "/api/procedimentos") {
          const authorization = req.headers().authorization ?? "";
          const result = req.method() === "GET"
            ? await request(app).get("/procedimentos").set("Authorization", authorization)
            : await request(app).post("/procedimentos").set("Authorization", authorization).send(req.postDataJSON());
          return json(result.body, result.status);
        }
        return json([]);
      });
      await page.goto("http://localhost:18148/procedimentos");
      await page.getByTestId("button-new-procedimento").click();
      await page.getByRole("button", { name: "Adicionar categoria necessária" }).click();
      await page.getByLabel("Local da clínica").selectOption("8");
      await page.getByLabel("Categoria profissional").selectOption("2");
      await page.getByLabel("Selecionar Enfermagem A").click();
      await page.getByTestId("checkbox-substancia-10").click();
      expect(await page.getByTestId("input-procedimento-dose").inputValue()).toBe("100 mg");
      await page.getByTestId("checkbox-substancia-11").click();
      expect(await page.getByTestId("input-procedimento-dose").inputValue()).toBe("");
      await page.getByTestId("checkbox-substancia-11").click();
      expect(await page.getByTestId("input-procedimento-dose").inputValue()).toBe("100 mg");
      expect(await page.getByTestId("input-procedimento-duracao").inputValue()).toBe("2,5");
      await page.getByLabel("Conferi que esta é a dose prescrita.").click();
      await page.getByTestId("button-save-procedimento").click();
      await page.getByText("Procedimento cadastrado.").waitFor();
      const stored = await state.pool.query("SELECT duracao_segundos FROM procedimentos_clinicos WHERE empresa_id=1 AND nome='Produto sintético IM'");
      expect(stored.rows).toEqual([{ duracao_segundos: 150 }]);
      const products = await state.pool.query(`SELECT pp.produto_id FROM procedimento_produtos pp
        JOIN procedimentos_clinicos p ON p.id=pp.procedimento_id
        WHERE p.empresa_id=1 AND p.nome='Produto sintético IM' AND pp.ativo`);
      expect(products.rows).toEqual([{ produto_id: 10 }]);
      await page.getByTestId("button-new-procedimento").click();
      await page.getByRole("button", { name: "Adicionar categoria necessária" }).click();
      await page.getByLabel("Local da clínica").selectOption("8");
      await page.getByLabel("Categoria profissional").selectOption("2");
      await page.getByLabel("Selecionar Enfermagem A").click();
      await page.getByTestId("checkbox-substancia-13").click();
      expect(await page.getByTestId("input-procedimento-dose").inputValue()).toBe("25.000 UI + 100.000 UI + 200 UI + 1.300 mcg");
      await page.getByTestId("input-procedimento-dose").locator("..").screenshot({ path: "/tmp/procedimento-dose-composta-sintetica.png" });
      await page.getByTestId("button-save-procedimento").click();
      await page.getByText("Confirme a dose prescrita antes de salvar.").waitFor();
      await page.getByLabel("Conferi a dose prescrita e a ordem de cada componente.").click();
      await page.getByTestId("button-save-procedimento").click();
      await page.getByText("Procedimento cadastrado.").waitFor();
      const blend = await state.pool.query(`SELECT p.dose, array_agg(pp.produto_id) AS produtos
        FROM procedimentos_clinicos p JOIN procedimento_produtos pp ON pp.procedimento_id=p.id AND pp.ativo
        WHERE p.empresa_id=1 AND p.nome='ADEK (VITAMINAS A, D, E, K)' GROUP BY p.id`);
      expect(blend.rows).toEqual([{ dose: "25.000 UI + 100.000 UI + 200 UI + 1.300 mcg", produtos: [13] }]);
      await page.getByTestId("button-new-procedimento").click();
      await page.getByRole("button", { name: "Adicionar categoria necessária" }).click();
      await page.getByLabel("Local da clínica").selectOption("8");
      await page.getByLabel("Categoria profissional").selectOption("2");
      await page.getByLabel("Selecionar Enfermagem A").click();
      await page.getByTestId("checkbox-substancia-10").click();
      await page.getByTestId("input-procedimento-dose").fill("100 mg");
      await page.getByLabel("Conferi que esta é a dose prescrita.").click();
      await page.evaluate(() => localStorage.setItem("padcom_collab_token", "sessao-invalida"));
      await page.getByTestId("button-save-procedimento").click();
      await page.getByTestId("error-procedimento-form").waitFor();
      expect(await page.getByTestId("error-procedimento-form").innerText()).toContain("sessão profissional");
      expect(await page.getByTestId("input-procedimento-nome").inputValue()).toBe("Produto sintético IM");
      expect(await page.getByTestId("input-procedimento-duracao").inputValue()).toBe("2,5");
      expect((await state.pool.query("SELECT count(*)::int AS n FROM procedimentos_clinicos WHERE empresa_id=1 AND nome='Produto sintético IM'")).rows[0].n).toBe(1);
    } finally {
      await browser.close();
    }
  }, 60000);
  it("altera vínculos sem apagar histórico e reativa o mesmo procedimento", async () => {
    const body = { nome: "Implante sintético", tipo: "medico", descricao: "Revisado", duracaoMinutos: 30, ativo: false, produtoIds: [10] };
    expect((await put(ownerB(), implantId, body)).body).toMatchObject({ ...body, tipo: null });
    const vinculos = await state.pool.query("SELECT produto_id, ativo FROM procedimento_produtos WHERE procedimento_id=$1 ORDER BY produto_id", [implantId]);
    expect(vinculos.rows).toEqual([{ produto_id: 10, ativo: true }, { produto_id: 11, ativo: false }]);
    expect((await put(ownerB(), implantId, { ...body, ativo: true, produtoIds: [11] })).body)
      .toMatchObject({ ...body, tipo: null, ativo: true, produtoIds: [11] });
    expect((await state.pool.query("SELECT count(*)::int AS n FROM procedimentos_clinicos WHERE id=$1", [implantId])).rows[0].n).toBe(1);
  });
  it("uma falha no vínculo desfaz a atualização por inteiro", async () => {
    await state.pool.query(`CREATE FUNCTION falhar_vinculo_sintetico() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha sintética'; END $$;
      CREATE TRIGGER teste_falha BEFORE INSERT ON procedimento_produtos FOR EACH ROW EXECUTE FUNCTION falhar_vinculo_sintetico()`);
    const result = await put(ownerB(), implantId, { nome: "Não deve salvar", tipo: "medico", descricao: null, duracaoMinutos: null, ativo: false, produtoIds: [10] });
    expect(result.status).toBe(500);
    const found = (await get(ownerB())).body.procedimentos.find((p: any) => p.id === implantId);
    expect(found).toMatchObject({ nome: "Implante sintético", ativo: true, produtoIds: [11] });
    await state.pool.query("DROP TRIGGER teste_falha ON procedimento_produtos; DROP FUNCTION falhar_vinculo_sintetico()");
  });
});
