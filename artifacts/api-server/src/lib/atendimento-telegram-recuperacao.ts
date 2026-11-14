/**
 * Recuperação do atendimento existente: mesmas decisões e transporte, mesma tabela
 * de reivindicações, mesmo tick do repasse. Não importa banco/configuração reais.
 */
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual";
import { classificarResultado, MAX_TENTATIVAS } from "./telegram-repasse-outbox";
import type { EntradaAtendimento, PlanoAtendimento } from "./atendimento-telegram";

export interface ExecutorAtendimentoDuravel { execute(q: SQL): Promise<{ rows: unknown[] }> }
export interface DepsAtendimentoDuravel {
  permitido(e: EntradaAtendimento): Promise<boolean>;
  planejar(e: EntradaAtendimento): Promise<PlanoAtendimento>;
  pausar(e: EntradaAtendimento, motivo: string, dono:string): Promise<void>;
  chatAlerta(): Promise<string | null>;
  autorizarResposta(e: EntradaAtendimento, plano: PlanoAtendimento): Promise<boolean>;
  enviar(chat: string, texto: string): Promise<{ sent: boolean; mock: boolean; error?: string }>;
  /** Medição: chamado só depois que o Telegram aceitou de verdade a resposta ao cliente (nunca em simulação ou falha). */
  aposRespostaEntregue?(e: EntradaAtendimento, texto: string): Promise<void>;
  /** Medição: chamado ao concluir o atendimento da mensagem. */
  aposConclusao?(e: EntradaAtendimento, desfecho: string | null): Promise<void>;
}
interface Etapa { estado: string; erro?: string | null }
interface Linha {
  inbox_message_id: number; tentativas: number; plano: PlanoAtendimento | null;
  etapas: Record<string, Etapa>; destino_alerta: string | null;
  empresa_id: number; cliente_id: number; chat_id: string; texto: string; direcao: string;
}

export async function migrarRecuperacaoAtendimento(exec: ExecutorAtendimentoDuravel): Promise<void> {
  await exec.execute(sql`ALTER TABLE telegram_atendimento_respostas
    ADD COLUMN IF NOT EXISTS estado TEXT,
    ADD COLUMN IF NOT EXISTS dono TEXT,
    ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS plano JSONB,
    ADD COLUMN IF NOT EXISTS etapas JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS destino_alerta TEXT,
    ADD COLUMN IF NOT EXISTS ultimo_erro TEXT,
    ADD COLUMN IF NOT EXISTS proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  // Reivindicação legada sem fechamento NÃO significa que é seguro enviar novamente.
  await exec.execute(sql`UPDATE telegram_atendimento_respostas
    SET estado=CASE WHEN fechado_em IS NULL THEN 'incerto' ELSE 'concluido' END,
        ultimo_erro=CASE WHEN fechado_em IS NULL THEN 'legado_sem_desfecho' ELSE ultimo_erro END
    WHERE estado IS NULL`);
  await exec.execute(sql`ALTER TABLE telegram_atendimento_respostas ALTER COLUMN estado SET DEFAULT 'pendente'`);
  await exec.execute(sql`CREATE INDEX IF NOT EXISTS ix_atendimento_retoma
    ON telegram_atendimento_respostas (proxima_tentativa_em) WHERE estado IN ('pendente','falhou')`);
}

export async function registrarAtendimentoDuravel(exec: ExecutorAtendimentoDuravel, id: number, permitido: boolean): Promise<void> {
  await exec.execute(sql`INSERT INTO telegram_atendimento_respostas (inbox_message_id,estado,desfecho,fechado_em)
    VALUES (${id},${permitido ? "pendente" : "concluido"},${permitido ? null : "desligado_ou_fora_da_lista"},
      CASE WHEN ${permitido} THEN NULL ELSE NOW() END)
    ON CONFLICT (inbox_message_id) DO NOTHING`);
}

export async function recuperarAtendimentosAbandonados(exec: ExecutorAtendimentoDuravel): Promise<void> {
  const completo=sql`plano IS NOT NULL
    AND (plano->>'alerta' IS NULL OR etapas->'alerta'->>'estado'='aceito_telegram')
    AND (plano->>'resposta' IS NULL OR etapas->'resposta'->>'estado'='aceito_telegram')`;
  await exec.execute(sql`UPDATE telegram_atendimento_respostas SET
    estado=CASE WHEN etapas->'alerta'->>'estado'='enviando' OR etapas->'resposta'->>'estado'='enviando'
      THEN 'incerto' WHEN ${completo} THEN 'concluido'
      WHEN tentativas >= ${MAX_TENTATIVAS} THEN 'esgotado' ELSE 'falhou' END,
    desfecho=CASE WHEN ${completo} THEN plano->>'desfecho' ELSE desfecho END,
    fechado_em=CASE WHEN ${completo} THEN NOW() ELSE fechado_em END,
    ultimo_erro=CASE WHEN ${completo} THEN NULL ELSE 'processo_interrompido' END, dono=NULL, atualizado_em=NOW()
    WHERE estado='processando' AND atualizado_em < NOW()-interval '5 minutes'`);
}

export async function tentarAtendimentoDuravel(exec: ExecutorAtendimentoDuravel, id: number, deps: DepsAtendimentoDuravel): Promise<void> {
  const dono = randomUUID();
  const claim = await exec.execute(sql`UPDATE telegram_atendimento_respostas
    SET estado='processando', dono=${dono}, tentativas=tentativas+1, atualizado_em=NOW()
    WHERE inbox_message_id=${id} AND estado IN ('pendente','falhou') AND proxima_tentativa_em<=NOW()
      AND tentativas<${MAX_TENTATIVAS} RETURNING inbox_message_id`);
  if (!claim.rows.length) return;
  const salvar = async (estado: string, erro: string | null = null, desfecho: string | null = null) => {
    await exec.execute(sql`UPDATE telegram_atendimento_respostas SET estado=${estado},ultimo_erro=${erro},
      desfecho=COALESCE(${desfecho},desfecho), dono=NULL,atualizado_em=NOW(),
      fechado_em=CASE WHEN ${estado} IN ('concluido','esgotado','incerto') THEN NOW() ELSE NULL END,
      proxima_tentativa_em=NOW()+make_interval(mins=>LEAST(32, power(2, LEAST(tentativas-1,5))::int))
      WHERE inbox_message_id=${id} AND dono=${dono} AND estado='processando'`);
  };
  try {
    const r = await exec.execute(sql`SELECT a.inbox_message_id,a.tentativas,a.plano,a.etapas,a.destino_alerta,
      m.empresa_id,m.cliente_id,m.chat_id,m.texto,m.direcao
      FROM telegram_atendimento_respostas a JOIN telegram_inbox_messages m ON m.id=a.inbox_message_id
      WHERE a.inbox_message_id=${id} AND a.dono=${dono}`);
    const l = r.rows[0] as Linha | undefined;
    if (!l) { await salvar("esgotado","origem_ausente"); return; }
    const e: EntradaAtendimento = { inboxMessageId: Number(id), empresaId: Number(l.empresa_id),
      clienteId: Number(l.cliente_id), chatId: l.chat_id, texto: l.texto, clienteNome: "" };
    const origemValida = () => vinculoTelegramAtualUnico(exec, {clienteId:e.clienteId,empresaId:e.empresaId,chatId:e.chatId});
    if (l.direcao !== "entrada" || !await origemValida()) { await salvar("esgotado","vinculo_origem_alterado"); return; }
    if (!await deps.permitido(e)) { await salvar("concluido",null,"desligado_ou_fora_da_lista"); return; }
    const plano = l.plano ?? await deps.planejar(e);
    const salvo = await exec.execute(sql`UPDATE telegram_atendimento_respostas SET plano=${JSON.stringify(plano)}::jsonb,
      orientacao_id=${plano.orientacaoId},atualizado_em=NOW()
      WHERE inbox_message_id=${id} AND dono=${dono} AND estado='processando'
        AND atualizado_em>=NOW()-interval '5 minutes' RETURNING inbox_message_id`);
    if (!salvo.rows.length) return; // dono antigo não pode produzir efeitos.
    if (plano.pausa) {
      if (!await deps.permitido(e) || !await origemValida()) { await salvar("esgotado","autorizacao_alterada"); return; }
      await deps.pausar(e, plano.pausa,dono);
    }
    const etapas = l.etapas ?? {};
    for (const etapa of ["alerta", "resposta"] as const) {
      const texto = plano[etapa];
      if (!texto || etapas[etapa]?.estado === "aceito_telegram") continue;
      if (!await deps.permitido(e) || !await origemValida()) { await salvar("esgotado","autorizacao_alterada"); return; }
      let destino = e.chatId;
      if (etapa === "alerta") {
        const atual = await deps.chatAlerta();
        if (!atual) { await salvar(Number(l.tentativas)>=MAX_TENTATIVAS?"esgotado":"falhou","destino_ausente"); return; }
        if (atual===e.chatId) {
          // Chat de alerta igual ao do cliente (ex.: contato de teste do próprio responsável): sem pausa, o alerta é dispensado e a resposta segue.
          if (plano.pausa) { await salvar("esgotado","destino_igual_origem"); return; }
          continue;
        }
        if (l.destino_alerta && atual !== l.destino_alerta) { await salvar("esgotado","destino_configurado_alterado"); return; }
        destino = l.destino_alerta ?? atual;
      } else if (!await deps.autorizarResposta(e,plano)) { await salvar("esgotado","resposta_nao_autorizada"); return; }
      const inicio = await exec.execute(sql`UPDATE telegram_atendimento_respostas
        SET etapas=etapas||jsonb_build_object(${etapa}::text,jsonb_build_object('estado','enviando')),
            destino_alerta=CASE WHEN ${etapa}='alerta' THEN ${destino} ELSE destino_alerta END, atualizado_em=NOW()
        WHERE inbox_message_id=${id} AND dono=${dono} AND estado='processando'
          AND atualizado_em>=NOW()-interval '5 minutes' RETURNING inbox_message_id`);
      if (!inicio.rows.length) return;
      const enviado = await deps.enviar(destino,texto);
      const resultado = classificarResultado(enviado.mock ? {kind:"simulado"} : enviado.sent ? {kind:"entregue"} :
        {kind:"falhou",erro:enviado.error??"sem_resultado"},Number(l.tentativas));
      const detalhe = JSON.stringify({estado:resultado.estado,erro:resultado.erro});
      if (etapa==="resposta" && resultado.estado==="aceito_telegram") {
        // Aceite local e cópia de saída são uma só operação atômica.
        await exec.execute(sql`WITH aceita AS (
          UPDATE telegram_atendimento_respostas SET etapas=etapas||jsonb_build_object(${etapa}::text,${detalhe}::jsonb),atualizado_em=NOW()
          WHERE inbox_message_id=${id} AND dono=${dono} AND estado='processando' RETURNING inbox_message_id)
          INSERT INTO telegram_inbox_messages (empresa_id,cliente_id,chat_id,texto,direcao,lida_em)
          SELECT ${e.empresaId},${e.clienteId},${e.chatId},${texto},'saida',NOW() FROM aceita`);
      } else {
        await exec.execute(sql`UPDATE telegram_atendimento_respostas
          SET etapas=etapas||jsonb_build_object(${etapa}::text,${detalhe}::jsonb),atualizado_em=NOW()
          WHERE inbox_message_id=${id} AND dono=${dono} AND estado='processando'`);
      }
      if (resultado.estado !== "aceito_telegram") { await salvar(resultado.estado,resultado.erro); return; }
      if (etapa==="resposta" && !enviado.mock) await deps.aposRespostaEntregue?.(e,texto).catch(()=>undefined);
    }
    await salvar("concluido",null,plano.desfecho);
    await deps.aposConclusao?.(e,plano.desfecho??null).catch(()=>undefined);
  } catch {
    // Nunca copiar exceção para banco/log. Se a barreira foi atravessada, não sabemos se chegou.
    const r = await exec.execute(sql`SELECT etapas,tentativas FROM telegram_atendimento_respostas WHERE inbox_message_id=${id} AND dono=${dono}`);
    const atual=r.rows[0] as {etapas?:Record<string,Etapa>;tentativas:number}|undefined;
    const etapas = atual?.etapas ?? {};
    const incerto = Object.values(etapas).some(x=>x.estado==="enviando");
    await salvar(incerto?"incerto":Number(atual?.tentativas)>=MAX_TENTATIVAS?"esgotado":"falhou",
      incerto?"resultado_desconhecido":"falha_antes_do_envio");
  }
}

export async function processarAtendimentosDuraveis(exec: ExecutorAtendimentoDuravel, deps: DepsAtendimentoDuravel, limite=20): Promise<void> {
  await recuperarAtendimentosAbandonados(exec);
  const r = await exec.execute(sql`SELECT inbox_message_id FROM telegram_atendimento_respostas
    WHERE estado IN ('pendente','falhou') AND proxima_tentativa_em<=NOW() AND tentativas<${MAX_TENTATIVAS}
    ORDER BY proxima_tentativa_em,inbox_message_id LIMIT ${limite}`);
  for (const l of r.rows as {inbox_message_id:number}[]) await tentarAtendimentoDuravel(exec,Number(l.inbox_message_id),deps);
}
