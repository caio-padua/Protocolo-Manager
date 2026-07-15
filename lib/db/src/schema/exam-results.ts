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
  // Proveniencia do documento: como/onde ele entrou no sistema.
  // origin: portal | upload | drive-import (importacao em massa do Drive)
  origin: text("origin"),
  // caminho de origem no Drive (ex.: "LUCIANO XAVIER MANHOZO / EXAMES")
  sourcePath: text("source_path"),
  // tipo do laudo detectado por CONTEUDO: lab | imagem (nunca por nome de arquivo)
  examKind: text("exam_kind"),
  // recebido -> conferido_1 (C1 operacional) -> conferido (C2 clinica = liberado).
  // O valor clinico so e verdade apos a conferencia humana (2 fases). Documentos
  // legados ja em "conferido" continuam validos (tratados como C2 concluido).
  status: text("status").notNull().default("recebido"),
  confidence: numeric("confidence"),
  modelUsed: text("model_used"),
  rawJson: jsonb("raw_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  conferredAt: timestamp("conferred_at", { withTimezone: true }),
  // Conferencia em 2 fases (snapshot para auditoria: guarda nome + cargo do
  // conferente no momento, para o CEO poder renomear os ficticios depois sem
  // perder o registro). Todas anulaveis (push seguro, sem truncate).
  conf1ProfessionalId: integer("conf1_professional_id"),
  conf1Name: text("conf1_name"),
  conf1Cargo: text("conf1_cargo"),
  conf1At: timestamp("conf1_at", { withTimezone: true }),
  conf2ProfessionalId: integer("conf2_professional_id"),
  conf2Name: text("conf2_name"),
  conf2Cargo: text("conf2_cargo"),
  conf2At: timestamp("conf2_at", { withTimezone: true }),
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
    // true quando a unidade do laudo diferiu da nossa canonica e o valor foi
    // convertido por fator conhecido (exam_analyte_units) -> mostra selo "revisado".
    unitConverted: boolean("unit_converted").notNull().default(false),
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
  // true quando as faixas de referencia deste analito variam por sexo
  // (hormonios sexo-dependentes). Liga o toggle na tela e diz ao leitor de
  // resultado para escolher o conjunto de faixas conforme o sexo do cliente.
  sexDependent: boolean("sex_dependent").notNull().default(false),
  // natureza do registro: blood (analito de sangue/soro/urina — padrao),
  // imaging (medida de laudo de imagem), body_composition (bioimpedancia/
  // antropometria) ou fragment (pedaco de laudo que virou "exame" por engano).
  // So kind='blood' entra na lista de analitos por padrao.
  kind: text("kind").notNull().default("blood"),
  active: boolean("active").notNull().default(true),
  // Lixeira reversivel do Console: preenchido SO quando o usuario clicou
  // "Ignorar (nao e exame)". Distingue da desativacao do Englobar (que tambem
  // usa active=false) e dos fragments legados. Restaurar limpa este campo e
  // reativa SEM mexer no kind (fidelidade total ao estado anterior).
  ignoredAt: timestamp("ignored_at", { withTimezone: true }),
  // Proveniencia do cadastro (selo de ORIGEM na tela):
  //   "catalogo"   -> exame da nossa base oficial (os 57 semeados)
  //   "descoberto" -> garimpado de um laudo e criado automaticamente pela Triagem
  origin: text("origin").notNull().default("catalogo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Sala de Triagem — fila de grafias cruas que a Triagem NAO resolveu sozinha.
// So caem aqui os casos "ambiguo" (parece variante de exame existente -> conferencia
// humana) e "nao_exame" (bioimpedancia/subitem -> ignorar por padrao). Apelido de
// alta confianca e exame novo distinto sao aplicados automaticamente e NAO entram aqui.
// Idempotente por normKey (mesma grafia nao gera duas linhas). Zero perda: nenhuma
// grafia crua fica sem destino (vira apelido, cadastro novo, ou linha aqui).
export const examAnalyteTriagemTable = pgTable("exam_analyte_triagem", {
  id: serial("id").primaryKey(),
  // chave canonica (normalizeAnalyteName da grafia crua) — dedup da fila
  normKey: text("norm_key").notNull().unique(),
  // grafia crua representativa (a mais curta vista)
  sampleName: text("sample_name").notNull(),
  occurrences: integer("occurrences").notNull().default(0),
  // ambiguo | nao_exame
  kind: text("kind").notNull(),
  // melhor palpite de exame do catalogo (so para ambiguo)
  suggestedCode: text("suggested_code"),
  reason: text("reason"),
  // pendente | resolvido
  status: text("status").notNull().default("pendente"),
  // apelido | novo | ignorado (preenchido ao resolver)
  resolution: text("resolution"),
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
  // dimensao de sexo da faixa: 'any' (padrao, faixa unica) | 'male' | 'female'.
  // A chave logica da faixa passa a ser (analyte_code + sex + ordem). Nao muda
  // chaveFaixa (continua amarrando por analyte_code); sex e dimensao interna.
  sex: text("sex").notNull().default("any"),
  // origem da faixa: "seed" (curadoria semeada no boot) | "manual" (editada pelo
  // medico via planilha/DirecaoExamesTool). O seeder so recria faixa quando a
  // chave esta vazia; a marca de origem alimenta a flag "tem edicao manual".
  source: text("source").notNull().default("manual"),
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

// Trilha de auditoria das ferramentas de curadoria (ENGLOBAR / TRANSFERIR).
// 1 linha POR resultado afetado; batchId agrupa uma operação para permitir DESFAZER.
// Guarda o ESTADO ANTERIOR completo do resultado (para restaurar fielmente).
export const examResultReassignmentsTable = pgTable("exam_result_reassignments", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  // "englobar" | "transferir"
  operation: text("operation").notNull(),
  sourceCode: text("source_code"),
  targetCode: text("target_code").notNull(),
  resultId: integer("result_id").notNull(),
  clientId: integer("client_id"),
  examDocumentId: integer("exam_document_id"),
  // Estado ANTERIOR do resultado (para desfazer).
  prevAnalyteCode: text("prev_analyte_code"),
  prevValueCanonical: numeric("prev_value_canonical"),
  prevUnitCanonical: text("prev_unit_canonical"),
  prevRefLow: numeric("prev_ref_low"),
  prevRefHigh: numeric("prev_ref_high"),
  prevStatus: text("prev_status"),
  prevUnitConverted: boolean("prev_unit_converted").notNull().default(false),
  // Snapshot do lote (só na 1ª linha do batch): estado do catálogo afetado no englobar.
  // { sourceWasActive: bool, aliasesAdded: string[] } — usado no desfazer.
  catalogSnapshot: jsonb("catalog_snapshot").$type<{
    sourceWasActive?: boolean;
    aliasesAdded?: string[];
  } | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
});

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
export const insertExamAnalyteTriagemSchema = createInsertSchema(examAnalyteTriagemTable).omit({
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
export type ExamAnalyteTriagem = typeof examAnalyteTriagemTable.$inferSelect;
export type InsertExamAnalyteTriagem = z.infer<typeof insertExamAnalyteTriagemSchema>;
export type ExamAnalyteRange = typeof examAnalyteRangesTable.$inferSelect;
export type InsertExamAnalyteRange = z.infer<typeof insertExamAnalyteRangeSchema>;
export type ExamAnalyteUnit = typeof examAnalyteUnitsTable.$inferSelect;
export type InsertExamAnalyteUnit = z.infer<typeof insertExamAnalyteUnitSchema>;
