import { pgTable, text, serial, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Modelos de Documento — motor editável de textos reutilizáveis por tipo de
// documento (atestado, encaminhamento, recibo, geral). O corpo aceita variáveis
// no formato {{cliente.nome}} etc., substituídas na emissão.
export const documentTemplatesTable = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull().default("geral"),
  nome: text("nome").notNull(),
  corpo: text("corpo").notNull(),
  descricao: text("descricao"),
  variaveis: jsonb("variaveis"),
  ativo: boolean("ativo").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type DocumentTemplate = typeof documentTemplatesTable.$inferSelect;
