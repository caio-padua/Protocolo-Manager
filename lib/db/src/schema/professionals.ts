import { pgTable, text, serial, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
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
    // Estratificacao do corpo clinico (decisao do CEO 21/06/2026): TIPO
    // (medico/nao_medico) + AREA profissional + ESPECIALIZACAO (ids do catalogo
    // professional_areas/professional_specialties) + numero de registro do
    // conselho (CRM/COREN/CRP/CRN). crm/specialty antigos ficam para compat.
    professionalType: text("professional_type").notNull().default("medico"),
    areaId: integer("area_id"),
    specialtyId: integer("specialty_id"),
    registrationCouncil: text("registration_council"),
    registrationNumber: text("registration_number"),
    // Marca o medico PRINCIPAL (Dr. Caio). Usado para separar a Entrada 3
    // (exclusiva) da Entrada 4 (assistentes) sem depender do nome. Default false:
    // quem nao for marcado entra como assistente.
    isPrimaryDoctor: boolean("is_primary_doctor").notNull().default(false),
    // Credenciais do Portao do Colaborador (Onda 8.2). Login por colaborador
    // para permitir auditoria de quem entrou e fez o que. Senha SEMPRE em hash
    // (scrypt+salt), nunca texto puro. Nulo = colaborador ainda sem acesso.
    loginUsername: text("login_username"),
    passwordHash: text("password_hash"),
    // Imagem da assinatura/rubrica do profissional (PNG/JPEG). Guardada no
    // Object Storage privado; aqui fica só o caminho. Nulo = sem assinatura.
    // Serve a dois caminhos (decisao 28/06/2026): upload direto agora e, no
    // futuro, captura remota por link — mesmo destino.
    signatureUrl: text("signature_url"),
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
