/**
 * consumo_eventos — o livro-caixa do sistema (Onda 3 do Master Loop).
 *
 * Escrito pelo Dr. Claude para o Dr. Replit Manager usar direto.
 *
 * POR QUE LIVRO-CAIXA E NAO CONTADOR
 * Um contador (`mensagens = mensagens + 1`) nao se audita e nao se contesta.
 * Quando a clinica licenciada disser "nao usei 4.000 mensagens", a resposta
 * precisa ser 4.000 linhas com data, hora e canal. Por isso: APPEND-ONLY.
 * Linha de consumo nunca e alterada nem apagada; estorno entra como linha
 * nova com quantidade negativa.
 *
 * POR QUE ISTO IMPORTA ANTES DE EXISTIR CLIENTE
 * Nos proximos 60 dias esta tabela nao serve para faturar — serve para VENDER.
 * E dela que sai o extrato do Painel de Prova de Valor: "847 receitas
 * entregues, 100% confirmadas, 312 duvidas respondidas sem o medico tocar no
 * telefone". Nenhum concorrente consegue mostrar esse numero, porque nenhum
 * executa a cadeia inteira. Nao se fatura, e nao se vende, o que nao se mediu.
 */

import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const consumoEventosTable = pgTable(
  "consumo_eventos",
  {
    id: serial("id").primaryKey(),

    // De quem e o consumo. Sem isto nao ha para quem faturar nem de quem
    // mostrar o extrato.
    empresaId: integer("empresa_id").notNull(),

    // O que foi consumido. Bate com o catalogo de itens licenciaveis.
    // Ex.: "mensagem_ia", "encaminhamento_receita", "lembrete_dose",
    //      "assinatura_documento", "exame_ocr".
    itemId: text("item_id").notNull(),

    // Unidade contada: mensagem | documento | envio | execucao | lembrete
    unidade: text("unidade").notNull(),
    quantidade: integer("quantidade").notNull().default(1),

    // Preco congelado NO MOMENTO do evento. Nunca recalculado: o preco de
    // tabela muda, a fatura de marco nao pode mudar junto.
    custoUnitario: numeric("custo_unitario", { precision: 12, scale: 4 }),
    moeda: text("moeda").notNull().default("BRL"),

    // Impede que uma repeticao de chamada vire cobranca dobrada.
    // ATENCAO: no Postgres, NULL nao colide em indice UNIQUE. Por isso o
    // indice abaixo e PARCIAL, e a aplicacao ainda precisa da guarda de
    // existencia (ver registrarConsumo em lib/consumo.ts). Indice sozinho
    // nao garante idempotencia.
    chaveIdempotencia: text("chave_idempotencia"),

    // Rastro para o extrato: canal do envio, id do documento, id do paciente.
    // Nunca guardar conteudo clinico aqui — isto e registro de cobranca.
    referencia: jsonb("referencia").$type<Record<string, unknown>>().default({}),

    // Quem originou. Ex.: "dispatch_log:1234", "agente_messages:987".
    origem: text("origem"),

    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Indice UNICO PARCIAL: linhas antigas sem chave nao quebram o indice.
    idempotenciaUnica: uniqueIndex("consumo_eventos_idempotencia_unica")
      .on(t.empresaId, t.chaveIdempotencia)
      .where(sql`${t.chaveIdempotencia} IS NOT NULL`),

    // O extrato sempre pergunta "desta clinica, neste periodo".
    porEmpresaEData: index("consumo_eventos_empresa_data").on(
      t.empresaId,
      t.ocorridoEm,
    ),
    porItem: index("consumo_eventos_empresa_item").on(t.empresaId, t.itemId),
  }),
);

export type ConsumoEvento = typeof consumoEventosTable.$inferSelect;
export type NovoConsumoEvento = typeof consumoEventosTable.$inferInsert;

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * MIGRATION — rodar como SQL direto. NUNCA `db push` em tabela populada.
 *
 * As tres colunas nas tabelas de evento ja existentes. Somente ADD COLUMN,
 * nunca DROP nem ALTER — Regra de Ouro da casa.
 *
 *   ALTER TABLE dispatch_log
 *     ADD COLUMN IF NOT EXISTS empresa_id        INTEGER,
 *     ADD COLUMN IF NOT EXISTS custo_unitario    NUMERIC(12,4),
 *     ADD COLUMN IF NOT EXISTS chave_idempotencia TEXT;
 *
 *   ALTER TABLE mensageria_lembrete
 *     ADD COLUMN IF NOT EXISTS empresa_id        INTEGER,
 *     ADD COLUMN IF NOT EXISTS custo_unitario    NUMERIC(12,4),
 *     ADD COLUMN IF NOT EXISTS chave_idempotencia TEXT;
 *
 *   ALTER TABLE agente_messages
 *     ADD COLUMN IF NOT EXISTS empresa_id        INTEGER,
 *     ADD COLUMN IF NOT EXISTS custo_unitario    NUMERIC(12,4),
 *     ADD COLUMN IF NOT EXISTS chave_idempotencia TEXT;
 *
 *   -- Backfill: tudo que existe hoje e do Instituto Padua.
 *   UPDATE dispatch_log         SET empresa_id = 5 WHERE empresa_id IS NULL;
 *   UPDATE mensageria_lembrete  SET empresa_id = 5 WHERE empresa_id IS NULL;
 *   UPDATE agente_messages      SET empresa_id = 5 WHERE empresa_id IS NULL;
 *
 *   -- Indices parciais, pelo mesmo motivo do NULL em UNIQUE.
 *   CREATE UNIQUE INDEX IF NOT EXISTS dispatch_log_idem
 *     ON dispatch_log (empresa_id, chave_idempotencia)
 *     WHERE chave_idempotencia IS NOT NULL;
 *
 *   CREATE UNIQUE INDEX IF NOT EXISTS mensageria_lembrete_idem
 *     ON mensageria_lembrete (empresa_id, chave_idempotencia)
 *     WHERE chave_idempotencia IS NOT NULL;
 *
 *   CREATE UNIQUE INDEX IF NOT EXISTS agente_messages_idem
 *     ON agente_messages (empresa_id, chave_idempotencia)
 *     WHERE chave_idempotencia IS NOT NULL;
 *
 * Nao esquecer de exportar esta tabela em lib/db/src/schema/index.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */
