import { pool } from "@workspace/db";

type Queryable = Pick<typeof pool, "query">;

export type CelulaMatriz = { fornecedorId: number; custoUnitarioCentavos: number; custoEmbalagemCentavos: number; quantidadeEmbalagem: number };
export type LinhaMatriz = {
  varianteId: number; substanciaId: number; produto: string; doseTotal: string; forma: string;
  volumeMl: string | null; via: string | null; categoria: "IM" | "SC" | "IMPLANTE" | "OUTRAS" | "SEM_VIA";
  celulas: CelulaMatriz[];
};
export type ColunaFornecedor = { id: number; nome: string; ativo: boolean };

/** Categoria comercial deduzida da via de uso e da forma; ausência de via nunca é adivinhada. */
export function categoriaDaLinha(via: string | null, forma: string): LinhaMatriz["categoria"] {
  if (forma === "implante") return "IMPLANTE";
  const v = (via ?? "").toUpperCase();
  if (!v.trim()) return "SEM_VIA";
  if (/\bIM\b/.test(v)) return "IM";
  if (/SC|SUBCUT/.test(v)) return "SC";
  return "OUTRAS";
}

/** Matriz somente leitura: custo nunca altera preço de venda, estoque ou lote. */
export async function montarMatriz(db: Queryable, empresaId: number): Promise<{ fornecedores: ColunaFornecedor[]; linhas: LinhaMatriz[] }> {
  const forn = await db.query(
    `SELECT id, nome, ativo FROM fornecedores_cadastrados WHERE empresa_id=$1 ORDER BY id`, [empresaId]);
  const vars = await db.query(
    `SELECT v.id AS "varianteId", s.id AS "substanciaId", s.name AS produto, v.dose_total AS "doseTotal",
            v.forma, v.volume_ml AS "volumeMl", s.via_uso AS via
       FROM substance_variantes v JOIN substances s ON s.id=v.substance_id
      WHERE v.empresa_id=$1 ORDER BY s.name, v.dose_total, v.id`, [empresaId]);
  const ofs = await db.query(
    `SELECT variante_id AS "varianteId", fornecedor_id AS "fornecedorId",
            custo_unitario_centavos AS "custoUnitarioCentavos", custo_embalagem_centavos AS "custoEmbalagemCentavos",
            quantidade_embalagem AS "quantidadeEmbalagem"
       FROM substance_ofertas WHERE empresa_id=$1`, [empresaId]);
  const porVariante = new Map<number, CelulaMatriz[]>();
  for (const o of ofs.rows) {
    const lista = porVariante.get(o.varianteId) ?? [];
    lista.push({ fornecedorId: o.fornecedorId, custoUnitarioCentavos: o.custoUnitarioCentavos,
      custoEmbalagemCentavos: o.custoEmbalagemCentavos, quantidadeEmbalagem: o.quantidadeEmbalagem });
    porVariante.set(o.varianteId, lista);
  }
  return {
    fornecedores: forn.rows,
    linhas: vars.rows.map((r) => ({ ...r, categoria: categoriaDaLinha(r.via, r.forma), celulas: porVariante.get(r.varianteId) ?? [] })),
  };
}
