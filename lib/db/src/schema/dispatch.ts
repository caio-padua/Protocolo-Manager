import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dispatchLogTable = pgTable("dispatch_log", {
  id: serial("id").primaryKey(),
  prescriptionId: integer("prescription_id"),
  pharmacyId: integer("pharmacy_id"),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("pending"),
  detail: text("detail"),
  recipeCount: integer("recipe_count").default(0),
  batchDate: text("batch_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Onda 3 — colunas de medição e billing
  empresaId: integer("empresa_id"),
  custoUnitario: numeric("custo_unitario", { precision: 10, scale: 4 }),
  chaveIdempotencia: text("chave_idempotencia"),
});

export const insertDispatchLogSchema = createInsertSchema(dispatchLogTable).omit({ id: true, createdAt: true });
export type InsertDispatchLog = z.infer<typeof insertDispatchLogSchema>;
export type DispatchLog = typeof dispatchLogTable.$inferSelect;
