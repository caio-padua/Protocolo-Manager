/**
 * SERVICO DE CONSULTA A ANAMNESE (somente leitura, isolado por clinica).
 * A solicitacao de pedido NAO guarda dado clinico: so pergunta se existe anamnese concluida e quando.
 * Nenhuma resposta clinica sai deste servico.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface ResumoAnamnese { concluida: boolean; concluidaEm: string | null }

export async function consultarAnamnese(clienteId: number, empresaId: number): Promise<ResumoAnamnese> {
  const r = (await db.execute(sql`SELECT s.completed_at
    FROM anamnese_sessions s JOIN clients c ON c.id=s.client_id AND c.empresa_id=${empresaId}
    WHERE s.client_id=${clienteId} AND s.status IN ('concluida','concluido')
    ORDER BY s.completed_at DESC NULLS LAST, s.id DESC LIMIT 1`)).rows[0] as { completed_at: Date | string | null } | undefined;
  if (!r) return { concluida: false, concluidaEm: null };
  return { concluida: true, concluidaEm: r.completed_at ? new Date(r.completed_at).toISOString() : null };
}
