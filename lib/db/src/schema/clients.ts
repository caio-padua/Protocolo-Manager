import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cpf: text("cpf").notNull().unique(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
