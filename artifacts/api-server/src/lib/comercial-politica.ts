/**
 * Política comercial POR CLÍNICA (budget_settings com empresa_id) e acesso a orçamentos escopado por clínica.
 * Só SQL parametrizado: a clínica vem sempre da sessão, nunca do corpo da requisição.
 * Recebe `q` (pool) para ser testado em banco descartável.
 */
import type { Pool } from "pg";
import {
  DEFAULT_CART_VOLUME_TIERS, DEFAULT_ITEM_VOLUME_TIERS, type CalcSettings, type CardFee, type VolumeTier,
} from "./budget-calc";
import type { ItemCustoNegociacao, PoliticaNegociacao } from "./budget-negociacao";

export const CARD_FEES_PADRAO: CardFee[] = Array.from({ length: 9 }, (_, i) => {
  const installments = i + 2;
  return { installments, feePct: Math.round((5.59 + 0.6 * (installments - 2)) * 100) / 100 };
});

export interface PoliticaClinica extends CalcSettings, PoliticaNegociacao {
  id: number;
  empresaId: number;
}

type Linha = Record<string, any>;

function mapear(r: Linha): PoliticaClinica {
  return {
    id: Number(r.id), empresaId: Number(r.empresa_id),
    cashDiscountPct: r.cash_discount_pct, down50DiscountPct: r.down50_discount_pct, down30DiscountPct: r.down30_discount_pct,
    maxNoInterestInstallments: r.max_no_interest_installments, planMonths: r.plan_months, planWeeks: r.plan_weeks, planDays: r.plan_days,
    cardFees: (r.card_fees as CardFee[] | null) ?? CARD_FEES_PADRAO, recommendedScenario: r.recommended_scenario,
    passCardFeeDefault: r.pass_card_fee_default,
    itemVolumeTiers: (r.item_volume_tiers as VolumeTier[] | null) ?? DEFAULT_ITEM_VOLUME_TIERS,
    cartVolumeTiers: (r.cart_volume_tiers as VolumeTier[] | null) ?? DEFAULT_CART_VOLUME_TIERS,
    maxTotalDiscountPct: r.max_total_discount_pct,
    descontoExcepcionalAvistaPct: r.desconto_excepcional_avista_pct,
    descontoExcepcionalParceladoPct: r.desconto_excepcional_parcelado_pct,
    entradaMinimaExcecaoPct: r.entrada_minima_excecao_pct,
    margemLiquidaMinimaPct: r.margem_liquida_minima_pct,
    tributosPct: r.tributos_pct,
    negociacaoCadenciadaAtiva: r.negociacao_cadenciada_30min_ativa,
    nomeGerenteFinanceiro: r.nome_gerente_financeiro,
  };
}

/** Lê (e cria, se faltar) a política da clínica. Nunca devolve a de outra clínica. */
export async function lerPoliticaClinica(q: Pool, empresaId: number): Promise<PoliticaClinica> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) throw new Error("empresa_invalida");
  await q.query(
    `INSERT INTO budget_settings (id, empresa_id, card_fees, item_volume_tiers, cart_volume_tiers)
     VALUES (nextval('budget_settings_id_seq'), $1, $2::jsonb, $3::jsonb, $4::jsonb)
     ON CONFLICT (empresa_id) DO NOTHING`,
    [empresaId, JSON.stringify(CARD_FEES_PADRAO), JSON.stringify(DEFAULT_ITEM_VOLUME_TIERS), JSON.stringify(DEFAULT_CART_VOLUME_TIERS)]);
  const r = await q.query(`SELECT * FROM budget_settings WHERE empresa_id=$1`, [empresaId]);
  return mapear(r.rows[0]);
}

export class PoliticaInvalida extends Error {}

const intervalo = (nome: string, v: unknown, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new PoliticaInvalida(`${nome} deve estar entre ${min} e ${max}`);
  return v;
};

export interface AlteracaoPolitica {
  descontoExcepcionalAvistaPct?: unknown; descontoExcepcionalParceladoPct?: unknown; entradaMinimaExcecaoPct?: unknown;
  margemLiquidaMinimaPct?: unknown; tributosPct?: unknown; negociacaoCadenciadaAtiva?: unknown; nomeGerenteFinanceiro?: unknown;
}

/** Atualiza SÓ os parâmetros de negociação extraordinária da clínica (os demais seguem a rota /budget-settings). */
export async function alterarPoliticaNegociacao(q: Pool, empresaId: number, a: AlteracaoPolitica): Promise<PoliticaClinica> {
  await lerPoliticaClinica(q, empresaId);
  const sets: string[] = []; const vals: unknown[] = [];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (a.descontoExcepcionalAvistaPct !== undefined) add("desconto_excepcional_avista_pct", intervalo("desconto à vista", a.descontoExcepcionalAvistaPct, 0, 60));
  if (a.descontoExcepcionalParceladoPct !== undefined) add("desconto_excepcional_parcelado_pct", intervalo("desconto parcelado", a.descontoExcepcionalParceladoPct, 0, 60));
  if (a.entradaMinimaExcecaoPct !== undefined) add("entrada_minima_excecao_pct", intervalo("entrada mínima", a.entradaMinimaExcecaoPct, 0, 100));
  if (a.margemLiquidaMinimaPct !== undefined) add("margem_liquida_minima_pct", intervalo("margem líquida mínima", a.margemLiquidaMinimaPct, 0, 95));
  if (a.tributosPct !== undefined) add("tributos_pct", intervalo("tributos", a.tributosPct, 0, 60));
  if (a.negociacaoCadenciadaAtiva !== undefined) {
    if (typeof a.negociacaoCadenciadaAtiva !== "boolean") throw new PoliticaInvalida("negociacaoCadenciadaAtiva deve ser verdadeiro ou falso");
    add("negociacao_cadenciada_30min_ativa", a.negociacaoCadenciadaAtiva);
  }
  if (a.nomeGerenteFinanceiro !== undefined) {
    const n = typeof a.nomeGerenteFinanceiro === "string" ? a.nomeGerenteFinanceiro.trim() : "";
    if (n.length < 2 || n.length > 60) throw new PoliticaInvalida("nome do gerente deve ter de 2 a 60 caracteres");
    add("nome_gerente_financeiro", n);
  }
  if (sets.length) {
    vals.push(empresaId);
    await q.query(`UPDATE budget_settings SET ${sets.join(",")}, updated_at=now() WHERE empresa_id=$${vals.length}`, vals);
  }
  return lerPoliticaClinica(q, empresaId);
}

// --- Orçamento escopado -----------------------------------------------------------------------------------------------
export interface OrcamentoAprovado {
  id: number; empresaId: number; clienteId: number; totalCents: number;
  itens: Array<{ catalogId: number | null; name: string; sessions: number; unitPriceCents: number; include: boolean; volumeTiers?: VolumeTier[] | null }>;
  settingsSnapshot: Partial<CalcSettings> | null;
}

/** Orçamento ativo do cliente: o aceito mais recente DA CLÍNICA. Outra clínica nunca é lida. */
export async function orcamentoAprovadoDoCliente(q: Pool, empresaId: number, clienteId: number): Promise<OrcamentoAprovado | null> {
  const r = await q.query(
    `SELECT id, empresa_id, client_id, total_cents, items, settings_snapshot FROM budgets
      WHERE empresa_id=$1 AND client_id=$2 AND status='accepted' ORDER BY accepted_at DESC NULLS LAST, id DESC LIMIT 1`,
    [empresaId, clienteId]);
  const b = r.rows[0] as Linha | undefined;
  if (!b) return null;
  return { id: Number(b.id), empresaId: Number(b.empresa_id), clienteId: Number(b.client_id), totalCents: Number(b.total_cents),
    itens: (b.items ?? []) as OrcamentoAprovado["itens"], settingsSnapshot: (b.settings_snapshot as Partial<CalcSettings> | null) ?? null };
}

/** Custo por item: custo cadastrado no catálogo; sem ele NÃO há custo confiável (nunca se presume). */
export async function custosDosItens(q: Pool, itens: OrcamentoAprovado["itens"]): Promise<ItemCustoNegociacao[]> {
  const ids = [...new Set(itens.map((i) => i.catalogId).filter((x): x is number => typeof x === "number"))];
  const mapa = new Map<number, number | null>();
  if (ids.length) {
    const r = await q.query(`SELECT id, custo_unit_cents FROM budget_catalog WHERE id = ANY($1::int[])`, [ids]);
    for (const x of r.rows as Linha[]) mapa.set(Number(x.id), x.custo_unit_cents === null ? null : Number(x.custo_unit_cents));
  }
  return itens.map((i) => ({ include: i.include, sessions: i.sessions, custoUnitCents: i.catalogId !== null ? (mapa.get(i.catalogId) ?? null) : null }));
}

/** Registra evento de orçamento (trilha auditável: quem, quando, de/para). */
export async function registrarEventoOrcamento(q: Pool, e: {
  empresaId: number; budgetId: number; tipo: string; de?: string | null; para?: string | null; usuarioId?: number | null; detalhe?: unknown;
}): Promise<void> {
  await q.query(
    `INSERT INTO budget_eventos (empresa_id, budget_id, tipo, de, para, usuario_id, detalhe) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [e.empresaId, e.budgetId, e.tipo, e.de ?? null, e.para ?? null, e.usuarioId ?? null, e.detalhe === undefined ? null : JSON.stringify(e.detalhe)]);
}

/** Máquina de estados do orçamento. converted e cancelled são finais. */
export const TRANSICOES_ORCAMENTO: Record<string, string[]> = {
  draft: ["presented", "cancelled"],
  presented: ["draft", "accepted", "cancelled"],
  accepted: ["converted", "cancelled"],
  converted: [],
  cancelled: [],
};
export const transicaoPermitida = (de: string, para: string): boolean => de === para || (TRANSICOES_ORCAMENTO[de] ?? []).includes(para);
