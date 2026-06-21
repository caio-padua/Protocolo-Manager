import {
  pgTable,
  text,
  serial,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { anamneseQuestionarioTable } from "./motor";

// =============================================================================
// ANAMNESE V2 — sessao dinamica/progressiva do portal do paciente.
// Spec: specs/anamnese-v2/. Convive EM PARALELO com o legado (anamnese_resposta);
// nao apaga nada. Chave da resposta = questionRowId (FK estavel), nunca o
// codigo semantico (perguntaId e nullable/repetido no schema atual).
// =============================================================================

// ---- Sessao de preenchimento (uma por link/token) ----
export const anamneseSessionsTable = pgTable("anamnese_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: integer("client_id"),
  mode: text("mode").notNull().default("paciente"), // paciente | enfermeira | medico
  conductedBy: integer("conducted_by"),
  status: text("status").notNull().default("rascunho"), // rascunho | concluida
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  tempoTotalSeg: integer("tempo_total_seg").notNull().default(0),
  percentResumo: jsonb("percent_resumo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Resposta por pergunta (chave natural: sessionId + questionRowId) ----
export const anamneseSessionAnswersTable = pgTable(
  "anamnese_session_answers",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => anamneseSessionsTable.id, { onDelete: "cascade" }),
    questionRowId: integer("question_row_id")
      .notNull()
      .references(() => anamneseQuestionarioTable.id),
    perguntaId: text("pergunta_id"), // redundancia legivel; NUNCA chave
    valor: jsonb("valor").notNull(), // contrato por tipo (spec 01 secao 3.1)
    respondidoEm: timestamp("respondido_em", { withTimezone: true }).notNull().defaultNow(),
    tempoSeg: integer("tempo_seg").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("anamnese_v2_answer_uq").on(t.sessionId, t.questionRowId)],
);

// ---- Recusa de bloco/grupo (registrada p/ medico + RAS) ----
export const anamneseRefusalsTable = pgTable(
  "anamnese_refusals",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => anamneseSessionsTable.id, { onDelete: "cascade" }),
    escopo: text("escopo").notNull(), // bloco | grupo
    alvo: text("alvo").notNull(),
    motivo: text("motivo"),
    registradoEm: timestamp("registrado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("anamnese_v2_refusal_uq").on(t.sessionId, t.escopo, t.alvo)],
);

// ---- Achados produzidos pelo ADAPTER (fora do motor). origemPerguntaId notNull
//      default '' p/ o unique deduplicar (NULL nao colide em UNIQUE no Postgres). --
export const anamneseFindingsTable = pgTable(
  "anamnese_findings",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => anamneseSessionsTable.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // diagnosticado | suspeito
    rotulo: text("rotulo").notNull(),
    origemPerguntaId: text("origem_pergunta_id").notNull().default(""),
    severidade: text("severidade"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("anamnese_v2_finding_uq").on(t.sessionId, t.tipo, t.rotulo, t.origemPerguntaId)],
);

// ---- Observacao por grupo (enfermeira/medico, modo conduzido) ----
export const anamneseGroupNotesTable = pgTable("anamnese_group_notes", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => anamneseSessionsTable.id, { onDelete: "cascade" }),
  grupo: text("grupo").notNull(),
  autorProfId: integer("autor_prof_id"),
  observacao: text("observacao").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAnamneseSessionSchema = createInsertSchema(anamneseSessionsTable).omit({
  id: true,
  token: true,
  createdAt: true,
  updatedAt: true,
  lastSeenAt: true,
  startedAt: true,
});

export type AnamneseSessionRow = typeof anamneseSessionsTable.$inferSelect;
export type AnamneseSessionAnswerRow = typeof anamneseSessionAnswersTable.$inferSelect;
export type AnamneseRefusalRow = typeof anamneseRefusalsTable.$inferSelect;
export type AnamneseFindingRow = typeof anamneseFindingsTable.$inferSelect;
export type AnamneseGroupNoteRow = typeof anamneseGroupNotesTable.$inferSelect;
export type InsertAnamneseSession = z.infer<typeof insertAnamneseSessionSchema>;
