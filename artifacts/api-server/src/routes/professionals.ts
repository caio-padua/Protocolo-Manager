import { Router, type IRouter } from "express";
import { db, professionalsTable } from "@workspace/db";
import { CreateProfessionalBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatProfessional(p: typeof professionalsTable.$inferSelect) {
  return {
    ...p,
    crm: p.crm ?? null,
    specialty: p.specialty ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    unit: p.unit ?? null,
    serviceTypes: p.serviceTypes ?? ["clinic"],
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/professionals", async (_req, res): Promise<void> => {
  const professionals = await db.select().from(professionalsTable);
  res.json(professionals.map(formatProfessional));
});

router.post("/professionals", async (req, res): Promise<void> => {
  const parsed = CreateProfessionalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [professional] = await db.insert(professionalsTable).values(parsed.data).returning();
  res.status(201).json(formatProfessional(professional));
});

export default router;
