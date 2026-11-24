import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sinapsesClinicasPropostasTable = pgTable(
  "sinapses_clinicas_propostas",
  {
    id: serial("id").primaryKey(),
    perguntaId: text("pergunta_id").notNull(),
    categoria: text("categoria").notNull(),
    destinoTipo: text("destino_tipo").notNull(),
    destinoId: integer("destino_id").notNull(),
    eixo: text("eixo").notNull(),
    justificativa: text("justificativa").notNull(),
    status: text("status").notNull().default("PENDENTE"),
    criadoPor: integer("criado_por"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "sinapses_clinicas_propostas_status_check",
      sql`${t.status} IN ('PENDENTE', 'APROVADA', 'RECUSADA')`,
    ),
    unique("sinapses_clinicas_propostas_uk").on(
      t.perguntaId,
      t.categoria,
      t.destinoTipo,
      t.destinoId,
    ),
    index("sinapses_clinicas_propostas_status_idx").on(t.status, t.id),
  ],
);

export type SinapseClinicaProposta =
  typeof sinapsesClinicasPropostasTable.$inferSelect;
