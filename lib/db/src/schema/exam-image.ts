import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  boolean,
  jsonb,
  date,
  timestamp,
  uniqueIndex,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { examDocumentsTable } from "./exam-results";

// ============================================================================
// Trajetoria do Exame Uploadado — Trilha de IMAGEM (modelo de dados)
// Laudo de imagem e texto livre descritivo (USG, RMN...). A IA extrai os achados
// para CAMPOS FIXOS de um "painel" (molde) por tipo de exame. Nada hard-coded:
// painel, campos e apelidos sao editaveis por tela na onda de UI.
// O documento (exam_documents) e COMPARTILHADO com a trilha de sangue: um mesmo
// PDF "conjugado" pode gerar resultados de sangue E achados de imagem.
// ============================================================================

// Catalogo de PAINEIS (tipos de exame de imagem). code = chave de negocio estavel.
// synonyms = apelidos do TIPO de exame (classificacao por conteudo, nunca por nome
// de arquivo): ex.: ["ultrassonografia da tireoide", "usg tireoide", "tireoide com doppler"].
export const examImagePanelsTable = pgTable("exam_image_panels", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  displayName: text("display_name").notNull(),
  // setor/aba do cockpit: ultrassom | ressonancia | tomografia | densitometria | ...
  sector: text("sector").notNull(),
  synonyms: jsonb("synonyms").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Campos FIXOS de cada painel (editaveis). aliases = apelidos do CAMPO para a IA
// achar o achado no texto livre (ex.: campo "lobo_direito" -> ["lobo direito", "LD"]).
// perLevel = campo se repete por nivel (RMN de coluna: L1-L2 ... L5-S1).
export const examImagePanelFieldsTable = pgTable(
  "exam_image_panel_fields",
  {
    id: serial("id").primaryKey(),
    panelCode: text("panel_code")
      .notNull()
      .references(() => examImagePanelsTable.code),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    // text | number | boolean | enum | measurement
    valueType: text("value_type").notNull().default("text"),
    unit: text("unit"),
    perLevel: boolean("per_level").notNull().default(false),
    enumOptions: jsonb("enum_options").$type<string[]>(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    ordem: integer("ordem").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => ({
    // UNIQUE constraint (nao so indice) para servir de alvo de chave estrangeira composta.
    uxPanelField: unique("ux_exam_image_panel_field").on(t.panelCode, t.fieldKey),
  }),
);

// 1 achado por documento por painel por campo (por nivel, quando perLevel).
// value guardado como jsonb (texto, numero, booleano ou medida estruturada).
// Suporta "almoco gratis": comparativo/datas anteriores do proprio laudo.
export const examImageFindingsTable = pgTable(
  "exam_image_findings",
  {
    id: serial("id").primaryKey(),
    examDocumentId: integer("exam_document_id")
      .notNull()
      .references(() => examDocumentsTable.id),
    clientId: integer("client_id").notNull(),
    panelCode: text("panel_code").notNull(),
    fieldKey: text("field_key").notNull(),
    // nivel anatomico para campos perLevel (ex.: "L4-L5"); nulo se nao se aplica
    level: text("level"),
    value: jsonb("value"),
    // valor cru extraido + trecho de origem do laudo (auditoria da conferencia)
    rawValue: text("raw_value"),
    sourceSnippet: text("source_snippet"),
    // conferencia humana POR ACHADO: extraido | conferido | rejeitado
    status: text("status").notNull().default("extraido"),
    confidence: numeric("confidence"),
    conferredBy: text("conferred_by"),
    conferredAt: timestamp("conferred_at", { withTimezone: true }),
    collectionDate: date("collection_date", { mode: "string" }),
    labName: text("lab_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotencia ROBUSTA: COALESCE elimina o buraco do NULL (NULL nao colide em
    // UNIQUE no Postgres). Mesma celula logica (cliente+painel+campo+nivel+data+lab)
    // nao duplica no reprocessamento, mesmo vinda de documentos diferentes (merge do
    // comparativo / "almoco gratis").
    uxImageFindingDedup: uniqueIndex("ux_exam_image_finding_dedup").on(
      t.clientId,
      t.panelCode,
      t.fieldKey,
      sql`coalesce(${t.level}, '')`,
      sql`coalesce(${t.collectionDate}, '0001-01-01')`,
      sql`coalesce(${t.labName}, '')`,
    ),
    // Integridade referencial: todo achado aponta para um campo real de um painel real.
    fkFindingField: foreignKey({
      columns: [t.panelCode, t.fieldKey],
      foreignColumns: [examImagePanelFieldsTable.panelCode, examImagePanelFieldsTable.fieldKey],
      name: "fk_exam_image_finding_field",
    }),
  }),
);

// ---- Insert schemas + tipos ----
export const insertExamImagePanelSchema = createInsertSchema(examImagePanelsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertExamImagePanelFieldSchema = createInsertSchema(examImagePanelFieldsTable).omit({
  id: true,
});
export const insertExamImageFindingSchema = createInsertSchema(examImageFindingsTable).omit({
  id: true,
  createdAt: true,
});

export type ExamImagePanel = typeof examImagePanelsTable.$inferSelect;
export type InsertExamImagePanel = z.infer<typeof insertExamImagePanelSchema>;
export type ExamImagePanelField = typeof examImagePanelFieldsTable.$inferSelect;
export type InsertExamImagePanelField = z.infer<typeof insertExamImagePanelFieldSchema>;
export type ExamImageFinding = typeof examImageFindingsTable.$inferSelect;
export type InsertExamImageFinding = z.infer<typeof insertExamImageFindingSchema>;
