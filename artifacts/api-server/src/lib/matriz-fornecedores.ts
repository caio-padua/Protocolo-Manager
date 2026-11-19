import { pool } from "@workspace/db";

type Queryable = Pick<typeof pool, "query">;

export type CelulaMatriz = { fornecedorId: number; custoUnitarioCentavos: number; custoEmbalagemCentavos: number; quantidadeEmbalagem: number };
export type LinhaMatriz = {
  varianteId: number; substanciaId: number; produto: string; doseTotal: string; forma: string;
  volumeMl: string | null; concentracao: string | null; via: string | null; categoria: CategoriaVia;
  /** Todas as vias em que o produto pode ser usado (um produto "EV / IM" aparece nos botões EV e IM). */
  vias: ViaCodigo[];
  /** Área clínica do produto (ex.: VITAMINICO, ORTOMOLECULAR), para agrupar a tela. */
  classe: string;
  isBlend: boolean; composicao: string | null; produtoFonte: string | null;
  disponivel: boolean;
  celulas: CelulaMatriz[];
};
export type CategoriaVia = "IM" | "EV" | "SC" | "ID" | "IMPLANTE" | "OUTRAS" | "SEM_VIA";
export type ViaCodigo = "IM" | "EV" | "SC" | "ID" | "TOPICO" | "IMPLANTE";
export type ColunaFornecedor = { id: number; nome: string; ativo: boolean };

/** Lê todas as vias citadas no texto da fonte. Texto vazio = nenhuma (a ausência nunca é adivinhada). */
export function viasDoTexto(via: string | null, forma: string): ViaCodigo[] {
  if (forma === "implante") return ["IMPLANTE"];
  const v = (via ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const out: ViaCodigo[] = [];
  if (/\bIM\b|INTRAMUSC/.test(v)) out.push("IM");
  if (/\bEV\b|ENDOVEN/.test(v)) out.push("EV");
  if (/\bSC\b|SUBCUT/.test(v)) out.push("SC");
  if (/\bID\b|INTRADERM/.test(v)) out.push("ID");
  if (/TOPIC/.test(v)) out.push("TOPICO");
  return out;
}

/** Categoria comercial (a que recebe margem): a primeira via na ordem IM, SC, EV, ID; tópico vira "Outras". */
export function categoriaDaLinha(via: string | null, forma: string): CategoriaVia {
  if (forma === "implante") return "IMPLANTE";
  if (!(via ?? "").trim()) return "SEM_VIA";
  const vs = viasDoTexto(via, forma);
  for (const c of ["IM", "SC", "EV", "ID"] as const) if (vs.includes(c)) return c;
  return "OUTRAS";
}

/** Matriz somente leitura: custo nunca altera preço de venda, estoque ou lote. */
export async function montarMatriz(db: Queryable, empresaId: number): Promise<{ fornecedores: ColunaFornecedor[]; linhas: LinhaMatriz[] }> {
  const forn = await db.query(
    `SELECT id, nome, ativo FROM fornecedores_cadastrados WHERE empresa_id=$1 ORDER BY id`, [empresaId]);
  const vars = await db.query(
    `SELECT v.id AS "varianteId", s.id AS "substanciaId", s.name AS produto, v.dose_total AS "doseTotal",
            v.forma, v.volume_ml AS "volumeMl", v.concentracao,
            COALESCE(NULLIF(btrim(v.vias_fonte),''), s.via_uso) AS via,
            COALESCE(NULLIF(btrim(s.category),''), 'SEM CLASSE') AS classe,
            s.is_blend AS "isBlend", COALESCE(v.composicao, s.composicao) AS composicao, COALESCE(s.disponivel, true) AS disponivel,
            (SELECT o.produto_fonte FROM substance_ofertas o WHERE o.variante_id=v.id AND o.produto_fonte IS NOT NULL ORDER BY o.posicao LIMIT 1) AS "produtoFonte"
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
    linhas: vars.rows.map((r) => ({ ...r, categoria: categoriaDaLinha(r.via, r.forma), vias: viasDoTexto(r.via, r.forma), celulas: porVariante.get(r.varianteId) ?? [] })),
  };
}
