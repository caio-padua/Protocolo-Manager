import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, professionalsTable } from "@workspace/db";
import { normalizeMatriz, podeUsar, type Matriz } from "@workspace/governanca";
import { requireCollaborator } from "../routes/collaborator";
import { getJsonSetting } from "./secure-settings";

// Somente as ações do console de curadoria. As rotas de laudos e resultados
// têm outros consumidores e contratos de permissão.
export function isCurationMutation(method: string, path: string): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return false;
  if ([
    "/exames-lab/faixas",
    "/exames-lab/catalogo-faixas",
    "/exames-lab/catalogo-faixas/aliases",
    "/exames-lab/catalogo-faixas/unidades",
    "/exames-lab/catalogo/renomear",
    "/exames-lab/triagem/backfill",
    "/exames-lab/triagem/curadoria",
    "/exames-lab/exames/englobar",
    "/exames-lab/exames/transferir",
  ].includes(path)) return true;
  return /^\/exames-lab\/exames\/[^/]+\/(ignorar|restaurar)$/.test(path)
    || /^\/exames-lab\/triagem\/[^/]+\/resolver$/.test(path)
    || /^\/exames-lab\/reassignments\/[^/]+\/desfazer$/.test(path);
}

/** Autenticação é revalidada no servidor; a matriz é consultada a cada escrita. */
export function protectCurationMutation(req: Request, res: Response, next: NextFunction): void {
  if (!isCurationMutation(req.method, req.path)) {
    next();
    return;
  }
  requireCollaborator(req, res, () => {
    void (async () => {
      const professionalId = req.collaborator?.professionalId;
      if (!professionalId) return res.status(401).json({ error: "Sessão de colaborador necessária." });
      const [actor] = await db.select({
        active: professionalsTable.active,
        owner: professionalsTable.isPlatformOwner,
        category: professionalsTable.category,
      }).from(professionalsTable).where(eq(professionalsTable.id, professionalId)).limit(1);
      if (!actor?.active) return res.status(403).json({ error: "Profissional sem acesso à curadoria." });
      if (actor.owner) return next();
      const settings = await getJsonSetting<Matriz>("governanca.matriz");
      if (!settings || !podeUsar(normalizeMatriz(settings), "exames_faixas", actor.category ?? "")) {
        return res.status(403).json({ error: "Sem permissão para editar a curadoria de exames." });
      }
      return next();
    })().catch(next);
  });
}
