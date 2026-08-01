import { pgTable, serial, integer, text, date, time, timestamp } from "drizzle-orm/pg-core";

// ============================================================================
// AVATAR VIDEO QUEUE — fila assíncrona de geração de vídeo HeyGen.
//
// O Motor Hermes enfileira aqui quando canal=VIDEO. O worker (avatar-video-worker.ts)
// roda a cada 2 minutos, faz polling no HeyGen até status='completed', e entrega
// o link ao destinatário via WhatsApp ou Telegram.
// ============================================================================
export const avatarVideoQueueTable = pgTable("avatar_video_queue", {
  id:            serial("id").primaryKey(),
  empresaId:     integer("empresa_id").notNull(),
  avatarId:      integer("avatar_id").notNull(),
  clienteId:     integer("cliente_id"),
  /** ID retornado pelo HeyGen após gerarVideo() — preenchido na 1ª tentativa */
  heygenVideoId: text("heygen_video_id"),
  texto:         text("texto").notNull(),
  /** "WHATSAPP" | "TELEGRAM" */
  canalDestino:  text("canal_destino").notNull().default("WHATSAPP"),
  destino:       text("destino").notNull(),   // telefone (+5511...) ou chatId Telegram
  /** "pendente" | "gerando" | "pronto" | "entregue" | "erro" */
  status:        text("status").notNull().default("pendente"),
  tentativas:    integer("tentativas").notNull().default(0),
  videoUrl:      text("video_url"),
  erro:          text("erro"),
  contexto:      text("contexto"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  entregueAt:    timestamp("entregue_at", { withTimezone: true }),
});

// ============================================================================
// AVATAR ENVIOS — histórico de todos os envios de voz e vídeo do avatar.
//
// Cada chamada ao Motor Hermes com canal VOICE ou VIDEO registra uma linha aqui,
// independentemente do resultado. Base para billing e auditoria.
// ============================================================================
export const avatarEnviosTable = pgTable("avatar_envios", {
  id:            serial("id").primaryKey(),
  empresaId:     integer("empresa_id").notNull(),
  avatarId:      integer("avatar_id"),
  clienteId:     integer("cliente_id"),
  /** "VOICE" | "VIDEO" */
  canal:         text("canal").notNull(),
  /** "WHATSAPP" | "TELEGRAM" | "EMAIL" */
  canalEntrega:  text("canal_entrega").notNull(),
  textoEnviado:  text("texto_enviado"),
  /** "ok" | "erro" | "pulado" */
  status:        text("status").notNull().default("ok"),
  erro:          text("erro"),
  contexto:      text("contexto"),
  dataEnvio:     date("data_envio").notNull().defaultNow(),
  horaEnvio:     time("hora_envio").notNull().defaultNow(),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AvatarVideoQueue = typeof avatarVideoQueueTable.$inferSelect;
export type AvatarEnvio      = typeof avatarEnviosTable.$inferSelect;
