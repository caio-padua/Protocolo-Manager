/**
 * MOTOR DETERMINÍSTICO DA NEGOCIAÇÃO EXTRAORDINÁRIA.
 * Recebe o total aprovado do orçamento (centavos) e decide, só com aritmética inteira, se uma condição
 * extraordinária pode ser oferecida automaticamente. Nenhuma IA entra aqui: IA nunca calcula dinheiro.
 *
 * Vf = arredondar(Vo x (1 - d), 2); entrada, saldo e parcelas em centavos (última parcela absorve a diferença).
 * Trava de margem: Margem = (Receita líquida - Custo total) / Receita líquida.
 * Sem custo confiável de TODOS os itens incluídos, ou margem abaixo do mínimo, ou pedido acima do teto: HUMANO.
 */
import { aplicarDescontoCents, dividirParcelas, parteCents, pctParaBps, type CardFee } from "./budget-calc";

export interface PoliticaNegociacao {
  descontoExcepcionalAvistaPct: number;
  descontoExcepcionalParceladoPct: number;
  entradaMinimaExcecaoPct: number;
  margemLiquidaMinimaPct: number;
  tributosPct: number;
  maxNoInterestInstallments: number;
  cardFees: CardFee[];
  negociacaoCadenciadaAtiva: boolean;
  nomeGerenteFinanceiro: string;
}

export interface ItemCustoNegociacao { include: boolean; sessions: number; custoUnitCents: number | null }

export type FormaPagamentoExcecao = "avista" | "parcelado";

export interface PedidoNegociacao {
  /** Percentual pedido pelo cliente, quando ele citou um número. null = pediu "condição melhor" sem número. */
  descontoPedidoPct?: number | null;
  /** Forma citada pelo cliente; null = avaliar as duas. */
  forma?: FormaPagamentoExcecao | null;
}

export type MotivoHumano =
  | "orcamento_invalido" | "sem_custo_confiavel" | "margem_abaixo_do_minimo" | "acima_do_teto" | "sem_receita_liquida";

export interface CondicaoExcepcional {
  forma: FormaPagamentoExcecao;
  baseCents: number;
  descontoPct: number;
  finalCents: number;
  entradaCents: number;
  saldoCents: number;
  parcelas: number;
  parcelaCents: number;
  ultimaParcelaCents: number;
  custoCents: number;
  receitaLiquidaCents: number;
  margemBps: number;
}

export type ResultadoNegociacao =
  | { decisao: "permitida"; condicoes: CondicaoExcepcional[]; caminho: "A_automatico" | "B_humano"; motivoCaminho: string | null }
  | { decisao: "humano"; motivo: MotivoHumano; detalhe?: string };

export function custoTotalCents(itens: ItemCustoNegociacao[]): number | null {
  const incluidos = itens.filter((i) => i.include && i.sessions > 0);
  if (incluidos.length === 0) return null;
  let total = 0;
  for (const i of incluidos) {
    if (i.custoUnitCents === null || !Number.isFinite(i.custoUnitCents) || i.custoUnitCents <= 0) return null;
    total += Math.round(i.custoUnitCents) * Math.floor(i.sessions);
  }
  return total;
}

function avaliarForma(
  forma: FormaPagamentoExcecao, voCents: number, pct: number, custo: number, p: PoliticaNegociacao,
): { ok: true; c: CondicaoExcepcional } | { ok: false; motivo: MotivoHumano } {
  const finalCents = aplicarDescontoCents(voCents, pct);
  const parcelas = forma === "parcelado" ? Math.max(1, Math.floor(p.maxNoInterestInstallments)) : 1;
  const entradaCents = forma === "parcelado" ? parteCents(finalCents, p.entradaMinimaExcecaoPct) : finalCents;
  const saldoCents = finalCents - entradaCents;
  const div = dividirParcelas(saldoCents, parcelas);
  const tributos = parteCents(finalCents, p.tributosPct);
  const taxaPct = forma === "parcelado" && parcelas >= 2 ? (p.cardFees.find((f) => f.installments === parcelas)?.feePct ?? 0) : 0;
  const taxaCartao = parteCents(saldoCents, taxaPct);
  const receitaLiquidaCents = finalCents - tributos - taxaCartao;
  if (receitaLiquidaCents <= 0) return { ok: false, motivo: "sem_receita_liquida" };
  const margemBps = Math.floor(((receitaLiquidaCents - custo) * 10_000) / receitaLiquidaCents);
  if (margemBps < pctParaBps(p.margemLiquidaMinimaPct)) return { ok: false, motivo: "margem_abaixo_do_minimo" };
  return { ok: true, c: { forma, baseCents: voCents, descontoPct: pct, finalCents, entradaCents, saldoCents, parcelas,
    parcelaCents: div.parcelaCents, ultimaParcelaCents: div.ultimaCents, custoCents: custo, receitaLiquidaCents, margemBps } };
}

export function avaliarNegociacao(
  totalAprovadoCents: number, itens: ItemCustoNegociacao[], pedido: PedidoNegociacao, p: PoliticaNegociacao,
): ResultadoNegociacao {
  if (!Number.isInteger(totalAprovadoCents) || totalAprovadoCents <= 0) return { decisao: "humano", motivo: "orcamento_invalido" };
  const formas: FormaPagamentoExcecao[] = pedido.forma ? [pedido.forma] : ["avista", "parcelado"];
  const teto = (f: FormaPagamentoExcecao) => f === "avista" ? p.descontoExcepcionalAvistaPct : p.descontoExcepcionalParceladoPct;
  // Pedido numérico acima do teto de TODAS as formas avaliadas: nunca se negocia sem humano.
  const pedidoPct = pedido.descontoPedidoPct ?? null;
  if (pedidoPct !== null && pedidoPct > Math.max(...formas.map(teto))) {
    return { decisao: "humano", motivo: "acima_do_teto", detalhe: `pedido ${pedidoPct}%` };
  }
  const custo = custoTotalCents(itens);
  if (custo === null) return { decisao: "humano", motivo: "sem_custo_confiavel" };
  const condicoes: CondicaoExcepcional[] = [];
  let ultimoMotivo: MotivoHumano = "margem_abaixo_do_minimo";
  for (const f of formas) {
    const pct = pedidoPct !== null ? Math.min(pedidoPct, teto(f)) : teto(f);
    if (pct <= 0) { ultimoMotivo = "acima_do_teto"; continue; }
    const r = avaliarForma(f, totalAprovadoCents, pct, custo, p);
    if (r.ok) condicoes.push(r.c); else ultimoMotivo = r.motivo;
  }
  if (condicoes.length === 0) return { decisao: "humano", motivo: ultimoMotivo };
  // Cadência automática só quando o gerente a ligou na política; do contrário a concessão exige aprovação humana real.
  return p.negociacaoCadenciadaAtiva
    ? { decisao: "permitida", condicoes, caminho: "A_automatico", motivoCaminho: null }
    : { decisao: "permitida", condicoes, caminho: "B_humano", motivoCaminho: "cadencia_desligada_na_politica" };
}

// --- Leitura do pedido do cliente (texto livre -> parâmetros fechados; sem IA) ---------------------------------
const SEM_ACENTO = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Pedido de condição melhor? Palavras de negociação, nunca valor inventado. */
export function pedidoDeCondicaoEspecial(texto: string): boolean {
  return /\b(desconto|abater|abatimento|negoci\w*|mais barat\w*|melhor (condicao|preco|valor|oferta)|baixar o (preco|valor)|reduz\w* o (preco|valor)|faz\w* (por|um preco)|pode melhorar|tem (como|jeito) melhorar|condicao especial|valor menor)\b/.test(SEM_ACENTO(texto));
}

export function lerPedido(texto: string): PedidoNegociacao {
  const t = SEM_ACENTO(texto);
  const m = t.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*(%|por ?cento)/);
  const pct = m ? Number(m[1].replace(",", ".")) : null;
  const avista = /\b(a vista|a-vista|avista|pix|dinheiro)\b/.test(t);
  const parcelado = /\b(parcel\w*|entrada|cartao|dividir|dividido)\b/.test(t);
  return { descontoPedidoPct: pct !== null && Number.isFinite(pct) ? pct : null, forma: avista && !parcelado ? "avista" : parcelado && !avista ? "parcelado" : null };
}

// --- Formatação (apenas exibição de centavos já calculados) -------------------------------------------------------
export function moedaBRL(cents: number): string {
  const neg = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const inteiro = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg}R$ ${inteiro},${String(abs % 100).padStart(2, "0")}`;
}
const pctBR = (n: number) => String(n).replace(".", ",");

export function textoCondicaoExcepcional(c: CondicaoExcepcional): string {
  if (c.forma === "avista") return `À vista: ${moedaBRL(c.finalCents)} (${pctBR(c.descontoPct)}% de desconto).`;
  const iguais = c.parcelas === 1 || c.parcelaCents === c.ultimaParcelaCents;
  const parcelas = c.parcelas === 1 ? `saldo de ${moedaBRL(c.saldoCents)} em parcela única`
    : iguais ? `saldo em ${c.parcelas}x de ${moedaBRL(c.parcelaCents)}`
    : `saldo em ${c.parcelas}x (${c.parcelas - 1}x de ${moedaBRL(c.parcelaCents)} e a última de ${moedaBRL(c.ultimaParcelaCents)})`;
  return `Parcelado: total ${moedaBRL(c.finalCents)} (${pctBR(c.descontoPct)}% de desconto), entrada de ${moedaBRL(c.entradaCents)} e ${parcelas}.`;
}

export function textoCondicoesExcepcionais(cs: CondicaoExcepcional[]): string {
  return cs.map(textoCondicaoExcepcional).join("\n\n");
}

/** Linhas da proposta padrão (cenários A, B e C do motor de orçamento), sem recalcular nada aqui. */
export function textoCondicoesPadrao(r: {
  scenarioA: { finalCents: number; discountPct: number };
  scenarioB: { discountedCents: number; discountPct: number; downPaymentCents: number; installmentOptions: { installments: number; installmentCents: number; lastInstallmentCents: number }[] };
  scenarioC: { discountedCents: number; discountPct: number; downPaymentCents: number; installmentOptions: { installments: number; installmentCents: number; lastInstallmentCents: number }[] };
}): string {
  const parc = (o: { installmentOptions: { installments: number; installmentCents: number; lastInstallmentCents: number }[] }) => {
    const u = o.installmentOptions[o.installmentOptions.length - 1];
    if (!u) return "";
    return u.installments === 1 ? "saldo em parcela única" : `saldo em até ${u.installments}x de ${moedaBRL(u.installmentCents)}`;
  };
  return [
    `À vista: ${moedaBRL(r.scenarioA.finalCents)} (${pctBR(r.scenarioA.discountPct)}% de desconto).`,
    `Entrada de 50%: total ${moedaBRL(r.scenarioB.discountedCents)}, entrada de ${moedaBRL(r.scenarioB.downPaymentCents)} e ${parc(r.scenarioB)}.`,
    `Entrada de 30%: total ${moedaBRL(r.scenarioC.discountedCents)}, entrada de ${moedaBRL(r.scenarioC.downPaymentCents)} e ${parc(r.scenarioC)}.`,
  ].join("\n\n");
}

// --- Cadência de 30 minutos ----------------------------------------------------------------------------------------
export const MINUTOS_CADENCIA = [0, 10, 20, 30] as const;
export const FRASES_CADENCIA = ["negociacao_inicio", "negociacao_andamento_10", "negociacao_andamento_20", "negociacao_proposta_final"] as const;

/** Instantes (ms) de cada disparo a partir do início. O relógio é sempre injetado: testes controlam o tempo. */
export function agendaCadencia(inicioMs: number): number[] {
  return MINUTOS_CADENCIA.map((m) => inicioMs + m * 60_000);
}

/** Primeiro nome para uso natural no texto. */
export function primeiroNome(nome: string | null | undefined): string {
  const n = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
}

/** Condição aprovada por humano autorizado (pode exceder o teto automático). Só aritmética; margem é informada, não bloqueia. */
export function montarCondicaoHumana(
  voCents: number, forma: FormaPagamentoExcecao, pct: number, p: PoliticaNegociacao, custoCents: number | null,
): CondicaoExcepcional {
  const finalCents = aplicarDescontoCents(voCents, pct);
  const parcelas = forma === "parcelado" ? Math.max(1, Math.floor(p.maxNoInterestInstallments)) : 1;
  const entradaCents = forma === "parcelado" ? parteCents(finalCents, p.entradaMinimaExcecaoPct) : finalCents;
  const saldoCents = finalCents - entradaCents;
  const div = dividirParcelas(saldoCents, parcelas);
  const receitaLiquidaCents = finalCents - parteCents(finalCents, p.tributosPct);
  const custo = custoCents ?? 0;
  const margemBps = receitaLiquidaCents > 0 && custoCents !== null ? Math.floor(((receitaLiquidaCents - custo) * 10_000) / receitaLiquidaCents) : 0;
  return { forma, baseCents: voCents, descontoPct: pct, finalCents, entradaCents, saldoCents, parcelas,
    parcelaCents: div.parcelaCents, ultimaParcelaCents: div.ultimaCents, custoCents: custo, receitaLiquidaCents, margemBps };
}
