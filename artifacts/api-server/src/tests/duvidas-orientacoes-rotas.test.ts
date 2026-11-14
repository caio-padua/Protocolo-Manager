/** Rotas de Dúvidas e Orientações com SQL real em BANCO DESCARTÁVEL. Dados sintéticos. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const h = vi.hoisted(() => ({ db: null as any, enviados: [] as { chat: string; texto: string }[], settings: {} as Record<string, string> }));
vi.mock("@workspace/db", () => ({ db: { execute: (...a: unknown[]) => h.db.execute(...a) } }));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: {} }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: async (k: string) => h.settings[k] ?? null }));
vi.mock("../lib/telegram", () => ({ sendTelegram: async (chat: string, texto: string) => { h.enviados.push({ chat, texto }); return { sent: true, mock: false }; } }));
vi.mock("../lib/telegram-config", () => ({ chatAlertaOuNull: async () => "ALERTA" }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: () => ({ headers: {} }) }));

import express from "express";
import request from "supertest";
import { aplicarMigracaoAtendimento } from "../lib/atendimento-telegram-store";
import router from "../routes/duvidas-orientacoes";
import { createCollaboratorToken } from "../lib/collaborator-auth";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = ""; let proc: ChildProcess | null = null; let pool: pg.Pool;
const app = express(); app.use(express.json()); app.use(router);
const tk = (id: number, v = 0) => `Bearer ${createCollaboratorToken({ professionalId: id, role: "x", credentialVersion: v })}`;
const MEDICO5 = tk(1), ENF5 = tk(2), MEDICO7 = tk(3), INATIVO = tk(4), VERSAO_VELHA = tk(1, 9);

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgduv-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=60"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 10 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  await pool.query(`
    CREATE TABLE empresas (id INTEGER PRIMARY KEY, ativa BOOLEAN, status TEXT);
    CREATE TABLE professionals (id INTEGER PRIMARY KEY, empresa_id INTEGER, active BOOLEAN, credential_version INTEGER DEFAULT 0, professional_type TEXT);
    CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT, empresa_id INTEGER);
    INSERT INTO empresas VALUES (5,true,'ATIVO'),(7,true,'ATIVO');
    INSERT INTO professionals VALUES (1,5,true,0,'medico'),(2,5,true,0,'enfermeira'),(3,7,true,0,'medico'),(4,5,false,0,'medico');
    INSERT INTO clients VALUES (10,'Paciente 5',5),(20,'Paciente 7',7);
    CREATE TABLE telegram_inbox_messages (id SERIAL PRIMARY KEY, empresa_id INTEGER, cliente_id INTEGER, chat_id TEXT, texto TEXT, recebida_em TIMESTAMPTZ, lida_em TIMESTAMPTZ, direcao TEXT);`);
  h.db = drizzle(pool);
  await aplicarMigracaoAtendimento(h.db);
}, 60000);
afterAll(async () => { await pool?.end(); proc?.kill("SIGTERM"); if (dir) rmSync(dir, { recursive: true, force: true }); });

const corpo = { tema: "Jejum antes do exame", perguntasExemplo: "quantas horas de jejum", resposta: "Faça jejum de 8 horas antes da coleta." };

describe("autenticação", () => {
  it("sem token, profissional inativo e versão de credencial antiga = 401", async () => {
    expect((await request(app).get("/duvidas-orientacoes")).status).toBe(401);
    expect((await request(app).get("/duvidas-orientacoes").set("Authorization", INATIVO)).status).toBe(401);
    expect((await request(app).get("/duvidas-orientacoes").set("Authorization", VERSAO_VELHA)).status).toBe(401);
  });
});

describe("cadastro e aprovação", () => {
  let id = 0;
  it("enfermagem cria rascunho, mas NÃO aprova; rascunho não aparece como aprovado", async () => {
    const c = await request(app).post("/duvidas-orientacoes").set("Authorization", ENF5).send(corpo);
    expect(c.status).toBe(201); id = c.body.id;
    expect((await request(app).post(`/duvidas-orientacoes/${id}/aprovar`).set("Authorization", ENF5)).status).toBe(403);
    const l = await request(app).get("/duvidas-orientacoes").set("Authorization", ENF5);
    expect(l.body.podeAprovar).toBe(false);
    expect(l.body.orientacoes[0].status).toBe("rascunho");
  });
  it("médico de OUTRA empresa não enxerga nem aprova", async () => {
    expect((await request(app).get("/duvidas-orientacoes").set("Authorization", MEDICO7)).body.orientacoes).toEqual([]);
    expect((await request(app).post(`/duvidas-orientacoes/${id}/aprovar`).set("Authorization", MEDICO7)).status).toBe(404);
    expect((await request(app).put(`/duvidas-orientacoes/${id}`).set("Authorization", MEDICO7).send(corpo)).status).toBe(404);
    expect((await request(app).post(`/duvidas-orientacoes/${id}/inativar`).set("Authorization", MEDICO7)).status).toBe(404);
  });
  it("médico aprova; editar o texto derruba a aprovação", async () => {
    expect((await request(app).post(`/duvidas-orientacoes/${id}/aprovar`).set("Authorization", MEDICO5)).status).toBe(200);
    const r = await pool.query(`SELECT status, aprovado_por FROM orientacoes_aprovadas WHERE id=${id}`);
    expect(r.rows[0]).toEqual({ status: "aprovada", aprovado_por: 1 });
    const e = await request(app).put(`/duvidas-orientacoes/${id}`).set("Authorization", ENF5).send({ ...corpo, resposta: "Texto novo alterado pela enfermagem." });
    expect(e.body.status).toBe("rascunho");
    const r2 = await pool.query(`SELECT status, aprovado_por FROM orientacoes_aprovadas WHERE id=${id}`);
    expect(r2.rows[0]).toEqual({ status: "rascunho", aprovado_por: null });
  });
  it("validação do corpo", async () => {
    expect((await request(app).post("/duvidas-orientacoes").set("Authorization", MEDICO5).send({ ...corpo, resposta: "curta" })).status).toBe(400);
    expect((await request(app).post("/duvidas-orientacoes").set("Authorization", MEDICO5).send({ ...corpo, tema: "" })).status).toBe(400);
  });
});

describe("assumir e devolver atendimento", () => {
  it("entregas pendentes exigem autenticação e isolam inbox/cliente pela clínica",async()=>{
    await pool.query(`INSERT INTO telegram_inbox_messages(id,empresa_id,cliente_id,chat_id,texto,direcao) VALUES
      (100,5,10,'TESTE5','SINTÉTICA','entrada'),(101,7,20,'TESTE7','SINTÉTICA','entrada'),
      (102,5,20,'TESTE-MALFORMADO','SINTÉTICA','entrada');
      INSERT INTO telegram_atendimento_respostas(inbox_message_id,estado,ultimo_erro) VALUES
      (100,'incerto','resultado_desconhecido'),(101,'esgotado','telegram_http_403'),(102,'falhou','destino_ausente')`);
    const path="/duvidas-orientacoes/atendimento/estado";
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).set("Authorization",VERSAO_VELHA)).status).toBe(401);
    const r5=await request(app).get(path).set("Authorization",MEDICO5);
    expect(r5.status).toBe(200);expect(r5.body.pendencias.map((p:any)=>p.mensagemId)).toEqual([100]);
    const r7=await request(app).get(path).set("Authorization",MEDICO7);
    expect(r7.body.pendencias.map((p:any)=>p.mensagemId)).toEqual([101]);
  });
  it("clínica 5 não mexe em paciente da clínica 7", async () => {
    expect((await request(app).post("/duvidas-orientacoes/atendimento/20/assumir").set("Authorization", MEDICO5)).status).toBe(404);
    expect((await request(app).post("/duvidas-orientacoes/atendimento/20/devolver-ia").set("Authorization", MEDICO5)).status).toBe(404);
  });
  it("assumir pausa, estado lista, devolver retoma", async () => {
    expect((await request(app).post("/duvidas-orientacoes/atendimento/10/assumir").set("Authorization", ENF5)).status).toBe(200);
    const e = await request(app).get("/duvidas-orientacoes/atendimento/estado").set("Authorization", MEDICO5);
    expect(e.body.emAtendimentoHumano.map((x: any) => x.clienteId)).toEqual([10]);
    expect(e.body.modoIA).toBe("desligado");
    expect((await request(app).post("/duvidas-orientacoes/atendimento/10/devolver-ia").set("Authorization", MEDICO5)).status).toBe(200);
    expect((await request(app).get("/duvidas-orientacoes/atendimento/estado").set("Authorization", MEDICO5)).body.emAtendimentoHumano).toEqual([]);
  });
});

describe("categorias, texto longo e marcadores", () => {
  let id = 0;
  it("registro antigo (sem categoria) é preservado; categoria inválida é recusada", async () => {
    await pool.query(`INSERT INTO orientacoes_aprovadas(empresa_id,tema,resposta) VALUES (5,'Antigo sem categoria','Texto antigo preservado sem categoria.')`);
    const l = await request(app).get("/duvidas-orientacoes").set("Authorization", MEDICO5);
    const antigo = l.body.orientacoes.find((o: any) => o.tema === "Antigo sem categoria");
    expect(antigo.categoria).toBeNull(); expect(antigo.subcategoria).toBeNull();
    expect(l.body.categorias.agendamento.sub.horarios).toBeTruthy();
    expect((await request(app).post("/duvidas-orientacoes").set("Authorization", MEDICO5).send({ ...corpo, categoria: "inventada" })).status).toBe(400);
    expect((await request(app).post("/duvidas-orientacoes").set("Authorization", MEDICO5).send({ ...corpo, categoria: "agendamento", subcategoria: "valores" })).status).toBe(400);
    expect((await request(app).post("/duvidas-orientacoes").set("Authorization", MEDICO5).send({ ...corpo, subcategoria: "valores" })).status).toBe(400);
  });
  it("salva texto longo com quebras e emojis, reabre idêntico e sem corte; acima do limite recusa", async () => {
    const longo = Array.from({ length: 60 }, (_, i) => `Parágrafo ${i + 1} ☺️ com acento.`).join("\n\n");
    expect(longo.length).toBeGreaterThan(1500);
    const c = await request(app).post("/duvidas-orientacoes").set("Authorization", ENF5).send({ ...corpo, resposta: longo, categoria: "apresentacao", subcategoria: "primeiro_contato" });
    expect(c.status).toBe(201); id = c.body.id;
    const r = await pool.query(`SELECT resposta, categoria, subcategoria, status FROM orientacoes_aprovadas WHERE id=${id}`);
    expect(r.rows[0]).toEqual({ resposta: longo, categoria: "apresentacao", subcategoria: "primeiro_contato", status: "rascunho" });
    const crlf = await request(app).post("/duvidas-orientacoes").set("Authorization", ENF5).send({ ...corpo, resposta: "Olá!\r\n\r\nTudo bem?" });
    const r2 = await pool.query(`SELECT resposta FROM orientacoes_aprovadas WHERE id=${crlf.body.id}`);
    expect(r2.rows[0].resposta).toBe("Olá!\n\nTudo bem?");
    expect((await request(app).post("/duvidas-orientacoes").set("Authorization", ENF5).send({ ...corpo, resposta: "x".repeat(4001) })).status).toBe(400);
  });
  it("marcador pendente bloqueia aprovação; trocar só a categoria NÃO derruba aprovação; trocar texto derruba", async () => {
    const m = await request(app).post("/duvidas-orientacoes").set("Authorization", ENF5).send({ ...corpo, resposta: "Olá, [nome]! Tudo bem?" });
    expect((await request(app).post(`/duvidas-orientacoes/${m.body.id}/aprovar`).set("Authorization", MEDICO5)).status).toBe(422);
    expect((await pool.query(`SELECT status FROM orientacoes_aprovadas WHERE id=${m.body.id}`)).rows[0].status).toBe("rascunho");
    expect((await request(app).post(`/duvidas-orientacoes/${id}/aprovar`).set("Authorization", MEDICO5)).status).toBe(200);
    const so = await request(app).put(`/duvidas-orientacoes/${id}`).set("Authorization", ENF5).send({ ...corpo, resposta: (await pool.query(`SELECT resposta FROM orientacoes_aprovadas WHERE id=${id}`)).rows[0].resposta, categoria: "gerais", subcategoria: "locais" });
    expect(so.body.status).toBe("aprovada");
    expect((await pool.query(`SELECT categoria FROM orientacoes_aprovadas WHERE id=${id}`)).rows[0].categoria).toBe("gerais");
    const sem = await request(app).put(`/duvidas-orientacoes/${id}`).set("Authorization", ENF5).send({ ...corpo, resposta: (await pool.query(`SELECT resposta FROM orientacoes_aprovadas WHERE id=${id}`)).rows[0].resposta });
    expect((await pool.query(`SELECT categoria FROM orientacoes_aprovadas WHERE id=${id}`)).rows[0].categoria).toBe("gerais"); // campo ausente mantém
    expect(sem.body.status).toBe("aprovada");
    const txt = await request(app).put(`/duvidas-orientacoes/${id}`).set("Authorization", ENF5).send({ ...corpo, resposta: "Texto diferente agora." });
    expect(txt.body.status).toBe("rascunho");
  });
});

describe("tom de voz por clínica", () => {
  const T = "/duvidas-orientacoes/tom-de-voz";
  it("exige login; sem registro devolve nulo; enfermagem salva rascunho e não aprova; médico aprova", async () => {
    expect((await request(app).get(T)).status).toBe(401);
    expect((await request(app).get(T).set("Authorization", MEDICO5)).body.tom).toBeNull();
    expect((await request(app).put(T).set("Authorization", ENF5).send({ texto: "curto" })).status).toBe(400);
    const p = await request(app).put(T).set("Authorization", ENF5).send({ texto: "Tom elegante e acolhedor.\r\n\r\nFrases curtas." });
    expect(p.body.status).toBe("rascunho");
    expect((await request(app).get(T).set("Authorization", ENF5)).body.tom.texto).toBe("Tom elegante e acolhedor.\n\nFrases curtas.");
    expect((await request(app).post(`${T}/aprovar`).set("Authorization", ENF5)).status).toBe(403);
    expect((await request(app).post(`${T}/aprovar`).set("Authorization", MEDICO5)).status).toBe(200);
    expect((await request(app).get(T).set("Authorization", MEDICO5)).body.tom.status).toBe("aprovada");
  });
  it("salvar o mesmo texto mantém aprovação; texto novo volta a rascunho", async () => {
    const igual = await request(app).put(T).set("Authorization", ENF5).send({ texto: "Tom elegante e acolhedor.\n\nFrases curtas." });
    expect(igual.body.status).toBe("aprovada");
    const novo = await request(app).put(T).set("Authorization", ENF5).send({ texto: "Tom alterado pela enfermagem." });
    expect(novo.body.status).toBe("rascunho");
  });
  it("clínica 7 não vê nem aprova o tom da clínica 5", async () => {
    expect((await request(app).get(T).set("Authorization", MEDICO7)).body.tom).toBeNull();
    expect((await request(app).post(`${T}/aprovar`).set("Authorization", MEDICO7)).status).toBe(404);
    await request(app).put(T).set("Authorization", MEDICO7).send({ texto: "Tom próprio da clínica sete." });
    expect((await request(app).get(T).set("Authorization", MEDICO5)).body.tom.texto).toBe("Tom alterado pela enfermagem.");
  });
});
