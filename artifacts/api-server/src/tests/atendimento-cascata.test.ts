/**
 * Cascata (sinapses + IA 1/2/3 + fila de revisão). Comportamento real da lógica e do banco em ambiente descartável;
 * IAs simuladas por contador (nenhuma chamada externa, nenhuma mensagem enviada). Dados 100% sintéticos.
 */
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { bancoAtendimentoIsolado } from "./helpers/pg-atendimento-isolado";

const h = vi.hoisted(() => ({ pg: null as any }));
vi.mock("@workspace/db", async () => {
  const real = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  return { ...real, pool: { query: (...a: any[]) => h.pg.query(...a), connect: (...a: any[]) => h.pg.connect(...a) } };
});
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_q: any, _r: any, n: () => void) => n() }));
vi.mock("../lib/atendimento-ficha", () => ({ listarFichas: vi.fn(), detalharFicha: vi.fn(), acrescentarEvento: vi.fn(), ESTADOS_FICHA: [] }));
vi.mock("../lib/atendimento-controle", () => ({ alterarControle: vi.fn(), lerControles: vi.fn(), ControleInvalido: class extends Error {} }));

import { executarCascata, validarRespostaSegura, classificarRisco, type DepsCascata, type ParecerIA, type EntradaCascata } from "../lib/atendimento-cascata";
import { migrarCascata, buscarSinapseExata, registrarRevisao, ratificarRevisao, retificarRevisao, modoDaCascata } from "../lib/atendimento-cascata-store";
import { criarIAsCascata } from "../lib/atendimento-cascata-ia";

let b: Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
const ENT: EntradaCascata = { empresaId: 5, clienteId: 12, clinicaConfirmada: true, canal: "whatsapp", texto: "Vocês atendem aos sábados?" };
const p = (o: Partial<ParecerIA>): ParecerIA => ({ acao: "responder", resposta: "Atendemos de segunda a sexta.", confianca: 0.95, ...o });

function deps(o: Partial<DepsCascata> & { chamadas?: { n: number } } = {}): DepsCascata & { c: { ia1: number; ia2: number; ia3: number } } {
  const c = { ia1: 0, ia2: 0, ia3: 0 };
  return {
    c,
    controle: async () => "automatico", buscarSinapse: async () => null, baseClinica: async () => [{ tema: "Horário", resposta: "Segunda a sexta." }],
    sanitizar: (t: string) => t, ia1: async () => { c.ia1++; return p({}); }, ia2: async () => { c.ia2++; return p({ concorda: true }); },
    ia3: async () => { c.ia3++; return p({}); }, ...o,
  } as any;
}
const total = (d: { c: { ia1: number; ia2: number; ia3: number } }) => d.c.ia1 + d.c.ia2 + d.c.ia3;

describe("cascata: decisão", () => {
  it("1 sinapse ativa responde sem nenhuma IA", async () => {
    const d = deps({ buscarSinapse: async () => ({ id: 7, resposta: "Atendemos de segunda a sexta.", intencao: "horario" }) });
    const r = await executarCascata(ENT, d);
    expect(r).toMatchObject({ acao: "responder", estagio: "sinapse", sinapseId: 7, chamadasIA: 0, executada: false }); expect(total(d)).toBe(0);
  });
  it("2 identidade ou clínica não confirmada encaminha sem custo", async () => {
    for (const e of [{ ...ENT, clinicaConfirmada: false }, { ...ENT, clienteId: null }]) {
      const d = deps(); const r = await executarCascata(e, d);
      expect(r.acao).toBe("encaminhar_humano"); expect(total(d)).toBe(0);
    }
  });
  it("3 emergência/modo humano bloqueia antes de qualquer IA", async () => {
    for (const modo of ["humano", "assistido", "emergencia"]) {
      const d = deps({ controle: async () => modo }); const r = await executarCascata(ENT, d);
      expect(r.acao).toBe("bloqueado"); expect(total(d)).toBe(0); expect(r.resposta).toBeNull();
    }
  });
  it("4 urgência vai para humano urgente sem IA", async () => {
    for (const t of ["estou com dor no peito", "to com falta de ar", "quero me matar", "meu rosto está inchado, reação alérgica"]) {
      const d = deps(); const r = await executarCascata({ ...ENT, texto: t }, d);
      expect(r.acao, t).toBe("urgente_humano"); expect(total(d)).toBe(0);
    }
  });
  it("5 conduta clínica (dose, receita, diagnóstico, troca de remédio) vai para humano sem IA", async () => {
    for (const t of ["qual a dose que devo tomar?", "posso tomar junto com outro remédio", "preciso renovar a receita", "o que eu tenho?", "posso parar de tomar a medicação", "tomo 50 mg está certo"]) {
      const d = deps(); const r = await executarCascata({ ...ENT, texto: t }, d);
      expect(r.acao, t).toBe("encaminhar_humano"); expect(r.motivo).toBe("conduta_clinica_exige_humano"); expect(total(d)).toBe(0);
    }
  });
  it("6 IA 1 confiante resolve com 1 chamada", async () => {
    const d = deps(); const r = await executarCascata(ENT, d);
    expect(r).toMatchObject({ acao: "responder", estagio: "ia1", chamadasIA: 1 }); expect(total(d)).toBe(1);
  });
  it("7 IA 1 em dúvida (confiança 0,8) + IA 2 concorda resolve com 2 chamadas e sem IA 3", async () => {
    const d = deps({ ia1: async function () { return p({ confianca: 0.8, duvida: true }); } });
    const r = await executarCascata(ENT, d);
    expect(r).toMatchObject({ acao: "responder", estagio: "ia2" }); expect(d.c.ia3).toBe(0);
  });
  it("7b IA 1 com confiança abaixo de 0,7 escala até a IA 3 mesmo se a IA 2 concordar", async () => {
    const d = deps({ ia1: async () => p({ confianca: 0.6, duvida: true }) });
    expect((await executarCascata(ENT, d)).estagio).toBe("ia3"); expect(d.c.ia3).toBe(1);
  });
  it("8 divergência chama IA 3, que decide", async () => {
    const d = deps({ ia1: async () => p({ confianca: 0.5, composto: true }), ia2: async () => p({ acao: "encaminhar", concorda: false, riscos: ["pedido composto"] }), ia3: async () => p({ resposta: "Atendemos de segunda a sexta, das 8h às 18h." }) });
    const r = await executarCascata(ENT, d);
    expect(r).toMatchObject({ acao: "responder", estagio: "ia3", chamadasIA: 3 });
    expect(r.parecer1 && r.parecer2 && r.parecer3).toBeTruthy();
  });
  it("9 IA 3 que encaminha ou duvida => humano", async () => {
    for (const x of [p({ acao: "encaminhar" }), p({ duvida: true }), p({ confianca: 0.4 })]) {
      const d = deps({ ia1: async () => p({ confianca: 0.5 }), ia2: async () => p({ concorda: false }), ia3: async () => x });
      expect((await executarCascata(ENT, d)).acao).toBe("encaminhar_humano");
    }
  });
  it("10 falha, JSON inválido ou parecer fora do contrato em qualquer etapa => humano", async () => {
    const quebra = async () => { throw new Error("provedor fora"); };
    expect((await executarCascata(ENT, deps({ ia1: quebra }))).motivo).toBe("ia1_indisponivel_ou_invalida");
    expect((await executarCascata(ENT, deps({ ia1: async () => p({ confianca: 0.5 }), ia2: quebra }))).motivo).toBe("ia2_indisponivel_ou_invalida");
    expect((await executarCascata(ENT, deps({ ia1: async () => p({ confianca: 0.5 }), ia2: async () => p({ concorda: false }), ia3: quebra }))).motivo).toBe("ia3_indisponivel_ou_invalida");
    expect((await executarCascata(ENT, deps({ ia1: async () => ({ acao: "talvez", confianca: 2 } as any) }))).acao).toBe("encaminhar_humano");
  });
  it("11 resposta da IA com dose, conduta, número longo ou e-mail nunca sai", async () => {
    for (const r0 of ["Tome 20 mg pela manhã.", "Você tem diabetes.", "Ligue para 11999990000.", "Escreva para x@y.com", "Use esse remédio antes de dormir", ""]) {
      const r = await executarCascata(ENT, deps({ ia1: async () => p({ resposta: r0 }) }));
      expect(r.acao, r0).toBe("encaminhar_humano"); expect(r.resposta).toBeNull();
    }
  });
  it("12 emergência ligada no meio da análise derruba a resposta pronta", async () => {
    let n = 0; const d = deps({ controle: async () => (++n <= 1 ? "automatico" : "humano") });
    const r = await executarCascata(ENT, d);
    expect(r.acao).toBe("bloqueado"); expect(r.resposta).toBeNull(); expect(r.motivo).toContain("controle_alterado");
  });
  it("13 texto com dado pessoal não chega à IA", async () => {
    const d = deps({ sanitizar: () => null }); const r = await executarCascata({ ...ENT, texto: "meu cpf 123.456.789-09" }, d);
    expect(r.acao).toBe("encaminhar_humano"); expect(total(d)).toBe(0);
  });
  it("14 sinapse com texto inseguro (ex.: ratificada errada) também é barrada na saída", async () => {
    const r = await executarCascata(ENT, deps({ buscarSinapse: async () => ({ id: 1, resposta: "Tome 10 mg", intencao: null }) }));
    expect(r.acao).toBe("encaminhar_humano");
  });
  it("15 contexto enviado à IA é só a base aprovada limitada e o texto sanitizado", async () => {
    let visto: any; const d = deps({ baseClinica: async () => Array.from({ length: 40 }, (_, i) => ({ tema: "t" + i, resposta: "r".repeat(900) })), sanitizar: () => "texto limpo", ia1: async (x) => { visto = x; return p({}); } });
    await executarCascata(ENT, d);
    expect(visto.texto).toBe("texto limpo"); expect(visto.base).toHaveLength(20); expect(visto.base[0].resposta.length).toBe(300);
    expect(Object.keys(visto).sort()).toEqual(["base", "texto"]); expect(JSON.stringify(visto)).not.toMatch(/5511/);
  });
  it("16 modo da cascata: tudo que não for 'sombra' (inclusive 'ligado') é desligado", () => {
    expect(["ligado", "", null, undefined, "SOMBRA"].map(modoDaCascata)).toEqual(["desligado", "desligado", "desligado", "desligado", "sombra"]);
    expect(classificarRisco("Quero marcar uma consulta")).toBeNull(); expect(validarRespostaSegura("Ficamos na Rua X, 100.").ok).toBe(true);
  });
  it("17 adaptadores das IAs: JSON válido mede tokens; lixo vira erro", async () => {
    const ok = { messages: { create: async () => ({ content: [{ type: "text", text: 'ok {"acao":"responder","resposta":"Oi","confianca":0.9}' }], usage: { input_tokens: 100, output_tokens: 20 } }) } };
    const ia = criarIAsCascata(ok as any);
    expect(await ia.ia1({ texto: "x", base: [] })).toMatchObject({ acao: "responder", uso: { inputTokens: 100, outputTokens: 20 } });
    const ruim = { messages: { create: async () => ({ content: [{ type: "text", text: "sem json" }] }) } };
    await expect(criarIAsCascata(ruim as any).ia1({ texto: "x", base: [] })).rejects.toThrow();
  });
});

describe("cascata: fila de revisão, ratificar e retificar (banco descartável)", () => {
  const dec = (o: Partial<any> = {}): any => ({ acao: "responder", estagio: "ia3", resposta: "Atendemos de segunda a sexta.", intencao: "horario", motivo: "ia3_decidiu", sinapseId: null, parecer1: p({}), parecer2: p({}), parecer3: p({}), chamadasIA: 3, executada: false, ...o });
  let seq = 0;
  const revisao = async (empresaId = 5, d = dec()) => (await registrarRevisao(b.pool, { empresaId, clienteId: 12, canal: "whatsapp", mensagemRef: `m${++seq}`, texto: "Vocês abrem aos sábados?" }, d))!;
  const pedido = (revisaoId: number, o: Partial<any> = {}) => ({ empresaId: 5, revisaoId, usuarioId: 1, confirmar: true, gatilho: "voces abrem aos sabados", resposta: "Atendemos de segunda a sexta.", intencao: "horario", ...o });

  beforeAll(async () => {
    b = await bancoAtendimentoIsolado(); h.pg = b.pool;
    await b.pool.query(`CREATE TABLE orientacoes_aprovadas (id BIGSERIAL PRIMARY KEY, empresa_id INT, tema TEXT, perguntas_exemplo TEXT, resposta TEXT, status TEXT)`);
    await migrarCascata(b.pool);
  }, 120_000);
  afterAll(async () => { await b.fechar(); });
  beforeEach(async () => { await b.pool.query(`DELETE FROM cascata_eventos; DELETE FROM cascata_sinapses; DELETE FROM cascata_revisoes; DELETE FROM orientacoes_aprovadas`); });

  it("18 registro é idempotente por mensagem e guarda só resumo", async () => {
    const e = { empresaId: 5, clienteId: 12, canal: "whatsapp", mensagemRef: "dup", texto: "x".repeat(500) };
    expect(await registrarRevisao(b.pool, e, dec())).not.toBeNull(); expect(await registrarRevisao(b.pool, e, dec())).toBeNull();
    const r = await b.pool.query(`SELECT length(pergunta_resumo) n FROM cascata_revisoes WHERE mensagem_ref='dup'`); expect(r.rows[0].n).toBe(160);
  });
  it("19 ratificar sem confirmação explícita, sem usuário ou com resposta insegura não cria regra", async () => {
    const id = await revisao();
    expect((await ratificarRevisao(b.pool, pedido(id, { confirmar: false }))).ok).toBe(false);
    expect(await ratificarRevisao(b.pool, pedido(id, { usuarioId: 0 }))).toMatchObject({ ok: false, codigo: 403 });
    expect(await ratificarRevisao(b.pool, pedido(id, { resposta: "Tome 5 mg" }))).toMatchObject({ ok: false, codigo: 400 });
    expect(await ratificarRevisao(b.pool, pedido(id, { gatilho: "oi" }))).toMatchObject({ ok: false, codigo: 400 });
    expect((await b.pool.query(`SELECT count(*)::int n FROM cascata_sinapses`)).rows[0].n).toBe(0);
  });
  it("20 ratificar válido cria sinapse ativa, auditada, e a busca passa a encontrá-la só na clínica dela", async () => {
    const id = await revisao(); const r = await ratificarRevisao(b.pool, pedido(id));
    expect(r.ok).toBe(true);
    expect(await buscarSinapseExata(b.pool, 5, "Vocês abrem aos SÁBADOS?")).toMatchObject({ resposta: "Atendemos de segunda a sexta." });
    expect(await buscarSinapseExata(b.pool, 6, "voces abrem aos sabados")).toBeNull();
    expect((await b.pool.query(`SELECT tipo,usuario_id FROM cascata_eventos`)).rows).toEqual([{ tipo: "ratificada", usuario_id: 1 }]);
  });
  it("21 revisão de outra clínica não pode ser ratificada (isolamento)", async () => {
    const id = await revisao(6); expect(await ratificarRevisao(b.pool, pedido(id))).toMatchObject({ ok: false, codigo: 404 });
  });
  it("22 segunda ratificação da mesma revisão é recusada", async () => {
    const id = await revisao(); await ratificarRevisao(b.pool, pedido(id));
    expect(await ratificarRevisao(b.pool, pedido(id))).toMatchObject({ ok: false, codigo: 409, erro: "revisao_ja_decidida" });
  });
  it("23 conflito: mesma pergunta com resposta diferente, e duplicata idêntica, são recusadas", async () => {
    const a = await revisao(); await ratificarRevisao(b.pool, pedido(a));
    const c = await revisao();
    expect(await ratificarRevisao(b.pool, pedido(c, { resposta: "Atendemos aos sábados." }))).toMatchObject({ ok: false, codigo: 409, erro: "conflito_mesma_pergunta_resposta_diferente" });
    expect(await ratificarRevisao(b.pool, pedido(c))).toMatchObject({ ok: false, codigo: 409, erro: "sinapse_identica_ja_ativa" });
  });
  it("24 conflito: gatilho que contém/está contido em outro de intenção diferente é recusado", async () => {
    await ratificarRevisao(b.pool, pedido(await revisao(), { gatilho: "qual o endereco", resposta: "Rua X, 100.", intencao: "endereco" }));
    expect(await ratificarRevisao(b.pool, pedido(await revisao(), { gatilho: "qual o endereco do estacionamento", resposta: "Há vagas.", intencao: "estacionamento" }))).toMatchObject({ ok: false, codigo: 409 });
  });
  it("25 conflito: pergunta já coberta por orientação aprovada da clínica é recusada", async () => {
    await b.pool.query(`INSERT INTO orientacoes_aprovadas (empresa_id,tema,perguntas_exemplo,resposta,status) VALUES (5,'Horário','Vocês abrem aos sábados?',' x','aprovada')`);
    expect(await ratificarRevisao(b.pool, pedido(await revisao()))).toMatchObject({ ok: false, codigo: 409, erro: "pergunta_ja_coberta_por_orientacao_aprovada" });
  });
  it("26 revisão que foi ENCAMINHADA não vira resposta automática", async () => {
    const id = await revisao(5, dec({ acao: "encaminhar_humano", resposta: null }));
    expect(await ratificarRevisao(b.pool, pedido(id))).toMatchObject({ ok: false, codigo: 409 });
  });
  it("27 duas ratificações simultâneas do mesmo gatilho: só uma vence", async () => {
    const [a, c] = [await revisao(), await revisao()];
    const rs = await Promise.all([ratificarRevisao(b.pool, pedido(a)), ratificarRevisao(b.pool, pedido(c))]);
    expect(rs.filter((x) => x.ok)).toHaveLength(1); expect((await b.pool.query(`SELECT count(*)::int n FROM cascata_sinapses WHERE ativa`)).rows[0].n).toBe(1);
  });
  it("28 retificar desativa sem apagar, guarda rascunho (não envia) e a busca deixa de responder", async () => {
    const id = await revisao(); await ratificarRevisao(b.pool, pedido(id));
    expect(await retificarRevisao(b.pool, { empresaId: 5, revisaoId: id, usuarioId: 1, motivo: "horário mudou", mensagemComplementar: "Corrigindo: abrimos aos sábados." })).toEqual({ ok: true, sinapseDesativada: true });
    expect(await buscarSinapseExata(b.pool, 5, "voces abrem aos sabados")).toBeNull();
    const s = await b.pool.query(`SELECT ativa,desativada_por FROM cascata_sinapses`); expect(s.rows).toEqual([{ ativa: false, desativada_por: 1 }]);
    const r = await b.pool.query(`SELECT estado,mensagem_complementar_rascunho m FROM cascata_revisoes WHERE id=$1`, [id]); expect(r.rows[0]).toMatchObject({ estado: "retificada", m: "Corrigindo: abrimos aos sábados." });
    expect(await retificarRevisao(b.pool, { empresaId: 5, revisaoId: id, usuarioId: 1, motivo: "de novo" })).toMatchObject({ ok: false, codigo: 409 });
  });
  it("29 retificar exige motivo, usuário e clínica certa; rascunho inseguro é recusado", async () => {
    const id = await revisao();
    expect(await retificarRevisao(b.pool, { empresaId: 5, revisaoId: id, usuarioId: 1, motivo: "" })).toMatchObject({ ok: false, codigo: 400 });
    expect(await retificarRevisao(b.pool, { empresaId: 5, revisaoId: id, usuarioId: 0, motivo: "abc" })).toMatchObject({ ok: false, codigo: 403 });
    expect(await retificarRevisao(b.pool, { empresaId: 6, revisaoId: id, usuarioId: 1, motivo: "abc" })).toMatchObject({ ok: false, codigo: 404 });
    expect(await retificarRevisao(b.pool, { empresaId: 5, revisaoId: id, usuarioId: 1, motivo: "abc", mensagemComplementar: "Tome 5 mg" })).toMatchObject({ ok: false, codigo: 400 });
  });
  it("30 rotas: só administrador ratifica; listagem isolada por clínica", async () => {
    const mod = await import("../routes/atendimento-controle");
    let ctx: any = { authenticated: true, empresaId: 5, isPlatformOwner: false, professionalId: 1 };
    const app = express(); app.use(express.json()); app.use((q: any, _r, n) => { q.tenantContext = ctx; n(); }); app.use("/api", mod.default);
    const id = await revisao(); await revisao(6);
    expect((await request(app).get("/api/atendimento/cascata/revisoes")).body.itens).toHaveLength(1);
    expect((await request(app).post(`/api/atendimento/cascata/revisoes/${id}/ratificar`).send({ confirmar: true, gatilho: "voces abrem aos sabados", resposta: "Atendemos de segunda a sexta." })).status).toBe(403);
    ctx = { ...ctx, isPlatformOwner: true };
    expect((await request(app).post(`/api/atendimento/cascata/revisoes/${id}/ratificar`).send({ gatilho: "voces abrem aos sabados", resposta: "Atendemos de segunda a sexta." })).status).toBe(400);
    expect((await request(app).post(`/api/atendimento/cascata/revisoes/${id}/ratificar`).send({ confirmar: true, gatilho: "voces abrem aos sabados", resposta: "Atendemos de segunda a sexta." })).status).toBe(201);
    ctx = { authenticated: false };
    expect((await request(app).get("/api/atendimento/cascata/revisoes")).status).toBe(401);
  });
});
