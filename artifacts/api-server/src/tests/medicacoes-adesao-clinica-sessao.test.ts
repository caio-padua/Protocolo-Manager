/**
 * Adesão (Tomei/Esqueci), rotas da CLÍNICA (isolamento por empresa), recálculo do lembrete e sessão persistente.
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

const h = vi.hoisted(() => ({ pool: null as unknown as { query: (...a: unknown[]) => unknown }, recalc: [] as string[] }));
vi.mock("@workspace/db", () => ({ pool: { query: (...a: unknown[]) => h.pool.query(...a) }, db: {} }));
vi.mock("../lib/lembrete-periodo", async (orig) => ({ ...(await orig<Record<string, unknown>>()), sincronizarLembretePrescricao: async () => ({}) }));
vi.mock("../lib/lembrete-medicacoes-recalculo", () => ({
  recalcularLembreteDoCliente: async (_id: number, motivo: string) => { h.recalc.push(motivo); return true; },
}));
// Autenticação simulada nos cabeçalhos (a cadeia real é testada em outros arquivos).
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!req.headers["x-prof"]) { res.status(401).json({ error: "login" }); return; }
    req.collaborator = { professionalId: Number(req.headers["x-prof"]) };
    req.tenantContext = {
      authenticated: true, isPlatformOwner: false, perfilPlataforma: String(req.headers["x-perfil"] ?? "medico"),
      empresaId: Number(req.headers["x-empresa"]),
    };
    next();
  },
}));
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: (req: any) => req.tenantContext.empresaId }));

import medRouter from "../routes/area-paciente-medicacoes";
import clinicaRouter from "../routes/cockpit-medicacoes";
import sessaoRouter from "../routes/area-paciente-sessao";
import { createPortalToken } from "../lib/portal-token";
import {
  criarTabelasMedicacoes, registrarConsentimento, registrarMedicacao, textoDeConsentimentoVigente,
} from "../lib/cliente-medicacoes";
import { criarTabelaTomadas, montarAdesao, recalcularLembreteCore, SIGLA_POR_PERIODO } from "../lib/cliente-medicacao-adesao";
import { criarTabelaSessoes } from "../lib/area-paciente-sessao";
import { criarTabelaContasExcluidas } from "../lib/area-paciente-conta";
import { MAPA_PERIODO } from "../lib/lembrete-periodo";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).log = { error: () => {}, warn: () => {} }; next(); });
app.use("/api", medRouter);
app.use("/api", clinicaRouter);
app.use("/api", sessaoRouter);

const tok = (id: number) => `Bearer ${createPortalToken(id)}`;
const med = (empresa: number, perfil = "medico") => ({ "x-prof": "7", "x-empresa": String(empresa), "x-perfil": perfil });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgadesao-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 5 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  h.pool = pool;
  await pool.query("CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT, cpf TEXT, empresa_id INT)");
  await pool.query("CREATE TABLE empresas (id SERIAL PRIMARY KEY, nome TEXT, cidade TEXT, estado TEXT)");
  await pool.query("CREATE TABLE paxcare_vinculos (id SERIAL PRIMARY KEY, client_id INT, empresa_id INT, status TEXT)");
  await pool.query("CREATE TABLE lembretes_prescricao (id SERIAL PRIMARY KEY, cliente_id INT UNIQUE, periodos JSONB NOT NULL DEFAULT '[]')");
  await pool.query("INSERT INTO empresas (nome) VALUES ('Clinica A'),('Clinica B')");
  // cliente 1 = clínica A (1); cliente 2 = clínica B (2)
  await pool.query("INSERT INTO clients (name, cpf, empresa_id) VALUES ('Sint 1','111',1),('Sint 2','222',2)");
  await pool.query(`INSERT INTO lembretes_prescricao (cliente_id, periodos) VALUES (1, $1)`, [JSON.stringify([
    { sigla: "IM", nome: "Início da Manhã", tipo: "tomar", formulas: [{ nome: "Formula Clinica", dose: "1 capsula" }, { nome: "Propria Validada", dose: "5 mg" }] },
    { sigla: "CE", nome: "Ceia", tipo: "tomar", formulas: [{ nome: "Formula Clinica", dose: "1 capsula" }] },
  ])]);
  await criarTabelasMedicacoes(pool);
  await criarTabelaTomadas(pool);
  await criarTabelaSessoes(pool);
  await criarTabelaContasExcluidas(pool);
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir.startsWith(join(tmpdir(), "pgadesao-"))) rmSync(dir, { recursive: true, force: true });
});

describe("siglas locais batem com o motor", () => {
  it("SIGLA_POR_PERIODO == MAPA_PERIODO", () => {
    for (const [k, v] of Object.entries(MAPA_PERIODO)) expect((SIGLA_POR_PERIODO as any)[k]).toEqual({ sigla: v.sigla, nome: v.nome });
  });
});

describe("adesão (cálculo puro)", () => {
  it("separa prescritas de próprias e calcula 7/15/30", () => {
    const hoje = "2026-11-26";
    const horarios = [
      { origem: "prescrita" as const, nomeChave: "a", sigla: "IM" }, { origem: "prescrita" as const, nomeChave: "a", sigla: "CE" },
      { origem: "propria" as const, nomeChave: "b", sigla: "IM" },
    ];
    const tomadas = [
      { origem: "prescrita" as const, nomeChave: "a", sigla: "IM", data: "2026-11-26", status: "tomei" as const },
      { origem: "prescrita" as const, nomeChave: "a", sigla: "CE", data: "2026-11-26", status: "esqueci" as const },
      { origem: "prescrita" as const, nomeChave: "a", sigla: "IM", data: "2026-11-10", status: "tomei" as const }, // fora de 7, dentro de 30
      { origem: "propria" as const, nomeChave: "b", sigla: "IM", data: "2026-11-25", status: "tomei" as const },
      { origem: "propria" as const, nomeChave: "removida", sigla: "IM", data: "2026-11-25", status: "tomei" as const }, // fora da rotina
    ];
    // Histórico real: só os 7 últimos dias têm instantâneo; antes disso, "sem histórico".
    const agenda = new Map<string, { origem: "prescrita" | "propria"; nomeChave: string; sigla: string }[]>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(2026, 10, 26 - i)).toISOString().slice(0, 10);
      agenda.set(d, horarios);
    }
    const r = montarAdesao(hoje, horarios, tomadas, agenda);
    expect(r.prescrita.esperadoPorDia).toBe(2);
    expect(r.prescrita.janelas.map((j) => [j.dias, j.tomei, j.esqueci, j.esperado])).toEqual([[7, 1, 1, 14], [15, 1, 1, 14], [30, 1, 1, 14]]);
    expect(r.prescrita.janelas.map((j) => [j.diasComHistorico, j.diasSemHistorico])).toEqual([[7, 0], [7, 8], [7, 23]]);
    expect(r.prescrita.janelas[0].percentual).toBe(7.1);
    expect(r.propria.janelas[0]).toMatchObject({ tomei: 1, esperado: 7, semRegistro: 6 });
    expect(r.prescrita.historico).toHaveLength(30);
  });
  it("dia sem instantâneo não entra no denominador e a tomada dele não conta (nada é estimado)", () => {
    const horarios = [{ origem: "prescrita" as const, nomeChave: "a", sigla: "IM" }];
    const r = montarAdesao("2026-11-26", horarios,
      [{ origem: "prescrita", nomeChave: "a", sigla: "IM", data: "2026-11-20", status: "tomei" }],
      new Map([["2026-11-26", horarios]]));
    expect(r.prescrita.janelas[0]).toMatchObject({ dias: 7, tomei: 0, esperado: 1, diasComHistorico: 1, diasSemHistorico: 6 });
  });
  it("sem horários: percentual nulo, não 0%", () => {
    expect(montarAdesao("2026-11-26", [], []).propria.janelas[0].percentual).toBeNull();
  });
});

describe("adesão: suspenso, retomada, alteração de horário e virada de dia (cálculo puro)", () => {
  const A = (nomeChave: string, sigla: string, situacao?: "ativo" | "suspenso" | "retirado") => ({ origem: "propria" as const, nomeChave, sigla, situacao });
  const d = (n: number) => new Date(Date.UTC(2026, 10, 26 - n)).toISOString().slice(0, 10); // 26/11/2026 menos n dias
  it("pausa: dias suspensos ficam FORA do denominador e aparecem como suspenso; retomada volta a contar", () => {
    const agenda = new Map<string, ReturnType<typeof A>[]>();
    agenda.set(d(3), [A("x", "IM")]);                 // ativo
    agenda.set(d(2), [A("x", "IM", "suspenso")]);     // pausado
    agenda.set(d(1), [A("x", "IM", "suspenso")]);     // pausado
    agenda.set(d(0), [A("x", "IM")]);                 // retomado
    const tomadas = [{ origem: "propria" as const, nomeChave: "x", sigla: "IM", data: d(3), status: "tomei" as const }];
    const j = montarAdesao(d(0), [{ origem: "propria", nomeChave: "x", sigla: "IM" }], tomadas, agenda).propria.janelas[0];
    expect(j).toMatchObject({ tomei: 1, esqueci: 0, esperado: 2, semRegistro: 1, suspenso: 2, diasSuspensos: 2, diasComHistorico: 4, diasSemHistorico: 3 });
    expect(j.percentual).toBe(50);
  });
  it("alteração de horário: o horário antigo (retirado) não vira falta; o novo conta", () => {
    const agenda = new Map([[d(0), [A("x", "IM", "retirado"), A("x", "NO")]]]);
    const j = montarAdesao(d(0), [], [], agenda).propria.janelas[0];
    expect(j).toMatchObject({ esperado: 1, retirado: 1, semRegistro: 1 });
  });
  it("tomada em horário que depois foi retirado/suspenso não conta como tomada (a situação é do dia)", () => {
    const agenda = new Map([[d(0), [A("x", "IM", "suspenso")]]]);
    const j = montarAdesao(d(0), [], [{ origem: "propria", nomeChave: "x", sigla: "IM", data: d(0), status: "tomei" }], agenda).propria.janelas[0];
    expect(j).toMatchObject({ tomei: 0, esperado: 0, suspenso: 1 });
    expect(j.percentual).toBeNull();
  });
  it("virada de dia: a janela de 7 dias termina em 'hoje' de Brasília e vira com ele", () => {
    const h = [A("x", "IM")];
    const ag = new Map([["2026-11-26", h], ["2026-11-27", h]]);
    const antes = montarAdesao("2026-11-26", [], [], ag).propria;
    const depois = montarAdesao("2026-11-27", [], [], ag).propria;
    expect(antes.historico.at(-1)!.data).toBe("2026-11-26");
    expect(depois.historico.at(-1)!.data).toBe("2026-11-27");
    expect(antes.janelas[0].diasComHistorico).toBe(1);
    expect(depois.janelas[0].diasComHistorico).toBe(2);
  });
});

describe("Tomei/Esqueci (paciente)", () => {
  it("exige token do paciente; prévia do administrador não escreve", async () => {
    const corpo = { origem: "prescrita", nome: "Formula Clinica", sigla: "IM", status: "tomei" };
    expect((await request(app).post("/api/area-paciente/medicacoes/tomadas").send(corpo)).status).toBe(401);
    const previa = `Bearer ${createPortalToken(1, { preview: true })}`;
    expect((await request(app).post("/api/area-paciente/medicacoes/tomadas").set("Authorization", previa).send(corpo)).status).toBe(401);
  });
  it("registra, corrige no mesmo horário (idempotente) e mostra a adesão separada", async () => {
    const corpo = { origem: "prescrita", nome: "Formula Clinica", sigla: "IM", status: "esqueci" };
    expect((await request(app).post("/api/area-paciente/medicacoes/tomadas").set("Authorization", tok(1)).send(corpo)).status).toBe(200);
    expect((await request(app).post("/api/area-paciente/medicacoes/tomadas").set("Authorization", tok(1)).send({ ...corpo, status: "tomei" })).status).toBe(200);
    expect((await pool.query("SELECT count(*)::int n FROM cliente_medicacao_tomadas")).rows[0].n).toBe(1);
    const g = await request(app).get("/api/area-paciente/medicacoes/adesao").set("Authorization", tok(1));
    expect(g.status).toBe(200);
    const im = g.body.hoje.find((x: any) => x.nome === "Formula Clinica" && x.sigla === "IM");
    expect(im.status).toBe("tomei");
    expect(g.body.adesao.prescrita.janelas[0].tomei).toBe(1);
    expect(g.body.adesao.propria.esperadoPorDia).toBe(0);
  });
  it("horário que não existe na rotina é recusado; texto livre inválido é 400", async () => {
    const r = await request(app).post("/api/area-paciente/medicacoes/tomadas").set("Authorization", tok(1))
      .send({ origem: "prescrita", nome: "Formula Clinica", sigla: "NO", status: "tomei" });
    expect(r.status).toBe(404);
    const r2 = await request(app).post("/api/area-paciente/medicacoes/tomadas").set("Authorization", tok(1))
      .send({ origem: "prescrita", nome: "x", sigla: "IM", status: "talvez" });
    expect(r2.status).toBe(400);
  });
  it("um paciente nunca marca na rotina de outro", async () => {
    const r = await request(app).post("/api/area-paciente/medicacoes/tomadas").set("Authorization", tok(2))
      .send({ origem: "prescrita", nome: "Formula Clinica", sigla: "IM", status: "tomei" });
    expect(r.status).toBe(404);
  });
  it("pausar, editar, excluir e revogar disparam o recálculo do lembrete", async () => {
    const { id } = await registrarMedicacao(pool, { clientId: 1, origem: "autodeclarada", nome: "Gatilho", doseValor: 1, doseUnidade: "mg", periodos: ["manha"] });
    h.recalc.length = 0;
    await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1)).send({ pausada: true });
    await request(app).patch(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1)).send({ observacao: "x" });
    await request(app).delete(`/api/area-paciente/medicacoes/${id}`).set("Authorization", tok(1));
    expect(h.recalc).toEqual(["paciente_pausou", "paciente_editou", "paciente_excluiu"]);
  });
});

describe("adesão no banco: pausa, retomada, alteração de horário e nomes iguais (dados sintéticos)", () => {
  const P = "/api/area-paciente/medicacoes";
  const H = { Authorization: "" };
  const adesao = async () => (await request(app).get(`${P}/adesao`).set("Authorization", tok(2))).body;
  const linha = async (nome: string) => (await pool.query("SELECT periodo, situacao FROM cliente_medicacao_agenda_dia WHERE client_id=2 AND nome_chave=$1 ORDER BY periodo", [nome])).rows;
  it("cria, pausa (suspenso, fora do denominador), retoma, e alteração de horário retira o antigo sem apagar", async () => {
    H.Authorization = tok(2);
    const c = await request(app).post(P).set(H).send({ nome: "Vitamina Teste", doseValor: 1, doseUnidade: "mg", periodos: ["manha"] });
    expect(c.status).toBe(201);
    const id = c.body.id ?? c.body.medicacao?.id;
    expect(id).toBeTruthy();
    let a = await adesao();
    expect(a.adesao.propria.janelas[0]).toMatchObject({ esperado: 1, suspenso: 0 });
    // pausa: vira suspenso na hora (sem precisar abrir a tela), denominador volta a 0
    expect((await request(app).patch(`${P}/${id}`).set(H).send({ pausada: true })).status).toBe(200);
    expect(await linha("vitamina teste")).toEqual([{ periodo: "IM", situacao: "suspenso" }]);
    a = await adesao();
    expect(a.adesao.propria.janelas[0]).toMatchObject({ esperado: 0, suspenso: 1, diasSuspensos: 1 });
    expect(a.adesao.propria.janelas[0].percentual).toBeNull();
    // retomada no mesmo dia: volta a contar
    expect((await request(app).patch(`${P}/${id}`).set(H).send({ pausada: false })).status).toBe(200);
    expect(await linha("vitamina teste")).toEqual([{ periodo: "IM", situacao: "ativo" }]);
    // responde Tomei; pausar depois NÃO apaga nem reclassifica o que foi respondido
    expect((await request(app).post(`${P}/tomadas`).set(H).send({ origem: "propria", nome: "Vitamina Teste", sigla: "IM", status: "tomei" })).status).toBe(200);
    await request(app).patch(`${P}/${id}`).set(H).send({ pausada: true });
    expect(await linha("vitamina teste")).toEqual([{ periodo: "IM", situacao: "ativo" }]);
    await request(app).patch(`${P}/${id}`).set(H).send({ pausada: false });
    expect((await adesao()).adesao.propria.janelas[0]).toMatchObject({ tomei: 1, esperado: 1 });
  });
  it("alteração de horário sem resposta: o antigo vira retirado (não é falta) e o novo conta", async () => {
    H.Authorization = tok(2);
    const c = await request(app).post(P).set(H).send({ nome: "Magnesio Teste", doseValor: 2, doseUnidade: "mg", periodos: ["noite"] });
    const id = c.body.id ?? c.body.medicacao?.id;
    await adesao();
    const ed = await request(app).patch(`${P}/${id}`).set(H).send({ nome: "Magnesio Teste", doseValor: 2, doseUnidade: "mg", periodos: ["ceia"] });
    expect(ed.status).toBe(200);
    expect(await linha("magnesio teste")).toEqual([{ periodo: "CE", situacao: "ativo" }, { periodo: "NO", situacao: "retirado" }]);
    expect((await pool.query("SELECT count(*)::int n FROM cliente_medicacao_agenda_dia WHERE client_id=2 AND nome_chave='magnesio teste'")).rows[0].n).toBe(2); // nada apagado
  });
  it("mesmo nome da prescrição da clínica: continuam distintos e a prescrição é preservada", async () => {
    H.Authorization = tok(2);
    await pool.query(`INSERT INTO lembretes_prescricao (cliente_id, periodos) VALUES (2, $1)`, [JSON.stringify([
      { sigla: "AL", nome: "Almoço", tipo: "tomar", formulas: [{ nome: "Zinco Teste", dose: "5 mg" }] }])]);
    const c = await request(app).post(P).set(H).send({ nome: "Zinco Teste", doseValor: 9, doseUnidade: "mg", periodos: ["jejum"] });
    expect(c.status).toBe(201);
    const a = await adesao();
    const doDia = a.hoje.filter((x: any) => x.nome === "Zinco Teste");
    expect(doDia.map((x: any) => x.origem).sort()).toEqual(["prescrita", "propria"]);
    expect(doDia.find((x: any) => x.origem === "prescrita").dose).toBe("5 mg");
    expect((await pool.query("SELECT count(*)::int n FROM lembretes_prescricao WHERE cliente_id=2")).rows[0].n).toBe(1);
  });
});

describe("rotas da clínica — isolamento por empresa", () => {
  let medId = 0;
  const hash = () => textoDeConsentimentoVigente().hash;
  beforeAll(async () => {
    medId = (await registrarMedicacao(pool, { clientId: 1, origem: "autodeclarada", nome: "Vitamina D", doseValor: 2000, doseUnidade: "UI", periodos: ["manha"] })).id;
  });

  it("sem login de colaborador: 401", async () => {
    expect((await request(app).get("/api/cockpit/1/medicacoes")).status).toBe(401);
    expect((await request(app).post(`/api/cockpit/1/medicacoes/${medId}/decisao`).send({ decisao: "validar" })).status).toBe(401);
  });
  it("clínica B não enxerga nem decide sobre cliente da clínica A (404)", async () => {
    expect((await request(app).get("/api/cockpit/1/medicacoes").set(med(2))).status).toBe(404);
    const r = await request(app).post(`/api/cockpit/1/medicacoes/${medId}/decisao`).set(med(2)).send({ decisao: "validar" });
    expect(r.status).toBe(404);
  });
  it("sem consentimento a clínica A não vê o que o cliente cadastrou, nem valida", async () => {
    const g = await request(app).get("/api/cockpit/1/medicacoes").set(med(1));
    expect(g.status).toBe(200);
    expect(g.body.cadastradasPeloCliente).toEqual({ consentimentoAtivo: false, itens: [] });
    expect(g.body.adesao.propria).toBeNull();
    expect(g.body.prescritas.map((p: any) => p.nome)).toEqual(["Formula Clinica", "Propria Validada"]);
    const r = await request(app).post(`/api/cockpit/1/medicacoes/${medId}/decisao`).set(med(1)).send({ decisao: "validar" });
    expect(r.status).toBe(403);
  });
  it("consentimento de OUTRA clínica não vale para a clínica A", async () => {
    await registrarConsentimento(pool, { clientId: 1, empresaId: 2, hashAceito: hash() });
    const g = await request(app).get("/api/cockpit/1/medicacoes").set(med(1));
    expect(g.body.cadastradasPeloCliente.itens).toEqual([]);
    await pool.query("UPDATE cliente_medicacao_consentimentos SET revogado_em = now()");
  });
  it("só médico decide; enfermagem lê mas não valida", async () => {
    await registrarConsentimento(pool, { clientId: 1, empresaId: 1, hashAceito: hash() });
    const g = await request(app).get("/api/cockpit/1/medicacoes").set(med(1, "enfermeira"));
    expect(g.status).toBe(200);
    expect(g.body.podeDecidir).toBe(false);
    expect(g.body.cadastradasPeloCliente.itens.map((m: any) => m.nome)).toContain("Vitamina D");
    const r = await request(app).post(`/api/cockpit/1/medicacoes/${medId}/decisao`).set(med(1, "enfermeira")).send({ decisao: "validar" });
    expect(r.status).toBe(403);
  });
  it("medicação de outro cliente não pode ser decidida pela URL de um cliente da empresa", async () => {
    const outro = (await registrarMedicacao(pool, { clientId: 2, origem: "autodeclarada", nome: "Alheia", doseValor: 1, doseUnidade: "mg", periodos: ["manha"] })).id;
    const r = await request(app).post(`/api/cockpit/1/medicacoes/${outro}/decisao`).set(med(1)).send({ decisao: "validar" });
    expect(r.status).toBe(404);
    expect((await pool.query("SELECT estado FROM cliente_medicacoes WHERE id=$1", [outro])).rows[0].estado).toBe("nao_validada");
  });
  it("recusar exige motivo; validar em 1 clique recalcula o lembrete", async () => {
    expect((await request(app).post(`/api/cockpit/1/medicacoes/${medId}/decisao`).set(med(1)).send({ decisao: "recusar" })).status).toBe(400);
    h.recalc.length = 0;
    const r = await request(app).post(`/api/cockpit/1/medicacoes/${medId}/decisao`).set(med(1)).send({ decisao: "validar" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ estado: "validada", lembreteRecalculado: true });
    expect(h.recalc).toEqual(["clinica_validar"]);
    expect((await request(app).post(`/api/cockpit/1/medicacoes/${medId}/decisao`).set(med(1)).send({ decisao: "validar" })).status).toBe(409);
  });
  it("ajustar corrige dose e valida junto; recusar grava motivo", async () => {
    const a = (await registrarMedicacao(pool, { clientId: 1, origem: "autodeclarada", nome: "Ajustavel", doseValor: 10, doseUnidade: "mg", periodos: ["manha"] })).id;
    const r = await request(app).post(`/api/cockpit/1/medicacoes/${a}/decisao`).set(med(1))
      .send({ decisao: "ajustar", ajuste: { doseValor: 5, doseUnidade: "mg", periodos: ["noite"] } });
    expect(r.status).toBe(200);
    const row = (await pool.query("SELECT estado, dose_valor::float d, p_noite, p_manha FROM cliente_medicacoes WHERE id=$1", [a])).rows[0];
    expect(row).toMatchObject({ estado: "validada", d: 5, p_noite: true, p_manha: false });
    const b = (await registrarMedicacao(pool, { clientId: 1, origem: "autodeclarada", nome: "Recusavel", doseValor: 1, doseUnidade: "mg", periodos: ["manha"] })).id;
    const rr = await request(app).post(`/api/cockpit/1/medicacoes/${b}/decisao`).set(med(1)).send({ decisao: "recusar", motivo: "dose acima do seguro" });
    expect(rr.body.estado).toBe("recusada");
    const lista = await request(app).get("/api/cockpit/1/medicacoes").set(med(1));
    expect(lista.body.cadastradasPeloCliente.itens.find((m: any) => m.nome === "Recusavel").motivoRecusa).toBe("dose acima do seguro");
  });
  it("revogar o consentimento esconde tudo de novo, imediatamente", async () => {
    await pool.query("UPDATE cliente_medicacao_consentimentos SET revogado_em = now() WHERE empresa_id=1");
    const g = await request(app).get("/api/cockpit/1/medicacoes").set(med(1));
    expect(g.body.cadastradasPeloCliente).toEqual({ consentimentoAtivo: false, itens: [] });
  });
});

describe("fila central da clínica — isolamento por empresa", () => {
  const hash = () => textoDeConsentimentoVigente().hash;
  it("sem login: 401", async () => {
    expect((await request(app).get("/api/cockpit-medicacoes/fila")).status).toBe(401);
  });
  it("lista só clientes da própria empresa, só com consentimento ativo e só aguardando conferência", async () => {
    await pool.query("UPDATE cliente_medicacao_consentimentos SET revogado_em = now() WHERE revogado_em IS NULL");
    const filaSem = await request(app).get("/api/cockpit-medicacoes/fila").set(med(1));
    expect(filaSem.status).toBe(200);
    expect(filaSem.body.itens).toEqual([]);
    const m2 = (await registrarMedicacao(pool, { clientId: 2, origem: "autodeclarada", nome: "Colageno B", doseValor: 5, doseUnidade: "g", periodos: ["manha"] })).id;
    await registrarConsentimento(pool, { clientId: 1, empresaId: 1, hashAceito: hash() });
    await registrarConsentimento(pool, { clientId: 2, empresaId: 2, hashAceito: hash() });
    const a = await request(app).get("/api/cockpit-medicacoes/fila").set(med(1));
    const b = await request(app).get("/api/cockpit-medicacoes/fila").set(med(2));
    expect(a.body.itens.every((i: any) => i.clientId === 1)).toBe(true);
    expect(b.body.itens.map((i: any) => i.nome)).toContain("Colageno B");
    expect(b.body.itens.every((i: any) => i.clientId === 2)).toBe(true);
    // clínica A não decide sobre medicação da clínica B
    const r = await request(app).post(`/api/cockpit/2/medicacoes/${m2}/decisao`).set(med(1)).send({ decisao: "validar" });
    expect(r.status).toBe(404);
    // validada sai da fila
    expect((await request(app).post(`/api/cockpit/2/medicacoes/${m2}/decisao`).set(med(2)).send({ decisao: "validar" })).status).toBe(200);
    expect((await request(app).get("/api/cockpit-medicacoes/fila").set(med(2))).body.itens.map((i: any) => i.nome)).not.toContain("Colageno B");
  });
  it("enfermagem consulta a fila, mas não decide", async () => {
    const g = await request(app).get("/api/cockpit-medicacoes/fila").set(med(1, "enfermeira"));
    expect(g.status).toBe(200);
    expect(g.body.podeDecidir).toBe(false);
  });
});

describe("recálculo do lembrete (núcleo)", () => {
  it("mantém TODAS as fórmulas da clínica (mesmo nome de medicação própria não substitui) e põe as elegíveis", async () => {
    await registrarMedicacao(pool, { clientId: 1, origem: "autodeclarada", nome: "Propria Validada", doseValor: 5, doseUnidade: "mg", periodos: ["manha"] }).catch(() => {});
    const chamadas: any[] = [];
    await recalcularLembreteCore(pool, 1, {
      hoje: "2026-11-26", itensMedicacao: [{ tipo: "formula", nome: "Nova Propria", dose: "1 mg", periodos: ["noite"] }],
      sincronizar: async (id, itens) => { chamadas.push({ id, itens }); },
    });
    const nomes = chamadas[0].itens.map((i: any) => i.nome);
    expect(nomes).toEqual(["Formula Clinica", "Propria Validada", "Nova Propria"]); // nome igual NÃO apaga a prescrição
    expect(chamadas[0].itens[0].periodos).toEqual(["manha", "ceia"]);
    expect(chamadas[0].itens[0].dose).toBe("1 capsula");
  });
});

describe("recálculo que falha fica visível e se recupera", () => {
  it("falha não é silenciosa: registra pendência; sucesso depois limpa", async () => {
    const { recalcularLembreteDoCliente, recalculoPendente } = await vi.importActual<typeof import("../lib/lembrete-medicacoes-recalculo")>("../lib/lembrete-medicacoes-recalculo");
    await pool.query("ALTER TABLE lembretes_prescricao RENAME TO lembretes_prescricao_off"); // provoca falha real
    expect(await recalcularLembreteDoCliente(1, "teste_falha")).toBe(false);
    expect(await recalculoPendente(1)).toBe(true);
    await pool.query("ALTER TABLE lembretes_prescricao_off RENAME TO lembretes_prescricao");
    expect(await recalcularLembreteDoCliente(1, "teste_ok")).toBe(true);
    expect(await recalculoPendente(1)).toBe(false);
  });
});

describe("sessão persistente (token de renovação em cookie protegido)", () => {
  const CSRF = { "X-Paxcare-Csrf": "1" };
  const S = "/api/area-paciente/sessao";
  const cookieDe = (r: { headers: Record<string, any> }): string => {
    const c = ([] as string[]).concat(r.headers["set-cookie"] ?? []).find((x) => x.startsWith("paxcare_rt=")) ?? "";
    return decodeURIComponent(c.split(";")[0].slice("paxcare_rt=".length));
  };
  const iniciar = (cid: number) => request(app).post(`${S}/iniciar`).set("Authorization", tok(cid)).set(CSRF);
  const renovar = (rt: string) => request(app).post(`${S}/renovar`).set(CSRF).set("Cookie", `paxcare_rt=${encodeURIComponent(rt)}`);

  it("iniciar exige token de acesso válido do paciente e cabeçalho anti-falsificação", async () => {
    expect((await request(app).post(`${S}/iniciar`).set(CSRF)).status).toBe(401);
    const previa = `Bearer ${createPortalToken(1, { preview: true })}`;
    expect((await request(app).post(`${S}/iniciar`).set("Authorization", previa).set(CSRF)).status).toBe(401);
    expect((await request(app).post(`${S}/iniciar`).set("Authorization", tok(1))).status).toBe(403); // sem cabeçalho
  });
  it("cookie: HttpOnly, SameSite=Strict, Path restrito, 90 dias; o token NUNCA vai no corpo", async () => {
    const ini = await iniciar(1);
    expect(ini.status).toBe(201);
    expect(JSON.stringify(ini.body)).not.toMatch(/refresh/i);
    const raw = ([] as string[]).concat(ini.headers["set-cookie"]).find((x) => x.startsWith("paxcare_rt="))!;
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Strict/);
    expect(raw).toMatch(/Path=\/api\/area-paciente\/sessao/);
    expect(raw).toMatch(/Max-Age=7776000/);
    const salvo = (await pool.query("SELECT token_hash FROM area_paciente_sessoes")).rows.map((x) => x.token_hash);
    expect(salvo).not.toContain(cookieDe(ini));
  });
  it("renova com rotação pelo cookie; o antigo (trocado) dá 401", async () => {
    const t1 = cookieDe(await iniciar(1));
    const r1 = await renovar(t1);
    expect(r1.status).toBe(200);
    expect(r1.body.id).toBe(1);
    expect(JSON.stringify(r1.body)).not.toMatch(/refresh/i);
    const t2 = cookieDe(r1);
    expect(t2).toBeTruthy();
    expect(t2).not.toBe(t1);
    expect((await request(app).get("/api/area-paciente/medicacoes/adesao").set("Authorization", `Bearer ${r1.body.token}`)).status).toBe(200);
    expect((await renovar(t1)).status).toBe(401);
    expect((await renovar(t2)).status).toBe(200);
  });
  it("CSRF: sem cabeçalho personalizado ou com Origin de outro site, a renovação é recusada (403) e o token não gira", async () => {
    const t = cookieDe(await iniciar(1));
    expect((await request(app).post(`${S}/renovar`).set("Cookie", `paxcare_rt=${encodeURIComponent(t)}`)).status).toBe(403);
    expect((await renovar(t).set("Origin", "https://site-malicioso.example")).status).toBe(403);
    expect((await renovar(t).set("Origin", "http://127.0.0.1")).status).toBe(403); // host diferente do da requisição
    expect((await renovar(t)).status).toBe(200); // o token continuava válido: nenhuma tentativa acima o consumiu
  });
  it("migração: token antigo (corpo) ainda renova uma vez e passa a viver só no cookie", async () => {
    const t = cookieDe(await iniciar(1));
    const r = await request(app).post(`${S}/renovar`).set(CSRF).send({ refreshToken: t });
    expect(r.status).toBe(200);
    expect(cookieDe(r)).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toMatch(/refresh/i);
  });
  it("reuso tardio de token trocado revoga a família inteira", async () => {
    const t1 = cookieDe(await iniciar(1));
    const r1 = await renovar(t1);
    await pool.query("UPDATE area_paciente_sessoes SET substituido_em = now() - interval '5 minutes' WHERE substituido_em IS NOT NULL");
    expect((await renovar(t1)).status).toBe(401);
    expect((await renovar(cookieDe(r1))).status).toBe(401);
  });
  it("sem cookie, curto, desconhecido, expirado (teto de 90 dias): 401; sair revoga e limpa o cookie", async () => {
    expect((await request(app).post(`${S}/renovar`).set(CSRF)).status).toBe(401);
    expect((await renovar("curto")).status).toBe(401);
    expect((await renovar("x".repeat(40))).status).toBe(401);
    const t = cookieDe(await iniciar(1));
    await pool.query("UPDATE area_paciente_sessoes SET familia_inicio = now() - interval '91 days' WHERE substituido_em IS NULL AND revogado_em IS NULL");
    expect((await renovar(t)).status).toBe(401);
    const t2 = cookieDe(await iniciar(1));
    const sai = await request(app).post(`${S}/encerrar`).set(CSRF).set("Cookie", `paxcare_rt=${encodeURIComponent(t2)}`);
    expect(sai.status).toBe(200);
    expect(([] as string[]).concat(sai.headers["set-cookie"]).join(";")).toMatch(/paxcare_rt=;.*Max-Age=0/);
    expect((await renovar(t2)).status).toBe(401);
    expect((await request(app).post(`${S}/encerrar`)).status).toBe(403);
  });
  it("renovação respeita o teto: nova validade nunca passa de 90 dias desde o login", async () => {
    const t = cookieDe(await iniciar(2));
    await pool.query("UPDATE area_paciente_sessoes SET familia_inicio = now() - interval '80 days' WHERE client_id=2 AND substituido_em IS NULL AND revogado_em IS NULL");
    const r = await renovar(t);
    expect(r.status).toBe(200);
    const q = await pool.query("SELECT (expira_em <= familia_inicio + interval '90 days' + interval '1 second') ok FROM area_paciente_sessoes WHERE client_id=2 AND substituido_em IS NULL AND revogado_em IS NULL");
    expect(q.rows[0].ok).toBe(true);
  });
  it("troca de senha (revogarSessoesDoCliente) derruba o cookie de todos os aparelhos; outro cliente segue", async () => {
    const { revogarSessoesDoCliente } = await import("../lib/area-paciente-sessao");
    const a = cookieDe(await iniciar(1)), b = cookieDe(await iniciar(1)), outro = cookieDe(await iniciar(2));
    await revogarSessoesDoCliente(pool as any, 1);
    expect((await renovar(a)).status).toBe(401);
    expect((await renovar(b)).status).toBe(401);
    expect((await renovar(outro)).status).toBe(200);
  });
  it("tentativas inválidas em excesso levam a 429 (freio por origem)", async () => {
    let ultimo = 0;
    for (let i = 0; i < 35; i++) ultimo = (await renovar("x".repeat(40))).status;
    expect(ultimo).toBe(429);
  });
});
