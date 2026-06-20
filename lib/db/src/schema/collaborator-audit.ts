import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Trilha de auditoria do Portao do Colaborador (Onda 8.2). Registra QUEM entrou
// e o QUE fez. A decisao do CEO pela identidade por colaborador (e nao senha
// unica) existe justamente para alimentar esta tabela. Snapshot do nome para
// sobreviver a renome/remocao do profissional.
export const collaboratorAuditTable = pgTable("collaborator_audit", {
  id: serial("id").primaryKey(),
  professionalId: integer("professional_id"), // nulo em login_fail
  professionalName: text("professional_name"),
  action: text("action").notNull(), // 'login_ok' | 'login_fail' | 'write'
  method: text("method"), // GET/POST/PUT/PATCH/DELETE (nas escritas)
  path: text("path"),
  detail: jsonb("detail"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCollaboratorAuditSchema = createInsertSchema(
  collaboratorAuditTable,
).omit({ id: true, createdAt: true });
export type InsertCollaboratorAudit = z.infer<
  typeof insertCollaboratorAuditSchema
>;
export type CollaboratorAudit = typeof collaboratorAuditTable.$inferSelect;
