import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { ensureClientRubricas,TRAVA_RUBRICA } from "./client-rubrica";

/**
 * Captura na MESMA transação da confirmação. Usa a mesma trava da troca da imagem.
 * A consulta vem DEPOIS de adquirir a trava, para ter instantâneo de leitura novo.
 * Campos SET de PostgreSQL leem o estado ANTERIOR da linha, inclusive rubrica_at.
 */
export async function comRubricaHistorica<T>(
  clientId:number,empresaId:number,now:Date,montar:(campos:SQL)=>SQL,
):Promise<T[]> {
  await ensureClientRubricas();
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${TRAVA_RUBRICA},${clientId})`);
    const r=await tx.execute(sql`SELECT id,sha256 FROM client_rubricas
      WHERE client_id=${clientId} AND empresa_id=${empresaId} AND ativa`);
    const ativa=r.rows[0] as {id:number;sha256:string}|undefined;
    // Ausência vira captura explícita (data presente, versão/hash nulos).
    // Rubrica legada já prestada, sem versão, continua SEM prova histórica.
    const capturar=sql`rubrica_snapshot_at IS NULL AND rubrica_at IS NULL`;
    const campos=sql`
      rubrica_version_id=CASE WHEN ${capturar} THEN ${ativa?.id??null} ELSE rubrica_version_id END,
      rubrica_sha256=CASE WHEN ${capturar} THEN ${ativa?.sha256??null} ELSE rubrica_sha256 END,
      rubrica_snapshot_at=CASE WHEN ${capturar} THEN ${now.toISOString()}::timestamptz ELSE rubrica_snapshot_at END,`;
    const alterado=await tx.execute(montar(campos));
    return alterado.rows as T[];
  });
}
