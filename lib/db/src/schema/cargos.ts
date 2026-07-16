import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";

// Cargos (team positions) — cada empresa tem seus próprios cargos com permissões.
// Porta o campo `perfil` (nunca `role` — decisão do CEO) implicitamente pelo código_completo.
export const cargosTable = pgTable("cargos", {
  id: serial("id").primaryKey(),
  iheId: integer("ihe_id"),
  empresaId: integer("empresa_id").references(() => empresasTable.id, { onDelete: "cascade" }),
  cargo: text("cargo").notNull(),                // MEDICO | ENFERMEIRA | GERENTE | RECEPCIONISTA etc.
  indice: text("indice"),                        // ex: "medico01"
  codigoCompleto: text("codigo_completo"),       // código interno do cargo
  modalidade: text("modalidade"),                // presencial | remoto | hibrido
  slaDefault: text("sla_default"),               // tempo de resposta padrão ex: "72h"
  reportaA: text("reporta_a"),                   // a quem este cargo reporta
  descricaoFuncao: text("descricao_funcao"),
  objetivos: text("objetivos"),
  // Permissões (prefixo `pode_` — padrão CEO)
  podeAcessarFinanceiro: boolean("pode_acessar_financeiro").default(false),
  podeEditarProtocolos: boolean("pode_editar_protocolos").default(false),
  podeAprovarDespesas: boolean("pode_aprovar_despesas").default(false),
  podeAuditarCards: boolean("pode_auditar_cards").default(false),
  podeVerOuvidoria: boolean("pode_ver_ouvidoria").default(false),
  podeSupervisionar: boolean("pode_supervisionar_outros").default(false),
  ativa: boolean("ativa").default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow(),
});

export const insertCargoSchema = createInsertSchema(cargosTable).omit({ id: true, criadoEm: true });
export type InsertCargo = z.infer<typeof insertCargoSchema>;
export type Cargo = typeof cargosTable.$inferSelect;
