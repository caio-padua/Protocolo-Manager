import { pool } from "@workspace/db";

const MODELO_COLUNA = {
  selecao: "modelo_selecao",
  interprete: "modelo_interprete",
  conferente: "modelo_conferente",
  aprendizagem: "modelo_aprendiz",
} as const;

export type EtapaModeloAtendimento = keyof typeof MODELO_COLUNA;

export async function getModeloAtendimento(
  empresaId: number,
  etapa: EtapaModeloAtendimento,
): Promise<string | null> {
  const coluna = MODELO_COLUNA[etapa];
  const result = await pool.query(
    `SELECT ${coluna} AS modelo FROM evolution_homologacao_config WHERE empresa_id=$1`,
    [empresaId],
  );
  const modelo = result.rows[0]?.modelo;
  return typeof modelo === "string" && modelo.trim() ? modelo.trim() : null;
}

export async function getNomeAssistenteAtendimento(empresaId: number): Promise<string | null> {
  const result = await pool.query(
    `SELECT nome_assistente FROM evolution_homologacao_config WHERE empresa_id=$1`,
    [empresaId],
  );
  const nome = result.rows[0]?.nome_assistente;
  return typeof nome === "string" && nome.trim() ? nome.trim() : null;
}
