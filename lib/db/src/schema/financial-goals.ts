import { pgTable, serial, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Metas de faturamento por período. targetAmount é numeric(12,2) (dinheiro —
// nunca float). Realizado é calculado por SUM em SQL sobre payments pagos.
export const financialGoalsTable = pgTable(
  "financial_goals",
  {
    id: serial("id").primaryKey(),
    // 'month' | 'semester' | 'year'
    periodType: text("period_type").notNull(),
    // '2026-06' (mês) | '2026-S1' (semestre) | '2026' (ano)
    periodKey: text("period_key").notNull(),
    targetAmount: numeric("target_amount", { precision: 12, scale: 2 }).notNull(),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    periodUq: uniqueIndex("financial_goals_period_uq").on(t.periodType, t.periodKey),
  }),
);

export type FinancialGoal = typeof financialGoalsTable.$inferSelect;
