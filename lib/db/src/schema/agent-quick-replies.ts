import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const agent_quick_replies = pgTable("agent_quick_replies", {
  id:         serial("id").primaryKey(),
  agente_id:  integer("agente_id").notNull(),
  texto:      text("texto").notNull(),
  ordem:      integer("ordem").notNull().default(1),
  ativo:      boolean("ativo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAgentQuickReplySchema = createInsertSchema(agent_quick_replies).omit({ id: true, created_at: true });
export type AgentQuickReply = typeof agent_quick_replies.$inferSelect;
