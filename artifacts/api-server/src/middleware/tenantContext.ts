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

export interface TenantContext {
  empresaId: number;
  isPlatformOwner: boolean;
  perfilPlataforma: "platform_owner" | "admin" | "medico" | "enfermeira" | "recepcionista";
}

declare global {
  namespace Express {
    interface Request {
      tenantContext: TenantContext;
    }
  }
}

/**
 * Middleware principal — registrar ANTES de todas as rotas clínicas.
 *
 * Fase atual (single-tenant sem auth):
 *   - empresaId sempre = 5 (Instituto Pádua)
 *   - isPlatformOwner = true (CEO usa o sistema diretamente)
 *
 * Fase futura (multi-tenant com auth):
 *   - empresaId lido do payload JWT/session do usuário logado
 *   - isPlatformOwner = payload.perfilPlataforma === 'platform_owner'
 *   - Se isPlatformOwner && req.query.empresaId → usar o empresaId do query
 */
export function tenantContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // TODO (Fase auth): substituir por leitura do session/JWT
  // const payload = req.session?.usuario;
  // if (!payload) { res.status(401).json({ error: "não autenticado" }); return; }

  // Fase atual: single-tenant, CEO opera o sistema diretamente
  req.tenantContext = {
    empresaId: 5,          // Instituto Pádua — alterar quando auth multi-tenant estiver pronto
    isPlatformOwner: true,  // CEO sempre vê tudo
    perfilPlataforma: "platform_owner",
  };

  next();
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

  // platform_owner pode especificar empresaId via query param para cross-tenant
  if (isPlatformOwner && req.query.empresaId) {
    const override = parseInt(req.query.empresaId as string);
    if (!isNaN(override) && override > 0) return override;
  }

  return empresaId;
}

/**
 * Guard rápido: exige isPlatformOwner para rotas CEO/admin.
 * Uso: router.get("/master", requirePlatformOwner, handler)
 */
export function requirePlatformOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantContext?.isPlatformOwner) {
    res.status(403).json({ error: "Acesso restrito ao administrador da plataforma." });
    return;
  }
  next();
}
