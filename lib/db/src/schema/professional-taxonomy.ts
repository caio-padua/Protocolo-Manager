import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { professionalsTable } from "./professionals";
import { empresasTable } from "./empresas";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Catalogo de AREAS profissionais (Medicina, Enfermagem, Psicologia, Nutricao).
// professionalType separa medico de nao-medico. defaultPaymentArm liga a area
// ao braco de pagamento usado na solicitacao do paciente (sem cobranca real).
export const professionalAreasTable = pgTable(
  "professional_areas",
  {
    id: serial("id").primaryKey(),
    professionalType: text("professional_type").notNull().default("medico"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    defaultPaymentArm: text("default_payment_arm").notNull().default("sinal25"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("professional_areas_slug_uk").on(t.slug)],
);

// Catalogo de ESPECIALIZACOES por area (Integrativa, Cardiologia, etc.).
// Unico por (areaId, name) para idempotencia da semeadura.
export const professionalSpecialtiesTable = pgTable(
  "professional_specialties",
  {
    id: serial("id").primaryKey(),
    areaId: integer("area_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("professional_specialties_area_name_uk").on(t.areaId, t.name)],
);

export const insertProfessionalAreaSchema = createInsertSchema(professionalAreasTable).omit({ id: true, createdAt: true });
export const insertProfessionalSpecialtySchema = createInsertSchema(professionalSpecialtiesTable).omit({ id: true, createdAt: true });
export type InsertProfessionalArea = z.infer<typeof insertProfessionalAreaSchema>;
export type InsertProfessionalSpecialty = z.infer<typeof insertProfessionalSpecialtySchema>;
export type ProfessionalArea = typeof professionalAreasTable.$inferSelect;
export type ProfessionalSpecialty = typeof professionalSpecialtiesTable.$inferSelect;

export const professionalWorkAreasTable = pgTable("professional_work_areas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdBy: integer("created_by").notNull().references(() => professionalsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const professionalWorkAreaLinksTable = pgTable("professional_work_area_links", {
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  professionalId: integer("professional_id").notNull().references(() => professionalsTable.id),
  workAreaId: integer("work_area_id").notNull().references(() => professionalWorkAreasTable.id),
  active: boolean("active").notNull().default(true),
}, (t) => [primaryKey({ columns: [t.empresaId, t.professionalId, t.workAreaId] })]);

export const professionalWorkAreaHistoryTable = pgTable("professional_work_area_history", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  professionalId: integer("professional_id").notNull().references(() => professionalsTable.id),
  workAreaId: integer("work_area_id").notNull().references(() => professionalWorkAreasTable.id),
  actorId: integer("actor_id").notNull().references(() => professionalsTable.id),
  active: boolean("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const professionalCategoryHistoryTable = pgTable("professional_category_history", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => professionalAreasTable.id),
  actorId: integer("actor_id").notNull().references(() => professionalsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
