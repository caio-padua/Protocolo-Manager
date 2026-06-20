import { pgTable, text, serial, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const professionalsTable = pgTable(
  "professionals",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    crm: text("crm"),
    specialty: text("specialty"),
    email: text("email"),
    phone: text("phone"),
    unit: text("unit"),
    serviceTypes: text("service_types").array().notNull().default(["clinic"]),
    category: text("category").notNull().default("outro"),
    role: text("role").notNull().default("executor"),
    // Marca o medico PRINCIPAL (Dr. Caio). Usado para separar a Entrada 3
    // (exclusiva) da Entrada 4 (assistentes) sem depender do nome. Default false:
    // quem nao for marcado entra como assistente.
    isPrimaryDoctor: boolean("is_primary_doctor").notNull().default(false),
    // Credenciais do Portao do Colaborador (Onda 8.2). Login por colaborador
    // para permitir auditoria de quem entrou e fez o que. Senha SEMPRE em hash
    // (scrypt+salt), nunca texto puro. Nulo = colaborador ainda sem acesso.
    loginUsername: text("login_username"),
    passwordHash: text("password_hash"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unicidade de usuario SEM diferenciar maiusculas/minusculas, em nivel de
    // banco (versionado): impede "Caio" e "caio" coexistirem mesmo sob corrida
    // concorrente. Parcial (WHERE not null) para permitir varios sem credencial.
    uniqueIndex("professionals_login_username_lower_uk")
      .on(sql`lower(${t.loginUsername})`)
      .where(sql`${t.loginUsername} is not null`),
  ],
);

export const insertProfessionalSchema = createInsertSchema(professionalsTable).omit({ id: true, createdAt: true });
export type InsertProfessional = z.infer<typeof insertProfessionalSchema>;
export type Professional = typeof professionalsTable.$inferSelect;
