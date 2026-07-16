import { pgTable, serial, text, boolean, timestamp, jsonb, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Tabela de empresas/tenants — conceito distinto de `locations` (endereço físico).
// Cada empresa é uma clínica licenciada no sistema PAXTER (multi-tenant futuro).
// ihe_id preserva o ID de origem do IHE para rastreabilidade sem tag de origem no dado.
export const empresasTable = pgTable("empresas", {
  id: serial("id").primaryKey(),
  iheId: integer("ihe_id"),                      // referência ao ID original do IHE (não-chave, só rastreio)

  // ── Identificação básica ────────────────────────────────────────────────────
  nome: text("nome").notNull(),                  // nome fantasia / nome interno
  razaoSocial: text("razao_social"),             // razão social completa (para NF-e / documentos legais)
  nick: text("nick"),                            // apelido interno curto
  cnpj: text("cnpj"),
  tipo: text("tipo").notNull().default("clinic"),             // clinic | genesis_seed | telemedicina | enfermagem
  tipoUnidade: text("tipo_unidade"),             // CLINICA_OPERACIONAL | CLINICA_PARCEIRA | LABORATORIO_MESTRE
  status: text("status").notNull().default("ATIVO"),          // ATIVO | SUSPENSO | CANCELADO
  ativa: boolean("ativa").notNull().default(true),
  donoNome: text("dono_nome"),
  slug: text("slug"),
  timezone: text("timezone").default("America/Sao_Paulo"),

  // ── Dados fiscais / jurídicos ───────────────────────────────────────────────
  cnae: text("cnae"),                            // CNAE principal — 7 dígitos (ex: 8630-5/01)
  cnaeDescricao: text("cnae_descricao"),         // descrição do CNAE principal
  cnaesSecundarios: jsonb("cnaes_secundarios").$type<{codigo: string; descricao: string}[]>().default([]),
  naturezaJuridica: text("natureza_juridica"),   // Ltda | SA | MEI | EIRELI | Associação | Fundação
  regimeTributario: text("regime_tributario"),   // simples_nacional | lucro_presumido | lucro_real | mei | isento
  inscricaoEstadual: text("inscricao_estadual"), // IE — Inscrição Estadual
  inscricaoMunicipal: text("inscricao_municipal"), // IM / CCM — cadastro no município
  dataAbertura: date("data_abertura"),           // data de abertura no Simples/Receita
  capitalSocial: numeric("capital_social", { precision: 14, scale: 2 }), // R$

  // ── Responsável legal + contador ────────────────────────────────────────────
  responsavelLegalNome: text("responsavel_legal_nome"),
  responsavelLegalCpf: text("responsavel_legal_cpf"),
  contadorNome: text("contador_nome"),
  contadorCrc: text("contador_crc"),             // ex: CRC SP-123456/O-1
  contadorEmail: text("contador_email"),
  contadorTelefone: text("contador_telefone"),

  // ── Endereço comercial ──────────────────────────────────────────────────────
  endereco: text("endereco"),
  cep: text("cep"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  estado: text("estado"),
  zona: text("zona"),                            // ex: "Zona Leste", "Centro", "Asa Sul" — auto ou manual
  complemento: text("complemento"),              // sala, andar, apto (endereço comercial)

  // ── Endereço fiscal (pode diferir do comercial — obrigatório NF-e) ──────────
  enderecoFiscal: text("endereco_fiscal"),       // logradouro completo
  complementoFiscal: text("complemento_fiscal"), // sala, andar, apto
  cepFiscal: text("cep_fiscal"),
  bairroFiscal: text("bairro_fiscal"),
  cidadeFiscal: text("cidade_fiscal"),
  estadoFiscal: text("estado_fiscal"),
  codigoIbge: text("codigo_ibge"),              // código IBGE do município — 7 dígitos — obrigatório NF-e

  // ── Contatos ────────────────────────────────────────────────────────────────
  telefone: text("telefone"),
  emailGeral: text("email_geral"),
  emailAgenda: text("email_agenda"),
  emailEnfermagem: text("email_enfermagem"),
  emailFinanceiro: text("email_financeiro"),

  // ── Nota Fiscal Eletrônica (NF-e / NFS-e) ──────────────────────────────────
  nfeAmbiente: text("nfe_ambiente").default("homologacao"), // producao | homologacao
  nfeSerie: text("nfe_serie").default("1"),
  nfeProximoNumero: integer("nfe_proximo_numero").default(1),
  nfeCodigoServico: text("nfe_codigo_servico"),  // código LC 116/2003 (ex: 8.01)
  nfeAliquotaIss: numeric("nfe_aliquota_iss", { precision: 5, scale: 2 }), // % ISS (ex: 2.00)
  nfeCodigoIss: text("nfe_codigo_iss"),          // código ISS municipal
  nfeDiscriminacaoPadrao: text("nfe_discriminacao_padrao"), // texto padrão da nota
  optanteSimples: boolean("optante_simples").default(false),

  // ── Certificado digital ─────────────────────────────────────────────────────
  certTipo: text("cert_tipo"),                  // a1 | a3
  certDriveFolderId: text("cert_drive_folder_id"), // pasta "CERTIFICADOS" no Drive da empresa
  certFileId: text("cert_file_id"),             // ID do arquivo .pfx no Drive (A1)
  certFileName: text("cert_file_name"),         // nome do arquivo para exibição
  certValidade: date("cert_validade"),          // data de vencimento — para alerta 30d antes
  certStatus: text("cert_status"),             // valido | vencido | ausente | a3_externo

  // ── ZapSign (assinatura digital por empresa) ────────────────────────────────
  zapsignToken: text("zapsign_token"),          // API token (cofre — exibir só com ação explícita)
  zapsignContaCriada: boolean("zapsign_conta_criada").default(false),
  zapsignEmail: text("zapsign_email"),          // e-mail da conta ZapSign

  // ── WhatsApp Business API ───────────────────────────────────────────────────
  waNumero: text("wa_numero"),                  // +5511... número público
  waPhoneNumberId: text("wa_phone_number_id"), // Meta Business — Phone Number ID
  waBusinessAccountId: text("wa_business_account_id"), // WABA ID
  waToken: text("wa_token"),                   // token de acesso (cofre)

  // ── Twilio por empresa (override do global) ─────────────────────────────────
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),  // cofre
  twilioNumero: text("twilio_numero"),         // número sender Twilio

  // ── Telegram por empresa ────────────────────────────────────────────────────
  telegramBotToken: text("telegram_bot_token"), // cofre
  telegramChatId: text("telegram_chat_id"),
  telegramBotUsername: text("telegram_bot_username"),

  // ── E-mail / Zoho ───────────────────────────────────────────────────────────
  zohoEmail: text("zoho_email"),               // e-mail Zoho criado para a empresa
  zohoStatus: text("zoho_status"),             // sugerido | criado | ativo

  // ── Google ──────────────────────────────────────────────────────────────────
  googleCalendarId: text("google_calendar_id"),
  googleDriveFolderId: text("google_drive_folder_id"), // pasta raiz da empresa no Drive

  // ── Documentos no Drive ─────────────────────────────────────────────────────
  driveFolderEmpresaId: text("drive_folder_empresa_id"),   // pasta "EMPRESAS/[NOME CNPJ]"
  driveContratoSocialId: text("drive_contrato_social_id"), // arquivo do contrato social
  driveAlvaraId: text("drive_alvara_id"),                  // alvará de funcionamento
  driveCrmId: text("drive_crm_id"),                        // CRM/CRO/COREN da empresa

  // ── Módulos e contrato PAXTER ───────────────────────────────────────────────
  modulosAtivos: jsonb("modulos_ativos").$type<Record<string, boolean>>().default({}),
  tipoContrato: text("tipo_contrato"),           // por_demanda | full | pacote
  fatMetaMensal: integer("fat_meta_mensal"),     // meta de faturamento mensal em centavos

  // ── Pirâmide de licenciamento PAXTER ────────────────────────────────────────
  // Spec: specs/saas-onda-a-schema-piramide.md (16/07/2026)
  //
  // tipoLicenciamento:
  //   propria               → clínica do próprio CEO (Instituto Pádua) — não paga
  //   sub_unidade           → filial de uma empresa mãe — paga à mãe
  //   licenciada_direta     → paga ao PAXTER diretamente (ex.: Barakat, Paluzze)
  //   licenciada_por_clinica → paga à clínica mãe, que repassa royalty ao PAXTER
  tipoLicenciamento: text("tipo_licenciamento").notNull().default("propria"),

  // empresa_mae_id → FK self-referencing. NULL = raiz da hierarquia.
  empresaMaeId: integer("empresa_mae_id"),       // FK lógica → empresas.id (sem constraint para evitar bootstrap circular)

  // royalty_percent → % que esta empresa repassa ao PAXTER quando sub-licencia.
  // Padrão 30% conforme carta IHE 16/07/2026.
  royaltyPercent: numeric("royalty_percent", { precision: 5, scale: 2 }).default("30.00"),

  // valor_mensal_contrato → mensalidade que esta empresa PAGA (ao PAXTER ou à mãe).
  // NULL = não paga (platform_owner ou propria sem contrato).
  valorMensalContrato: numeric("valor_mensal_contrato", { precision: 10, scale: 2 }),

  // is_platform_owner → somente 1 empresa verdadeira: a HQ PAXTER (Dr. Caio).
  // Esta empresa enxerga TUDO e controla quem pode sub-licenciar.
  isPlatformOwner: boolean("is_platform_owner").notNull().default(false),

  // ── Pirâmide de Licenciamento (Carta 05) ────────────────────────────────────
  tipoRelacionamento: text("tipo_relacionamento").notNull().default("licenciada_direta"),
  parentEmpresaId: integer("parent_empresa_id"),
  podeSublicenciar: boolean("pode_sublicenciar").notNull().default(false),

  // ── Metadados ───────────────────────────────────────────────────────────────
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow(),
});

export const insertEmpresaSchema = createInsertSchema(empresasTable).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type Empresa = typeof empresasTable.$inferSelect;

// ── Árvore de Licenciamento (Carta 05) ──────────────────────────────────────
export const arvoreLicenciamentoTable = pgTable("arvore_licenciamento", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => empresasTable.id),
  childId: integer("child_id").notNull().references(() => empresasTable.id),
  tipo: text("tipo").notNull(),                             // 'sub_unidade' | 'licenciada'
  percentualRoyalty: numeric("percentual_royalty", { precision: 5, scale: 2 }).notNull().default("30.00"),
  valorMensal: numeric("valor_mensal", { precision: 12, scale: 2 }),
  modeloCobranca: text("modelo_cobranca").default("mensalidade"),
  ativo: boolean("ativo").notNull().default(true),
  autorizadoPorId: integer("autorizado_por_id").notNull(),
  dataInicio: date("data_inicio").notNull().defaultNow(),
  dataFim: date("data_fim"),
  motivoEncerramento: text("motivo_encerramento"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow(),
});

export type ArvoreLicenciamento = typeof arvoreLicenciamentoTable.$inferSelect;

// ── Contratos da Empresa ─────────────────────────────────────────────────────
// Documentos jurídicos vinculados a cada empresa: contrato social, termos de
// licenciamento PAXTER, acordos operacionais, atas de reunião, etc.
export const empresaContratosTable = pgTable("empresa_contratos", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull().default("outro"),
  // contrato_social | termo_licenca | acordo | ata | procuracao | outro
  tamanhoBytes: integer("tamanho_bytes"),
  mimeType: text("mime_type"),
  driveFileId: text("drive_file_id"),
  driveUrl: text("drive_url"),
  driveFolderId: text("drive_folder_id"),
  observacao: text("observacao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow(),
});

export type EmpresaContrato = typeof empresaContratosTable.$inferSelect;
