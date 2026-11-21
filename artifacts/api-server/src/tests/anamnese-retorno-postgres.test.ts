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
    (8,8,'Q015','CIRURGIAS','MULTISELECAO','E',1),(315,315,'Q015B','QUAL OUTRA CIRURGIA','TEXTO LONGO','E',2),(50,50,'X50','QUEIXA','TEXTO','F',1)`);
  await q(`INSERT INTO clients (id, name, cpf, birth_date, empresa_id) VALUES
    (${C1},'Cliente Sintetico Um','111.444.777-35','1988-01-30',5),
    (${C2},'Cliente Sintetico Dois','529.982.247-25','1975-06-10',5),
    (${C3},'Cliente Sintetico Tres','935.411.347-80','1990-12-01',6)`);
}, 120000);
afterAll(async () => { if (iso) await iso.stop(); }, 60000);

describe("primeira anamnese de cliente identificado", () => {
  let tokenC1 = "", sessaoC1 = 0;
  it("recusa nome e CPF digitados e devolve a identidade do cadastro", async () => {
    const s = await abrirPaciente(C1); tokenC1 = s.token; sessaoC1 = s.id;
    const r1 = await responder(s.token, 1, { tipo: "texto", texto: "BETE BOQUETE" });
    const r2 = await responder(s.token, 2, { tipo: "texto", texto: "11122233300" });
    expect(r1.status).toBe(409); expect(r2.status).toBe(409);
    const st = (await request(app).get(`/anamnese-v2/sessions/${s.token}`)).body;
    expect(st.retorno.identidade.nome).toBe("Cliente Sintetico Um");
    expect(st.retorno.identidade.cpfMascarado).toBe("111.***.***-35");
    expect(st.answers.filter((a: any) => [1, 2].includes(a.questionRowId))).toHaveLength(0);
  });
  it("conclui com idade calculada da data de nascimento e cirurgias registradas", async () => {
    await responder(tokenC1, 8, valor({ tipo: "multi", selecionados: ["Cesarea (parto por corte)", "Apendice"] }));
    await responder(tokenC1, 315, valor({ tipo: "texto", texto: "Vesicula 2019" }));
    await responder(tokenC1, 6, valor({ tipo: "multi", selecionados: ["Hipertensao"] }));
    await responder(tokenC1, 50, valor({ tipo: "texto", texto: "cansaco" }));
    const fim = await concluir(tokenC1);
    expect(fim.status).toBe(200);
    const idade = (await q("SELECT valor FROM anamnese_session_answers WHERE session_id=$1 AND question_row_id=41", [sessaoC1])).rows[0].valor;
    expect(idade.tipo).toBe("number");
    expect(idade.numero).toBeGreaterThanOrEqual(38);
  });
});

describe("retorno (nova anamnese na consulta)", () => {
  let consultaId = 0, consultaToken = "";
  it("nao herda nome/CPF/idade como respostas, mas herda cirurgias e condicoes; nada da anterior e apagado", async () => {
    const antes = (await q("SELECT COUNT(*)::int n FROM anamnese_session_answers")).rows[0].n;
    const r = await request(app).post(`/collaborator/anamnese/clientes/${C1}/nova`).set(H(5)).send({});
    expect(r.status).toBe(201);
    consultaId = r.body.id; consultaToken = r.body.link.split("?s=")[1];
    const ids = (await q("SELECT question_row_id FROM anamnese_session_answers WHERE session_id=$1 ORDER BY 1", [consultaId])).rows.map((x: any) => x.question_row_id);
    expect(ids).toEqual(expect.arrayContaining([8, 315, 6]));
    for (const proibido of [1, 2, 41, 50]) expect(ids).not.toContain(proibido);
    const depois = (await q("SELECT COUNT(*)::int n FROM anamnese_session_answers")).rows[0].n;
    expect(depois).toBeGreaterThanOrEqual(antes);
  });
  it("tentativa de remover cirurgia registrada e bloqueada; acrescentar nova e permitida", async () => {
    const remover = await responder(consultaToken, 8, { tipo: "multi", selecionados: ["Apendice"] });
    expect(remover.status).toBe(409); expect(remover.body.codigo).toBe("RETIRADA_BLOQUEADA");
    const apagarTexto = await responder(consultaToken, 315, { tipo: "texto", texto: "outra coisa" });
    expect(apagarTexto.status).toBe(409);
    const acrescentar = await responder(consultaToken, 8, { tipo: "multi", selecionados: ["Cesarea (parto por corte)", "Apendice", "Hernia"] });
    expect(acrescentar.status).toBe(200);
    const texto = await responder(consultaToken, 315, { tipo: "texto", texto: "Vesicula 2019; Hernia 2026" });
    expect(texto.status).toBe(200);
    const st = (await request(app).get(`/anamnese-v2/sessions/${consultaToken}`)).body;
    expect(Object.keys(st.retorno.bloqueados)).toEqual(expect.arrayContaining(["8", "315"]));
  });
  it("novos diagnosticos podem ser informados e condicoes podem evoluir", async () => {
    const r = await responder(consultaToken, 6, { tipo: "multi", selecionados: ["Hipertensao", "Diabetes tipo 2"] });
    expect(r.status).toBe(200);
    const r2 = await responder(consultaToken, 82, { tipo: "single", opcao: "Sim", valor: "sim" });
    expect(r2.status).toBe(200);
  });
  it("comunicar erro abre pedido com trilha sem alterar o historico; so a clinica do cliente resolve", async () => {
    const antes = (await q("SELECT valor FROM anamnese_session_answers WHERE session_id=$1 AND question_row_id=315", [consultaId])).rows[0].valor;
    const c = await request(app).post(`/anamnese-v2/sessions/${consultaToken}/correcao`).send({ questionRowId: 315, texto: "A vesicula foi em 2018" });
    expect(c.status).toBe(201);
    const depois = (await q("SELECT valor FROM anamnese_session_answers WHERE session_id=$1 AND question_row_id=315", [consultaId])).rows[0].valor;
    expect(depois).toEqual(antes);
    const lista = await get(`/collaborator/anamnese/clientes/${C1}/correcoes`);
    expect(lista.body).toHaveLength(1); expect(lista.body[0].status).toBe("pendente");
    expect((await get(`/collaborator/anamnese/clientes/${C1}/correcoes`, 6)).status).toBe(404);
    const outra = await request(app).post(`/collaborator/anamnese/correcoes/${c.body.id}/resolver`).set(H(6)).send({ decisao: "aceita", nota: "tentativa" });
    expect(outra.status).toBe(404);
    const sem = await request(app).post(`/collaborator/anamnese/correcoes/${c.body.id}/resolver`).set(H(5)).send({ decisao: "aceita", nota: "" });
    expect(sem.status).toBe(400);
    const ok = await request(app).post(`/collaborator/anamnese/correcoes/${c.body.id}/resolver`).set(H(5)).send({ decisao: "aceita", nota: "Conferido com o cliente" });
    expect(ok.status).toBe(200);
    const trilha = (await q("SELECT status, resolvido_por, nota_profissional FROM anamnese_correcoes WHERE id=$1", [c.body.id])).rows[0];
    expect(trilha).toMatchObject({ status: "aceita", resolvido_por: 101, nota_profissional: "Conferido com o cliente" });
  });
  it("sessao sem cliente identificado nao comunica erro", async () => {
    const anon = (await request(app).post("/anamnese-v2/sessions").send({ mode: "paciente" })).body;
    const r = await request(app).post(`/anamnese-v2/sessions/${anon.token}/correcao`).send({ questionRowId: 8, texto: "qualquer coisa" });
    expect(r.status).toBe(403);
  });
});

describe("pacientes e clinicas distintos", () => {
  it("cada cliente tem sua identidade e seus fatos; cirurgia de um nao bloqueia o outro", async () => {
    const s2 = await abrirPaciente(C2);
    const st2 = (await request(app).get(`/anamnese-v2/sessions/${s2.token}`)).body;
    expect(st2.retorno.identidade.nome).toBe("Cliente Sintetico Dois");
    expect(st2.retorno.bloqueados).toEqual({});
    const ok = await responder(s2.token, 8, { tipo: "multi", selecionados: ["Nunca operei"] });
    expect(ok.status).toBe(200);
  });
  it("a clinica 6 nao ve sessoes nem detalhes de clientes da clinica 5 e vice-versa", async () => {
    const s3 = await abrirPaciente(C3);
    await responder(s3.token, 50, { tipo: "texto", texto: "dor" });
    const listaA = (await get("/collaborator/anamnese/sessions", 5)).body as any[];
    const listaB = (await get("/collaborator/anamnese/sessions", 6)).body as any[];
    expect(listaA.length).toBeGreaterThan(0);
    expect(listaA.every((s) => s.clientId !== C3)).toBe(true);
    expect(listaB.map((s) => s.clientId)).toEqual(expect.arrayContaining([C3]));
    expect(listaB.every((s) => s.clientId === C3 || s.clientId === null)).toBe(true);
    expect((await get(`/collaborator/anamnese/sessions/${s3.id}`, 5)).status).toBe(404);
    expect((await get(`/collaborator/anamnese/sessions/${s3.id}`, 6)).status).toBe(200);
    const idC1 = listaA.find((s) => s.clientId === C1)!.id;
    expect((await get(`/collaborator/anamnese/sessions/${idC1}`, 6)).status).toBe(404);
    expect((await get(`/collaborator/anamnese/clientes/${C3}/consulta`, 5)).status).toBe(404);
    const nova = await request(app).post(`/collaborator/anamnese/clientes/${C3}/nova`).set(H(5)).send({});
    expect(nova.status).toBe(404);
  });
  it("o detalhe devolve clientId e identidade do cadastro; respostas digitadas antigas ficam marcadas e preservadas", async () => {
    // Evidencia legada (como no caso real): sessao antiga com nome/CPF digitados.
    const t = "f".repeat(48);
    const sid = (await q("INSERT INTO anamnese_sessions (token, client_id, mode, status, empresa_id) VALUES ($1,$2,'paciente','concluida',5) RETURNING id", [t, C2])).rows[0].id;
    await q("INSERT INTO anamnese_session_answers (session_id, question_row_id, pergunta_id, valor) VALUES ($1,1,'Q001','{\"tipo\":\"texto\",\"texto\":\"BETE BOQUETE\"}'),($1,2,'Q002','{\"tipo\":\"texto\",\"texto\":\"11122233300\"}')", [sid]);
    const d = (await get(`/collaborator/anamnese/sessions/${sid}`)).body;
    expect(d.clientId).toBe(C2);
    expect(d.identidade.nome).toBe("Cliente Sintetico Dois");
    const nome = d.respostas.find((r: any) => r.questionRowId === 1);
    expect(nome.origemCadastro).toBe(true);
    expect(nome.valor.texto).toBe("BETE BOQUETE"); // evidencia preservada
  });
});
