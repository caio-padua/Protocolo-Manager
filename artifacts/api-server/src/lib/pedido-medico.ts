import { and, desc, eq, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  clinicalAccessGrantsTable,
  db,
  locationProfessionalsTable,
  locationsTable,
  professionalsTable,
  sessionsTable,
} from "@workspace/db";
import { currentResponsibleDoctor } from "./clinical-access";
import { medicalRegistration } from "./clinical-emitter";
import { getPrescriptionCertificateStatus } from "./prescription-signing";
import { getSetting } from "./secure-settings";

export type PedidoKind = "receita" | "pedido_exames";
export const PEDIDO_KINDS: readonly PedidoKind[] = ["receita", "pedido_exames"];
export const PEDIDO_LABEL: Record<PedidoKind, string> = {
  receita: "Receita médica",
  pedido_exames: "Pedido de exames",
};
export const ASAAS_MIN_VALUE = 5;

export function isPedidoKind(value: unknown): value is PedidoKind {
  return value === "receita" || value === "pedido_exames";
}

// Valor de cada tipo vem da configuracao do CEO. Nunca ha valor padrao inventado.
export async function resolvePedidoAmount(kind: PedidoKind): Promise<number | null> {
  const raw = await getSetting(`pay.pedidoMedico.${kind}`);
  const n = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= ASAAS_MIN_VALUE ? Math.round(n * 100) / 100 : null;
}

// Medico apto a receber o pedido: ativo, medico, CRM valido, vinculado a unidade,
// liberado para a ferramenta nessa unidade e com certificado proprio vigente.
export async function isEligibleDoctor(
  professionalId: number, locationId: number, empresaId: number, kind: PedidoKind,
): Promise<boolean> {
  const [row] = await db.select({ prof: professionalsTable, grant: clinicalAccessGrantsTable })
    .from(professionalsTable)
    .innerJoin(locationProfessionalsTable, and(
      eq(locationProfessionalsTable.professionalId, professionalsTable.id),
      eq(locationProfessionalsTable.locationId, locationId),
    ))
    .innerJoin(locationsTable, and(
      eq(locationsTable.id, locationId),
      eq(locationsTable.empresaId, empresaId),
      eq(locationsTable.active, "true"),
    ))
    .innerJoin(clinicalAccessGrantsTable, and(
      eq(clinicalAccessGrantsTable.professionalId, professionalsTable.id),
      eq(clinicalAccessGrantsTable.locationId, locationId),
      eq(clinicalAccessGrantsTable.empresaId, empresaId),
    ))
    .where(and(
      eq(professionalsTable.id, professionalId),
      eq(professionalsTable.active, true),
      eq(professionalsTable.professionalType, "medico"),
    )).limit(1);
  if (!row) return false;
  const allowed = kind === "receita" ? row.grant.canPrescribe : row.grant.canRequestExams;
  if (!allowed) return false;
  try { medicalRegistration(row.prof); } catch { return false; }
  const cert = await getPrescriptionCertificateStatus(row.prof.id, row.prof.cpf);
  return cert.state === "valid";
}

export interface Assignee { professionalId: number | null; reason: "habitual" | "responsavel_tecnico" | "sem_destino" }

// Medico habitual = medico da sessao mais recente do cliente. Reserva = responsavel tecnico.
export async function resolveAssignee(
  clientId: number, locationId: number, empresaId: number, kind: PedidoKind,
): Promise<Assignee> {
  const recent = await db.select({ professionalId: sessionsTable.professionalId })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.clientId, clientId), isNotNull(sessionsTable.professionalId)))
    .orderBy(desc(sessionsTable.scheduledDate), desc(sessionsTable.id))
    .limit(10);
  const tried = new Set<number>();
  for (const { professionalId } of recent) {
    if (!professionalId || tried.has(professionalId)) continue;
    tried.add(professionalId);
    if (await isEligibleDoctor(professionalId, locationId, empresaId, kind)) {
      return { professionalId, reason: "habitual" };
    }
  }
  const responsible = await currentResponsibleDoctor(locationId, empresaId);
  if (responsible) return { professionalId: responsible.id, reason: "responsavel_tecnico" };
  return { professionalId: null, reason: "sem_destino" };
}

// Marca como pago e roteia. Idempotente: so age quando ainda aguarda pagamento.
export async function markPedidoPaid(chargeId: string, paidDate: string): Promise<boolean> {
  const claimed = await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'pago', paid_at = ${paidDate}, updated_at = NOW()
     WHERE asaas_charge_id = ${chargeId} AND status = 'aguardando_pagamento'
 RETURNING id, client_id, location_id, empresa_id, kind`);
  const row = (claimed.rows as Array<{ id: number; client_id: number; location_id: number; empresa_id: number; kind: PedidoKind }>)[0];
  if (!row) {
    // Pagamento chegou para pedido que ja nao aguarda (ex.: cancelado): dinheiro sem
    // servico. Marca para conferencia humana; nunca reabre o pedido sozinho.
    await db.execute(sql`
      UPDATE client_medical_requests SET refund_pending = TRUE, updated_at = NOW()
       WHERE asaas_charge_id = ${chargeId} AND status = 'cancelado'`);
    return false;
  }
  const target = await resolveAssignee(row.client_id, row.location_id, row.empresa_id, row.kind);
  await db.execute(sql`
    UPDATE client_medical_requests
       SET assigned_professional_id = ${target.professionalId},
           assigned_reason = ${target.reason}, updated_at = NOW()
     WHERE id = ${row.id}`);
  return true;
}

// Pagamento nao concluido (vencido/removido) so cancela o que ainda nao foi pago.
export async function cancelUnpaidPedido(chargeId: string): Promise<void> {
  await db.execute(sql`
    UPDATE client_medical_requests SET status = 'cancelado', updated_at = NOW()
     WHERE asaas_charge_id = ${chargeId} AND status = 'aguardando_pagamento'`);
}

// Estorno/contestacao feito pelo Asaas: o dinheiro ja saiu, entao o que ainda nao
// foi emitido sai da fila. O que ja foi emitido nao e desfeito aqui (decisao humana).
export async function cancelRefundedPedido(chargeId: string): Promise<void> {
  await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'cancelado', refund_pending = FALSE, updated_at = NOW()
     WHERE asaas_charge_id = ${chargeId} AND status IN ('pago','em_analise')`);
}
