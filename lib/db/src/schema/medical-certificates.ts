import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Atestados — atestado médico real, persistente e editável. PDF de marca via
// Fábrica de Documentos (documentos/padrao.ts). Vocabulário: "cliente".
export const medicalCertificatesTable = pgTable("medical_certificates", {
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
  // comparecimento | afastamento | acompanhante | aptidao
  tipo: text("tipo").notNull().default("comparecimento"),
  dias: integer("dias"),
  dataInicio: text("data_inicio"),
  cid: text("cid"),
  finalidade: text("finalidade"),
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

export const insertMedicalCertificateSchema = createInsertSchema(medicalCertificatesTable).omit({
  id: true,
  createdAt: true,
  emittedAt: true,
});

export type InsertMedicalCertificate = z.infer<typeof insertMedicalCertificateSchema>;
export type MedicalCertificate = typeof medicalCertificatesTable.$inferSelect;
