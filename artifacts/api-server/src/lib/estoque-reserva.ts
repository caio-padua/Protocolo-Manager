import { sql, type SQL } from "drizzle-orm";

/**
 * Estoque estático x dinâmico.
 *  - Físico  = soma das quantidades dos lotes (stock_items). Só diminui quando a aplicação é confirmada.
 *  - Dinâmico = reservado para protocolos confirmados e ainda não aplicado.
 *  - Estático = físico − dinâmico = o que está livre para novos protocolos (negativo = falta comprar).
 * Reservar NÃO mexe no físico; aplicar tira do dinâmico e do lote (o que vence primeiro). Tudo no livro
 * estoque_movimentos, com chave de idempotência: repetir a chamada nunca baixa duas vezes.
 * Regra de unidade: 1 unidade (ampola, frasco ou implante) por aplicação.
 */
export type Executor = { execute(consulta: SQL): Promise<{ rows: any[] }> };

export type ResultadoReserva = { reservas: number; unidades: number };

/** Reserva as unidades restantes de cada item do protocolo. Idempotente por item. */
export async function reservarProtocolo(tx: Executor, protocolId: number): Promise<ResultadoReserva> {
  const prot = (await tx.execute(sql`SELECT id, empresa_id, client_id FROM protocols WHERE id=${protocolId}`)).rows[0];
  if (!prot || prot.empresa_id == null) return { reservas: 0, unidades: 0 };
  const itens = (await tx.execute(sql`
    SELECT id, substance_id, total_sessions, completed_sessions FROM protocol_items WHERE protocol_id=${protocolId} ORDER BY id`)).rows;
  let reservas = 0, unidades = 0;
  for (const it of itens) {
    const qtd = Number(it.total_sessions) - Number(it.completed_sessions ?? 0);
    if (!(qtd > 0)) continue;
    const nova = (await tx.execute(sql`
      INSERT INTO estoque_reservas (empresa_id, protocol_id, protocol_item_id, client_id, substance_id, quantidade_reservada)
      VALUES (${prot.empresa_id}, ${protocolId}, ${it.id}, ${prot.client_id}, ${it.substance_id}, ${qtd})
      ON CONFLICT (protocol_item_id) DO NOTHING RETURNING id`)).rows[0];
    if (!nova) continue;
    await tx.execute(sql`
      INSERT INTO estoque_movimentos (empresa_id, substance_id, tipo, quantidade, reserva_id, protocol_id, chave_idempotencia)
      VALUES (${prot.empresa_id}, ${it.substance_id}, 'RESERVA', ${qtd}, ${nova.id}, ${protocolId}, ${`reserva:item:${it.id}`})
      ON CONFLICT (chave_idempotencia) DO NOTHING`);
    reservas++; unidades += qtd;
  }
  return { reservas, unidades };
}

export type ResultadoBaixa =
  | { ok: true; jaRegistrada: boolean; baixaFisica: boolean; lote: string | null }
  | { ok: false; motivo: string };

/**
 * Registra a saída de UMA unidade quando a aplicação é confirmada como feita.
 * Sem reserva (protocolo confirmado antes deste recurso): cria a reserva das unidades restantes e baixa em seguida.
 * Sem lote com saldo: o dinâmico baixa mesmo assim e o movimento fica sem lote (aparece como pendência de conferência).
 */
export async function consumirAplicacao(tx: Executor, applicationId: number): Promise<ResultadoBaixa> {
  const chave = `consumo:app:${applicationId}`;
  const ja = (await tx.execute(sql`SELECT 1 FROM estoque_movimentos WHERE chave_idempotencia=${chave}`)).rows[0];
  if (ja) return { ok: true, jaRegistrada: true, baixaFisica: false, lote: null };

  const app = (await tx.execute(sql`
    SELECT a.id, a.substance_id, a.status, s.protocol_id, s.empresa_id
      FROM substance_applications a JOIN sessions s ON s.id=a.session_id WHERE a.id=${applicationId}`)).rows[0];
  if (!app) return { ok: false, motivo: "aplicação não encontrada" };
  if (app.status !== "applied") return { ok: false, motivo: "a aplicação não está confirmada como feita" };
  if (app.protocol_id == null || app.empresa_id == null) return { ok: false, motivo: "aplicação sem protocolo ou sem clínica" };

  const buscar = async () => (await tx.execute(sql`
    SELECT id, empresa_id FROM estoque_reservas
     WHERE protocol_id=${app.protocol_id} AND substance_id=${app.substance_id} AND status='ativa'
       AND quantidade_consumida + quantidade_liberada < quantidade_reservada
     ORDER BY id LIMIT 1 FOR UPDATE`)).rows[0];
  let reserva = await buscar();
  if (!reserva) { await reservarProtocolo(tx, Number(app.protocol_id)); reserva = await buscar(); }
  if (!reserva) return { ok: false, motivo: "sem unidade reservada para esta substância no protocolo" };
  if (Number(reserva.empresa_id) !== Number(app.empresa_id)) return { ok: false, motivo: "reserva de outra clínica" };

  // Lote que vence primeiro (FEFO). Data de validade vazia vai por último.
  const lote = (await tx.execute(sql`
    SELECT id, lot FROM stock_items
     WHERE substance_id=${app.substance_id} AND empresa_id=${app.empresa_id} AND quantity >= 1
     ORDER BY expiration_date ASC NULLS LAST, id ASC LIMIT 1 FOR UPDATE`)).rows[0];
  if (lote) await tx.execute(sql`UPDATE stock_items SET quantity = quantity - 1, updated_at = now() WHERE id=${lote.id}`);

  await tx.execute(sql`
    UPDATE estoque_reservas SET quantidade_consumida = quantidade_consumida + 1,
           status = CASE WHEN quantidade_consumida + 1 + quantidade_liberada >= quantidade_reservada THEN 'concluida' ELSE status END,
           atualizado_em = now()
     WHERE id=${reserva.id}`);
  await tx.execute(sql`
    INSERT INTO estoque_movimentos (empresa_id, substance_id, tipo, quantidade, reserva_id, stock_item_id, lote, protocol_id, application_id, chave_idempotencia)
    VALUES (${app.empresa_id}, ${app.substance_id}, 'CONSUMO', 1, ${reserva.id}, ${lote?.id ?? null}, ${lote?.lot ?? null},
            ${app.protocol_id}, ${applicationId}, ${chave})`);
  return { ok: true, jaRegistrada: false, baixaFisica: !!lote, lote: lote?.lot ?? null };
}

/** Devolve ao estático o que ainda estava reservado (protocolo cancelado ou encerrado). Idempotente. */
export async function liberarReservaProtocolo(tx: Executor, protocolId: number, empresaId: number): Promise<{ liberadas: number; unidades: number }> {
  const abertas = (await tx.execute(sql`
    SELECT id, substance_id, quantidade_reservada, quantidade_consumida, quantidade_liberada
      FROM estoque_reservas WHERE protocol_id=${protocolId} AND empresa_id=${empresaId} AND status='ativa' FOR UPDATE`)).rows;
  let unidades = 0, liberadas = 0;
  for (const r of abertas) {
    const resta = Number(r.quantidade_reservada) - Number(r.quantidade_consumida) - Number(r.quantidade_liberada);
    if (resta <= 0) continue;
    await tx.execute(sql`
      UPDATE estoque_reservas SET quantidade_liberada = quantidade_liberada + ${resta}, status='liberada', atualizado_em=now() WHERE id=${r.id}`);
    await tx.execute(sql`
      INSERT INTO estoque_movimentos (empresa_id, substance_id, tipo, quantidade, reserva_id, protocol_id, chave_idempotencia)
      VALUES (${empresaId}, ${r.substance_id}, 'LIBERACAO', ${resta}, ${r.id}, ${protocolId}, ${`liberacao:reserva:${r.id}`})
      ON CONFLICT (chave_idempotencia) DO NOTHING`);
    liberadas++; unidades += resta;
  }
  return { liberadas, unidades };
}

export type SaldoSubstancia = {
  substanciaId: number; nome: string; fisico: number; dinamico: number; estatico: number; falta: number; minimo: number; semLote: number;
};

/** Saldos por substância da clínica. Só aparece quem tem lote ou reserva. */
export async function saldosPorSubstancia(db: Executor, empresaId: number): Promise<SaldoSubstancia[]> {
  const r = await db.execute(sql`
    WITH fis AS (
      SELECT substance_id, SUM(quantity)::float AS fisico, SUM(minimum_stock)::float AS minimo
        FROM stock_items WHERE empresa_id=${empresaId} GROUP BY substance_id),
    din AS (
      SELECT substance_id, SUM(quantidade_reservada - quantidade_consumida - quantidade_liberada)::int AS dinamico
        FROM estoque_reservas WHERE empresa_id=${empresaId} AND status='ativa' GROUP BY substance_id),
    sl AS (
      SELECT substance_id, COUNT(*)::int AS n FROM estoque_movimentos
       WHERE empresa_id=${empresaId} AND tipo='CONSUMO' AND stock_item_id IS NULL GROUP BY substance_id)
    SELECT s.id AS "substanciaId", s.name AS nome, COALESCE(f.fisico,0) AS fisico, COALESCE(d.dinamico,0) AS dinamico,
           COALESCE(f.minimo,0) AS minimo, COALESCE(sl.n,0) AS "semLote"
      FROM substances s
      LEFT JOIN fis f ON f.substance_id=s.id LEFT JOIN din d ON d.substance_id=s.id LEFT JOIN sl ON sl.substance_id=s.id
     WHERE f.substance_id IS NOT NULL OR d.substance_id IS NOT NULL
     ORDER BY s.name`);
  return r.rows.map((x) => {
    const fisico = Number(x.fisico), dinamico = Number(x.dinamico), estatico = fisico - dinamico;
    return { substanciaId: Number(x.substanciaId), nome: x.nome, fisico, dinamico, estatico, falta: Math.max(0, -estatico), minimo: Number(x.minimo), semLote: Number(x.semLote) };
  });
}
