import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { agente_conversations } from "./conversations";

export const agente_messages = pgTable("agente_messages", {
  id: serial("id").primaryKey(),
  conversation_id: integer("conversation_id")
    .notNull()
    .references(() => agente_conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAgenteMessageSchema = createInsertSchema(agente_messages).omit({
  id: true,
  createdAt: true,
});

export type AgenteMessage = typeof agente_messages.$inferSelect;
export type InsertAgenteMessage = z.infer<typeof insertAgenteMessageSchema>;
