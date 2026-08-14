import { pgTable, text, serial, timestamp, jsonb, boolean, integer, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cpf: text("cpf"),
  email: text("email"),
  phone: text("phone"),
  birthDate: text("birth_date"),
  address: text("address"),
  complemento: text("complemento"),
  pais: text("pais").default("BRASIL"),
  instagram: text("instagram"),
  comoConheceu: text("como_conheceu"),
  status: text("status").notNull().default("active"),
  locationId: integer("location_id"),
  empresaId: integer("empresa_id"),
  photoUrl: text("photo_url"),
  notes: text("notes"),
  validationPassword: text("validation_password"),
  validationPasswordSentAt: timestamp("validation_password_sent_at", { withTimezone: true }),
  // Acesso leve do paciente a /area (Bloco D): senha com HASH forte (nunca texto puro),
  // troca obrigatoria no 1o acesso, e um token de definicao/reset com validade.
  passwordHash: text("password_hash"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordSetToken: text("password_set_token"),
  passwordSetTokenExpiresAt: timestamp("password_set_token_expires_at", { withTimezone: true }),
  examRequestsFolderId: text("exam_requests_folder_id"),
  driveFolderId: text("drive_folder_id"),
  telegramChatId: text("telegram_chat_id"),
  asaasCustomerId: text("asaas_customer_id"),
  stripeCustomerId: text("stripe_customer_id"),
  codigoSemantico: text("codigo_semantico"),
  fichaClinica: jsonb("ficha_clinica").default({}),
  needsReview: boolean("needs_review").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).default(sql`NULL`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;

// Junção AGENDA PREFERENCIAL: liga um cliente a uma ou mais agendas (agenda_resources =
// profissional × clínica). É metadado de preferência do cliente; NÃO altera o motor de agenda.
// Par (clientId, agendaResourceId) único — não duplica a mesma agenda para o mesmo cliente.
export const clientPreferredAgendasTable = pgTable(
  "client_preferred_agendas",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    agendaResourceId: integer("agenda_resource_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqClientAgenda: unique("uniq_client_agenda").on(t.clientId, t.agendaResourceId),
  }),
);

export type ClientPreferredAgenda = typeof clientPreferredAgendasTable.$inferSelect;
