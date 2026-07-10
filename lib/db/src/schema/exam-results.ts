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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ============================================================================
// Trajetoria do Exame Uploadado — Onda 2 (modelo de dados)
// Um laudo vira: 1 documento + N resultados (1 por analito por data por laboratorio).
// Catalogo canonico de analitos (com apelidos/aliases), faixas por analito e
// unidades por analito (nada hard-coded: tudo editavel por tela na onda de UI).
// ============================================================================

// 1 por arquivo recebido. hash garante idempotencia (mesmo arquivo nao duplica).
export const examDocumentsTable = pgTable(
  "exam_documents",
  {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  // Idempotencia POR PACIENTE: mesmo arquivo para o mesmo cliente nao duplica;
  // o mesmo arquivo em OUTRO cliente gera documento proprio (isolamento).
  hash: text("hash").notNull(),
  fileName: text("file_name").notNull(),
  labName: text("lab_name"),
  collectionDate: date("collection_date", { mode: "string" }),
  sourcePdfDriveId: text("source_pdf_drive_id"),
  // recebido | conferido (valor clinico so e verdade apos conferencia humana)
  status: text("status").notNull().default("recebido"),
  confidence: numeric("confidence"),
  modelUsed: text("model_used"),
  rawJson: jsonb("raw_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  conferredAt: timestamp("conferred_at", { withTimezone: true }),
  },
  (t) => ({
    uxDocClientHash: uniqueIndex("ux_exam_doc_client_hash").on(t.clientId, t.hash),
  }),
);

// 1 por analito por data por laboratorio. Suporta o "almoco gratis": cada data
// anterior que o proprio laudo traz vira uma linha aqui (coluna no comparativo).
export const examResultsTable = pgTable(
  "exam_results",
  {
    id: serial("id").primaryKey(),
    examDocumentId: integer("exam_document_id").notNull(),
    clientId: integer("client_id").notNull(),
    // codigo canonico do catalogo; nulo enquanto nao casado (conferencia resolve)
    analyteCode: text("analyte_code"),
    analyteNameRaw: text("analyte_name_raw").notNull(),
    valueRaw: text("value_raw"),
    unitRaw: text("unit_raw"),
    valueCanonical: numeric("value_canonical"),
    unitCanonical: text("unit_canonical"),
    refLow: numeric("ref_low"),
    refHigh: numeric("ref_high"),
    // dentro | acima | abaixo | conferencia (sem conversao conhecida -> conferencia)
    status: text("status"),
    collectionDate: date("collection_date", { mode: "string" }),
    labName: text("lab_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotencia do comparativo por (cliente + data + laboratorio + nome cru).
    // Obs.: NULL nao colide em UNIQUE no Postgres; o guard principal de duplicidade
    // e o hash do documento. Este indice evita repetir a mesma linha do mesmo laudo.
    uxResultDedup: uniqueIndex("ux_exam_result_dedup").on(
      t.clientId,
      t.collectionDate,
      t.labName,
      t.analyteNameRaw,
    ),
  }),
);

// Catalogo canonico de analitos de SANGUE. synonyms = apelidos/aliases editaveis.
export const examAnalyteCatalogTable = pgTable("exam_analyte_catalog", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  displayName: text("display_name").notNull(),
  // lista de apelidos (ex.: ["A1C", "HbA1c", "Glico-Hb"]) — fonte da busca em paralelo
  synonyms: jsonb("synonyms").$type<string[]>().notNull().default([]),
  // unidade canonica derivada da unidade marcada isCanonical em exam_analyte_units
  canonicalUnit: text("canonical_unit"),
  molarMass: numeric("molar_mass"),
  // higher_better | lower_better | target
  direction: text("direction"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Faixas por analito (liga ao Subcadastro de faixas/cores).
export const examAnalyteRangesTable = pgTable("exam_analyte_ranges", {
  id: serial("id").primaryKey(),
  analyteCode: text("analyte_code").notNull(),
  faixaName: text("faixa_name").notNull(),
  low: numeric("low"),
  high: numeric("high"),
  color: text("color"),
  ordem: integer("ordem").notNull().default(0),
});

// Unidades por analito — nada hard-coded. Uma marcada como isCanonical (nossa
// convencao); as outras convertem para ela por fator OU formula; toggle active.
export const examAnalyteUnitsTable = pgTable(
  "exam_analyte_units",
  {
    id: serial("id").primaryKey(),
    analyteCode: text("analyte_code").notNull(),
    unit: text("unit").notNull(),
    factorToCanonical: numeric("factor_to_canonical"),
    formulaKey: text("formula_key"),
    isCanonical: boolean("is_canonical").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => ({
    uxAnalyteUnit: uniqueIndex("ux_exam_analyte_unit").on(t.analyteCode, t.unit),
  }),
);

// ---- Insert schemas + tipos ----
export const insertExamDocumentSchema = createInsertSchema(examDocumentsTable).omit({
  id: true,
  createdAt: true,
});
export const insertExamResultSchema = createInsertSchema(examResultsTable).omit({
  id: true,
  createdAt: true,
});
export const insertExamAnalyteCatalogSchema = createInsertSchema(examAnalyteCatalogTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertExamAnalyteRangeSchema = createInsertSchema(examAnalyteRangesTable).omit({
  id: true,
});
export const insertExamAnalyteUnitSchema = createInsertSchema(examAnalyteUnitsTable).omit({
  id: true,
});

export type ExamDocument = typeof examDocumentsTable.$inferSelect;
export type InsertExamDocument = z.infer<typeof insertExamDocumentSchema>;
export type ExamResult = typeof examResultsTable.$inferSelect;
export type InsertExamResult = z.infer<typeof insertExamResultSchema>;
export type ExamAnalyteCatalog = typeof examAnalyteCatalogTable.$inferSelect;
export type InsertExamAnalyteCatalog = z.infer<typeof insertExamAnalyteCatalogSchema>;
export type ExamAnalyteRange = typeof examAnalyteRangesTable.$inferSelect;
export type InsertExamAnalyteRange = z.infer<typeof insertExamAnalyteRangeSchema>;
export type ExamAnalyteUnit = typeof examAnalyteUnitsTable.$inferSelect;
export type InsertExamAnalyteUnit = z.infer<typeof insertExamAnalyteUnitSchema>;
