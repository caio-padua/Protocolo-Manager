import { pool } from "@workspace/db";

/** Exclusivamente leitura. O chamador deve validar sessão e permissão. */
export async function listarVariantesSubstancia(db: Pick<typeof pool, "query">, empresaId: number, substanceId: number) {
  if (![empresaId, substanceId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error("Identificador inválido.");
  const { rows } = await db.query(`SELECT
      v.id AS "varianteId",v.dose_total AS "doseTotal",v.forma,v.volume_ml AS "volumeMl",
      v.concentracao,v.composicao,v.subtipo_implante AS "subtipoImplante",v.vias_fonte AS "viasFonte",
      o.id AS "ofertaId",o.posicao,o.quantidade_embalagem AS "quantidadeEmbalagem",
      o.custo_unitario_centavos AS "custoUnitarioCentavos",o.custo_embalagem_centavos AS "custoEmbalagemCentavos",
      o.documento,o.pagina,o.linha,o.embalagem_original AS "embalagemOriginal",
      o.fonte_data_nome_arquivo AS "fonteDataNomeArquivo", f.nome AS fornecedor
    FROM substance_variantes v
    LEFT JOIN substance_ofertas o ON o.empresa_id=v.empresa_id AND o.variante_id=v.id
    LEFT JOIN fornecedores_cadastrados f ON f.empresa_id=o.empresa_id AND f.id=o.fornecedor_id
    WHERE v.empresa_id=$1 AND v.substance_id=$2 ORDER BY v.id,o.posicao`, [empresaId, substanceId]);
  const agrupadas = new Map<number, {
    id: number; doseTotal: string; forma: string; volumeMl: string | null; concentracao: string | null;
    composicao: string | null; subtipoImplante: string | null; viasFonte: string;
    ofertas: Array<{ id: number; posicao: number; fornecedor: string; quantidadeEmbalagem: number;
      custoUnitarioCentavos: number; custoEmbalagemCentavos: number; documento: string; pagina: number;
      linha: number; embalagemOriginal: string; fonteDataNomeArquivo: string | null }>;
  }>();
  for (const r of rows) {
    let variante = agrupadas.get(r.varianteId);
    if (!variante) {
      variante = { id:r.varianteId, doseTotal:r.doseTotal, forma:r.forma, volumeMl:r.volumeMl,
        concentracao:r.concentracao, composicao:r.composicao, subtipoImplante:r.subtipoImplante,
        viasFonte:r.viasFonte, ofertas:[] };
      agrupadas.set(r.varianteId, variante);
    }
    if (r.ofertaId != null) variante.ofertas.push({ id:r.ofertaId, posicao:r.posicao, fornecedor:r.fornecedor,
      quantidadeEmbalagem:r.quantidadeEmbalagem, custoUnitarioCentavos:r.custoUnitarioCentavos,
      custoEmbalagemCentavos:r.custoEmbalagemCentavos, documento:r.documento, pagina:r.pagina, linha:r.linha,
      embalagemOriginal:r.embalagemOriginal, fonteDataNomeArquivo:r.fonteDataNomeArquivo });
  }
  return [...agrupadas.values()];
}
