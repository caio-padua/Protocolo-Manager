import { pgTable, text, serial, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cpf: text("cpf"),
  email: text("email"),
  phone: text("phone"),
  birthDate: text("birth_date"),
  address: text("address"),
  pais: text("pais").default("BRASIL"),
  instagram: text("instagram"),
  comoConheceu: text("como_conheceu"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  validationPassword: text("validation_password"),
  examRequestsFolderId: text("exam_requests_folder_id"),
  driveFolderId: text("drive_folder_id"),
  codigoSemantico: text("codigo_semantico"),
  fichaClinica: jsonb("ficha_clinica").default({}),
  needsReview: boolean("needs_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
