/**
 * NEGOCIAÇÃO EXTRAORDINÁRIA COM CADÊNCIA DE 30 MINUTOS (minutos 0, 10, 20 e 30).
 *
 * - Persistente em PostgreSQL (negotiation_cadence_jobs): reinício do servidor não perde nem duplica etapa.
 * - Relógio, texto e envio são INJETADOS: testes controlam o tempo e nada real é enviado.
 * - Uma etapa só é enviada se foi "reivindicada" por UPDATE condicional (pendente -> enviando): sem duplicidade
 *   mesmo com duas instâncias do worker.
 * - Interrupção: mensagem nova do cliente, modo humano ou bloqueio emergencial pausam as etapas pendentes.
 * - Toda proposta e decisão fica em budget_eventos e cascata_eventos (trilha).
 * - Caminho B (acima do teto, sem custo, margem baixa ou cadência desligada): NENHUMA concessão automática.
 *   A equipe humana aprova; só então a frase "gestão autorizou" é enviada.
 */
import type { Pool } from "pg";
import { agendaCadencia, FRASES_CADENCIA, textoCondicoesExcepcionais, type CondicaoExcepcional } from "./budget-negociacao";
import { registrarEventoOrcamento } from "./comercial-politica";

export interface OfertaCongelada {
  condicoes: CondicaoExcepcional[];
  gerente: string;
  pedido?: { descontoPedidoPct: number | null; forma: string | null };
  motivoHumano?: string | null;
}

export interface NegociacaoLinha {
  id: number; empresaId: number; clienteId: number; budgetId: number; canal: "whatsapp" | "telegram";
  contato: string; estado: string; caminho: "A_automatico" | "B_humano"; oferta: OfertaCongelada;
}

export type PodeEnviar = { ok: true } | { ok: false; motivo: string };

export interface DepsCadencia {
  agora: () => Date;
  /** Texto final da frase editável da clínica (telegram_frases / modelo da clínica). */
  frase: (n: NegociacaoLinha, chave: string, vars: Record<string, string>) => Promise<string>;
  /** Envio efetivo; recebe a decisão do guard de saída. Retorna true somente se o provedor aceitou. */
  enviar: (n: NegociacaoLinha, texto: string, chave: string) => Promise<boolean>;
  /** Guard: motor ativo, homologação, modo humano e bloqueio emergencial. */
  podeEnviar: (n: NegociacaoLinha) => Promise<PodeEnviar>;
}

const mapa = (r: Record<string, any>): NegociacaoLinha => ({
  id: Number(r.id), empresaId: Number(r.empresa_id), clienteId: Number(r.cliente_id), budgetId: Number(r.budget_id),
  canal: r.canal, contato: String(r.contato), estado: String(r.estado), caminho: r.caminho, oferta: r.oferta as OfertaCongelada,
});

async function trilha(q: Pool, n: { empresaId: number; budgetId: number }, tipo: string, detalhe: unknown, usuarioId: number | null = null): Promise<void> {
  await registrarEventoOrcamento(q, { empresaId: n.empresaId, budgetId: n.budgetId, tipo, usuarioId, detalhe });
  await q.query(`CREATE TABLE IF NOT EXISTS cascata_eventos (
    id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, revisao_id BIGINT, sinapse_id BIGINT, tipo TEXT NOT NULL,
    usuario_id INTEGER, detalhe JSONB, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await q.query(`INSERT INTO cascata_eventos (empresa_id,tipo,usuario_id,detalhe) VALUES ($1,$2,$3,$4::jsonb)`,
    [n.empresaId, tipo, usuarioId, JSON.stringify({ budgetId: n.budgetId, ...(detalhe as object) })]);
}

/** Abre a negociação. Idempotente: já existindo uma ativa para o mesmo orçamento, devolve null (nada duplicado). */
export async function abrirNegociacao(q: Pool, a: {
  empresaId: number; clienteId: number; budgetId: number; canal: "whatsapp" | "telegram"; contato: string;
  caminho: "A_automatico" | "B_humano"; oferta: OfertaCongelada; motivo: string | null; mensagemOrigem: string; agora: Date;
}): Promise<{ id: number; caminho: string } | null> {
  const c = await q.connect();
  try {
    await c.query("BEGIN");
    const estado = a.caminho === "A_automatico" ? "cadencia_ativa" : "aguardando_gerente";
    const r = await c.query(
      `INSERT INTO negociacoes_comerciais (empresa_id,cliente_id,budget_id,canal,contato,estado,caminho,oferta,motivo,mensagem_origem,criado_em,atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$11)
       ON CONFLICT (empresa_id,cliente_id,budget_id) WHERE estado IN ('cadencia_ativa','aguardando_gerente','aprovada_gerente') DO NOTHING RETURNING id`,
      [a.empresaId, a.clienteId, a.budgetId, a.canal, a.contato, estado, a.caminho, JSON.stringify(a.oferta), a.motivo,
        a.mensagemOrigem.slice(0, 300), a.agora]);
    if (!r.rows[0]) { await c.query("ROLLBACK"); return null; }
    const id = Number(r.rows[0].id);
    if (a.caminho === "A_automatico") {
      const quando = agendaCadencia(a.agora.getTime());
      for (let etapa = 0; etapa < quando.length; etapa++) {
        await c.query(`INSERT INTO negotiation_cadence_jobs (negociacao_id,empresa_id,etapa,devido_em) VALUES ($1,$2,$3,$4)`,
          [id, a.empresaId, etapa, new Date(quando[etapa])]);
      }
    }
    await c.query("COMMIT");
    await trilha(q, a, a.caminho === "A_automatico" ? "negociacao_cadencia_aberta" : "negociacao_aguarda_humano",
      { negociacaoId: id, motivo: a.motivo, condicoes: a.oferta.condicoes, pedido: a.oferta.pedido ?? null });
    return { id, caminho: a.caminho };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally { c.release(); }
}

export async function negociacaoAtivaDoCliente(q: Pool, empresaId: number, clienteId: number): Promise<NegociacaoLinha | null> {
  const r = await q.query(
    `SELECT * FROM negociacoes_comerciais WHERE empresa_id=$1 AND cliente_id=$2 AND estado IN ('cadencia_ativa','aguardando_gerente','aprovada_gerente') ORDER BY id DESC LIMIT 1`,
    [empresaId, clienteId]);
  return r.rows[0] ? mapa(r.rows[0]) : null;
}

/** Cliente escreveu (ou modo humano/emergência): pausa as etapas pendentes. Não envia nada. Idempotente. */
export async function interromperNegociacao(q: Pool, empresaId: number, clienteId: number, motivo: string): Promise<NegociacaoLinha | null> {
  const n = await negociacaoAtivaDoCliente(q, empresaId, clienteId);
  if (!n || n.estado !== "cadencia_ativa") return null;
  await q.query(`UPDATE negotiation_cadence_jobs SET estado='pausado', motivo=$2 WHERE negociacao_id=$1 AND estado IN ('pendente','enviando')`, [n.id, motivo]);
  await q.query(`UPDATE negociacoes_comerciais SET estado='pausada', motivo=$2, atualizado_em=now() WHERE id=$1 AND estado='cadencia_ativa'`, [n.id, motivo]);
  await trilha(q, n, "negociacao_pausada", { negociacaoId: n.id, motivo });
  return n;
}

/** Processa etapas vencidas. Chamado a cada minuto pelo worker. Devolve o que foi feito (para testes e logs). */
export async function processarCadencia(q: Pool, deps: DepsCadencia): Promise<{ enviados: number; pausados: number; falhas: number }> {
  const agora = deps.agora();
  let enviados = 0, pausados = 0, falhas = 0;
  const vencidos = await q.query(
    `SELECT j.id AS job_id, j.etapa, n.* FROM negotiation_cadence_jobs j JOIN negociacoes_comerciais n ON n.id=j.negociacao_id
      WHERE j.estado='pendente' AND j.devido_em<=$1 AND n.estado='cadencia_ativa' ORDER BY j.devido_em, j.etapa LIMIT 50`, [agora]);
  for (const row of vencidos.rows) {
    const n = mapa(row); const etapa = Number(row.etapa); const jobId = Number(row.job_id);
    // Reivindicação atômica: só quem muda pendente -> enviando envia.
    const claim = await q.query(`UPDATE negotiation_cadence_jobs SET estado='enviando' WHERE id=$1 AND estado='pendente' RETURNING id`, [jobId]);
    if (!claim.rows[0]) continue;
    // Etapas anteriores ainda pendentes (worker parado): envia só a mais antiga por negociação a cada passada.
    const anterior = await q.query(`SELECT 1 FROM negotiation_cadence_jobs WHERE negociacao_id=$1 AND etapa<$2 AND estado IN ('pendente','enviando')`, [n.id, etapa]);
    if (anterior.rows[0]) { await q.query(`UPDATE negotiation_cadence_jobs SET estado='pendente' WHERE id=$1`, [jobId]); continue; }
    const pode = await deps.podeEnviar(n);
    if (!pode.ok) {
      await q.query(`UPDATE negotiation_cadence_jobs SET estado='pausado', motivo=$2 WHERE negociacao_id=$1 AND estado IN ('pendente','enviando')`, [n.id, pode.motivo]);
      await q.query(`UPDATE negociacoes_comerciais SET estado='pausada', motivo=$2, atualizado_em=now() WHERE id=$1`, [n.id, pode.motivo]);
      await trilha(q, n, "negociacao_pausada", { negociacaoId: n.id, etapa, motivo: pode.motivo });
      pausados++; continue;
    }
    const chave = FRASES_CADENCIA[etapa];
    const vars: Record<string, string> = { gerente: n.oferta.gerente };
    if (etapa === 3) vars.proposta = textoCondicoesExcepcionais(n.oferta.condicoes);
    let ok = false;
    try {
      const texto = await deps.frase(n, chave, vars);
      ok = await deps.enviar(n, texto, chave);
    } catch { ok = false; }
    if (ok) {
      await q.query(`UPDATE negotiation_cadence_jobs SET estado='enviado', enviado_em=$2 WHERE id=$1`, [jobId, agora]);
      if (etapa === 3) await q.query(`UPDATE negociacoes_comerciais SET estado='concluida', atualizado_em=now() WHERE id=$1`, [n.id]);
      await trilha(q, n, "negociacao_etapa_enviada", { negociacaoId: n.id, etapa, chave, ...(etapa === 3 ? { condicoes: n.oferta.condicoes } : {}) });
      enviados++;
    } else {
      // Falha não repete sozinha (evita mensagem duplicada se o provedor aceitou e a resposta se perdeu): fica registrada.
      await q.query(`UPDATE negotiation_cadence_jobs SET estado='falhou', motivo='envio_nao_confirmado' WHERE id=$1`, [jobId]);
      await q.query(`UPDATE negotiation_cadence_jobs SET estado='pausado', motivo='etapa_anterior_falhou' WHERE negociacao_id=$1 AND estado='pendente'`, [n.id]);
      await q.query(`UPDATE negociacoes_comerciais SET estado='pausada', motivo='envio_nao_confirmado', atualizado_em=now() WHERE id=$1`, [n.id]);
      await trilha(q, n, "negociacao_envio_falhou", { negociacaoId: n.id, etapa, chave });
      falhas++;
    }
  }
  return { enviados, pausados, falhas };
}

/** Caminho B: decisão humana real. Exige ferramenta aprovar_excecao (verificada na rota). */
export async function decidirNegociacaoHumana(q: Pool, a: {
  empresaId: number; negociacaoId: number; usuarioId: number; aprovar: boolean; condicoes?: CondicaoExcepcional[];
}): Promise<{ ok: true; negociacao: NegociacaoLinha } | { ok: false; erro: string }> {
  const r = await q.query(`SELECT * FROM negociacoes_comerciais WHERE id=$1 AND empresa_id=$2`, [a.negociacaoId, a.empresaId]);
  if (!r.rows[0]) return { ok: false, erro: "negociacao_nao_encontrada" };
  const n = mapa(r.rows[0]);
  if (n.estado !== "aguardando_gerente") return { ok: false, erro: "negociacao_nao_aguarda_decisao" };
  if (a.aprovar && !(a.condicoes ?? n.oferta.condicoes).length) return { ok: false, erro: "sem_condicao_para_aprovar" };
  const novo = a.aprovar ? "aprovada_gerente" : "recusada_gerente";
  const oferta = a.aprovar ? { ...n.oferta, condicoes: a.condicoes ?? n.oferta.condicoes } : n.oferta;
  await q.query(`UPDATE negociacoes_comerciais SET estado=$2, oferta=$3::jsonb, decidido_por=$4, decidido_em=now(), atualizado_em=now() WHERE id=$1`,
    [n.id, novo, JSON.stringify(oferta), a.usuarioId]);
  await trilha(q, n, a.aprovar ? "negociacao_aprovada_humano" : "negociacao_recusada_humano", { negociacaoId: n.id, condicoes: oferta.condicoes }, a.usuarioId);
  return { ok: true, negociacao: { ...n, estado: novo, oferta } };
}

/** Após aprovação humana, envia a frase "gestão autorizou" uma única vez. */
export async function enviarAprovacaoHumana(q: Pool, n: NegociacaoLinha, deps: DepsCadencia): Promise<boolean> {
  if (n.estado !== "aprovada_gerente") return false;
  const claim = await q.query(`UPDATE negociacoes_comerciais SET estado='concluida', atualizado_em=now() WHERE id=$1 AND estado='aprovada_gerente' RETURNING id`, [n.id]);
  if (!claim.rows[0]) return false;
  const pode = await deps.podeEnviar(n);
  if (!pode.ok) { await trilha(q, n, "negociacao_aprovada_nao_enviada", { negociacaoId: n.id, motivo: pode.motivo }); return false; }
  const texto = await deps.frase(n, "negociacao_gestao_aprovou", { gerente: n.oferta.gerente, proposta: textoCondicoesExcepcionais(n.oferta.condicoes) });
  const ok = await deps.enviar(n, texto, "negociacao_gestao_aprovou");
  await trilha(q, n, ok ? "negociacao_aprovacao_enviada" : "negociacao_aprovacao_envio_falhou", { negociacaoId: n.id });
  return ok;
}
