import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agendaResourcesTable = pgTable("agenda_resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("enfermagem"),
  modality: text("modality").notNull().default("local"),
  color: text("color").notNull().default("#3D7A7A"),
  slotMinutes: integer("slot_minutes").notNull().default(30),
  professionalId: integer("professional_id"),
  locationId: integer("location_id"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agendaWindowsTable = pgTable("agenda_windows", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id").notNull(),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agendaExceptionsTable = pgTable("agenda_exceptions", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id"),
  date: text("date").notNull(),
  kind: text("kind").notNull().default("feriado"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agendaSettingsTable = pgTable("agenda_settings", {
  id: serial("id").primaryKey(),
  blockMinutes: integer("block_minutes").notNull().default(120),
  triggerPercent: integer("trigger_percent").notNull().default(60),
  minLeadHours: integer("min_lead_hours").notNull().default(24),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgendaResourceSchema = createInsertSchema(agendaResourcesTable).omit({ id: true, createdAt: true });
export const insertAgendaWindowSchema = createInsertSchema(agendaWindowsTable).omit({ id: true, createdAt: true });
export const insertAgendaExceptionSchema = createInsertSchema(agendaExceptionsTable).omit({ id: true, createdAt: true });
export const insertAgendaSettingsSchema = createInsertSchema(agendaSettingsTable).omit({ id: true, updatedAt: true });

export type InsertAgendaResource = z.infer<typeof insertAgendaResourceSchema>;
export type InsertAgendaWindow = z.infer<typeof insertAgendaWindowSchema>;
export type InsertAgendaException = z.infer<typeof insertAgendaExceptionSchema>;
export type InsertAgendaSettings = z.infer<typeof insertAgendaSettingsSchema>;
export type AgendaResource = typeof agendaResourcesTable.$inferSelect;
export type AgendaWindow = typeof agendaWindowsTable.$inferSelect;
export type AgendaException = typeof agendaExceptionsTable.$inferSelect;
export type AgendaSettings = typeof agendaSettingsTable.$inferSelect;
