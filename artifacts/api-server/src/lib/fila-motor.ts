/**
 * Fila persistente no PostgreSQL (mensagens_fila) — Etapa B do desenho aprovado.
 *
 * Garantias:
 *  - Idempotência: índice único (empresa_id, tipo, chave_idempotencia). Enfileirar duas vezes a
 *    mesma chave NÃO cria segunda linha.
 *  - Reserva exclusiva: FOR UPDATE SKIP LOCKED. Dois processos nunca recebem o mesmo item.
 *  - Lease (reserva com prazo): item reservado e não concluído volta à fila quando o prazo vence.
 *    Cada reserva tem um número de tentativa; quem perdeu a reserva não consegue concluir nem falhar.
 *  - TTL: item que passou da validade vira 'expirada' e NUNCA é entregue (vai para revisão humana).
 *  - Tentativas limitadas com espera crescente; esgotadas = 'morta' (não repete sozinha).
 *  - Trava por job: pg_try_advisory_lock numa conexão dedicada; cai sozinha se a conexão morrer.
 *
 * Os serviços recebem o `pool` como parâmetro (padrão do projeto) para rodar em banco descartável.
 * Este módulo NUNCA envia mensagem: quem processa informa um `handler`.
 */
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type FilaTipo = "mensagem" | "pdf_exame";
export type FilaEstado = "pendente" | "reservada" | "concluida" | "falha" | "morta" | "expirada";

export const LIMITES = {
  leaseMensagemMs: 120_000,
  /** Maior que o timeout de 120 s do PDF: sem margem, o item seria reentregue enquanto ainda roda. */
  leasePdfMs: 150_000,
  timeoutPdfMs: 120_000,
  concorrenciaPdf: 2,
  maxTentativas: 5,
  ttlMensagemMs: 24 * 3600_000,
  ttlPdfMs: 7 * 24 * 3600_000,
  ttlMaximoMs: 30 * 24 * 3600_000,
  payloadMaxBytes: 64 * 1024,
  chaveMaxChars: 200,
  esperaBaseSeg: 30,
  esperaMaxSeg: 1800,
} as const;

export type PoolFila = Pick<Pool, "query" | "connect">;

export interface ItemFila {
  id: number;
  tipo: FilaTipo;
  empresa_id: number;
  chave_idempotencia: string;
  payload: Record<string, unknown>;
  estado: FilaEstado;
  tentativas: number;
  max_tentativas: number;
  expira_em: Date;
}

export class ErroDefinitivo extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroDefinitivo";
  }
}

export class ErroTempoEsgotado extends Error {
  constructor(ms: number) {
    super(`tempo_esgotado_${ms}ms`);
    this.name = "ErroTempoEsgotado";
  }
}

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS mensagens_fila (
    id                    BIGSERIAL PRIMARY KEY,
    tipo                  TEXT NOT NULL,
    empresa_id            INTEGER NOT NULL,
    chave_idempotencia    TEXT NOT NULL,
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    estado                TEXT NOT NULL DEFAULT 'pendente',
    tentativas            INTEGER NOT NULL DEFAULT 0,
    max_tentativas        INTEGER NOT NULL DEFAULT 5,
    proxima_tentativa_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    reservado_por         TEXT,
    reservada_ate         TIMESTAMPTZ,
    expira_em             TIMESTAMPTZ NOT NULL,
    ultimo_erro           TEXT,
    criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
    concluida_em          TIMESTAMPTZ,
    CONSTRAINT mensagens_fila_tipo_ck CHECK (tipo IN ('mensagem','pdf_exame')),
    CONSTRAINT mensagens_fila_estado_ck CHECK (estado IN ('pendente','reservada','concluida','falha','morta','expirada')),
    CONSTRAINT mensagens_fila_tentativas_ck CHECK (tentativas >= 0 AND max_tentativas BETWEEN 1 AND 10)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_mensagens_fila_idempotencia
     ON mensagens_fila (empresa_id, tipo, chave_idempotencia)`,
  `CREATE INDEX IF NOT EXISTS ix_mensagens_fila_entrega
     ON mensagens_fila (tipo, estado, proxima_tentativa_em)`,
  `CREATE INDEX IF NOT EXISTS ix_mensagens_fila_lease
     ON mensagens_fila (reservada_ate) WHERE estado = 'reservada'`,
];

/** Aditivo e idempotente (Regra de Ouro: nunca DROP). */
export async function criarTabelaFila(pool: Pick<Pool, "query">): Promise<void> {
  for (const stmt of DDL) await pool.query(stmt);
}

/** Chave estável para mensagem: mesma clínica, canal, destinatário, conteúdo e janela = mesma chave. */
export function chaveMensagem(p: {
  canal: string;
  destinatario: string;
  conteudo: string;
  janela: string;
}): string {
  return createHash("sha256")
    .update([p.canal, p.destinatario, p.conteudo, p.janela].join("\u0000"))
    .digest("hex");
}

export async function enfileirar(
  pool: Pick<Pool, "query">,
  p: {
    tipo: FilaTipo;
    empresaId: number;
    chave: string;
    payload?: Record<string, unknown>;
    ttlMs?: number;
    maxTentativas?: number;
  },
): Promise<{ id: number | null; duplicada: boolean }> {
  if (!Number.isSafeInteger(p.empresaId) || p.empresaId <= 0) throw new Error("empresa_invalida");
  if (!p.chave || p.chave.length > LIMITES.chaveMaxChars) throw new Error("chave_invalida");
  const payload = p.payload ?? {};
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > LIMITES.payloadMaxBytes) {
    throw new Error("payload_grande_demais");
  }
  const ttlPadrao = p.tipo === "pdf_exame" ? LIMITES.ttlPdfMs : LIMITES.ttlMensagemMs;
  const ttl = Math.min(Math.max(p.ttlMs ?? ttlPadrao, 1000), LIMITES.ttlMaximoMs);
  const max = Math.min(Math.max(p.maxTentativas ?? LIMITES.maxTentativas, 1), 10);
  const r = await pool.query(
    `INSERT INTO mensagens_fila (tipo, empresa_id, chave_idempotencia, payload, expira_em, max_tentativas)
     VALUES ($1, $2, $3, $4::jsonb, now() + make_interval(secs => $5::double precision / 1000), $6)
     ON CONFLICT (empresa_id, tipo, chave_idempotencia) DO NOTHING
     RETURNING id`,
    [p.tipo, p.empresaId, p.chave, JSON.stringify(payload), ttl, max],
  );
  if (!r.rows.length) return { id: null, duplicada: true };
  return { id: Number(r.rows[0].id), duplicada: false };
}

/**
 * Arruma a fila antes de entregar: item vencido pelo TTL nunca é entregue; item cujo lease venceu
 * e já gastou todas as tentativas vira 'morta'.
 */
export async function varrerFila(
  pool: Pick<Pool, "query">,
  tipo: FilaTipo,
): Promise<{ expiradas: number; mortas: number }> {
  const exp = await pool.query(
    `UPDATE mensagens_fila
        SET estado = 'expirada', reservado_por = NULL, reservada_ate = NULL,
            ultimo_erro = COALESCE(ultimo_erro, 'validade_vencida'), atualizado_em = now()
      WHERE tipo = $1 AND expira_em <= now()
        AND (estado IN ('pendente','falha') OR (estado = 'reservada' AND reservada_ate < now()))`,
    [tipo],
  );
  const mor = await pool.query(
    `UPDATE mensagens_fila
        SET estado = 'morta', reservado_por = NULL, reservada_ate = NULL,
            ultimo_erro = 'lease_vencido_sem_tentativas', atualizado_em = now()
      WHERE tipo = $1 AND estado = 'reservada' AND reservada_ate < now()
        AND tentativas >= max_tentativas`,
    [tipo],
  );
  return { expiradas: exp.rowCount ?? 0, mortas: mor.rowCount ?? 0 };
}

/**
 * Reserva até `limite` itens. O teto por clínica é APROXIMADO: conta o que já foi concluído no
 * último minuto e o que está reservado, mas dentro de um mesmo lote pode passar do teto em até
 * `limite` itens.
 */
export async function reservar(
  pool: Pick<Pool, "query">,
  p: {
    tipo: FilaTipo;
    limite: number;
    workerId: string;
    leaseMs?: number;
    tetoPorEmpresaPorMinuto?: number | null;
  },
): Promise<ItemFila[]> {
  const limite = Math.min(Math.max(Math.floor(p.limite), 1), 100);
  const lease = p.leaseMs ?? (p.tipo === "pdf_exame" ? LIMITES.leasePdfMs : LIMITES.leaseMensagemMs);
  await varrerFila(pool, p.tipo);
  const r = await pool.query(
    `WITH cand AS (
       SELECT f.id FROM mensagens_fila f
        WHERE f.tipo = $1 AND f.expira_em > now()
          AND ((f.estado IN ('pendente','falha') AND f.proxima_tentativa_em <= now())
            OR (f.estado = 'reservada' AND f.reservada_ate < now() AND f.tentativas < f.max_tentativas))
          AND ($5::int IS NULL OR (
                SELECT count(*) FROM mensagens_fila x
                 WHERE x.empresa_id = f.empresa_id AND x.tipo = f.tipo
                   AND (x.concluida_em > now() - interval '60 seconds'
                        OR (x.estado = 'reservada' AND x.reservada_ate >= now()))
              ) < $5::int)
        ORDER BY f.proxima_tentativa_em, f.id
        FOR UPDATE SKIP LOCKED
        LIMIT $2)
     UPDATE mensagens_fila f
        SET estado = 'reservada', reservado_por = $3, tentativas = f.tentativas + 1,
            reservada_ate = now() + make_interval(secs => $4::double precision / 1000),
            atualizado_em = now()
       FROM cand WHERE f.id = cand.id
     RETURNING f.*`,
    [p.tipo, limite, p.workerId, lease, p.tetoPorEmpresaPorMinuto ?? null],
  );
  // BIGSERIAL chega como texto no driver: normaliza para número (ids ficam bem abaixo de 2^53).
  return r.rows.map((row) => ({ ...row, id: Number(row.id) })) as ItemFila[];
}

/** Só conclui quem ainda detém EXATAMENTE a reserva (mesmo worker e mesmo número de tentativa). */
export async function concluir(
  pool: Pick<Pool, "query">,
  item: Pick<ItemFila, "id" | "tentativas">,
  workerId: string,
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE mensagens_fila
        SET estado = 'concluida', concluida_em = now(), reservado_por = NULL, reservada_ate = NULL,
            ultimo_erro = NULL, atualizado_em = now()
      WHERE id = $1 AND estado = 'reservada' AND reservado_por = $2 AND tentativas = $3`,
    [item.id, workerId, item.tentativas],
  );
  return (r.rowCount ?? 0) === 1;
}

/** Texto de erro seguro: sem sequências longas de dígitos (CPF, telefone) e com tamanho limitado. */
export function erroSeguro(err: unknown): string {
  const nome = err instanceof Error ? err.name : typeof err;
  const msg = err instanceof Error ? err.message : String(err);
  return `${nome}: ${msg}`.replace(/\d{6,}/g, "[n]").slice(0, 200);
}

export async function falhar(
  pool: Pick<Pool, "query">,
  item: Pick<ItemFila, "id" | "tentativas">,
  workerId: string,
  erro: unknown,
  definitivo = false,
): Promise<FilaEstado | null> {
  const r = await pool.query(
    `UPDATE mensagens_fila
        SET estado = CASE WHEN $4::boolean OR tentativas >= max_tentativas THEN 'morta' ELSE 'falha' END,
            proxima_tentativa_em = now() + make_interval(
              secs => LEAST($6::double precision, $5::double precision * power(2, GREATEST(tentativas - 1, 0)))),
            ultimo_erro = $7, reservado_por = NULL, reservada_ate = NULL, atualizado_em = now()
      WHERE id = $1 AND estado = 'reservada' AND reservado_por = $2 AND tentativas = $3
      RETURNING estado`,
    [item.id, workerId, item.tentativas, definitivo, LIMITES.esperaBaseSeg, LIMITES.esperaMaxSeg, erroSeguro(erro)],
  );
  return r.rows.length ? (r.rows[0].estado as FilaEstado) : null;
}

/**
 * Trava distribuída por job. Usa conexão dedicada porque pg_advisory_lock é por sessão.
 * Se outra instância já detém a trava, NÃO executa (executou:false).
 */
export async function comTravaDeJob<T>(
  pool: Pick<Pool, "connect">,
  nomeDoJob: string,
  fn: () => Promise<T>,
): Promise<{ executou: true; resultado: T } | { executou: false }> {
  const conn: PoolClient = await pool.connect();
  let travou = false;
  try {
    const r = await conn.query(`SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok`, [`fila:${nomeDoJob}`]);
    travou = r.rows[0]?.ok === true;
    if (!travou) return { executou: false };
    return { executou: true, resultado: await fn() };
  } finally {
    if (travou) {
      await conn.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [`fila:${nomeDoJob}`]).catch(() => {});
    }
    conn.release();
  }
}

export type HandlerFila = (item: ItemFila, sinal: AbortSignal) => Promise<void>;

export interface ResumoLote {
  executou: boolean;
  reservados: number;
  concluidos: number;
  falhas: number;
  mortos: number;
}

/**
 * Um ciclo: pega a trava do job, reserva até `concorrencia` itens e processa cada um com prazo.
 * Estourou o prazo: o sinal é abortado e o item volta a 'falha' (com espera) ou vira 'morta'.
 */
export async function processarLote(
  pool: PoolFila,
  p: {
    tipo: FilaTipo;
    handler: HandlerFila;
    workerId: string;
    concorrencia?: number;
    timeoutMs?: number;
    leaseMs?: number;
    tetoPorEmpresaPorMinuto?: number | null;
  },
): Promise<ResumoLote> {
  const concorrencia = Math.min(Math.max(p.concorrencia ?? LIMITES.concorrenciaPdf, 1), 10);
  const timeoutMs = p.timeoutMs ?? LIMITES.timeoutPdfMs;
  const resumo: ResumoLote = { executou: false, reservados: 0, concluidos: 0, falhas: 0, mortos: 0 };

  const r = await comTravaDeJob(pool, p.tipo, async () => {
    const itens = await reservar(pool, {
      tipo: p.tipo,
      limite: concorrencia,
      workerId: p.workerId,
      leaseMs: p.leaseMs,
      tetoPorEmpresaPorMinuto: p.tetoPorEmpresaPorMinuto,
    });
    resumo.reservados = itens.length;
    await Promise.all(
      itens.map(async (item) => {
        const ac = new AbortController();
        let timer: NodeJS.Timeout | undefined;
        const prazo = new Promise<never>((_, rej) => {
          timer = setTimeout(() => {
            ac.abort();
            rej(new ErroTempoEsgotado(timeoutMs));
          }, timeoutMs);
        });
        try {
          await Promise.race([p.handler(item, ac.signal), prazo]);
          if (await concluir(pool, item, p.workerId)) resumo.concluidos++;
        } catch (err) {
          const novo = await falhar(pool, item, p.workerId, err, err instanceof ErroDefinitivo);
          if (novo === "morta") resumo.mortos++;
          else resumo.falhas++;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }),
    );
  });
  resumo.executou = r.executou;
  return resumo;
}
