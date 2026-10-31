/**
 * tenantContext — Middleware de isolamento multi-tenant PAXTER
 *
 * Carta 06 Fase A.2 (16/07/2026) — adaptado do padrão IHE (resposta Q6).
 *
 * Injeta `req.tenantContext` em toda requisição. Rotas clínicas usam
 * req.tenantContext.empresaId como WHERE obrigatório em todo SELECT/INSERT.
 *
 * Enquanto o sistema não tem auth completa (single-tenant, fase atual):
 * - empresaId = 5 (Instituto Pádua) para todas as rotas clínicas
 * - isPlatformOwner = true (CEO) para rotas admin/CEO
 * - Quando auth for adicionada, substituir pelo payload do session/JWT
 *
 * NUNCA remover este arquivo após adicionar auth — só substituir a lógica interna.
 */

import type { Request, Response, NextFunction } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  empresasTable,
  locationProfessionalsTable,
  locationsTable,
  professionalsTable,
} from "@workspace/db";
import { verifyCollaboratorToken } from "../lib/collaborator-auth.js";

export interface TenantContext {
  empresaId: number;
  isPlatformOwner: boolean;
  perfilPlataforma: "platform_owner" | "admin" | "medico" | "enfermeira" | "recepcionista";
  authenticated: boolean;
  professionalId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      tenantContext: TenantContext;
    }
  }
}

/**
 * Resolve o contexto somente a partir da conta ativa no banco.
 * A empresa enviada pelo navegador é uma seleção, nunca uma concessão de acesso.
 */
export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  void resolveTenantContext(req, res)
    .then(() => {
      if (!res.headersSent) next();
    })
    .catch(next);
}

async function resolveTenantContext(req: Request, res: Response): Promise<void> {
  const authorization = req.headers.authorization;
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const claims = bearer ? verifyCollaboratorToken(bearer) : null;

  // Rotas públicas e autenticação de outros provedores mantêm o contexto legado,
  // mas nunca recebem autoridade de proprietário.
  if (!claims) {
    req.tenantContext = {
      empresaId: 5,
      isPlatformOwner: false,
      perfilPlataforma: "recepcionista",
      authenticated: false,
      professionalId: null,
    };
    return;
  }

  const [professional] = await db
    .select({
      id: professionalsTable.id,
      role: professionalsTable.role,
      category: professionalsTable.category,
      active: professionalsTable.active,
      empresaId: professionalsTable.empresaId,
      isPlatformOwner: professionalsTable.isPlatformOwner,
      credentialVersion: professionalsTable.credentialVersion,
    })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, claims.professionalId))
    .limit(1);

  if (
    !professional ||
    !professional.active ||
    (professional.credentialVersion ?? 0) !== (claims.credentialVersion ?? 0)
  ) {
    req.tenantContext = {
      empresaId: 5,
      isPlatformOwner: false,
      perfilPlataforma: "recepcionista",
      authenticated: false,
      professionalId: null,
    };
    return;
  }

  const requestedCompany = requestedEmpresaId(req);
  if (requestedCompany.kind === "invalid") {
    res.status(400).json({ error: "A clínica selecionada é inválida." });
    return;
  }

  const memberships = new Set<number>();
  if (professional.empresaId && professional.empresaId > 0) {
    memberships.add(professional.empresaId);
  }

  const linkedLocations = await db
    .select({ empresaId: locationsTable.empresaId })
    .from(locationProfessionalsTable)
    .innerJoin(
      locationsTable,
      eq(locationProfessionalsTable.locationId, locationsTable.id),
    )
    .where(
      and(
        eq(locationProfessionalsTable.professionalId, professional.id),
        eq(locationsTable.active, "true"),
        isNotNull(locationsTable.empresaId),
      ),
    );
  for (const location of linkedLocations) {
    if (location.empresaId && location.empresaId > 0) memberships.add(location.empresaId);
  }

  let empresaId: number | null = null;
  if (professional.isPlatformOwner && requestedCompany.value !== null) {
    empresaId = await activeCompanyId(requestedCompany.value);
    if (empresaId === null) {
      res.status(403).json({ error: "A clínica selecionada não está ativa ou não existe." });
      return;
    }
  } else if (requestedCompany.value !== null) {
    if (!memberships.has(requestedCompany.value)) {
      res.status(403).json({ error: "Este profissional não tem vínculo com a clínica selecionada." });
      return;
    }
    empresaId = await activeCompanyId(requestedCompany.value);
  } else if (professional.empresaId && memberships.has(professional.empresaId)) {
    empresaId = await activeCompanyId(professional.empresaId);
  } else if (!professional.isPlatformOwner && memberships.size === 1) {
    empresaId = await activeCompanyId([...memberships][0]);
  }

  if (empresaId === null) {
    res.status(403).json({ error: "Não há uma clínica ativa vinculada a este acesso." });
    return;
  }

  const category = professional.category.toLowerCase();
  const perfilPlataforma: TenantContext["perfilPlataforma"] = professional.isPlatformOwner
    ? "platform_owner"
    : category.includes("medic")
      ? "medico"
      : category.includes("enferm")
        ? "enfermeira"
        : category.includes("admin")
          ? "admin"
          : "recepcionista";

  req.tenantContext = {
    empresaId,
    isPlatformOwner: professional.isPlatformOwner,
    perfilPlataforma,
    authenticated: true,
    professionalId: professional.id,
  };
}

function requestedEmpresaId(
  req: Request,
): { kind: "ok"; value: number | null } | { kind: "invalid"; value: null } {
  const query = req.query.empresaId;
  const header = req.headers["x-empresa-id"];
  const queryValue = typeof query === "string" ? query : undefined;
  const headerValue = typeof header === "string" ? header : undefined;
  if ((query !== undefined && queryValue === undefined) || (header !== undefined && headerValue === undefined)) {
    return { kind: "invalid", value: null };
  }
  if (queryValue && headerValue && queryValue !== headerValue) {
    return { kind: "invalid", value: null };
  }
  const raw = queryValue ?? headerValue;
  if (raw === undefined) return { kind: "ok", value: null };
  if (!/^[1-9]\d*$/.test(raw)) return { kind: "invalid", value: null };
  const value = Number(raw);
  return Number.isSafeInteger(value)
    ? { kind: "ok", value }
    : { kind: "invalid", value: null };
}

async function activeCompanyId(id: number): Promise<number | null> {
  const [company] = await db
    .select({ id: empresasTable.id })
    .from(empresasTable)
    .where(
      and(
        eq(empresasTable.id, id),
        eq(empresasTable.ativa, true),
        eq(empresasTable.status, "ATIVO"),
      ),
    )
    .limit(1);
  return company?.id ?? null;
}

/**
 * Helper para rotas que precisam escolher entre "ver tudo" (platform_owner)
 * ou filtrar pelo tenant do usuário logado.
 *
 * Uso:
 *   const empresaId = resolveEmpresaId(req);
 *   await db.select().from(tabela).where(eq(tabela.empresaId, empresaId));
 */
export function resolveEmpresaId(req: Request): number {
  const { isPlatformOwner, empresaId } = req.tenantContext;

  // A selecao ja foi validada pelo middleware contra empresa ativa/vinculo.
  if (isPlatformOwner && req.tenantContext.authenticated) {
    return empresaId;
  }

  return empresaId;
}

/**
 * Guard rápido: exige isPlatformOwner para rotas CEO/admin.
 * Uso: router.get("/master", requirePlatformOwner, handler)
 */
export function requirePlatformOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantContext?.authenticated || !req.tenantContext.isPlatformOwner) {
    res.status(403).json({ error: "Acesso restrito ao administrador da plataforma." });
    return;
  }
  next();
}

/**
 * Guard de instância CEO — dupla camada.
 *
 * Camada 1 — PADAXOR_AI_BYPASS=true : flag de conveniência (env var no servidor).
 *   Clones PODEM setar isso no próprio Replit → camada 1 sozinha NÃO é suficiente.
 *
 * Camada 2 — Header X-Padaxor-CEO vs PADAXOR_CEO_SECRET (env var do servidor CEO):
 *   A requisição deve incluir o header X-Padaxor-CEO com o valor exato de
 *   PADAXOR_CEO_SECRET. Esse secret vive APENAS nos Replit Secrets do CEO.
 *   Um clone seta PADAXOR_AI_BYPASS=true mas não conhece PADAXOR_CEO_SECRET
 *   do CEO → bloqueado na camada 2.
 *
 * Modo degradado (dev local / secret não configurado):
 *   Se PADAXOR_CEO_SECRET não está definido, aceita só a camada 1.
 *   Em produção (Railway), PADAXOR_CEO_SECRET DEVE estar configurado.
 *
 * Uso: router.get("/rota-ceo", requireCeoInstance, handler)
 */
export function requireCeoInstance(req: Request, res: Response, next: NextFunction): void {
  const bypass    = process.env.PADAXOR_AI_BYPASS;
  const ceoSecret = process.env.PADAXOR_CEO_SECRET ?? "";

  // Camada 1: flag de conveniência
  if (bypass !== "true") {
    res.status(403).json({ error: "Acesso restrito." });
    return;
  }

  // Camada 2: header vs secret de plataforma (só aplica quando o secret está configurado)
  if (ceoSecret.length > 0) {
    const header = (req.headers["x-padaxor-ceo"] as string | undefined) ?? "";
    if (header !== ceoSecret) {
      res.status(403).json({ error: "Acesso restrito." });
      return;
    }
  }

  next();
}
