import { pgTable, text, serial, timestamp, integer, boolean, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nursingAssessmentsTable = pgTable("nursing_assessments", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  clientId: integer("client_id").notNull(),
  protocolId: integer("protocol_id").notNull(),
  professionalId: integer("professional_id").notNull(),
  weeklyQuestion: text("weekly_question").notNull(),
  alertColor: text("alert_color").notNull().default("green"),
  observation: text("observation"),
  adherenceLevel: text("adherence_level").notNull().default("alta"),
  tolerance: text("tolerance").notNull().default("excelente"),
  symptoms: text("symptoms"),
  needsTeamContact: boolean("needs_team_contact").notNull().default(false),
  startTime: text("start_time"),
  endTime: text("end_time"),
  weight: real("weight"),
  height: real("height"),
  bodyFatPercent: real("body_fat_percent"),
  fatMass: real("fat_mass"),
  muscleMass: real("muscle_mass"),
  skinfolds: jsonb("skinfolds"),
  circumferences: jsonb("circumferences"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNursingAssessmentSchema = createInsertSchema(nursingAssessmentsTable).omit({ id: true, createdAt: true });
export type InsertNursingAssessment = z.infer<typeof insertNursingAssessmentSchema>;
export type NursingAssessment = typeof nursingAssessmentsTable.$inferSelect;
