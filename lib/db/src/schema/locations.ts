import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  type: text("type").notNull().default("clinic"),
  googleCalendarId: text("google_calendar_id"),
  color: text("color").notNull().default("#3B82F6"),
  active: text("active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locationProfessionalsTable = pgTable("location_professionals", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull(),
  professionalId: integer("professional_id").notNull(),
  role: text("role").notNull().default("executor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locationsTable).omit({ id: true, createdAt: true });
export const insertLocationProfessionalSchema = createInsertSchema(locationProfessionalsTable).omit({ id: true, createdAt: true });
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;
export type LocationProfessional = typeof locationProfessionalsTable.$inferSelect;
