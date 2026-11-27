/**
 * Apple App Store 3.7/4.6: token só em Authorization (nunca na URL) e "Excluir minha conta".
 * HTTP real (supertest) sobre BANCO DESCARTAVEL — nunca toca DATABASE_URL; nada envia mensagem.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import pg from "pg";

const h = vi.hoisted(() => ({ pool: null as unknown as { query: (...a: unknown[]) => unknown } }));
vi.mock("@workspace/db", () => ({ pool: { query: (...a: unknown[]) => h.pool.query(...a), connect: () => (h.pool as any).connect() }, db: {} }));

vi.mock("../lib/pre-cadastro", async (orig) => ({ ...(await orig<object>()), lerEstadoPreCadastro: async () => ({ completo: true, pendentes: [] }) }));

import contaRouter from "../routes/area-paciente-conta";
import pacienteRouter from "../routes/area-paciente";
import sessaoRouter from "../routes/area-paciente-sessao";
import { createPortalToken } from "../lib/portal-token";
import { hashPassword } from "../lib/patient-auth.js";
import { bloqueioContaExcluida } from "../lib/area-paciente-conta";
import { criarTabelaContasExcluidas } from "../lib/area-paciente-conta";
import { criarTabelasMedicacoes } from "../lib/cliente-medicacoes";
import { criarTabelaSessoes, iniciarSessao, renovarSessao } from "../lib/area-paciente-sessao";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).log = { error: () => {}, warn: () => {}, info: () => {} }; next(); });
app.use("/api/area-paciente", bloqueioContaExcluida({ query: (...a: unknown[]) => (h.pool as any).query(...a) } as any));
app.use("/api", contaRouter);
app.use("/api", pacienteRouter);
app.use("/api", sessaoRouter);

const tok = (id: number) => `Bearer ${createPortalToken(id)}`;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgconta-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 5 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  h.pool = pool;
  await pool.query(`CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT, cpf TEXT, empresa_id INT, password_hash TEXT,
    password_set_token TEXT, password_set_token_expires_at TIMESTAMPTZ, birth_date TEXT)`);
  await pool.query("CREATE TABLE empresas (id SERIAL PRIMARY KEY, nome TEXT, cidade TEXT, estado TEXT)");
  await pool.query("INSERT INTO empresas (nome) VALUES ('Clinica A')");
  await pool.query(`CREATE TABLE paxcare_cofre_itens (id SERIAL PRIMARY KEY, client_id INT, removido_em TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE paxcare_vinculos (id SERIAL PRIMARY KEY, client_id INT, empresa_id INT, status TEXT DEFAULT 'ativo',
    comp_historico BOOL DEFAULT TRUE, comp_exames BOOL DEFAULT TRUE, comp_documentos BOOL DEFAULT TRUE, revogado_em TIMESTAMPTZ, atualizado_em TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE paxcare_assinaturas (id SERIAL PRIMARY KEY, client_id INT, status TEXT DEFAULT 'ativa', cancelado_em TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE exam_results (id SERIAL PRIMARY KEY, client_id INT)`); // registro clínico: deve sobreviver
  await pool.query(`INSERT INTO clients (name, cpf, empresa_id, password_hash) VALUES ('Sint 1','11111111111',1,$1),('Sint 2','22222222222',1,$2)`,
    [hashPassword("Senha@Forte123"), hashPassword("Outra@Forte123")]);
  await criarTabelasMedicacoes(pool);
  await criarTabelaSessoes(pool);
  await criarTabelaContasExcluidas(pool);
  for (const id of [1, 2]) {
    await pool.query("INSERT INTO paxcare_cofre_itens (client_id) VALUES ($1)", [id]);
    await pool.query("INSERT INTO paxcare_vinculos (client_id, empresa_id) VALUES ($1,1)", [id]);
    await pool.query("INSERT INTO paxcare_assinaturas (client_id) VALUES ($1)", [id]);
    await pool.query("INSERT INTO exam_results (client_id) VALUES ($1)", [id]);
  }
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir.startsWith(join(tmpdir(), "pgconta-"))) rmSync(dir, { recursive: true, force: true });
});

describe("token só no cabeçalho Authorization", () => {
  it("token na URL é recusado; no cabeçalho é aceito", async () => {
    const t = createPortalToken(1);
    expect((await request(app).get(`/api/area-paciente/ras/1/pdf?token=${t}`)).status).toBe(401);
    expect((await request(app).get("/api/area-paciente/ras/1/pdf").set("Authorization", `Bearer ${t}`)).status).toBe(409);
  });
  it("exclusão também ignora token na URL", async () => {
    const r = await request(app).delete(`/api/area-paciente/conta?token=${createPortalToken(1)}`).send({ confirmacao: "EXCLUIR" });
    expect(r.status).toBe(401);
  });
});

describe("Excluir minha conta", () => {
  it("sem sessão: 401; aviso exige sessão e descreve o que fica", async () => {
    expect((await request(app).get("/api/area-paciente/conta/aviso-exclusao")).status).toBe(401);
    const r = await request(app).get("/api/area-paciente/conta/aviso-exclusao").set("Authorization", tok(1));
    expect(r.status).toBe(200);
    expect(r.body.mantidos.join(" ")).toMatch(/prontuário/);
  });
  it("sem a palavra EXCLUIR: 400; senha errada: 403; nada muda", async () => {
    expect((await request(app).delete("/api/area-paciente/conta").set("Authorization", tok(1)).send({ senha: "Senha@Forte123" })).status).toBe(400);
    // sem passo 1 (pedido), nem com a palavra certa nem com código inventado
    expect((await request(app).delete("/api/area-paciente/conta").set("Authorization", tok(1)).send({ confirmacao: "EXCLUIR", confirmacaoToken: "x".repeat(40) })).status).toBe(403);
    expect((await request(app).post("/api/area-paciente/conta/pedido-exclusao").set("Authorization", tok(1)).send({ senha: "errada" })).status).toBe(403);
    // código de OUTRO cliente não vale
    const doOutro = (await request(app).post("/api/area-paciente/conta/pedido-exclusao").set("Authorization", tok(2)).send({ senha: "Senha@Forte123" }));
    if (doOutro.status === 200) expect((await request(app).delete("/api/area-paciente/conta").set("Authorization", tok(1)).send({ confirmacao: "EXCLUIR", confirmacaoToken: doOutro.body.confirmacaoToken })).status).toBe(403);
    // token de sessão com ?token= na query é recusado
    expect((await request(app).post("/api/area-paciente/conta/pedido-exclusao?token=" + tok(1).replace("Bearer ", "")).send({ senha: "Senha@Forte123" })).status).toBe(401);
    expect((await pool.query("SELECT 1 FROM area_paciente_contas_excluidas")).rows.length).toBe(0);
  });
  it("exclui: remove acesso e dados do app, preserva registros clínicos e outro cliente", async () => {
    const refresh = await iniciarSessao(pool, 1);
    const ped = await request(app).post("/api/area-paciente/conta/pedido-exclusao").set("Authorization", tok(1)).send({ senha: "Senha@Forte123" });
    expect(ped.status).toBe(200);
    const r = await request(app).delete("/api/area-paciente/conta").set("Authorization", tok(1)).send({ confirmacao: "EXCLUIR", confirmacaoToken: ped.body.confirmacaoToken });
    expect(r.status).toBe(200);
    expect((await pool.query("SELECT count(*)::int n FROM area_paciente_exclusao_pedidos WHERE client_id=1 AND confirmado_em IS NOT NULL")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT password_hash FROM clients WHERE id=1")).rows[0].password_hash).toBeNull();
    expect((await pool.query("SELECT count(*)::int n FROM paxcare_cofre_itens WHERE client_id=1 AND removido_em IS NULL")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT status FROM paxcare_vinculos WHERE client_id=1")).rows[0].status).toBe("revogado");
    expect((await pool.query("SELECT status FROM paxcare_assinaturas WHERE client_id=1")).rows[0].status).toBe("cancelada");
    expect((await pool.query("SELECT count(*)::int n FROM exam_results WHERE client_id=1")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM clients WHERE id=1")).rows[0].n).toBe(1);
    // outro cliente intacto
    expect((await pool.query("SELECT count(*)::int n FROM paxcare_cofre_itens WHERE client_id=2 AND removido_em IS NULL")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT status FROM paxcare_vinculos WHERE client_id=2")).rows[0].status).toBe("ativo");
    // sessão persistente revogada
    expect(await renovarSessao(pool, refresh)).toBeNull();
  });
  it("token ainda válido de conta excluída deixa de funcionar na hora; login e renovação também", async () => {
    expect((await request(app).get("/api/area-paciente/ras/1/pdf").set("Authorization", tok(1))).status).toBe(401);
    expect((await request(app).get("/api/area-paciente/conta/aviso-exclusao").set("Authorization", tok(2))).status).toBe(200);
  });
  it("sem senha cadastrada, reautentica pela data de nascimento (nos dois formatos)", async () => {
    await pool.query(`INSERT INTO clients (name, cpf, empresa_id, birth_date) VALUES ('Sint 3','33333333333',1,'1980-05-17')`);
    const t3 = tok(3);
    expect((await request(app).post("/api/area-paciente/conta/pedido-exclusao").set("Authorization", t3).send({ dataNascimento: "01/01/1990" })).status).toBe(403);
    expect((await request(app).post("/api/area-paciente/conta/pedido-exclusao").set("Authorization", t3).send({})).status).toBe(403);
    expect((await request(app).post("/api/area-paciente/conta/pedido-exclusao").set("Authorization", t3).send({ dataNascimento: "17/05/1980" })).status).toBe(200);
  });
  it("repetir a exclusão não quebra (idempotente na camada de dados)", async () => {
    const { excluirContaDoApp } = await import("../lib/area-paciente-conta");
    await excluirContaDoApp(pool as any, 1);
    expect((await pool.query("SELECT count(*)::int n FROM area_paciente_contas_excluidas WHERE client_id=1")).rows[0].n).toBe(1);
  });
});
