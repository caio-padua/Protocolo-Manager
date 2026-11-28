import type { Pool, PoolClient } from "pg";
import { ErroBlend } from "./blend-cadastro";

export type OfertaEntrada = { varianteId: number; fornecedorId: number; quantidadeEmbalagem: number; precoCaixaCentavos: number };

const inteiro = (v: unknown, min: number, max: number, campo: string): number => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) throw new ErroBlend(400, `${campo}: número inteiro entre ${min} e ${max}.`);
  return v;
};
export function validarOferta(b: unknown): OfertaEntrada {
  const o = (b ?? {}) as Record<string, unknown>;
  return {
    varianteId: inteiro(o.varianteId, 1, 2_000_000_000, "Apresentação"),
    fornecedorId: inteiro(o.fornecedorId, 1, 2_000_000_000, "Laboratório"),
    quantidadeEmbalagem: inteiro(o.quantidadeEmbalagem, 1, 1000, "Unidades na caixa"),
    precoCaixaCentavos: inteiro(o.precoCaixaCentavos, 1, 100_000_000, "Preço da caixa"),
  };
}

export type OrigemOferta = { documento: string; justificativa: string };
const ORIGEM_PADRAO: OrigemOferta = { documento: "Cadastro visual na tela Matriz de fornecedores", justificativa: "Apresentação gravada pela tela Matriz de fornecedores." };

/** Grava a oferta dentro de uma transação já aberta pelo chamador (sem BEGIN/COMMIT). */
export async function gravarOfertaNaTransacao(cli: PoolClient, empresaId: number, profissionalId: number, e: OfertaEntrada, origemOferta: OrigemOferta = ORIGEM_PADRAO) {
  const forn = await cli.query("SELECT id FROM fornecedores_cadastrados WHERE id=$1 AND empresa_id=$2 AND ativo=true", [e.fornecedorId, empresaId]);
  if (!forn.rowCount) throw new ErroBlend(404, "Laboratório não encontrado ou inativo nesta clínica.");
  const v = await cli.query("SELECT id, forma, composicao, dose_total FROM substance_variantes WHERE id=$1 AND empresa_id=$2", [e.varianteId, empresaId]);
  if (!v.rowCount) throw new ErroBlend(404, "Apresentação não encontrada nesta clínica.");
  const forma = v.rows[0].forma === "frasco" ? "frascos" : v.rows[0].forma === "implante" ? "implantes" : "ampolas";
  const unit = Math.round(e.precoCaixaCentavos / e.quantidadeEmbalagem);
  const embalagem = `Caixa com ${e.quantidadeEmbalagem} ${forma}`;
  const justificativa = origemOferta.justificativa;
  const atual = (await cli.query("SELECT * FROM substance_ofertas WHERE variante_id=$1 AND empresa_id=$2", [e.varianteId, empresaId])).rows;
  const minha = atual.find((x) => x.fornecedor_id === e.fornecedorId);
  let r;
  if (minha) {
    const up = await cli.query(`UPDATE substance_ofertas SET quantidade_embalagem=$2, custo_unitario_centavos=$3, custo_embalagem_centavos=$4, embalagem_original=$5, versao=versao+1 WHERE id=$1 RETURNING *`,
      [minha.id, e.quantidadeEmbalagem, unit, e.precoCaixaCentavos, embalagem]);
    r = up.rows[0];
    await cli.query(`INSERT INTO substance_oferta_historico(empresa_id,oferta_id,ator_tipo,profissional_id,justificativa,antes,depois) VALUES($1,$2,'profissional',$3,$4,$5::jsonb,$6::jsonb)`,
      [empresaId, r.id, profissionalId, justificativa, JSON.stringify(minha), JSON.stringify(r)]);
  } else {
    const usadas = new Set(atual.map((x) => x.posicao));
    let pos = 1; while (usadas.has(pos)) pos++;
    if (pos > 5) throw new ErroBlend(409, "Esta apresentação já tem 5 laboratórios.");
    const origem = `cadastro-visual-oferta-${empresaId}-${e.varianteId}-${e.fornecedorId}`;
    const ins = await cli.query(`INSERT INTO substance_ofertas(empresa_id,variante_id,fornecedor_id,posicao,origem_chave,documento,pagina,linha,embalagem_original,fonte_texto,quantidade_embalagem,custo_unitario_centavos,custo_embalagem_centavos,produto_fonte)
      VALUES($1,$2,$3,$4,$5,$11,1,1,$6,$7,$8,$9,$10,NULL) RETURNING *`,
      [empresaId, e.varianteId, e.fornecedorId, pos, origem, embalagem, `${v.rows[0].dose_total} | ${embalagem} | informado por profissional`, e.quantidadeEmbalagem, unit, e.precoCaixaCentavos, origemOferta.documento]);
    r = ins.rows[0];
    await cli.query(`INSERT INTO substance_oferta_historico(empresa_id,oferta_id,ator_tipo,profissional_id,justificativa,depois) VALUES($1,$2,'profissional',$3,$4,$5::jsonb)`,
      [empresaId, r.id, profissionalId, justificativa, JSON.stringify(r)]);
  }
  return { ofertaId: r.id as number, atualizada: !!minha };
}

/** Grava a apresentação (unidades na caixa + preço da caixa) de um laboratório. Cria a oferta se não existe; se existe, atualiza e guarda o antes no histórico. */
export async function gravarOferta(pool: Pool, empresaId: number, profissionalId: number, e: OfertaEntrada) {
  const cli = await pool.connect();
  try {
    await cli.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const r = await gravarOfertaNaTransacao(cli, empresaId, profissionalId, e);
    await cli.query("COMMIT");
    return r;
  } catch (err) {
    await cli.query("ROLLBACK").catch(() => undefined);
    if ((err as { code?: string }).code === "40001" || (err as { code?: string }).code === "23505") throw new ErroBlend(409, "Outro cadastro ao mesmo tempo ou registro repetido. Tente de novo.");
    throw err;
  } finally { cli.release(); }
}
