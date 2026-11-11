import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { condicaoCorpoClinico } from "./corpo-clinico.js";
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

/** Agenda sem registro de local: a autorização vale para quem administra algum local ativo da clínica (ou o proprietário). */
export async function mayManageAgendaEmpresa(req: Request) {
  const ctx = req.tenantContext;
  if (!ctx?.authenticated || !ctx.professionalId || !ctx.empresaId) return false;
  const locais = await db.execute(sql`SELECT id FROM locations WHERE empresa_id=${ctx.empresaId} AND active='true' ORDER BY id`);
  for (const l of locais.rows) if (await mayManageAgenda(req, Number(l.id))) return true;
  return false;
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
  // Agenda nova não tem registro de local: a autorização vem da clínica da sessão (empresa_id gravado na agenda).
  let semLocal = false;
  const criandoRecurso = req.method === "POST" && req.path === "/agenda/resources";
  if (resourceId) {
    const result = await db.execute(sql`SELECT location_id, empresa_id FROM agenda_resources WHERE id=${resourceId}`);
    if (result.rows[0]?.location_id != null) locationId = Number(result.rows[0].location_id);
    else if (result.rows[0] && Number(result.rows[0].empresa_id) === req.tenantContext.empresaId) semLocal = true;
    else locationId = NaN;
  } else if (criandoRecurso && (locationId === undefined || locationId === null)) {
    semLocal = true;
  }
  const autorizado = semLocal ? await mayManageAgendaEmpresa(req)
    : Number.isInteger(locationId) && (await mayManageAgenda(req, locationId));
  if (!autorizado) {
    res.status(403).json({error:"Alteração exige administrador autorizado ou responsável técnico desta clínica."}); return;
  }
  if (req.body?.professionalId != null) {
    // Mesmo Corpo Clínico que o cadastro mostra; não exige agenda nem vínculo de local anterior.
    const membership = await db.execute(sql`SELECT 1 FROM professionals p
      WHERE p.id=${Number(req.body.professionalId)} AND p.active AND ${condicaoCorpoClinico(req.tenantContext.empresaId!)} LIMIT 1`);
    if (!membership.rows.length) {res.status(403).json({error:"Profissional não pertence à empresa."});return;}
  }
  // Trocar o destino também exige autorização sobre o novo local.
  if (req.body?.locationId && !(await mayManageAgenda(req, Number(req.body.locationId)))) {
    res.status(403).json({error:"Novo local não autorizado."}); return;
  }
  next();
}
