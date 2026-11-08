import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { mayManageAgenda } from "../lib/agenda-governance";
import { canonicalWindows, validWindowRecurrence } from "../lib/agenda-window-recurrence";
import { syncGoogleAgenda } from "../lib/agenda-google-sync";
import {
  CreateAgendaChangeRequestBody as AgendaWindowChangeInput,
  DecideAgendaChangeRequestBody as AgendaChangeDecisionInput,
  UpdateAgendaPersonalOwnerBody as AgendaPersonalOwnerInput,
  UpdateAgendaReadSettingsBody as AgendaReadSettingsInput,
  GetAgendaIntegrationResponse, ListAgendaChangeRequestsResponse,
} from "@workspace/api-zod";

const router = Router();
router.use("/agenda/integration", requireCollaborator);
router.use("/agenda/requests", requireCollaborator);
const canonical = canonicalWindows;
const windowsQuery = (id: number) => sql`SELECT weekday,start_time AS "startTime",end_time AS "endTime",
  repeat_weeks AS "repeatWeeks",anchor_date AS "anchorDate"
  FROM agenda_windows WHERE resource_id=${id} AND active ORDER BY weekday,start_time`;

router.get("/agenda/integration", async (req,res): Promise<void> => {
  const result = await db.execute(sql`SELECT l.id,l.name,l.color,l.agenda_papel AS role,
    s.enabled,s.last_success AS "lastSuccess",s.last_attempt AS "lastAttempt",s.error,
    p.professional_id AS "personalOwnerId"
    FROM locations l LEFT JOIN agenda_google_sync s ON s.location_id=l.id
    LEFT JOIN agenda_personal_owners p ON p.location_id=l.id
    WHERE l.empresa_id=${req.tenantContext.empresaId} AND l.active='true' AND l.google_calendar_id IS NOT NULL ORDER BY l.id`);
  const agendas = [];
  for (const row of result.rows) agendas.push({...row,canManage:await mayManageAgenda(req,Number(row.id))});
  const professionals = await db.execute(sql`SELECT DISTINCT p.id,p.name FROM professionals p
    JOIN location_professionals lp ON lp.professional_id=p.id JOIN locations l ON l.id=lp.location_id
    WHERE l.empresa_id=${req.tenantContext.empresaId} AND p.active ORDER BY p.name`);
  const resources = await db.execute(sql`SELECT r.id,r.name,r.location_id AS "locationId" FROM agenda_resources r
    JOIN locations l ON l.id=r.location_id WHERE l.empresa_id=${req.tenantContext.empresaId} AND r.active ORDER BY r.sort_order`);
  res.json(GetAgendaIntegrationResponse.parse(JSON.parse(JSON.stringify({
    agendas,professionals:professionals.rows,resources:resources.rows,globalSettingsOwnerOnly:true,
    canManageGlobalSettings:Boolean(req.tenantContext.authenticated && req.tenantContext.isPlatformOwner),
    companyId:req.tenantContext.empresaId,
  }))));
});
router.post("/agenda/integration/refresh", async (req,res): Promise<void> => {
  const locations = await db.execute(sql`SELECT id FROM locations WHERE empresa_id=${req.tenantContext.empresaId} AND google_calendar_id IS NOT NULL AND active='true'`);
  let allowed = false;
  for (const loc of locations.rows) if (await mayManageAgenda(req,Number(loc.id))) allowed = true;
  if (!allowed) {res.status(403).json({error:"Atualização manual exige autorização administrativa."});return;}
  void syncGoogleAgenda().catch(() => {});
  res.status(202).json({accepted:true});
});
router.put("/agenda/integration/read-settings", async (req,res): Promise<void> => {
  const input = AgendaReadSettingsInput.safeParse(req.body);
  if (!input.success) {res.status(400).json({error:"Configuração inválida."});return;}
  if (!(await mayManageAgenda(req,input.data.locationId))) {res.status(403).json({error:"Local não autorizado."});return;}
  await db.execute(sql`INSERT INTO agenda_google_sync(location_id,enabled) VALUES(${input.data.locationId},${input.data.enabled})
    ON CONFLICT(location_id) DO UPDATE SET enabled=EXCLUDED.enabled`);
  res.json({ok:true});
});
router.put("/agenda/integration/personal-owner", async (req,res): Promise<void> => {
  const input = AgendaPersonalOwnerInput.safeParse(req.body);
  if (!input.success) {res.status(400).json({error:"Vínculo inválido."});return;}
  const {locationId,professionalId} = input.data;
  if (!(await mayManageAgenda(req,locationId))) {res.status(403).json({error:"Local não autorizado."});return;}
  const location = await db.execute(sql`SELECT id FROM locations WHERE id=${locationId} AND agenda_papel='pessoal'`);
  if (!location.rows.length) {res.status(400).json({error:"Selecione uma agenda pessoal."});return;}
  if (professionalId !== null) {
    const member = await db.execute(sql`SELECT 1 FROM professionals p JOIN location_professionals lp ON lp.professional_id=p.id
      JOIN locations l ON l.id=lp.location_id WHERE p.id=${professionalId} AND p.active AND l.empresa_id=${req.tenantContext.empresaId} LIMIT 1`);
    if (!member.rows.length) {res.status(400).json({error:"Titular não pertence à empresa."});return;}
  }
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${req.tenantContext.empresaId!})`);
    if (professionalId === null) await tx.execute(sql`DELETE FROM agenda_personal_owners WHERE location_id=${locationId}`);
    else await tx.execute(sql`INSERT INTO agenda_personal_owners(location_id,professional_id,empresa_id)
      VALUES(${locationId},${professionalId},${req.tenantContext.empresaId})
      ON CONFLICT(location_id) DO UPDATE SET professional_id=EXCLUDED.professional_id,empresa_id=EXCLUDED.empresa_id`);
  });
  res.json({ok:true});
});
router.get("/agenda/requests", async (req,res): Promise<void> => {
  const result = await db.execute(sql`SELECT q.id,q.resource_id AS "resourceId",r.name AS resource,q.reason,
    q.state,q.proposed_windows AS windows,q.created_at AS "createdAt",r.location_id AS "locationId",q.requested_by AS "requestedBy"
    FROM agenda_change_requests q JOIN agenda_resources r ON r.id=q.resource_id
    WHERE q.empresa_id=${req.tenantContext.empresaId} ORDER BY q.id DESC LIMIT 100`);
  const requests = [];
  for (const row of result.rows) {
    const canDecide = await mayManageAgenda(req,Number(row.locationId));
    if (canDecide || Number(row.requestedBy) === req.tenantContext.professionalId) requests.push({...row,canDecide});
  }
  res.json(ListAgendaChangeRequestsResponse.parse(JSON.parse(JSON.stringify({requests}))));
});
router.post("/agenda/requests", async (req,res): Promise<void> => {
  const input = AgendaWindowChangeInput.safeParse(req.body);
  if (!input.success) {res.status(400).json({error:"Solicitação inválida."});return;}
  if (!input.data.expectedWindows) {
    res.status(409).json({error:"Atualize a tela e confira o expediente antes de solicitar."});return;
  }
  const windows = canonical(input.data.windows);
  if (windows.some((w,i) => !validWindowRecurrence(w.weekday,w.repeatWeeks,w.anchorDate) ||
      w.endTime<=w.startTime || (i>0 && windows[i-1].weekday===w.weekday && windows[i-1].endTime>w.startTime))) {
    res.status(400).json({error:"Expedientes inválidos ou sobrepostos."});return;
  }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${req.tenantContext.empresaId!})`);
    const resource = await tx.execute(sql`SELECT r.id FROM agenda_resources r JOIN locations l ON l.id=r.location_id
      WHERE r.id=${input.data.resourceId} AND r.active AND l.empresa_id=${req.tenantContext.empresaId}`);
    if (!resource.rows.length) return {status:404,error:"Recurso não encontrado."};
    const before = await tx.execute(windowsQuery(input.data.resourceId));
    if (JSON.stringify(canonical(before.rows as any[])) !== JSON.stringify(canonical(input.data.expectedWindows!)) ||
        (canonical(before.rows as any[]).some(w => w.repeatWeeks===2) && input.data.windows.some(w => w.repeatWeeks===undefined))) {
      return {status:409,error:"O expediente mudou; recarregue e confira antes de solicitar."};
    }
    const created = await tx.execute(sql`INSERT INTO agenda_change_requests
      (empresa_id,resource_id,requested_by,reason,before_windows,proposed_windows)
      VALUES(${req.tenantContext.empresaId},${input.data.resourceId},${req.tenantContext.professionalId},
        ${input.data.reason},${JSON.stringify(canonical(before.rows as any[]))}::jsonb,${JSON.stringify(windows)}::jsonb) RETURNING id`);
    return {status:201,id:Number(created.rows[0].id),state:"pendente"};
  });
  res.status(result.status).json(result);
});
router.post("/agenda/requests/:id/decision", async (req,res): Promise<void> => {
  const input = AgendaChangeDecisionInput.safeParse(req.body);
  const id = Number(req.params.id);
  if (!input.success || !Number.isInteger(id) || id<=0) {res.status(400).json({error:"Decisão inválida."});return;}
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${req.tenantContext.empresaId!})`);
    const found = await tx.execute(sql`SELECT q.*,r.location_id FROM agenda_change_requests q JOIN agenda_resources r ON r.id=q.resource_id
      WHERE q.id=${id} AND q.empresa_id=${req.tenantContext.empresaId} FOR UPDATE OF q`);
    const row = found.rows[0];
    if (!row) return {status:404,error:"Solicitação não encontrada."};
    if (!(await mayManageAgenda(req,Number(row.location_id)))) return {status:403,error:"Aprovação não autorizada."};
    if (row.state!=="pendente") return {status:409,error:"Solicitação já decidida."};
    if (Date.now()-new Date(String(row.created_at)).getTime()>7*86400_000) return {status:409,error:"Solicitação expirada; envie outra."};
    const current = await tx.execute(windowsQuery(Number(row.resource_id)));
    if (JSON.stringify(canonical(current.rows as any[]))!==JSON.stringify(canonical(row.before_windows as any[]))) return {status:409,error:"Expediente mudou; solicite nova conferência."};
    if (input.data.decision==="aprovar") {
      await tx.execute(sql`UPDATE agenda_windows SET active=false WHERE resource_id=${Number(row.resource_id)} AND active`);
      for (const window of canonical(row.proposed_windows as any[])) await tx.execute(sql`INSERT INTO agenda_windows
        (resource_id,weekday,start_time,end_time,repeat_weeks,anchor_date,active)
        VALUES(${Number(row.resource_id)},${window.weekday},${window.startTime},${window.endTime},${window.repeatWeeks},${window.anchorDate},true)`);
    }
    const state = input.data.decision==="aprovar" ? "aprovado" : "recusado";
    await tx.execute(sql`UPDATE agenda_change_requests SET state=${state},decided_by=${req.tenantContext.professionalId},decided_at=now() WHERE id=${id}`);
    return {status:200,state};
  });
  res.status(result.status).json(result);
});
export default router;
