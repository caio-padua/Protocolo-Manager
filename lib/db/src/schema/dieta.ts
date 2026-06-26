import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { professionalsTable } from "./professionals";

// ============================================================================
// ORGAO DIETA (nativo) — ONDA A do Master Loop Paxter.
//
// O orgao Dieta segue o "Contrato Comum do Orgao":
//   1. CATALOGO ............ dieta_catalogo_alimentos (a despensa de alimentos)
//   2. FILA DE INDICACAO ... dieta_indicacao (o Cerebro escreve aqui; aguarda
//                            validacao humana antes de virar prescricao)
//   3. PRESCRICAO .......... dieta_prescricao + dieta_prescricao_item (o cardapio
//                            real do cliente, com calorias e macros calculados)
//   4. PROTOCOLO ........... dieta_protocolos (modelos reutilizaveis de dieta)
//
// O dado entra NATIVO (sem tag de origem). Nenhum motor de calculo muda por
// estetica. Calorias/macros sao numeros reais (gramas, kcal).
// ============================================================================

// 1) CATALOGO — a despensa de alimentos (valores por 100 g).
export const dietaCatalogoAlimentosTable = pgTable("dieta_catalogo_alimentos", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nome: text("nome").notNull(),
  grupo: text("grupo"), // Proteina, Carboidrato, Gordura, Vegetal, Fruta, Laticinio...
  subgrupo: text("subgrupo"),
  porcaoPadraoG: real("porcao_padrao_g"), // porcao caseira sugerida, em gramas
  kcal100g: real("kcal_100g"),
  proteinaG100g: real("proteina_g_100g"),
  carboidratoG100g: real("carboidrato_g_100g"),
  gorduraG100g: real("gordura_g_100g"),
  fibraG100g: real("fibra_g_100g"),
  indiceGlicemico: integer("indice_glicemico"),
  restricoes: jsonb("restricoes"), // ex.: ["lactose","gluten"]
  tags: jsonb("tags"),
  observacao: text("observacao"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// 4) PROTOCOLO — modelos reutilizaveis de dieta (templates).
export const dietaProtocolosTable = pgTable("dieta_protocolos", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nome: text("nome").notNull(),
  objetivo: text("objetivo"), // emagrecimento, hipertrofia, longevidade, manutencao...
  estiloAlimentar: text("estilo_alimentar"), // low carb, mediterranea, cetogenica...
  descricao: text("descricao"),
  jejumIntermitente: boolean("jejum_intermitente").notNull().default(false),
  jejumJanelaInicio: text("jejum_janela_inicio"), // "HH:MM" inicio da janela de alimentacao
  jejumJanelaFim: text("jejum_janela_fim"), // "HH:MM" fim da janela de alimentacao
  fatorAjusteObjetivo: real("fator_ajuste_objetivo"), // ex.: 0.80 (deficit), 1.15 (superavit)
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// 3a) PRESCRICAO — o cardapio real de um cliente.
export const dietaPrescricaoTable = pgTable("dieta_prescricao", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  protocoloId: integer("protocolo_id").references(() => dietaProtocolosTable.id),
  professionalId: integer("professional_id").references(() => professionalsTable.id),
  objetivo: text("objetivo"),
  estiloAlimentar: text("estilo_alimentar"),
  // Antropometria + atividade (entrada da conta de TDEE).
  pesoKg: real("peso_kg"),
  alturaCm: real("altura_cm"),
  idade: integer("idade"),
  sexo: text("sexo"), // "M" | "F"
  nivelAtividade: text("nivel_atividade"), // sedentario, leve, moderado, intenso, atleta
  // Jejum intermitente (janela de alimentacao).
  jejumIntermitente: boolean("jejum_intermitente").notNull().default(false),
  jejumJanelaInicio: text("jejum_janela_inicio"),
  jejumJanelaFim: text("jejum_janela_fim"),
  // Resultado da conta (calculado no backend).
  tmb: real("tmb"), // Taxa Metabolica Basal (Mifflin-St Jeor)
  tdee: real("tdee"), // Total Daily Energy Expenditure = TMB x fator de atividade
  caloriasAlvo: real("calorias_alvo"), // TDEE ajustado pelo objetivo
  status: text("status").notNull().default("rascunho"), // rascunho, ativa, encerrada
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// 3b) PRESCRICAO ITEM — cada alimento dentro de uma refeicao.
export const dietaPrescricaoItemTable = pgTable("dieta_prescricao_item", {
  id: serial("id").primaryKey(),
  prescricaoId: integer("prescricao_id").notNull().references(() => dietaPrescricaoTable.id, { onDelete: "cascade" }),
  refeicao: text("refeicao").notNull(), // cafe_manha, lanche_manha, almoco, lanche_tarde, jantar, ceia
  horario: text("horario"), // "HH:MM"
  ordem: integer("ordem"),
  alimentoId: integer("alimento_id").references(() => dietaCatalogoAlimentosTable.id),
  alimentoNome: text("alimento_nome"), // nome denormalizado (permite item livre)
  quantidadeG: real("quantidade_g"),
  // Macros calculados para a porcao (a partir do catalogo x quantidade).
  kcal: real("kcal"),
  proteinaG: real("proteina_g"),
  carboidratoG: real("carboidrato_g"),
  gorduraG: real("gordura_g"),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// 2) FILA DE INDICACAO — o Cerebro (motor) escreve aqui; aguarda validacao.
export const dietaIndicacaoTable = pgTable("dieta_indicacao", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  anamneseSessionId: integer("anamnese_session_id"),
  origem: text("origem").notNull().default("motor"), // motor | manual
  protocoloId: integer("protocolo_id").references(() => dietaProtocolosTable.id),
  objetivoSugerido: text("objetivo_sugerido"),
  estiloSugerido: text("estilo_sugerido"),
  justificativa: text("justificativa"), // por que o Cerebro indicou (bloco/escore)
  bloco: text("bloco"),
  escore: integer("escore"),
  status: text("status").notNull().default("pendente"), // pendente, validada, descartada, prescrita
  prescricaoId: integer("prescricao_id").references(() => dietaPrescricaoTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // Idempotencia atomica do Cerebro: no maximo 1 indicacao PENDENTE de origem
  // 'motor' por cliente. Garante unicidade no banco (evita corrida select-then-insert).
  uniqueIndex("dieta_indicacao_motor_pendente_uq")
    .on(t.clientId)
    .where(sql`origem = 'motor' AND status = 'pendente'`),
]);

// ---- Insert schemas + tipos derivados ----
export const insertDietaAlimentoSchema = createInsertSchema(dietaCatalogoAlimentosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDietaAlimento = z.infer<typeof insertDietaAlimentoSchema>;
export type DietaAlimento = typeof dietaCatalogoAlimentosTable.$inferSelect;

export const insertDietaProtocoloSchema = createInsertSchema(dietaProtocolosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDietaProtocolo = z.infer<typeof insertDietaProtocoloSchema>;
export type DietaProtocolo = typeof dietaProtocolosTable.$inferSelect;

export const insertDietaPrescricaoSchema = createInsertSchema(dietaPrescricaoTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDietaPrescricao = z.infer<typeof insertDietaPrescricaoSchema>;
export type DietaPrescricao = typeof dietaPrescricaoTable.$inferSelect;

export const insertDietaPrescricaoItemSchema = createInsertSchema(dietaPrescricaoItemTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDietaPrescricaoItem = z.infer<typeof insertDietaPrescricaoItemSchema>;
export type DietaPrescricaoItem = typeof dietaPrescricaoItemTable.$inferSelect;

export const insertDietaIndicacaoSchema = createInsertSchema(dietaIndicacaoTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDietaIndicacao = z.infer<typeof insertDietaIndicacaoSchema>;
export type DietaIndicacao = typeof dietaIndicacaoTable.$inferSelect;
