import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Encaminhamentos — encaminhamento clínico a outro profissional/especialidade,
// persistente e editável. PDF de marca via Fábrica de Documentos. "cliente".
export const referralsTable = pgTable("referrals", {
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
  especialidadeDestino: text("especialidade_destino").notNull(),
  profissionalDestino: text("profissional_destino"),
  motivo: text("motivo").notNull(),
  resumoClinico: text("resumo_clinico"),
  // eletivo | prioritario | urgente
  urgencia: text("urgencia").notNull().default("eletivo"),
  corpo: text("corpo").notNull(),
  observacao: text("observacao"),
  status: text("status").notNull().default("draft"),
  driveFileId: text("drive_file_id"),
  driveWebViewLink: text("drive_web_view_link"),
  fileName: text("file_name"),
  pdfData: text("pdf_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  emittedAt: timestamp("emitted_at", { withTimezone: true }),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  id: true,
  createdAt: true,
  emittedAt: true,
});

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
