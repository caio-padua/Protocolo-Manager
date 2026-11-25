/**
 * Banco, IA e envio reais do atendimento por IA no Telegram. A regra de decisão está em
 * lib/atendimento-telegram.ts (pura e testada); aqui só ficam as ligações.
 */
import { migrarConhecimentoGlobal } from "./global-conhecimento";
import { formatarSaidaHelenaDoBanco } from "./helena-formatador";
import { registrarFicha } from "./atendimento-ficha";
import { decidirControle } from "./atendimento-controle";
import { planejarAtendimentoWhatsapp } from "./atendimento-whatsapp";
import { depsOperacionaisWhatsapp } from "./atendimento-whatsapp-store";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";
import { getSetting } from "./secure-settings";
import { sendTelegram } from "./telegram";
import { escaparHtmlTelegram } from "./orientacao-texto";
import { chatAlertaOuNull } from "./telegram-config";
import { requireAiTenant } from "./ai-central";
import { registrarEvento, podeAtenderAutomatico, registrarCustoProvedor } from "./mensageria-credito";
import { randomUUID } from "node:crypto";
import {
  alterarEstadoFaqAprendida,
  buscarFaqAprendida,
  editarFaqAprendida,
  listarFaqAprendidas,
  listarVersoesFaqAprendida,
  migrarTabelasTelegramAprendiz,
  observarRespostaAprovada,
  painelUsoTelegramAprendiz,
  registrarResolucaoTelegram,
  registrarUsoFaqAprendida,
} from "./telegram-aprendiz";
import { planejarAgendamentoCliente, aplicarMigracaoAgendamentoTelegram } from "./telegram-agendamento-store";
import { criarConferenteLeitura, textoSeguroParaInterpretar } from "./telegram-interprete";
import { migrarBaseGlobal } from "./base-global-intencoes";
import { getModeloAtendimento } from "./atendimento-ia-config";
import { carregarFrases, comGlobais } from "./telegram-frases";
import {
  planejarAtendimento, normalizar,
  type ConfigAtendimentoIA, type DepsAtendimento, type Desfecho, type EntradaAtendimento, type Candidata,
} from "./atendimento-telegram";
import { migrarRecuperacaoAtendimento, registrarAtendimentoDuravel, processarAtendimentosDuraveis } from "./atendimento-telegram-recuperacao";
import { responderSobreDocumentoTelegram, respostaDocumentoAindaAtual } from "./atendimento-telegram-documentos";
import {
  autorizarCancelamentoReenvio,
  autorizarConfirmacaoReenvio,
  autorizarOfertaReenvio,
  enviarLinkReceitaConfirmada,
  marcarOfertaReenvioEntregue,
  marcarReenvioConcluido,
} from "./atendimento-telegram-reenvio";
import { cancelarAcompanhamentosDoCliente } from "./telegram-exam-followup-store";

export interface ExecutorAtendimento {
  execute: (q: SQL) => Promise<{ rows: unknown[] }>;
}

export async function aplicarMigracaoAtendimento(exec: ExecutorAtendimento): Promise<void> {
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS evolution_homologacao_config (
      empresa_id INTEGER PRIMARY KEY,
      texto_teste TEXT NOT NULL DEFAULT '',
      motor_ativo BOOLEAN NOT NULL DEFAULT FALSE,
      modelo_selecao TEXT NOT NULL DEFAULT '',
      modelo_interprete TEXT NOT NULL DEFAULT '',
      modelo_conferente TEXT NOT NULL DEFAULT '',
      modelo_aprendiz TEXT NOT NULL DEFAULT '',
      nome_assistente TEXT NOT NULL DEFAULT '',
      atualizado_por INTEGER,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await exec.execute(sql`ALTER TABLE evolution_homologacao_config
    ADD COLUMN IF NOT EXISTS modelo_selecao TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS modelo_interprete TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS modelo_conferente TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS modelo_aprendiz TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS nome_assistente TEXT NOT NULL DEFAULT ''`);
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
  /* Categorias (aditivo; registros antigos ficam sem categoria) e tom de voz por clínica */
  await exec.execute(sql`ALTER TABLE orientacoes_aprovadas ADD COLUMN IF NOT EXISTS categoria TEXT`);
  await exec.execute(sql`ALTER TABLE orientacoes_aprovadas ADD COLUMN IF NOT EXISTS subcategoria TEXT`);
  /* Propostas internas: ideias clínicas em revisão. NUNCA são orientação, nunca são usadas pela IA nem enviadas. */
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS orientacoes_propostas_internas (
      id            BIGSERIAL PRIMARY KEY,
      empresa_id    INTEGER     NOT NULL,
      titulo        TEXT        NOT NULL,
      descricao     TEXT        NOT NULL,
      riscos        TEXT        NOT NULL DEFAULT '',
      fontes        TEXT        NOT NULL DEFAULT '',
      status        TEXT        NOT NULL DEFAULT 'pendente_revisao' CHECK (status = 'pendente_revisao'),
      criado_por    INTEGER,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS assistente_tom_voz (
      empresa_id     INTEGER PRIMARY KEY,
      texto          TEXT        NOT NULL,
      status         TEXT        NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovada')),
      atualizado_por INTEGER,
      aprovado_por   INTEGER,
      aprovado_em    TIMESTAMPTZ,
      atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
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
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_documento_reenvios (
      id BIGSERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      cliente_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      recipe_id INTEGER NOT NULL,
      prescription_id INTEGER NOT NULL,
      document_type TEXT NOT NULL DEFAULT 'prescricao',
      document_id BIGINT,
      reissue_request_id BIGINT,
      pdf_sha256 TEXT NOT NULL,
      oferta_inbox_message_id BIGINT NOT NULL UNIQUE,
      confirmacao_inbox_message_id BIGINT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('ofertando','oferecido','enviando','enviado','cancelado','expirado','falhou')),
      expira_em TIMESTAMPTZ NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await exec.execute(sql`ALTER TABLE telegram_documento_reenvios
    ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'prescricao'`);
  await exec.execute(sql`ALTER TABLE telegram_documento_reenvios
    ADD COLUMN IF NOT EXISTS document_id BIGINT`);
  await exec.execute(sql`ALTER TABLE telegram_documento_reenvios
    ADD COLUMN IF NOT EXISTS reissue_request_id BIGINT`);
  await exec.execute(sql`ALTER TABLE telegram_documento_reenvios
    ALTER COLUMN recipe_id DROP NOT NULL, ALTER COLUMN prescription_id DROP NOT NULL`);
  await exec.execute(sql`UPDATE telegram_documento_reenvios
    SET document_id=recipe_id WHERE document_id IS NULL`);
  await exec.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_reenvio_aberto
    ON telegram_documento_reenvios (empresa_id, cliente_id)
    WHERE status IN ('ofertando','oferecido','enviando')`);
  await migrarRecuperacaoAtendimento(exec);
  await migrarTabelasTelegramAprendiz(exec);
  await migrarBaseGlobal(exec);
  await migrarConhecimentoGlobal(exec);
  /* Assistente de agendamento: estado, visitantes e pedidos (aditiva) */
  await aplicarMigracaoAgendamentoTelegram(exec);
}

/** Profissional assumiu: pausa as respostas automáticas deste cliente. */
export async function pausarParaHumano(exec: ExecutorAtendimento, clienteId: number, motivo: string, porProfissional: number | null = null): Promise<void> {
  await exec.execute(sql`
    INSERT INTO telegram_atendimento (cliente_id, modo, motivo, alterado_por) VALUES (${clienteId}, 'humano', ${motivo}, ${porProfissional})
    ON CONFLICT (cliente_id) DO UPDATE SET modo='humano', motivo=${motivo}, alterado_em=NOW(), alterado_por=${porProfissional}`);
  await cancelarAcompanhamentosDoCliente(exec, clienteId, "human_takeover");
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
export async function escolherOrientacaoComIA(
  texto: string,
  cand: Candidata[],
  empresaId: number,
  inboxMessageId?: number,
  onUso?: () => void,
): Promise<number | null> {
  const textoSeguro = textoSeguroParaInterpretar(texto);
  if (!textoSeguro) return null;
  const ctx = requireAiTenant(empresaId, "agent");
  const lista = cand.map((c) => `${c.orientacao.id}: ${c.orientacao.tema} — ${c.orientacao.perguntasExemplo}`.slice(0, 400)).join("\n");
  const prompt = `Você escolhe qual orientação PRÉ-APROVADA responde exatamente à pergunta de um cliente de clínica.
Responda SOMENTE com o número da orientação ou 0 se nenhuma responder claramente, ou se a pergunta pedir diagnóstico, dose, troca de remédio ou renovação.
Não escreva mais nada.

Pergunta sem dados pessoais: """${textoSeguro}"""

Orientações:
${lista}`;
  // Modelo escolhido pela clínica (só modelos realmente conectados); sem escolha, o padrão atual.
  const modelo = await getModeloAtendimento(empresaId, "selecao");
  if (!modelo) return null;
  const chave = inboxMessageId ? `telegram:${inboxMessageId}:interprete:orientacao` : `ia:${randomUUID()}`;
  onUso?.();
  let msg: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    msg = await anthropic.messages.create(
      { model: modelo, max_tokens: 20, messages: [{ role: "user", content: prompt }] },
      Object.keys(ctx.headers).length ? { headers: ctx.headers } : undefined,
    );
  } catch (error) {
    await registrarCustoProvedor({ empresaId, chave, etapa: "telegram_interprete", provedor: "anthropic", modelo });
    throw error;
  }
  await registrarCustoProvedor({
    empresaId, chave, etapa: "telegram_interprete", provedor: "anthropic", modelo,
    inputTokens: msg.usage?.input_tokens ?? null, outputTokens: msg.usage?.output_tokens ?? null,
  });
  const out = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  const m = /^\d+$/.exec(out);
  if (!m) return null;
  const id = Number(out);
  return id > 0 ? id : null;
}

const idsEnviados=new Map<number,string>();

export function depsReaisAtendimento(
  empresaId: number,
  inboxMessageId?: number,
  uso?: { interprete: boolean; conferente: boolean },
): DepsAtendimento {
  const conferirLeitura = criarConferenteLeitura(empresaId, inboxMessageId, (etapa) => {
    if (etapa === "conferente" && uso) uso.conferente = true;
  });
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
    textoApresentacao: async (eid) => {
      const r = await db.execute(sql`SELECT nome FROM empresas WHERE id=${eid}`);
      const nome = (r.rows[0] as { nome?: string } | undefined)?.nome;
      if (!nome || normalizar(nome) !== "instituto padua") return null;
      return (await carregarFrases())("atendimento_apresentacao_instituto_padua");
    },
    responderDocumento: (e) => responderSobreDocumentoTelegram(db, e),
    buscarFaq: (texto, eid) => buscarFaqAprendida(eid, texto),
    textoEncaminhado: async (eid, clienteNome, motivo) => {
      const r = await db.execute(sql`SELECT nome FROM empresas WHERE id=${eid}`);
      const nomeClinica = (r.rows[0] as { nome?: string } | undefined)?.nome ?? null;
      const primeiroNome = clienteNome.trim().split(/\s+/)[0] ?? "";
      const frases = comGlobais(await carregarFrases(), { clinica: nomeClinica, primeiroNome });
      return frases(motivo === "sem_orientacao_aprovada" ? "orientacao_aprovada_indisponivel" : "sem_orientacao_encaminhada");
    },
    escolherComIA: (texto, cand) => escolherOrientacaoComIA(texto, cand, empresaId, inboxMessageId, () => {
      if (uso) uso.interprete = true;
    }),
    conferirComIA: (texto, cand, id) => conferirLeitura({
      texto,
      proposta: `A pergunta corresponde à orientação ${cand.find((c) => c.orientacao.id === id)?.orientacao.tema ?? "selecionada"}.`,
      opcoes: cand.map((c) => `${c.orientacao.id}: ${c.orientacao.tema} — ${c.orientacao.perguntasExemplo}`.slice(0, 400)),
    }),
    enviarAoPaciente: async (chatId, texto) => {
      const r = await sendTelegram(chatId, escaparHtmlTelegram(await formatarSaidaHelenaDoBanco(texto)));
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
      const pausa = await db.execute(sql`INSERT INTO telegram_atendimento (cliente_id,modo,motivo)
        SELECT id,'humano',${motivo} FROM clients WHERE id=${e.clienteId} AND empresa_id=${e.empresaId}
          AND telegram_chat_id=${e.chatId}
          AND NOT EXISTS(SELECT 1 FROM clients outra WHERE outra.telegram_chat_id=${e.chatId} AND outra.id<>${e.clienteId})
          AND EXISTS(SELECT 1 FROM telegram_atendimento_respostas WHERE inbox_message_id=${e.inboxMessageId}
            AND estado='processando' AND dono=${dono} AND atualizado_em>=NOW()-interval '5 minutes')
        ON CONFLICT (cliente_id) DO UPDATE
        SET modo='humano',motivo=${motivo},alterado_em=NOW(),alterado_por=NULL
        WHERE telegram_atendimento.modo='ia'
        RETURNING cliente_id`);
      if (pausa.rows.length) {
        await cancelarAcompanhamentosDoCliente(db, e.clienteId, "human_takeover");
      }
}

/** Executado no mesmo tick do outbox, sem cron adicional. */
export async function processarAtendimentosPendentes(): Promise<void> {
  await processarAtendimentosDuraveis(db,{
    permitido: async e=>{
      const ctl=await decidirControle({empresaId:e.empresaId,canal:"telegram",clienteId:e.clienteId});
      if(ctl.acao!=="automatico"){
        await registrarFicha({entrada:{...e,canal:"telegram"},plano:{pausa:null,alerta:null,resposta:null,orientacaoId:null,desfecho:"desligado"},
          mensagemRef:`tg:${e.inboxMessageId}`,estado:ctl.acao==="assistido"?"pendente":"bloqueado",motivo:`controle:${ctl.motivo}`});
        return false;
      }
      const cfg=await lerConfigAtendimento();
      if(!(cfg.modo==="ligado" || (cfg.modo==="lista" && cfg.permitidos.has(e.clienteId)))) return false;
      const { getSecretStatus } = await import("./secure-settings.js");
      if((await getSetting("telegram.active"))!=="true" || !(await getSecretStatus("telegram.botToken")).isSet) return false;
      // Crédito: a mensagem recebida é registrada (e cobrada uma só vez, por chave). Sem saldo, a mensagem fica
      // preservada para a equipe, sem resposta automática, e é retomada após a recarga.
      const rec=await registrarEvento({empresaId:e.empresaId,tipo:"recebida",chave:`recebida:cli:${e.inboxMessageId}`,conversaRef:`cli:${e.clienteId}`,inboxMessageId:e.inboxMessageId,descricao:"Mensagem recebida no Telegram"});
      if(!rec.ok) return false;
      return (await podeAtenderAutomatico(e.empresaId)).pode;
    },
    planejar: async e=>{
      const usoIA = { interprete: false, conferente: false };
      const deps=depsReaisAtendimento(e.empresaId, e.inboxMessageId, usoIA);
      // Agendamento primeiro (só se a conversa for de agendamento); o resto segue o fluxo de orientações.
      const cfg=await deps.lerConfig();
      if(cfg.modo!=="desligado" && (await deps.modoDoCliente(e.clienteId))!=="humano"){
        const ag=await planejarAgendamentoCliente({
          empresaId:e.empresaId, clienteId:e.clienteId, texto:e.texto, inboxMessageId:e.inboxMessageId, usoIA,
        });
        if(ag.tratada){
          // Várias mensagens acumuladas no mesmo minuto não devem repetir a mesma pergunta ao cliente.
          let resposta=ag.resposta;
          if(resposta){
            const rep=await db.execute(sql`SELECT 1 FROM telegram_inbox_messages WHERE cliente_id=${e.clienteId}
              AND direcao='saida' AND texto LIKE ${"%"+resposta.slice(-60).replace(/[%_\\]/g,"\\$&")} AND recebida_em>NOW()-interval '3 minutes' LIMIT 1`);
            if(rep.rows.length) resposta=null;
          }
          return {
            pausa:ag.pausa, alerta:ag.alerta, resposta, orientacaoId:null, faqId:null, aprendizChamado:false,
            desfecho:"agendamento_conduzido" as const, caminhoResolucao:ag.caminhoResolucao,
            interpreteChamado:usoIA.interprete, conferenteChamado:usoIA.conferente,
          };
        }
      }
      // Mesmo cérebro operacional do WhatsApp (saudação, identidade, endereço, retorno, esclarecimento, encaminhamento).
      // O agendamento já foi tratado acima; o menu numérico é exclusivo do WhatsApp.
      const entradaTg = { ...e, canal: "telegram" as const };
      const ops = { ...depsOperacionaisWhatsapp(entradaTg), menuAtivo: async () => false, agendar: async () => null };
      const plano = await planejarAtendimentoWhatsapp(deps, entradaTg, ops);
      plano.interpreteChamado ||= usoIA.interprete;
      plano.conferenteChamado ||= usoIA.conferente;
      return plano;
    },
    pausar: pausarAtendimentoDuravel,
    chatAlerta: chatAlertaOuNull,
    autorizarResposta: async (e,plano)=>{
      if((await decidirControle({empresaId:e.empresaId,canal:"telegram",clienteId:e.clienteId})).acao!=="automatico") return false;
      const modo=await db.execute(sql`SELECT modo,motivo,alterado_por FROM telegram_atendimento WHERE cliente_id=${e.clienteId}`);
      const atual=modo.rows[0] as {modo:string;motivo:string;alterado_por:number|null}|undefined;
      if(atual?.modo==="humano" && (!plano.pausa || atual.motivo!==plano.pausa || atual.alterado_por!==null)) return false;
      if(plano.orientacaoId){
        const r=await db.execute(sql`SELECT id FROM orientacoes_aprovadas WHERE id=${plano.orientacaoId}
          AND empresa_id=${e.empresaId} AND status='aprovada' AND resposta=${plano.resposta}`);
        if(!r.rows.length) return false;
      }
      if(plano.faqId){
        const r=await db.execute(sql`SELECT f.id FROM telegram_faq_aprendidas f
          JOIN orientacoes_aprovadas o ON o.id=f.orientacao_id AND o.empresa_id=f.empresa_id
          WHERE f.id=${plano.faqId} AND f.empresa_id=${e.empresaId} AND f.ativa=TRUE AND f.excluida_em IS NULL
            AND f.resposta=${plano.resposta}
            AND o.status='aprovada' AND (f.resposta_editada=TRUE OR o.resposta=f.resposta_fonte)`);
        if(!r.rows.length) return false;
      }
      if(plano.caminhoResolucao==="documento"){
        if(!await respostaDocumentoAindaAtual(db,e,plano)) return false;
      }
      const cfg=await lerConfigAtendimento();
      if(!(cfg.modo==="ligado" || (cfg.modo==="lista" && cfg.permitidos.has(e.clienteId)))) return false;
      if(plano.documento?.acao==="ofertar_reenvio" && !await autorizarOfertaReenvio(db,e,plano)) return false;
      if(plano.documento?.acao==="confirmar_reenvio" && !await autorizarConfirmacaoReenvio(db,e,plano)) return false;
      if(plano.documento?.acao==="cancelar_reenvio" && !await autorizarCancelamentoReenvio(db,e,plano)) return false;
      return !plano.pausa || plano.desfecho!=="queixa_texto_enviado" || cfg.queixaRevisada;
    },
    enviar: async (chat,texto,contexto)=>{
      if(contexto?.etapa==="resposta" && contexto.plano.documento?.acao==="confirmar_reenvio"){
        return enviarLinkReceitaConfirmada(chat,contexto.entrada,contexto.plano,contexto.dono);
      }
      return sendTelegram(chat,escaparHtmlTelegram(await formatarSaidaHelenaDoBanco(texto))).then(async r=>{
        if(contexto?.etapa==="resposta"){
          const ent={...contexto.entrada,canal:"telegram" as const};
          if(r.sent&&!r.mock&&r.messageId) idsEnviados.set(ent.inboxMessageId,String(r.messageId));
          await registrarFicha({entrada:ent,plano:contexto.plano,mensagemRef:`tg:${ent.inboxMessageId}`,
            estado:r.sent?"enviado":/^telegram_http_(429|5\d\d)$/.test(r.error??"")?"pendente":r.error?.startsWith("telegram_http_")?"falhou":"incerto",
            motivo:r.sent?null:r.error??null,respostaId:r.messageId?String(r.messageId):null,
            tentativa:{resultado:r.sent?"aceito":"falhou",providerId:r.messageId?String(r.messageId):null}});
        }
        return r;
      });
    },
    aposRespostaEntregue: async (e,texto,plano)=>{
      await registrarEvento({empresaId:e.empresaId,tipo:"enviada",chave:`enviada:cli:${e.inboxMessageId}`,conversaRef:`cli:${e.clienteId}`,inboxMessageId:e.inboxMessageId,descricao:"Resposta enviada ao cliente no Telegram"});
      if(plano.documento?.acao==="ofertar_reenvio") await marcarOfertaReenvioEntregue(e);
      if(plano.documento?.acao==="confirmar_reenvio") await marcarReenvioConcluido(e,plano);
      if(plano.faqId) await registrarUsoFaqAprendida(e.empresaId, plano.faqId, e.inboxMessageId);
      if(plano.orientacaoId && plano.caminhoResolucao!=="documento") plano.aprendizChamado = await observarRespostaAprovada({
        empresaId:e.empresaId, inboxMessageId:e.inboxMessageId, textoPergunta:e.texto, orientacaoId:plano.orientacaoId,
      });
    },
    aposConclusao: async (e,desfecho,plano)=>{
      const ent={...e,canal:"telegram" as const};
      const rid=idsEnviados.get(e.inboxMessageId)??null; idsEnviados.delete(e.inboxMessageId);
      await registrarFicha({entrada:ent,plano,mensagemRef:`tg:${e.inboxMessageId}`,respostaId:rid,
        estado:plano.resposta?"enviado":plano.desfecho==="sem_conteudo_textual"?"ignorado":"encaminhado",
        motivo:plano.resposta?null:plano.desfecho});
      if(desfecho==="orientacao_enviada") await registrarEvento({empresaId:e.empresaId,tipo:"solucionada",chave:`solucionada:cli:${e.inboxMessageId}`,conversaRef:`cli:${e.clienteId}`,inboxMessageId:e.inboxMessageId,descricao:"Solicitação solucionada com orientação aprovada"});
      if(plano.documento?.acao==="confirmar_reenvio") await marcarReenvioConcluido(e,plano);
      await registrarResolucaoTelegram({
        empresaId:e.empresaId, inboxMessageId:e.inboxMessageId,
        caminho:plano.caminhoResolucao ?? "equipe",
        interpreteChamado:plano.interpreteChamado ?? false,
        conferenteChamado:plano.conferenteChamado ?? false,
        aprendizChamado:plano.aprendizChamado ?? false,
      });
    },
  });
}

export { normalizar };
