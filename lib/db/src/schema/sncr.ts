import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sncrRangesTable = pgTable("sncr_ranges", {
  id: serial("id").primaryKey(),
  professionalId: integer("professional_id"),
  professionalName: text("professional_name"),
  uf: text("uf").notNull(),
  controlledType: text("controlled_type").notNull(),
  startNumber: integer("start_number").notNull(),
  endNumber: integer("end_number").notNull(),
  nextNumber: integer("next_number").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sncrLogTable = pgTable("sncr_log", {
  id: serial("id").primaryKey(),
  rangeId: integer("range_id"),
  recipeId: integer("recipe_id"),
  prescriptionId: integer("prescription_id"),
  number: integer("number"),
  professionalId: integer("professional_id"),
  uf: text("uf"),
  controlledType: text("controlled_type"),
  status: text("status").notNull().default("consumed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSncrRangeSchema = createInsertSchema(sncrRangesTable).omit({ id: true, createdAt: true });
export type InsertSncrRange = z.infer<typeof insertSncrRangeSchema>;
export type SncrRange = typeof sncrRangesTable.$inferSelect;
export type SncrLog = typeof sncrLogTable.$inferSelect;
