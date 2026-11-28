import { pgTable, text, serial, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

// Medicoes corporais do cliente (bioimpedancia, antropometria, dinamometria, calorimetria,
// ultrassom, outras). Uma linha = uma medicao. Nunca se apaga: remover = preencher deleted_at.
export const clientAvaliacoesTable = pgTable("client_avaliacoes", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  empresaId: integer("empresa_id").notNull(),
  tipo: text("tipo").notNull(),
  // Data da medicao em BRT, texto AAAA-MM-DD
  dataAvaliacao: text("data_avaliacao").notNull(),
  valores: jsonb("valores").$type<Record<string, number | string>>().notNull(),
  observacoes: text("observacoes"),
  criadoPor: integer("criado_por"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => ({
  porCliente: index("client_avaliacoes_cliente_tipo_idx").on(t.clientId, t.tipo, t.dataAvaliacao),
}));

export type ClientAvaliacao = typeof clientAvaliacoesTable.$inferSelect;
