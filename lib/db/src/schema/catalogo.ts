import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const periodosDiaTable = pgTable("periodos_dia", {
  id: serial("id").primaryKey(),
  sigla: text("sigla").notNull().unique(),
  ordem: integer("ordem"),
  nome: text("nome"),
  janelaInicio: text("janela_inicio"),
  janelaFim: text("janela_fim"),
  emoji: text("emoji"),
  corHex: text("cor_hex"),
  descricao: text("descricao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const catalogoItensTable = pgTable("catalogo_itens", {
  id: serial("id").primaryKey(),
  codigoPadcom: text("codigo_padcom").notNull().unique(),
  nome: text("nome"),
  descricao: text("descricao"),
  categoria: text("categoria"),
  subCategoria: text("sub_categoria"),
  disponivel: boolean("disponivel"),
  preco: real("preco"),
  tags: jsonb("tags"),
  blocoId: text("bloco_id"),
  grau: text("grau"),
  viaUso: text("via_uso"),
  frequenciaBase: text("frequencia_base"),
  composicao: text("composicao"),
  posologia: text("posologia"),
  areaSemantica: text("area_semantica"),
  exigeValidacaoHumana: boolean("exige_validacao_humana"),
  unidadeId: integer("unidade_id"),
  posologiaEstruturada: jsonb("posologia_estruturada"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const catalogoFormulasTable = pgTable("catalogo_formulas", {
  id: serial("id").primaryKey(),
  hashConteudo: text("hash_conteudo").notNull().unique(),
  codigoSemantico: text("codigo_semantico"),
  codigoPadcom: text("codigo_padcom"),
  identificador: text("identificador"),
  conteudo: text("conteudo"),
  area: text("area"),
  funcao: text("funcao"),
  status: text("status"),
  tipoLinha: text("tipo_linha"),
  valorUnidade: text("valor_unidade"),
  origemValor: text("origem_valor"),
  b1: text("b1"),
  b2: text("b2"),
  b3: text("b3"),
  b4: text("b4"),
  seq: text("seq"),
  viaAdministracao: text("via_administracao"),
  formaFarmaceutica: text("forma_farmaceutica"),
  posologiaPadrao: jsonb("posologia_padrao"),
  periodosPadrao: jsonb("periodos_padrao"),
  efeitosColaterais: text("efeitos_colaterais"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const catalogoInjetaveisTable = pgTable("catalogo_injetaveis", {
  id: serial("id").primaryKey(),
  hashConteudo: text("hash_conteudo").notNull().unique(),
  codigoSemantico: text("codigo_semantico"),
  codigoPadcom: text("codigo_padcom"),
  tipoLinha: text("tipo_linha"),
  nomeAmpola: text("nome_ampola"),
  nomeExibicao: text("nome_exibicao"),
  ativo: boolean("ativo"),
  dosagem: text("dosagem"),
  volume: text("volume"),
  via: text("via"),
  valorUnidade: text("valor_unidade"),
  origemValor: text("origem_valor"),
  statusCadastro: text("status_cadastro"),
  observacao: text("observacao"),
  classificacao: text("classificacao"),
  eixoIntegrativo: text("eixo_integrativo"),
  palavraChaveMotor: text("palavra_chave_motor"),
  b1: text("b1"),
  b2: text("b2"),
  b3: text("b3"),
  b4: text("b4"),
  seq: text("seq"),
  substanciaBase: text("substancia_base"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const catalogoImplantesTable = pgTable("catalogo_implantes", {
  id: serial("id").primaryKey(),
  codigoPadcom: text("codigo_padcom").notNull().unique(),
  codigoSemantico: text("codigo_semantico"),
  nomeImplante: text("nome_implante"),
  substanciaAtiva: text("substancia_ativa"),
  ativo: boolean("ativo"),
  dosagem: text("dosagem"),
  unidade: text("unidade"),
  trocarte: text("trocarte"),
  liberacaoDiaria: text("liberacao_diaria"),
  doseRecomendada: text("dose_recomendada"),
  tempoAcao: text("tempo_acao"),
  indicacao: text("indicacao"),
  via: text("via"),
  valorUnidade: text("valor_unidade"),
  origemValor: text("origem_valor"),
  statusCadastro: text("status_cadastro"),
  observacao: text("observacao"),
  b1: text("b1"),
  b2: text("b2"),
  b3: text("b3"),
  b4: text("b4"),
  seq: text("seq"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const catalogoBlendsTable = pgTable("catalogo_blends", {
  id: serial("id").primaryKey(),
  codigoBlend: text("codigo_blend").notNull().unique(),
  nomeBlend: text("nome_blend"),
  funcao: text("funcao"),
  via: text("via"),
  forma: text("forma"),
  posologia: text("posologia"),
  duracao: text("duracao"),
  objetivo: text("objetivo"),
  ativo: boolean("ativo"),
  formulaId: integer("formula_id"),
  valorBrl: text("valor_brl"),
  valorMin: text("valor_min"),
  valorMax: text("valor_max"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const catalogoBlendAtivosTable = pgTable("catalogo_blend_ativos", {
  id: serial("id").primaryKey(),
  blendId: integer("blend_id").notNull().references(() => catalogoBlendsTable.id, { onDelete: "cascade" }),
  ordem: integer("ordem"),
  componente: text("componente"),
  dosagem: real("dosagem"),
  unidade: text("unidade"),
  observacao: text("observacao"),
  valorBrl: text("valor_brl"),
  valorMin: text("valor_min"),
  valorMax: text("valor_max"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPeriodoDiaSchema = createInsertSchema(periodosDiaTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPeriodoDia = z.infer<typeof insertPeriodoDiaSchema>;
export type PeriodoDia = typeof periodosDiaTable.$inferSelect;

export type CatalogoItem = typeof catalogoItensTable.$inferSelect;
export type CatalogoFormula = typeof catalogoFormulasTable.$inferSelect;
export type CatalogoInjetavel = typeof catalogoInjetaveisTable.$inferSelect;
export type CatalogoImplante = typeof catalogoImplantesTable.$inferSelect;
export type CatalogoBlend = typeof catalogoBlendsTable.$inferSelect;
export type CatalogoBlendAtivo = typeof catalogoBlendAtivosTable.$inferSelect;
