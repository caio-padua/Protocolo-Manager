import { pgTable, text, serial, integer, timestamp, date, unique } from "drizzle-orm/pg-core";

// Contador de ofertas concierge por dispositivo por dia (BRT).
// Usado para aplicar fricção crescente sem penalizar o CPF.
//
// Regras (ARQUITETURA.md §6.2):
//   < 6 ofertas/dia → livre
//   ≥ 6 ofertas/dia e não verificado → requiresVerification: true
//   ≥ 50 ofertas/dia → throttled: true (teto antiautomação)
//   Dispositivo verificado → nenhum limite
//   Nunca grava penalidade no CPF.
//
// Incremento atômico por INSERT ... ON CONFLICT DO UPDATE (§6.4).
// dia_brt usa brtISODate() de lib/brt.ts. Nunca new Date() cru.
export const deviceOfferLimitsTable = pgTable(
  "device_offer_limits",
  {
    id: serial("id").primaryKey(),
    deviceFingerprint: text("device_fingerprint").notNull(),
    diaBrt: date("dia_brt").notNull(),
    offerCount: integer("offer_count").notNull().default(0),
    firstOfferAt: timestamp("first_offer_at", { withTimezone: true }).notNull().defaultNow(),
    lastOfferAt: timestamp("last_offer_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("device_offer_limits_fp_dia_uq").on(t.deviceFingerprint, t.diaBrt)],
);

export type DeviceOfferLimit = typeof deviceOfferLimitsTable.$inferSelect;
