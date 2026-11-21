import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { execFileSync } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const db = new Proxy({}, {
    get(_t, key) { const v = state.database?.[key]; return typeof v === "function" ? v.bind(state.database) : v; },
  });
  return { ...schema, db };
});
// Autenticacao do colaborador e clinica simuladas por cabecalho (a regra real tem testes proprios).
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-collab"]) { res.status(401).json({ error: "Não autenticado" }); return; }
    req.collaborator = { professionalId: 101 }; next();
  },
}));
vi.mock("../middleware/messageClinic", () => ({
  requireMessageClinic: (req: any, _res: any, next: any) => { req.messageEmpresaId = Number(req.headers["x-empresa"]); next(); },
}));

import anamneseV2 from "../routes/anamnese-v2";
import consulta from "../routes/anamnese-consulta";
import revisao from "../routes/anamnese-revisao";
import { createPortalToken } from "../lib/portal-token";

let iso: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (t: string, p?: any[]) => iso.pool.query(t, p);
const app = express();
app.use(express.json(), (req: any, _res: any, next: any) => { req.log = { info() {}, warn() {}, error() {} }; next(); }, anamneseV2, consulta, revisao);

const valor = (v: any) => v;
const H = (empresa: number) => ({ "x-collab": "1", "x-empresa": String(empresa) });
const C1 = 901, C2 = 902, C3 = 903; // C1,C2 = clinica 5 ; C3 = clinica 6
const get = (url: string, emp = 5) => request(app).get(url).set(H(emp));

async function abrirPaciente(clientId: number) {
  const r = await request(app).post("/anamnese-v2/sessions").send({ mode: "paciente", portalToken: createPortalToken(clientId) });
  return r.body as { id: number; token: string };
}
const responder = (token: string, questionRowId: number, v: any) => request(app).patch(`/anamnese-v2/sessions/${token}/answers`).send({ questionRowId, valor: v });
const concluir = (token: string) => request(app).post(`/anamnese-v2/sessions/${token}/complete`).send({});

beforeAll(async () => {
  iso = await startIsolatedPostgres();
  state.database = drizzle(iso.pool);
  await q("CREATE TABLE empresas (id integer PRIMARY KEY, nome text); CREATE TABLE agenda_resources (id integer PRIMARY KEY);");
  // Esquema real das tabelas da anamnese, copiado do banco de desenvolvimento (somente leitura do esquema).
  const ddl = execFileSync("pg_dump", [process.env.DATABASE_URL!, "--schema-only", "--no-owner", "--no-privileges",
    "-t", "anamnese_questionario", "-t", "anamnese_sessions", "-t", "anamnese_session_answers", "-t", "anamnese_refusals",
    "-t", "anamnese_findings", "-t", "anamnese_group_notes", "-t", "clients"], { encoding: "utf8", maxBuffer: 50_000_000 });
  for (const stmt of ddl.split(/;\n/)) {
    const s = stmt.trim();
    if (!s || /^(SET|SELECT pg_catalog|--)/m.test(s.split("\n")[0]) && !/CREATE|ALTER/.test(s)) continue;
    if (/FOREIGN KEY/.test(s) && !/REFERENCES public\.anamnese_/.test(s)) continue;
    if (/^(CREATE|ALTER)/m.test(s)) { try { await q(s); } catch (e) { if (!/already exists|does not exist/.test(String(e))) throw e; } }
  }
  await q("INSERT INTO empresas VALUES (5,'Clinica Sintetica A'),(6,'Clinica Sintetica B')");
  await q(`INSERT INTO anamnese_questionario (id, id_ihe, pergunta_id, pergunta, tipo_resposta, bloco, ordem) VALUES
    (1,1,'Q001','NOME COMPLETO','TEXTO','A',1),(2,2,'Q002','CPF','TEXTO','A',2),(41,41,'A03','IDADE','NUMERO','A',3),
    (6,6,'Q013','DOENCAS JA DIAGNOSTICADAS','MULTISELECAO','D',1),(82,82,'D02','TEM DIAGNOSTICO DE DIABETES?','SIM NAO','D',2),
    (8,8,'Q015','CIRURGIAS','MULTISELECAO','E',1),(315,315,'Q015B','QUAL OUTRA CIRURGIA','TEXTO LONGO','E',2),(50,50,'X50','QUEIXA','TEXTO','F',1),(42,1002,'A04','SEXO BIOLOGICO','LISTA','A',4)`);
  await q("SELECT setval(pg_get_serial_sequence('anamnese_questionario','id'), 1000)");
  await q(`INSERT INTO clients (id, name, cpf, birth_date, empresa_id) VALUES
    (${C1},'Cliente Sintetico Um','111.444.777-35','1988-01-30',5),
    (${C2},'Cliente Sintetico Dois','529.982.247-25','1975-06-10',5),
    (${C3},'Cliente Sintetico Tres','935.411.347-80','1990-12-01',6)`);
}, 120000);
afterAll(async () => { if (iso) await iso.stop(); }, 60000);



import { readFileSync } from "node:fs";
import { aplicarCatalogoIntegrado, montarCatalogoIntegrado, type Catalogo } from "../lib/catalogo-integrado-anamnese";
import { sexoDoCadastro } from "../lib/anamnese-retorno";

const cat = JSON.parse(readFileSync(new URL("../data/catalogo-integrado-padua.json", import.meta.url), "utf8")) as Catalogo;
const M = { tipo: "single", opcao: "Masculino", valor: "M" };
const F = { tipo: "single", opcao: "Feminino", valor: "F" };

describe("sexo biologico (cadastro, nao editavel) x identidade de genero + catalogo integrado", () => {
  it("sem sexo no cadastro, a resposta unica da A04 e gravada ao concluir; depois disso ninguem altera", async () => {
    const s = await abrirPaciente(C1);
    expect((await responder(s.token, 42, M)).status).toBe(200);
    expect((await concluir(s.token)).status).toBeLessThan(300);
    expect(await sexoDoCadastro(C1)).toBe("M");
    const s2 = await abrirPaciente(C1);
    const r = await responder(s2.token, 42, F);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("SEXO_DO_CADASTRO");
    expect(await sexoDoCadastro(C1)).toBe("M");
    const est = await request(app).get(`/anamnese-v2/sessions/${s2.token}`);
    expect(est.body.retorno.identidade.sexoBiologico).toBe("M");
  });
  it("sexo do cadastro nunca e sobrescrito por resposta de outra sessao", async () => {
    await q("UPDATE clients SET sexo_biologico='F' WHERE id=$1", [C2]);
    const s = await abrirPaciente(C2);
    expect((await responder(s.token, 42, M)).status).toBe(409);
    expect(await sexoDoCadastro(C2)).toBe("F");
  });
  it("catalogo: perguntas femininas so para F, masculinas so para M, e a identidade de genero e pergunta propria", () => {
    const { novas } = montarCatalogoIntegrado(cat);
    const por = (id: string) => novas.find((n) => n.perguntaId === id)!;
    expect(por("F20").aplicavelEm?.sexo).toBe("M");
    expect(por("F36").aplicavelEm?.sexo).toBe("F");
    expect(por("F37").dependeDe).toEqual({ perguntaId: "F36", inclui: ["sim"] });
    expect(por("F19")).toBeUndefined();
    expect(por("A04B").aplicavelEm).toBeNull();
    expect(novas.every((n) => n.referencia?.codigo)).toBe(true);
    expect(novas.some((n) => n.tipoResposta === "GRID")).toBe(false);
  });
  it("aplicar o catalogo duas vezes nao duplica e carimba a referencia nas existentes", async () => {
    await q("DELETE FROM anamnese_questionario WHERE id_ihe >= 3000");
    const a = await aplicarCatalogoIntegrado(cat);
    const b = await aplicarCatalogoIntegrado(cat);
    expect(a.inseridas).toBeGreaterThan(50);
    expect(b.inseridas).toBe(0);
    const n = (await q("SELECT count(*)::int AS n FROM anamnese_questionario WHERE id_ihe >= 3000")).rows[0].n;
    expect(n).toBe(a.inseridas);
    const nomes = (await q("SELECT referencia FROM anamnese_questionario WHERE pergunta_id='Q001'")).rows[0].referencia;
    expect(nomes.codigo).toBe("ADM");
  });
});
