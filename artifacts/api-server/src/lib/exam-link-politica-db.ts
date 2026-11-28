import { pool } from "@workspace/db";
import { CHAVE_POLITICA_LEGADO, lerPolitica, PRAZO_LEGADO_DIAS, type PoliticaLegado } from "./exam-link-politica";

export async function carregarPoliticaLegado(): Promise<PoliticaLegado> {
  const r = await pool.query(`SELECT value FROM app_settings WHERE key=$1`, [CHAVE_POLITICA_LEGADO]);
  return r.rows[0] ? lerPolitica(r.rows[0].value) : null;
}

/** Grava a ativação (uma vez). Retorna false se já existe: nunca reescreve a data original. */
export async function ativarPoliticaLegado(ativadaPor: string, agora = new Date()): Promise<boolean> {
  const valor = JSON.stringify({ ativadaEm: agora.toISOString(), dias: PRAZO_LEGADO_DIAS, ativadaPor });
  const r = await pool.query(`INSERT INTO app_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING RETURNING key`, [CHAVE_POLITICA_LEGADO, valor]);
  return (r.rowCount ?? 0) > 0;
}
