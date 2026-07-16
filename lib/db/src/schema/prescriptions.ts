import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prescriptionsTable = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  clientName: text("client_name").notNull(),
  clientCpf: text("client_cpf"),
  clientPhone: text("client_phone"),
  clientEmail: text("client_email"),
  professionalId: integer("professional_id"),
  professionalName: text("professional_name"),
  professionalCrm: text("professional_crm"),
  professionalUf: text("professional_uf"),
  durationDays: text("duration_days"),
  cid: text("cid"),
  message: text("message"),
  status: text("status").notNull().default("draft"),
  empresaId: integer("empresa_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  emittedAt: timestamp("emitted_at", { withTimezone: true }),
});

export const prescriptionItemsTable = pgTable("prescription_items", {
  id: serial("id").primaryKey(),
  prescriptionId: integer("prescription_id").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  name: text("name").notNull(),
  ativos: text("ativos"),
  posologia: text("posologia"),
  dose: text("dose"),
  via: text("via"),
  frequencia: text("frequencia"),
  periodo: text("periodo"),
  observacao: text("observacao"),
  category: text("category"),
  internalColor: text("internal_color"),
  isControlled: boolean("is_controlled").notNull().default(false),
  anvisaType: text("anvisa_type"),
  pharmacyId: integer("pharmacy_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  prescriptionId: integer("prescription_id").notNull(),
  pharmacyId: integer("pharmacy_id"),
  recipeType: text("recipe_type").notNull(),
  anvisaType: text("anvisa_type"),
  anvisaColor: text("anvisa_color"),
  anvisaColorName: text("anvisa_color_name"),
  sncrNumber: text("sncr_number"),
  sncrRangeId: integer("sncr_range_id"),
  sncrStatus: text("sncr_status"),
  title: text("title"),
  itemsJson: jsonb("items_json"),
  driveFileId: text("drive_file_id"),
  driveWebViewLink: text("drive_web_view_link"),
  fileName: text("file_name"),
  pdfData: text("pdf_data"),
  batchDate: text("batch_date"),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  status: text("status").notNull().default("generated"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPrescriptionSchema = createInsertSchema(prescriptionsTable).omit({ id: true, createdAt: true, emittedAt: true });
export const insertPrescriptionItemSchema = createInsertSchema(prescriptionItemsTable).omit({ id: true, createdAt: true });
export const insertRecipeSchema = createInsertSchema(recipesTable).omit({ id: true, createdAt: true });

export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type Prescription = typeof prescriptionsTable.$inferSelect;
export type PrescriptionItem = typeof prescriptionItemsTable.$inferSelect;
export type Recipe = typeof recipesTable.$inferSelect;
