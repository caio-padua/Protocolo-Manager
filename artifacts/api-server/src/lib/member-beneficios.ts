/**
 * Beneficios Member por cliente (isencao de cobranca em pedido medico).
 * Isolado por clinica (empresa_id do cliente), editavel e com historico.
 * O beneficio dispensa SO a cobranca: a decisao e a assinatura medica continuam obrigatorias.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { PedidoKind } from "./pedido-medico";

export interface Beneficio {
  id: number; empresa_id: number; client_id: number; beneficio: PedidoKind;
  status: "ativo" | "revogado"; ambiente: "teste" | "real"; motivo: string;
  valido_ate: string | null;
}

export async function beneficioAtivo(clientId: number, empresaId: number, kind: PedidoKind): Promise<Beneficio | null> {
  const r = await db.execute(sql`
    SELECT * FROM client_member_beneficios
     WHERE client_id = ${clientId} AND empresa_id = ${empresaId} AND beneficio = ${kind}
       AND status = 'ativo' AND (valido_ate IS NULL OR valido_ate >= CURRENT_DATE)
     LIMIT 1`);
  return (r.rows[0] as unknown as Beneficio | undefined) ?? null;
}

export async function conceder(
  input: { clientId: number; kind: PedidoKind; ambiente: "teste" | "real"; motivo: string; validoAte?: string | null },
  por: number,
): Promise<Beneficio> {
  return db.transaction(async (tx) => {
    const cli = await tx.execute(sql`SELECT empresa_id FROM clients WHERE id = ${input.clientId}`);
    const empresaId = (cli.rows[0] as { empresa_id: number | null } | undefined)?.empresa_id;
    if (!empresaId) throw new Error("CLIENTE_SEM_EMPRESA");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"member-benef:" + input.clientId}))`);
    const ja = await tx.execute(sql`
      SELECT id FROM client_member_beneficios
       WHERE client_id = ${input.clientId} AND empresa_id = ${empresaId} AND beneficio = ${input.kind} AND status = 'ativo'`);
    if (ja.rows.length > 0) throw new Error("JA_ATIVO");
    const ins = await tx.execute(sql`
      INSERT INTO client_member_beneficios (empresa_id, client_id, beneficio, ambiente, motivo, valido_ate, criado_por)
      VALUES (${empresaId}, ${input.clientId}, ${input.kind}, ${input.ambiente}, ${input.motivo}, ${input.validoAte ?? null}, ${por})
      RETURNING *`);
    const row = ins.rows[0] as unknown as Beneficio;
    await tx.execute(sql`
      INSERT INTO client_member_beneficios_hist (beneficio_id, empresa_id, client_id, acao, antes, depois, por)
      VALUES (${row.id}, ${empresaId}, ${input.clientId}, 'concedido', NULL, ${JSON.stringify(row)}::jsonb, ${por})`);
    return row;
  });
}

export async function revogar(id: number, por: number): Promise<Beneficio | null> {
  return db.transaction(async (tx) => {
    const cur = await tx.execute(sql`SELECT * FROM client_member_beneficios WHERE id = ${id} FOR UPDATE`);
    const antes = cur.rows[0] as unknown as Beneficio | undefined;
    if (!antes || antes.status !== "ativo") return null;
    const upd = await tx.execute(sql`
      UPDATE client_member_beneficios SET status = 'revogado', atualizado_em = NOW() WHERE id = ${id} RETURNING *`);
    const depois = upd.rows[0] as unknown as Beneficio;
    await tx.execute(sql`
      INSERT INTO client_member_beneficios_hist (beneficio_id, empresa_id, client_id, acao, antes, depois, por)
      VALUES (${id}, ${antes.empresa_id}, ${antes.client_id}, 'revogado', ${JSON.stringify(antes)}::jsonb, ${JSON.stringify(depois)}::jsonb, ${por})`);
    return depois;
  });
}
