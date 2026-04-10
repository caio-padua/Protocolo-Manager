import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, taskCardsTable, clientsTable, professionalsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/task-cards", async (req, res): Promise<void> => {
  const { assignedRole, status, type, clientId } = req.query as Record<string, string>;

  let cards = await db.select().from(taskCardsTable);

  if (assignedRole) cards = cards.filter(c => c.assignedRole === assignedRole);
  if (status) cards = cards.filter(c => c.status === status);
  if (type) cards = cards.filter(c => c.type === type);
  if (clientId) cards = cards.filter(c => c.clientId === parseInt(clientId));

  cards.sort((a, b) => {
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
    return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
  });

  const results = await Promise.all(cards.map(async (c) => {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, c.clientId));
    return {
      ...c,
      clientName: client?.name ?? null,
      createdAt: c.createdAt.toISOString(),
      completedAt: c.completedAt?.toISOString() ?? null,
    };
  }));

  res.json(results);
});

router.put("/task-cards/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, completedBy } = req.body;

  const updateData: any = {};
  if (status) updateData.status = status;
  if (status === "done") {
    updateData.completedAt = new Date();
    if (completedBy) updateData.completedBy = completedBy;
  }

  const [card] = await db.update(taskCardsTable).set(updateData).where(eq(taskCardsTable.id, id)).returning();
  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  res.json({ ...card, createdAt: card.createdAt.toISOString(), completedAt: card.completedAt?.toISOString() ?? null });
});

router.get("/task-cards/summary", async (req, res): Promise<void> => {
  const cards = await db.select().from(taskCardsTable);
  const pending = cards.filter(c => c.status === "pending");

  const byRole: Record<string, number> = {};
  for (const c of pending) {
    byRole[c.assignedRole] = (byRole[c.assignedRole] ?? 0) + 1;
  }

  const urgent = pending.filter(c => c.priority === "urgent").length;
  const high = pending.filter(c => c.priority === "high").length;

  res.json({ total: pending.length, urgent, high, byRole });
});

export default router;
