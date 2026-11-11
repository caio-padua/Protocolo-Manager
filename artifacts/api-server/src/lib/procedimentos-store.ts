import type { pool } from "@workspace/db";
import { CreateProcedimentoBody } from "@workspace/api-zod";
import { z } from "zod";

type Pool = typeof pool;

const entrada = CreateProcedimentoBody.strict().superRefine((value, ctx) => {
  if (!value.nome.trim()) ctx.addIssue({ code: "custom", path: ["nome"], message: "Informe o nome." });
  if (value.produtoIds.some((id) => !Number.isSafeInteger(id)) || new Set(value.produtoIds).size !== value.produtoIds.length) {
    ctx.addIssue({ code: "custom", path: ["produtoIds"], message: "Selecione produtos válidos sem repetição." });
  }
  if (value.duracaoMinutos != null && Math.abs(value.duracaoMinutos * 100 - Math.round(value.duracaoMinutos * 100)) >= 1e-8) {
    ctx.addIssue({ code: "custom", path: ["duracaoMinutos"], message: "A duração aceita até duas casas decimais." });
  }
});

export type EntradaProcedimento = z.infer<typeof entrada>;
export function validarProcedimento(data: unknown) {
  return entrada.safeParse(data);
}

export class ProcedimentoErro extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Queryable = Pick<Pool, "query">;
type Linha = {
  id: number; empresa_id: number; nome: string; tipo: string;
  descricao: string | null; duracao_minutos: number | null; ativo: boolean; produto_ids: number[];
};
function formatar(row: Linha) {
  return {
    id: row.id, empresaId: row.empresa_id, nome: row.nome, tipo: row.tipo,
    descricao: row.descricao, duracaoMinutos: row.duracao_minutos, ativo: row.ativo,
    produtoIds: row.produto_ids,
  };
}

const LISTA_SQL = `
  SELECT p.id, p.empresa_id, p.nome, p.tipo, p.descricao, p.duracao_minutos::double precision AS duracao_minutos, p.ativo,
         COALESCE(array_agg(pp.produto_id ORDER BY pp.produto_id)
           FILTER (WHERE pp.ativo = TRUE AND pp.produto_id IS NOT NULL), '{}') AS produto_ids
    FROM procedimentos_clinicos p
    LEFT JOIN procedimento_produtos pp ON pp.procedimento_id = p.id
   WHERE p.empresa_id = $1 AND ($2::integer IS NULL OR p.id = $2)
   GROUP BY p.id ORDER BY p.nome, p.id`;

export async function listarProcedimentos(db: Queryable, empresaId: number, id: number | null = null) {
  const result = await db.query<Linha>(LISTA_SQL, [empresaId, id]);
  return result.rows.map(formatar);
}

export async function salvarProcedimento(pool: Pool, empresaId: number, data: EntradaProcedimento, id?: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (id !== undefined) {
      const current = await client.query(
        "SELECT id FROM procedimentos_clinicos WHERE id = $1 AND empresa_id = $2 FOR UPDATE", [id, empresaId],
      );
      if (!current.rowCount) throw new ProcedimentoErro(404, "Procedimento não encontrado nesta clínica.");
    }
    if (data.produtoIds.length) {
      const products = await client.query<{ id: number; procedure_type: string; doctor_participation: boolean | null }>(
        "SELECT id, procedure_type, doctor_participation FROM substances WHERE id = ANY($1::int[]) FOR SHARE",
        [data.produtoIds],
      );
      if (products.rowCount !== data.produtoIds.length) {
        throw new ProcedimentoErro(400, "Um dos produtos selecionados não existe mais.");
      }
      if (data.tipo !== "medico" && products.rows.some((p) => p.procedure_type === "implant")) {
        throw new ProcedimentoErro(400, "Um implante exige procedimento médico com médico e enfermagem.");
      }
      if (data.tipo === "enfermagem" && products.rows.some((p) => p.doctor_participation === true)) {
        throw new ProcedimentoErro(400, "Há produto cadastrado com participação médica; confira a classificação.");
      }
    }
    const values = [empresaId, data.nome.trim(), data.tipo, data.descricao?.trim() || null, data.duracaoMinutos, data.ativo];
    const result = id === undefined
      ? await client.query<{ id: number }>(
        `INSERT INTO procedimentos_clinicos (empresa_id, nome, tipo, descricao, duracao_minutos, ativo)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, values)
      : await client.query<{ id: number }>(
        `UPDATE procedimentos_clinicos SET nome=$2, tipo=$3, descricao=$4, duracao_minutos=$5,
          ativo=$6, updated_at=NOW() WHERE empresa_id=$1 AND id=$7 RETURNING id`, [...values, id]);
    const procedimentoId = result.rows[0].id;
    await client.query("UPDATE procedimento_produtos SET ativo = FALSE WHERE procedimento_id = $1 AND ativo = TRUE", [procedimentoId]);
    if (data.produtoIds.length) {
      await client.query(
        `INSERT INTO procedimento_produtos (procedimento_id, produto_id, ativo)
         SELECT $1, produto_id, TRUE FROM unnest($2::integer[]) AS produto_id
         ON CONFLICT (procedimento_id, produto_id) DO UPDATE SET ativo=TRUE`,
        [procedimentoId, data.produtoIds],
      );
    }
    const [saved] = await listarProcedimentos(client, empresaId, procedimentoId);
    await client.query("COMMIT");
    return saved;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
