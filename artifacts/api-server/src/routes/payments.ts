import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, clientsTable } from "@workspace/db";
import {
  ListPaymentsQueryParams,
  CreatePaymentBody,
  UpdatePaymentParams,
  UpdatePaymentBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function formatPayment(payment: typeof paymentsTable.$inferSelect) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, payment.clientId));
  return {
    id: payment.id,
    clientId: payment.clientId,
    clientName: client?.name ?? "",
    protocolId: payment.protocolId ?? null,
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    dueDate: payment.dueDate ?? null,
    paidAt: payment.paidAt ?? null,
    description: payment.description ?? null,
    installments: payment.installments ?? null,
    cardLabel: payment.cardLabel ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

router.get("/payments", async (req, res): Promise<void> => {
  const query = ListPaymentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let payments = await db.select().from(paymentsTable);
  if (query.data.clientId) payments = payments.filter(p => p.clientId === query.data.clientId);
  if (query.data.status) payments = payments.filter(p => p.status === query.data.status);

  const results = await Promise.all(payments.map(formatPayment));
  res.json(results);
});

router.post("/payments", async (req, res): Promise<void> => {
  const body = req.body;
  const validMethods = ["pix", "credit", "debit", "boleto", "cash"];
  const validStatuses = ["pending", "paid", "overdue", "cancelled"];

  if (!body.clientId || typeof body.amount !== "number" || body.amount <= 0 || !body.method) {
    res.status(400).json({ error: "clientId (int), amount (positive number) and method are required" });
    return;
  }

  if (!validMethods.includes(body.method)) {
    res.status(400).json({ error: `method must be one of: ${validMethods.join(", ")}` });
    return;
  }

  if (body.status && !validStatuses.includes(body.status)) {
    res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  const installments = body.method === "credit" && body.installments ? Math.max(1, Math.min(12, parseInt(body.installments))) : null;

  const [payment] = await db.insert(paymentsTable).values({
    clientId: body.clientId,
    protocolId: body.protocolId || null,
    amount: body.amount,
    method: body.method,
    status: body.status || "pending",
    dueDate: body.dueDate || null,
    paidAt: body.paidAt || null,
    description: body.description || null,
    installments,
    cardLabel: body.method === "credit" ? (body.cardLabel || null) : null,
  }).returning();
  res.status(201).json(await formatPayment(payment));
});

router.put("/payments/:id", async (req, res): Promise<void> => {
  const params = UpdatePaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [payment] = await db.update(paymentsTable).set(parsed.data).where(eq(paymentsTable.id, params.data.id)).returning();
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  res.json(await formatPayment(payment));
});

export default router;
