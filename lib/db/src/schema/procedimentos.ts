import { boolean, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { empresasTable } from "./empresas";
import { substancesTable } from "./substances";
import { professionalAreasTable } from "./professional-taxonomy";
import { professionalsTable } from "./professionals";
import { locationsTable } from "./locations";

export const procedimentosTable = pgTable("procedimentos_clinicos", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  nome: text("nome").notNull(),
  tipo: text("tipo"),
  dose: text("dose"),
  descricao: text("descricao"),
  duracaoMinutos: numeric("duracao_minutos", { precision: 8, scale: 2 }),
  duracaoSegundos: integer("duracao_segundos"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const procedimentoProdutosTable = pgTable("procedimento_produtos", {
  procedimentoId: integer("procedimento_id").notNull().references(() => procedimentosTable.id),
  produtoId: integer("produto_id").notNull().references(() => substancesTable.id),
  ativo: boolean("ativo").notNull().default(true),
}, (table) => [primaryKey({ columns: [table.procedimentoId, table.produtoId] })]);

export const procedimentoEquipesTable = pgTable("procedimento_equipes", {
  id: serial("id").primaryKey(),
  procedimentoId: integer("procedimento_id").notNull().references(() => procedimentosTable.id),
  areaId: integer("area_id").notNull().references(() => professionalAreasTable.id),
  locationId: integer("location_id").notNull().references(() => locationsTable.id),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const procedimentoEquipesProfissionaisTable = pgTable("procedimento_equipes_profissionais", {
  equipeId: integer("equipe_id").notNull().references(() => procedimentoEquipesTable.id),
  professionalId: integer("professional_id").notNull().references(() => professionalsTable.id),
}, (table) => [primaryKey({ columns: [table.equipeId, table.professionalId] })]);

export const procedimentoRevisoesTable = pgTable("procedimento_revisoes", {
  id: serial("id").primaryKey(),
  procedimentoId: integer("procedimento_id").notNull().references(() => procedimentosTable.id),
  professionalId: integer("professional_id").notNull().references(() => professionalsTable.id),
  conteudoAnterior: jsonb("conteudo_anterior").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProcedimentoSchema = createInsertSchema(procedimentosTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ProcedimentoClinico = typeof procedimentosTable.$inferSelect;
