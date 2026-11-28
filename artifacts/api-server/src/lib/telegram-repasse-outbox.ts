/**
 * Outbox mínimo do repasse de mensagens do Telegram ao chat de alerta.
 * Ver specs/telegram-repasse-outbox.md.
 *
 * Princípios: mensagem salva != entregue; sem promessa de exatamente-uma-vez;
 * "incerto" nunca é reenviado sozinho. Sem import de @workspace/db: o executor e o
 * transporte são injetados (testável em banco descartável).
 */
import { sql, type SQL } from "drizzle-orm";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual";

export interface ExecutorOutbox {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>;
}

export type EstadoRepasse = "pendente" | "enviando" | "aceito_telegram" | "falhou" | "esgotado" | "incerto";

export const MAX_TENTATIVAS = 6;
export const ENVIANDO_ABANDONADO_MINUTOS = 5;

export async function aplicarMigracaoOutbox(exec: ExecutorOutbox): Promise<void> {
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_repasse_ceo (
      id                    BIGSERIAL PRIMARY KEY,
      inbox_message_id      INTEGER     NOT NULL REFERENCES telegram_inbox_messages(id) ON DELETE CASCADE,
      chat_id_destino       TEXT        NOT NULL,
      estado                TEXT        NOT NULL DEFAULT 'pendente'
                            CHECK (estado IN ('pendente','enviando','aceito_telegram','falhou','esgotado','incerto')),
      tentativas            INTEGER     NOT NULL DEFAULT 0,
      ultimo_erro           TEXT,
      proxima_tentativa_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (inbox_message_id, chat_id_destino)
    )
  `);
  await exec.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_telegram_repasse_ceo_due
      ON telegram_repasse_ceo (proxima_tentativa_em)
      WHERE estado IN ('pendente','falhou')
  `);
}

/** Registra o repasse junto da mensagem salva; idempotente (mesmo par devolve o mesmo id). */
export async function registrarRepasse(exec: ExecutorOutbox, inboxMessageId: number, chatIdDestino: string): Promise<number> {
  const ins = await exec.execute(sql`
    INSERT INTO telegram_repasse_ceo (inbox_message_id, chat_id_destino)
    VALUES (${inboxMessageId}, ${chatIdDestino})
    ON CONFLICT (inbox_message_id, chat_id_destino) DO NOTHING
    RETURNING id
  `);
  if (ins.rows.length > 0) return Number((ins.rows[0] as { id: number | string }).id);
  const ex = await exec.execute(sql`
    SELECT id FROM telegram_repasse_ceo WHERE inbox_message_id = ${inboxMessageId} AND chat_id_destino = ${chatIdDestino}
  `);
  return Number((ex.rows[0] as { id: number | string }).id);
}

export type ResultadoEnvio =
  | { kind: "entregue" }
  | { kind: "simulado" }
  | { kind: "omitido_remetente_e_ceo" }
  | { kind: "bloqueado"; motivo: "vinculo_origem_alterado" | "destino_configurado_alterado" }
  | { kind: "falhou"; erro: string };

export interface ClassificacaoEnvio {
  estado: EstadoRepasse;
  erro: string | null;
}

/** Erro curto e sem conteúdo clínico: só o código técnico. */
function erroCurto(erro: string): string {
  const m = /^(telegram_http_\d{3})/.exec(erro);
  if (m) return m[1];
  if (erro === "sem_resultado") return "sem_resultado";
  return "falha_de_rede_ou_excecao";
}

export function classificarResultado(r: ResultadoEnvio, tentativasJaFeitas: number): ClassificacaoEnvio {
  if (r.kind === "bloqueado") return { estado: "esgotado", erro: r.motivo };
  if (r.kind === "entregue" || r.kind === "omitido_remetente_e_ceo") return { estado: "aceito_telegram", erro: null };
  const esgotou = tentativasJaFeitas >= MAX_TENTATIVAS;
  if (r.kind === "simulado") return { estado: esgotou ? "esgotado" : "falhou", erro: "simulado_sem_token" };
  const http = /^telegram_http_(\d{3})/.exec(r.erro);
  if (http) {
    const status = Number(http[1]);
    const temporario = status === 429 || status >= 500;
    return { estado: temporario && !esgotou ? "falhou" : "esgotado", erro: erroCurto(r.erro) };
  }
  // Sem resposta HTTP (rede caiu, exceção): a mensagem PODE ter chegado. Não reenvia sozinho.
  return { estado: "incerto", erro: erroCurto(r.erro) };
}

export interface LinhaRepasse {
  id: number;
  inbox_message_id: number;
  chat_id_destino: string;
  tentativas: number;
  texto: string;
  chat_id_remetente: string;
  cliente_id: number;
  empresa_id: number;
  direcao: string;
  nome: string;
  cpf: string | null;
}

export interface DepsOutbox {
  /** Monta e envia o repasse; devolve o resultado classificável. Nunca recebe/loga token. */
  enviar: (linha: LinhaRepasse) => Promise<ResultadoEnvio>;
}

async function carregarLinha(exec: ExecutorOutbox, id: number): Promise<LinhaRepasse | null> {
  const r = await exec.execute(sql`
    SELECT r.id, r.inbox_message_id, r.chat_id_destino, r.tentativas,
           m.texto, m.chat_id AS chat_id_remetente, m.cliente_id, m.empresa_id,
           m.direcao
    FROM telegram_repasse_ceo r
    JOIN telegram_inbox_messages m ON m.id = r.inbox_message_id
    WHERE r.id = ${id}
  `);
  const l = r.rows[0] as (Omit<LinhaRepasse, "id" | "tentativas" | "inbox_message_id" | "cliente_id" | "empresa_id"> & Record<"id" | "tentativas" | "inbox_message_id" | "cliente_id" | "empresa_id", number | string>) | undefined;
  if (!l) return null;
  return { ...l, nome: "", cpf: null, id: Number(l.id), tentativas: Number(l.tentativas), inbox_message_id: Number(l.inbox_message_id), cliente_id: Number(l.cliente_id), empresa_id: Number(l.empresa_id) };
}

/**
 * Tenta enviar UM repasse. A reivindicação é atômica (UPDATE condicional): duas
 * execuções simultâneas nunca enviam a mesma linha.
 */
export async function tentarRepasse(
  exec: ExecutorOutbox,
  id: number,
  deps: DepsOutbox,
): Promise<{ kind: "nao_reivindicado" } | { kind: "tratado"; estado: EstadoRepasse }> {
  const claim = await exec.execute(sql`
    UPDATE telegram_repasse_ceo
    SET estado = 'enviando', tentativas = tentativas + 1, atualizado_em = NOW()
    WHERE id = ${id} AND estado IN ('pendente','falhou') AND proxima_tentativa_em <= NOW()
    RETURNING tentativas
  `);
  if (claim.rows.length === 0) return { kind: "nao_reivindicado" };
  const tentativas = Number((claim.rows[0] as { tentativas: number | string }).tentativas);

  const linha = await carregarLinha(exec, id);
  let resultado: ResultadoEnvio;
  if (!linha) {
    resultado = { kind: "falhou", erro: "telegram_http_404" }; // mensagem de origem sumiu: nada a enviar
  } else if (linha.direcao !== "entrada" || !await vinculoTelegramAtualUnico(exec, {
    clienteId: linha.cliente_id, empresaId: linha.empresa_id, chatId: linha.chat_id_remetente,
  })) {
    resultado = { kind: "bloqueado", motivo: "vinculo_origem_alterado" };
  } else {
    try {
      resultado = await deps.enviar(linha);
    } catch {
      resultado = { kind: "falhou", erro: "excecao" };
    }
  }

  const c = classificarResultado(resultado, tentativas);
  const espera = Math.min(2 ** (tentativas - 1), 60); // minutos: 1,2,4,8,16,32
  await exec.execute(sql`
    UPDATE telegram_repasse_ceo
    SET estado = ${c.estado}, ultimo_erro = ${c.erro}, atualizado_em = NOW(),
        proxima_tentativa_em = NOW() + make_interval(mins => ${espera})
    WHERE id = ${id} AND estado = 'enviando'
  `);
  return { kind: "tratado", estado: c.estado };
}

/** "enviando" que não fechou (processo caiu) vira "incerto": pode ou não ter saído. */
export async function marcarEnviandoAbandonadoComoIncerto(exec: ExecutorOutbox): Promise<number> {
  const r = await exec.execute(sql`
    UPDATE telegram_repasse_ceo
    SET estado = 'incerto', ultimo_erro = 'processo_interrompido_durante_envio', atualizado_em = NOW()
    WHERE estado = 'enviando' AND atualizado_em < NOW() - make_interval(mins => ${ENVIANDO_ABANDONADO_MINUTOS})
    RETURNING id
  `);
  return r.rows.length;
}

/** Passada do worker: recupera abandonados e tenta os vencidos (pendente/falhou). */
export async function processarRepassesVencidos(
  exec: ExecutorOutbox,
  deps: DepsOutbox,
  limite = 20,
): Promise<{ incertosNovos: number; examinados: number; aceitos: number; falhas: number }> {
  const incertosNovos = await marcarEnviandoAbandonadoComoIncerto(exec);
  const due = await exec.execute(sql`
    SELECT id FROM telegram_repasse_ceo
    WHERE estado IN ('pendente','falhou') AND proxima_tentativa_em <= NOW()
    ORDER BY proxima_tentativa_em ASC, id ASC
    LIMIT ${limite}
  `);
  let aceitos = 0;
  let falhas = 0;
  for (const row of due.rows as Array<{ id: number | string }>) {
    const r = await tentarRepasse(exec, Number(row.id), deps);
    if (r.kind === "tratado") (r.estado === "aceito_telegram" ? aceitos++ : falhas++);
  }
  return { incertosNovos, examinados: due.rows.length, aceitos, falhas };
}

export async function resumoRepasses(exec: ExecutorOutbox): Promise<Record<string, number>> {
  const r = await exec.execute(sql`SELECT estado, count(*)::int AS n FROM telegram_repasse_ceo GROUP BY estado`);
  const out: Record<string, number> = {};
  for (const row of r.rows as Array<{ estado: string; n: number }>) out[row.estado] = row.n;
  return out;
}
