/**
 * Crédito pré-pago da mensageria em PostgreSQL descartável (sem rede, dados sintéticos, valores de tarifa
 * FICTÍCIOS só para o teste). Duas clínicas, isenção do Instituto, saldo esgotado, aviso, recarga de teste,
 * reentrega, concorrência, estorno, custo de provedor separado e rotas com isolamento.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

const sessao = vi.hoisted(() => ({ empresaId: 11, autenticado: true }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (q: any, s: any, n: () => void) => {
    if (!sessao.autenticado) { s.status(401).json({ error: "x" }); return; }
    q.tenantContext = { empresaId: sessao.empresaId, authenticated: true, professionalId: 1 }; n();
  },
}));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
let c: typeof import("../lib/mensageria-credito");
let pool: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }>; end: () => Promise<void> };
const A = 11, B = 12, INST = 5;

beforeAll(async () => {
  pool = (await import("@workspace/db")).pool as unknown as typeof pool;
  c = await import("../lib/mensageria-credito");
  await c.garantirTabelasCredito();
  await c.definirTarifa({ empresaId: null, tipo: "recebida", valorCentavos: 10, ativo: true, por: "teste" });
  await c.definirTarifa({ empresaId: null, tipo: "enviada", valorCentavos: 20, ativo: true, por: "teste" });
  await c.definirTarifa({ empresaId: null, tipo: "solucionada", valorCentavos: 50, ativo: true, por: "teste" });
}, 60_000);
afterAll(async () => { try { await pool?.end(); } catch { /* ignora */ } pg.parar(); });

const saldo = async (e: number) => Number((await pool.query(`SELECT saldo_centavos FROM msg_carteira WHERE empresa_id=$1`, [e])).rows[0].saldo_centavos);
const recarga = async (e: number, v: number) => { const r = await c.solicitarRecarga(e, v, "teste", "teste"); await c.confirmarRecarga(r.id, "teste"); return r.id; };

describe("isenção explícita do Instituto", () => {
  it("Instituto nasce isento; evento fica no extrato com cobrado 0 e valor de tabela visível", async () => {
    const r = await c.registrarEvento({ empresaId: INST, tipo: "recebida", chave: "i1", conversaRef: "cli:1" });
    expect(r).toMatchObject({ ok: true, isento: true, valorCobradoCentavos: 0 });
    const v = await c.visaoCredito(INST);
    expect(v.isento).toBe(true);
    expect(v.extrato[0]).toMatchObject({ valor_centavos: 0, valor_tabela_centavos: 10, isento: true });
  });
  it("outra clínica nunca herda a isenção", async () => {
    await recarga(B, 100);
    const r = await c.registrarEvento({ empresaId: B, tipo: "recebida", chave: "b1" });
    expect(r).toMatchObject({ isento: false, valorCobradoCentavos: 10, saldoCentavos: 90 });
    expect(await saldo(INST)).toBe(0);
  });
  it("isenção é administrável e exige motivo", async () => {
    await expect(c.definirIsencao(B, true, " ", "ceo")).rejects.toThrow();
    await c.definirIsencao(B, true, "teste", "ceo");
    expect((await c.registrarEvento({ empresaId: B, tipo: "enviada", chave: "b2" })).valorCobradoCentavos).toBe(0);
    await c.definirIsencao(B, false, "fim do teste", "ceo");
    expect((await c.registrarEvento({ empresaId: B, tipo: "enviada", chave: "b3" })).valorCobradoCentavos).toBe(20);
  });
});

describe("duas clínicas independentes, saldo esgotado e recarga", () => {
  it("saldos e extratos não se misturam", async () => {
    await recarga(A, 25);
    await c.registrarEvento({ empresaId: A, tipo: "recebida", chave: "a1", conversaRef: "cli:9" });
    expect(await saldo(A)).toBe(15);
    expect(await saldo(B)).toBe(70);
    const va = await c.visaoCredito(A);
    expect(va.extrato.every((l: any) => l.chave === undefined)).toBe(true);
    expect(JSON.stringify(va)).not.toContain('"b1"');
  });
  it("sem saldo: não debita, não fica negativo, pausa, avisa uma vez e preserva o evento", async () => {
    const r1 = await c.registrarEvento({ empresaId: A, tipo: "enviada", chave: "a2", conversaRef: "cli:9" }); // 20 > 15
    expect(r1).toMatchObject({ ok: false, situacao: "saldo_insuficiente", saldoCentavos: 15, avisoSemSaldo: true });
    const r2 = await c.registrarEvento({ empresaId: A, tipo: "recebida", chave: "a3" }); // 10 <= 15 mas carteira pausada? cobra só se couber
    expect(await saldo(A)).toBeGreaterThanOrEqual(0);
    const r3 = await c.registrarEvento({ empresaId: A, tipo: "enviada", chave: "a4" });
    expect(r3.avisoSemSaldo).toBeFalsy(); // aviso não repete
    const av = await pool.query(`SELECT COUNT(*)::int n FROM msg_avisos WHERE empresa_id=$1 AND tipo='sem_saldo'`, [A]);
    expect(av.rows[0].n).toBe(1);
    expect((await c.podeAtenderAutomatico(A)).pode).toBe(false);
    expect(r2.ok).toBe(true); // uma recebida de 10 ainda cabia; foi cobrada, sem deixar negativo
    expect(await saldo(A)).toBe(5);
    expect((await c.visaoCredito(A)).mensagensAguardandoSaldo).toBe(2);
  });
  it("solicitar recarga não credita; recarga real não aceita confirmação de teste", async () => {
    const r = await c.solicitarRecarga(A, 100, "prof", "real");
    expect(await saldo(A)).toBe(5);
    expect(await c.confirmarRecarga(r.id, "teste")).toMatchObject({ ok: false, erro: "ambiente_diferente" });
    expect(await saldo(A)).toBe(5);
  });
  it("recarga de teste confirmada: credita uma vez, retoma os pendentes e libera o atendimento", async () => {
    const r = await c.solicitarRecarga(A, 100, "prof", "teste");
    const ok = await c.confirmarRecarga(r.id, "teste");
    expect(ok.ok).toBe(true);
    const de_novo = await c.confirmarRecarga(r.id, "teste");
    expect(de_novo).toMatchObject({ ok: true, jaConfirmada: true });
    // 100 creditados uma vez; pendentes a2 (20) e a4 (20) cobrados na retomada
    expect(await saldo(A)).toBe(5 + 100 - 40);
    expect((await c.visaoCredito(A)).mensagensAguardandoSaldo).toBe(0);
    expect((await c.podeAtenderAutomatico(A)).pode).toBe(true);
    const ext = (await c.visaoCredito(A)).extrato.find((l: any) => l.natureza === "credito");
    expect(ext.descricao).toContain("AMBIENTE DE TESTE");
  });
  it("aviso de saldo baixo uma vez por dia", async () => {
    await pool.query(`UPDATE msg_carteira SET limite_aviso_centavos=100 WHERE empresa_id=$1`, [A]);
    const r1 = await c.registrarEvento({ empresaId: A, tipo: "recebida", chave: "a5" });
    const r2 = await c.registrarEvento({ empresaId: A, tipo: "recebida", chave: "a6" });
    expect(r1.avisoSaldoBaixo).toBe(true);
    expect(r2.avisoSaldoBaixo).toBeFalsy();
  });
});

describe("reentrega, concorrência e estorno", () => {
  it("mesma chave em 20 chamadas simultâneas cobra uma única vez", async () => {
    await recarga(B, 1000);
    const antes = await saldo(B);
    const rs = await Promise.all(Array.from({ length: 20 }, () => c.registrarEvento({ empresaId: B, tipo: "solucionada", chave: "dup-1" })));
    expect(rs.filter((r) => r.situacao === "registrado")).toHaveLength(1);
    expect(await saldo(B)).toBe(antes - 50);
  });
  it("30 eventos distintos com saldo para 10: exatamente 10 cobrados, nunca negativo", async () => {
    const E = 21;
    await recarga(E, 100); // 10 recebidas de 10
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => c.registrarEvento({ empresaId: E, tipo: "recebida", chave: `par-${i}` })));
    expect(rs.filter((r) => r.situacao === "registrado")).toHaveLength(10);
    expect(rs.filter((r) => r.situacao === "saldo_insuficiente")).toHaveLength(20);
    expect(await saldo(E)).toBe(0);
  });
  it("estorno devolve uma única vez, exige motivo e não cruza clínicas", async () => {
    const linha = (await c.visaoCredito(B)).extrato.find((l: any) => l.natureza === "consumo" && l.valor_centavos > 0);
    expect(await c.estornarConsumo(B, linha.id, "", "ceo")).toMatchObject({ ok: false, erro: "motivo_obrigatorio" });
    expect(await c.estornarConsumo(A, linha.id, "tentativa de outra clínica", "ceo")).toMatchObject({ ok: false, erro: "consumo_nao_encontrado" });
    const antes = await saldo(B);
    const ok = await Promise.all([c.estornarConsumo(B, linha.id, "teste", "ceo"), c.estornarConsumo(B, linha.id, "teste", "ceo")]).catch(() => null);
    const depois = await saldo(B);
    expect(depois).toBe(antes + linha.valor_centavos); // somou uma vez só, mesmo em duas tentativas
    expect(ok === null || ok.filter((r) => r.ok).length === 1).toBe(true);
  });
});

describe("tarifas, tempo, conversas e custo de provedor", () => {
  it("mudar a tarifa preserva o histórico e vale só dali em diante", async () => {
    await c.definirTarifa({ empresaId: B, tipo: "recebida", valorCentavos: 7, ativo: true, por: "ceo" });
    const r = await c.registrarEvento({ empresaId: B, tipo: "recebida", chave: "b-nova" });
    expect(r.valorCobradoCentavos).toBe(7);
    expect(Number((await pool.query(`SELECT COUNT(*) n FROM msg_tarifas WHERE tipo_evento='recebida'`)).rows[0].n)).toBe(2);
  });
  it("cobrança por tempo nasce desligada e exige unidade e critério para ligar", async () => {
    const r = await c.registrarEvento({ empresaId: B, tipo: "tempo", chave: "t1" });
    expect(r).toMatchObject({ ok: true, semTarifa: true, valorCobradoCentavos: 0 });
    await expect(c.definirTarifa({ empresaId: null, tipo: "tempo", valorCentavos: 1, ativo: true, por: "x" })).rejects.toThrow();
  });
  it("sem tarifa o evento é registrado como sem_tarifa, valor 0 (nada inventado)", async () => {
    await pool.query(`DELETE FROM msg_tarifas`);
    const r = await c.registrarEvento({ empresaId: B, tipo: "recebida", chave: "sem-t" });
    expect(r).toMatchObject({ semTarifa: true, valorCobradoCentavos: 0 });
  });
  it("conversa com eventos distintos é sinalizada no extrato", async () => {
    await c.definirTarifa({ empresaId: null, tipo: "recebida", valorCentavos: 10, ativo: true, por: "t" });
    await c.definirTarifa({ empresaId: null, tipo: "enviada", valorCentavos: 20, ativo: true, por: "t" });
    await c.registrarEvento({ empresaId: B, tipo: "recebida", chave: "cv-1", conversaRef: "cli:77" });
    await c.registrarEvento({ empresaId: B, tipo: "enviada", chave: "cv-2", conversaRef: "cli:77" });
    const l = (await c.visaoCredito(B)).extrato.filter((x: any) => x.conversa_ref === "cli:77");
    expect(l).toHaveLength(2);
    expect(l.every((x: any) => x.eventosDistintosNaConversa)).toBe(true);
  });
  it("custo do provedor fica à parte do saldo e vazio quando o provedor não informou", async () => {
    const antes = await saldo(B);
    await c.registrarCustoProvedor({ empresaId: B, chave: "ia-1", etapa: "escolha_de_orientacao", provedor: "anthropic", modelo: "claude-sonnet-4-6", inputTokens: 120, outputTokens: 3 });
    await c.registrarCustoProvedor({ empresaId: B, chave: "ia-1", etapa: "escolha_de_orientacao", provedor: "anthropic", modelo: "claude-sonnet-4-6", inputTokens: 120, outputTokens: 3 });
    expect(await saldo(B)).toBe(antes);
    const v = await c.visaoCredito(B);
    expect(v.custosProvedor).toHaveLength(1);
    expect(v.custosProvedor[0].custo_informado).toBeNull();
    expect(v.observacaoCustoProvedor).toContain("não entra neste saldo");
    expect((await c.visaoCredito(A)).custosProvedor).toHaveLength(0);
  });
});

describe("rotas: isolamento e permissões", () => {
  async function app() {
    const express = (await import("express")).default;
    const router = (await import("../routes/mensageria-credito")).default;
    const a = express(); a.use(express.json()); a.use(router); return a;
  }
  it("sem sessão: 401", async () => {
    const request = (await import("supertest")).default;
    sessao.autenticado = false;
    expect((await request(await app()).get("/mensageria/credito")).status).toBe(401);
    sessao.autenticado = true;
  });
  it("a clínica só enxerga a própria carteira e não escolhe a empresa pelo corpo", async () => {
    const request = (await import("supertest")).default;
    sessao.empresaId = A;
    const r = await request(await app()).get("/mensageria/credito?empresaId=12");
    expect(r.status).toBe(200);
    expect(r.body.saldoCentavos).toBe(await saldo(A));
    const rec = await request(await app()).post("/mensageria/credito/recargas").send({ empresaId: B, valorCentavos: 500 });
    expect(rec.body).toMatchObject({ status: "solicitada", creditado: false });
    const dono = await pool.query(`SELECT empresa_id FROM msg_recargas WHERE id=$1`, [rec.body.id]);
    expect(dono.rows[0].empresa_id).toBe(A);
  });
  it("administração é negada fora da instância do CEO", async () => {
    const request = (await import("supertest")).default;
    delete process.env.PADAXOR_AI_BYPASS;
    expect((await request(await app()).put("/mensageria/admin/tarifas").send({})).status).toBe(403);
    expect((await request(await app()).put("/mensageria/admin/isencao/12").send({ isento: true, motivo: "x" })).status).toBe(403);
  });
  it("recarga de teste é proibida em produção e a configuração de IA só aceita modelo conectado", async () => {
    const request = (await import("supertest")).default;
    process.env.PADAXOR_AI_BYPASS = "true"; delete process.env.PADAXOR_CEO_SECRET;
    process.env.NODE_ENV = "production";
    expect((await request(await app()).post("/mensageria/admin/recargas-teste").send({ empresaId: A, valorCentavos: 100 })).status).toBe(403);
    process.env.NODE_ENV = "test";
    sessao.empresaId = A;
    expect((await request(await app()).put("/mensageria/ia/escolha_de_orientacao").send({ provedor: "openai", modelo: "gpt-x" })).status).toBe(400);
    expect((await request(await app()).put("/mensageria/ia/escolha_de_orientacao").send({ provedor: "anthropic", modelo: "claude-sonnet-4-6", orientacoes: "tom acolhedor" })).status).toBe(200);
    delete process.env.PADAXOR_AI_BYPASS;
  });
});
