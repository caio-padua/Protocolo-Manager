import { Router, type IRouter } from "express";
import { db, catalogOptionsTable } from "@workspace/db";
import { eq, and, asc, ne, sql } from "drizzle-orm";
import { CreateCatalogOptionBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Verifica se ja existe opcao com mesmo kind + label (comparacao
// insensivel a maiusculas/minusculas e a espacos nas pontas), opcionalmente
// ignorando um id (usado no PATCH). Evita duplicatas que a UI nao cobre.
async function labelEmUso(kind: string, label: string, ignoreId?: number): Promise<boolean> {
  const conds = [
    eq(catalogOptionsTable.kind, kind),
    sql`lower(${catalogOptionsTable.label}) = lower(${label})`,
  ];
  if (ignoreId !== undefined) conds.push(ne(catalogOptionsTable.id, ignoreId));
  const [hit] = await db
    .select({ id: catalogOptionsTable.id })
    .from(catalogOptionsTable)
    .where(and(...conds))
    .limit(1);
  return Boolean(hit);
}

function formatOption(o: typeof catalogOptionsTable.$inferSelect) {
  return {
    ...o,
    color: o.color ?? null,
    createdAt: o.createdAt.toISOString(),
  };
}

router.get("/catalog-options", async (req, res): Promise<void> => {
  const kind = typeof req.query.kind === "string" && req.query.kind ? req.query.kind : undefined;
  const includeAll = req.query.all === "true";
  const conds = [];
  if (kind) conds.push(eq(catalogOptionsTable.kind, kind));
  if (!includeAll) conds.push(eq(catalogOptionsTable.active, true));
  const order = [asc(catalogOptionsTable.sortOrder), asc(catalogOptionsTable.label)] as const;
  const rows = conds.length
    ? await db.select().from(catalogOptionsTable).where(and(...conds)).orderBy(...order)
    : await db.select().from(catalogOptionsTable).orderBy(...order);
  res.json(rows.map(formatOption));
});

router.post("/catalog-options", async (req, res): Promise<void> => {
  const parsed = CreateCatalogOptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const kind = parsed.data.kind.trim();
  const label = parsed.data.label.trim();
  if (!kind || !label) {
    res.status(400).json({ error: "kind e label são obrigatórios e não podem ser vazios" });
    return;
  }
  if (await labelEmUso(kind, label)) {
    res.status(409).json({ error: "Já existe uma opção com esse nome nesta lista" });
    return;
  }
  const [row] = await db
    .insert(catalogOptionsTable)
    .values({ ...parsed.data, kind, label })
    .returning();
  res.status(201).json(formatOption(row));
});

router.patch("/catalog-options/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const parsed = CreateCatalogOptionBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const patch = { ...parsed.data };
  if (patch.kind !== undefined) patch.kind = patch.kind.trim();
  if (patch.label !== undefined) patch.label = patch.label.trim();
  if (patch.label !== undefined && !patch.label) {
    res.status(400).json({ error: "label não pode ser vazio" });
    return;
  }
  if (patch.label !== undefined) {
    // Para checar duplicidade precisamos do kind: usa o novo, senao o atual.
    let kindRef = patch.kind;
    if (kindRef === undefined) {
      const [cur] = await db
        .select({ kind: catalogOptionsTable.kind })
        .from(catalogOptionsTable)
        .where(eq(catalogOptionsTable.id, id))
        .limit(1);
      if (!cur) {
        res.status(404).json({ error: "Opção não encontrada" });
        return;
      }
      kindRef = cur.kind;
    }
    if (await labelEmUso(kindRef, patch.label, id)) {
      res.status(409).json({ error: "Já existe uma opção com esse nome nesta lista" });
      return;
    }
  }
  const [row] = await db
    .update(catalogOptionsTable)
    .set(patch)
    .where(eq(catalogOptionsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Opção não encontrada" });
    return;
  }
  res.json(formatOption(row));
});

router.delete("/catalog-options/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  // Soft delete: preserva histórico e permite reativar.
  const [row] = await db
    .update(catalogOptionsTable)
    .set({ active: false })
    .where(eq(catalogOptionsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Opção não encontrada" });
    return;
  }
  res.status(204).end();
});

export default router;
