import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rasTable = pgTable("ras", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  protocolId: integer("protocol_id").notNull(),
  clientId: integer("client_id").notNull(),
  clientName: text("client_name").notNull(),
  clientCpf: text("client_cpf").notNull(),
  professionalName: text("professional_name").notNull(),
  professionalCrm: text("professional_crm"),
  unit: text("unit").notNull(),
  serviceDate: text("service_date").notNull(),
  serviceType: text("service_type").notNull(),
  substances: jsonb("substances").notNull().default([]),
  observations: text("observations"),
  patientSignature: boolean("patient_signature").notNull().default(false),
  professionalSignature: boolean("professional_signature").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRASSchema = createInsertSchema(rasTable).omit({ id: true, createdAt: true });
export type InsertRAS = z.infer<typeof insertRASSchema>;
export type RAS = typeof rasTable.$inferSelect;
