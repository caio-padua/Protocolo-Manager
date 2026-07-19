import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const agent_integration_log = pgTable("agent_integration_log", {
  id:           serial("id").primaryKey(),
  tipo:         text("tipo").notNull(), // trello_card | wpp_notificacao | wpp_boasvindas | webhook_recebido
  agente_id:    integer("agente_id"),
  client_id:    integer("client_id"),
  status:       text("status").notNull().default("ok"), // ok | falhou | skip
  detalhe:      jsonb("detalhe"),
  created_at:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAgentIntegrationLogSchema = createInsertSchema(agent_integration_log).omit({ id: true, created_at: true });
export type AgentIntegrationLog = typeof agent_integration_log.$inferSelect;
