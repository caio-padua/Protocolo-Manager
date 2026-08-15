import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionsTable } from "./sessions";
import { protocolsTable } from "./protocols";

// ============================================================================
// LOG DE E-MAIL — rastreio de todo disparo de e-mail via Gmail (ou futuro Zoho).
//
// Cada envio grava 1 linha (sucesso ou falha). Destinatário mascarado na API.
// Campo `provider` reservado para Spec B (multi-remetente Zoho).
// ============================================================================

export const emailLogTable = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    tipo: text("tipo").notNull(), // pre_sessao | pos_sessao | lembrete_semanal | ics_reenviado
    clienteNome: text("cliente_nome").notNull().default(""),
    destinatario: text("destinatario").notNull(), // e-mail completo gravado no banco; mascarado na API
    assunto: text("assunto").notNull().default(""),
    status: text("status").notNull().default("enviado"), // enviado | falhou
    erro: text("erro"),
    sessionId: integer("session_id").references(() => sessionsTable.id, { onDelete: "set null" }),
    protocolId: integer("protocol_id").references(() => protocolsTable.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("gmail"), // gmail | zoho | smtp — reservado para Spec B
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxCriado: index("idx_email_log_criado").on(t.criadoEm),
    idxTipo: index("idx_email_log_tipo").on(t.tipo),
    idxStatus: index("idx_email_log_status").on(t.status),
  }),
);

export const insertEmailLogSchema = createInsertSchema(emailLogTable).omit({
  id: true,
  criadoEm: true,
});
export type EmailLog = typeof emailLogTable.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
