import type { Pool, PoolClient } from "pg";
import { montarMatriz, type CelulaMatriz, type LinhaMatriz } from "./matriz-fornecedores";

type Consulta = Pick<Pool | PoolClient, "query">;

export type Categoria = LinhaMatriz["categoria"];
export const CATEGORIAS: Categoria[] = ["IM", "EV", "SC", "ID", "IMPLANTE", "OUTRAS", "SEM_VIA"];
export type Arredondamento = "nenhum" | "inteiro" | "90";
export type ReferenciaModo = "maior" | "media" | "menor";
export type ModoCategoria = "auto" | "congelado";

export type Parametros = {
  fretePct: number; perdaPct: number; impostosPct: number; cartaoPct: number; comissaoPct: number; despesasPct: number;
  arredondamento: Arredondamento; referenciaModo: ReferenciaModo;
};
export type ConfigCategoria = { categoria: Categoria; margemPct: number; modo: ModoCategoria };

export const PARAMETROS_ZERO: Parametros = {
  fretePct: 0, perdaPct: 0, impostosPct: 0, cartaoPct: 0, comissaoPct: 0, despesasPct: 0,
  arredondamento: "nenhum", referenciaModo: "maior",
};

export type Formacao = {
  referencia: number; custoEfetivo: number; impostos: number; cartao: number; comissao: number; despesas: number;
  lucro: number; venda: number; margemReal: number;
};

/**
 * Venda = custo efetivo ÷ (1 − impostos − cartão − comissão − despesas − margem).
 * Frete e perda incidem sobre o custo; o restante incide sobre a venda. A margem é sobre a venda.
 * Devolve null quando a soma passa de 95% (preço inviável): nunca inventa número.
 */
export function formarPreco(referenciaCentavos: number, margemPct: number, p: Parametros): Formacao | null {
  if (!Number.isFinite(referenciaCentavos) || referenciaCentavos <= 0) return null;
  const custoEfetivo = referenciaCentavos * (1 + p.fretePct / 100) * (1 + p.perdaPct / 100);
  const divisor = 1 - (p.impostosPct + p.cartaoPct + p.comissaoPct + p.despesasPct + margemPct) / 100;
  if (divisor < 0.05) return null;
  const bruto = custoEfetivo / divisor;
  const venda = p.arredondamento === "inteiro" ? Math.ceil(bruto / 100) * 100
    : p.arredondamento === "90" ? Math.max(90, Math.ceil((bruto - 90) / 100) * 100 + 90)
    : Math.round(bruto);
  const impostos = (venda * p.impostosPct) / 100, cartao = (venda * p.cartaoPct) / 100;
  const comissao = (venda * p.comissaoPct) / 100, despesas = (venda * p.despesasPct) / 100;
  const lucro = venda - custoEfetivo - impostos - cartao - comissao - despesas;
  return { referencia: referenciaCentavos, custoEfetivo, impostos, cartao, comissao, despesas, lucro, venda, margemReal: (lucro / venda) * 100 };
}

/** Referência de custo por unidade entre as ofertas dos laboratórios ativos. Sem oferta = null. */
export function referenciaDe(celulas: Pick<CelulaMatriz, "custoUnitarioCentavos">[], modo: ReferenciaModo): number | null {
  const vs = celulas.map((c) => c.custoUnitarioCentavos).filter((v) => v > 0);
  if (!vs.length) return null;
  if (modo === "maior") return Math.max(...vs);
  if (modo === "menor") return Math.min(...vs);
  return Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
}

const num = (v: unknown) => Number(v ?? 0);

export async function lerParametros(db: Consulta, empresaId: number): Promise<Parametros> {
  const { rows } = await db.query(`SELECT * FROM precificacao_parametros WHERE empresa_id=$1`, [empresaId]);
  const r = rows[0];
  if (!r) return { ...PARAMETROS_ZERO };
  return {
    fretePct: num(r.frete_pct), perdaPct: num(r.perda_pct), impostosPct: num(r.impostos_pct), cartaoPct: num(r.cartao_pct),
    comissaoPct: num(r.comissao_pct), despesasPct: num(r.despesas_pct),
    arredondamento: r.arredondamento, referenciaModo: r.referencia_modo,
  };
}

export async function lerCategorias(db: Consulta, empresaId: number): Promise<ConfigCategoria[]> {
  const { rows } = await db.query(`SELECT categoria, margem_pct, modo FROM precificacao_categorias WHERE empresa_id=$1`, [empresaId]);
  const mapa = new Map<string, { margemPct: number; modo: ModoCategoria }>(rows.map((r) => [r.categoria, { margemPct: num(r.margem_pct), modo: r.modo }]));
  return CATEGORIAS.map((categoria) => ({ categoria, margemPct: mapa.get(categoria)?.margemPct ?? 0, modo: mapa.get(categoria)?.modo ?? "congelado" }));
}

export class ErroPrecificacao extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function pct(v: unknown, nome: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 95) throw new ErroPrecificacao(400, `${nome}: informe um percentual entre 0 e 95.`);
  return Math.round(v * 100) / 100;
}

export function validarConfiguracao(corpo: unknown): { parametros: Parametros; categorias: ConfigCategoria[] } {
  const b = corpo as { parametros?: Record<string, unknown>; categorias?: unknown } | null;
  const p = b?.parametros;
  if (!p || typeof p !== "object" || !Array.isArray(b?.categorias)) throw new ErroPrecificacao(400, "Envie parâmetros e categorias.");
  if (!["nenhum", "inteiro", "90"].includes(String(p.arredondamento))) throw new ErroPrecificacao(400, "Arredondamento inválido.");
  if (!["maior", "media", "menor"].includes(String(p.referenciaModo))) throw new ErroPrecificacao(400, "Regra de referência inválida.");
  const parametros: Parametros = {
    fretePct: pct(p.fretePct, "Frete"), perdaPct: pct(p.perdaPct, "Perda"), impostosPct: pct(p.impostosPct, "Impostos"),
    cartaoPct: pct(p.cartaoPct, "Cartão"), comissaoPct: pct(p.comissaoPct, "Comissão"), despesasPct: pct(p.despesasPct, "Despesas"),
    arredondamento: p.arredondamento as Arredondamento, referenciaModo: p.referenciaModo as ReferenciaModo,
  };
  const vistos = new Set<string>();
  const categorias = (b!.categorias as Record<string, unknown>[]).map((c) => {
    if (!CATEGORIAS.includes(c.categoria as Categoria) || vistos.has(String(c.categoria))) throw new ErroPrecificacao(400, "Categoria inválida ou repetida.");
    vistos.add(String(c.categoria));
    if (c.modo !== "auto" && c.modo !== "congelado") throw new ErroPrecificacao(400, "Interruptor inválido.");
    return { categoria: c.categoria as Categoria, margemPct: pct(c.margemPct, `Margem ${String(c.categoria)}`), modo: c.modo as ModoCategoria };
  });
  return { parametros, categorias };
}

type Ator = number | null;

async function registrar(db: Consulta, e: number, variante: number, alvo: "matriz" | "orcamento" | "substancia",
  alvoId: number | null, antes: number | null, depois: number, origem: string, ator: Ator) {
  await db.query(
    `INSERT INTO preco_publicado_historico (empresa_id, variante_id, alvo, alvo_id, antes_centavos, depois_centavos, origem, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [e, variante, alvo, alvoId, antes, depois, origem, ator]);
}

/**
 * Grava o preço publicado da apresentação e leva o valor ao Orçamento e às Substâncias.
 * Só leva quando o destino não é ambíguo: a substância tem UMA apresentação (e, no Orçamento, UM item ativo).
 * Cada alteração deixa rastro no histórico; nada é apagado.
 */
async function publicarLinha(db: Consulta, empresaId: number, linha: LinhaMatriz, f: Formacao, origem: "auto" | "aplicar_agora" | "congelamento", ator: Ator): Promise<boolean> {
  const venda = Math.round(f.venda);
  const atual = await db.query(`SELECT preco_centavos FROM preco_publicado WHERE empresa_id=$1 AND variante_id=$2`, [empresaId, linha.varianteId]);
  const antes: number | null = atual.rows[0]?.preco_centavos ?? null;
  if (antes === venda) return false;
  await db.query(
    `INSERT INTO preco_publicado (empresa_id, variante_id, preco_centavos, custo_referencia_centavos, margem_pct, origem, publicado_em, publicado_por)
     VALUES ($1,$2,$3,$4,NULL,$5,now(),$6)
     ON CONFLICT (empresa_id, variante_id) DO UPDATE SET preco_centavos=EXCLUDED.preco_centavos,
       custo_referencia_centavos=EXCLUDED.custo_referencia_centavos, origem=EXCLUDED.origem, publicado_em=now(), publicado_por=EXCLUDED.publicado_por`,
    [empresaId, linha.varianteId, venda, Math.round(f.referencia), origem, ator]);
  await registrar(db, empresaId, linha.varianteId, "matriz", null, antes, venda, origem, ator);

  const unica = await db.query(`SELECT count(*)::int AS n FROM substance_variantes WHERE empresa_id=$1 AND substance_id=$2`, [empresaId, linha.substanciaId]);
  if (unica.rows[0].n !== 1) return true;

  const cat = await db.query(`SELECT id, unit_price_cents FROM budget_catalog WHERE substance_id=$1 AND active=true`, [linha.substanciaId]);
  if (cat.rows.length === 1 && cat.rows[0].unit_price_cents !== venda) {
    await db.query(`UPDATE budget_catalog SET unit_price_cents=$2, updated_at=now() WHERE id=$1`, [cat.rows[0].id, venda]);
    await registrar(db, empresaId, linha.varianteId, "orcamento", cat.rows[0].id, cat.rows[0].unit_price_cents, venda, origem, ator);
  }
  const sub = await db.query(`SELECT price_per_unit FROM substances WHERE id=$1 FOR UPDATE`, [linha.substanciaId]);
  if (sub.rows[0]) {
    const antesSub = Math.round(num(sub.rows[0].price_per_unit) * 100);
    if (antesSub !== venda) {
      await db.query(`UPDATE substances SET price_per_unit=$2 WHERE id=$1`, [linha.substanciaId, venda / 100]);
      await registrar(db, empresaId, linha.varianteId, "substancia", linha.substanciaId, antesSub, venda, origem, ator);
    }
  }
  return true;
}

/**
 * Recalcula e publica. "auto": categorias com o interruptor ligado. "aplicar": só as categorias pedidas, mesmo congeladas.
 * "congelar": fotografa o preço de agora das linhas que ainda não têm preço publicado (não toca Orçamento/Substâncias).
 */
export async function sincronizarPrecos(db: Consulta, empresaId: number, ator: Ator,
  alvo: { tipo: "auto" } | { tipo: "aplicar"; categorias: Categoria[] } | { tipo: "congelar"; categorias: Categoria[] }): Promise<{ publicadas: number; inviaveis: number }> {
  // Em sequência: dentro da transação há uma única conexão.
  const matriz = await montarMatriz(db as Pool, empresaId);
  const parametros = await lerParametros(db, empresaId);
  const cats = await lerCategorias(db, empresaId);
  const ativos = new Set(matriz.fornecedores.filter((f) => f.ativo).map((f) => f.id));
  let publicadas = 0, inviaveis = 0;
  for (const linha of matriz.linhas) {
    const cfg = cats.find((c) => c.categoria === linha.categoria)!;
    const quer = alvo.tipo === "auto" ? cfg.modo === "auto" : alvo.categorias.includes(linha.categoria);
    if (!quer) continue;
    const ref = referenciaDe(linha.celulas.filter((c) => ativos.has(c.fornecedorId)), parametros.referenciaModo);
    if (ref === null) continue;
    const f = formarPreco(ref, cfg.margemPct, parametros);
    if (!f) { inviaveis++; continue; }
    if (alvo.tipo === "congelar") {
      const ja = await db.query(`SELECT 1 FROM preco_publicado WHERE empresa_id=$1 AND variante_id=$2`, [empresaId, linha.varianteId]);
      if (ja.rowCount) continue;
      await db.query(
        `INSERT INTO preco_publicado (empresa_id, variante_id, preco_centavos, custo_referencia_centavos, origem, publicado_por)
         VALUES ($1,$2,$3,$4,'congelamento',$5)`, [empresaId, linha.varianteId, Math.round(f.venda), Math.round(f.referencia), ator]);
      await registrar(db, empresaId, linha.varianteId, "matriz", null, null, Math.round(f.venda), "congelamento", ator);
      publicadas++;
      continue;
    }
    if (await publicarLinha(db, empresaId, linha, f, alvo.tipo === "auto" ? "auto" : "aplicar_agora", ator)) publicadas++;
  }
  return { publicadas, inviaveis };
}

/** Salva parâmetros e margens e aplica a regra do interruptor, tudo na mesma transação. */
export async function salvarConfiguracao(pool: Pool, empresaId: number, ator: Ator, cfg: { parametros: Parametros; categorias: ConfigCategoria[] }) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const antes = await lerCategorias(cliente, empresaId);
    // Ao congelar: o preço de agora fica guardado ANTES de qualquer mudança (usa os parâmetros e margens antigos).
    // Linhas em "auto" já têm o preço publicado em dia; só as sem registro precisam da fotografia.
    const aCongelar = cfg.categorias.filter((c) => c.modo === "congelado" && antes.find((a) => a.categoria === c.categoria)?.modo === "auto").map((c) => c.categoria);
    if (aCongelar.length) await sincronizarPrecos(cliente, empresaId, ator, { tipo: "congelar", categorias: aCongelar });
    const p = cfg.parametros;
    await cliente.query(
      `INSERT INTO precificacao_parametros (empresa_id, frete_pct, perda_pct, impostos_pct, cartao_pct, comissao_pct, despesas_pct, arredondamento, referencia_modo, atualizado_por, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (empresa_id) DO UPDATE SET frete_pct=$2, perda_pct=$3, impostos_pct=$4, cartao_pct=$5, comissao_pct=$6,
         despesas_pct=$7, arredondamento=$8, referencia_modo=$9, atualizado_por=$10, atualizado_em=now()`,
      [empresaId, p.fretePct, p.perdaPct, p.impostosPct, p.cartaoPct, p.comissaoPct, p.despesasPct, p.arredondamento, p.referenciaModo, ator]);
    for (const c of cfg.categorias) {
      await cliente.query(
        `INSERT INTO precificacao_categorias (empresa_id, categoria, margem_pct, modo, atualizado_por, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (empresa_id, categoria) DO UPDATE SET margem_pct=$3, modo=$4, atualizado_por=$5, atualizado_em=now()`,
        [empresaId, c.categoria, c.margemPct, c.modo, ator]);
    }
    const resultado = await sincronizarPrecos(cliente, empresaId, ator, { tipo: "auto" });
    await cliente.query("COMMIT");
    return resultado;
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}

export async function aplicarAgora(pool: Pool, empresaId: number, ator: Ator, categorias: Categoria[]) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const r = await sincronizarPrecos(cliente, empresaId, ator, { tipo: "aplicar", categorias });
    await cliente.query("COMMIT");
    return r;
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}
