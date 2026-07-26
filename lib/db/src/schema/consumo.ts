/**
 * consumo_eventos — Livro-caixa de consumo (append-only, NUNCA delete/update)
 *
 * Cada ação de valor do sistema (receita, lembrete, IA, OCR, assinatura)
 * gera uma linha aqui via INSERT ... ON CONFLICT DO NOTHING (idempotente).
 * Esta tabela é auditável e se torna argumento de venda no Painel de Prova de Valor.
 *
 * REGRAS ABSOLUTAS:
 * - Nunca DELETE ou UPDATE nesta tabela
 * - chave_idempotencia é UNIQUE — garante que a mesma ação não conta duas vezes
 * - custo_unitario é congelado no momento do evento (não recalcular depois)
 */

import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const consumoEventosTable = pgTable("consumo_eventos", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull(),
  tipoEvento: text("tipo_evento").notNull(),
  origemId: integer("origem_id"),
  origemTabela: text("origem_tabela"),
  custoUnitario: numeric("custo_unitario", { precision: 10, scale: 4 })
    .notNull()
    .default("0"),
  moeda: text("moeda").notNull().default("BRL"),
  chaveIdempotencia: text("chave_idempotencia").notNull(),
  metadata: jsonb("metadata"),
  registradoEm: timestamp("registrado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertConsumoEventoSchema = createInsertSchema(consumoEventosTable).omit({
  id: true,
  registradoEm: true,
});

export type ConsumoEvento = typeof consumoEventosTable.$inferSelect;
export type InsertConsumoEvento = z.infer<typeof insertConsumoEventoSchema>;
