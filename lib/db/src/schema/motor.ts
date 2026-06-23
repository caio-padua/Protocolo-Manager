import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// =============================================================================
// MOTOR / EXAMES — fundacao de dados transmutada do IHE (chupa-cabra)
// Regra do CEO: SEM tag de origem; chave natural; ADITIVO (nunca dropar).
// id_ihe SO onde nenhum campo de negocio e unico (zero perda) — extensao
// fundamentada da excecao ja documentada (formulas/injetaveis/implantes).
// =============================================================================

// ---- Exames (chave: codigo_exame). 68 colunas na origem -> promove uteis +
//      jsonb `dados` com a linha crua inteira (garantia de zero perda). --------
export const catalogoExamesTable = pgTable("catalogo_exames", {
  id: serial("id").primaryKey(),
  codigoExame: text("codigo_exame").notNull().unique(),
  codigoSemantico: text("codigo_semantico"),
  nomeExame: text("nome_exame"),
  ativo: boolean("ativo"),
  grupoPrincipal: text("grupo_principal"),
  subgrupo: text("subgrupo"),
  modalidade: text("modalidade"),
  materialOuSetor: text("material_ou_setor"),
  blocoOficial: text("bloco_oficial"),
  grauDoBloco: text("grau_do_bloco"),
  usaGrade: text("usa_grade"),
  ordemNoBloco: integer("ordem_no_bloco"),
  prioridade: text("prioridade"),
  exigeValidacaoHumana: text("exige_validacao_humana"),
  sexoAplicavel: text("sexo_aplicavel"),
  exameDeRastreio: text("exame_de_rastreio"),
  exameDeSeguimento: text("exame_de_seguimento"),
  finalidadePrincipal: text("finalidade_principal"),
  finalidadeSecundaria: text("finalidade_secundaria"),
  objetivoPratico: text("objetivo_pratico"),
  corpoPedido: text("corpo_pedido"),
  preparo: text("preparo"),
  b1: text("b1"),
  b2: text("b2"),
  b3: text("b3"),
  b4: text("b4"),
  seq: text("seq"),
  dados: jsonb("dados"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Analitos (chave: codigo) ----
export const catalogoAnalitosTable = pgTable("catalogo_analitos", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nome: text("nome"),
  sinonimos: jsonb("sinonimos"),
  grupo: text("grupo"),
  unidadePadraoIntegrativa: text("unidade_padrao_integrativa"),
  tercoExcelente: text("terco_excelente"),
  observacaoClinica: text("observacao_clinica"),
  origemReferencia: text("origem_referencia"),
  ativo: boolean("ativo"),
  zonas: jsonb("zonas"),
  codigoSemanticoV4: text("codigo_semantico_v4"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Blocos (chave: codigo_bloco) ----
export const catalogoBlocosTable = pgTable("catalogo_blocos", {
  id: serial("id").primaryKey(),
  codigoBloco: text("codigo_bloco").notNull().unique(),
  nomeBloco: text("nome_bloco"),
  usaGrade: boolean("usa_grade"),
  grausDisponiveis: jsonb("graus_disponiveis"),
  tipoMacro: text("tipo_macro"),
  totalItensMapeados: integer("total_itens_mapeados"),
  observacao: text("observacao"),
  ativo: boolean("ativo"),
  codigoSemantico: text("codigo_semantico"),
  b1: text("b1"),
  b2: text("b2"),
  b3: text("b3"),
  b4: text("b4"),
  seq: text("seq"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Bloco x Exame = a GRADE (chave: bloco_id + nome_exame + grau) ----
export const catalogoBlocoExamesTable = pgTable(
  "catalogo_bloco_exames",
  {
    id: serial("id").primaryKey(),
    blocoId: text("bloco_id").notNull(),
    nomeBloco: text("nome_bloco"),
    usaGrade: boolean("usa_grade"),
    grau: text("grau").notNull(),
    ordemNoBloco: integer("ordem_no_bloco"),
    nomeExame: text("nome_exame").notNull(),
    codigoPadcom: text("codigo_padcom"),
    codigoLegado: text("codigo_legado"),
    ativo: boolean("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("bloco_exame_natural_uq").on(t.blocoId, t.nomeExame, t.grau)],
);

// ---- Direcao favoravel por exame (chave: nome_exame) ----
export const direcaoFavoravelExameTable = pgTable("direcao_favoravel_exame", {
  id: serial("id").primaryKey(),
  nomeExame: text("nome_exame").notNull().unique(),
  direcaoFavoravel: text("direcao_favoravel"),
  grupoExame: text("grupo_exame"),
  descricao: text("descricao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Endovenosos / soros (pai+filhos). Nenhum campo de negocio e unico
//      (codigo_padcom/codigo_semantico repetem por pai+componente) -> id_ihe. --
export const catalogoEndovenososTable = pgTable("catalogo_endovenosos", {
  id: serial("id").primaryKey(),
  idIhe: integer("id_ihe").notNull().unique(),
  codigoPadcom: text("codigo_padcom"),
  tipoLinha: text("tipo_linha"),
  nomeSoro: text("nome_soro"),
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
  frequenciaPadrao: text("frequencia_padrao"),
  complementar: text("complementar"),
  codigoSemantico: text("codigo_semantico"),
  b1: text("b1"),
  b2: text("b2"),
  b3: text("b3"),
  b4: text("b4"),
  seq: text("seq"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Anamnese: questionario_master. pergunta_id repete (Q030) -> id_ihe. ----
// ONDA 2 (aditivo): +sistema, +escala_validada, +peso_gravidade, +e_sinal_alarme,
// +opcoes (jsonb com alternativas + peso de cada uma). Nada dropado.
// idIhe agora aceita 0..n para perguntas NOVAS da mega-anamnese (nascidas no
// Manager, sem origem IHE) — mantemos unique para deduplicar import legado.
export const anamneseQuestionarioTable = pgTable("anamnese_questionario", {
  id: serial("id").primaryKey(),
  idIhe: integer("id_ihe").notNull().unique(),
  bloco: text("bloco"),
  perguntaId: text("pergunta_id"),
  pergunta: text("pergunta"),
  tipoResposta: text("tipo_resposta"),
  obrigatorio: text("obrigatorio"),
  exemplo: text("exemplo"),
  observacao: text("observacao"),
  aplicavelEm: jsonb("aplicavel_em"),
  // --- ONDA 2 (colunas novas, aditivas) ---
  sistema: text("sistema"),
  escalaValidada: text("escala_validada"),
  pesoGravidade: integer("peso_gravidade"),
  eSinalAlarme: boolean("e_sinal_alarme").default(false),
  opcoes: jsonb("opcoes"),
  // --- Humanizacao (colunas novas, aditivas) ---
  videoUrl: text("video_url"),
  dependeDe: jsonb("depende_de"),
  ordem: integer("ordem"),
  // --- Voz premium (colunas novas, aditivas) ---
  // voiceId: id da voz OpenAI (alloy, shimmer, nova, ...). voiceLabel: rotulo
  // amigavel exibido ao admin. audioUrl: caminho do mp3 no object storage.
  // audioStale=true significa "texto/voz mudou, audio precisa ser regerado".
  voiceId: text("voice_id"),
  voiceLabel: text("voice_label"),
  audioUrl: text("audio_url"),
  audioStale: boolean("audio_stale").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Doencas. codigo_doenca e codigo_semantico repetem/nulos -> id_ihe. ----
export const catalogoDoencasTable = pgTable("catalogo_doencas", {
  id: serial("id").primaryKey(),
  idIhe: integer("id_ihe").notNull().unique(),
  codigoDoenca: text("codigo_doenca"),
  grupo: text("grupo"),
  nomeDoenca: text("nome_doenca"),
  codigoLegado: text("codigo_legado"),
  eixo: text("eixo"),
  blocoMotor: text("bloco_motor"),
  blocosMotor: text("blocos_motor"),
  observacao: text("observacao"),
  ativo: boolean("ativo"),
  codigoSemantico: text("codigo_semantico"),
  codigoV14: text("codigo_v14"),
  b1: text("b1"),
  b2: text("b2"),
  b3: text("b3"),
  b4: text("b4"),
  seq: text("seq"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Sintomas (chave: codigo_semantico) ----
export const catalogoSintomasTable = pgTable("catalogo_sintomas", {
  id: serial("id").primaryKey(),
  codigoSemantico: text("codigo_semantico").notNull().unique(),
  nomeSintoma: text("nome_sintoma"),
  ativo: boolean("ativo"),
  b1: text("b1"),
  b2: text("b2"),
  b3: text("b3"),
  b4: text("b4"),
  seq: text("seq"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- CID-10 (chave: codigo) ----
export const catalogoCid10Table = pgTable("catalogo_cid10", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  capitulo: text("capitulo"),
  hdAssociadoPrincipal: text("hd_associado_principal"),
  descricaoOficial: text("descricao_oficial"),
  origem: text("origem"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Regras do motor. regra_id repete (3x) -> id_ihe. ----
export const motorRegrasTable = pgTable("motor_regras", {
  id: serial("id").primaryKey(),
  idIhe: integer("id_ihe").notNull().unique(),
  regraId: text("regra_id"),
  perguntaId: text("pergunta_id"),
  palavraChave: text("palavra_chave"),
  segmento: text("segmento"),
  codigoReferencia: text("codigo_referencia"),
  blocoReferencia: text("bloco_referencia"),
  prioridade: text("prioridade"),
  observacao: text("observacao"),
  ativo: text("ativo"),
  codigoReferenciaV4: text("codigo_referencia_v4"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Motor decisao clinica (chave: caso_id) ----
export const motorDecisaoClinicaTable = pgTable("motor_decisao_clinica", {
  id: serial("id").primaryKey(),
  casoId: text("caso_id").notNull().unique(),
  palavraChave: text("palavra_chave"),
  codigoDoenca: text("codigo_doenca"),
  eixo: text("eixo"),
  codigoExame: text("codigo_exame"),
  nomeExame: text("nome_exame"),
  codigoFormula: text("codigo_formula"),
  nomeFormula: text("nome_formula"),
  codigoInjetavel: text("codigo_injetavel"),
  nomeInjetavel: text("nome_injetavel"),
  codigoImplante: text("codigo_implante"),
  nomeImplante: text("nome_implante"),
  codigoProtocolo: text("codigo_protocolo"),
  nomeProtocolo: text("nome_protocolo"),
  valorExame: text("valor_exame"),
  valorFormula: text("valor_formula"),
  valorInjetavel: text("valor_injetavel"),
  valorImplante: text("valor_implante"),
  valorTotal: text("valor_total"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Mapa anamnese -> motor. Sem chave de negocio unica -> id_ihe. ----
export const mapaAnamneseMotorTable = pgTable("mapa_anamnese_motor", {
  id: serial("id").primaryKey(),
  idIhe: integer("id_ihe").notNull().unique(),
  perguntaId: text("pergunta_id"),
  palavraChave: text("palavra_chave"),
  codigoDoenca: text("codigo_doenca"),
  eixo: text("eixo"),
  codigoExame: text("codigo_exame"),
  nomeExame: text("nome_exame"),
  codigoFormula: text("codigo_formula"),
  nomeFormula: text("nome_formula"),
  codigoInjetavel: text("codigo_injetavel"),
  nomeInjetavel: text("nome_injetavel"),
  codigoImplante: text("codigo_implante"),
  nomeImplante: text("nome_implante"),
  codigoProtocolo: text("codigo_protocolo"),
  nomeProtocolo: text("nome_protocolo"),
  validacaoHumana: text("validacao_humana"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CatalogoExame = typeof catalogoExamesTable.$inferSelect;
export type CatalogoAnalito = typeof catalogoAnalitosTable.$inferSelect;
export type CatalogoBloco = typeof catalogoBlocosTable.$inferSelect;
export type CatalogoBlocoExame = typeof catalogoBlocoExamesTable.$inferSelect;
export type DirecaoFavoravelExame = typeof direcaoFavoravelExameTable.$inferSelect;
export type CatalogoEndovenoso = typeof catalogoEndovenososTable.$inferSelect;
export type AnamneseQuestionario = typeof anamneseQuestionarioTable.$inferSelect;
export type CatalogoDoenca = typeof catalogoDoencasTable.$inferSelect;
export type CatalogoSintoma = typeof catalogoSintomasTable.$inferSelect;
export type CatalogoCid10 = typeof catalogoCid10Table.$inferSelect;
export type MotorRegra = typeof motorRegrasTable.$inferSelect;
export type MotorDecisaoClinica = typeof motorDecisaoClinicaTable.$inferSelect;
export type MapaAnamneseMotor = typeof mapaAnamneseMotorTable.$inferSelect;
