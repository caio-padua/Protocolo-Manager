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


import { marcarSessoesOrfas } from "../lib/anamnese-retorno";

describe("sessoes: modo, corrida, encerramento, isolamento e orfas", () => {
  it("rota publica ignora mode do corpo e nunca devolve sessao de consulta ao paciente", async () => {
    const c = await request(app).post(`/collaborator/anamnese/clientes/${C2}/nova`).set(H(5)).send({});
    expect(c.status).toBe(201);
    const consultaId = c.body.id;
    const r = await request(app).post("/anamnese-v2/sessions").send({ mode: "consulta", portalToken: createPortalToken(C2) });
    expect(r.body.mode).toBe("paciente");
    expect(r.body.id).not.toBe(consultaId);
    expect((await q("SELECT empresa_id FROM anamnese_sessions WHERE id=$1", [r.body.id])).rows[0].empresa_id).toBe(5);
    expect(r.status).toBe(201);
  });
  it("duas aberturas simultaneas do mesmo cliente resultam em um unico rascunho", async () => {
    const [a, b] = await Promise.all([abrirPaciente(C3), abrirPaciente(C3)]);
    expect(a.id).toBe(b.id);
    const n = (await q("SELECT COUNT(*)::int n FROM anamnese_sessions WHERE client_id=$1 AND status='rascunho' AND mode='paciente'", [C3])).rows[0].n;
    expect(n).toBe(1);
  });
  it("sessao encerrada nao aceita resposta, recusa nem observacao; autoria de nota nao vem do corpo", async () => {
    const s = await abrirPaciente(C1);
    const nota = await request(app).post(`/anamnese-v2/sessions/${s.token}/notes`).send({ grupo: "E", observacao: "teste", autorProfId: 999 });
    expect(nota.body.autorProfId).toBeNull();
    expect((await concluir(s.token)).status).toBe(200);
    expect((await responder(s.token, 50, valor({ tipo: "texto", texto: "x" }))).status).toBe(409);
    expect((await request(app).post(`/anamnese-v2/sessions/${s.token}/refusals`).send({ escopo: "bloco", alvo: "F" })).status).toBe(409);
    expect((await request(app).post(`/anamnese-v2/sessions/${s.token}/notes`).send({ grupo: "E", observacao: "tarde" })).status).toBe(409);
  });
  it("isolamento: token de um paciente nao abre sessao de outro e fatos nao vazam entre clientes nem clinicas", async () => {
    const a = await abrirPaciente(C1);
    expect((await request(app).get(`/anamnese-v2/sessions/${a.token.slice(0, -2)}xx`)).status).toBe(404);
    const novo = await abrirPaciente(C3);
    const st = (await request(app).get(`/anamnese-v2/sessions/${novo.token}`)).body;
    expect(Object.keys(st.retorno.bloqueados)).toHaveLength(0);
    expect(st.retorno.identidade.nome).toBe("Cliente Sintetico Tres");
    expect((await get(`/collaborator/anamnese/sessions/${a.id}/motor`, 6)).status).toBe(404);
  });
  it("orfas: so rascunho anonimo, vazio e parado e marcado; nada e apagado; com resposta e com cliente ficam", async () => {
    const mk = async (cliente: number | null, dias: number, comResposta: boolean) => {
      const id = (await q("INSERT INTO anamnese_sessions (token, client_id, mode, started_at, last_seen_at) VALUES ($1,$2,'paciente', now() - ($3||' days')::interval, now() - ($3||' days')::interval) RETURNING id", [Math.random().toString(36) + Date.now(), cliente, String(dias)])).rows[0].id;
      if (comResposta) await q("INSERT INTO anamnese_session_answers (session_id, question_row_id, valor) VALUES ($1,50,'{\"tipo\":\"texto\",\"texto\":\"x\"}')", [id]);
      return id as number;
    };
    const velhaVazia = await mk(null, 30, false), recente = await mk(null, 1, false), velhaComResp = await mk(null, 30, true);
    const total = (await q("SELECT COUNT(*)::int n FROM anamnese_sessions")).rows[0].n;
    expect(await marcarSessoesOrfas(7)).toBeGreaterThanOrEqual(1);
    const st = async (id: number) => (await q("SELECT status FROM anamnese_sessions WHERE id=$1", [id])).rows[0].status;
    expect(await st(velhaVazia)).toBe("abandonada");
    expect(await st(recente)).toBe("rascunho");
    expect(await st(velhaComResp)).toBe("rascunho");
    expect((await q("SELECT COUNT(*)::int n FROM anamnese_sessions")).rows[0].n).toBe(total);
    expect(await marcarSessoesOrfas(7)).toBe(0); // idempotente
  });
});
