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
    "-t", "anamnese_findings", "-t", "anamnese_group_notes", "-t", "clients", "-t", "pergunta_doenca", "-t", "pergunta_sintoma", "-t", "catalogo_doencas", "-t", "catalogo_sintomas", "-t", "catalogo_bloco_exames", "-t", "item_doenca"], { encoding: "utf8", maxBuffer: 50_000_000 });
  for (const stmt of ddl.split(/;\n/)) {
    const s = stmt.trim();
    if (!s || /^(SET|SELECT pg_catalog|--)/m.test(s.split("\n")[0]) && !/CREATE|ALTER/.test(s)) continue;
    if (/FOREIGN KEY/.test(s) && !/REFERENCES public\.anamnese_/.test(s)) continue;
    if (/^(CREATE|ALTER)/m.test(s)) { try { await q(s); } catch (e) { if (!/already exists|does not exist/.test(String(e))) throw e; } }
  }
  await q("INSERT INTO empresas VALUES (5,'Clinica Sintetica A'),(6,'Clinica Sintetica B')");
  await q(`INSERT INTO anamnese_questionario (id, id_ihe, pergunta_id, pergunta, tipo_resposta, bloco, ordem, opcoes, e_sinal_alarme, peso_gravidade) VALUES
    (10,10,'D02','TEM DIABETES?','SIM NAO','DOENCAS',1,'[{"peso":0,"label":"Nao","valor":"nao"},{"peso":2,"label":"Sim","valor":"sim"}]',false,1),
    (11,11,'PHQ2','HUMOR BAIXO','ESCALA','HUMOR',1,'[{"peso":0,"label":"Nenhum dia","valor":0},{"peso":1,"label":"Mais da metade","valor":2},{"peso":2,"label":"Quase todos","valor":3}]',false,1),
    (12,12,'GAD1','NERVOSISMO','ESCALA','HUMOR',2,'[{"peso":0,"label":"Nenhum dia","valor":0},{"peso":1,"label":"Mais da metade","valor":2}]',false,1),
    (13,13,'MULTI1','ALERGIAS','MULTISELECAO','ANTECEDENTES',1,'[]',false,1),
    (14,14,'AL1','DOR NO PEITO AOS ESFORCOS','SIM NAO','ALARME',1,'[{"peso":0,"label":"Nao","valor":"nao"},{"peso":2,"label":"Sim","valor":"sim"}]',true,3)`);
  await q("INSERT INTO catalogo_doencas (id_ihe, nome_doenca) VALUES (3,'Diabetes (regra cadastrada)'),(12,'Rastreio de humor (regra cadastrada)')");
  await q("INSERT INTO pergunta_doenca (pergunta_id, doenca_id_ihe, gatilho_valor, peso) VALUES ('D02',3,'sim',3),('PHQ2',12,'>=2',1),('GAD1',12,'>=2',1)");
  await q(`INSERT INTO clients (id, name, cpf, birth_date, empresa_id) VALUES
    (${C1},'Cliente Sintetico Um','111.444.777-35','1988-01-30',5),
    (${C2},'Cliente Sintetico Dois','529.982.247-25','1975-06-10',5),
    (${C3},'Cliente Sintetico Tres','935.411.347-80','1990-12-01',6)`);
}, 120000);
afterAll(async () => { if (iso) await iso.stop(); }, 60000);

describe("da anamnese V2 ate o motor deterministico", () => {
  let tokenA = "", idA = 0;
  const val = (v: any) => v;
  it("preenche como paciente: sim, escala, multi so 'Nenhuma', omissao e alarme negativo", async () => {
    const s = await abrirPaciente(C1); tokenA = s.token; idA = s.id;
    expect((await responder(tokenA, 10, val({ tipo: "boolean", bool: true }))).status).toBe(200);
    expect((await responder(tokenA, 11, val({ tipo: "escala", escala: 3, max: 3 }))).status).toBe(200);
    expect((await responder(tokenA, 13, val({ tipo: "multi", selecionados: ["Nenhuma"] }))).status).toBe(200);
    expect((await responder(tokenA, 14, val({ tipo: "single", opcao: "Nao", valor: "nao" }))).status).toBe(200);
    expect((await concluir(tokenA)).status).toBe(200);
  });
  it("achados da V2 nao tratam 'Nenhuma' como presenca e continuam rotulados como adaptador", async () => {
    const f = (await q("SELECT tipo, rotulo FROM anamnese_findings WHERE session_id=$1", [idA])).rows;
    expect(f.some((x: any) => /ALERGIAS/.test(x.rotulo))).toBe(false);
    expect(f.some((x: any) => /DOR NO PEITO/.test(x.rotulo))).toBe(false);
  });
  it("motor: regras disparadas com rastro ate a resposta; omissao e multi declaradas; negativo nao dispara", async () => {
    const r = (await get(`/collaborator/anamnese/sessions/${idA}/motor`)).body;
    expect(r.natureza).toMatch(/Nao e diagnostico/);
    const alvos = r.regrasDisparadas.map((x: any) => [x.perguntaId, x.questionRowId, x.alvo]);
    expect(alvos).toEqual(expect.arrayContaining([["D02", 10, "Diabetes (regra cadastrada)"], ["PHQ2", 11, "Rastreio de humor (regra cadastrada)"]]));
    expect(r.regrasSemResposta.map((x: any) => x.perguntaId)).toContain("GAD1");
    expect(r.regrasDisparadas.map((x: any) => x.perguntaId)).not.toContain("GAD1");
    expect(r.naoAvaliadas.map((x: any) => x.questionRowId)).toContain(13);
    expect(r.redFlag).toBe(false);
    expect(r.alarmes).toHaveLength(0);
  });
  it("opcao negativa nao dispara regra e alarme positivo acende o sinal vermelho", async () => {
    const s = await abrirPaciente(C2);
    await responder(s.token, 10, val({ tipo: "boolean", bool: false }));
    await responder(s.token, 14, val({ tipo: "single", opcao: "Sim", valor: "sim" }));
    const r = (await get(`/collaborator/anamnese/sessions/${s.id}/motor`)).body;
    expect(r.regrasDisparadas.map((x: any) => x.perguntaId)).not.toContain("D02");
    expect(r.redFlag).toBe(true);
    expect(r.alarmes.map((x: any) => x.perguntaId)).toEqual(["AL1"]);
    expect(r.gradeGlobal).toBe("GRADE AMPLIADA");
  });
  it("isolamento: outra clinica recebe 404; outro paciente nao herda regras", async () => {
    expect((await get(`/collaborator/anamnese/sessions/${idA}/motor`, 6)).status).toBe(404);
    const s3 = await abrirPaciente(C3);
    const r = (await get(`/collaborator/anamnese/sessions/${s3.id}/motor`, 6)).body;
    expect(r.regrasDisparadas).toHaveLength(0);
    expect(r.regrasSemResposta.length).toBeGreaterThan(0);
  });
  it("o motor so le: as respostas da sessao continuam intactas", async () => {
    const antes = (await q("SELECT COUNT(*)::int n FROM anamnese_session_answers WHERE session_id=$1", [idA])).rows[0].n;
    await get(`/collaborator/anamnese/sessions/${idA}/motor`);
    expect((await q("SELECT COUNT(*)::int n FROM anamnese_session_answers WHERE session_id=$1", [idA])).rows[0].n).toBe(antes);
  });
  it("sem token de colaborador nao ha acesso", async () => {
    expect((await request(app).get(`/collaborator/anamnese/sessions/${idA}/motor`)).status).toBe(401);
  });
});
