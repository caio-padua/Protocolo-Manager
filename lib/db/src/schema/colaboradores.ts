import { pgTable, serial, text, boolean, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";
import { cargosTable } from "./cargos";

// Colaboradores (team members) — membros da equipe de cada empresa.
// Conceito distinto de `professionals` (que é a equipe do Instituto Padua no motor de agenda).
export const colaboradoresTable = pgTable("colaboradores", {
  id: serial("id").primaryKey(),
  iheId: integer("ihe_id"),
  empresaId: integer("empresa_id").references(() => empresasTable.id, { onDelete: "cascade" }),
  cargoId: integer("cargo_id").references(() => cargosTable.id, { onDelete: "set null" }),
  nomeCompleto: text("nome_completo").notNull(),
  cpf: text("cpf"),
  emailFuncional: text("email_funcional"),
  telefone: text("telefone"),
  statusAtivo: boolean("status_ativo").default(true),
  dataAdmissao: date("data_admissao"),
  dataDemissao: date("data_demissao"),
  observacoes: text("observacoes"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow(),
});

export const insertColaboradorSchema = createInsertSchema(colaboradoresTable).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type InsertColaborador = z.infer<typeof insertColaboradorSchema>;
export type Colaborador = typeof colaboradoresTable.$inferSelect;
