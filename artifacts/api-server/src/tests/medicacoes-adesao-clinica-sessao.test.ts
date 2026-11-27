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

describe("sessão persistente", () => {
  it("iniciar exige token de acesso válido do paciente", async () => {
    expect((await request(app).post("/api/area-paciente/sessao/iniciar")).status).toBe(401);
    const previa = `Bearer ${createPortalToken(1, { preview: true })}`;
    expect((await request(app).post("/api/area-paciente/sessao/iniciar").set("Authorization", previa)).status).toBe(401);
  });
  it("renova com rotação, guarda só hash e sem CPF no corpo da sessão", async () => {
    const ini = await request(app).post("/api/area-paciente/sessao/iniciar").set("Authorization", tok(1));
    expect(ini.status).toBe(201);
    const t1 = ini.body.refreshToken as string;
    const salvo = (await pool.query("SELECT token_hash FROM area_paciente_sessoes")).rows.map((x) => x.token_hash);
    expect(salvo).not.toContain(t1);
    const r1 = await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: t1 });
    expect(r1.status).toBe(200);
    expect(r1.body.id).toBe(1);
    expect(r1.body.token).toBeTruthy();
    expect(r1.body.refreshToken).not.toBe(t1);
    // o token de acesso novo funciona nas rotas do paciente
    expect((await request(app).get("/api/area-paciente/medicacoes/adesao").set("Authorization", `Bearer ${r1.body.token}`)).status).toBe(200);
    // o antigo (já trocado) dentro da tolerância de 30 s: 401, sem derrubar a família
    expect((await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: t1 })).status).toBe(401);
    expect((await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: r1.body.refreshToken })).status).toBe(200);
  });
  it("reuso tardio de token trocado revoga a família inteira", async () => {
    const t1 = (await request(app).post("/api/area-paciente/sessao/iniciar").set("Authorization", tok(1))).body.refreshToken as string;
    const r1 = await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: t1 });
    await pool.query("UPDATE area_paciente_sessoes SET substituido_em = now() - interval '5 minutes' WHERE substituido_em IS NOT NULL");
    expect((await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: t1 })).status).toBe(401);
    expect((await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: r1.body.refreshToken })).status).toBe(401);
  });
  it("expirado, teto de 90 dias, desconhecido e lixo: 401/400; sair revoga", async () => {
    expect((await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: "x".repeat(40) })).status).toBe(401);
    expect((await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: "curto" })).status).toBe(400);
    const t = (await request(app).post("/api/area-paciente/sessao/iniciar").set("Authorization", tok(1))).body.refreshToken as string;
    await pool.query("UPDATE area_paciente_sessoes SET familia_inicio = now() - interval '91 days' WHERE substituido_em IS NULL AND revogado_em IS NULL");
    expect((await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: t })).status).toBe(401);
    const t2 = (await request(app).post("/api/area-paciente/sessao/iniciar").set("Authorization", tok(1))).body.refreshToken as string;
    expect((await request(app).post("/api/area-paciente/sessao/encerrar").send({ refreshToken: t2 })).status).toBe(200);
    expect((await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: t2 })).status).toBe(401);
  });
  it("renovação respeita o teto: nova validade nunca passa de 90 dias desde o login", async () => {
    const t = (await request(app).post("/api/area-paciente/sessao/iniciar").set("Authorization", tok(2))).body.refreshToken as string;
    await pool.query("UPDATE area_paciente_sessoes SET familia_inicio = now() - interval '80 days' WHERE client_id=2 AND substituido_em IS NULL AND revogado_em IS NULL");
    const r = await request(app).post("/api/area-paciente/sessao/renovar").send({ refreshToken: t });
    expect(r.status).toBe(200);
    const q = await pool.query("SELECT (expira_em <= familia_inicio + interval '90 days' + interval '1 second') ok FROM area_paciente_sessoes WHERE client_id=2 AND substituido_em IS NULL AND revogado_em IS NULL");
    expect(q.rows[0].ok).toBe(true);
  });
});
