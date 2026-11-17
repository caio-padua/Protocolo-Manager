import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";

// Fotos de evolucao corporal enviadas pelo cliente (frente, costas, perfil esquerdo, perfil direito),
// em datas diferentes. Nunca se apaga: substituir/remover = preencher deleted_at (o arquivo fica guardado).
// O indice unico parcial (client_id, taken_on, angle) onde deleted_at IS NULL vive na migracao SQL.
export const clientBodyPhotosTable = pgTable("client_body_photos", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  empresaId: integer("empresa_id").notNull(),
  // Data da serie em BRT, texto AAAA-MM-DD
  takenOn: text("taken_on").notNull(),
  angle: text("angle").notNull(),
  // Objeto PRIVADO (nunca servido por rota publica)
  storagePath: text("storage_path").notNull(),
  bytes: integer("bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  source: text("source").notNull().default("cliente"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => ({
  porCliente: index("client_body_photos_cliente_idx").on(t.clientId, t.takenOn),
}));

export type ClientBodyPhoto = typeof clientBodyPhotosTable.$inferSelect;
