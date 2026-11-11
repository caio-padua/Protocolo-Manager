import { z } from "zod";
import { pool } from "@workspace/db";

const campoOpcional = z.string().trim().max(500).nullable();
export const fornecedorEntrada = z.object({
  nome: z.string().trim().min(1).max(200),
  razaoSocial: campoOpcional,
  cnpj: campoOpcional,
  endereco: campoOpcional,
  telefone: campoOpcional,
  email: campoOpcional,
  site: campoOpcional,
  instagram: campoOpcional,
  fabricante: z.boolean().nullable(),
  fornecedor: z.boolean().nullable(),
  fonte: campoOpcional,
  ativo: z.boolean(),
}).strict();
export type EntradaFornecedor = z.infer<typeof fornecedorEntrada>;
type Pool = typeof pool;
type Queryable = Pick<Pool, "query">;

export class ErroFornecedor extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const campos = `id,empresa_id AS "empresaId",nome,razao_social AS "razaoSocial",cnpj,
  endereco,telefone,email,site,instagram,fabricante,fornecedor,fonte,ativo,versao,
  criado_em AS "criadoEm",atualizado_em AS "atualizadoEm"`;

/** Chamador é responsável por validar sessão, dono e empresa. */
export async function listarFornecedores(db: Queryable, empresaId: number) {
  return (await db.query(`SELECT ${campos} FROM fornecedores_cadastrados
    WHERE empresa_id=$1 ORDER BY lower(nome),id`, [empresaId])).rows;
}

export async function salvarFornecedor(db: Pool, empresaId: number, profissionalId: number,
  entrada: unknown, id?: number, versao?: number) {
  const parsed = fornecedorEntrada.safeParse(entrada);
  if (!parsed.success) throw new ErroFornecedor("Confira os dados do fornecedor.", 400);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || !Number.isSafeInteger(profissionalId) || profissionalId <= 0 ||
      (id !== undefined && (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(versao) || versao! <= 0))) {
    throw new ErroFornecedor("Identidade ou versão inválida.", 400);
  }
  const d = parsed.data;
  const valores = [empresaId, d.nome, d.razaoSocial || null, d.cnpj || null, d.endereco || null, d.telefone || null,
    d.email || null, d.site || null, d.instagram || null, d.fabricante, d.fornecedor, d.fonte || null, d.ativo];
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    const empresa = await tx.query("SELECT id FROM empresas WHERE id=$1 AND ativa=TRUE AND status='ATIVO' FOR SHARE", [empresaId]);
    if (!empresa.rowCount) throw new ErroFornecedor("A clínica da sessão não está disponível.", 403);
    const profissional = await tx.query(
      "SELECT id FROM professionals WHERE id=$1 AND active=TRUE AND is_platform_owner=TRUE FOR SHARE",
      [profissionalId],
    );
    if (!profissional.rowCount) throw new ErroFornecedor("O profissional não pode alterar fornecedores.", 403);
    let anterior = null;
    if (id !== undefined) {
      const r = await tx.query(`SELECT ${campos} FROM fornecedores_cadastrados WHERE empresa_id=$1 AND id=$2 FOR UPDATE`, [empresaId, id]);
      if (!r.rowCount) throw new ErroFornecedor("Fornecedor não encontrado nesta clínica.", 404);
      anterior = r.rows[0];
      if (anterior.versao !== versao) throw new ErroFornecedor("O cadastro mudou; atualize antes de salvar.", 409);
    }
    const result = id === undefined
      ? await tx.query(`INSERT INTO fornecedores_cadastrados
        (empresa_id,nome,razao_social,cnpj,endereco,telefone,email,site,instagram,fabricante,fornecedor,fonte,ativo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${campos}`, valores)
      : await tx.query(`UPDATE fornecedores_cadastrados SET nome=$2,razao_social=$3,cnpj=$4,endereco=$5,telefone=$6,
        email=$7,site=$8,instagram=$9,fabricante=$10,fornecedor=$11,fonte=$12,ativo=$13,
        versao=versao+1,atualizado_em=NOW() WHERE empresa_id=$1 AND id=$14 RETURNING ${campos}`, [...valores, id]);
    const atual = result.rows[0];
    await tx.query(`INSERT INTO fornecedor_historico(empresa_id,fornecedor_id,profissional_id,antes,depois)
      VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,
      [empresaId, atual.id, profissionalId, anterior ? JSON.stringify(anterior) : null, JSON.stringify(atual)]);
    await tx.query("COMMIT");
    return atual;
  } catch (error) {
    await tx.query("ROLLBACK");
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new ErroFornecedor("Já existe fornecedor com esse nome nesta clínica.", 409);
    }
    throw error;
  } finally {
    tx.release();
  }
}
