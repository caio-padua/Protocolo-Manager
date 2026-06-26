import { pgTable, text, serial, timestamp, integer, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    protocolId: integer("protocol_id"),
    amount: real("amount").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("pending"),
    dueDate: text("due_date"),
    paidAt: text("paid_at"),
    description: text("description"),
    installments: integer("installments"),
    cardLabel: text("card_label"),
    provider: text("provider"),
    asaasChargeId: text("asaas_charge_id"),
    asaasInvoiceUrl: text("asaas_invoice_url"),
    pixQrCode: text("pix_qr_code"),
    pixCopyPaste: text("pix_copy_paste"),
    boletoUrl: text("boleto_url"),
    billingType: text("billing_type"),
    stripeChargeId: text("stripe_charge_id"),
    stripeCheckoutUrl: text("stripe_checkout_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // NULL nao colide em UNIQUE no Postgres: protege so cobrancas Asaas contra
    // linha duplicada em retry/concorrencia; pagamentos manuais (NULL) ficam livres.
    uniqueIndex("payments_asaas_charge_id_uq").on(table.asaasChargeId),
  ],
);

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
