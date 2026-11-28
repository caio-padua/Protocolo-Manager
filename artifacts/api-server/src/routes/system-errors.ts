import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireCollaborator } from "./collaborator";
import { requirePlatformOwner } from "../middleware/tenantContext";

// Central de Erros: so o dono da plataforma (CEO) le.
const router = Router();

router.get("/system-errors", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const r = await db.execute(sql`
    SELECT e.id, e.created_at, e.method, e.path, e.status, e.message, e.code, p.name AS professional_name
    FROM system_error_log e
    LEFT JOIN professionals p ON p.id = e.professional_id
    ORDER BY e.id DESC LIMIT ${limit}`);
  const resumo = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS ultima_hora,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS ultimas_24h
    FROM system_error_log`);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    resumo: resumo.rows[0] ?? { ultima_hora: 0, ultimas_24h: 0 },
    erros: (r.rows as Array<Record<string, unknown>>).map((x) => ({
      id: String(x.id),
      quando: x.created_at,
      metodo: x.method,
      rota: x.path,
      status: x.status,
      mensagem: x.message,
      codigo: x.code,
      profissional: x.professional_name ?? null,
    })),
  });
});

export default router;
