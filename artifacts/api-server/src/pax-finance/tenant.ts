import type { NextFunction, Request, Response } from "express";
import { requireCollaborator } from "../routes/collaborator";
import { requireMessageClinic } from "../middleware/messageClinic";
import { moduleGuard } from "../middleware/moduleGuard";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * ÚNICO ponto de contato do PAX FINANCE com autenticação, clínica e módulos do PAXMED.
 * Para extrair o SaaS, só este arquivo muda (trocar por autenticação própria).
 * A empresa vem SEMPRE da sessão autenticada: nunca de corpo, query ou cabeçalho.
 */
export interface FinContext { companyId: number; actorId: number | null }

/**
 * Troca de empresa pelo seletor: o cabecalho `x-fin-company` so vale se o colaborador autenticado tem vinculo
 * (empresa originaria da sessao ou professional_empresas) com empresa ativa. Qualquer outro valor => 403.
 */
export async function finCompanyScope(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.headers["x-fin-company"];
    if (raw === undefined || raw === "") { next(); return; }
    const alvo = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isSafeInteger(alvo) || alvo <= 0) { res.status(400).json({ error: "Empresa invalida" }); return; }
    if (alvo === req.messageEmpresaId) { next(); return; }
    const profId = req.collaborator?.professionalId;
    const ok = profId ? (await db.execute(sql`SELECT 1 FROM professional_empresas pe JOIN empresas e ON e.id = pe.empresa_id
      WHERE pe.professional_id = ${profId} AND pe.empresa_id = ${alvo} AND e.ativa = true AND e.status = 'ATIVO' LIMIT 1`)).rows.length > 0 : false;
    if (!ok) { res.status(403).json({ error: "Voce nao tem acesso a esta empresa" }); return; }
    req.messageEmpresaId = alvo;
    next();
  } catch { res.status(500).json({ error: "Falha ao validar a empresa" }); }
}

/** Empresas que o colaborador pode escolher no seletor (originaria da sessao + vinculadas ativas). */
export async function empresasPermitidas(req: Request): Promise<number[]> {
  const profId = req.collaborator?.professionalId;
  const base = req.headers["x-fin-company"] ? await sessaoOriginaria(req) : req.messageEmpresaId;
  const ids = new Set<number>(base ? [base] : []);
  if (profId) {
    const r = await db.execute(sql`SELECT pe.empresa_id FROM professional_empresas pe JOIN empresas e ON e.id = pe.empresa_id
      WHERE pe.professional_id = ${profId} AND e.ativa = true AND e.status = 'ATIVO'`);
    for (const x of r.rows as { empresa_id: number }[]) ids.add(Number(x.empresa_id));
  }
  return [...ids];
}
async function sessaoOriginaria(req: Request): Promise<number | undefined> {
  const profId = req.collaborator?.professionalId;
  if (!profId) return undefined;
  const r = await db.execute(sql`SELECT empresa_id FROM professionals WHERE id = ${profId}`);
  const v = (r.rows[0] as { empresa_id?: number } | undefined)?.empresa_id;
  return v ? Number(v) : undefined;
}

export const finGuards = [requireCollaborator, requireMessageClinic, finCompanyScope, moduleGuard("financeiro")];

export function finContext(req: Request): FinContext {
  const companyId = req.messageEmpresaId;
  if (!companyId) throw new Error("PAX FINANCE: empresa nao resolvida pela sessao");
  return { companyId, actorId: req.collaborator?.professionalId ?? null };
}

export type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
