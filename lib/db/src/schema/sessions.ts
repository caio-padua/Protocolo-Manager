import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull(),
  clientId: integer("client_id").notNull(),
  professionalId: integer("professional_id"),
  resourceId: integer("resource_id"),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  status: text("status").notNull().default("scheduled"),
  unit: text("unit"),
  serviceType: text("service_type").notNull().default("clinic"),
  weekNumber: integer("week_number").notNull().default(1),
  notes: text("notes"),
  googleEventId: text("google_event_id"),
  googleCalendarId: text("google_calendar_id"),
  rescheduleCount: integer("reschedule_count").notNull().default(0),
  rescheduledAt: text("rescheduled_at"),
  rescheduledBy: text("rescheduled_by"),
  // Enfermeira que executou/executará esta sessão (FK lógica → professionals).
  // Permite rastrear quem aplicou por sessão (para RAS/FAP e contratos).
  nurseId: integer("nurse_id"),
  // Endereço onde a sessão acontece — preenchido para Home Nurse.
  // Texto livre (label + endereço formatado) para simplicidade de consulta nos PDFs.
  serviceAddress: text("service_address"),
  empresaId: integer("empresa_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const substanceApplicationsTable = pgTable("substance_applications", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  substanceId: integer("substance_id").notNull(),
  dose: text("dose").notNull(),
  sessionNumber: integer("session_number").notNull(),
  totalSessions: integer("total_sessions").notNull(),
  status: text("status").notNull().default("pending"),
  availability: text("availability").notNull().default("disp"),
  appliedAt: text("applied_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true });
export const insertSubstanceApplicationSchema = createInsertSchema(substanceApplicationsTable).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertSubstanceApplication = z.infer<typeof insertSubstanceApplicationSchema>;
export type Session = typeof sessionsTable.$inferSelect;
export type SubstanceApplication = typeof substanceApplicationsTable.$inferSelect;
