import { pgTable, text, serial, integer, timestamp, boolean, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { whatsappMensagensLogTable } from "./whatsapp-log";

// ============================================================================
// LEMBRETE POR PERÍODO — motor cronobiológico portado do IHE (nativo).
//
// REGRA DE OURO: o disparo é POR JANELA/PERÍODO do dia, NUNCA por fórmula. Se
// várias fórmulas caem na mesma janela, o cliente recebe UMA mensagem listando
// todas. Nunca antes do horário; recuperação até a tolerância (5 min) depois.
//
// Manager é single-tenant: sem unidadeId, fuso fixo BRT (America/Sao_Paulo).
// ============================================================================

// Uma fórmula dentro de um período do lembrete.
export interface LembreteFormulaJson {
  nome: string;
  ativoPrincipal?: string;
  dose?: string;
  horario?: string; // HH:MM (BRT)
  observacaoRefeicao?: string;
  posologia?: string;
  // true = posologia DITADA à mão pelo CEO na Central de Lembretes; a
  // re-sincronização do Cockpit respeita e NÃO sobrescreve com a sugestão
  // automática do catálogo (ordem do CEO, 09/07/2026).
  posologiaManual?: boolean;
}

// Um período (janela) do lembrete, com suas fórmulas.
export interface LembretePeriodoJson {
  sigla?: string; // JE, IM, ... (opcional; nome é o que aparece na mensagem)
  nome: string; // ex.: "Início da Manhã"
  tipo: "tomar" | "nao_tomar";
  formulas: LembreteFormulaJson[];
}

export const lembretesPrescricaoTable = pgTable("lembretes_prescricao", {
  id: serial("id").primaryKey(),
  clienteId: integer("cliente_id")
    .notNull()
    .unique() // 1 lembrete por cliente — trava de idempotência do upsert do Cockpit.
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  ativo: boolean("ativo").notNull().default(true),
  // Override MANUAL do CEO (Opção B). null = segue o automático; false = desligado
  // à mão (vence sempre); true = ligado à mão. `ativo` efetivo nunca dispara
  // lembrete vazio: ativo = temItens && ativoManual !== false.
  ativoManual: boolean("ativo_manual"),
  periodos: jsonb("periodos").notNull().default([]).$type<LembretePeriodoJson[]>(),
  horariosEnvio: jsonb("horarios_envio").notNull().default([]).$type<string[]>(), // ["07:00","18:00"]
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLembretePrescricaoSchema = createInsertSchema(lembretesPrescricaoTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type LembretePrescricao = typeof lembretesPrescricaoTable.$inferSelect;
export type InsertLembretePrescricao = z.infer<typeof insertLembretePrescricaoSchema>;

// Registro de envio por janela — trava de idempotência (mesma janela nunca 2×).
export const lembreteEnviosTable = pgTable(
  "lembrete_envios",
  {
    id: serial("id").primaryKey(),
    lembreteId: integer("lembrete_id")
      .notNull()
      .references(() => lembretesPrescricaoTable.id, { onDelete: "cascade" }),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    janela: text("janela").notNull(), // YYYY-MM-DD HH:MM (BRT)
    status: text("status").notNull().default("PENDENTE"), // PENDENTE | ENVIADO | FALHOU
    erro: text("erro"),
    whatsappLogId: integer("whatsapp_log_id").references(() => whatsappMensagensLogTable.id, { onDelete: "set null" }),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqLembreteJanela: unique("uniq_lembrete_janela").on(t.lembreteId, t.janela),
  }),
);

export const insertLembreteEnvioSchema = createInsertSchema(lembreteEnviosTable).omit({
  id: true,
  createdAt: true,
});
export type LembreteEnvio = typeof lembreteEnviosTable.$inferSelect;
export type InsertLembreteEnvio = z.infer<typeof insertLembreteEnvioSchema>;
