import { pgTable, text, serial, timestamp, integer, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rasEvolutivoTable = pgTable("ras_evolutivo", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  protocolId: integer("protocol_id").notNull(),
  clientId: integer("client_id").notNull(),
  nursingAssessmentId: integer("nursing_assessment_id"),
  sessionNumber: integer("session_number").notNull(),
  totalSessions: integer("total_sessions").notNull(),
  progressPercent: real("progress_percent").notNull().default(0),
  nextSessionDate: text("next_session_date"),
  designatedDoctorId: integer("designated_doctor_id"),
  designatedDoctorName: text("designated_doctor_name"),
  substances: jsonb("substances").notNull().default([]),
  alertColor: text("alert_color").notNull().default("green"),
  adherenceLevel: text("adherence_level"),
  tolerance: text("tolerance"),
  weeklyObservation: text("weekly_observation"),
  sessionHistory: jsonb("session_history").notNull().default([]),
  isAntepenultimate: text("is_antepenultimate").notNull().default("false"),
  isUltimate: text("is_ultimate").notNull().default("false"),
  examReminderSent: text("exam_reminder_sent").notNull().default("false"),
  consultationReminder: text("consultation_reminder"),
  validationCode: text("validation_code"),
  validatedByClient: text("validated_by_client").notNull().default("false"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  pdfUrl: text("pdf_url"),
  drivePdfId: text("drive_pdf_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRasEvolutivoSchema = createInsertSchema(rasEvolutivoTable).omit({ id: true, createdAt: true });
export type InsertRasEvolutivo = z.infer<typeof insertRasEvolutivoSchema>;
export type RasEvolutivo = typeof rasEvolutivoTable.$inferSelect;
