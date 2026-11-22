import { pgTable, serial, integer, text, timestamp, customType, unique } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// Foto de orientacao (onde passar a fita) por regiao do corpo e por empresa.
export const antropometriaFigurasTable = pgTable("antropometria_figuras", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull(),
  regiao: text("regiao").notNull(),
  mime: text("mime").notNull(),
  dados: bytea("dados").notNull(),
  atualizadoPor: integer("atualizado_por"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unico: unique("antropometria_figuras_empresa_regiao_uq").on(t.empresaId, t.regiao),
}));
