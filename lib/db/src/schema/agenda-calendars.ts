import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Registro NATIVO das agendas (calendários Google) geridas pelo sistema.
// Espelho do que existe na conta clinica.padua.agenda@gmail.com.
export const agendaCalendarsTable = pgTable("agenda_calendars", {
  id: serial("id").primaryKey(),
  googleCalendarId: text("google_calendar_id").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("outro"), // geral | medico | enfermagem | outro
  locationId: integer("location_id"),
  managedBySystem: boolean("managed_by_system").notNull().default(true),
  color: text("color").notNull().default("#3D7A7A"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgendaCalendarSchema = createInsertSchema(agendaCalendarsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgendaCalendar = z.infer<typeof insertAgendaCalendarSchema>;
export type AgendaCalendar = typeof agendaCalendarsTable.$inferSelect;
