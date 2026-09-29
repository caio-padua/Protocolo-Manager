import { pgTable, text, serial, timestamp, integer, real, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const substancesTable = pgTable("substances", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  color: text("color").notNull(),
  defaultDose: text("default_dose"),
  unit: text("unit"),
  maxSessionsPerWeek: integer("max_sessions_per_week"),
  intervalDays: integer("interval_days"),
  notes: text("notes"),
  stockQuantity: real("stock_quantity").notNull().default(0),
  stockUnit: text("stock_unit"),
  pricePerUnit: real("price_per_unit").notNull().default(0),
  procedureType: text("procedure_type").notNull().default("iv"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  description: text("description"),
  mainFunction: text("main_function"),
  perceivedEffects: text("perceived_effects"),
  timeToEffect: text("time_to_effect"),
  starRating: integer("star_rating").notNull().default(5),
  bodySystemEffects: jsonb("body_system_effects").default({}),
  categoryMeters: jsonb("category_meters").default({}),
  longevityBenefit: text("longevity_benefit"),
  qualityOfLifeImpact: text("quality_of_life_impact"),
  sleepBenefit: text("sleep_benefit"),
  energyBenefit: text("energy_benefit"),
  libidoBenefit: text("libido_benefit"),
  physicalPerformance: text("physical_performance"),
  muscleStrength: text("muscle_strength"),
  mentalClarity: text("mental_clarity"),
  skinHairNails: text("skin_hair_nails"),
  immuneSupport: text("immune_support"),
  contraindications: text("contraindications"),
  scientificEvidence: text("scientific_evidence"),
  categoryType: text("category_type"),
  // Campos nativos vindos do catalogo transmutado (catalogo_itens). Criados sem
  // excecao para nao perder nenhum dado da origem (regra de ouro). codigoPadcom e
  // a chave natural de idempotencia da importacao.
  codigoPadcom: text("codigo_padcom").unique(),
  subCategoria: text("sub_categoria"),
  disponivel: boolean("disponivel"),
  tags: jsonb("tags"),
  blocoId: text("bloco_id"),
  grau: text("grau"),
  viaUso: text("via_uso"),
  frequenciaBase: text("frequencia_base"),
  composicao: text("composicao"),
  posologia: text("posologia"),
  areaSemantica: text("area_semantica"),
  exigeValidacaoHumana: boolean("exige_validacao_humana"),
  unidadeId: integer("unidade_id"),
  posologiaEstruturada: jsonb("posologia_estruturada"),
  concentrationMg: text("concentration_mg"),
  volumeAmpola: text("volume_ampola"),
  isBlend: boolean("is_blend").notNull().default(false),
  presentationQuantity: real("presentation_quantity"),
  presentationUnit: text("presentation_unit"),
  ampouleVolumeMl: real("ampoule_volume_ml"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubstanceSchema = createInsertSchema(substancesTable).omit({ id: true, createdAt: true });
export type InsertSubstance = z.infer<typeof insertSubstanceSchema>;
export type Substance = typeof substancesTable.$inferSelect;
