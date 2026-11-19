import type { Pool } from "pg";
import { montarMatriz, type ColunaFornecedor, type LinhaMatriz } from "./matriz-fornecedores";
import { lerCategorias, lerParametros, type ConfigCategoria, type Parametros } from "./precificacao";
import { saldosPorSubstancia, type SaldoSubstancia } from "./estoque-reserva";
import { db } from "@workspace/db";

export type LinhaCompleta = LinhaMatriz & {
  estoque: { fisico: number; dinamico: number; estatico: number; falta: number; minimo: number } | null;
  publicado: { precoCentavos: number; origem: string; publicadoEm: string } | null;
  orcamento: { catalogoId: number; nome: string; precoCentavos: number } | null;
};
export type MatrizCompleta = {
  fornecedores: ColunaFornecedor[]; linhas: LinhaCompleta[]; parametros: Parametros; categorias: ConfigCategoria[];
  reservasAtivas: number; semLote: number;
};

/** Matriz + precificação + preço publicado + vínculo com o Orçamento + saldos de estoque. Somente leitura. */
export async function montarMatrizCompleta(pool: Pool, empresaId: number): Promise<MatrizCompleta> {
  const [base, parametros, categorias, saldos, publicados, orcs, reservas] = await Promise.all([
    montarMatriz(pool, empresaId), lerParametros(pool, empresaId), lerCategorias(pool, empresaId),
    saldosPorSubstancia(db, empresaId).catch((): SaldoSubstancia[] => []),
    pool.query(`SELECT variante_id, preco_centavos, origem, publicado_em FROM preco_publicado WHERE empresa_id=$1`, [empresaId]),
    pool.query(`SELECT id, name, unit_price_cents, substance_id FROM budget_catalog WHERE active=true AND substance_id IS NOT NULL`),
    pool.query(`SELECT count(*)::int AS n FROM estoque_reservas WHERE empresa_id=$1 AND status='ativa'`, [empresaId]),
  ]);
  const saldo = new Map(saldos.map((x) => [x.substanciaId, x]));
  const pub = new Map(publicados.rows.map((r) => [r.variante_id, r]));
  const porSub = new Map<number, { id: number; name: string; unit_price_cents: number }[]>();
  for (const o of orcs.rows) porSub.set(o.substance_id, [...(porSub.get(o.substance_id) ?? []), o]);
  const variantesPorSub = new Map<number, number>();
  for (const l of base.linhas) variantesPorSub.set(l.substanciaId, (variantesPorSub.get(l.substanciaId) ?? 0) + 1);
  return {
    fornecedores: base.fornecedores, parametros, categorias,
    reservasAtivas: reservas.rows[0]?.n ?? 0,
    semLote: saldos.reduce((a, x) => a + x.semLote, 0),
    linhas: base.linhas.map((l) => {
      const s = saldo.get(l.substanciaId);
      const p = pub.get(l.varianteId);
      const o = variantesPorSub.get(l.substanciaId) === 1 ? porSub.get(l.substanciaId) : undefined;
      return {
        ...l,
        estoque: s ? { fisico: s.fisico, dinamico: s.dinamico, estatico: s.estatico, falta: s.falta, minimo: s.minimo } : null,
        publicado: p ? { precoCentavos: p.preco_centavos, origem: p.origem, publicadoEm: new Date(p.publicado_em).toISOString() } : null,
        orcamento: o && o.length === 1 ? { catalogoId: o[0].id, nome: o[0].name, precoCentavos: o[0].unit_price_cents } : null,
      };
    }),
  };
}
