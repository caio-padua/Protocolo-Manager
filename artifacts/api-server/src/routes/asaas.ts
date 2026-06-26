import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, clientsTable } from "@workspace/db";
import { asaasCreateCustomer, asaasCreateCharge } from "../lib/asaas";

const router: IRouter = Router();

// Garante o Customer no Asaas a partir do cliente do Manager (idempotente).
async function ensureCustomer(client: typeof clientsTable.$inferSelect): Promise<string> {
  if (client.asaasCustomerId) return client.asaasCustomerId;
  if (!client.cpf) {
    throw new Error("Cliente sem CPF — o Asaas exige CPF para cobrar.");
  }
  const customer = await asaasCreateCustomer({
    name: client.name,
    cpfCnpj: client.cpf,
    email: client.email,
    phone: client.phone,
  });
  await db
    .update(clientsTable)
    .set({ asaasCustomerId: customer.id })
    .where(eq(clientsTable.id, client.id));
  return customer.id;
}

// Cria uma cobranca avulsa (pagina hospedada "clica e paga") e salva no payments.
router.post("/asaas/charge", async (req, res): Promise<void> => {
  try {
    const { clientId, amount, description, dueDate } = req.body || {};
    if (!clientId || typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "clientId e amount (numero positivo) sao obrigatorios." });
      return;
    }
    if (amount < 5) {
      res.status(400).json({ error: "A pagina com todas as formas de pagamento exige no minimo R$ 5,00." });
      return;
    }
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Cliente nao encontrado." });
      return;
    }

    const customerId = await ensureCustomer(client);
    const due = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
      ? dueDate
      : new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const charge = await asaasCreateCharge({
      customerId,
      value: amount,
      dueDate: due,
      description: description || `Cobranca ${client.name}`,
    });

    let payment;
    try {
      [payment] = await db
        .insert(paymentsTable)
        .values({
          clientId,
          amount,
          method: "asaas",
          status: "pending",
          provider: "asaas",
          dueDate: due,
          description: description || null,
          asaasChargeId: charge.id,
          asaasInvoiceUrl: charge.invoiceUrl,
          billingType: charge.billingType,
        })
        .returning();
    } catch {
      // Cobranca existe no Asaas mas falhou ao salvar: logar o id para conciliacao manual.
      req.log.error({ chargeId: charge.id }, "Cobranca Asaas criada mas falhou ao salvar no banco");
      res.status(500).json({
        error: `Cobranca criada no Asaas mas falha ao salvar. Id para conciliacao: ${charge.id}`,
      });
      return;
    }

    res.status(201).json({
      id: payment.id,
      asaasChargeId: charge.id,
      invoiceUrl: charge.invoiceUrl,
      status: payment.status,
      amount,
    });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao criar cobranca Asaas");
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao falar com o Asaas." });
  }
});

// Webhook do Asaas: confirma pagamento sozinho. Valida o token; idempotente.
router.post("/asaas/webhook", async (req, res): Promise<void> => {
  const token = req.header("asaas-access-token");
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || token !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const event: string | undefined = req.body?.event;
  const payment = req.body?.payment;
  if (!event || !payment?.id) {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    const [row] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.asaasChargeId, payment.id));
    if (!row) {
      // Cobranca desconhecida: nao derruba a rota (Asaas pode reenviar).
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      await db
        .update(paymentsTable)
        .set({ status: "paid", paidAt: payment.paymentDate || new Date().toISOString().slice(0, 10) })
        .where(eq(paymentsTable.id, row.id));
    } else if (event === "PAYMENT_OVERDUE") {
      await db.update(paymentsTable).set({ status: "overdue" }).where(eq(paymentsTable.id, row.id));
    } else if (
      event === "PAYMENT_DELETED" ||
      event === "PAYMENT_REFUNDED" ||
      event === "PAYMENT_CHARGEBACK_REQUESTED"
    ) {
      await db.update(paymentsTable).set({ status: "cancelled" }).where(eq(paymentsTable.id, row.id));
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    // Erro real: devolve 500 para o Asaas reenviar (idempotente).
    req.log.error({ err: String(err) }, "Erro no webhook Asaas");
    res.status(500).json({ error: "erro ao processar webhook" });
  }
});

export default router;
