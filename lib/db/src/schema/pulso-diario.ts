import {
  pgTable,
  text,
  serial,
  integer,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

// ============================================================================
// PULSO DIÁRIO — acompanhamento diário reportado pelo CLIENTE.
//
// O serviço de mensageria (WhatsApp/Twilio) pergunta ao cliente, por PERÍODO do
// dia (manha/tarde/noite), como ele está: energia, disposição, sono, pressão
// arterial e glicemia. Cada resposta vira uma linha aqui (uma por cliente/dia/
// período). O Cockpit da Consulta mostra esses dados numa faixa no cabeçalho.
//
// NATIVO (sem tag de origem). A CAPTURA inbound (receber a resposta pelo
// WhatsApp e gravar) é fase futura: por ora o motor GRAVA via POST (usado para
// semear a demonstração) e LÊ via GET.
// ============================================================================

export const pulsoDiarioTable = pgTable(
  "pulso_diario",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    data: date("data", { mode: "string" }).notNull(), // YYYY-MM-DD (dia do registro)
    periodo: text("periodo").notNull(), // manha | tarde | noite
    energia: integer("energia"), // 0..10
    disposicao: integer("disposicao"), // 0..10
    sono: integer("sono"), // 0..10 (qualidade do sono, tipicamente de manhã)
    pressaoSistolica: integer("pressao_sistolica"), // mmHg
    pressaoDiastolica: integer("pressao_diastolica"), // mmHg
    glicemia: integer("glicemia"), // mg/dL
    humor: text("humor"), // palavra/emoji curto opcional
    observacao: text("observacao"),
    origem: text("origem").notNull().default("whatsapp"), // whatsapp | manual | demo
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("pulso_diario_cliente_data_periodo_uk").on(t.clienteId, t.data, t.periodo)],
);

export const insertPulsoDiarioSchema = createInsertSchema(pulsoDiarioTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PulsoDiario = typeof pulsoDiarioTable.$inferSelect;
export type InsertPulsoDiario = z.infer<typeof insertPulsoDiarioSchema>;
