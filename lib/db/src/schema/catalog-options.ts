import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Opcoes gerenciaveis de listas (Cadastros). Ex.: kind="substance_category"
// para as categorias e kind="substance_type" para os tipos exibidos.
// O valor gravado na substancia e o proprio "label" (texto livre hoje).
export const catalogOptionsTable = pgTable("catalog_options", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCatalogOptionSchema = createInsertSchema(catalogOptionsTable).omit({ id: true, createdAt: true });
export type InsertCatalogOption = z.infer<typeof insertCatalogOptionSchema>;
export type CatalogOption = typeof catalogOptionsTable.$inferSelect;
