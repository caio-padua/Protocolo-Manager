import type { Pool } from "pg";
import { brtISODate } from "./brt";

export class ErroBlend extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const UNIDADES = ["mg", "mcg", "g", "UI", "%", "mL"] as const;
const VIAS = ["IM", "EV", "SC", "ID"] as const;
const FORMAS = ["ampola", "frasco"] as const;

export type BlendEntrada = {
  nome: string; via: (typeof VIAS)[number]; forma: (typeof FORMAS)[number]; volumeMl: number;
  fornecedorId: number; quantidadeEmbalagem: number; precoCaixaCentavos: number;
  componentes: { nome: string; dose: number; unidade: (typeof UNIDADES)[number] }[];
};

const txt = (v: unknown, min: number, max: number, campo: string): string => {
  if (typeof v !== "string") throw new ErroBlend(400, `${campo}: informe um texto.`);
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length < min || t.length > max) throw new ErroBlend(400, `${campo}: use de ${min} a ${max} caracteres.`);
  return t;
};
const inteiro = (v: unknown, min: number, max: number, campo: string): number => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) throw new ErroBlend(400, `${campo}: número inteiro entre ${min} e ${max}.`);
  return v;
};

export function validarBlend(b: unknown): BlendEntrada {
  const o = (b ?? {}) as Record<string, unknown>;
  const nome = txt(o.nome, 3, 120, "Nome do blend");
  if (!VIAS.includes(o.via as never)) throw new ErroBlend(400, "Via: escolha IM, EV, SC ou ID.");
  if (!FORMAS.includes(o.forma as never)) throw new ErroBlend(400, "Forma: escolha ampola ou frasco.");
  const volumeMl = Number(o.volumeMl);
  if (!Number.isFinite(volumeMl) || volumeMl <= 0 || volumeMl > 100) throw new ErroBlend(400, "Volume: informe de 0,1 a 100 mL.");
  const fornecedorId = inteiro(o.fornecedorId, 1, 2_000_000_000, "Laboratório");
  const quantidadeEmbalagem = inteiro(o.quantidadeEmbalagem, 1, 1000, "Quantidade na caixa");
  const precoCaixaCentavos = inteiro(o.precoCaixaCentavos, 1, 100_000_000, "Preço da caixa");
  if (!Array.isArray(o.componentes) || o.componentes.length < 2 || o.componentes.length > 20) {
    throw new ErroBlend(400, "Um blend precisa de 2 a 20 componentes.");
  }
  const vistos = new Set<string>();
  const componentes = o.componentes.map((c, i) => {
    const k = (c ?? {}) as Record<string, unknown>;
    const cn = txt(k.nome, 2, 80, `Componente ${i + 1}`);
    const dose = Number(k.dose);
    if (!Number.isFinite(dose) || dose <= 0 || dose > 1_000_000_000) throw new ErroBlend(400, `Componente ${i + 1}: dose maior que zero.`);
    if (!UNIDADES.includes(k.unidade as never)) throw new ErroBlend(400, `Componente ${i + 1}: unidade inválida.`);
    const chave = cn.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (vistos.has(chave)) throw new ErroBlend(400, `Componente repetido: ${cn}.`);
    vistos.add(chave);
    return { nome: cn, dose, unidade: k.unidade as BlendEntrada["componentes"][number]["unidade"] };
  });
  return { nome, via: o.via as BlendEntrada["via"], forma: o.forma as BlendEntrada["forma"], volumeMl, fornecedorId, quantidadeEmbalagem, precoCaixaCentavos, componentes };
}

const num = (n: number) => String(n).replace(".", ",");
export const composicaoTexto = (cs: BlendEntrada["componentes"]) => cs.map((c) => `${c.nome} ${num(c.dose)} ${c.unidade}`).join(" + ");

/**
 * Cadastra um blend novo como substância INDISPONÍVEL (aguarda revisão clínica), com uma apresentação e uma oferta do laboratório.
 * Se já existir um blend com o mesmo nome e a mesma composição, apenas junta a oferta do laboratório. Nunca altera registro existente.
 */
export async function cadastrarBlend(pool: Pool, empresaId: number, profissionalId: number, entrada: BlendEntrada) {
  const cli = await pool.connect();
  try {
    await cli.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const forn = await cli.query("SELECT id FROM fornecedores_cadastrados WHERE id=$1 AND empresa_id=$2 AND ativo=true", [entrada.fornecedorId, empresaId]);
    if (!forn.rowCount) throw new ErroBlend(404, "Laboratório não encontrado ou inativo nesta clínica.");
    const nome = entrada.nome.toUpperCase();
    const comp = composicaoTexto(entrada.componentes);
    let sub = (await cli.query("SELECT id,is_blend FROM substances WHERE upper(btrim(name))=$1 ORDER BY id LIMIT 1", [nome])).rows[0];
    let substanciaNova = false;
    if (sub && !sub.is_blend) throw new ErroBlend(409, "Já existe um produto simples com este nome. Escolha outro nome para o blend.");
    if (!sub) {
      const r = await cli.query(`INSERT INTO substances(name,category,color,procedure_type,category_type,sub_categoria,via_uso,disponivel,is_blend,composicao)
        VALUES($1,'ORTOMOLECULAR','#3D7A7A',$2,'Blend','COMPOSTO',$3,false,true,$4) RETURNING id`,
        [nome, entrada.via === "EV" ? "iv" : entrada.via === "SC" ? "sc" : "im", entrada.via, comp]);
      sub = r.rows[0]; substanciaNova = true;
    }
    const vs = await cli.query("SELECT id,composicao,forma,volume_ml FROM substance_variantes WHERE empresa_id=$1 AND substance_id=$2", [empresaId, sub.id]);
    const igual = vs.rows.find((v) => v.composicao === comp && v.forma === entrada.forma && Number(v.volume_ml) === entrada.volumeMl);
    let varianteId: number;
    const justificativa = "Blend cadastrado pela tela Matriz de fornecedores (cadastro visual de blend).";
    if (igual) varianteId = igual.id;
    else {
      const v = await cli.query(`INSERT INTO substance_variantes(empresa_id,substance_id,dose_total,forma,volume_ml,vias_fonte,concentracao,composicao)
        VALUES($1,$2,$3,$4,$5,$6,NULL,$3) RETURNING *`, [empresaId, sub.id, comp, entrada.forma, entrada.volumeMl, entrada.via]);
      varianteId = v.rows[0].id;
      await cli.query(`INSERT INTO substance_variante_historico(empresa_id,variante_id,ator_tipo,profissional_id,justificativa,depois) VALUES($1,$2,'profissional',$3,$4,$5::jsonb)`,
        [empresaId, varianteId, profissionalId, justificativa, JSON.stringify(v.rows[0])]);
    }
    const of = await cli.query("SELECT fornecedor_id,posicao FROM substance_ofertas WHERE variante_id=$1", [varianteId]);
    if (of.rows.some((x) => x.fornecedor_id === entrada.fornecedorId)) throw new ErroBlend(409, "Este laboratório já tem preço para este blend com esta composição.");
    const usadas = new Set(of.rows.map((x) => x.posicao));
    let pos = 1; while (usadas.has(pos)) pos++;
    if (pos > 5) throw new ErroBlend(409, "Este blend já tem 5 laboratórios.");
    const embalagem = `Caixa com ${entrada.quantidadeEmbalagem} ${entrada.forma === "frasco" ? "frascos" : "ampolas"}`;
    const unit = Math.round(entrada.precoCaixaCentavos / entrada.quantidadeEmbalagem);
    const origem = `cadastro-visual-blend-${empresaId}-${varianteId}-${entrada.fornecedorId}`;
    const o = await cli.query(`INSERT INTO substance_ofertas(empresa_id,variante_id,fornecedor_id,posicao,origem_chave,documento,pagina,linha,embalagem_original,fonte_texto,fonte_data_nome_arquivo,quantidade_embalagem,custo_unitario_centavos,custo_embalagem_centavos,produto_fonte)
      VALUES($1,$2,$3,$4,$5,'Cadastro visual na tela Matriz de fornecedores',1,1,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [empresaId, varianteId, entrada.fornecedorId, pos, origem, embalagem, `${entrada.nome} | ${comp} | ${num(entrada.volumeMl)} mL | ${embalagem} | informado por profissional`,
        brtISODate().slice(0, 7), entrada.quantidadeEmbalagem, unit, entrada.precoCaixaCentavos, entrada.nome]);
    await cli.query(`INSERT INTO substance_oferta_historico(empresa_id,oferta_id,ator_tipo,profissional_id,justificativa,depois) VALUES($1,$2,'profissional',$3,$4,$5::jsonb)`,
      [empresaId, o.rows[0].id, profissionalId, justificativa, JSON.stringify(o.rows[0])]);
    await cli.query("COMMIT");
    return { substanciaId: sub.id as number, varianteId, substanciaNova, composicao: comp };
  } catch (e) {
    await cli.query("ROLLBACK").catch(() => undefined);
    if ((e as { code?: string }).code === "40001" || (e as { code?: string }).code === "23505") throw new ErroBlend(409, "Outro cadastro ao mesmo tempo ou registro repetido. Tente de novo.");
    throw e;
  } finally { cli.release(); }
}
