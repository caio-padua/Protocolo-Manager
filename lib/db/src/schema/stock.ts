import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stockItemsTable = pgTable("stock_items", {
  id: serial("id").primaryKey(),
  substanceId: integer("substance_id").notNull(),
  quantity: real("quantity").notNull().default(0),
  unit: text("unit").notNull(),
  minimumStock: real("minimum_stock").notNull().default(0),
  lot: text("lot"),
  expirationDate: text("expiration_date"),
  supplier: text("supplier"),
  unitCost: real("unit_cost"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStockItemSchema = createInsertSchema(stockItemsTable).omit({ id: true, updatedAt: true });
export type InsertStockItem = z.infer<typeof insertStockItemSchema>;
export type StockItem = typeof stockItemsTable.$inferSelect;
