import { boolean, integer, numeric, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { empresasTable } from "./empresas";
import { substancesTable } from "./substances";

export const procedimentosTable = pgTable("procedimentos_clinicos", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  descricao: text("descricao"),
  duracaoMinutos: numeric("duracao_minutos", { precision: 8, scale: 2 }),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const procedimentoProdutosTable = pgTable("procedimento_produtos", {
  procedimentoId: integer("procedimento_id").notNull().references(() => procedimentosTable.id),
  produtoId: integer("produto_id").notNull().references(() => substancesTable.id),
  ativo: boolean("ativo").notNull().default(true),
}, (table) => [primaryKey({ columns: [table.procedimentoId, table.produtoId] })]);

export const insertProcedimentoSchema = createInsertSchema(procedimentosTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ProcedimentoClinico = typeof procedimentosTable.$inferSelect;
