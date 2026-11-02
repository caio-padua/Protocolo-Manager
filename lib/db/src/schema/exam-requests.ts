import { index, pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// PDFs de solicitacao de exames gerados pelo Prescritor de Exames (ONDA B).
// Um registro por TIPO (SANGUE / IMAGEM / OUTROS): exames de tipos diferentes
// nunca se misturam no mesmo PDF. O PDF e guardado em base64 e servido por id,
// para download e para o link enviado por WhatsApp.
export const examRequestPdfsTable = pgTable("exam_request_pdfs", {
  id: serial("id").primaryKey(),
  // Token aleatorio nao-adivinhavel: o link do PDF vai por WhatsApp/e-mail ao
  // paciente, entao precisa ser publico mas impossivel de enumerar por id.
  token: text("token").notNull().unique(),
  clientId: integer("client_id").notNull(),
  professionalId: integer("professional_id"),
  approvalRequestId: integer("approval_request_id"),
  tipo: text("tipo").notNull(),
  fileName: text("file_name").notNull(),
  examCount: integer("exam_count").notNull().default(0),
  observacao: text("observacao"),
  pdfData: text("pdf_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  approvalRequestIndex: index("exam_request_pdfs_approval_request_idx")
    .on(table.approvalRequestId)
    .where(sql`${table.approvalRequestId} IS NOT NULL`),
}));

export type ExamRequestPdf = typeof examRequestPdfsTable.$inferSelect;
