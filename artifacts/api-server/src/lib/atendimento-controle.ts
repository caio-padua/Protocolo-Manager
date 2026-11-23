/**
 * Interruptores do atendimento automático (Fase 1B): clínica, canal e contato, com modos
 * automático / assistido / humano e bloqueio emergencial. Valores ausentes = padrão (ligado, automático).
 * Precedência: bloqueio emergencial > modo humano > clínica desligada > canal desligado > contato desligado
 * > mensagem anterior à reativação > assistido > automático. A lista de homologação continua sendo
 * a última trava, aplicada pelo chamador DEPOIS desta decisão.
 * Falha de leitura bloqueia (fail-closed). Toda mudança grava quem, quando, valor anterior, valor novo e motivo.
 */
import { pool } from "@workspace/db";

export type CanalAtendimento = "whatsapp" | "telegram";
export type ModoAtendimento = "automatico" | "assistido" | "humano";
export type EscopoControle = "clinica" | "canal" | "contato";

export interface DecisaoControle {
  acao: "automatico" | "assistido" | "bloqueado";
  motivo: string | null;
}

let pronto: Promise<void> | null = null;
export function garantirControle(): Promise<void> {
  pronto ??= (async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(19872027)");
      await c.query(`CREATE TABLE IF NOT EXISTS atendimento_controle (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        escopo TEXT NOT NULL CHECK (escopo IN ('clinica','canal','contato')),
        canal TEXT CHECK (canal IN ('whatsapp','telegram')),
        cliente_id INTEGER,
        ligado BOOLEAN NOT NULL DEFAULT TRUE,
        modo TEXT NOT NULL DEFAULT 'automatico' CHECK (modo IN ('automatico','assistido','humano')),
        bloqueio_emergencial BOOLEAN NOT NULL DEFAULT FALSE,
        reativado_em TIMESTAMPTZ,
        atualizado_por INTEGER,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK ((escopo='clinica' AND canal IS NULL AND cliente_id IS NULL)
            OR (escopo='canal' AND canal IS NOT NULL AND cliente_id IS NULL)
            OR (escopo='contato' AND cliente_id IS NOT NULL AND canal IS NULL)))`);
      await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS atendimento_controle_unico
        ON atendimento_controle (empresa_id, escopo, COALESCE(canal,''), COALESCE(cliente_id,0))`);
      await c.query(`CREATE TABLE IF NOT EXISTS atendimento_controle_log (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        escopo TEXT NOT NULL,
        canal TEXT,
        cliente_id INTEGER,
        campo TEXT NOT NULL,
        valor_anterior TEXT,
        valor_novo TEXT,
        motivo TEXT NOT NULL,
        alterado_por INTEGER,
        alterado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE INDEX IF NOT EXISTS atendimento_controle_log_empresa ON atendimento_controle_log (empresa_id, alterado_em DESC)`);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      pronto = null;
      throw e;
    } finally {
      c.release();
    }
  })();
  return pronto;
}

interface LinhaControle {
  escopo: EscopoControle; canal: string | null; cliente_id: number | null; ligado: boolean;
  modo: ModoAtendimento; bloqueio_emergencial: boolean; reativado_em: Date | string | null;
}

/** Decide o que o atendimento automático pode fazer agora com este contato neste canal. */
export async function decidirControle(p: {
  empresaId: number; canal: CanalAtendimento; clienteId: number; recebidoEm?: Date | string | null;
}): Promise<DecisaoControle> {
  try {
    await garantirControle();
    const r = await pool.query(
      `SELECT escopo,canal,cliente_id,ligado,modo,bloqueio_emergencial,reativado_em FROM atendimento_controle
        WHERE empresa_id=$1 AND (escopo='clinica' OR (escopo='canal' AND canal=$2) OR (escopo='contato' AND cliente_id=$3))`,
      [p.empresaId, p.canal, p.clienteId]);
    const linhas = r.rows as LinhaControle[];
    const humano = await pool.query(
      `SELECT 1 FROM telegram_atendimento t JOIN clients c ON c.id=t.cliente_id
        WHERE t.cliente_id=$1 AND c.empresa_id=$2 AND t.modo='humano'`, [p.clienteId, p.empresaId]);
    if (linhas.some((l) => l.bloqueio_emergencial)) return { acao: "bloqueado", motivo: "bloqueio_emergencial" };
    if (humano.rows.length || linhas.some((l) => l.escopo === "contato" && l.modo === "humano")) {
      return { acao: "bloqueado", motivo: "modo_humano" };
    }
    const por = (e: EscopoControle) => linhas.find((l) => l.escopo === e);
    if (por("clinica") && !por("clinica")!.ligado) return { acao: "bloqueado", motivo: "clinica_desligada" };
    if (por("canal") && !por("canal")!.ligado) return { acao: "bloqueado", motivo: "canal_desligado" };
    if (por("contato") && !por("contato")!.ligado) return { acao: "bloqueado", motivo: "contato_desligado" };
    if (p.recebidoEm) {
      const recebido = new Date(p.recebidoEm).getTime();
      const reativacoes = linhas.map((l) => (l.reativado_em ? new Date(l.reativado_em).getTime() : 0));
      if (Number.isFinite(recebido) && reativacoes.some((t) => t > 0 && recebido < t)) {
        return { acao: "bloqueado", motivo: "anterior_a_reativacao" };
      }
    }
    // O modo mais específico vence: contato > canal > clínica.
    const modo = por("contato")?.modo ?? por("canal")?.modo ?? por("clinica")?.modo ?? "automatico";
    if (modo === "assistido") return { acao: "assistido", motivo: "modo_assistido" };
    return { acao: "automatico", motivo: null };
  } catch {
    return { acao: "bloqueado", motivo: "controle_indisponivel" };
  }
}

export class ControleInvalido extends Error {}

export interface MudancaControle {
  empresaId: number; escopo: EscopoControle; canal?: CanalAtendimento | null; clienteId?: number | null;
  ligado?: boolean; modo?: ModoAtendimento; bloqueioEmergencial?: boolean; motivo: string; usuarioId: number | null;
}

/** Aplica a mudança e grava uma linha de histórico por campo alterado. Devolve os campos que mudaram. */
export async function alterarControle(m: MudancaControle): Promise<string[]> {
  await garantirControle();
  const motivo = (m.motivo ?? "").trim();
  if (motivo.length < 3 || motivo.length > 300) throw new ControleInvalido("motivo_obrigatorio");
  if (!["clinica", "canal", "contato"].includes(m.escopo)) throw new ControleInvalido("escopo_invalido");
  if (m.modo !== undefined && !["automatico", "assistido", "humano"].includes(m.modo)) throw new ControleInvalido("modo_invalido");
  if (m.ligado === undefined && m.modo === undefined && m.bloqueioEmergencial === undefined) throw new ControleInvalido("nada_a_alterar");
  const canal = m.escopo === "canal" ? m.canal ?? null : null;
  const clienteId = m.escopo === "contato" ? m.clienteId ?? null : null;
  if (m.escopo === "canal" && !["whatsapp", "telegram"].includes(String(canal))) throw new ControleInvalido("canal_invalido");
  if (m.escopo === "contato" && !(Number.isSafeInteger(clienteId) && (clienteId as number) > 0)) throw new ControleInvalido("contato_invalido");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (clienteId !== null) {
      // Um contato só pode ser controlado pela clínica a que pertence.
      const dono = await c.query(`SELECT 1 FROM clients WHERE id=$1 AND empresa_id=$2`, [clienteId, m.empresaId]);
      if (!dono.rows.length) throw new ControleInvalido("contato_de_outra_clinica");
    }
    await c.query(
      `INSERT INTO atendimento_controle (empresa_id,escopo,canal,cliente_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (empresa_id, escopo, COALESCE(canal,''), COALESCE(cliente_id,0)) DO NOTHING`,
      [m.empresaId, m.escopo, canal, clienteId]);
    const atual = (await c.query(
      `SELECT id,ligado,modo,bloqueio_emergencial FROM atendimento_controle
        WHERE empresa_id=$1 AND escopo=$2 AND COALESCE(canal,'')=COALESCE($3,'') AND COALESCE(cliente_id,0)=COALESCE($4,0) FOR UPDATE`,
      [m.empresaId, m.escopo, canal, clienteId])).rows[0] as { id: number; ligado: boolean; modo: string; bloqueio_emergencial: boolean };
    const mudou: string[] = [];
    const novo = {
      ligado: m.ligado ?? atual.ligado, modo: m.modo ?? atual.modo,
      bloqueio: m.bloqueioEmergencial ?? atual.bloqueio_emergencial,
    };
    const registrar = async (campo: string, antes: unknown, depois: unknown) => {
      mudou.push(campo);
      await c.query(
        `INSERT INTO atendimento_controle_log (empresa_id,escopo,canal,cliente_id,campo,valor_anterior,valor_novo,motivo,alterado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [m.empresaId, m.escopo, canal, clienteId, campo, String(antes), String(depois), motivo, m.usuarioId]);
    };
    if (novo.ligado !== atual.ligado) await registrar("ligado", atual.ligado, novo.ligado);
    if (novo.modo !== atual.modo) await registrar("modo", atual.modo, novo.modo);
    if (novo.bloqueio !== atual.bloqueio_emergencial) await registrar("bloqueio_emergencial", atual.bloqueio_emergencial, novo.bloqueio);
    // Reativação segura: ao religar ou desfazer o bloqueio/modo humano, o que chegou antes nunca é tratado como novo.
    const reativou = (novo.ligado && !atual.ligado) || (!novo.bloqueio && atual.bloqueio_emergencial) ||
      (atual.modo === "humano" && novo.modo !== "humano");
    await c.query(
      `UPDATE atendimento_controle SET ligado=$2,modo=$3,bloqueio_emergencial=$4,atualizado_por=$5,atualizado_em=NOW(),
         reativado_em=CASE WHEN $6 THEN NOW() ELSE reativado_em END WHERE id=$1`,
      [atual.id, novo.ligado, novo.modo, novo.bloqueio, m.usuarioId, reativou]);
    if (clienteId !== null && m.modo !== undefined && novo.modo !== atual.modo) {
      // O modo humano do contato é o mesmo estado que os dois canais já consultam; a conversa e o histórico ficam intactos.
      if (novo.modo === "humano") {
        await c.query(
          `INSERT INTO telegram_atendimento (cliente_id,modo,motivo,alterado_por) VALUES ($1,'humano','controle_painel',$2)
           ON CONFLICT (cliente_id) DO UPDATE SET modo='humano',motivo='controle_painel',alterado_em=NOW(),alterado_por=$2`,
          [clienteId, m.usuarioId]);
      } else if (atual.modo === "humano") {
        await c.query(
          `UPDATE telegram_atendimento SET modo='ia',motivo='devolvido_pelo_painel',alterado_em=NOW(),alterado_por=$2 WHERE cliente_id=$1`,
          [clienteId, m.usuarioId]);
      }
    }
    await c.query("COMMIT");
    return mudou;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

export async function lerControles(empresaId: number) {
  await garantirControle();
  const [estado, historico] = await Promise.all([
    pool.query(`SELECT escopo,canal,cliente_id,ligado,modo,bloqueio_emergencial,reativado_em,atualizado_por,atualizado_em
      FROM atendimento_controle WHERE empresa_id=$1 ORDER BY escopo,canal NULLS FIRST,cliente_id NULLS FIRST`, [empresaId]),
    pool.query(`SELECT escopo,canal,cliente_id,campo,valor_anterior,valor_novo,motivo,alterado_por,alterado_em
      FROM atendimento_controle_log WHERE empresa_id=$1 ORDER BY id DESC LIMIT 100`, [empresaId]),
  ]);
  return { estado: estado.rows, historico: historico.rows };
}
