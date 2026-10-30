import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type DispatchScope = {
  professionalId: number; empresaId: number; clinicId: number;
  clientId: number; documentIds: number[]; channels: string[]; operationKey: string;
};
export type ChannelResult = { channel: string; success: boolean; auditId: number; error?: string };
export type DispatchOperation = {
  operation_key: string; request_hash: string;
  state: "in_progress" | "completed" | "needs_review"; results: ChannelResult[];
};
export class DispatchKeyConflict extends Error {}

// All scope fields are server-authorized. Documents and channels are sets.
export function dispatchFingerprint(scope: DispatchScope) {
  return createHash("sha256").update(JSON.stringify([
    scope.professionalId, scope.empresaId, scope.clinicId, scope.clientId,
    [...new Set(scope.documentIds)].sort((a, b) => a - b),
    [...new Set(scope.channels)].sort(),
  ])).digest("hex");
}

export async function findDispatchOperation(scope: DispatchScope): Promise<DispatchOperation | undefined> {
  const hash = dispatchFingerprint(scope);
  const found = await db.execute(sql`
    SELECT operation_key, request_hash, state, results FROM exam_request_dispatch_operations
    WHERE professional_id = ${scope.professionalId} AND empresa_id = ${scope.empresaId}
      AND clinic_id = ${scope.clinicId}
      AND (operation_key = ${scope.operationKey} OR request_hash = ${hash})
    ORDER BY (operation_key = ${scope.operationKey}) DESC
  `);
  const operation = found.rows[0] as DispatchOperation | undefined;
  if (operation && operation.request_hash !== hash) {
    throw new DispatchKeyConflict("Esta chave já pertence a outro conteúdo. Nenhum novo envio foi iniciado.");
  }
  return operation;
}

export async function reserveDispatchOperation(scope: DispatchScope) {
  const inserted = await db.execute(sql`
    INSERT INTO exam_request_dispatch_operations
      (professional_id, empresa_id, clinic_id, operation_key, request_hash)
    VALUES (${scope.professionalId}, ${scope.empresaId}, ${scope.clinicId},
      ${scope.operationKey}, ${dispatchFingerprint(scope)})
    ON CONFLICT DO NOTHING
    RETURNING operation_key, request_hash, state, results
  `);
  if (inserted.rows.length) return { owned: true, operation: inserted.rows[0] as DispatchOperation };
  // Unique indexes serialize contenders even across server processes. Only the
  // INSERT winner may contact providers; no timeout/lease ever reclaims a row.
  const operation = await findDispatchOperation(scope);
  if (!operation) throw new Error("Não foi possível recuperar a operação reservada.");
  return { owned: false, operation };
}

export async function saveDispatchOperation(scope: DispatchScope, state: DispatchOperation["state"], results: ChannelResult[]) {
  await db.execute(sql`
    UPDATE exam_request_dispatch_operations SET state = ${state}, results = ${JSON.stringify(results)}::jsonb, updated_at = now()
    WHERE professional_id = ${scope.professionalId} AND empresa_id = ${scope.empresaId}
      AND clinic_id = ${scope.clinicId} AND operation_key = ${scope.operationKey}
  `);
}

export function dispatchOperationResponse(operation: DispatchOperation, replayed: boolean) {
  const needsReview = operation.state !== "completed";
  return {
    operationKey: operation.operation_key, state: operation.state, replayed, needsReview,
    results: operation.results,
    message: operation.state === "in_progress"
      ? "Operação já reservada, em andamento ou interrompida. Nenhum novo envio foi iniciado. Atualize para consultar; se não concluir, confira antes de qualquer novo envio."
      : operation.state === "needs_review"
        ? "Operação pendente de conferência. Não reenvie automaticamente."
        : replayed ? "Operação anterior recuperada. Nenhuma mensagem foi reenviada." : "Operação registrada.",
  };
}
