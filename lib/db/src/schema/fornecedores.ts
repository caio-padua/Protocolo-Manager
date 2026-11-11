import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";
import { professionalsTable } from "./professionals";

/** Cadastro por clínica; fabricante e fornecedor podem ser desconhecidos. */
export const fornecedoresTable = pgTable("fornecedores_cadastrados", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  nome: text("nome").notNull(),
  razaoSocial: text("razao_social"),
  cnpj: text("cnpj"),
  endereco: text("endereco"),
  telefone: text("telefone"),
  email: text("email"),
  site: text("site"),
  instagram: text("instagram"),
  fabricante: boolean("fabricante"),
  fornecedor: boolean("fornecedor"),
  fonte: text("fonte"),
  ativo: boolean("ativo").notNull().default(true),
  versao: integer("versao").notNull().default(1),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("fornecedores_empresa_nome_uq").on(t.empresaId, sql`lower(btrim(${t.nome}))`),
  uniqueIndex("fornecedores_empresa_id_uq").on(t.empresaId, t.id),
]);

export const fornecedorHistoricoTable = pgTable("fornecedor_historico", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  fornecedorId: integer("fornecedor_id").notNull(),
  profissionalId: integer("profissional_id").references(() => professionalsTable.id),
  atorTipo: text("ator_tipo").notNull().default("profissional"),
  justificativa: text("justificativa"),
  antes: jsonb("antes"),
  depois: jsonb("depois").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("fornecedor_historico_autor_ck", sql`(
  (${t.atorTipo} = 'profissional' AND ${t.profissionalId} IS NOT NULL)
  OR (${t.atorTipo} = 'agente' AND ${t.profissionalId} IS NULL AND ${t.justificativa} IS NOT NULL AND length(btrim(${t.justificativa})) > 0)
)`), foreignKey({
  name: "fornecedor_historico_empresa_fornecedor_fk",
  columns: [t.empresaId, t.fornecedorId],
  foreignColumns: [fornecedoresTable.empresaId, fornecedoresTable.id],
})]);

export const insertFornecedorSchema = createInsertSchema(fornecedoresTable).omit({
  id: true, versao: true, criadoEm: true, atualizadoEm: true,
});
export type InsertFornecedor = z.infer<typeof insertFornecedorSchema>;
export type Fornecedor = typeof fornecedoresTable.$inferSelect;
