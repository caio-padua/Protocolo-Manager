import type { Request, Response, NextFunction } from "express";
import { resolveOnboardingClinic } from "../lib/onboarding-clinic";

declare global {
  namespace Express {
    interface Request {
      messageEmpresaId?: number;
    }
  }
}

// Reuse the same authenticated database membership as guide delivery.
// No legacy owner context, caller-supplied tenant, or role grants access.
export async function requireMessageClinic(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clinic = await resolveOnboardingClinic(req, res);
  if (!clinic) return;
  req.messageEmpresaId = clinic.id;
  next();
}
