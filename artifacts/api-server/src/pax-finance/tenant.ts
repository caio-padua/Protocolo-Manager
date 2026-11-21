import type { NextFunction, Request, Response } from "express";
import { requireCollaborator } from "../routes/collaborator";
import { requireMessageClinic } from "../middleware/messageClinic";
import { moduleGuard } from "../middleware/moduleGuard";

/**
 * ÚNICO ponto de contato do PAX FINANCE com autenticação, clínica e módulos do PAXMED.
 * Para extrair o SaaS, só este arquivo muda (trocar por autenticação própria).
 * A empresa vem SEMPRE da sessão autenticada: nunca de corpo, query ou cabeçalho.
 */
export interface FinContext { companyId: number; actorId: number | null }

export const finGuards = [requireCollaborator, requireMessageClinic, moduleGuard("financeiro")];

export function finContext(req: Request): FinContext {
  const companyId = req.messageEmpresaId;
  if (!companyId) throw new Error("PAX FINANCE: empresa nao resolvida pela sessao");
  return { companyId, actorId: req.collaborator?.professionalId ?? null };
}

export type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
