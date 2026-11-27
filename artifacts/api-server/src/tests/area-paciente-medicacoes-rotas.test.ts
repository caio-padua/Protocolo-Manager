/**
 * Rotas "Meus Medicamentos" da Área do Cliente — HTTP real (supertest) sobre BANCO DESCARTAVEL.
 * Nunca toca DATABASE_URL; nada envia mensagem.
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
vi.mock("@workspace/db", () => ({
  pool: { query: (...a: unknown[]) => h.pool.query(...a) },
  db: {},
}));

vi.mock("../lib/lembrete-medicacoes-recalculo", () => ({ recalcularLembreteDoCliente: async () => true }));

import router from "../routes/area-paciente-medicacoes";
import { createPortalToken } from "../lib/portal-token";
import { criarTabelasMedicacoes, registrarMedicacao, textoDeConsentimentoVigente } from "../lib/cliente-medicacoes";
import { MAPA_PERIODO } from "../lib/lembrete-periodo";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as unknown as { log: unknown }).log = { error: () => {} }; next(); });
app.use("/api", router);

const tok = (id: number) => `Bearer ${createPortalToken(id)}`;
const tokPrevia = (id: number) => `Bearer ${createPortalToken(id, { preview: true })}`;
const valido = { nome: "Vitamina D", doseValor: 2000, doseUnidade: "UI", refeicao: "com", observacao: "tomar com gordura", periodos: ["manha", "almoco"] };
const hash = () => textoDeConsentimentoVigente().hash;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgarea-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 5 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  h.pool = pool;
  await pool.query("CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT)");
  await pool.query("CREATE TABLE empresas (id SERIAL PRIMARY KEY, nome TEXT, cidade TEXT, estado TEXT)");
  await pool.query("CREATE TABLE paxcare_vinculos (id SERIAL PRIMARY KEY, client_id INT, empresa_id INT, status TEXT)");
  await pool.query("CREATE TABLE lembretes_prescricao (id SERIAL PRIMARY KEY, cliente_id INT UNIQUE, periodos JSONB NOT NULL DEFAULT '[]')");
  await pool.query("INSERT INTO clients (name) VALUES ('Sintetico 1'),('Sintetico 2')");
  await pool.query("INSERT INTO empresas (nome, cidade, estado) VALUES ('Clinica A','X','SP'),('Clinica B','Y','RJ')");
  await pool.query("INSERT INTO paxcare_vinculos (client_id, empresa_id, status) VALUES (1,1,'ativo'),(1,2,'revogado')");
  await pool.query(`INSERT INTO lembretes_prescricao (cliente_id, periodos) VALUES (1, $1)`, [JSON.stringify([
    { sigla: "IM", nome: "Início da Manhã", tipo: "tomar", formulas: [{ nome: "Formula da Clinica", dose: "1 capsula" }] },
    { sigla: "CE", nome: "Ceia", tipo: "tomar", formulas: [{ nome: "Formula da Clinica", dose: "1 capsula" }] },
    { sigla: "XX", nome: "Evitar", tipo: "nao_tomar", formulas: [{ nome: "Nao Tomar Isto" }] },
  ])]);
  await criarTabelasMedicacoes(pool);
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir.startsWith(join(tmpdir(), "pgarea-"))) rmSync(dir, { recursive: true, force: true });
});

describe("autenticacao", () => {
  it("sem token 401 em todas as rotas", async () => {
    expect((await request(app).get("/api/area-paciente/medicacoes")).status).toBe(401);
    expect((await request(app).post("/api/area-paciente/medicacoes").send(valido)).status).toBe(401);
    expect((await request(app).patch("/api/area-paciente/medicacoes/1").send({ pausada: true })).status).toBe(401);
    expect((await request(app).delete("/api/area-paciente/medicacoes/1")).status).toBe(401);
    expect((await request(app).post("/api/area-paciente/medicacoes/consentimentos").send({})).status).toBe(401);
    expect((await request(app).delete("/api/area-paciente/medicacoes/consentimentos/1")).status).toBe(401);
  });
  it("previa do administrador le mas nao escreve", async () => {
    expect((await request(app).get("/api/area-paciente/medicacoes").set("Authorization", tokPrevia(1))).status).toBe(200);
    expect((await request(app).post("/api/area-paciente/medicacoes").set("Authorization", tokPrevia(1)).send(valido)).status).toBe(401);
  });
});

describe("cadastro", () => {
  it("cria autodeclarada nao validada; servidor recusa campo de estado/origem no corpo", async () => {
    const r = await request(app).post("/api/area-paciente/medicacoes").set("Authorization", tok(1)).send(valido);
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe("nao_validada");
    for (const extra of [{ estado: "validada" }, { origem: "prescrita" }, { clientId: 2 }]) {
      expect((await request(app).post("/api/area-paciente/medicacoes").set("Authorization", tok(1)).send({ ...valido, nome: "Outro", ...extra })).status).toBe(400);
    }
  });
  it("valida dose, unidade, horarios e duplicidade", async () => {
    const post = (b: object) => request(app).post("/api/area-paciente/medicacoes").set("Authorization", tok(1)).send(b);
    expect((await post({ ...valido, nome: "A", doseValor: 0 })).status).toBe(400);
    expect((await post({ ...valido, nome: "A", doseUnidade: "litros" })).status).toBe(400);
    expect((await post({ ...valido, nome: "A", periodos: [] })).status).toBe(400);
    expect((await post({ ...valido, nome: "A", periodos: ["madrugada"] })).status).toBe(400);
    expect((await post({ ...valido, nome: "A", periodos: ["manha", "manha"] })).status).toBe(400);
    expect((await post({ ...valido, nome: "A", refeicao: "durante" })).status).toBe(400);
    expect((await post({ ...valido, nome: "vitamina d" })).status).toBe(409);
  });
});

describe("listagem separa prescritas e proprias", () => {
  it("prescritas vem do lembrete da clinica (so 'tomar'); proprias so do paciente", async () => {
    const r = await request(app).get("/api/area-paciente/medicacoes").set("Authorization", tok(1));
    expect(r.status).toBe(200);
    expect(r.body.prescritas).toHaveLength(1);
    expect(r.body.prescritas[0]).toMatchObject({ nome: "Formula da Clinica", periodos: ["Início da Manhã", "Ceia"] });
    expect(r.body.proprias.map((m: { nome: string }) => m.nome)).toEqual(["Vitamina D"]);
    expect(r.body.proprias[0].periodos).toEqual(["manha", "almoco"]);
    expect(r.body.clinicas).toHaveLength(1); // so vinculo ativo
    expect(r.body.opcoes.periodos).toHaveLength(9);
    for (const p of r.body.opcoes.periodos) expect(MAPA_PERIODO[p as keyof typeof MAPA_PERIODO]).toBeTruthy();
  });
  it("outro paciente nao ve nada do paciente 1", async () => {
    const r = await request(app).get("/api/area-paciente/medicacoes").set("Authorization", tok(2));
    expect(r.body.prescritas).toEqual([]);
    expect(r.body.proprias).toEqual([]);
    expect(r.body.clinicas).toEqual([]);
  });
});

describe("editar, pausar e excluir (anti-IDOR)", () => {
  let id = 0;
  beforeAll(async () => {
    id = (await pool.query("SELECT id FROM cliente_medicacoes WHERE client_id=1 AND nome='Vitamina D'")).rows[0].id;
  });
  it("outro paciente recebe 404 ao editar, pausar ou excluir", async () => {
    expect((await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(2)).send({ pausada: true })).status).toBe(404);
    expect((await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(2)).send({ nome: "Hack" })).status).toBe(404);
    expect((await request(app).delete(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(2))).status).toBe(404);
  });
  it("prescrita nunca pode ser alterada pelo paciente", async () => {
    const pr = await registrarMedicacao(pool, { clientId: 1, origem: "prescrita", empresaOrigemId: 1, nome: "Da Clinica", doseValor: 1, doseUnidade: "mg", periodos: ["noite"] });
    expect((await request(app).patch(`/api/area-paciente/medicacoes/${pr.id}`).set("Authorization", tok(1)).send({ pausada: true })).status).toBe(404);
    expect((await request(app).delete(`/api/area-paciente/medicacoes/${pr.id}`).set("Authorization", tok(1))).status).toBe(404);
    const lista = await request(app).get("/api/area-paciente/medicacoes").set("Authorization", tok(1));
    expect(lista.body.prescritas.map((p: { nome: string }) => p.nome)).toContain("Da Clinica");
  });
  it("editar horarios devolve uma medicacao validada para nao_validada", async () => {
    await pool.query("INSERT INTO cliente_medicacao_consentimentos (client_id, empresa_id, versao_texto, texto_hash) VALUES (1,1,'v1','x')");
    await pool.query("UPDATE cliente_medicacoes SET estado='validada', validada_por_profissional=9, validacao_empresa_id=1, validada_em=now() WHERE id=$1", [id]);
    const r = await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1)).send({ periodos: ["noite"] });
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe("nao_validada");
    expect(r.body.periodos).toEqual(["noite"]);
    const row = (await pool.query("SELECT validada_por_profissional v FROM cliente_medicacoes WHERE id=$1", [id])).rows[0];
    expect(row.v).toBeNull();
    await pool.query("DELETE FROM cliente_medicacao_consentimentos WHERE client_id=1");
  });
  it("edicao vazia ou com campo estranho e 400", async () => {
    expect((await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1)).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1)).send({ estado: "validada" })).status).toBe(400);
  });
  it("pausar mantem a validacao e retomar volta", async () => {
    const p = await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1)).send({ pausada: true });
    expect(p.body.pausada).toBe(true);
    const q = await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1)).send({ pausada: false });
    expect(q.body.pausada).toBe(false);
  });
  it("excluir e logico: some da lista e a linha continua no banco", async () => {
    expect((await request(app).delete(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1))).status).toBe(200);
    const lista = await request(app).get("/api/area-paciente/medicacoes").set("Authorization", tok(1));
    expect(lista.body.proprias).toHaveLength(0);
    expect((await pool.query("SELECT removido_em FROM cliente_medicacoes WHERE id=$1", [id])).rows[0].removido_em).not.toBeNull();
    expect((await request(app).delete(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1))).status).toBe(404);
  });
});

describe("pausada sai do lembrete", () => {
  it("itensLembreteDeMedicacoes ignora pausada", async () => {
    const { itensLembreteDeMedicacoes } = await import("../lib/cliente-medicacoes");
    const r = await request(app).post("/api/area-paciente/medicacoes").set("Authorization", tok(2)).send({ ...valido, nome: "Ômega 3" });
    await pool.query("INSERT INTO cliente_medicacao_consentimentos (client_id, empresa_id, versao_texto, texto_hash) VALUES (2,1,'v1','x')");
    await pool.query("UPDATE cliente_medicacoes SET estado='validada', validada_por_profissional=9, validacao_empresa_id=1, validada_em=now() WHERE id=$1", [r.body.id]);
    expect((await itensLembreteDeMedicacoes(pool as never, 2, "2026-11-26")).map((i) => i.nome)).toEqual(["Ômega 3"]);
    await request(app).patch(`/api/area-paciente/medicacoes/${r.body.id}`).set("Authorization", tok(2)).send({ pausada: true });
    expect(await itensLembreteDeMedicacoes(pool as never, 2, "2026-11-26")).toHaveLength(0);
    const it = (await request(app).patch(`/api/area-paciente/medicacoes/${r.body.id}`).set("Authorization", tok(2)).send({ pausada: false }));
    expect(it.status).toBe(200);
    const [item] = await itensLembreteDeMedicacoes(pool as never, 2, "2026-11-26");
    expect(item.observacaoRefeicao).toBe("Junto com a refeição");
  });
});

describe("consentimento por clinica", () => {
  it("exige vinculo ativo e hash do texto vigente; aceite e revogacao funcionam", async () => {
    const post = (b: object, t = tok(1)) => request(app).post("/api/area-paciente/medicacoes/consentimentos").set("Authorization", t).send(b);
    expect((await post({ empresaId: 2, hash: hash() })).status).toBe(404); // vinculo revogado
    expect((await post({ empresaId: 1, hash: "0".repeat(64) })).status).toBe(409);
    expect((await post({ empresaId: 1, hash: hash(), extra: 1 })).status).toBe(400);
    expect((await post({ empresaId: 1, hash: hash() })).status).toBe(201);
    expect((await post({ empresaId: 1, hash: hash() })).status).toBe(200); // idempotente
    const lista = await request(app).get("/api/area-paciente/medicacoes").set("Authorization", tok(1));
    expect(lista.body.clinicas[0].consentido).toBe(true);
    const guardado = (await pool.query("SELECT texto_hash FROM cliente_medicacao_consentimentos WHERE client_id=1 AND empresa_id=1 AND revogado_em IS NULL")).rows[0];
    expect(guardado.texto_hash).toBe(hash());
    expect((await request(app).delete("/api/area-paciente/medicacoes/consentimentos/1").set("Authorization", tok(1))).status).toBe(200);
    expect((await request(app).delete("/api/area-paciente/medicacoes/consentimentos/1").set("Authorization", tok(1))).status).toBe(404);
    const dep = await request(app).get("/api/area-paciente/medicacoes").set("Authorization", tok(1));
    expect(dep.body.clinicas[0].consentido).toBe(false);
  });
  it("paciente sem vinculo nao consegue consentir em clinica alheia", async () => {
    const r = await request(app).post("/api/area-paciente/medicacoes/consentimentos").set("Authorization", tok(2)).send({ empresaId: 1, hash: hash() });
    expect(r.status).toBe(404);
  });
});
