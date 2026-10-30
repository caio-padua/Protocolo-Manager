import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { verifyCollaboratorToken } from "./collaborator-auth.js";
import { logger } from "./logger.js";

interface OnboardingClinic {
  id: number;
  nome: string;
  slug: string | null;
  telegram_bot_username: string | null;
  area_url: string | null;
}

/**
 * Local to onboarding: the global tenant context is still single-tenant.
 * Resolve the current database membership on every request, not from a
 * caller-supplied slug, role or the global platform-owner fallback.
 */
export async function resolveOnboardingClinic(
  req: Request,
  res: Response,
): Promise<OnboardingClinic | null> {
  const header = req.headers.authorization;
  const claims = header?.startsWith("Bearer ")
    ? verifyCollaboratorToken(header.slice(7).trim())
    : null;
  if (!claims || !Number.isSafeInteger(claims.professionalId) || claims.professionalId <= 0) {
    res.status(401).json({ ok: false, error: "Faça login de colaborador para enviar o guia." });
    return null;
  }
  try {
    const result = await db.execute(sql`
      SELECT e.id, e.nome, e.slug, e.telegram_bot_username, e.area_url
      FROM professionals p
      JOIN empresas e ON e.id = p.empresa_id
      WHERE p.id = ${claims.professionalId} AND p.active = true
        AND e.ativa = true AND e.status = 'ATIVO'
      LIMIT 1
    `);
    const clinic = result.rows[0] as OnboardingClinic | undefined;
    if (!clinic || !Number.isSafeInteger(clinic.id) || clinic.id <= 0) {
      res.status(403).json({ ok: false, error: "Colaborador sem vínculo ativo com uma clínica." });
      return null;
    }
    return clinic;
  } catch (err) {
    logger.error({ err }, "onboarding: falha ao confirmar clínica do colaborador");
    res.status(500).json({ ok: false, error: "Não foi possível confirmar a clínica. Tente novamente." });
    return null;
  }
}
