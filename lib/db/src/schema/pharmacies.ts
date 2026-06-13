import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pharmaciesTable = pgTable("pharmacies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("farma.manip"),
  cnpj: text("cnpj"),
  phone: text("phone"),
  email: text("email"),
  whatsapp: text("whatsapp"),
  notes: text("notes"),
  controlledTypes: text("controlled_types").array().notNull().default([]),
  driveFolderId: text("drive_folder_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPharmacySchema = createInsertSchema(pharmaciesTable).omit({ id: true, createdAt: true });
export type InsertPharmacy = z.infer<typeof insertPharmacySchema>;
export type Pharmacy = typeof pharmaciesTable.$inferSelect;
