import type { Request } from "express";
import { clinicManagementPermission, currentResponsibleDoctor } from "./clinical-access";

/** A empresa vem do registro persistido, nunca do corpo enviado pelo navegador. */
export async function mayWriteLocation(req: Request, location: {id:number;empresaId:number|null}) {
  const ctx = req.tenantContext;
  if (!ctx?.authenticated || !ctx.professionalId || !ctx.empresaId ||
      location.empresaId !== ctx.empresaId) return false;
  if (ctx.isPlatformOwner) return true;
  const permission = await clinicManagementPermission(ctx.professionalId,location.id);
  if (permission.allowed) return true;
  const responsible = await currentResponsibleDoctor(location.id,location.empresaId);
  return responsible?.id === ctx.professionalId;
}
