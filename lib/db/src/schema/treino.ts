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
// ORGAO TREINO (nativo) — ONDA C do Master Loop Paxter.
//
// Espelha a arquitetura do Orgao Dieta. Segue o "Contrato Comum do Orgao":
//   1. CATALOGO ............ treino_catalogo_exercicios (a sala de exercicios)
//   2. FILA DE INDICACAO ... treino_indicacao (o Cerebro escreve aqui; aguarda
//                            validacao humana antes de virar prescricao)
//   3. PRESCRICAO .......... treino_prescricao + treino_prescricao_item (a ficha
//                            real de treino do cliente, com volume e carga reais)
//   4. PROTOCOLO ........... treino_protocolos (modelos reutilizaveis de treino)
//
// O dado entra NATIVO (sem tag de origem). Nenhum motor de calculo muda por
// estetica. Volume/carga/gasto sao numeros reais (series, reps, kg, kcal).
// ============================================================================

// 1) CATALOGO — a sala de exercicios (cada movimento e suas referencias).
export const treinoCatalogoExerciciosTable = pgTable("treino_catalogo_exercicios", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nome: text("nome").notNull(),
  grupoMuscular: text("grupo_muscular"), // peito, costas, perna, ombro, biceps, triceps, core, gluteo, panturrilha, cardio...
  padraoMovimento: text("padrao_movimento"), // empurrar, puxar, agachar, dobradica, deslocar, isometria...
  equipamento: text("equipamento"), // peso livre, maquina, halter, barra, cabo, peso corporal, elastico...
  nivel: text("nivel"), // iniciante, intermediario, avancado
  met: real("met"), // equivalente metabolico (para estimar gasto calorico)
  seriesPadrao: integer("series_padrao"), // sugestao caseira de series
  repeticoesPadrao: text("repeticoes_padrao"), // ex.: "8-12" ou "15"
  descansoPadraoSeg: integer("descanso_padrao_seg"), // descanso sugerido em segundos
  descricao: text("descricao"),
  instrucoes: text("instrucoes"),
  contraindicacoes: text("contraindicacoes"),
  tags: jsonb("tags"),
  observacao: text("observacao"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// 4) PROTOCOLO — modelos reutilizaveis de treino (templates).
export const treinoProtocolosTable = pgTable("treino_protocolos", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nome: text("nome").notNull(),
  objetivo: text("objetivo"), // hipertrofia, forca, resistencia, emagrecimento, mobilidade, condicionamento...
  divisao: text("divisao"), // full body, ABC, ABCD, push/pull/legs, upper/lower...
  frequenciaSemanal: integer("frequencia_semanal"), // dias de treino por semana
  nivel: text("nivel"), // iniciante, intermediario, avancado
  descricao: text("descricao"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// 3a) PRESCRICAO — a ficha de treino real de um cliente.
export const treinoPrescricaoTable = pgTable("treino_prescricao", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  protocoloId: integer("protocolo_id").references(() => treinoProtocolosTable.id),
  professionalId: integer("professional_id").references(() => professionalsTable.id),
  objetivo: text("objetivo"),
  divisao: text("divisao"),
  frequenciaSemanal: integer("frequencia_semanal"), // dias de treino por semana
  // Antropometria + perfil (entrada do calculo de gasto calorico).
  pesoKg: real("peso_kg"),
  alturaCm: real("altura_cm"),
  idade: integer("idade"),
  sexo: text("sexo"), // "M" | "F"
  nivelExperiencia: text("nivel_experiencia"), // iniciante, intermediario, avancado
  // Resultado da conta (calculado no backend a partir dos itens).
  volumeTotalSeries: integer("volume_total_series"), // soma das series de todos os itens
  tonelagemKg: real("tonelagem_kg"), // soma de (series x reps x carga) — volume-load
  duracaoEstimadaMin: real("duracao_estimada_min"), // tempo estimado por sessao
  gastoCaloricoKcal: real("gasto_calorico_kcal"), // estimativa via MET x peso x tempo
  status: text("status").notNull().default("rascunho"), // rascunho, ativa, encerrada
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// 3b) PRESCRICAO ITEM — cada exercicio dentro de um dia de treino.
export const treinoPrescricaoItemTable = pgTable("treino_prescricao_item", {
  id: serial("id").primaryKey(),
  prescricaoId: integer("prescricao_id").notNull().references(() => treinoPrescricaoTable.id, { onDelete: "cascade" }),
  diaTreino: text("dia_treino").notNull(), // A, B, C, D ou segunda, terca... (split do protocolo)
  ordem: integer("ordem"),
  exercicioId: integer("exercicio_id").references(() => treinoCatalogoExerciciosTable.id),
  exercicioNome: text("exercicio_nome"), // nome denormalizado (permite item livre)
  series: integer("series"),
  repeticoes: text("repeticoes"), // ex.: "8-12" ou "15" (faixa ou numero)
  repeticoesNum: integer("repeticoes_num"), // valor numerico para a conta de tonelagem
  cargaKg: real("carga_kg"),
  descansoSeg: integer("descanso_seg"),
  // Resultado calculado para o item.
  tonelagemKg: real("tonelagem_kg"), // series x repeticoesNum x cargaKg
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// 2) FILA DE INDICACAO — o Cerebro (motor) escreve aqui; aguarda validacao.
export const treinoIndicacaoTable = pgTable("treino_indicacao", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  anamneseSessionId: integer("anamnese_session_id"),
  origem: text("origem").notNull().default("motor"), // motor | manual
  protocoloId: integer("protocolo_id").references(() => treinoProtocolosTable.id),
  objetivoSugerido: text("objetivo_sugerido"),
  divisaoSugerida: text("divisao_sugerida"),
  justificativa: text("justificativa"), // por que o Cerebro indicou (bloco/escore)
  bloco: text("bloco"),
  escore: integer("escore"),
  status: text("status").notNull().default("pendente"), // pendente, validada, descartada, prescrita
  prescricaoId: integer("prescricao_id").references(() => treinoPrescricaoTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // Idempotencia atomica do Cerebro: no maximo 1 indicacao PENDENTE de origem
  // 'motor' por cliente. Garante unicidade no banco (evita corrida select-then-insert).
  uniqueIndex("treino_indicacao_motor_pendente_uq")
    .on(t.clientId)
    .where(sql`origem = 'motor' AND status = 'pendente'`),
]);

// ---- Insert schemas + tipos derivados ----
export const insertTreinoExercicioSchema = createInsertSchema(treinoCatalogoExerciciosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreinoExercicio = z.infer<typeof insertTreinoExercicioSchema>;
export type TreinoExercicio = typeof treinoCatalogoExerciciosTable.$inferSelect;

export const insertTreinoProtocoloSchema = createInsertSchema(treinoProtocolosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreinoProtocolo = z.infer<typeof insertTreinoProtocoloSchema>;
export type TreinoProtocolo = typeof treinoProtocolosTable.$inferSelect;

export const insertTreinoPrescricaoSchema = createInsertSchema(treinoPrescricaoTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreinoPrescricao = z.infer<typeof insertTreinoPrescricaoSchema>;
export type TreinoPrescricao = typeof treinoPrescricaoTable.$inferSelect;

export const insertTreinoPrescricaoItemSchema = createInsertSchema(treinoPrescricaoItemTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreinoPrescricaoItem = z.infer<typeof insertTreinoPrescricaoItemSchema>;
export type TreinoPrescricaoItem = typeof treinoPrescricaoItemTable.$inferSelect;

export const insertTreinoIndicacaoSchema = createInsertSchema(treinoIndicacaoTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreinoIndicacao = z.infer<typeof insertTreinoIndicacaoSchema>;
export type TreinoIndicacao = typeof treinoIndicacaoTable.$inferSelect;
