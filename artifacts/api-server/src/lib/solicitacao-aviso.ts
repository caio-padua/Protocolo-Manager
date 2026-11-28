/**
 * AVISO DE PEDIDO RECEBIDO + OFERTA DO PAM.
 * Ao registrar a solicitacao: (1) avisa que o pedido foi recebido; (2) se o cliente NAO tem beneficio Member ativo
 * (isencao aplicavel), oferece o PAM com o material ligado na biblioteca de anexos e a opcao avulsa.
 * Texto = modelo da clinica (sem IA). Cada (pedido, tipo) tem UMA linha de registro: reenvio nao duplica.
 * Modo (app_settings comunicacao.aviso_pedido.modo): "teste" (padrao: so participantes da lista de teste),
 * "ligado" (todos, ordem do CEO) ou "desligado". Mensagem nao enviada NUNCA aparece como enviada.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getSetting } from "./secure-settings.js";
import { consultarAnamnese } from "./anamnese-consulta.js";
import { enviarComunicacao, ambienteDoCliente, ErroComunicacao, type Categoria } from "./comunicacao-padrao.js";
import { PEDIDO_LABEL, type PedidoKind } from "./pedido-medico.js";

export type TipoAviso = "pedido_recebido" | "oferta_pam";
export type ModoAviso = "desligado" | "teste" | "ligado";
export type DecisaoPam = "isento" | "oferta";

/** Pura: beneficio ativo aplicavel isenta; sem beneficio, oferece o PAM. */
export function decidirPam(beneficioAtivo: boolean): DecisaoPam { return beneficioAtivo ? "isento" : "oferta"; }
export function lerModo(v: string | null | undefined): ModoAviso {
  const m = (v ?? "").trim().toLowerCase();
  return m === "ligado" || m === "desligado" ? m : "teste"; // valor ausente/ilegivel = teste (nunca liga por engano)
}

let pronto = false;
async function preparar(): Promise<void> {
  if (pronto) return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS solicitacao_aviso (
    id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, pedido_id INTEGER NOT NULL, cliente_id INTEGER NOT NULL, tipo TEXT NOT NULL,
    status TEXT NOT NULL, motivo TEXT, envio_id INTEGER, decisao TEXT, anamnese_concluida BOOLEAN, tentativas INTEGER NOT NULL DEFAULT 1,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pedido_id, tipo))`);
  pronto = true;
}

export interface EntradaAviso { pedidoId: number; clienteId: number; empresaId: number; kind: PedidoKind; beneficioAtivo: boolean }
export interface ResultadoAviso { tipo: TipoAviso; resultado: "aceito" | "recusado" | "incerto" | "nao_enviado" | "duplicado" | "pendente"; motivo?: string }

/** Pontos de contato com o mundo, injetaveis: o banco e o envio real ficam fora da maquina de estados (testavel). */
export interface DepsAviso {
  /** Reserva a linha (pedido, tipo). null = outro processo ja reservou ou ja foi aceito/incerto: NAO envia. */
  reservar(): Promise<number | null>;
  fechar(id: number, status: string, motivo: string | null, envioId: number | null): Promise<void>;
  enviar(): Promise<{ status: "aceito" | "recusado"; flyerEnviado: boolean; envioId: number; erro?: string }>;
  ehErroDeValidacao(err: unknown): boolean;
}

/** Recusa CONFIRMADA = nada saiu: o Telegram respondeu 4xx, ou nao havia token/chat de teste. Rede, tempo esgotado,
 * resposta invalida e 5xx sao ambiguos (a mensagem pode ter chegado) e nunca contam como recusa. */
export function rejeicaoConfirmada(erro: string | undefined | null): boolean {
  return !!erro && /telegram_http_4\d\d|sem token|TEST_FORCED_FAIL/.test(erro) && !/telegram_falha_de_rede|telegram_resultado_invalido|telegram_http_5\d\d/.test(erro);
}

/**
 * Estados: aceito (entregue) | recusado (nada saiu, pode retomar) | nao_enviado (modo/lista, pode retomar) |
 * incerto (algo pode ter saido: NUNCA retoma sozinho, exige conferencia humana) | pendente (reservado, em andamento).
 * So erro de validacao ANTES do envio vira "recusado". Qualquer outra excecao depois de tentar enviar e "incerto".
 */
export async function processarAviso(tipo: TipoAviso, modo: ModoAviso, ambiente: "teste" | "producao", d: DepsAviso): Promise<ResultadoAviso> {
  const id = await d.reservar();
  if (!id) return { tipo, resultado: "duplicado" };
  if (modo === "desligado") { await d.fechar(id, "nao_enviado", "modo_desligado", null); return { tipo, resultado: "nao_enviado", motivo: "modo_desligado" }; }
  if (modo === "teste" && ambiente !== "teste") { await d.fechar(id, "nao_enviado", "fora_da_lista_de_teste", null); return { tipo, resultado: "nao_enviado", motivo: "fora_da_lista_de_teste" }; }
  let r: Awaited<ReturnType<DepsAviso["enviar"]>>;
  try { r = await d.enviar(); }
  catch (err) {
    const m = String((err as Error).message ?? err).slice(0, 300);
    if (d.ehErroDeValidacao(err)) { await d.fechar(id, "recusado", m, null); return { tipo, resultado: "recusado", motivo: m }; }
    // pode ter saido antes da falha: nao autoriza reenvio automatico
    await d.fechar(id, "incerto", `falha_apos_tentativa:${m}`, null).catch(() => undefined);
    return { tipo, resultado: "incerto", motivo: m };
  }
  // O envio ja ocorreu: falha so de registro NAO pode desfazer nem liberar reenvio (a linha fica pendente).
  const status = r.status === "aceito" ? "aceito" : r.flyerEnviado || !rejeicaoConfirmada(r.erro) ? "incerto" : "recusado";
  await d.fechar(id, status, r.erro ?? (status === "incerto" ? "entrega parcial" : null), r.envioId);
  return { tipo, resultado: status, motivo: r.erro };
}

function depsReais(e: EntradaAviso, tipo: TipoAviso, categoria: Categoria, decisao: DecisaoPam, anamnese: boolean, ambiente: "teste" | "producao"): DepsAviso {
  return {
    async reservar() {
      const ins = await db.execute(sql`INSERT INTO solicitacao_aviso (empresa_id, pedido_id, cliente_id, tipo, status, decisao, anamnese_concluida)
        VALUES (${e.empresaId}, ${e.pedidoId}, ${e.clienteId}, ${tipo}, 'pendente', ${decisao}, ${anamnese}) ON CONFLICT (pedido_id, tipo) DO NOTHING RETURNING id`);
      const novo = (ins.rows[0] as { id: number } | undefined)?.id;
      if (novo) return novo;
      // So retoma o que nada enviou: recusado/nao_enviado. aceito, incerto e pendente nunca repetem. UPDATE atomico = uma so vencedora.
      const re = await db.execute(sql`UPDATE solicitacao_aviso SET status='pendente', tentativas=tentativas+1, atualizado_em=NOW()
        WHERE pedido_id=${e.pedidoId} AND tipo=${tipo} AND empresa_id=${e.empresaId} AND status IN ('recusado','nao_enviado') RETURNING id`);
      return (re.rows[0] as { id: number } | undefined)?.id ?? null;
    },
    async fechar(id, status, motivo, envioId) {
      await db.execute(sql`UPDATE solicitacao_aviso SET status=${status}, motivo=${motivo}, envio_id=${envioId}, atualizado_em=NOW() WHERE id=${id}`);
    },
    async enviar() {
      const r = await enviarComunicacao({ ambiente, categoria, clienteId: e.clienteId, referencia: PEDIDO_LABEL[e.kind] });
      return { status: r.status, flyerEnviado: r.flyerEnviado, envioId: r.envioId, erro: r.erro };
    },
    ehErroDeValidacao: (err) => err instanceof ErroComunicacao,
  };
}

/** Nunca lanca: a solicitacao ja foi registrada; a falha fica na tabela de registro. */
export async function avisarPedidoRecebido(e: EntradaAviso): Promise<ResultadoAviso[]> {
  try {
    await preparar();
    const modo = lerModo(await getSetting("comunicacao.aviso_pedido.modo"));
    const anam = await consultarAnamnese(e.clienteId, e.empresaId); // servico separado; so metadado
    const decisao = decidirPam(e.beneficioAtivo);
    // Consulta de ambiente ANTES de reservar: se falhar, nada fica preso como pendente.
    const amb = await ambienteDoCliente(e.clienteId);
    const out = [await processarAviso("pedido_recebido", modo, amb, depsReais(e, "pedido_recebido", "pedido_recebido", decisao, anam.concluida, amb))];
    if (decisao === "oferta") out.push(await processarAviso("oferta_pam", modo, amb, depsReais(e, "oferta_pam", "oferta_pam", decisao, anam.concluida, amb)));
    return out;
  } catch (err) {
    console.error("[solicitacao-aviso] falha", String((err as Error).message ?? err));
    return [];
  }
}

export async function listarAvisos(empresaId: number) {
  await preparar();
  return (await db.execute(sql`SELECT id, pedido_id, cliente_id, tipo, status, motivo, envio_id, decisao, anamnese_concluida, tentativas, criado_em, atualizado_em
    FROM solicitacao_aviso WHERE empresa_id=${empresaId} ORDER BY id DESC LIMIT 50`)).rows;
}
