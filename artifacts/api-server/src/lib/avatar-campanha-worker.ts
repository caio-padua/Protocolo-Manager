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
import { brtDateTime } from "./brt";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_TENTATIVAS = 3;  // tentativas totais antes de marcar 'erro' definitivo

/** Mapeamento de velocidade → itens reivindicados por tick */
export const VELOCIDADE_LOTE: Record<"lenta" | "normal" | "rapida", number> = {
  lenta:  5,
  normal: 10,
  rapida: 25,
};

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
      lote_por_tick   INTEGER NOT NULL DEFAULT 10,
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
  // Adiciona lote_por_tick se a tabela já existia sem a coluna (idempotente)
  await db.execute(sql.raw(`
    ALTER TABLE avatar_campanhas
    ADD COLUMN IF NOT EXISTS lote_por_tick INTEGER NOT NULL DEFAULT 10
  `));
  // Marcador persistente de alerta — TRUE quando o alerta de conclusão já foi disparado.
  // Garante deduplicação atômica: apenas o UPDATE que vira de FALSE→TRUE dispara o Slack.
  await db.execute(sql.raw(`
    ALTER TABLE avatar_campanhas
    ADD COLUMN IF NOT EXISTS alerta_enviado BOOLEAN NOT NULL DEFAULT FALSE
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
  lotePorTick?:   number;
}): Promise<void> {
  await ensureCampanhaSchema();

  const lotePorTick = opts.lotePorTick ?? VELOCIDADE_LOTE.normal;

  await db.execute(sql.raw(`
    INSERT INTO avatar_campanhas (id, empresa_id, avatar_id, canal, texto, total, lote_por_tick, campanha_pai_id)
    VALUES (
      ${escapeStr(opts.campaignId)},
      ${opts.empresaId},
      ${opts.avatarId},
      ${escapeStr(opts.canal)},
      ${escapeStr(opts.texto)},
      ${opts.clientes.length},
      ${lotePorTick},
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
 * Reivindica atomicamente itens pendentes, respeitando o lote_por_tick
 * de cada campanha individualmente.
 *
 * Fluxo:
 *  1. Busca campanhas ativas com seu lote_por_tick configurado.
 *  2. Para cada campanha, reclama até lote_por_tick itens via
 *     UPDATE ... FOR UPDATE SKIP LOCKED (claim exclusivo por item).
 *  3. Retorna todos os itens reivindicados de todas as campanhas.
 *
 * Isso garante que uma campanha "Rápida" (25/tick) não bloqueia uma
 * campanha "Lenta" (5/tick) que esteja rodando ao mesmo tempo.
 */
async function reivindicarItens(): Promise<ItemReivindicado[]> {
  // Passo 1: buscar campanhas ativas e seus limites de lote
  const campanhasAtivas = await db.execute(sql.raw(`
    SELECT id, lote_por_tick
    FROM avatar_campanhas
    WHERE status = 'em_andamento'
  `));

  if (campanhasAtivas.rows.length === 0) return [];

  // Passo 2: para cada campanha, reivindicar até lote_por_tick itens
  const todosItens: ItemReivindicado[] = [];

  for (const camp of campanhasAtivas.rows as any[]) {
    const campanhaId  = String(camp.id);
    const lotePorTick = Number(camp.lote_por_tick ?? VELOCIDADE_LOTE.normal);

    const result = await db.execute(sql.raw(`
      WITH claimed AS (
        UPDATE avatar_campanha_itens
        SET status = 'processando', claimed_at = NOW()
        WHERE id IN (
          SELECT i.id
          FROM avatar_campanha_itens i
          WHERE i.campanha_id = ${escapeStr(campanhaId)}
            AND i.status = 'pendente'
            AND i.tentativas < ${MAX_TENTATIVAS}
          ORDER BY i.id ASC
          LIMIT ${lotePorTick}
          FOR UPDATE SKIP LOCKED
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

    for (const r of result.rows as any[]) {
      todosItens.push({
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
      });
    }
  }

  return todosItens;
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
  // Passo 1 — atualiza contadores e status da campanha.
  await db.execute(sql.raw(`
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
  `));

  // Passo 2 — Deduplicação atômica do alerta via UPDATE ... WHERE alerta_enviado = FALSE.
  //
  // Apenas o processo que vencer a corrida e mudar alerta_enviado FALSE→TRUE receberá
  // uma linha no RETURNING. Ticks concorrentes ou reprocessamentos posteriores não
  // recebem linha e não disparam o Slack. Isso é garantido pela serialização de
  // UPDATEs no mesmo row pelo Postgres (sem janela temporal, sem CTE ambígua).
  const claim = await db.execute(sql.raw(`
    UPDATE avatar_campanhas
    SET alerta_enviado = TRUE
    WHERE id = ${escapeStr(campanhaId)}
      AND status    = 'concluida'
      AND alerta_enviado = FALSE
    RETURNING id, canal, total, enviados, erros, concluido_at
  `));

  const row = claim.rows[0] as any;
  if (!row) return; // Alerta já enviado ou campanha ainda em andamento

  const erros      = Number(row.erros    ?? 0);
  const enviados   = Number(row.enviados ?? 0);
  const total      = Number(row.total    ?? 0);
  const canal      = String(row.canal    ?? "");
  const concluidoAt = new Date(row.concluido_at);

  if (erros > 0) {
    // Campanha concluiu com erros — notificar lista de falhos
    void notificarCampanhaComErros(campanhaId, canal, total, enviados, erros).catch((e: any) =>
      logger.warn({ err: e?.message }, "[campanha-worker] falha ao enviar alerta Slack de erros"),
    );
  } else {
    // Campanha concluiu com 100% de sucesso — notificar somente se o toggle estiver ativo.
    // Controlado por PADAXOR_ALERTA_CAMPANHA_SUCESSO (padrão = true).
    // Para suprimir, defina PADAXOR_ALERTA_CAMPANHA_SUCESSO=false.
    const alertaSucessoAtivo = process.env.PADAXOR_ALERTA_CAMPANHA_SUCESSO !== "false";
    if (alertaSucessoAtivo) {
      void notificarCampanhaSucesso(campanhaId, canal, total, enviados, concluidoAt).catch((e: any) =>
        logger.warn({ err: e?.message }, "[campanha-worker] falha ao enviar alerta Slack de sucesso"),
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

/**
 * Envia alerta Slack ao CEO quando uma campanha termina com 100% de sucesso (zero erros).
 * Inclui: ID da campanha, canal, total enviados e horário de conclusão (BRT).
 *
 * Controlado por PADAXOR_ALERTA_CAMPANHA_SUCESSO (padrão = true).
 * Para suprimir: definir PADAXOR_ALERTA_CAMPANHA_SUCESSO=false.
 */
async function notificarCampanhaSucesso(
  campanhaId: string,
  canal: string,
  total: number,
  enviados: number,
  concluidoAt: Date,
): Promise<void> {
  const channelId = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";

  // Formatar o timestamp de conclusão em BRT usando o helper centralizado
  // (America/Sao_Paulo, retorna "DD/MM/AAAA HH:MM")
  const concluidoFmt = brtDateTime(concluidoAt);

  const texto =
    `:white_check_mark: *Campanha Avatar concluída com sucesso*\n` +
    `*ID:* \`${campanhaId}\`  |  *Canal:* ${canal}\n` +
    `*Total enviados:* ${enviados} de ${total}  ·  *Taxa de sucesso:* 100%\n` +
    `*Horário de conclusão:* ${concluidoFmt} (BRT)`;

  await postSlackAlert(channelId, texto);
  logger.info({ campanhaId, enviados }, "[campanha-worker] alerta Slack de campanha com sucesso enviado");
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
          ?.find((r: any) => r.error)?.error ?? "Nenhum canal enviou";
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
