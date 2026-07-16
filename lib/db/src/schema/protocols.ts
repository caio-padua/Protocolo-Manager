import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const protocolsTable = pgTable("protocols", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  professionalId: integer("professional_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("suggested"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  unit: text("unit"),
  serviceType: text("service_type").notNull().default("clinic"),
  totalSessions: integer("total_sessions").notNull().default(0),
  completedSessions: integer("completed_sessions").notNull().default(0),
  totalValue: real("total_value").notNull().default(0),
  notes: text("notes"),
  // Enfermeira designada para o protocolo (FK lógica → professionals).
  // Nulo = protocolo executado só na clínica pelo médico/staff fixo.
  nurseId: integer("nurse_id"),
  // Custo total da enfermagem = nurseId.homeServiceFeePerVisit × totalSessions.
  // Separado do totalValue (resposta A do CEO: somado automaticamente).
  nurseServiceFee: real("nurse_service_fee"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const protocolItemsTable = pgTable("protocol_items", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull(),
  substanceId: integer("substance_id").notNull(),
  dose: text("dose").notNull(),
  unitPrice: real("unit_price").notNull().default(0),
  totalSessions: integer("total_sessions").notNull(),
  completedSessions: integer("completed_sessions").notNull().default(0),
  intervalDays: integer("interval_days").notNull().default(7),
  startDate: text("start_date").notNull(),
  frequency: text("frequency").notNull().default("weekly"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProtocolSchema = createInsertSchema(protocolsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProtocolItemSchema = createInsertSchema(protocolItemsTable).omit({ id: true, createdAt: true });
export type InsertProtocol = z.infer<typeof insertProtocolSchema>;
export type InsertProtocolItem = z.infer<typeof insertProtocolItemSchema>;
export type Protocol = typeof protocolsTable.$inferSelect;
export type ProtocolItem = typeof protocolItemsTable.$inferSelect;
