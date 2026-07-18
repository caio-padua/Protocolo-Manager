import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createPortalToken } from "../lib/portal-token";

const router: IRouter = Router();

const ParamsSchema = z.object({ clientId: z.coerce.number().int().positive() });

router.post("/admin/preview-client/:clientId", async (req: Request, res: Response): Promise<void> => {
  const parsed = ParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }

  const [client] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, cpf: clientsTable.cpf })
    .from(clientsTable)
    .where(eq(clientsTable.id, parsed.data.clientId));

  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const token = createPortalToken(client.id);
  res.json({ id: client.id, name: client.name, cpf: client.cpf ?? null, token });
});

export default router;
