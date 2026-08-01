import { pgTable, serial, integer, text, numeric, timestamp, boolean } from "drizzle-orm/pg-core";

// ============================================================================
// AVATAR USO LOG — metering de voz (ElevenLabs) e vídeo (HeyGen).
//
// Cada geração de áudio ou vídeo grava uma linha aqui.
// Base para billing: pay-per-use ou controle de quota do módulo.
// Cloudflare Ray ID registrado quando disponível no header de resposta.
// ============================================================================

export const avatarUsoLogTable = pgTable("avatar_uso_log", {
  id:           serial("id").primaryKey(),
  empresaId:    integer("empresa_id").notNull(),
  avatarId:     integer("avatar_id"),
  clienteId:    integer("cliente_id"),
  /** 'elevenlabs' | 'heygen' */
  provedor:     text("provedor").notNull(),
  /** 'voz' | 'video' */
  tipoUso:      text("tipo_uso").notNull(),
  /** Quantidade de caracteres enviados ao TTS (ElevenLabs) */
  charsTexto:   integer("chars_texto"),
  /** Duração estimada do vídeo em segundos (HeyGen) */
  duracaoSeg:   numeric("duracao_seg", { precision: 8, scale: 2 }),
  /** 'lembrete' | 'manual' | 'campanha' | 'preview' */
  contexto:     text("contexto"),
  /** 'ok' | 'erro' */
  status:       text("status").notNull().default("ok"),
  erro:         text("erro"),
  /** Cloudflare Ray ID do response (header cf-ray) */
  cfRayId:      text("cf_ray_id"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// AVATAR MÓDULOS CONTRATADOS — quais níveis cada clínica tem acesso.
//
// nivel: 'voz' = ElevenLabs | 'video' = HeyGen
// tipo_cobranca: 'pay_per_use' | 'modulo_full'
// limite_mensal: null = ilimitado
// ============================================================================

export const avatarModulosContratadosTable = pgTable("avatar_modulos_contratados", {
  id:            serial("id").primaryKey(),
  empresaId:     integer("empresa_id").notNull(),
  /** 'voz' | 'video' */
  nivel:         text("nivel").notNull(),
  /** 'pay_per_use' | 'modulo_full' */
  tipoCobranca:  text("tipo_cobranca").notNull().default("modulo_full"),
  ativo:         boolean("ativo").notNull().default(true),
  /** Referência ao contrato Asaas ou número do contrato */
  contratoId:    text("contrato_id"),
  /** null = ilimitado; número = limite de usos no mês */
  limiteMensal:  integer("limite_mensal"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AvatarUsoLog                = typeof avatarUsoLogTable.$inferSelect;
export type AvatarModuloContratado      = typeof avatarModulosContratadosTable.$inferSelect;
