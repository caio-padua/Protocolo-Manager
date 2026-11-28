/**
 * Fila de revisão da cascata + sinapses ratificadas (ISOLADO E DESATIVADO).
 * Regras: ratificar só com confirmação explícita de usuário da MESMA clínica, resposta revisada e sem conflito;
 * retificar nunca apaga (desativa) e nunca envia (gera só rascunho de mensagem complementar).
 * O executor recebe `query` e `connect` (pool); nada aqui usa o banco global sozinho nos testes.
 */
import { normalizarGatilho, validarRespostaSegura, type DecisaoCascata } from "./atendimento-cascata";

export interface PoolLike {
  query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }>;
  connect: () => Promise<{ query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }>; release: () => void }>;
}

export const MODOS_CASCATA = ["desligado", "sombra"] as const;
/** Qualquer valor diferente de "sombra" (inclusive "ligado") é tratado como desligado: a ativação real é decisão posterior ao teste humano. */
export const modoDaCascata = (valor: string | null | undefined): "desligado" | "sombra" => (valor?.trim().toLowerCase() === "sombra" ? "sombra" : "desligado");

export async function migrarCascata(p: Pick<PoolLike, "query">): Promise<void> {
  await p.query(`CREATE TABLE IF NOT EXISTS cascata_sinapses (
    id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, gatilho_norm TEXT NOT NULL, gatilho_original TEXT NOT NULL,
    resposta TEXT NOT NULL, intencao TEXT, ativa BOOLEAN NOT NULL DEFAULT TRUE, versao INTEGER NOT NULL DEFAULT 1,
    origem_revisao_id BIGINT, criado_por INTEGER NOT NULL, criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    desativada_em TIMESTAMPTZ, desativada_por INTEGER)`);
  await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cascata_sinapse_ativa ON cascata_sinapses (empresa_id, gatilho_norm) WHERE ativa`);
  await p.query(`CREATE TABLE IF NOT EXISTS cascata_revisoes (
    id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, cliente_id INTEGER, canal TEXT NOT NULL, mensagem_ref TEXT NOT NULL,
    pergunta_resumo TEXT NOT NULL, acao TEXT NOT NULL, estagio TEXT NOT NULL, motivo TEXT NOT NULL, intencao TEXT,
    resposta_proposta TEXT, sinapse_id BIGINT, parecer1 JSONB, parecer2 JSONB, parecer3 JSONB, chamadas_ia INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','ratificada','retificada')),
    sinapse_criada_id BIGINT, mensagem_complementar_rascunho TEXT, criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decidida_em TIMESTAMPTZ, decidida_por INTEGER, UNIQUE (empresa_id, canal, mensagem_ref))`);
  await p.query(`CREATE TABLE IF NOT EXISTS cascata_eventos (
    id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, revisao_id BIGINT, sinapse_id BIGINT, tipo TEXT NOT NULL,
    usuario_id INTEGER, detalhe JSONB, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

/** Busca exata (normalizada) e da própria clínica. Nunca por semelhança: sinapse é custo zero e determinística. */
export async function buscarSinapseExata(p: Pick<PoolLike, "query">, empresaId: number, texto: string) {
  const g = normalizarGatilho(texto);
  if (!g) return null;
  const r = await p.query(`SELECT id, resposta, intencao FROM cascata_sinapses WHERE empresa_id=$1 AND gatilho_norm=$2 AND ativa LIMIT 1`, [empresaId, g]);
  const x = r.rows[0];
  return x ? { id: Number(x.id), resposta: String(x.resposta), intencao: (x.intencao as string | null) ?? null } : null;
}

const resumir = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 160);

/** Grava a decisão na fila. Idempotente por (clínica, canal, mensagem). Não grava texto completo da conversa. */
export async function registrarRevisao(p: Pick<PoolLike, "query">, e: { empresaId: number; clienteId: number | null; canal: string; mensagemRef: string; texto: string }, d: DecisaoCascata): Promise<number | null> {
  const r = await p.query(
    `INSERT INTO cascata_revisoes (empresa_id,cliente_id,canal,mensagem_ref,pergunta_resumo,acao,estagio,motivo,intencao,resposta_proposta,sinapse_id,parecer1,parecer2,parecer3,chamadas_ia)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (empresa_id,canal,mensagem_ref) DO NOTHING RETURNING id`,
    [e.empresaId, e.clienteId, e.canal, e.mensagemRef, resumir(e.texto), d.acao, d.estagio, d.motivo, d.intencao, d.resposta, d.sinapseId,
      d.parecer1 ? JSON.stringify(d.parecer1) : null, d.parecer2 ? JSON.stringify(d.parecer2) : null, d.parecer3 ? JSON.stringify(d.parecer3) : null, d.chamadasIA]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

export async function listarRevisoes(p: Pick<PoolLike, "query">, empresaId: number, estado?: string, pagina = 1, porPagina = 20) {
  const lim = Math.min(Math.max(porPagina, 1), 100), off = (Math.max(pagina, 1) - 1) * lim;
  const args: unknown[] = [empresaId]; let filtro = "";
  if (estado) { args.push(estado); filtro = ` AND estado=$2`; }
  const r = await p.query(`SELECT id,canal,pergunta_resumo,acao,estagio,motivo,intencao,resposta_proposta,parecer1,parecer2,parecer3,estado,chamadas_ia,criada_em
    FROM cascata_revisoes WHERE empresa_id=$1${filtro} ORDER BY id DESC LIMIT ${lim} OFFSET ${off}`, args);
  return r.rows;
}

export type ResultadoRatificar =
  | { ok: true; sinapseId: number }
  | { ok: false; codigo: 400 | 403 | 404 | 409; erro: string; conflitoSinapseId?: number };

export interface PedidoRatificar { empresaId: number; revisaoId: number; usuarioId: number; confirmar: boolean; gatilho: string; resposta: string; intencao?: string | null }

/**
 * Cria sinapse ativa SOMENTE com: confirmação explícita, usuário identificado, revisão pendente da mesma clínica,
 * resposta revisada segura e sem conflito (sinapse ativa igual com resposta diferente, gatilho que contém/está contido
 * em outro de intenção diferente, ou pergunta já coberta por orientação aprovada da clínica).
 */
export async function ratificarRevisao(pool: PoolLike, q: PedidoRatificar): Promise<ResultadoRatificar> {
  if (q.confirmar !== true) return { ok: false, codigo: 400, erro: "confirmacao_explicita_obrigatoria" };
  if (!Number.isSafeInteger(q.usuarioId) || q.usuarioId <= 0) return { ok: false, codigo: 403, erro: "usuario_nao_identificado" };
  const gatilho = normalizarGatilho(q.gatilho);
  if (gatilho.length < 6 || gatilho.split(" ").length < 2) return { ok: false, codigo: 400, erro: "gatilho_curto_demais" };
  const v = validarRespostaSegura(q.resposta);
  if (!v.ok) return { ok: false, codigo: 400, erro: v.motivo };
  const cl = await pool.connect();
  try {
    await cl.query("BEGIN");
    const rev = (await cl.query(`SELECT id,estado,acao FROM cascata_revisoes WHERE id=$1 AND empresa_id=$2 FOR UPDATE`, [q.revisaoId, q.empresaId])).rows[0];
    if (!rev) { await cl.query("ROLLBACK"); return { ok: false, codigo: 404, erro: "revisao_nao_encontrada" }; }
    if (rev.estado !== "pendente") { await cl.query("ROLLBACK"); return { ok: false, codigo: 409, erro: "revisao_ja_decidida" }; }
    if (rev.acao !== "responder") { await cl.query("ROLLBACK"); return { ok: false, codigo: 409, erro: "revisao_encaminhada_nao_vira_resposta_automatica" }; }
    const ativas = (await cl.query(`SELECT id,gatilho_norm,resposta,intencao FROM cascata_sinapses WHERE empresa_id=$1 AND ativa`, [q.empresaId])).rows as Array<{ id: number; gatilho_norm: string; resposta: string; intencao: string | null }>;
    for (const s of ativas) {
      const igual = s.gatilho_norm === gatilho;
      const contem = !igual && (s.gatilho_norm.includes(gatilho) || gatilho.includes(s.gatilho_norm));
      if (igual && s.resposta.trim() !== q.resposta.trim()) { await cl.query("ROLLBACK"); return { ok: false, codigo: 409, erro: "conflito_mesma_pergunta_resposta_diferente", conflitoSinapseId: Number(s.id) }; }
      if (igual) { await cl.query("ROLLBACK"); return { ok: false, codigo: 409, erro: "sinapse_identica_ja_ativa", conflitoSinapseId: Number(s.id) }; }
      if (contem && (s.intencao ?? "") !== (q.intencao ?? "")) { await cl.query("ROLLBACK"); return { ok: false, codigo: 409, erro: "conflito_com_gatilho_parecido_de_outra_intencao", conflitoSinapseId: Number(s.id) }; }
    }
    const orient = (await cl.query(`SELECT id, perguntas_exemplo FROM orientacoes_aprovadas WHERE empresa_id=$1 AND status='aprovada'`, [q.empresaId]).catch(() => ({ rows: [] as any[] }))).rows;
    for (const o of orient) {
      const exemplos = String(o.perguntas_exemplo ?? "").split(/\n|;/).map(normalizarGatilho).filter(Boolean);
      if (exemplos.includes(gatilho)) { await cl.query("ROLLBACK"); return { ok: false, codigo: 409, erro: "pergunta_ja_coberta_por_orientacao_aprovada", conflitoSinapseId: undefined }; }
    }
    let novo: number;
    try {
      const ins = await cl.query(`INSERT INTO cascata_sinapses (empresa_id,gatilho_norm,gatilho_original,resposta,intencao,origem_revisao_id,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [q.empresaId, gatilho, q.gatilho.slice(0, 200), q.resposta.trim(), q.intencao ?? null, q.revisaoId, q.usuarioId]);
      novo = Number(ins.rows[0].id);
    } catch (e) {
      await cl.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505") return { ok: false, codigo: 409, erro: "conflito_concorrente" };
      throw e;
    }
    await cl.query(`UPDATE cascata_revisoes SET estado='ratificada', sinapse_criada_id=$2, decidida_em=NOW(), decidida_por=$3 WHERE id=$1`, [q.revisaoId, novo, q.usuarioId]);
    await cl.query(`INSERT INTO cascata_eventos (empresa_id,revisao_id,sinapse_id,tipo,usuario_id,detalhe) VALUES ($1,$2,$3,'ratificada',$4,$5)`,
      [q.empresaId, q.revisaoId, novo, q.usuarioId, JSON.stringify({ gatilho })]);
    await cl.query("COMMIT");
    return { ok: true, sinapseId: novo };
  } catch (e) { await cl.query("ROLLBACK").catch(() => undefined); throw e; } finally { cl.release(); }
}

export interface PedidoRetificar { empresaId: number; revisaoId: number; usuarioId: number; motivo: string; mensagemComplementar?: string | null }
/** Retificar: marca como corrigida, DESATIVA (não apaga) a sinapse criada por esta revisão e guarda só um RASCUNHO de mensagem complementar. */
export async function retificarRevisao(pool: PoolLike, q: PedidoRetificar): Promise<{ ok: true; sinapseDesativada: boolean } | { ok: false; codigo: 400 | 403 | 404 | 409; erro: string }> {
  if (!Number.isSafeInteger(q.usuarioId) || q.usuarioId <= 0) return { ok: false, codigo: 403, erro: "usuario_nao_identificado" };
  if (!q.motivo || q.motivo.trim().length < 3) return { ok: false, codigo: 400, erro: "motivo_obrigatorio" };
  if (q.mensagemComplementar) { const v = validarRespostaSegura(q.mensagemComplementar); if (!v.ok) return { ok: false, codigo: 400, erro: v.motivo }; }
  const cl = await pool.connect();
  try {
    await cl.query("BEGIN");
    const rev = (await cl.query(`SELECT id,estado,sinapse_criada_id FROM cascata_revisoes WHERE id=$1 AND empresa_id=$2 FOR UPDATE`, [q.revisaoId, q.empresaId])).rows[0];
    if (!rev) { await cl.query("ROLLBACK"); return { ok: false, codigo: 404, erro: "revisao_nao_encontrada" }; }
    if (rev.estado === "retificada") { await cl.query("ROLLBACK"); return { ok: false, codigo: 409, erro: "revisao_ja_retificada" }; }
    let desativada = false;
    if (rev.sinapse_criada_id) {
      const d = await cl.query(`UPDATE cascata_sinapses SET ativa=FALSE, desativada_em=NOW(), desativada_por=$3 WHERE id=$1 AND empresa_id=$2 AND ativa RETURNING id`, [rev.sinapse_criada_id, q.empresaId, q.usuarioId]);
      desativada = d.rows.length > 0;
    }
    await cl.query(`UPDATE cascata_revisoes SET estado='retificada', mensagem_complementar_rascunho=$2, decidida_em=NOW(), decidida_por=$3 WHERE id=$1`, [q.revisaoId, q.mensagemComplementar ?? null, q.usuarioId]);
    await cl.query(`INSERT INTO cascata_eventos (empresa_id,revisao_id,sinapse_id,tipo,usuario_id,detalhe) VALUES ($1,$2,$3,'retificada',$4,$5)`,
      [q.empresaId, q.revisaoId, rev.sinapse_criada_id ?? null, q.usuarioId, JSON.stringify({ motivo: q.motivo.trim().slice(0, 300), rascunhoComplementar: Boolean(q.mensagemComplementar) })]);
    await cl.query("COMMIT");
    return { ok: true, sinapseDesativada: desativada };
  } catch (e) { await cl.query("ROLLBACK").catch(() => undefined); throw e; } finally { cl.release(); }
}
