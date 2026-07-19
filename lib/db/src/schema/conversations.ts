import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agente_conversations = pgTable("agente_conversations", {
  id: serial("id").primaryKey(),
  agente_id: integer("agente_id").notNull(),
  title: text("title").notNull().default("Nova conversa"),
  provedor: text("provedor").notNull().default("claude-sonnet-4-6"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAgenteConversationSchema = createInsertSchema(agente_conversations).omit({
  id: true,
  createdAt: true,
});

export type AgenteConversation = typeof agente_conversations.$inferSelect;
export type InsertAgenteConversation = z.infer<typeof insertAgenteConversationSchema>;
