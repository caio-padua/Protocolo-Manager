import { Router, type IRouter } from "express";
import { db, siteContentTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { CreateSiteContentBody, UpdateSiteContentBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatItem(o: typeof siteContentTable.$inferSelect) {
  return {
    ...o,
    body: o.body ?? null,
    mediaUrl: o.mediaUrl ?? null,
    updatedAt: o.updatedAt.toISOString(),
  };
}

// Lista o conteudo editavel, opcionalmente filtrado por category.
router.get("/site-content", async (req, res): Promise<void> => {
  const category =
    typeof req.query.category === "string" && req.query.category ? req.query.category : undefined;
  const order = [asc(siteContentTable.sortOrder), asc(siteContentTable.title)] as const;
  const rows = category
    ? await db
        .select()
        .from(siteContentTable)
        .where(eq(siteContentTable.category, category))
        .orderBy(...order)
    : await db.select().from(siteContentTable).orderBy(...order);
  res.json(rows.map(formatItem));
});

// Cria um novo item de conteudo (chave estavel obrigatoria).
router.post("/site-content", async (req, res): Promise<void> => {
  const parsed = CreateSiteContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const contentKey = parsed.data.contentKey.trim();
  const category = parsed.data.category.trim();
  const title = parsed.data.title.trim();
  if (!contentKey || !category || !title) {
    res.status(400).json({ error: "contentKey, category e title são obrigatórios" });
    return;
  }
  const [exists] = await db
    .select({ id: siteContentTable.id })
    .from(siteContentTable)
    .where(sql`lower(${siteContentTable.contentKey}) = lower(${contentKey})`)
    .limit(1);
  if (exists) {
    res.status(409).json({ error: "Já existe um conteúdo com essa chave" });
    return;
  }
  // Edge case da spec: botão nunca pode ficar sem rótulo.
  if (category === "button_phrase" && !(parsed.data.body ?? "").trim()) {
    res.status(400).json({ error: "O texto do botão não pode ficar vazio" });
    return;
  }
  const [row] = await db
    .insert(siteContentTable)
    .values({ ...parsed.data, contentKey, category, title })
    .returning();
  res.status(201).json(formatItem(row));
});

// Atualiza titulo/corpo/video/ordem de um item existente.
router.patch("/site-content/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const parsed = UpdateSiteContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [target] = await db
    .select({ category: siteContentTable.category })
    .from(siteContentTable)
    .where(eq(siteContentTable.id, id))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Conteúdo não encontrado" });
    return;
  }
  // Edge case da spec: botão nunca pode ficar sem rótulo.
  if (
    target.category === "button_phrase" &&
    parsed.data.body !== undefined &&
    !(parsed.data.body ?? "").trim()
  ) {
    res.status(400).json({ error: "O texto do botão não pode ficar vazio" });
    return;
  }
  const patch = { ...parsed.data, updatedAt: new Date() };
  const [row] = await db
    .update(siteContentTable)
    .set(patch)
    .where(eq(siteContentTable.id, id))
    .returning();
  res.json(formatItem(row));
});

export default router;
