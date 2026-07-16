import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Endereços de serviço do cliente (ilimitados — decisão do CEO 16/07/2026).
// Usados quando a enfermeira vai ao cliente (Home Nurse / Itinerante).
// Cada endereço aparece como opção de seleção no Lançador de Protocolo e na
// tela de Sessão. O campo serviceAddress em sessions guarda o texto formatado
// do endereço escolhido para constar no RAS, RAS FAP e contratos jurídicos.
export const clientServiceAddressesTable = pgTable("client_service_addresses", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  // Rótulo amigável: "Casa SP", "Escritório", "Apartamento BSB", "Hotel", etc.
  label: text("label").notNull(),
  cep: text("cep"),
  logradouro: text("logradouro").notNull(),
  numero: text("numero"),
  complemento: text("complemento"),
  bairro: text("bairro"),
  cidade: text("cidade").notNull(),
  estado: text("estado").notNull().default("SP"),
  // Quando true, é pré-selecionado no Lançador (1 por cliente — enforçado na API).
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClientServiceAddressSchema = createInsertSchema(clientServiceAddressesTable)
  .omit({ id: true, createdAt: true });
export type InsertClientServiceAddress = z.infer<typeof insertClientServiceAddressSchema>;
export type ClientServiceAddress = typeof clientServiceAddressesTable.$inferSelect;
