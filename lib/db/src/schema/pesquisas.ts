import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ============================================================================
// CENTRAL DE PESQUISA (Apify) — Task 235.
//
// Estrutura GENERICA e EXTENSIVEL: cada linha e "1 pesquisa disparada", seja
// qual for o tipo. O primeiro uso e "preco_insumo" (preco medio de um alimento
// do catalogo de Dieta numa cidade), mas a tabela nao amarra nada especifico
// de Dieta — parametros/resultado ficam em jsonb, moldados pelo `tipo`.
//
// Uso futuro ja prancheado (fora do escopo desta tarefa): localizar clientes
// em potencial por bairro. Quando existir, basta somar um novo valor a
// PESQUISA_TIPOS + um novo actor no Cofre de Integracoes — a tabela e as
// rotas genericas (GET/POST /api/pesquisas) nao mudam.
// ============================================================================

// Tipos de pesquisa reconhecidos. Tupla extensivel: somar um valor aqui e o
// unico passo de schema para caber um novo tipo (ex.: "cliente_potencial_bairro").
export const PESQUISA_TIPOS = ["preco_insumo"] as const;
export type PesquisaTipo = (typeof PESQUISA_TIPOS)[number];

// Status do ciclo de vida assincrono (dispara no Apify, acompanha, finaliza).
export const PESQUISA_STATUS = ["em_andamento", "concluida", "erro"] as const;
export type PesquisaStatus = (typeof PESQUISA_STATUS)[number];

// ---- Parametros por tipo (jsonb "parametros") ----
// preco_insumo: alimento do catalogo de Dieta + cidade/regiao informada.
export interface PesquisaPrecoInsumoParametros {
  alimentoId: number;
  alimentoNome: string; // denormalizado (auditoria/exibicao no historico mesmo se o alimento mudar de nome)
  cidade: string;
}
export type PesquisaParametros = PesquisaPrecoInsumoParametros | Record<string, unknown>;

// ---- Resultado resumido por tipo (jsonb "resultado_resumo") ----
// preco_insumo: preco medio calculado + as amostras (achados brutos) usadas na conta.
export interface PesquisaPrecoInsumoAmostra {
  preco: number; // em R$
  contexto: string; // trecho de texto de onde o preco foi extraido (auditoria humana)
  fonte?: string; // URL/titulo do resultado, quando disponivel no dataset do Apify
}
export interface PesquisaPrecoInsumoResultado {
  precoMedio: number; // em R$
  amostras: PesquisaPrecoInsumoAmostra[];
}
export type PesquisaResultadoResumo = PesquisaPrecoInsumoResultado | Record<string, unknown>;

export const pesquisasTable = pgTable("pesquisas", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull().$type<PesquisaTipo>(), // um de PESQUISA_TIPOS
  status: text("status").notNull().default("em_andamento").$type<PesquisaStatus>(),

  // Entrada — moldada pelo `tipo` (ver PesquisaParametros acima).
  parametros: jsonb("parametros").notNull().$type<PesquisaParametros>(),

  // Acompanhamento do robo Apify (identificadores da execucao assincrona).
  apifyActorId: text("apify_actor_id"),
  apifyRunId: text("apify_run_id"),
  apifyDatasetId: text("apify_dataset_id"),

  // Saida — resumo pronto para a tela (ver PesquisaResultadoResumo) + o dataset
  // bruto devolvido pelo Apify (auditoria/depuracao, nunca exibido cru na tela).
  resultadoResumo: jsonb("resultado_resumo").$type<PesquisaResultadoResumo>(),
  resultadoBruto: jsonb("resultado_bruto"),
  erro: text("erro"), // preenchido quando status = 'erro'

  // Quem pediu (referencia solta — sobrevive a delecao/edicao do colaborador,
  // igual ao padrao ja usado em outras tabelas de auditoria do projeto).
  solicitadoPorId: integer("solicitado_por_id"),
  solicitadoPorNome: text("solicitado_por_nome"),

  // Quando o resultado foi aplicado ao catalogo (null = ainda nao aplicado).
  aplicadoEm: timestamp("aplicado_em", { withTimezone: true }),

  // Lineage de "refazer": aponta para a pesquisa original quando esta linha
  // nasceu de um clique em "Refazer" sobre uma pesquisa com erro. Sem FK dura
  // de proposito (Regra de Ouro: o historico nunca deve travar por causa de
  // uma linha antiga; e so trilha de auditoria, nao integridade referencial).
  origemPesquisaId: integer("origem_pesquisa_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("pesquisas_tipo_idx").on(t.tipo),
  index("pesquisas_status_idx").on(t.status),
  index("pesquisas_created_at_idx").on(t.createdAt),
]);

// ---- Insert schema + tipos derivados ----
export const insertPesquisaSchema = createInsertSchema(pesquisasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPesquisa = z.infer<typeof insertPesquisaSchema>;
export type Pesquisa = typeof pesquisasTable.$inferSelect;

// Validacao de entrada especifica do tipo "preco_insumo" (usada na rota de
// criacao antes de gravar `parametros`, ja que jsonb nao e tipado pelo Postgres).
export const pesquisaPrecoInsumoParametrosSchema = z.object({
  alimentoId: z.number().int().positive(),
  alimentoNome: z.string().min(1),
  cidade: z.string().min(1),
});
