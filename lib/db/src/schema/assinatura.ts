import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Motor de Assinatura Remota (ZapSign) — tabelas NATIVAS do Paxter.
 * Conceito-raiz: dado nasce nativo, sem etiqueta de origem nem coluna id_ihe.
 * O paciente assina à distância (assinatura AVANÇADA por WhatsApp); o médico
 * mantém o A1 ICP-Brasil nativo (QUALIFICADA). Convive com pdf-signer.ts.
 */

export const assinaturaTemplatesTable = pgTable("assinatura_templates", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  titulo: text("titulo").notNull(),
  // RAS | TCLE | TERMO | OUTRO — roteia pasta no Drive e nomeia o PDF.
  tipoDoc: text("tipo_doc").notNull().default("TERMO"),
  corpoHtml: text("corpo_html").notNull(),
  placeholders: jsonb("placeholders").notNull().default([]),
  exigeMedico: boolean("exige_medico").notNull().default(false),
  exigeClinica: boolean("exige_clinica").notNull().default(false),
  exigeTestemunhas: boolean("exige_testemunhas").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const assinaturaSolicitacoesTable = pgTable("assinatura_solicitacoes", {
  id: serial("id").primaryKey(),
  // FK lógica para clients.id (paciente). Nullable para documentos institucionais.
  pacienteId: integer("paciente_id"),
  templateId: integer("template_id"),
  tipoDoc: text("tipo_doc").notNull().default("TERMO"),
  titulo: text("titulo"),
  // Onda 4 — escopo do ATO que este documento consente (ex.: "PROTOCOLO:123" ou
  // um tipo de doc "TCLE"). O nervo consentimentoAtivo casa documento <-> ato.
  escopo: text("escopo"),
  provedorCodigo: text("provedor_codigo").notNull().default("zapsign"),
  provedorEnvelopeId: text("provedor_envelope_id"),
  // RASCUNHO | HIDRATADO | ENVIADO | PARCIAL | CONCLUIDO | REJEITADO | EXPIRADO | FALHA
  status: text("status").notNull().default("RASCUNHO"),
  dadosHidratacao: jsonb("dados_hidratacao").notNull().default({}),
  hashOriginal: text("hash_original"),
  hashAssinado: text("hash_assinado"),
  signatariosSnapshot: jsonb("signatarios_snapshot").notNull().default([]),
  canaisDistribuir: text("canais_distribuir").array(),
  pdfAssinadoUrl: text("pdf_assinado_url"),
  pdfStorageKey: text("pdf_storage_key"),
  driveFileId: text("drive_file_id"),
  // External id estável para reconciliar webhook -> solicitação sem ambiguidade.
  zapsignExternalId: text("zapsign_external_id"),
  metadata: jsonb("metadata").notNull().default({}),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const assinaturaSignatariosTable = pgTable("assinatura_signatarios", {
  id: serial("id").primaryKey(),
  solicitacaoId: integer("solicitacao_id").notNull(),
  // PACIENTE | MEDICO | CLINICA | TESTEMUNHA | RESPONSAVEL_LEGAL
  papel: text("papel").notNull(),
  nome: text("nome").notNull(),
  cpf: text("cpf"),
  email: text("email"),
  telefone: text("telefone"),
  ordem: integer("ordem").notNull().default(1),
  // ENVIADO | ASSINADO | REJEITADO
  status: text("status").notNull().default("ENVIADO"),
  linkAssinatura: text("link_assinatura"),
  assinadoEm: timestamp("assinado_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const assinaturaWebhookEventosTable = pgTable(
  "assinatura_webhook_eventos",
  {
    id: serial("id").primaryKey(),
    provedorCodigo: text("provedor_codigo").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    envelopeId: text("envelope_id"),
    solicitacaoId: integer("solicitacao_id"),
    payloadBruto: jsonb("payload_bruto").notNull().default({}),
    signatureHeader: text("signature_header"),
    signatureValida: boolean("signature_valida").notNull().default(false),
    processado: boolean("processado").notNull().default(false),
    processadoEm: timestamp("processado_em", { withTimezone: true }),
    erroProcessamento: text("erro_processamento"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotência: ZapSign reentrega o mesmo evento — não reprocessar.
    provedorEventoUnico: uniqueIndex("assinatura_webhook_provedor_evento_unico").on(
      t.provedorCodigo,
      t.eventId,
    ),
  }),
);

export const assinaturaNotificacoesTable = pgTable(
  "assinatura_notificacoes",
  {
    id: serial("id").primaryKey(),
    solicitacaoId: integer("solicitacao_id").notNull(),
    // EMAIL | WHATSAPP | DRIVE | TELEGRAM
    canal: text("canal").notNull(),
    // ENVIO_INICIAL | POS_ASSINATURA | LEMBRETE
    momento: text("momento").notNull(),
    destinatario: text("destinatario").notNull(),
    assunto: text("assunto"),
    corpo: text("corpo").notNull(),
    // PENDENTE | ENVIADO | FALHA | PULADO
    status: text("status").notNull().default("PENDENTE"),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    erro: text("erro"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Onda 3 — idempotência por (solicitacao + canal + momento): reprocessar a
    // fila ou reenviar não duplica a mesma notificação do mesmo canal/momento.
    notifUnica: uniqueIndex("assinatura_notif_solicitacao_canal_momento").on(
      t.solicitacaoId,
      t.canal,
      t.momento,
    ),
  }),
);

// Onda 5 — Biblioteca de cláusulas reutilizáveis (nativa). Texto pronto que o
// redator injeta no editor para casos de risco fora do padrão (off-label,
// comorbidade etc.). O corpo é "achatado" no PDF no envio, então apagar uma
// cláusula nunca afeta documentos já gerados.
export const assinaturaClausulasTable = pgTable("assinatura_clausulas", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  titulo: text("titulo").notNull(),
  corpoHtml: text("corpo_html").notNull(),
  // RISCO | OFF-LABEL | COMORBIDADE | LGPD | OUTRO
  categoria: text("categoria").notNull().default("OUTRO"),
  usoContagem: integer("uso_contagem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const assinaturaTogglesAdminTable = pgTable("assinatura_toggles_admin", {
  // Singleton: sempre id = 1.
  id: integer("id").primaryKey().default(1),
  provedorPrincipalCodigo: text("provedor_principal_codigo").notNull().default("zapsign"),
  provedorFailoverCodigo: text("provedor_failover_codigo").notNull().default("zapsign"),
  failoverAutomatico: boolean("failover_automatico").notNull().default(false),
  enviarPorEmail: boolean("enviar_por_email").notNull().default(true),
  enviarPorWhatsapp: boolean("enviar_por_whatsapp").notNull().default(true),
  arquivarNoDrive: boolean("arquivar_no_drive").notNull().default(true),
  exigirAssinaturaMedico: boolean("exigir_assinatura_medico").notNull().default(false),
  exigirTestemunhas: boolean("exigir_testemunhas").notNull().default(false),
  // Onda 4 — trava de consentimento ADITIVA. Default OFF: nada quebra. Quando
  // ligada, um ato sem consentimento ativo (paciente+escopo) responde 409.
  travaConsentimentoAtiva: boolean("trava_consentimento_ativa").notNull().default(false),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AssinaturaSolicitacao = typeof assinaturaSolicitacoesTable.$inferSelect;
export type AssinaturaSignatario = typeof assinaturaSignatariosTable.$inferSelect;
export type AssinaturaTemplate = typeof assinaturaTemplatesTable.$inferSelect;
export type AssinaturaWebhookEvento = typeof assinaturaWebhookEventosTable.$inferSelect;
export type AssinaturaNotificacao = typeof assinaturaNotificacoesTable.$inferSelect;
export type AssinaturaTogglesAdmin = typeof assinaturaTogglesAdminTable.$inferSelect;
export type AssinaturaClausula = typeof assinaturaClausulasTable.$inferSelect;
