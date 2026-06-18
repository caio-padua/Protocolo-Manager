import { pgTable, text, serial, integer, real, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Catalogo orcavel: substancias + servicos com PRECO COMERCIAL editavel.
// Separado de substances.pricePerUnit (preco operacional/estoque) de proposito:
// aqui e a tabela de precos do NEGOCIADOR, editada na tela de Parametrizacao.
// substanceId (opcional) liga o item a substances para a Vitrine puxar beneficios.
// Dinheiro SEMPRE em centavos inteiros (unitPriceCents).
// ---------------------------------------------------------------------------
export const budgetCatalogTable = pgTable("budget_catalog", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("substance"), // substance | service | formula | consultation | diet
  name: text("name").notNull().unique(), // chave natural p/ seed idempotente
  defaultDose: text("default_dose"),
  defaultSessions: integer("default_sessions").notNull().default(1),
  frequencyDays: integer("frequency_days"),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  substanceId: integer("substance_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBudgetCatalogSchema = createInsertSchema(budgetCatalogTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBudgetCatalog = z.infer<typeof insertBudgetCatalogSchema>;
export type BudgetCatalog = typeof budgetCatalogTable.$inferSelect;

// ---------------------------------------------------------------------------
// Parametrizacao: LINHA UNICA (id=1). Descontos, taxas de cartao por parcela,
// duracao do plano, cenario recomendado. Editavel SO pelo admin.
// cardFees = jsonb [{ installments: 2, feePct: 5.59 }, ...]
// ---------------------------------------------------------------------------
export type CardFee = { installments: number; feePct: number };

export const budgetSettingsTable = pgTable("budget_settings", {
  id: integer("id").primaryKey().default(1),
  cashDiscountPct: real("cash_discount_pct").notNull().default(15),
  down50DiscountPct: real("down50_discount_pct").notNull().default(10),
  down30DiscountPct: real("down30_discount_pct").notNull().default(5),
  maxNoInterestInstallments: integer("max_no_interest_installments").notNull().default(3),
  planMonths: integer("plan_months").notNull().default(3),
  planWeeks: integer("plan_weeks").notNull().default(13),
  planDays: integer("plan_days").notNull().default(90),
  cardFees: jsonb("card_fees").$type<CardFee[]>(),
  recommendedScenario: text("recommended_scenario").notNull().default("B"), // A | B | C
  passCardFeeDefault: boolean("pass_card_fee_default").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBudgetSettingsSchema = createInsertSchema(budgetSettingsTable).omit({ updatedAt: true });
export type InsertBudgetSettings = z.infer<typeof insertBudgetSettingsSchema>;
export type BudgetSettings = typeof budgetSettingsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Orcamentos persistidos com SNAPSHOT (foto) de itens, settings e totais.
// O snapshot evita que edicao futura de preco/parametro mude um orcamento ja
// apresentado/aceito. status: draft | presented | accepted | converted | cancelled
// ---------------------------------------------------------------------------
export type BudgetItemSnapshot = {
  catalogId: number | null;
  kind: string;
  name: string;
  dose: string | null;
  sessions: number;
  frequencyDays: number | null;
  unitPriceCents: number;
  include: boolean;
  substanceId: number | null;
};

export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  title: text("title"),
  status: text("status").notNull().default("draft"),
  items: jsonb("items").$type<BudgetItemSnapshot[]>().notNull().default([]),
  settingsSnapshot: jsonb("settings_snapshot"),
  totalsSnapshot: jsonb("totals_snapshot"),
  chosenScenario: text("chosen_scenario"), // A | B | C | free
  chosenDetail: jsonb("chosen_detail"),
  totalCents: integer("total_cents").notNull().default(0),
  liberarFrequencia: boolean("liberar_frequencia").notNull().default(false),
  repassarTaxa: boolean("repassar_taxa").notNull().default(false),
  createdBy: text("created_by"),
  presentedAt: timestamp("presented_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  convertedProtocolId: integer("converted_protocol_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;

// Tabela de taxas padrao (2x=5,59% subindo 0,60% por parcela ate 10x=10,39%).
export const DEFAULT_CARD_FEES: CardFee[] = Array.from({ length: 9 }, (_, i) => {
  const installments = i + 2; // 2..10
  return { installments, feePct: Math.round((5.59 + 0.6 * (installments - 2)) * 100) / 100 };
});
