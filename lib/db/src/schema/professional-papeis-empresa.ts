import { pgTable, serial, integer, boolean, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { professionalsTable } from "./professionals";
import { empresasTable } from "./empresas";

// Cinco interruptores independentes por profissional e por clínica (empresa_id).
// Um mesmo profissional pode acumular papéis (ex.: médico + administrador).
export const professionalPapeisEmpresaTable = pgTable("professional_papeis_empresa", {
  id: serial("id").primaryKey(),
  professionalId: integer("professional_id").notNull().references(() => professionalsTable.id),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  isClinicAdmin: boolean("is_clinic_admin").notNull().default(false),
  isDoctor: boolean("is_doctor").notNull().default(false),
  isNurse: boolean("is_nurse").notNull().default(false),
  isReception: boolean("is_reception").notNull().default(false),
  isFinance: boolean("is_finance").notNull().default(false),
  origem: text("origem").notNull().default("categoria"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("professional_papeis_empresa_uk").on(t.professionalId, t.empresaId),
  index("professional_papeis_empresa_empresa_idx").on(t.empresaId),
]);

export type ProfessionalPapeisEmpresa = typeof professionalPapeisEmpresaTable.$inferSelect;
