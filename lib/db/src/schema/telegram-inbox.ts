import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

// ============================================================================
// INBOX DO TELEGRAM — grava cada mensagem recebida de um paciente vinculado.
//
// Quando o paciente envia uma mensagem ao bot (@Paduaclinica_bot) e já tem
// chatId vinculado, o webhook grava aqui ANTES de encaminhar ao CEO.
// O campo lida_em (nullable) serve de flag de leitura: NULL = não lida.
//
// O badge de "não lidas" exibido no cockpit deriva de COUNT WHERE lida_em IS NULL.
// ============================================================================

export const telegramInboxTable = pgTable(
  "telegram_inbox_messages",
  {
    id: serial("id").primaryKey(),
    empresaId: integer("empresa_id").notNull(), // tenant — herdado de clients.empresa_id
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    chatId: text("chat_id").notNull(),
    texto: text("texto").notNull(),
    recebidaEm: timestamp("recebida_em", { withTimezone: true }).notNull().defaultNow(),
    lidaEm: timestamp("lida_em", { withTimezone: true }), // NULL = não lida
  },
  (t) => ({
    idxCliente: index("idx_telegram_inbox_cliente").on(t.clienteId),
    idxRecebida: index("idx_telegram_inbox_recebida").on(t.recebidaEm),
  }),
);

export const insertTelegramInboxSchema = createInsertSchema(telegramInboxTable).omit({
  id: true,
  recebidaEm: true,
  lidaEm: true,
});
export type TelegramInboxMessage = typeof telegramInboxTable.$inferSelect;
export type InsertTelegramInbox = z.infer<typeof insertTelegramInboxSchema>;
