import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { bancoAtendimentoIsolado } from "./helpers/pg-atendimento-isolado";
import { migrarComercial, reverterComercial } from "../lib/comercial-migracao";
import {
  aplicarDescontoCents, dividirParcelas, parteCents, calculateBudget, DEFAULT_CART_VOLUME_TIERS, DEFAULT_ITEM_VOLUME_TIERS, type CalcSettings,
} from "../lib/budget-calc";
import {
  avaliarNegociacao, lerPedido, pedidoDeCondicaoEspecial, textoCondicoesExcepcionais, type PoliticaNegociacao,
} from "../lib/budget-negociacao";
import {
  lerPoliticaClinica, alterarPoliticaNegociacao, orcamentoAprovadoDoCliente, custosDosItens, PoliticaInvalida, transicaoPermitida,
} from "../lib/comercial-politica";
import {
  abrirNegociacao, processarCadencia, interromperNegociacao, decidirNegociacaoHumana, enviarAprovacaoHumana, type DepsCadencia, type NegociacaoLinha,
} from "../lib/negociacao-cadencia";

// ---------- cálculo exato (sem banco) ----------
describe("calculo decimal exato", () => {
  it("Vf = arredondar(Vo x (1 - d), 2) sem erro de ponto flutuante", () => {
    expect(aplicarDescontoCents(100_000, 22)).toBe(78_000);
    expect(aplicarDescontoCents(33_333, 22)).toBe(26_000); // 33333*0,78=25999,74 -> 26000
    expect(aplicarDescontoCents(1_005, 10)).toBe(905); // 904,5 sobe (metade para cima)
    expect(aplicarDescontoCents(10, 22.5)).toBe(8); // 7,75
    expect(aplicarDescontoCents(100, 0)).toBe(100);
    expect(aplicarDescontoCents(100, 100)).toBe(0);
  });
  it("ultima parcela absorve os centavos e a soma fecha o saldo", () => {
    for (const total of [10_000, 10_001, 99_999, 1, 7]) for (const n of [1, 2, 3, 7, 10]) {
      const d = dividirParcelas(total, n);
      expect(d.todas.length).toBe(n);
      expect(d.todas.reduce((a, b) => a + b, 0)).toBe(total);
    }
    const d = dividirParcelas(10_000, 3);
    expect(d.parcelaCents).toBe(3_333); expect(d.ultimaCents).toBe(3_334);
  });
  it("calculateBudget: parcelas dos cenarios B e C fecham o saldo exato", () => {
    const s: CalcSettings = { cashDiscountPct: 15, down50DiscountPct: 10, down30DiscountPct: 5, maxNoInterestInstallments: 3, planMonths: 3, planWeeks: 13,
      planDays: 90, cardFees: [], recommendedScenario: "B", passCardFeeDefault: true, itemVolumeTiers: DEFAULT_ITEM_VOLUME_TIERS,
      cartVolumeTiers: DEFAULT_CART_VOLUME_TIERS, maxTotalDiscountPct: 40 };
    const r = calculateBudget([{ unitPriceCents: 33_333, sessions: 7, include: true }], s);
    for (const sc of [r.scenarioB, r.scenarioC]) for (const o of sc.installmentOptions) {
      expect(o.installmentCents * (o.installments - 1) + o.lastInstallmentCents).toBe(sc.balanceCents);
    }
    expect(r.scenarioB.downPaymentCents + r.scenarioB.balanceCents).toBe(r.scenarioB.discountedCents);
    expect(parteCents(r.scenarioB.discountedCents, 50)).toBe(r.scenarioB.downPaymentCents);
  });
  it("escada de volume propria do item vence a global", () => {
    const s: CalcSettings = { cashDiscountPct: 0, down50DiscountPct: 0, down30DiscountPct: 0, maxNoInterestInstallments: 1, planMonths: 1, planWeeks: 1,
      planDays: 1, cardFees: [], recommendedScenario: "A", passCardFeeDefault: false, itemVolumeTiers: DEFAULT_ITEM_VOLUME_TIERS, cartVolumeTiers: [],
      maxTotalDiscountPct: 100 };
    const r = calculateBudget([{ unitPriceCents: 10_000, sessions: 10, include: true, volumeTiers: [{ minSessions: 1, discountPct: 20 }] }], s);
    expect(r.items[0].discountPct).toBe(20);
    expect(r.volumeDiscountedCents).toBe(80_000);
  });
});

const politica = (o: Partial<PoliticaNegociacao> = {}): PoliticaNegociacao => ({
  descontoExcepcionalAvistaPct: 22, descontoExcepcionalParceladoPct: 18, entradaMinimaExcecaoPct: 70, margemLiquidaMinimaPct: 20,
  tributosPct: 6, maxNoInterestInstallments: 3, cardFees: [{ installments: 2, feePct: 5.59 }, { installments: 3, feePct: 6.19 }],
  negociacaoCadenciadaAtiva: true, nomeGerenteFinanceiro: "Carlos", ...o,
});
const itens = (custo: number | null) => [{ include: true, sessions: 10, custoUnitCents: custo }];

describe("travas de margem e teto", () => {
  it("dentro do teto, com custo e margem ok: permite Caminho A com valores exatos", () => {
    const r = avaliarNegociacao(1_000_000, itens(30_000), {}, politica());
    expect(r.decisao).toBe("permitida");
    if (r.decisao !== "permitida") return;
    expect(r.caminho).toBe("A_automatico");
    const av = r.condicoes.find((c) => c.forma === "avista")!;
    expect(av.finalCents).toBe(780_000);
    const pa = r.condicoes.find((c) => c.forma === "parcelado")!;
    expect(pa.finalCents).toBe(820_000); expect(pa.entradaCents).toBe(574_000);
    expect(pa.entradaCents + pa.parcelaCents * (pa.parcelas - 1) + pa.ultimaParcelaCents).toBe(pa.finalCents);
  });
  it("sem custo cadastrado em qualquer item: bloqueia e manda para humano", () => {
    expect(avaliarNegociacao(1_000_000, itens(null), {}, politica())).toMatchObject({ decisao: "humano", motivo: "sem_custo_confiavel" });
    expect(avaliarNegociacao(1_000_000, [{ include: true, sessions: 1, custoUnitCents: 10 }, { include: true, sessions: 1, custoUnitCents: null }], {}, politica()))
      .toMatchObject({ decisao: "humano", motivo: "sem_custo_confiavel" });
  });
  it("margem abaixo do minimo bloqueia a concessao automatica", () => {
    expect(avaliarNegociacao(1_000_000, itens(90_000), {}, politica())).toMatchObject({ decisao: "humano", motivo: "margem_abaixo_do_minimo" });
  });
  it("margem exatamente no minimo passa; um centavo abaixo bloqueia", () => {
    const p = politica({ tributosPct: 0, descontoExcepcionalParceladoPct: 0 });
    // à vista: final 780000, margem 20% => custo maximo 624000 (62400 por sessao x 10)
    expect(avaliarNegociacao(1_000_000, itens(62_400), { forma: "avista" }, p).decisao).toBe("permitida");
    expect(avaliarNegociacao(1_000_000, itens(62_401), { forma: "avista" }, p).decisao).toBe("humano");
  });
  it("pedido numerico acima do teto vai para humano; abaixo respeita o pedido", () => {
    expect(avaliarNegociacao(1_000_000, itens(30_000), { descontoPedidoPct: 30 }, politica())).toMatchObject({ decisao: "humano", motivo: "acima_do_teto" });
    const r = avaliarNegociacao(1_000_000, itens(30_000), { descontoPedidoPct: 10, forma: "avista" }, politica());
    expect(r.decisao === "permitida" && r.condicoes[0].finalCents).toBe(900_000);
  });
  it("cadencia desligada na politica: permitida, mas so pelo Caminho B (humano)", () => {
    const r = avaliarNegociacao(1_000_000, itens(30_000), {}, politica({ negociacaoCadenciadaAtiva: false }));
    expect(r).toMatchObject({ decisao: "permitida", caminho: "B_humano" });
  });
  it("orcamento invalido e bloqueado", () => {
    expect(avaliarNegociacao(0, itens(1), {}, politica())).toMatchObject({ decisao: "humano", motivo: "orcamento_invalido" });
    expect(avaliarNegociacao(10.5, itens(1), {}, politica())).toMatchObject({ decisao: "humano", motivo: "orcamento_invalido" });
  });
  it("leitura do pedido do cliente e deterministica", () => {
    expect(pedidoDeCondicaoEspecial("Tem como melhorar o valor? Quero um desconto")).toBe(true);
    expect(pedidoDeCondicaoEspecial("Qual o endereço?")).toBe(false);
    expect(lerPedido("consegue 25% a vista no pix?")).toEqual({ descontoPedidoPct: 25, forma: "avista" });
    expect(lerPedido("posso parcelar com entrada?")).toEqual({ descontoPedidoPct: null, forma: "parcelado" });
  });
  it("texto da proposta usa moeda brasileira", () => {
    const r = avaliarNegociacao(1_000_000, itens(30_000), { forma: "avista" }, politica());
    expect(r.decisao === "permitida" && textoCondicoesExcepcionais(r.condicoes)).toBe("À vista: R$ 7.800,00 (22% de desconto).");
  });
  it("maquina de estados do orcamento", () => {
    expect(transicaoPermitida("draft", "accepted")).toBe(false);
    expect(transicaoPermitida("presented", "accepted")).toBe(true);
    expect(transicaoPermitida("cancelled", "draft")).toBe(false);
    expect(transicaoPermitida("converted", "cancelled")).toBe(false);
  });
});

// ---------- banco isolado ----------
let b: Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
beforeAll(async () => {
  b = await bancoAtendimentoIsolado();
  // Esquema ANTIGO (antes da migração): uma linha global id=1 e orçamentos sem empresa.
  await b.pool.query(`
    CREATE TABLE budget_catalog(id serial primary key,name text unique,unit_price_cents integer default 0);
    CREATE TABLE budget_settings(id integer primary key default 1,cash_discount_pct real not null default 15,down50_discount_pct real not null default 10,
      down30_discount_pct real not null default 5,max_no_interest_installments integer not null default 3,plan_months integer not null default 3,
      plan_weeks integer not null default 13,plan_days integer not null default 90,card_fees jsonb,recommended_scenario text not null default 'B',
      pass_card_fee_default boolean not null default true,item_volume_tiers jsonb,cart_volume_tiers jsonb,max_total_discount_pct real not null default 40,
      updated_at timestamptz not null default now());
    CREATE TABLE budgets(id serial primary key,client_id integer,status text not null default 'draft',items jsonb not null default '[]',
      settings_snapshot jsonb,total_cents integer not null default 0,accepted_at timestamptz);
    INSERT INTO budget_settings(id,cash_discount_pct) VALUES (1,17);
    INSERT INTO budgets(client_id,status,total_cents,items) VALUES (1,'accepted',500000,'[{"catalogId":1,"include":true,"sessions":2,"unitPriceCents":250000,"name":"X"}]');
    INSERT INTO budget_catalog(name,unit_price_cents) VALUES ('Item com custo',250000);`);
}, 60_000);
afterAll(async () => b?.fechar());

describe("migracao multiempresa", () => {
  it("migra preservando dados antigos, e e idempotente", async () => {
    await migrarComercial(b.pool); await migrarComercial(b.pool);
    const s = (await b.pool.query("SELECT id,empresa_id,cash_discount_pct,desconto_excepcional_avista_pct,nome_gerente_financeiro FROM budget_settings")).rows;
    expect(s).toEqual([{ id: 1, empresa_id: 5, cash_discount_pct: 17, desconto_excepcional_avista_pct: 22, nome_gerente_financeiro: "Carlos" }]);
    const o = (await b.pool.query("SELECT empresa_id,total_cents,status FROM budgets")).rows;
    expect(o).toEqual([{ empresa_id: 5, total_cents: 500000, status: "accepted" }]);
  });
  it("cada clinica recebe a propria politica e nao enxerga a de outra", async () => {
    const p5 = await lerPoliticaClinica(b.pool, 5);
    expect(p5.cashDiscountPct).toBe(17);
    const p9 = await lerPoliticaClinica(b.pool, 9);
    expect(p9.cashDiscountPct).toBe(15);
    expect(p9.id).toBeGreaterThanOrEqual(1000);
    await alterarPoliticaNegociacao(b.pool, 9, { descontoExcepcionalAvistaPct: 10, nomeGerenteFinanceiro: "Marina", negociacaoCadenciadaAtiva: true });
    expect((await lerPoliticaClinica(b.pool, 9)).descontoExcepcionalAvistaPct).toBe(10);
    expect((await lerPoliticaClinica(b.pool, 5)).descontoExcepcionalAvistaPct).toBe(22);
    expect((await lerPoliticaClinica(b.pool, 5)).nomeGerenteFinanceiro).toBe("Carlos");
  });
  it("valores invalidos de politica sao recusados", async () => {
    await expect(alterarPoliticaNegociacao(b.pool, 5, { descontoExcepcionalAvistaPct: 120 })).rejects.toBeInstanceOf(PoliticaInvalida);
    await expect(alterarPoliticaNegociacao(b.pool, 5, { nomeGerenteFinanceiro: " " })).rejects.toBeInstanceOf(PoliticaInvalida);
    await expect(alterarPoliticaNegociacao(b.pool, 5, { negociacaoCadenciadaAtiva: "sim" })).rejects.toBeInstanceOf(PoliticaInvalida);
  });
  it("orcamento aprovado e lido SOMENTE da propria clinica", async () => {
    expect((await orcamentoAprovadoDoCliente(b.pool, 5, 1))?.totalCents).toBe(500000);
    expect(await orcamentoAprovadoDoCliente(b.pool, 9, 1)).toBeNull();
  });
  it("custo: item sem custo cadastrado e reportado como nulo; com custo, numerico", async () => {
    const o = (await orcamentoAprovadoDoCliente(b.pool, 5, 1))!;
    expect((await custosDosItens(b.pool, o.itens))[0].custoUnitCents).toBeNull();
    await b.pool.query("UPDATE budget_catalog SET custo_unit_cents=40000 WHERE id=1");
    expect((await custosDosItens(b.pool, o.itens))[0].custoUnitCents).toBe(40000);
  });
});

// ---------- cadência de 30 minutos com relógio controlado ----------
function ambiente(cliente?: number) {
  let agora = new Date("2026-11-23T12:00:00.000Z");
  const enviados: { chave: string; texto: string; em: string }[] = [];
  let permitido: { ok: true } | { ok: false; motivo: string } = { ok: true };
  const deps: DepsCadencia = {
    agora: () => agora,
    frase: async (_n, chave, vars) => `[${chave}] ${Object.values(vars).join("|")}`,
    enviar: async (n, texto, chave) => { if (cliente !== undefined && n.clienteId !== cliente) return true; enviados.push({ chave, texto, em: agora.toISOString() }); return true; },
    podeEnviar: async () => permitido,
  };
  return { deps, enviados, avancar: (min: number) => { agora = new Date(agora.getTime() + min * 60_000); }, inicio: () => agora,
    bloquear: (motivo: string) => { permitido = { ok: false, motivo }; } };
}
const oferta = async () => {
  const r = avaliarNegociacao(1_000_000, itens(30_000), { forma: "avista" }, politica());
  if (r.decisao !== "permitida") throw new Error("esperado permitida");
  return { condicoes: r.condicoes, gerente: "Carlos" };
};
const abrir = async (a: ReturnType<typeof ambiente>, cliente: number, caminho: "A_automatico" | "B_humano" = "A_automatico") =>
  abrirNegociacao(b.pool, { empresaId: 5, clienteId: cliente, budgetId: 1, canal: "whatsapp", contato: "5511999990000", caminho, oferta: await oferta(),
    motivo: null, mensagemOrigem: "quero um desconto", agora: a.inicio() });

describe("cadencia de 30 minutos (relogio controlado)", () => {
  it("envia nos minutos 0, 10, 20 e 30, uma vez cada, na ordem", async () => {
    const a = ambiente(101); expect(await abrir(a, 101)).not.toBeNull();
    await processarCadencia(b.pool, a.deps);
    expect(a.enviados.map((x) => x.chave)).toEqual(["negociacao_inicio"]);
    a.avancar(9); await processarCadencia(b.pool, a.deps); expect(a.enviados.length).toBe(1);
    a.avancar(1); await processarCadencia(b.pool, a.deps); expect(a.enviados.length).toBe(2);
    await processarCadencia(b.pool, a.deps); expect(a.enviados.length).toBe(2); // sem duplicidade na mesma janela
    a.avancar(10); await processarCadencia(b.pool, a.deps);
    a.avancar(10); await processarCadencia(b.pool, a.deps);
    expect(a.enviados.map((x) => x.chave)).toEqual(["negociacao_inicio", "negociacao_andamento_10", "negociacao_andamento_20", "negociacao_proposta_final"]);
    expect(a.enviados[3].texto).toContain("R$ 7.800,00");
    a.avancar(60); await processarCadencia(b.pool, a.deps); expect(a.enviados.length).toBe(4);
    expect((await b.pool.query("SELECT estado FROM negociacoes_comerciais WHERE cliente_id=101")).rows[0].estado).toBe("concluida");
  });
  it("worker parado por 40 minutos: envia uma etapa por passada, sem pular ordem", async () => {
    const a = ambiente(102); await abrir(a, 102); a.avancar(40);
    const ordem: string[] = [];
    for (let i = 0; i < 6; i++) { await processarCadencia(b.pool, a.deps); }
    ordem.push(...a.enviados.map((x) => x.chave));
    expect(ordem).toEqual(["negociacao_inicio", "negociacao_andamento_10", "negociacao_andamento_20", "negociacao_proposta_final"]);
  });
  it("duas instancias do worker na mesma passada nao duplicam", async () => {
    const a = ambiente(103); await abrir(a, 103);
    await Promise.all([processarCadencia(b.pool, a.deps), processarCadencia(b.pool, a.deps)]);
    expect(a.enviados.filter((x) => x.chave === "negociacao_inicio").length).toBe(1);
  });
  it("mensagem nova do cliente no meio pausa tudo, sem envio e sem duplicar", async () => {
    const a = ambiente(104); await abrir(a, 104);
    await processarCadencia(b.pool, a.deps); a.avancar(5);
    expect((await interromperNegociacao(b.pool, 5, 104, "cliente_escreveu"))?.clienteId).toBe(104);
    expect(await interromperNegociacao(b.pool, 5, 104, "cliente_escreveu")).toBeNull(); // idempotente
    a.avancar(60); await processarCadencia(b.pool, a.deps);
    expect(a.enviados.length).toBe(1);
    const j = (await b.pool.query("SELECT j.etapa,j.estado FROM negotiation_cadence_jobs j JOIN negociacoes_comerciais n ON n.id=j.negociacao_id WHERE cliente_id=104 ORDER BY etapa")).rows;
    expect(j.map((x) => x.estado)).toEqual(["enviado", "pausado", "pausado", "pausado"]);
  });
  it("modo humano / bloqueio emergencial durante a cadencia pausa sem enviar", async () => {
    const a = ambiente(105); await abrir(a, 105); a.bloquear("modo_humano");
    await processarCadencia(b.pool, a.deps);
    expect(a.enviados.length).toBe(0);
    expect((await b.pool.query("SELECT estado,motivo FROM negociacoes_comerciais WHERE cliente_id=105")).rows[0]).toEqual({ estado: "pausada", motivo: "modo_humano" });
  });
  it("nao abre segunda negociacao ativa para o mesmo orcamento", async () => {
    const a = ambiente(106); expect(await abrir(a, 106)).not.toBeNull(); expect(await abrir(a, 106)).toBeNull();
  });
  it("registra toda proposta e decisao na trilha", async () => {
    const n = (await b.pool.query("SELECT count(*)::int c FROM cascata_eventos WHERE tipo LIKE 'negociacao_%'")).rows[0].c;
    const m = (await b.pool.query("SELECT count(*)::int c FROM budget_eventos WHERE tipo='negociacao_etapa_enviada'")).rows[0].c;
    expect(n).toBeGreaterThan(5); expect(m).toBeGreaterThanOrEqual(4);
  });
});

describe("Caminho B: autorizacao humana real", () => {
  it("nao envia nada sozinho; so apos aprovacao humana envia a frase de autorizacao, uma vez", async () => {
    const a = ambiente(201); const r = await abrir(a, 201, "B_humano");
    await processarCadencia(b.pool, a.deps); a.avancar(60); await processarCadencia(b.pool, a.deps);
    expect(a.enviados.length).toBe(0);
    const dec = await decidirNegociacaoHumana(b.pool, { empresaId: 5, negociacaoId: r!.id, usuarioId: 77, aprovar: true });
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    expect(await enviarAprovacaoHumana(b.pool, dec.negociacao, a.deps)).toBe(true);
    expect(await enviarAprovacaoHumana(b.pool, dec.negociacao, a.deps)).toBe(false);
    expect(a.enviados.map((x) => x.chave)).toEqual(["negociacao_gestao_aprovou"]);
    expect((await decidirNegociacaoHumana(b.pool, { empresaId: 5, negociacaoId: r!.id, usuarioId: 77, aprovar: false })).ok).toBe(false);
  });
  it("decisao de outra clinica e recusada", async () => {
    const a = ambiente(202); const r = await abrir(a, 202, "B_humano");
    expect(await decidirNegociacaoHumana(b.pool, { empresaId: 9, negociacaoId: r!.id, usuarioId: 1, aprovar: true })).toEqual({ ok: false, erro: "negociacao_nao_encontrada" });
  });
  it("recusa humana nao envia nada", async () => {
    const a = ambiente(203); const r = await abrir(a, 203, "B_humano");
    const dec = await decidirNegociacaoHumana(b.pool, { empresaId: 5, negociacaoId: r!.id, usuarioId: 77, aprovar: false });
    expect(dec.ok && dec.negociacao.estado).toBe("recusada_gerente");
    expect(a.enviados.length).toBe(0);
  });
});

describe("reversao da migracao", () => {
  it("recusa reverter com dados de outras clinicas e reverte quando seguro", async () => {
    await expect(reverterComercial(b.pool)).rejects.toThrow(/reversao_recusada/);
    await reverterComercial(b.pool, { forcar: true });
    const c = (await b.pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='budgets' AND column_name='empresa_id'")).rows;
    expect(c.length).toBe(0);
    expect((await b.pool.query("SELECT count(*)::int c FROM budgets")).rows[0].c).toBe(1); // orcamento antigo intacto
    await migrarComercial(b.pool); // e re-migra
    expect((await b.pool.query("SELECT empresa_id FROM budgets")).rows[0].empresa_id).toBe(5);
  });
});

export type _Tipo = NegociacaoLinha;
