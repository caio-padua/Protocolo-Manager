import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { empresasTable } from "./empresas";
import { substancesTable } from "./substances";
import { fornecedoresTable } from "./fornecedores";
import { professionalsTable } from "./professionals";

export const substanceVariantesTable = pgTable("substance_variantes", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  substanceId: integer("substance_id").notNull().references(() => substancesTable.id),
  doseTotal: text("dose_total").notNull(),
  forma: text("forma").notNull(),
  volumeMl: numeric("volume_ml"),
  concentracao: text("concentracao"),
  composicao: text("composicao"),
  subtipoImplante: text("subtipo_implante"),
  viasFonte: text("vias_fonte").notNull(),
  versao: integer("versao").notNull().default(1),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("substance_variantes_empresa_id_uq").on(t.empresaId, t.id),
  check("substance_variantes_campos_ck", sql`length(btrim(${t.doseTotal})) > 0 AND length(btrim(${t.forma})) > 0 AND length(btrim(${t.viasFonte})) > 0 AND (${t.volumeMl} IS NULL OR ${t.volumeMl} > 0)`),
  check("substance_variantes_implante_ck", sql`${t.subtipoImplante} IS NULL OR (${t.forma} = 'implante' AND ${t.subtipoImplante} IN ('absorvivel', 'nao_absorvivel'))`),
]);

export const substanceOfertasTable = pgTable("substance_ofertas", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  varianteId: integer("variante_id").notNull(),
  fornecedorId: integer("fornecedor_id").notNull(),
  posicao: integer("posicao").notNull(),
  origemChave: text("origem_chave").notNull(),
  documento: text("documento").notNull(),
  pagina: integer("pagina").notNull(),
  linha: integer("linha").notNull(),
  embalagemOriginal: text("embalagem_original").notNull(),
  fonteTexto: text("fonte_texto").notNull(),
  fonteDataNomeArquivo: text("fonte_data_nome_arquivo"),
  quantidadeEmbalagem: integer("quantidade_embalagem").notNull(),
  custoUnitarioCentavos: integer("custo_unitario_centavos").notNull(),
  custoEmbalagemCentavos: integer("custo_embalagem_centavos").notNull(),
  moeda: text("moeda").notNull().default("BRL"),
  versao: integer("versao").notNull().default(1),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "substance_ofertas_variante_empresa_fk", columns: [t.empresaId, t.varianteId], foreignColumns: [substanceVariantesTable.empresaId, substanceVariantesTable.id] }),
  foreignKey({ name: "substance_ofertas_fornecedor_empresa_fk", columns: [t.empresaId, t.fornecedorId], foreignColumns: [fornecedoresTable.empresaId, fornecedoresTable.id] }),
  uniqueIndex("substance_ofertas_origem_uq").on(t.empresaId, t.origemChave),
  uniqueIndex("substance_ofertas_empresa_id_uq").on(t.empresaId, t.id),
  uniqueIndex("substance_ofertas_posicao_uq").on(t.varianteId, t.posicao),
  check("substance_ofertas_valores_ck", sql`${t.posicao} BETWEEN 1 AND 5 AND ${t.pagina} > 0 AND ${t.linha} > 0 AND ${t.quantidadeEmbalagem} > 0 AND ${t.custoUnitarioCentavos} >= 0 AND ${t.custoEmbalagemCentavos} >= 0 AND length(btrim(${t.origemChave})) > 0 AND length(btrim(${t.fonteTexto})) > 0 AND length(btrim(${t.documento})) > 0 AND length(btrim(${t.embalagemOriginal})) > 0`),
]);

export const substanceVarianteHistoricoTable = pgTable("substance_variante_historico", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  varianteId: integer("variante_id").notNull(),
  profissionalId: integer("profissional_id").references(() => professionalsTable.id),
  atorTipo: text("ator_tipo").notNull(),
  justificativa: text("justificativa"),
  antes: jsonb("antes"),
  depois: jsonb("depois").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "substance_variante_historico_empresa_fk", columns: [t.empresaId, t.varianteId], foreignColumns: [substanceVariantesTable.empresaId, substanceVariantesTable.id] }),
  check("substance_variante_historico_autor_ck", sql`(${t.atorTipo} = 'profissional' AND ${t.profissionalId} IS NOT NULL) OR (${t.atorTipo} = 'agente' AND ${t.profissionalId} IS NULL AND ${t.justificativa} IS NOT NULL AND length(btrim(${t.justificativa})) > 0)`),
]);

export const substanceOfertaHistoricoTable = pgTable("substance_oferta_historico", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresasTable.id),
  ofertaId: integer("oferta_id").notNull(),
  profissionalId: integer("profissional_id").references(() => professionalsTable.id),
  atorTipo: text("ator_tipo").notNull(),
  justificativa: text("justificativa"),
  antes: jsonb("antes"),
  depois: jsonb("depois").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "substance_oferta_historico_empresa_fk", columns: [t.empresaId, t.ofertaId], foreignColumns: [substanceOfertasTable.empresaId, substanceOfertasTable.id] }),
  check("substance_oferta_historico_autor_ck", sql`(${t.atorTipo} = 'profissional' AND ${t.profissionalId} IS NOT NULL) OR (${t.atorTipo} = 'agente' AND ${t.profissionalId} IS NULL AND ${t.justificativa} IS NOT NULL AND length(btrim(${t.justificativa})) > 0)`),
]);
