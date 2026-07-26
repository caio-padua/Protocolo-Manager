/**
 * consumo — registro idempotente de evento cobravel (Onda 3 do Master Loop).
 *
 * Escrito pelo Dr. Claude para o Dr. Replit Manager usar direto.
 *
 * COMO USAR — uma linha em cada ponto onde a cadeia entrega valor:
 *
 *   // ao encaminhar a receita por um canal
 *   await registrarConsumo({
 *     empresaId,
 *     itemId: "encaminhamento_receita",
 *     unidade: "envio",
 *     chaveIdempotencia: `dispatch:${dispatchLogId}`,
 *     referencia: { canal, prescriptionId, clientId },
 *     origem: `dispatch_log:${dispatchLogId}`,
 *   });
 *
 * A CHAVE DE IDEMPOTENCIA E O PONTO INTEIRO
 * Ela deve derivar do EVENTO, nunca do relogio. `dispatch:1234` esta certo;
 * `Date.now()` esta errado — com o relogio, um retry vira cobranca nova, que e
 * exatamente o que se quer evitar. Boa chave: prefixo do tipo + id da linha que
 * originou o evento.
 */

import { db } from "@workspace/db";
import { consumoEventosTable } from "@workspace/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

export interface EntradaConsumo {
  empresaId: number;
  itemId: string;
  unidade: "mensagem" | "documento" | "envio" | "execucao" | "lembrete";
  quantidade?: number;
  custoUnitario?: string | null;
  chaveIdempotencia: string;
  referencia?: Record<string, unknown>;
  origem?: string;
  ocorridoEm?: Date;
}

/**
 * Registra um evento cobravel. Chamar a mesma chave mil vezes grava uma linha.
 *
 * Nunca lanca: medicao nao pode derrubar atendimento. Se o registro falhar, o
 * paciente ainda recebe a receita — perde-se a linha de cobranca, e o erro vai
 * para o log. A ordem de prioridade e essa mesmo.
 */
export async function registrarConsumo(
  entrada: EntradaConsumo,
): Promise<{ registrado: boolean; duplicado: boolean }> {
  try {
    // Guarda de existencia na aplicacao. O indice unico parcial sozinho nao
    // basta: no Postgres, NULL nao colide em UNIQUE, e uma chave vazia
    // passaria batido. As duas defesas juntas e que fecham o caso.
    if (!entrada.chaveIdempotencia?.trim()) {
      logger.error(
        { itemId: entrada.itemId, origem: entrada.origem },
        "registrarConsumo: chave de idempotencia vazia — evento NAO registrado",
      );
      return { registrado: false, duplicado: false };
    }

    const inserido = await db
      .insert(consumoEventosTable)
      .values({
        empresaId: entrada.empresaId,
        itemId: entrada.itemId,
        unidade: entrada.unidade,
        quantidade: entrada.quantidade ?? 1,
        custoUnitario: entrada.custoUnitario ?? null,
        chaveIdempotencia: entrada.chaveIdempotencia,
        referencia: entrada.referencia ?? {},
        origem: entrada.origem ?? null,
        ...(entrada.ocorridoEm ? { ocorridoEm: entrada.ocorridoEm } : {}),
      })
      // A corrida entre duas requisicoes simultaneas com a mesma chave morre
      // aqui, no banco — nao no if acima.
      .onConflictDoNothing({
        target: [consumoEventosTable.empresaId, consumoEventosTable.chaveIdempotencia],
      })
      .returning({ id: consumoEventosTable.id });

    const duplicado = inserido.length === 0;
    return { registrado: !duplicado, duplicado };
  } catch (err) {
    logger.error(
      { err, itemId: entrada.itemId, origem: entrada.origem },
      "registrarConsumo: falha ao gravar evento de consumo",
    );
    return { registrado: false, duplicado: false };
  }
}

/**
 * Estorno. Nao apaga nem altera a linha original — grava uma linha negativa,
 * como em contabilidade. O extrato continua contando a historia inteira.
 */
export async function estornarConsumo(
  chaveOriginal: string,
  empresaId: number,
  motivo: string,
): Promise<void> {
  const [original] = await db
    .select()
    .from(consumoEventosTable)
    .where(
      and(
        eq(consumoEventosTable.empresaId, empresaId),
        eq(consumoEventosTable.chaveIdempotencia, chaveOriginal),
      ),
    )
    .limit(1);

  if (!original) return;

  await registrarConsumo({
    empresaId,
    itemId: original.itemId,
    unidade: original.unidade as EntradaConsumo["unidade"],
    quantidade: -Math.abs(original.quantidade),
    custoUnitario: original.custoUnitario,
    chaveIdempotencia: `estorno:${chaveOriginal}`,
    referencia: { estornoDe: chaveOriginal, motivo },
    origem: `estorno:consumo_eventos:${original.id}`,
  });
}

export interface LinhaExtrato {
  itemId: string;
  unidade: string;
  total: number;
  custoTotal: string;
}

/**
 * O extrato do periodo. E a consulta que alimenta o Painel de Prova de Valor —
 * e, daqui a 60 dias, a peca que vende a primeira safra fundadora.
 */
export async function extratoDoPeriodo(
  empresaId: number,
  de: Date,
  ate: Date,
): Promise<LinhaExtrato[]> {
  const linhas = await db
    .select({
      itemId: consumoEventosTable.itemId,
      unidade: consumoEventosTable.unidade,
      total: sql<number>`sum(${consumoEventosTable.quantidade})::int`,
      custoTotal: sql<string>`coalesce(sum(${consumoEventosTable.quantidade} * ${consumoEventosTable.custoUnitario}), 0)::text`,
    })
    .from(consumoEventosTable)
    .where(
      and(
        eq(consumoEventosTable.empresaId, empresaId),
        gte(consumoEventosTable.ocorridoEm, de),
        lte(consumoEventosTable.ocorridoEm, ate),
      ),
    )
    .groupBy(consumoEventosTable.itemId, consumoEventosTable.unidade);

  return linhas;
}
