import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const professionalsTable = pgTable("professionals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  crm: text("crm"),
  specialty: text("specialty"),
  email: text("email"),
  phone: text("phone"),
  unit: text("unit"),
  serviceTypes: text("service_types").array().notNull().default(["clinic"]),
  category: text("category").notNull().default("outro"),
  role: text("role").notNull().default("executor"),
  // Marca o medico PRINCIPAL (Dr. Caio). Usado para separar a Entrada 3
  // (exclusiva) da Entrada 4 (assistentes) sem depender do nome. Default false:
  // quem nao for marcado entra como assistente.
  isPrimaryDoctor: boolean("is_primary_doctor").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProfessionalSchema = createInsertSchema(professionalsTable).omit({ id: true, createdAt: true });
export type InsertProfessional = z.infer<typeof insertProfessionalSchema>;
export type Professional = typeof professionalsTable.$inferSelect;
