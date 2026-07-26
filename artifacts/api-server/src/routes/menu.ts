/**
 * menu.ts — GET /api/menu
 *
 * Retorna os itens de menu que a empresa do contexto tem acesso,
 * filtrados pelos módulos ativos em `empresas.modulos_ativos`.
 *
 * Regras:
 *   - isPlatformOwner (empresa_id = 5) → lista completa sempre.
 *   - modulos_ativos vazio ou null → lista completa (legacy).
 *   - modulos_ativos com módulo explicitamente false → item omitido.
 *   - Durante carregamento o front exibe skeleton de 5 itens.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { empresasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { MENU_ITEMS } from "../lib/menuItems";

const router: IRouter = Router();

router.get("/menu", async (req, res): Promise<void> => {
  const ctx = req.tenantContext;

  // Platform owner vê tudo
  if (ctx?.isPlatformOwner) {
    res.json({ items: MENU_ITEMS });
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

    // Sem configuração → acesso total (clínica legacy)
    if (!modulos || Object.keys(modulos).length === 0) {
      res.json({ items: MENU_ITEMS });
      return;
    }

    // Filtrar: item passa se moduloRequerido é null OU módulo não é false
    const items = MENU_ITEMS.filter((item) => {
      if (item.moduloRequerido === null) return true;
      return modulos[item.moduloRequerido] !== false;
    });

    res.json({ items });
  } catch (err) {
    req.log.error({ err }, "GET /menu: erro ao filtrar módulos");
    // Fail-open: em caso de erro retorna lista completa
    res.json({ items: MENU_ITEMS });
  }
});

export default router;
