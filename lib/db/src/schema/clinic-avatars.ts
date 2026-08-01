import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ============================================================================
// AVATARES POR CLÍNICA — motor ElevenLabs (voz) + HeyGen (vídeo).
//
// Cada empresa/clínica pode ter até 3 avatares:
//   tipo 1 = Médico  |  tipo 2 = Secretária  |  tipo 3 = Livre
//
// status: 'inativo' até o CEO configurar os IDs nas APIs externas.
// ============================================================================

export const clinicAvatarsTable = pgTable("clinic_avatars", {
  id:                serial("id").primaryKey(),
  /** empresa_id da clínica dona do avatar (empresa_id=5 = Instituto Pádua). */
  empresaId:         integer("empresa_id").notNull(),
  /** 1=Médico | 2=Secretária | 3=Livre */
  tipo:              integer("tipo").notNull(),
  nomeExibido:       text("nome_exibido").notNull(),
  descricao:         text("descricao"),
  /** ID da voz no ElevenLabs (null até o CEO configurar). */
  elevenLabsVoiceId: text("elevenlabs_voice_id"),
  /** ID do avatar no HeyGen (null até o CEO configurar). */
  heygenAvatarId:    text("heygen_avatar_id"),
  /** 'ativo' | 'inativo' */
  status:            text("status").notNull().default("inativo"),
  /**
   * Tier de capacidade deste avatar:
   *   'texto' = só mensagem escrita (padrão, sem custo adicional)
   *   'voz'   = + áudio MP3 via ElevenLabs (Módulo 2)
   *   'video' = + vídeo do avatar falando via HeyGen (Módulo 3)
   */
  nivel:             text("nivel").notNull().default("texto"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClinicAvatarSchema = createInsertSchema(clinicAvatarsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectClinicAvatarSchema = createSelectSchema(clinicAvatarsTable);

export type ClinicAvatar       = typeof clinicAvatarsTable.$inferSelect;
export type InsertClinicAvatar = typeof clinicAvatarsTable.$inferInsert;
