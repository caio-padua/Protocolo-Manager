import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  type: text("type").notNull().default("clinic"),
  googleCalendarId: text("google_calendar_id"),
  color: text("color").notNull().default("#3B82F6"),
  active: text("active").notNull().default("true"),
  phone: text("phone"),
  cep: text("cep"),
  logradouro: text("logradouro"),
  numero: text("numero"),
  complemento: text("complemento"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  estado: text("estado"),
  // Zona de agrupamento (data-binder para VínculosPanel e telas futuras)
  // Ex.: "Zona Leste", "Zona Oeste / Pinheiros", "Centro / Higienópolis", "Moema / Zona Sul"
  zona: text("zona"),
  // empresa_id → semente dormente de isolamento multi-tenant (Spec A 16/07/2026).
  // NULL = pertence ao tenant padrão (Instituto Pádua). FK lógica → empresas.id.
  // Ativação completa do isolamento em onda futura (não quebra comportamento atual).
  empresaId: integer("empresa_id"),
  // ── Dados jurídicos e certificado digital (adicionado 20/07/2026 via ALTER TABLE) ──
  cnpj: text("cnpj"),
  razaoSocial: text("razao_social"),
  nomeFantasia: text("nome_fantasia"),
  certTitular: text("cert_titular"),
  certValidade: text("cert_validade"),
  certTipo: text("cert_tipo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locationProfessionalsTable = pgTable(
  "location_professionals",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id").notNull(),
    professionalId: integer("professional_id").notNull(),
    role: text("role").notNull().default("executor"),
    // Agenda Google preferida para o par profissional+clínica (SUB-03, item 4.b).
    // FK lógica para agenda_calendars.id; opcional.
    agendaCalendarId: integer("agenda_calendar_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Um par profissional+clínica é único (evita vínculos duplicados — SUB-03 architect).
    pairUnique: uniqueIndex("location_professionals_pair_unique").on(t.professionalId, t.locationId),
  }),
);

export const insertLocationSchema = createInsertSchema(locationsTable).omit({ id: true, createdAt: true });
export const insertLocationProfessionalSchema = createInsertSchema(locationProfessionalsTable).omit({ id: true, createdAt: true });
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;
export type LocationProfessional = typeof locationProfessionalsTable.$inferSelect;
