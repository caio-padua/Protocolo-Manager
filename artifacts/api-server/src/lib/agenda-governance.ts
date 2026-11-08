import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { clinicManagementPermission, currentResponsibleDoctor } from "./clinical-access";

export async function mayManageAgenda(req: Request, locationId: number) {
  const ctx = req.tenantContext;
  if (!ctx?.authenticated || !ctx.professionalId || !ctx.empresaId) return false;
  const location = await db.execute(sql`SELECT empresa_id FROM locations WHERE id=${locationId} AND active='true'`);
  if (Number(location.rows[0]?.empresa_id) !== ctx.empresaId) return false;
  const permission = await clinicManagementPermission(ctx.professionalId, locationId);
  if (permission.allowed) return true;
  const responsible = await currentResponsibleDoctor(locationId, ctx.empresaId);
  return responsible?.id === ctx.professionalId;
}

export async function agendaWriteGuard(req: Request, res: Response, next: NextFunction) {
  const protectedPath = /^\/agenda\/(resources|exceptions|settings)(\/|$)/.test(req.path);
  const booking = /^\/agenda\/(book|limpar-simulacao)(\/|$)/.test(req.path);
  if (["GET","HEAD","OPTIONS"].includes(req.method) || (!protectedPath && !booking)) { next(); return; }
  if (!req.tenantContext?.authenticated) { res.status(401).json({error:"Entre com seu acesso profissional."}); return; }
  if (booking) {
    if (req.path.includes("limpar-simulacao") && !req.tenantContext.isPlatformOwner) {
      res.status(403).json({error:"Limpeza restrita ao proprietário."});return;
    }
    next(); return;
  }
  if (req.path === "/agenda/settings" || (req.path === "/agenda/exceptions" && !req.body?.resourceId)) {
    if (!req.tenantContext.isPlatformOwner) {
      res.status(403).json({error:"Esta regra é global; somente o proprietário pode alterá-la."}); return;
    }
    next(); return;
  }
  let locationId = req.body?.locationId;
  const resourceMatch = req.path.match(/^\/agenda\/resources\/(\d+)/);
  const exceptionMatch = req.path.match(/^\/agenda\/exceptions\/(\d+)/);
  let resourceId = resourceMatch ? Number(resourceMatch[1]) : Number(req.body?.resourceId);
  if (exceptionMatch) {
    const result = await db.execute(sql`SELECT resource_id FROM agenda_exceptions WHERE id=${Number(exceptionMatch[1])}`);
    resourceId = Number(result.rows[0]?.resource_id);
    if (!resourceId) {
      if (req.tenantContext.isPlatformOwner) { next(); return; }
      res.status(403).json({error:"Exceção global exige o proprietário."}); return;
    }
  }
  if (resourceId) {
    const result = await db.execute(sql`SELECT location_id FROM agenda_resources WHERE id=${resourceId}`);
    locationId = Number(result.rows[0]?.location_id);
  }
  if (!Number.isInteger(locationId) || !(await mayManageAgenda(req, locationId))) {
    res.status(403).json({error:"Alteração exige administrador autorizado ou responsável técnico desta clínica."}); return;
  }
  if (req.body?.professionalId != null) {
    const membership = await db.execute(sql`SELECT 1 FROM professionals p
      JOIN location_professionals lp ON lp.professional_id=p.id JOIN locations l ON l.id=lp.location_id
      WHERE p.id=${Number(req.body.professionalId)} AND p.active
        AND l.empresa_id=${req.tenantContext.empresaId} LIMIT 1`);
    if (!membership.rows.length) {res.status(403).json({error:"Profissional não pertence à empresa."});return;}
  }
  // Trocar o destino também exige autorização sobre o novo local.
  if (req.body?.locationId && !(await mayManageAgenda(req, Number(req.body.locationId)))) {
    res.status(403).json({error:"Novo local não autorizado."}); return;
  }
  next();
}
