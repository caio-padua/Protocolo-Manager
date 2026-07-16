/**
 * moduleGuard — Guard de módulos por tenant (Carta 06)
 *
 * Bloqueia rota se a empresa não tiver o módulo ativo em `modulos_ativos` (JSONB).
 * Uso: router.get("/exames", moduleGuard("exames_lab"), handler)
 *
 * Módulos reconhecidos:
 *   agenda, financeiro, estoque, ras, protocolos,
 *   exames_lab, comunicacao, arsenal, anamnese, cockpit
 *
 * Regra: isPlatformOwner NUNCA é bloqueado por módulo.
 * Regra: se modulos_ativos está vazio ou é null, todos os módulos passam
 *        (clinica legacy sem configuração = acesso total, por compatibilidade).
 */

import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { empresasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type ModuloId =
  | "agenda"
  | "financeiro"
  | "estoque"
  | "ras"
  | "protocolos"
  | "exames_lab"
  | "comunicacao"
  | "arsenal"
  | "anamnese"
  | "cockpit";

/**
 * Cria um middleware que bloqueia a rota se o módulo não estiver ativo.
 *
 * Exemplo de uso:
 *   router.get("/exames", moduleGuard("exames_lab"), handler)
 */
export function moduleGuard(moduloId: ModuloId) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = req.tenantContext;

    // Platform owner nunca é bloqueado
    if (ctx?.isPlatformOwner) {
      next();
      return;
    }

    const empresaId = ctx?.empresaId;
    if (!empresaId) {
      res.status(401).json({ error: "Sem contexto de tenant." });
      return;
    }

    try {
      const [empresa] = await db
        .select({ modulosAtivos: empresasTable.modulosAtivos })
        .from(empresasTable)
        .where(eq(empresasTable.id, empresaId))
        .limit(1);

      if (!empresa) {
        res.status(403).json({ error: "Empresa não encontrada." });
        return;
      }

      const modulos = empresa.modulosAtivos as Record<string, boolean> | null;

      // Sem configuração → acesso total (legacy)
      if (!modulos || Object.keys(modulos).length === 0) {
        next();
        return;
      }

      // Módulo explicitamente desativado → bloquear
      if (modulos[moduloId] === false) {
        res.status(403).json({
          error: `Módulo "${moduloId}" não habilitado para esta clínica.`,
          modulo: moduloId,
        });
        return;
      }

      next();
    } catch (err) {
      req.log?.error({ err }, "moduleGuard: erro ao verificar módulos");
      // Fail-open: em caso de erro de BD, não bloquear a rota
      next();
    }
  };
}
