/**
 * Exclusividade de tarefas agendadas entre processos (API, worker e réplicas).
 *
 * Problema: a mesma tarefa periódica podia rodar em mais de um processo ao mesmo tempo (ex.: o guarda do webhook do
 * Telegram existe na API e no worker; duas réplicas do worker repetiriam lembretes, farmácia e repasses).
 *
 * Regra: para cada tarefa (nome), no máximo UMA execução por janela de tempo, em todo o banco compartilhado.
 *   1. Trava consultiva do PostgreSQL (pg_try_advisory_lock) numa conexão dedicada: quem não obtém, não executa.
 *      Se o processo morrer, o PostgreSQL solta a trava sozinho (sem trava presa).
 *   2. Dentro da trava, lê o carimbo da última execução em app_settings (tabela existente; nenhuma tabela nova).
 *      Se a última execução foi há menos que a janela, não executa (impede a repetição por outro processo logo depois).
 *   3. Grava o carimbo ANTES de executar (reserva) e solta a trava ao terminar.
 * Falha ao obter a trava ou ler o carimbo = NÃO executa (nunca executa "por via das dúvidas") e registra o motivo.
 * Nenhum dado de cliente nem mensagem passa por aqui.
 */
const NAMESPACE_TRAVA = 19872027;
export const PREFIXO_CARIMBO = "tarefa_ultima:";

export interface ConexaoExclusiva {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  release(): void;
}
export interface PoolExclusivo {
  connect(): Promise<ConexaoExclusiva>;
}

export type ResultadoExclusivo<T> =
  | { executou: true; valor: T }
  | { executou: false; motivo: "trava_ocupada" | "janela_nao_vencida" | "erro_de_controle" };

export interface OpcoesExclusividade {
  pool?: PoolExclusivo;
  agora?: () => number;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export async function executarUmaVezPorJanela<T>(
  nome: string,
  janelaMs: number,
  fn: () => Promise<T> | T,
  opts: OpcoesExclusividade = {},
): Promise<ResultadoExclusivo<T>> {
  const agora = opts.agora ?? Date.now;
  const log = opts.log ?? (() => {});
  const pool = opts.pool ?? ((await import("@workspace/db")).pool as unknown as PoolExclusivo);
  let con: ConexaoExclusiva | null = null;
  let travou = false;
  try {
    con = await pool.connect();
    const t = await con.query("SELECT pg_try_advisory_lock($1, hashtext($2)) AS ok", [NAMESPACE_TRAVA, nome]);
    travou = t.rows[0]?.ok === true;
    if (!travou) return { executou: false, motivo: "trava_ocupada" };

    const chave = PREFIXO_CARIMBO + nome;
    const r = await con.query("SELECT value FROM app_settings WHERE key = $1", [chave]);
    const ultima = r.rows[0]?.value ? Number(r.rows[0].value) : 0;
    const agoraMs = agora();
    if (Number.isFinite(ultima) && ultima > 0 && agoraMs - ultima < janelaMs) {
      return { executou: false, motivo: "janela_nao_vencida" };
    }
    await con.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [chave, String(agoraMs)],
    );
    const valor = await fn();
    return { executou: true, valor };
  } catch (err) {
    if (!con || !travou) {
      log("exclusividade: falha no controle; tarefa NÃO executada", { nome, err: err instanceof Error ? err.message : String(err) });
      return { executou: false, motivo: "erro_de_controle" };
    }
    throw err; // erro da própria tarefa: quem chamou decide (os jobs já tratam e registram)
  } finally {
    if (con) {
      if (travou) await con.query("SELECT pg_advisory_unlock($1, hashtext($2))", [NAMESPACE_TRAVA, nome]).catch(() => {});
      con.release();
    }
  }
}

/** Janela de exclusividade (ms) derivada da expressão cron: 80% do período para expressões simples; 20 min para as demais. */
export function janelaDaExpressao(expr: string): number {
  const campos = expr.trim().split(/\s+/);
  const VINTE_MIN = 20 * 60_000;
  if (campos.length === 6) {
    const m = /^\*\/(\d+)$/.exec(campos[0]);
    if (m && campos.slice(1).every((c) => c === "*")) return Math.max(1000, Math.floor(Number(m[1]) * 1000 * 0.8));
    return VINTE_MIN;
  }
  if (campos.length === 5) {
    if (campos.every((c) => c === "*")) return 48_000;
    const m = /^\*\/(\d+)$/.exec(campos[0]);
    if (m && campos.slice(1).every((c) => c === "*")) return Math.floor(Number(m[1]) * 60_000 * 0.8);
  }
  return VINTE_MIN;
}

type Agendavel = { schedule: (expr: string, fn: (...a: any[]) => any, opts?: any) => any };

/**
 * Embrulha um agendador (node-cron): cada disparo passa pela exclusividade. O nome é `<prefixo>:<posição>:<expressão>`;
 * a posição segue a ordem de registro, igual em todos os processos que rodam o mesmo código.
 */
export function agendadorExclusivo<S extends Agendavel>(
  base: S,
  prefixo: string,
  opts: OpcoesExclusividade = {},
): Agendavel {
  let n = 0;
  return {
    schedule(expr, fn, o) {
      const nome = `${prefixo}:${++n}:${expr}`;
      const janela = janelaDaExpressao(expr);
      return base.schedule(expr, async () => {
        try {
          const r = await executarUmaVezPorJanela(nome, janela, () => fn(), opts);
          if (!r.executou) opts.log?.(`exclusividade: ${nome} não executada (${r.motivo})`);
        } catch (err) {
          opts.log?.(`exclusividade: ${nome} falhou`, { err: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) });
        }
      }, o);
    },
  };
}
