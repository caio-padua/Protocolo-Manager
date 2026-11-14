/**
 * Banco, IA e envio reais do atendimento por IA no Telegram. A regra de decisão está em
 * lib/atendimento-telegram.ts (pura e testada); aqui só ficam as ligações.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";
import { getSetting } from "./secure-settings";
import { sendTelegram } from "./telegram";
import { chatAlertaOuNull } from "./telegram-config";
import { requireAiTenant } from "./ai-central";
import { planejarAgendamentoCliente, aplicarMigracaoAgendamentoTelegram } from "./telegram-agendamento-store";
import {
  planejarAtendimento, normalizar,
  type ConfigAtendimentoIA, type DepsAtendimento, type Desfecho, type EntradaAtendimento, type Candidata,
} from "./atendimento-telegram";
import { migrarRecuperacaoAtendimento, registrarAtendimentoDuravel, processarAtendimentosDuraveis } from "./atendimento-telegram-recuperacao";

export interface ExecutorAtendimento {
  execute: (q: SQL) => Promise<{ rows: unknown[] }>;
}

export async function aplicarMigracaoAtendimento(exec: ExecutorAtendimento): Promise<void> {
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS orientacoes_aprovadas (
      id                BIGSERIAL PRIMARY KEY,
      empresa_id        INTEGER     NOT NULL,
      tema              TEXT        NOT NULL,
      perguntas_exemplo TEXT        NOT NULL DEFAULT '',
      resposta          TEXT        NOT NULL,
      status            TEXT        NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovada','inativa')),
      criado_por        INTEGER,
      aprovado_por      INTEGER,
      aprovado_em       TIMESTAMPTZ,
      criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await exec.execute(sql`CREATE INDEX IF NOT EXISTS ix_orientacoes_empresa_status ON orientacoes_aprovadas (empresa_id, status)`);
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_atendimento (
      cliente_id    INTEGER PRIMARY KEY,
      modo          TEXT        NOT NULL DEFAULT 'ia' CHECK (modo IN ('ia','humano')),
      motivo        TEXT,
      alterado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      alterado_por  INTEGER
    )`);
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_atendimento_respostas (
      inbox_message_id BIGINT PRIMARY KEY,
      desfecho         TEXT,
      orientacao_id    BIGINT,
      criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fechado_em       TIMESTAMPTZ
    )`);
  await migrarRecuperacaoAtendimento(exec);
  /* Assistente de agendamento: estado, visitantes e pedidos (aditiva) */
  await aplicarMigracaoAgendamentoTelegram(exec);
}

/** Profissional assumiu: pausa as respostas automáticas deste cliente. */
export async function pausarParaHumano(exec: ExecutorAtendimento, clienteId: number, motivo: string, porProfissional: number | null = null): Promise<void> {
  await exec.execute(sql`
    INSERT INTO telegram_atendimento (cliente_id, modo, motivo, alterado_por) VALUES (${clienteId}, 'humano', ${motivo}, ${porProfissional})
    ON CONFLICT (cliente_id) DO UPDATE SET modo='humano', motivo=${motivo}, alterado_em=NOW(), alterado_por=${porProfissional}`);
}

export async function devolverParaIA(exec: ExecutorAtendimento, clienteId: number, porProfissional: number | null): Promise<void> {
  await exec.execute(sql`
    INSERT INTO telegram_atendimento (cliente_id, modo, motivo, alterado_por) VALUES (${clienteId}, 'ia', 'devolvido_pela_equipe', ${porProfissional})
    ON CONFLICT (cliente_id) DO UPDATE SET modo='ia', motivo='devolvido_pela_equipe', alterado_em=NOW(), alterado_por=${porProfissional}`);
}

export async function lerConfigAtendimento(): Promise<ConfigAtendimentoIA> {
  try {
    const m = (await getSetting("atendimento.ia.modo"))?.trim().toLowerCase();
    const modo = m === "lista" || m === "ligado" ? m : "desligado";
    const permitidos = new Set<number>();
    const raw = await getSetting("atendimento.ia.permitidos");
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) for (const v of arr) if (Number.isSafeInteger(v) && v > 0) permitidos.add(v as number);
    }
    const queixaRevisada = (await getSetting("atendimento.queixa.revisado"))?.trim().toLowerCase() === "true";
    return { modo, permitidos, queixaRevisada };
  } catch {
    return { modo: "desligado", permitidos: new Set(), queixaRevisada: false };
  }
}

/** A IA só devolve o NÚMERO da orientação aprovada que responde à pergunta (ou 0). Nunca redige texto. */
export async function escolherOrientacaoComIA(texto: string, cand: Candidata[], empresaId: number): Promise<number | null> {
  const ctx = requireAiTenant(empresaId, "agent");
  const lista = cand.map((c) => `${c.orientacao.id}: ${c.orientacao.tema} — ${c.orientacao.perguntasExemplo}`.slice(0, 400)).join("\n");
  const prompt = `Você escolhe qual orientação PRÉ-APROVADA responde exatamente à pergunta de um paciente de clínica.
Responda SOMENTE com o número da orientação ou 0 se nenhuma responder claramente, ou se a pergunta pedir diagnóstico, dose, troca de remédio ou renovação.
Não escreva mais nada.

Pergunta: """${texto.slice(0, 600)}"""

Orientações:
${lista}`;
  const msg = await anthropic.messages.create(
    { model: "claude-sonnet-4-6", max_tokens: 10, messages: [{ role: "user", content: prompt }] },
    Object.keys(ctx.headers).length ? { headers: ctx.headers } : undefined,
  );
  const out = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  const m = /^\d+$/.exec(out);
  if (!m) return null;
  const id = Number(out);
  return id > 0 ? id : null;
}

export function depsReaisAtendimento(empresaId: number): DepsAtendimento {
  return {
    lerConfig: lerConfigAtendimento,
    modoDoCliente: async (clienteId) => {
      const r = await db.execute(sql`SELECT modo FROM telegram_atendimento WHERE cliente_id=${clienteId}`);
      return (r.rows[0] as { modo?: string } | undefined)?.modo === "humano" ? "humano" : "ia";
    },
    reivindicar: async (id) => {
      const r = await db.execute(sql`INSERT INTO telegram_atendimento_respostas (inbox_message_id) VALUES (${id}) ON CONFLICT DO NOTHING RETURNING inbox_message_id`);
      return r.rows.length > 0;
    },
    carregarOrientacoes: async (eid) => {
      const r = await db.execute(sql`SELECT id, tema, perguntas_exemplo, resposta FROM orientacoes_aprovadas WHERE empresa_id=${eid} AND status='aprovada' ORDER BY id`);
      return (r.rows as { id: number | string; tema: string; perguntas_exemplo: string; resposta: string }[]).map((x) => ({
        id: Number(x.id), tema: x.tema, perguntasExemplo: x.perguntas_exemplo, resposta: x.resposta,
      }));
    },
    escolherComIA: (texto, cand) => escolherOrientacaoComIA(texto, cand, empresaId),
    enviarAoPaciente: async (chatId, texto) => {
      const r = await sendTelegram(chatId, texto);
      return r.sent && !r.mock;
    },
    registrarSaida: async (p) => {
      await db.execute(sql`INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, recebida_em, direcao, lida_em)
        VALUES (${p.empresaId}, ${p.clienteId}, ${p.chatId}, ${p.texto}, NOW(), 'saida', NOW())`);
    },
    passarParaHumano: (clienteId, motivo) => pausarParaHumano(db, clienteId, motivo, null),
    alertarEquipe: async (texto) => {
      const chat = await chatAlertaOuNull();
      if (!chat) return false;
      const r = await sendTelegram(chat, texto);
      return r.sent && !r.mock;
    },
    registrarDesfecho: async (id, d, orientacaoId) => {
      await db.execute(sql`UPDATE telegram_atendimento_respostas SET desfecho=${d}, orientacao_id=${orientacaoId}, fechado_em=NOW(), estado='concluido' WHERE inbox_message_id=${id}`);
    },
  };
}

/** Somente registro durável; falha lança para o webhook solicitar reentrega. Não envia. */
export async function atenderMensagemTelegram(e: EntradaAtendimento): Promise<void> {
  const cfg = await lerConfigAtendimento();
  await registrarAtendimentoDuravel(db,e.inboxMessageId,
    cfg.modo==="ligado" || (cfg.modo==="lista" && cfg.permitidos.has(e.clienteId)));
}

/** Efeito condicionado ao vínculo único e à reivindicação ainda válida, na mesma instrução. */
export async function pausarAtendimentoDuravel(e:EntradaAtendimento,motivo:string,dono:string):Promise<void>{
      await db.execute(sql`INSERT INTO telegram_atendimento (cliente_id,modo,motivo)
        SELECT id,'humano',${motivo} FROM clients WHERE id=${e.clienteId} AND empresa_id=${e.empresaId}
          AND telegram_chat_id=${e.chatId}
          AND NOT EXISTS(SELECT 1 FROM clients outra WHERE outra.telegram_chat_id=${e.chatId} AND outra.id<>${e.clienteId})
          AND EXISTS(SELECT 1 FROM telegram_atendimento_respostas WHERE inbox_message_id=${e.inboxMessageId}
            AND estado='processando' AND dono=${dono} AND atualizado_em>=NOW()-interval '5 minutes')
        ON CONFLICT (cliente_id) DO UPDATE
        SET modo='humano',motivo=${motivo},alterado_em=NOW(),alterado_por=NULL
        WHERE telegram_atendimento.modo='ia'`);
}

/** Executado no mesmo tick do outbox, sem cron adicional. */
export async function processarAtendimentosPendentes(): Promise<void> {
  await processarAtendimentosDuraveis(db,{
    permitido: async e=>{
      const cfg=await lerConfigAtendimento();
      return cfg.modo==="ligado" || (cfg.modo==="lista" && cfg.permitidos.has(e.clienteId));
    },
    planejar: async e=>{
      const deps=depsReaisAtendimento(e.empresaId);
      // Agendamento primeiro (só se a conversa for de agendamento); o resto segue o fluxo de orientações.
      const cfg=await deps.lerConfig();
      if(cfg.modo!=="desligado" && (await deps.modoDoCliente(e.clienteId))!=="humano"){
        const ag=await planejarAgendamentoCliente({empresaId:e.empresaId,clienteId:e.clienteId,texto:e.texto});
        if(ag.tratada) return {pausa:ag.pausa,alerta:ag.alerta,resposta:ag.resposta,orientacaoId:null,desfecho:"agendamento_conduzido" as const};
      }
      return planejarAtendimento(deps,e);
    },
    pausar: pausarAtendimentoDuravel,
    chatAlerta: chatAlertaOuNull,
    autorizarResposta: async (e,plano)=>{
      const modo=await db.execute(sql`SELECT modo,motivo,alterado_por FROM telegram_atendimento WHERE cliente_id=${e.clienteId}`);
      const atual=modo.rows[0] as {modo:string;motivo:string;alterado_por:number|null}|undefined;
      if(atual?.modo==="humano" && (!plano.pausa || atual.motivo!==plano.pausa || atual.alterado_por!==null)) return false;
      if(plano.orientacaoId){
        const r=await db.execute(sql`SELECT id FROM orientacoes_aprovadas WHERE id=${plano.orientacaoId}
          AND empresa_id=${e.empresaId} AND status='aprovada' AND resposta=${plano.resposta}`);
        if(!r.rows.length) return false;
      }
      const cfg=await lerConfigAtendimento();
      return !plano.pausa || plano.desfecho!=="queixa_texto_enviado" || cfg.queixaRevisada;
    },
    enviar: sendTelegram,
  });
}

export { normalizar };
