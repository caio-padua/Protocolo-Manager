import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { clinicalAccessGrantsTable, db } from "@workspace/db";
import { currentResponsibleDoctor, isPlatformOwner } from "../lib/clinical-access";
import { PEDIDO_KINDS, PEDIDO_LABEL, ASAAS_MIN_VALUE, isEligibleDoctor, resolvePedidoAmount, type PedidoKind } from "../lib/pedido-medico";
import { setSetting } from "../lib/secure-settings";
import { requireCollaborator } from "./collaborator";

// ===========================================================================
// FILA DO MEDICO para pedidos pagos pelo cliente. Quem age e sempre um medico
// logado: o destino, o responsavel tecnico da unidade ou nenhum (404). A emissao
// do documento continua no Cockpit, com o certificado do proprio medico.
// ===========================================================================

const router: IRouter = Router();

interface Row {
  id: number; client_id: number; empresa_id: number; location_id: number; kind: PedidoKind;
  details: string; status: string; amount: string | null; paid_at: string | null;
  assigned_professional_id: number | null; assigned_reason: string | null;
  decision_note: string | null; issued_reference: string | null; refund_pending: boolean; created_at: string;
}

function actorId(req: Request): number | null {
  const id = Number(req.collaborator?.professionalId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function responsibleScopes(actor: number): Promise<Array<{ locationId: number; empresaId: number }>> {
  const grants = await db.select({
    locationId: clinicalAccessGrantsTable.locationId,
    empresaId: clinicalAccessGrantsTable.empresaId,
  }).from(clinicalAccessGrantsTable).where(and(
    eq(clinicalAccessGrantsTable.professionalId, actor),
    eq(clinicalAccessGrantsTable.isResponsibleDoctor, true),
  ));
  const valid: Array<{ locationId: number; empresaId: number }> = [];
  for (const g of grants) {
    const doctor = await currentResponsibleDoctor(g.locationId, g.empresaId);
    if (doctor?.id === actor) valid.push(g);
  }
  return valid;
}

type Role = "destino" | "responsavel" | null;
async function roleOn(actor: number, row: Row): Promise<Role> {
  if (row.assigned_professional_id === actor) return "destino";
  const scopes = await responsibleScopes(actor);
  return scopes.some((s) => s.locationId === row.location_id && s.empresaId === row.empresa_id)
    ? "responsavel" : null;
}

async function loadAuthorized(req: Request, res: Response): Promise<{ row: Row; actor: number; role: Exclude<Role, null> } | null> {
  const actor = actorId(req);
  if (!actor) { res.status(401).json({ error: "Faça login de colaborador." }); return null; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Pedido inválido." }); return null; }
  const found = await db.execute(sql`SELECT * FROM client_medical_requests WHERE id = ${id}`);
  const row = found.rows[0] as unknown as Row | undefined;
  const role = row ? await roleOn(actor, row) : null;
  // Pedido de outra unidade/medico e inexistente para quem nao tem papel nele.
  if (!row || !role) { res.status(404).json({ error: "Pedido não encontrado." }); return null; }
  return { row, actor, role };
}

router.get("/pedidos-medicos/fila", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor) { res.status(401).json({ error: "Faça login de colaborador." }); return; }
  try {
    const scopes = await responsibleScopes(actor);
    const found = await db.execute(sql`
      SELECT r.*, c.name AS client_name FROM client_medical_requests r
        JOIN clients c ON c.id = r.client_id
       WHERE r.status IN ('pago','em_analise')
       ORDER BY r.created_at ASC LIMIT 500`);
    const rows = (found.rows as unknown as Array<Row & { client_name: string }>).filter((r) =>
      r.assigned_professional_id === actor ||
      scopes.some((s) => s.locationId === r.location_id && s.empresaId === r.empresa_id));
    res.json(rows.map((r) => ({
      id: r.id, kind: r.kind, kindLabel: PEDIDO_LABEL[r.kind], clientId: r.client_id,
      clientName: r.client_name, details: r.details, status: r.status,
      paidAt: r.paid_at, createdAt: r.created_at,
      assignedProfessionalId: r.assigned_professional_id, assignedReason: r.assigned_reason,
      asResponsible: r.assigned_professional_id !== actor,
    })));
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao listar fila de pedidos médicos");
    res.status(500).json({ error: "Não foi possível carregar a fila." });
  }
});

router.post("/pedidos-medicos/:id/iniciar", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return;
  // O responsavel tecnico so assume um pedido SEM destino; nunca toma o de outro medico.
  const canStart = ctx.role === "destino" || ctx.row.assigned_professional_id === null;
  if (!canStart) { res.status(403).json({ error: "Este pedido está com outro médico." }); return; }
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'em_analise', assigned_professional_id = ${ctx.actor},
           assigned_reason = COALESCE(assigned_reason, 'responsavel_tecnico'), updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status = 'pago'
       AND (assigned_professional_id = ${ctx.actor} OR assigned_professional_id IS NULL)
 RETURNING id`);
  if (upd.rows.length === 0) { res.status(409).json({ error: "O pedido não está mais aguardando análise." }); return; }
  res.json({ id: ctx.row.id, status: "em_analise" });
});

const EmitBody = z.object({ reference: z.string().trim().max(200).optional() }).strict();
router.post("/pedidos-medicos/:id/emitido", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return;
  const body = EmitBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: "Corpo inválido." }); return; }
  // Quem encerra e quem assinou: so o medico que esta com o pedido.
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'emitido', decided_by_professional_id = ${ctx.actor},
           issued_reference = ${body.data.reference ?? null}, updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status = 'em_analise' AND assigned_professional_id = ${ctx.actor}
 RETURNING id`);
  if (upd.rows.length === 0) {
    res.status(409).json({ error: "Só o médico que iniciou a análise pode concluir o pedido em análise." });
    return;
  }
  res.json({ id: ctx.row.id, status: "emitido" });
});

const RefuseBody = z.object({ reason: z.string().trim().min(10).max(1000) }).strict();
router.post("/pedidos-medicos/:id/recusar", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return;
  const body = RefuseBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Informe o motivo da recusa (mínimo de 10 caracteres)." }); return; }
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'recusado', decided_by_professional_id = ${ctx.actor},
           decision_note = ${body.data.reason}, refund_pending = TRUE, updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status IN ('pago','em_analise')
       AND assigned_professional_id = ${ctx.actor}
 RETURNING id`);
  if (upd.rows.length === 0) { res.status(409).json({ error: "Só o médico responsável pelo pedido pode recusá-lo." }); return; }
  // O sistema NAO devolve dinheiro sozinho: fica marcado para a clinica reembolsar.
  res.json({ id: ctx.row.id, status: "recusado", refundPending: true });
});

const ForwardBody = z.object({ professionalId: z.number().int().positive() }).strict();
router.post("/pedidos-medicos/:id/encaminhar", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return;
  if (ctx.role !== "responsavel") {
    res.status(403).json({ error: "Somente o médico responsável técnico pode encaminhar." });
    return;
  }
  const body = ForwardBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Informe o médico de destino." }); return; }
  const ok = await isEligibleDoctor(body.data.professionalId, ctx.row.location_id, ctx.row.empresa_id, ctx.row.kind);
  if (!ok) {
    res.status(422).json({ error: "O médico escolhido não está apto nesta unidade (vínculo, liberação ou certificado)." });
    return;
  }
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET assigned_professional_id = ${body.data.professionalId}, assigned_reason = 'encaminhado',
           status = 'pago', updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status IN ('pago','em_analise')
 RETURNING id`);
  if (upd.rows.length === 0) { res.status(409).json({ error: "O pedido já foi concluído." }); return; }
  res.json({ id: ctx.row.id, status: "pago", assignedProfessionalId: body.data.professionalId });
});

// Precos por tipo: so o dono da plataforma (CEO) configura. Sem valor, o cliente nao consegue pedir.
router.get("/pedidos-medicos/precos", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor || !(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  const out: Record<string, number | null> = {};
  for (const kind of PEDIDO_KINDS) out[kind] = await resolvePedidoAmount(kind);
  res.json({ minimo: ASAAS_MIN_VALUE, valores: out });
});

const PriceBody = z.object({
  receita: z.number().min(ASAAS_MIN_VALUE).max(100000).optional(),
  pedido_exames: z.number().min(ASAAS_MIN_VALUE).max(100000).optional(),
}).strict();
router.put("/pedidos-medicos/precos", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor || !(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  const body = PriceBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: `Valores devem ser números a partir de R$ ${ASAAS_MIN_VALUE},00.` }); return; }
  for (const kind of PEDIDO_KINDS) {
    const v = body.data[kind];
    if (v !== undefined) await setSetting(`pay.pedidoMedico.${kind}`, String(v));
  }
  const out: Record<string, number | null> = {};
  for (const kind of PEDIDO_KINDS) out[kind] = await resolvePedidoAmount(kind);
  res.json({ minimo: ASAAS_MIN_VALUE, valores: out });
});

export default router;
