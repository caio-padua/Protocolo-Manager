import { pgTable, serial, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Tabela de empresas/tenants — conceito distinto de `locations` (endereço físico).
// Cada empresa é uma clínica licenciada no sistema PAXTER (multi-tenant futuro).
// ihe_id preserva o ID de origem do IHE para rastreabilidade sem tag de origem no dado.
export const empresasTable = pgTable("empresas", {
  id: serial("id").primaryKey(),
  iheId: integer("ihe_id"),                      // referência ao ID original do IHE (não-chave, só rastreio)
  nome: text("nome").notNull(),
  nick: text("nick"),                            // apelido interno
  cnpj: text("cnpj"),
  tipo: text("tipo").notNull().default("clinic"),             // clinic | genesis_seed | telemedicina | enfermagem
  tipoUnidade: text("tipo_unidade"),             // CLINICA_OPERACIONAL | CLINICA_PARCEIRA | LABORATORIO_MESTRE
  status: text("status").notNull().default("ATIVO"),          // ATIVO | SUSPENSO | CANCELADO
  ativa: boolean("ativa").notNull().default(true),
  donoNome: text("dono_nome"),
  slug: text("slug"),
  timezone: text("timezone").default("America/Sao_Paulo"),
  // Endereço
  endereco: text("endereco"),
  cep: text("cep"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  estado: text("estado"),
  // Contatos
  telefone: text("telefone"),
  emailGeral: text("email_geral"),
  emailAgenda: text("email_agenda"),
  emailEnfermagem: text("email_enfermagem"),
  emailFinanceiro: text("email_financeiro"),
  // Integrações
  googleCalendarId: text("google_calendar_id"),
  googleDriveFolderId: text("google_drive_folder_id"),
  // Módulos ativos por empresa (chave = código do módulo, valor = true/false)
  modulosAtivos: jsonb("modulos_ativos").$type<Record<string, boolean>>().default({}),
  // Contrato / monetização
  tipoContrato: text("tipo_contrato"),           // por_demanda | full | pacote
  fatMetaMensal: integer("fat_meta_mensal"),     // meta de faturamento mensal em centavos
  // Metadados
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow(),
});

export const insertEmpresaSchema = createInsertSchema(empresasTable).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type Empresa = typeof empresasTable.$inferSelect;
