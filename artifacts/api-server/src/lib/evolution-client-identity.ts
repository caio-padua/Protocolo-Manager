import { sql, type SQL } from "drizzle-orm";

/** Telefone completo autenticado pelo canal; sufixo nunca identifica cliente. */
export async function resolverIdentidadeWhatsapp(
  exec: { execute(query: SQL): Promise<{ rows: unknown[] }> },
  empresaId: number,
  telefone: string,
): Promise<{ id: number; locationId: number } | null> {
  if (!/^55\d{10,11}$/.test(telefone)) return null;
  const result = await exec.execute(sql`SELECT c.id,c.location_id,(v.telefone=${telefone}) AS explicito
    FROM clients c LEFT JOIN evolution_vinculos_cliente v
      ON v.empresa_id=c.empresa_id AND v.cliente_id=c.id
    WHERE c.empresa_id=${empresaId} AND c.status='active' AND c.deleted_at IS NULL
      AND (v.telefone=${telefone}
        OR regexp_replace(COALESCE(c.phone,''),'\\D','','g') IN (${telefone},substring(${telefone} from 3)))
    ORDER BY c.id LIMIT 5`);
  // Vínculo confirmado por administrador resolve a colisão com telefone de cadastro
  // de outra pessoa, desde que exista exatamente um vínculo explícito para o número.
  const explicitos = (result.rows as Array<{ explicito: boolean | null }>).filter(r => r.explicito === true);
  const candidatos = explicitos.length === 1 ? explicitos : result.rows;
  if (candidatos.length !== 1) return null;
  const row = candidatos[0] as { id: number | string; location_id: number | string };
  const id = Number(row.id), locationId = Number(row.location_id);
  return Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(locationId) && locationId > 0
    ? { id, locationId } : null;
}
