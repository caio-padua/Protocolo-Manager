import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Catálogo editável da "Carta de Encantamento" (Mensageria Opus, portado do IHE,
// nativo — sem tag de origem). Cada linha é um BLOCO de mensagem identificado por
// (categoria, chave). O `conteudo` é JSONB livre porque a forma varia por
// categoria (PERIODO tem abertura/desejo/saudacao; DIA_SEMANA tem frase; etc.).
// O montador (server) e a tela compõem a mensagem final a partir destes blocos.
// UNIQUE(categoria, chave) garante 1 bloco por chave e idempotência do seed.
export const mensagensCatalogoTable = pgTable(
  "mensagens_catalogo",
  {
    id: serial("id").primaryKey(),
    categoria: text("categoria").notNull(),
    chave: text("chave").notNull(),
    ordem: integer("ordem").notNull().default(0),
    conteudo: jsonb("conteudo").notNull().default({}),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqCategoriaChave: unique("mensagens_catalogo_categoria_chave").on(
      t.categoria,
      t.chave,
    ),
  }),
);

export type MensagemCatalogo = typeof mensagensCatalogoTable.$inferSelect;
export type MensagemCatalogoInsert = typeof mensagensCatalogoTable.$inferInsert;
