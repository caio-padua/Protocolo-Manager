import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

// ============================================================================
// LOG DE WHATSAPP — rastreio de entrega de TODA mensagem enviada via Twilio.
//
// Cada envio grava uma linha (com o SID do Twilio e o status inicial). O status
// final chega de forma ASSÍNCRONA pelo webhook StatusCallback do Twilio
// (POST /api/whatsapp/status), que atualiza esta linha por MessageSid.
//
// O telefone é guardado inteiro no banco (dado nativo do cliente), mas a API e a
// tela SEMPRE mascaram. Nunca logar o token do Twilio.
// ============================================================================

export const whatsappMensagensLogTable = pgTable(
  "whatsapp_mensagens_log",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id").references(() => clientsTable.id, { onDelete: "set null" }),
    telefone: text("telefone").notNull(),
    corpo: text("corpo").notNull(),
    sid: text("sid"), // SID do Twilio (null quando cai em link/fallback)
    status: text("status").notNull().default("queued"), // queued|sent|delivered|read|failed|undelivered|link
    errorCode: text("error_code"),
    contexto: text("contexto"), // lembrete_prescricao | cockpit | manual | ...
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    idxSid: index("idx_whatsapp_log_sid").on(t.sid),
    idxCriado: index("idx_whatsapp_log_criado").on(t.criadoEm),
  }),
);

export const insertWhatsappLogSchema = createInsertSchema(whatsappMensagensLogTable).omit({
  id: true,
  criadoEm: true,
  atualizadoEm: true,
});
export type WhatsappLog = typeof whatsappMensagensLogTable.$inferSelect;
export type InsertWhatsappLog = z.infer<typeof insertWhatsappLogSchema>;
