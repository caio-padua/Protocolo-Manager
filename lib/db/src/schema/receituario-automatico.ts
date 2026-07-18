import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

// ============================================================================
// RECEITUÁRIO AUTOMÁTICO — Agenda de Receitas de Fórmulas Magistrais
//
// Fluxo: médico pré-cadastra todas as receitas de um protocolo (agenda) numa
// linha do tempo. Worker diário libera cada slot na data programada, gera PDF
// assinado ICP-Brasil e entrega por email, WhatsApp, Telegram, Drive e portal.
// ============================================================================

export interface SlotFormula {
  nome: string;
  catalogId?: string;       // referência ao catálogo de fórmulas magistrais
  ativoPrincipal?: string;
  posologia?: string;
  dose?: string;
  via?: string;
  frequencia?: string;
  observacao?: string;
  isControlled?: boolean;
  anvisaType?: string;
}

// Uma "agenda" agrupa todos os slots de receita de um protocolo/cliente.
export const receitasAgendadasTable = pgTable("receitas_agendadas", {
  id: serial("id").primaryKey(),

  // Vínculo
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  protocolId: integer("protocol_id"), // FK lógica → protocols (opcional)

  // Identificação
  nome: text("nome").notNull(),
  descricao: text("descricao"),

  // Configuração global da agenda
  ativo: boolean("ativo").notNull().default(true),
  frequenciaPadraoDias: integer("frequencia_padrao_dias").notNull().default(30),
  diasAntecedencia: integer("dias_antecedencia").notNull().default(5),

  // Canais padrão: email | whatsapp | telegram | drive | portal
  canaisPadrao: jsonb("canais_padrao")
    .$type<string[]>()
    .default(["email", "whatsapp", "portal"]),

  // Integração com motor de lembretes de posologia
  incluirLembretePosologia: boolean("incluir_lembrete_posologia").notNull().default(true),

  empresaId: integer("empresa_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Cada slot = uma receita agendada para uma data específica.
export const receitasAgendadasSlotsTable = pgTable("receitas_agendadas_slots", {
  id: serial("id").primaryKey(),

  // Vínculo
  agendaId: integer("agenda_id").notNull(),
  clientId: integer("client_id").notNull(), // denormalizado para queries rápidas

  // Ordenação
  numeroSequencia: integer("numero_sequencia").notNull().default(1),

  // Identificação
  nome: text("nome").notNull(), // nome personalizado ou nome da fórmula

  // Programação
  dataLiberacao: text("data_liberacao").notNull(), // YYYY-MM-DD (BRT)
  diasAntecedenciaOverride: integer("dias_antecedencia_override"), // override por slot

  // Fórmulas magistrais do slot
  formulas: jsonb("formulas").$type<SlotFormula[]>().notNull().default([]),

  // Resultado da liberação
  prescriptionId: integer("prescription_id"),
  recipeId: integer("recipe_id"),
  pdfUrl: text("pdf_url"),
  driveFileId: text("drive_file_id"),
  driveWebViewLink: text("drive_web_view_link"),

  // Canais de entrega (null = herda da agenda)
  canais: jsonb("canais").$type<string[]>(),

  // Status do ciclo de vida
  // AGUARDANDO → LIBERADA (PDF gerado) → ENTREGUE (enviado) | ERRO
  status: text("status").notNull().default("AGUARDANDO"),

  // Timestamps de entrega por canal
  enviadoEmailEm:    timestamp("enviado_email_em",    { withTimezone: true }),
  enviadoWhatsappEm: timestamp("enviado_whatsapp_em", { withTimezone: true }),
  enviadoTelegramEm: timestamp("enviado_telegram_em", { withTimezone: true }),
  enviadoDriveEm:    timestamp("enviado_drive_em",    { withTimezone: true }),
  disponivelPortalEm: timestamp("disponivel_portal_em", { withTimezone: true }),

  // Erro e tentativas
  erro: text("erro"),
  tentativas: integer("tentativas").notNull().default(0),
  ultimaTentativaEm: timestamp("ultima_tentativa_em", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── Schemas Zod + tipos ────────────────────────────────────────────────────

export const insertReceitaAgendadaSchema = createInsertSchema(receitasAgendadasTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertReceitaAgendadaSlotSchema = createInsertSchema(receitasAgendadasSlotsTable).omit({
  id: true, createdAt: true, updatedAt: true,
  prescriptionId: true, recipeId: true, pdfUrl: true,
  driveFileId: true, driveWebViewLink: true,
  enviadoEmailEm: true, enviadoWhatsappEm: true,
  enviadoTelegramEm: true, enviadoDriveEm: true,
  disponivelPortalEm: true, erro: true, tentativas: true, ultimaTentativaEm: true,
});

export type ReceitaAgendada        = typeof receitasAgendadasTable.$inferSelect;
export type InsertReceitaAgendada  = z.infer<typeof insertReceitaAgendadaSchema>;
export type ReceitaAgendadaSlot    = typeof receitasAgendadasSlotsTable.$inferSelect;
export type InsertReceitaAgendadaSlot = z.infer<typeof insertReceitaAgendadaSlotSchema>;
