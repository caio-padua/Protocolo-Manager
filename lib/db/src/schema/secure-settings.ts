import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

// Cofre de segredos cifrados em repouso (AES-256-GCM). O frontend NUNCA recebe o
// valor em claro — só status/masked. O valor em claro vive apenas em memória do
// servidor ao decifrar. Chave de cifragem: APP_ENCRYPTION_KEY (obrigatória em
// produção) ou derivada de SESSION_SECRET (apenas desenvolvimento).
export const secureSettingsTable = pgTable("secure_settings", {
  key: text("key").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SecureSetting = typeof secureSettingsTable.$inferSelect;
