import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// =============================================================================
// ONDA 2 — MEGA ANAMNESE INTEGRATIVA + MOTOR (lado Manager / Padcon Conect)
// Regra do CEO: ADITIVO (nunca dropar); tudo editavel (DB-driven), nada
// cravado no codigo; chave natural sempre que possivel.
// =============================================================================

// ---- M:N pergunta -> sintoma (par unico) ----
export const perguntaSintomaTable = pgTable(
  "pergunta_sintoma",
  {
    id: serial("id").primaryKey(),
    perguntaId: text("pergunta_id").notNull(),
    sintomaCodigo: text("sintoma_codigo").notNull(),
    // valor da resposta que dispara este sintoma (ex.: "sim", ">=10", "grave")
    gatilhoValor: text("gatilho_valor"),
    peso: integer("peso").default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("pergunta_sintoma_uq").on(t.perguntaId, t.sintomaCodigo, t.gatilhoValor)],
);

// ---- M:N pergunta -> doenca (par unico) ----
export const perguntaDoencaTable = pgTable(
  "pergunta_doenca",
  {
    id: serial("id").primaryKey(),
    perguntaId: text("pergunta_id").notNull(),
    doencaIdIhe: integer("doenca_id_ihe").notNull(),
    gatilhoValor: text("gatilho_valor"),
    peso: integer("peso").default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("pergunta_doenca_uq").on(t.perguntaId, t.doencaIdIhe, t.gatilhoValor)],
);

// ---- M:N item terapeutico -> doenca (casos indicados) ----
export const itemDoencaTable = pgTable(
  "item_doenca",
  {
    id: serial("id").primaryKey(),
    itemTipo: text("item_tipo").notNull(), // formula | injetavel | implante | substance
    itemRef: text("item_ref").notNull(), // codigo/id do item no seu catalogo
    itemNome: text("item_nome"),
    doencaIdIhe: integer("doenca_id_ihe").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("item_doenca_uq").on(t.itemTipo, t.itemRef, t.doencaIdIhe)],
);

// ---- M:N item terapeutico -> sintoma (objetivos) ----
export const itemSintomaTable = pgTable(
  "item_sintoma",
  {
    id: serial("id").primaryKey(),
    itemTipo: text("item_tipo").notNull(),
    itemRef: text("item_ref").notNull(),
    itemNome: text("item_nome"),
    sintomaCodigo: text("sintoma_codigo").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("item_sintoma_uq").on(t.itemTipo, t.itemRef, t.sintomaCodigo)],
);

// ---- Resposta do cliente a uma pergunta (por sessao de anamnese) ----
export const anamneseRespostaTable = pgTable("anamnese_resposta", {
  id: serial("id").primaryKey(),
  sessaoId: integer("sessao_id").notNull(),
  clienteId: integer("cliente_id"),
  perguntaId: text("pergunta_id").notNull(),
  valor: text("valor"),
  valorNumerico: integer("valor_numerico"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Escore de gravidade calculado POR BLOCO (por sessao) ----
export const motorEscoreBlocoTable = pgTable("motor_escore_bloco", {
  id: serial("id").primaryKey(),
  sessaoId: integer("sessao_id").notNull(),
  blocoCodigo: text("bloco_codigo").notNull(),
  blocoNome: text("bloco_nome"),
  escore: integer("escore").notNull().default(0),
  gradeCalculada: text("grade_calculada"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Pacote sugerido pelo motor (fila de validacao) ----
export const motorSugestaoTable = pgTable("motor_sugestao", {
  id: serial("id").primaryKey(),
  sessaoId: integer("sessao_id").notNull(),
  clienteId: integer("cliente_id"),
  status: text("status").notNull().default("AGUARDA_VALIDACAO"),
  resumo: jsonb("resumo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Item dentro do pacote sugerido (exame/formula/injetavel) ----
export const motorSugestaoItemTable = pgTable("motor_sugestao_item", {
  id: serial("id").primaryKey(),
  sugestaoId: integer("sugestao_id").notNull(),
  tipo: text("tipo").notNull(), // exame | formula | injetavel | implante
  refNome: text("ref_nome").notNull(),
  refCodigo: text("ref_codigo"),
  blocoCodigo: text("bloco_codigo"),
  grau: text("grau"),
  status: text("status").notNull().default("AGUARDA_VALIDACAO"), // validado | recusado | aguarda
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Delegacao (auditada): quem delegou, p/ quem, modo ----
export const motorDelegacaoTable = pgTable("motor_delegacao", {
  id: serial("id").primaryKey(),
  sugestaoId: integer("sugestao_id").notNull(),
  modo: text("modo").notNull(), // medico_comando | humano_assistente | automatico
  deProfissionalId: integer("de_profissional_id"),
  paraProfissionalId: integer("para_profissional_id"),
  acao: text("acao"), // delegado | aceito | concluido
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Permissoes editaveis por profissional (LACUNA da CARTA_06: o Manager
//      so tinha papel "executor"). Tudo editavel por clique. ----
export const motorPermissaoTable = pgTable("motor_permissao", {
  id: serial("id").primaryKey(),
  profissionalId: integer("profissional_id").notNull().unique(),
  papel: text("papel"), // medico | enfermeira | validador_mestre | adm | financeiro
  podeValidar: boolean("pode_validar").default(false),
  podeAssinar: boolean("pode_assinar").default(false),
  podeBypass: boolean("pode_bypass").default(false),
  podeDelegar: boolean("pode_delegar").default(false),
  nuncaOpera: boolean("nunca_opera").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPerguntaSintomaSchema = createInsertSchema(perguntaSintomaTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPerguntaDoencaSchema = createInsertSchema(perguntaDoencaTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertItemDoencaSchema = createInsertSchema(itemDoencaTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertItemSintomaSchema = createInsertSchema(itemSintomaTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnamneseRespostaSchema = createInsertSchema(anamneseRespostaTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMotorPermissaoSchema = createInsertSchema(motorPermissaoTable).omit({ id: true, createdAt: true, updatedAt: true });

export type PerguntaSintoma = typeof perguntaSintomaTable.$inferSelect;
export type PerguntaDoenca = typeof perguntaDoencaTable.$inferSelect;
export type ItemDoenca = typeof itemDoencaTable.$inferSelect;
export type ItemSintoma = typeof itemSintomaTable.$inferSelect;
export type AnamneseResposta = typeof anamneseRespostaTable.$inferSelect;
export type MotorEscoreBloco = typeof motorEscoreBlocoTable.$inferSelect;
export type MotorSugestao = typeof motorSugestaoTable.$inferSelect;
export type MotorSugestaoItem = typeof motorSugestaoItemTable.$inferSelect;
export type MotorDelegacao = typeof motorDelegacaoTable.$inferSelect;
export type MotorPermissao = typeof motorPermissaoTable.$inferSelect;
export type InsertPerguntaSintoma = z.infer<typeof insertPerguntaSintomaSchema>;
export type InsertPerguntaDoenca = z.infer<typeof insertPerguntaDoencaSchema>;
export type InsertItemDoenca = z.infer<typeof insertItemDoencaSchema>;
export type InsertItemSintoma = z.infer<typeof insertItemSintomaSchema>;
