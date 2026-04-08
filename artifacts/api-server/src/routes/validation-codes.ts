import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, validationCodesTable, sessionsTable, clientsTable } from "@workspace/db";

const router: IRouter = Router();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.post("/validation-codes/generate", async (req, res): Promise<void> => {
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId é obrigatório" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Sessão não encontrada" });
    return;
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const [validationCode] = await db.insert(validationCodesTable).values({
    sessionId,
    clientId: session.clientId,
    code,
    expiresAt,
    used: false,
  }).returning();

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));

  res.status(201).json({
    id: validationCode.id,
    code: validationCode.code,
    expiresAt: validationCode.expiresAt.toISOString(),
    clientName: client?.name ?? "",
    clientEmail: client?.email ?? "",
    clientPhone: client?.phone ?? "",
    sessionId,
    scheduledDate: session.scheduledDate,
    scheduledTime: session.scheduledTime,
  });
});

router.post("/validation-codes/verify", async (req, res): Promise<void> => {
  const { sessionId, code } = req.body;
  if (!sessionId || !code) {
    res.status(400).json({ error: "sessionId e code são obrigatórios" });
    return;
  }

  const now = new Date();
  const codes = await db.select().from(validationCodesTable)
    .where(and(
      eq(validationCodesTable.sessionId, sessionId),
      eq(validationCodesTable.code, code.toUpperCase()),
      eq(validationCodesTable.used, false),
      gt(validationCodesTable.expiresAt, now),
    ));

  if (codes.length === 0) {
    res.status(401).json({ valid: false, error: "Código inválido ou expirado" });
    return;
  }

  await db.update(validationCodesTable)
    .set({ used: true, usedAt: now })
    .where(eq(validationCodesTable.id, codes[0].id));

  res.json({ valid: true, sessionId, clientId: codes[0].clientId, validatedAt: now.toISOString() });
});

router.get("/validation-codes/session/:sessionId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "sessionId inválido" });
    return;
  }

  const codes = await db.select().from(validationCodesTable)
    .where(eq(validationCodesTable.sessionId, sessionId));

  res.json(codes.map(c => ({
    id: c.id,
    code: c.code,
    expiresAt: c.expiresAt.toISOString(),
    used: c.used,
    usedAt: c.usedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  })));
});

export default router;
