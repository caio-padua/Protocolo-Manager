import { pgTable, text, serial, timestamp, integer, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const substancesTable = pgTable("substances", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  color: text("color").notNull(),
  defaultDose: text("default_dose"),
  unit: text("unit"),
  maxSessionsPerWeek: integer("max_sessions_per_week"),
  intervalDays: integer("interval_days"),
  notes: text("notes"),
  stockQuantity: real("stock_quantity").notNull().default(0),
  stockUnit: text("stock_unit"),
  procedureType: text("procedure_type").notNull().default("iv"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  description: text("description"),
  mainFunction: text("main_function"),
  perceivedEffects: text("perceived_effects"),
  timeToEffect: text("time_to_effect"),
  starRating: integer("star_rating").notNull().default(5),
  bodySystemEffects: jsonb("body_system_effects").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubstanceSchema = createInsertSchema(substancesTable).omit({ id: true, createdAt: true });
export type InsertSubstance = z.infer<typeof insertSubstanceSchema>;
export type Substance = typeof substancesTable.$inferSelect;
