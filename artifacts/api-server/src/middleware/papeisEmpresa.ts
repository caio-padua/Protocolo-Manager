import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, professionalPapeisEmpresaTable } from "@workspace/db";
import { decidirAcesso, regraDoCaminho, type PapeisClinica } from "../lib/papeis-acesso.js";

/**
 * Autorização por papel x clínica. Montado em /api, depois do tenantContext.
 * Os papéis vêm do banco para (profissional da sessão, clínica resolvida pela sessão);
 * nunca do corpo, query ou token. Falha de banco = 403 (fail-closed).
 */
export function papeisEmpresaMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ctx = req.tenantContext;
  const regra = regraDoCaminho(req.path, req.method.toUpperCase());
  if (!regra) {
    next();
    return;
  }
  const entrada = {
    path: req.path,
    metodo: req.method,
    autenticado: !!ctx?.authenticated,
    donoPlataforma: !!ctx?.isPlatformOwner,
  };
  const responder = (papeis: PapeisClinica | null): void => {
    const d = decidirAcesso({ ...entrada, papeis });
    if (d.ok) {
      next();
      return;
    }
    req.log?.warn({ dominio: d.dominio, status: d.status, profissional: ctx?.professionalId ?? null, empresaId: ctx?.empresaId }, "papeisEmpresa: acesso negado");
    res.status(d.status).json({ error: d.motivo, dominio: d.dominio });
  };

  if (!ctx?.authenticated || ctx.isPlatformOwner || !ctx.professionalId) {
    responder(null);
    return;
  }
  void db
    .select()
    .from(professionalPapeisEmpresaTable)
    .where(
      and(
        eq(professionalPapeisEmpresaTable.professionalId, ctx.professionalId),
        eq(professionalPapeisEmpresaTable.empresaId, ctx.empresaId),
      ),
    )
    .limit(1)
    .then(([row]) =>
      responder(
        row
          ? {
              admin: row.isClinicAdmin,
              doctor: row.isDoctor,
              nurse: row.isNurse,
              reception: row.isReception,
              finance: row.isFinance,
            }
          : null,
      ),
    )
    .catch((err) => {
      req.log?.error({ err }, "papeisEmpresa: falha ao ler papéis");
      res.status(403).json({ error: "Não foi possível confirmar seu papel nesta clínica.", dominio: regra.dominio });
    });
}
