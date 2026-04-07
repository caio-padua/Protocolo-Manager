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
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [payment] = await db.insert(paymentsTable).values(parsed.data).returning();
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
