// Tabelas da trava de escassez por dispositivo — Concierge.
// Schema normativo: docs/concierge/ARQUITETURA.md §6.4
//
// device_contact_verifications — OTPs enviados ao canal do paciente (WhatsApp/Telegram)
// device_offer_limits          — contador de ofertas por dispositivo × dia BRT
//                                inclui verified_at para dispensar requiresVerification
import { pgTable, text, serial, integer, timestamp, date, unique } from "drizzle-orm/pg-core";

// ─── Códigos de verificação de contato ───────────────────────────────────────
// Cada linha representa um OTP gerado e enviado ao canal do paciente.
// O código é consumido atomicamente no verify-device (UPDATE WHERE + RETURNING).
export const deviceContactVerificationsTable = pgTable("device_contact_verifications", {
  id: serial("id").primaryKey(),
  /** CPF do paciente (somente dígitos, 11 chars). */
  cpf: text("cpf").notNull(),
  /** Fingerprint do dispositivo que acionou a fricção (pode ser nulo se não disponível). */
  deviceFingerprint: text("device_fingerprint"),
  /** Código OTP gerado (6 dígitos). */
  code: text("code").notNull(),
  /** Canal pelo qual o código foi enviado: 'whatsapp' | 'telegram'. */
  sentVia: text("sent_via").notNull().default("whatsapp"),
  /** Telefone do paciente (para auditoria). */
  phone: text("phone"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  /** Expiração do OTP. Padrão: 10 minutos após o envio. */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** Preenchido atomicamente no verify-device quando o OTP é aceito. */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export type DeviceContactVerification = typeof deviceContactVerificationsTable.$inferSelect;

// ─── Limites de oferta por dispositivo × dia BRT ─────────────────────────────
// Incremento via INSERT … ON CONFLICT DO UPDATE (atômico).
// dia_brt usa a data BRT (brtISODate()) — nunca NOW()::DATE (timezone do banco).
export const deviceOfferLimitsTable = pgTable(
  "device_offer_limits",
  {
    id: serial("id").primaryKey(),
    deviceFingerprint: text("device_fingerprint").notNull(),
    /** Data BRT "YYYY-MM-DD" — obtida via brtISODate() antes do INSERT. */
    diaBrt: date("dia_brt").notNull(),
    offerCount: integer("offer_count").notNull().default(0),
    firstOfferAt: timestamp("first_offer_at", { withTimezone: true }).notNull().defaultNow(),
    lastOfferAt: timestamp("last_offer_at", { withTimezone: true }).notNull().defaultNow(),
    /** Preenchido quando o dispositivo confirma o OTP via verify-device. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [unique("device_offer_limits_fp_dia_uniq").on(t.deviceFingerprint, t.diaBrt)],
);

export type DeviceOfferLimit = typeof deviceOfferLimitsTable.$inferSelect;
