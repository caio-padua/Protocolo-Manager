import { pgTable, text, serial, timestamp, boolean, integer, real, uniqueIndex } from "drizzle-orm/pg-core";
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
    secondaryEmail: text("secondary_email"),
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
    // Autoridade administrativa global da plataforma. Nao deriva de isPrimaryDoctor:
    // a associacao inicial exige autorizacao explicita do CEO e fica persistida.
    isPlatformOwner: boolean("is_platform_owner").notNull().default(false),
    // Empresa principal do profissional; os vinculos adicionais continuam em locations.
    empresaId: integer("empresa_id"),
    // Credenciais do Portao do Colaborador (Onda 8.2). Login por colaborador
    // para permitir auditoria de quem entrou e fez o que. Senha SEMPRE em hash
    // (scrypt+salt), nunca texto puro. Nulo = colaborador ainda sem acesso.
    loginUsername: text("login_username"),
    passwordHash: text("password_hash"),
    // Incrementado ao trocar/resetar senha; tokens de sessoes anteriores ficam invalidos.
    credentialVersion: integer("credential_version").notNull().default(0),
    // Identidade Google gerenciada pela Replit. Desenvolvimento e producao
    // usam cadastros de autenticacao separados, portanto os vinculos tambem.
    clerkUserIdDev: text("clerk_user_id_dev"),
    clerkUserIdProd: text("clerk_user_id_prod"),
    // Imagem da assinatura/rubrica do profissional (PNG/JPEG). Guardada no
    // Object Storage privado; aqui fica só o caminho. Nulo = sem assinatura.
    // Serve a dois caminhos (decisao 28/06/2026): upload direto agora e, no
    // futuro, captura remota por link — mesmo destino.
    signatureUrl: text("signature_url"),
    // Foto de perfil do profissional (PNG/JPEG). Mesma infra do Object Storage
    // privado da assinatura. Exibida no card externo da tela Corpo Clínico.
    photoUrl: text("photo_url"),
    // ── Campos de Enfermagem (Home Nurse / Itinerante) ──────────────────────
    // nurseType: 'fisica' = fixa numa clínica | 'home' = itinerante (MEI/PJ)
    // Vínculo com clínicas via location_professionals (N clínicas para home).
    nurseType: text("nurse_type"),
    // CPF do profissional: obrigatório para contratos, NF, jurídico.
    cpf: text("cpf"),
    // CNPJ MEI (opcional): só para home nurses que operam como empresa.
    cnpj: text("cnpj"),
    // Taxa por visita domiciliar. Multiplicada por sessões → nurseServiceFee no protocolo.
    homeServiceFeePerVisit: real("home_service_fee_per_visit"),
    // Tipo de contrato: 'clt' | 'pj' | 'mei'. Governa qual template de contrato usar.
    contractType: text("contract_type"),
    complemento: text("complemento"),
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
    uniqueIndex("professionals_clerk_user_id_dev_uk")
      .on(t.clerkUserIdDev)
      .where(sql`${t.clerkUserIdDev} is not null`),
    uniqueIndex("professionals_clerk_user_id_prod_uk")
      .on(t.clerkUserIdProd)
      .where(sql`${t.clerkUserIdProd} is not null`),
    uniqueIndex("professionals_platform_owner_singleton_uk")
      .on(t.isPlatformOwner)
      .where(sql`${t.isPlatformOwner} is true`),
    uniqueIndex("professionals_email_normalized_uk")
      .on(sql`lower(btrim(${t.email}))`)
      .where(sql`${t.email} is not null and btrim(${t.email}) <> ''`),
    uniqueIndex("professionals_cpf_digits_uk")
      .on(sql`regexp_replace(${t.cpf}, '[^0-9]', '', 'g')`)
      .where(sql`${t.cpf} is not null and regexp_replace(${t.cpf}, '[^0-9]', '', 'g') <> ''`),
  ],
);

export const insertProfessionalSchema = createInsertSchema(professionalsTable).omit({ id: true, createdAt: true });
export type InsertProfessional = z.infer<typeof insertProfessionalSchema>;
export type Professional = typeof professionalsTable.$inferSelect;
