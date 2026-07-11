import { Router, type IRouter } from "express";
import { db, catalogoCid10Table } from "@workspace/db";
import { ilike, or, asc } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/cid10?q= — busca no catalogo CID-10 (codigo ou descricao oficial).
router.get("/cid10", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const base = db
    .select({
      id: catalogoCid10Table.id,
      codigo: catalogoCid10Table.codigo,
      descricao: catalogoCid10Table.descricaoOficial,
      capitulo: catalogoCid10Table.capitulo,
    })
    .from(catalogoCid10Table);
  const rows = q
    ? await base
        .where(
          or(
            ilike(catalogoCid10Table.codigo, `%${q}%`),
            ilike(catalogoCid10Table.descricaoOficial, `%${q}%`),
          ),
        )
        .orderBy(asc(catalogoCid10Table.codigo))
        .limit(20)
    : await base.orderBy(asc(catalogoCid10Table.codigo)).limit(20);
  res.json(rows);
});

export default router;
