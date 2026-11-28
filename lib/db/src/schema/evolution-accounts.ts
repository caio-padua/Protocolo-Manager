import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";
import { professionalsTable } from "./professionals";

const ACCOUNT_KEYS = ["pessoal_proprietario", "terceira"] as const;

export const evolutionAccountIdentitiesTable = pgTable(
  "evolution_conta_identidades",
  {
    accountId: uuid("account_id").defaultRandom().primaryKey(),
    accountKey: text("account_key").$type<(typeof ACCOUNT_KEYS)[number]>().notNull(),
    ownerProfessionalId: integer("owner_professional_id").notNull(),
    baseUrl: text("base_url"),
    instanceName: text("instance_name"),
    connectionEnabled: boolean("connection_enabled").notNull().default(false),
    captureEnabled: boolean("capture_enabled").notNull().default(false),
    learningEnabled: boolean("learning_enabled").notNull().default(false),
    repliesEnabled: boolean("replies_enabled").notNull().default(false),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer("atualizado_por"),
  },
  (table) => [
    foreignKey({
      name: "evolution_conta_identidades_owner_fk",
      columns: [table.ownerProfessionalId],
      foreignColumns: [professionalsTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "evolution_conta_identidades_updated_by_fk",
      columns: [table.updatedBy],
      foreignColumns: [professionalsTable.id],
    }).onDelete("restrict"),
    check(
      "evolution_conta_identidades_account_key_check",
      sql`${table.accountKey} IN ('pessoal_proprietario', 'terceira')`,
    ),
    unique("evolution_conta_identidades_account_key_uk").on(
      table.accountId,
      table.accountKey,
    ),
    unique("evolution_conta_identidades_owner_key_uk").on(
      table.ownerProfessionalId,
      table.accountKey,
    ),
    uniqueIndex("evolution_conta_identidade_instancia_uk")
      .on(sql`lower(${table.baseUrl})`, table.instanceName)
      .where(sql`${table.baseUrl} IS NOT NULL AND ${table.instanceName} IS NOT NULL`),
  ],
);

export const evolutionAccountClinicsTable = pgTable(
  "evolution_conta_clinicas",
  {
    accountId: uuid("account_id").notNull(),
    accountKey: text("account_key").$type<(typeof ACCOUNT_KEYS)[number]>().notNull(),
    companyId: integer("empresa_id").notNull(),
    active: boolean("active").notNull().default(true),
    authorizedBy: integer("autorizado_por").notNull(),
    authorizedAt: timestamp("autorizado_em", { withTimezone: true }).notNull().defaultNow(),
    revokedBy: integer("revogado_por"),
    revokedAt: timestamp("revogado_em", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "evolution_conta_clinicas_empresa_fk",
      columns: [table.companyId],
      foreignColumns: [empresasTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "evolution_conta_clinicas_authorized_by_fk",
      columns: [table.authorizedBy],
      foreignColumns: [professionalsTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "evolution_conta_clinicas_revoked_by_fk",
      columns: [table.revokedBy],
      foreignColumns: [professionalsTable.id],
    }).onDelete("restrict"),
    primaryKey({
      name: "evolution_conta_clinicas_pkey",
      columns: [table.accountId, table.companyId],
    }),
    unique("evolution_conta_clinicas_empresa_key_uk").on(
      table.companyId,
      table.accountKey,
    ),
    foreignKey({
      name: "evolution_conta_clinicas_account_key_fk",
      columns: [table.accountId, table.accountKey],
      foreignColumns: [
        evolutionAccountIdentitiesTable.accountId,
        evolutionAccountIdentitiesTable.accountKey,
      ],
    }).onDelete("restrict"),
    check(
      "evolution_conta_clinicas_account_key_check",
      sql`${table.accountKey} IN ('pessoal_proprietario', 'terceira')`,
    ),
    check(
      "evolution_conta_clinicas_revocation_check",
      sql`(${table.active} AND ${table.revokedAt} IS NULL) OR (NOT ${table.active} AND ${table.revokedAt} IS NOT NULL)`,
    ),
    index("evolution_conta_clinicas_empresa_active_idx")
      .on(table.companyId, table.accountKey)
      .where(sql`${table.active} = TRUE`),
  ],
);

export const evolutionAccountMessagesTable = pgTable(
  "evolution_conta_mensagens_identidade",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    accountId: uuid("account_id").notNull(),
    baseUrl: text("base_url").notNull(),
    instanceName: text("instance_name").notNull(),
    providerId: text("provider_id").notNull(),
    direction: text("direction").notNull(),
    contact: text("contact").notNull(),
    body: text("body").notNull(),
    fromMe: boolean("from_me").notNull(),
    provenance: text("provenance").notNull().default("nao_classificada"),
    status: text("status").notNull().default("recebida"),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "evolution_conta_mensagens_account_fk",
      columns: [table.accountId],
      foreignColumns: [evolutionAccountIdentitiesTable.accountId],
    }).onDelete("restrict"),
    check(
      "evolution_conta_mensagens_direction_check",
      sql`${table.direction} IN ('entrada', 'saida')`,
    ),
    check(
      "evolution_conta_mensagens_provenance_check",
      sql`${table.provenance} = 'nao_classificada'`,
    ),
    unique("evolution_conta_mensagens_account_provider_uk").on(
      table.accountId,
      table.baseUrl,
      table.instanceName,
      table.providerId,
    ),
    unique("evolution_conta_mensagem_origem_uk").on(
      table.baseUrl,
      table.instanceName,
      table.providerId,
    ),
    index("evolution_conta_mensagens_identidade_busca_idx").on(
      table.accountId,
      table.createdAt.desc(),
    ),
  ],
);

export const insertEvolutionAccountIdentitySchema = createInsertSchema(
  evolutionAccountIdentitiesTable,
).omit({ accountId: true, createdAt: true, updatedAt: true });
export const insertEvolutionAccountClinicSchema = createInsertSchema(
  evolutionAccountClinicsTable,
).omit({ authorizedAt: true, revokedAt: true });
export const insertEvolutionAccountMessageSchema = createInsertSchema(
  evolutionAccountMessagesTable,
).omit({ id: true, createdAt: true });

export type EvolutionAccountIdentityRow = typeof evolutionAccountIdentitiesTable.$inferSelect;
export type InsertEvolutionAccountIdentity = z.infer<typeof insertEvolutionAccountIdentitySchema>;
export type EvolutionAccountClinicRow = typeof evolutionAccountClinicsTable.$inferSelect;
export type InsertEvolutionAccountClinic = z.infer<typeof insertEvolutionAccountClinicSchema>;
export type EvolutionAccountMessageRow = typeof evolutionAccountMessagesTable.$inferSelect;
export type InsertEvolutionAccountMessage = z.infer<typeof insertEvolutionAccountMessageSchema>;
