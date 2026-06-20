import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Conteudo editavel pelo colaborador (Central de Cadastro): fraseologia dos
// botoes, textos de pagamento (concierge, sinal, estetico) e videos de
// apresentacao. Cada item tem uma chave estavel (contentKey) que a tela do
// paciente consome. category = button_phrase | payment_text | video.
export const siteContentTable = pgTable("site_content", {
  id: serial("id").primaryKey(),
  contentKey: text("content_key").notNull().unique(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  mediaUrl: text("media_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSiteContentSchema = createInsertSchema(siteContentTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertSiteContent = z.infer<typeof insertSiteContentSchema>;
export type SiteContent = typeof siteContentTable.$inferSelect;
