import { Router, type IRouter } from "express";
import { db, pharmaciesTable, dispatchLogTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { CreatePharmacyBody } from "@workspace/api-zod";
import { ensurePharmacyFolder } from "../lib/google-drive";
import { requireCollaborator } from "./collaborator";
import { authorizedPrescriptionFilter } from "./prescription-delivery";
import { prescriptionsTable } from "@workspace/db";

const router: IRouter = Router();

function formatPharmacy(p: typeof pharmaciesTable.$inferSelect) {
  return {
    ...p,
    cnpj: p.cnpj ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    whatsapp: p.whatsapp ?? null,
    notes: p.notes ?? null,
    controlledTypes: p.controlledTypes ?? [],
    driveFolderId: p.driveFolderId ?? null,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/pharmacies", async (req, res): Promise<void> => {
  // Por padrão retorna apenas farmácias ativas; ?all=true inclui inativadas.
  const includeAll = req.query.all === "true";
  const rows = includeAll
    ? await db.select().from(pharmaciesTable).orderBy(desc(pharmaciesTable.createdAt))
    : await db
        .select()
        .from(pharmaciesTable)
        .where(eq(pharmaciesTable.active, true))
        .orderBy(desc(pharmaciesTable.createdAt));
  res.json(rows.map(formatPharmacy));
});

router.post("/pharmacies", async (req, res): Promise<void> => {
  const parsed = CreatePharmacyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(pharmaciesTable).values(parsed.data).returning();

  // Cria pasta no Drive (best-effort, não bloqueia).
  (async () => {
    try {
      const folderId = await ensurePharmacyFolder(row.name);
      await db.update(pharmaciesTable).set({ driveFolderId: folderId }).where(eq(pharmaciesTable.id, row.id));
    } catch (err) {
      req.log.warn({ err }, "Falha ao criar pasta da farmácia no Drive");
    }
  })();

  res.status(201).json(formatPharmacy(row));
});

router.patch("/pharmacies/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const parsed = CreatePharmacyBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(pharmaciesTable).set(parsed.data).where(eq(pharmaciesTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Farmácia não encontrada" });
    return;
  }
  res.json(formatPharmacy(row));
});

router.delete("/pharmacies/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  // Inativação (soft delete): preserva histórico de receitas/dispatch.
  const [row] = await db
    .update(pharmaciesTable)
    .set({ active: false })
    .where(eq(pharmaciesTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Farmácia não encontrada" });
    return;
  }
  res.status(204).end();
});

router.post("/pharmacies/send-batch", requireCollaborator, async (_req, res): Promise<void> => {
  res.status(410).json({ error: "Lote automático desativado. Confirme a farmácia e o canal em cada prescrição no Cockpit." });
});

router.get("/dispatch/log", requireCollaborator, async (req, res): Promise<void> => {
  const rows = await db.select({ log: dispatchLogTable }).from(dispatchLogTable)
    .innerJoin(prescriptionsTable, and(eq(prescriptionsTable.id, dispatchLogTable.prescriptionId),
      eq(prescriptionsTable.empresaId, dispatchLogTable.empresaId)))
    .where(authorizedPrescriptionFilter(req.collaborator!.professionalId))
    .orderBy(desc(dispatchLogTable.createdAt)).limit(200);
  res.json(rows.map(({ log }) => ({ ...log, createdAt: log.createdAt.toISOString() })));
});

export default router;
