/**
 * avatar-campanha-worker.ts
 *
 * Gerencia campanhas de avatar (voz/vídeo) para listas de clientes.
 * Persiste cada item na tabela avatar_campanha_itens ANTES de processar,
 * garantindo que o worker retome envios pendentes após restart do servidor.
 *
 * Tabelas (criadas em boot via CREATE TABLE IF NOT EXISTS):
 *   avatar_campanhas       — registro da campanha (metadata)
 *   avatar_campanha_itens  — um item por cliente, com status individual
 *
 * Segurança:
 *   buscarProgressoCampanha() exige empresaId — sem ele não retorna dados (anti-IDOR).
 *
 * Concorrência:
 *   Worker usa claim atômico via UPDATE ... RETURNING (FOR UPDATE SKIP LOCKED)
 *   para que ticks sobrepostos não enviem o mesmo item duas vezes.
 *
 * Retry:
 *   - Item vai para status='processando' ao ser reivindicado (claim).
 *   - Se o envio falha E tentativas < MAX_TENTATIVAS: volta para 'pendente' (retry).
 *   - Só vira 'erro' definitivo ao esgotar MAX_TENTATIVAS.
 */

import { db }      from "@workspace/db";
import { sql }     from "drizzle-orm";
import { enviarMensagemPaxter } from "./messaging/engine";
import { logger }  from "./logger";
import { postSlackAlert } from "./slack-reporter";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_TENTATIVAS = 3;  // tentativas totais antes de marcar 'erro' definitivo
const LOTE_POR_TICK  = 10; // itens reivindicados por tick de cron (claim atômico)

// ─── Garantia de schema ───────────────────────────────────────────────────────

let schemaOk = false;

export async function ensureCampanhaSchema(): Promise<void> {
  if (schemaOk) return;
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS avatar_campanhas (
      id              TEXT PRIMARY KEY,
      empresa_id      INTEGER NOT NULL,
      avatar_id       INTEGER NOT NULL,
      canal           TEXT NOT NULL DEFAULT 'VOICE',
      texto           TEXT NOT NULL,
      total           INTEGER NOT NULL DEFAULT 0,
      enviados        INTEGER NOT NULL DEFAULT 0,
      erros           INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'em_andamento',
      campanha_pai_id TEXT REFERENCES avatar_campanhas(id),
      criado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      concluido_at    TIMESTAMPTZ
    )
  `));
  // Adiciona campanha_pai_id se a tabela já existia sem a coluna (idempotente)
  await db.execute(sql.raw(`
    ALTER TABLE avatar_campanhas
    ADD COLUMN IF NOT EXISTS campanha_pai_id TEXT REFERENCES avatar_campanhas(id)
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS avatar_campanha_itens (
      id            SERIAL PRIMARY KEY,
      campanha_id   TEXT NOT NULL REFERENCES avatar_campanhas(id) ON DELETE CASCADE,
      cliente_id    INTEGER NOT NULL,
      telefone      TEXT,
      email         TEXT,
      nome          TEXT,
      status        TEXT NOT NULL DEFAULT 'pendente',
      tentativas    INTEGER NOT NULL DEFAULT 0,
      erro          TEXT,
      enviado_at    TIMESTAMPTZ,
      claimed_at    TIMESTAMPTZ,
      criado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `));
  // Adiciona claimed_at se a tabela já existia sem a coluna (idempotente)
  await db.execute(sql.raw(`
    ALTER TABLE avatar_campanha_itens
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ
  `));
  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_campanha_itens_status
    ON avatar_campanha_itens (campanha_id, status)
  `));
  schemaOk = true;
}

// ─── Criar campanha + itens no DB ────────────────────────────────────────────

export interface ClienteParaCampanha {
  id:       number;
  phone:    string | null;
  email:    string | null;
  name:     string;
  empresaId?: number | null;
}

export async function criarCampanha(opts: {
  campaignId:     string;
  empresaId:      number;
  avatarId:       number;
  canal:          "VOICE" | "VIDEO";
  texto:          string;
  clientes:       ClienteParaCampanha[];
  campanhaPaiId?: string | null;
}): Promise<void> {
  await ensureCampanhaSchema();

  await db.execute(sql.raw(`
    INSERT INTO avatar_campanhas (id, empresa_id, avatar_id, canal, texto, total, campanha_pai_id)
    VALUES (
      ${escapeStr(opts.campaignId)},
      ${opts.empresaId},
      ${opts.avatarId},
      ${escapeStr(opts.canal)},
      ${escapeStr(opts.texto)},
      ${opts.clientes.length},
      ${opts.campanhaPaiId ? escapeStr(opts.campanhaPaiId) : "NULL"}
    )
  `));

  if (opts.clientes.length === 0) return;

  const values = opts.clientes
    .map(c => `(
      ${escapeStr(opts.campaignId)},
      ${c.id},
      ${c.phone ? escapeStr(c.phone) : "NULL"},
      ${c.email ? escapeStr(c.email) : "NULL"},
      ${escapeStr(c.name ?? "")},
      'pendente'
    )`)
    .join(",\n");

  await db.execute(sql.raw(`
    INSERT INTO avatar_campanha_itens
      (campanha_id, cliente_id, telefone, email, nome, status)
    VALUES ${values}
  `));
}

// ─── Buscar progresso (com verificação de ownership — anti-IDOR) ──────────────

export interface CampanhaProgresso {
  id:           string;
  canal:        string;
  total:        number;
  enviados:     number;
  erros:        number;
  pendentes:    number;
  status:       string;
  criadoAt:     string;
  concluidoAt:  string | null;
}

/**
 * Busca o progresso de uma campanha. O parâmetro `empresaId` é obrigatório
 * e é usado como filtro — sem ele a função retorna null (anti-IDOR).
 */
export async function buscarProgressoCampanha(
  campaignId: string,
  empresaId:  number,
): Promise<CampanhaProgresso | null> {
  await ensureCampanhaSchema();
  const rows = await db.execute(sql.raw(`
    SELECT
      c.id, c.canal, c.total, c.status,
      c.criado_at, c.concluido_at,
      COUNT(i.id) FILTER (WHERE i.status = 'enviado')      AS enviados,
      COUNT(i.id) FILTER (WHERE i.status = 'erro')         AS erros,
      COUNT(i.id) FILTER (WHERE i.status IN ('pendente','processando')) AS pendentes
    FROM avatar_campanhas c
    LEFT JOIN avatar_campanha_itens i ON i.campanha_id = c.id
    WHERE c.id = ${escapeStr(campaignId)}
      AND c.empresa_id = ${empresaId}
    GROUP BY c.id
  `));
  if (!rows.rows[0]) return null;
  const r = rows.rows[0] as any;
  return {
    id:          String(r.id),
    canal:       String(r.canal),
    total:       Number(r.total),
    enviados:    Number(r.enviados  ?? 0),
    erros:       Number(r.erros     ?? 0),
    pendentes:   Number(r.pendentes ?? 0),
    status:      String(r.status),
    criadoAt:    String(r.criado_at),
    concluidoAt: r.concluido_at ? String(r.concluido_at) : null,
  };
}

// ─── Worker: claim atômico + processamento ────────────────────────────────────

interface ItemReivindicado {
  id:          number;
  campanhaId:  string;
  clienteId:   number;
  telefone:    string | null;
  email:       string | null;
  nome:        string | null;
  tentativas:  number;
  // vindos do JOIN com avatar_campanhas
  empresaId:   number;
  avatarId:    number;
  canal:       string;
  texto:       string;
}

/** Tempo máximo (ms) que um item pode ficar em 'processando' antes de ser considerado órfão. */
const LEASE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Reseta para 'pendente' qualquer item que ficou em 'processando' por mais de
 * LEASE_TIMEOUT_MS (indica crash entre o claim e o marcarEnviado/marcarFalha).
 * Deve ser chamado no início de cada tick, antes do claim.
 */
async function resetarLeaseExpirado(): Promise<number> {
  const result = await db.execute(sql.raw(`
    UPDATE avatar_campanha_itens
    SET status = 'pendente', claimed_at = NULL
    WHERE status = 'processando'
      AND claimed_at IS NOT NULL
      AND claimed_at < NOW() - INTERVAL '${LEASE_TIMEOUT_MS} milliseconds'
    RETURNING id
  `));
  return result.rows.length;
}

/**
 * Reivindica atomicamente até LOTE_POR_TICK itens pendentes.
 * Usa UPDATE ... RETURNING com FOR UPDATE SKIP LOCKED para que ticks
 * simultâneos não peguem os mesmos itens.
 * Status muda de 'pendente' → 'processando' e registra claimed_at = NOW().
 * Se o processo cair antes de marcarEnviado/marcarFalha, resetarLeaseExpirado()
 * no próximo tick devolve o item para 'pendente' automaticamente.
 */
async function reivindicarItens(): Promise<ItemReivindicado[]> {
  // Subquery com FOR UPDATE SKIP LOCKED garante claim exclusivo por item
  const result = await db.execute(sql.raw(`
    WITH claimed AS (
      UPDATE avatar_campanha_itens
      SET status = 'processando', claimed_at = NOW()
      WHERE id IN (
        SELECT i.id
        FROM avatar_campanha_itens i
        JOIN avatar_campanhas c ON c.id = i.campanha_id
        WHERE i.status = 'pendente'
          AND i.tentativas < ${MAX_TENTATIVAS}
          AND c.status = 'em_andamento'
        ORDER BY i.id ASC
        LIMIT ${LOTE_POR_TICK}
        FOR UPDATE OF i SKIP LOCKED
      )
      RETURNING id
    )
    SELECT
      i.id, i.campanha_id, i.cliente_id, i.telefone, i.email, i.nome, i.tentativas,
      c.empresa_id, c.avatar_id, c.canal, c.texto
    FROM claimed cl
    JOIN avatar_campanha_itens i ON i.id = cl.id
    JOIN avatar_campanhas c ON c.id = i.campanha_id
  `));
  return (result.rows as any[]).map(r => ({
    id:         Number(r.id),
    campanhaId: String(r.campanha_id),
    clienteId:  Number(r.cliente_id),
    telefone:   r.telefone  ?? null,
    email:      r.email     ?? null,
    nome:       r.nome      ?? null,
    tentativas: Number(r.tentativas ?? 0),
    empresaId:  Number(r.empresa_id),
    avatarId:   Number(r.avatar_id),
    canal:      String(r.canal),
    texto:      String(r.texto),
  }));
}

async function marcarEnviado(id: number): Promise<void> {
  await db.execute(sql.raw(`
    UPDATE avatar_campanha_itens
    SET status = 'enviado', tentativas = tentativas + 1, enviado_at = NOW()
    WHERE id = ${id}
  `));
}

async function marcarFalha(id: number, tentativasAtuais: number, erro: string): Promise<void> {
  const statusFinal = (tentativasAtuais + 1) >= MAX_TENTATIVAS ? "erro" : "pendente";
  const erroCleaned = erro.slice(0, 500).replace(/'/g, "''");
  await db.execute(sql.raw(`
    UPDATE avatar_campanha_itens
    SET status = '${statusFinal}',
        tentativas = tentativas + 1,
        erro = '${erroCleaned}'
    WHERE id = ${id}
  `));
}

async function recalcularCampanha(campanhaId: string): Promise<void> {
  const result = await db.execute(sql.raw(`
    UPDATE avatar_campanhas c
    SET
      enviados = sub.enviados,
      erros    = sub.erros,
      status   = CASE
        WHEN sub.pendentes = 0 AND sub.processando = 0 THEN 'concluida'
        ELSE 'em_andamento'
      END,
      concluido_at = CASE
        WHEN sub.pendentes = 0 AND sub.processando = 0 AND c.concluido_at IS NULL THEN NOW()
        ELSE c.concluido_at
      END
    FROM (
      SELECT
        campanha_id,
        COUNT(*) FILTER (WHERE status = 'enviado')     AS enviados,
        COUNT(*) FILTER (WHERE status = 'erro')        AS erros,
        COUNT(*) FILTER (WHERE status = 'pendente')    AS pendentes,
        COUNT(*) FILTER (WHERE status = 'processando') AS processando
      FROM avatar_campanha_itens
      WHERE campanha_id = ${escapeStr(campanhaId)}
      GROUP BY campanha_id
    ) sub
    WHERE c.id = sub.campanha_id
    RETURNING c.id, c.canal, c.total, c.enviados, c.erros, c.status, c.concluido_at
  `));

  // Disparar alerta Slack quando a campanha ACABOU DE SER concluída com erros.
  // Detectamos "acabou de ser" verificando que concluido_at foi atribuído agora
  // (dentro dos últimos 10 segundos) — garante que o alerta dispara apenas uma vez.
  const row = result.rows[0] as any;
  if (
    row &&
    row.status === "concluida" &&
    Number(row.erros) > 0 &&
    row.concluido_at
  ) {
    const concluidoAt = new Date(row.concluido_at);
    const agoraDiff   = Date.now() - concluidoAt.getTime();
    if (agoraDiff < 10_000) {
      // Campanha acabou de concluir — buscar os primeiros 5 clientes que falharam
      void notificarCampanhaComErros(
        campanhaId,
        String(row.canal ?? ""),
        Number(row.total   ?? 0),
        Number(row.enviados ?? 0),
        Number(row.erros    ?? 0),
      ).catch((e: any) =>
        logger.warn({ err: e?.message }, "[campanha-worker] falha ao enviar alerta Slack"),
      );
    }
  }
}

/**
 * Envia alerta Slack ao CEO quando uma campanha termina com erros de entrega.
 * Inclui: nome/canal da campanha, totais e os primeiros 5 clientes que falharam.
 */
async function notificarCampanhaComErros(
  campanhaId: string,
  canal: string,
  total: number,
  enviados: number,
  erros: number,
): Promise<void> {
  const channelId = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";

  // Buscar os primeiros 5 itens com status='erro'
  const falhasRows = await db.execute(sql.raw(`
    SELECT nome, telefone, erro
    FROM avatar_campanha_itens
    WHERE campanha_id = ${escapeStr(campanhaId)}
      AND status = 'erro'
    ORDER BY id ASC
    LIMIT 5
  `));

  const falhas = (falhasRows.rows as any[]).map(r => {
    const telMask = r.telefone
      ? String(r.telefone).replace(/\d(?=\d{4})/g, "*")
      : "sem telefone";
    const motivo = r.erro ? String(r.erro).slice(0, 120) : "motivo desconhecido";
    return `• ${r.nome ?? "Cliente"} (${telMask}) — ${motivo}`;
  });

  const taxaSucesso = total > 0 ? Math.round((enviados / total) * 100) : 0;
  const linhasFalhas = falhas.length > 0
    ? `\n\n*Primeiros clientes com falha:*\n${falhas.join("\n")}`
    : "";

  const texto =
    `:warning: *Campanha Avatar concluída com erros*\n` +
    `*ID:* \`${campanhaId}\`  |  *Canal:* ${canal}\n` +
    `*Total:* ${total}  ·  *Enviados:* ${enviados}  ·  *Erros:* ${erros}  ·  *Taxa de sucesso:* ${taxaSucesso}%` +
    linhasFalhas +
    `\n\nAcesse o PADCOM › Avatares para reenviar os clientes que falharam.`;

  await postSlackAlert(channelId, texto);
  logger.info({ campanhaId, erros }, "[campanha-worker] alerta Slack de campanha com erros enviado");
}

export async function processarFilaCampanha(): Promise<{
  processadas:      number;
  enviadas:         number;
  erros:            number;
  leasesRecuperados: number;
}> {
  await ensureCampanhaSchema();

  // Recupera itens que ficaram presos em 'processando' por crash/restart
  const leasesRecuperados = await resetarLeaseExpirado();
  if (leasesRecuperados > 0) {
    logger.info({ leasesRecuperados }, "[campanha-worker] itens órfãos devolvidos para 'pendente'");
  }

  const itens = await reivindicarItens();
  let processadas = 0;
  let enviadas    = 0;
  let erros       = 0;

  for (const item of itens) {
    processadas++;
    try {
      const resultado = await enviarMensagemPaxter(
        { titulo: "Mensagem do Instituto Pádua", paragrafos: [item.texto] },
        {
          telefone:       item.telefone ?? null,
          email:          item.email    ?? null,
          telegramChatId: null,
          nome:           item.nome     ?? "Cliente",
        },
        [item.canal as any],
        {
          empresaId: item.empresaId,
          avatarId:  item.avatarId,
          clienteId: item.clienteId,
          contexto:  `campanha:${item.campanhaId}`,
        },
      );

      if (resultado.algumEnviado) {
        await marcarEnviado(item.id);
        enviadas++;
      } else {
        const primeiroErro = resultado.resultados
          ?.find((r: any) => r.erro)?.erro ?? "Nenhum canal enviou";
        await marcarFalha(item.id, item.tentativas, primeiroErro);
        erros++;
      }
    } catch (err: any) {
      logger.warn({ itemId: item.id, err: err?.message }, "[campanha-worker] erro ao enviar item");
      await marcarFalha(item.id, item.tentativas, err?.message ?? String(err));
      erros++;
    }

    // Recalcula contadores da campanha após cada item
    await recalcularCampanha(item.campanhaId).catch(() => {});
  }

  return { processadas, enviadas, erros, leasesRecuperados };
}

// ─── Helper de escape para SQL raw ───────────────────────────────────────────

function escapeStr(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`;
}
