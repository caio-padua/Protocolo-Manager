import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

// ============================================================================
// MOTOR DE MENSAGERIA INTELIGENTE — ONDA E do Master Loop Paxter.
//
// O Cockpit da Consulta, ao "Finalizar e Emitir Tudo", AGENDA lembretes
// automaticos do cliente: fórmulas prescritas, alertas de exames e injetaveis.
// Cada lembrete tem um PERIODO do dia (manha/tarde/noite) e um DIA DA SEMANA
// (0=domingo .. 6=sabado, ou null = todos os dias). Um worker/cron chama
// POST /api/mensageria/processar para disparar os lembretes vencidos via Twilio
// (WhatsApp). Quando o Twilio nao esta configurado, fica registrado como link.
//
// O dado entra NATIVO (sem tag de origem). Nenhuma estetica muda o motor.
// ============================================================================

export const mensageriaLembreteTable = pgTable("mensageria_lembrete", {
  id: serial("id").primaryKey(),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(), // formula | exame | injetavel
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem").notNull(),
  periodo: text("periodo").notNull(), // manha | tarde | noite
  diaSemana: integer("dia_semana"), // 0..6 ou null = todos os dias
  proximoEnvio: timestamp("proximo_envio", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull().default("agendado"), // agendado | enviado | cancelado
  via: text("via"), // twilio | link | null
  telefone: text("telefone"),
  enviadoEm: timestamp("enviado_em", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMensageriaLembreteSchema = createInsertSchema(mensageriaLembreteTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MensageriaLembrete = typeof mensageriaLembreteTable.$inferSelect;
export type InsertMensageriaLembrete = z.infer<typeof insertMensageriaLembreteSchema>;
