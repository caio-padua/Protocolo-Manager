/**
 * Evolution API (WhatsApp por QR Code) — rotas por clínica.
 * A clínica vem SEMPRE da sessão (tenantContext), nunca do corpo. O webhook é público e
 * só vale com o token secreto da clínica na URL. Simulações e saídas supervisionadas
 * são separadas do tráfego recebido e nunca fingem ser mensagens da pessoa.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import { getSecret, getSecretStatus } from "../lib/secure-settings";
import { getModeloAtendimento } from "../lib/atendimento-ia-config";
import { logger } from "../lib/logger";
import { requireCollaborator } from "./collaborator";
import { depsReaisAtendimento } from "../lib/atendimento-telegram-store";
import { planejarAtendimentoWhatsapp } from "../lib/atendimento-whatsapp";
import { depsOperacionaisWhatsapp } from "../lib/atendimento-whatsapp-store";
import { criarAgrupador } from "../lib/agrupador-mensagens";
import { telefoneCanonico } from "../lib/whatsapp-seguranca";
import { registrarStatusEvolution } from "../lib/evolution-document-delivery-status";
import { resolverIdentidadeWhatsapp } from "../lib/evolution-client-identity";
import { fonteAtendimentoAindaAutorizada } from "../lib/atendimento-resposta-autorizada";
import type { EntradaAtendimento, PlanoAtendimento } from "../lib/atendimento-telegram";
import { carregarFrases } from "../lib/telegram-frases";
import {
  autorizarCancelamentoReenvio,
  autorizarConfirmacaoReenvio,
  autorizarOfertaReenvio,
  enviarLinkReceitaConfirmada,
  marcarOfertaReenvioEntregue,
  marcarReenvioConcluido,
} from "../lib/atendimento-telegram-reenvio";
import {
  ConfigInvalida, dividirTextoSemPerda, contatoAutorizado, contatosAutorizados, homologacaoAtiva, chamar, chaveApi, chaveWebhook, consultarConexao, contatoDoJid, destinoDeEnvio,
  enderecoSeguro, garantirTabelasEvolution, lerConfig, mascararContato, normalizarBaseUrl, normalizarEvento,
  obterQr, podeEnviarAgora, registrarWebhook, salvarConfig, statusDoProvedor, enviarTextoEvolution,
  textoDaMensagem, tokenConfere, urlDoWebhook, validarNomeInstancia,
} from "../lib/evolution";

const router: IRouter = Router();
const publico: IRouter = Router();

const empresaDaSessao = (req: Request): number | null => {
  const c = req.tenantContext;
  return c?.authenticated && Number.isSafeInteger(c.empresaId) && c.empresaId > 0 ? c.empresaId : null;
};
const ehAdmin = (req: Request) =>
  Boolean(req.tenantContext?.authenticated && (req.tenantContext.isPlatformOwner || req.tenantContext.perfilPlataforma === "admin"));

function exigeEmpresa(req: Request, res: Response): number | null {
  const e = empresaDaSessao(req);
  if (e === null) res.status(401).json({ error: "Sessão sem clínica identificada." });
  return e;
}
function exigeAdmin(req: Request, res: Response): number | null {
  const e = exigeEmpresa(req, res);
  if (e === null) return null;
  if (!ehAdmin(req)) { res.status(403).json({ error: "Somente administrador da clínica." }); return null; }
  return e;
}

function baseApiPublica(req: Request): string | null {
  const dom = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (process.env.PUBLIC_API_BASE_URL) return process.env.PUBLIC_API_BASE_URL;
  return dom ? `https://${dom}` : null;
}

// ── Configuração ────────────────────────────────────────────────────────────
router.get("/evolution/config", requireCollaborator, async (req, res) => {
  const e = exigeEmpresa(req, res); if (e === null) return;
  const cfg = await lerConfig(e);
  const [chave, tok] = await Promise.all([getSecretStatus(chaveApi(e)), getSecretStatus(chaveWebhook(e))]);
  res.json({
    homologacao: homologacaoAtiva(), contatosAutorizados: contatosAutorizados().map(mascararContato),
    configurado: Boolean(cfg), baseUrl: cfg?.baseUrl ?? null, instanceName: cfg?.instanceName ?? null,
    chaveDefinida: Boolean(chave.isSet), webhookTokenDefinido: Boolean(tok.isSet), podeEditar: ehAdmin(req),
  });
});

router.put("/evolution/config", requireCollaborator, async (req, res) => {
  const e = exigeAdmin(req, res); if (e === null) return;
  try {
    const baseUrl = normalizarBaseUrl(req.body?.baseUrl);
    const instanceName = validarNomeInstancia(req.body?.instanceName);
    await enderecoSeguro(baseUrl);
    const chave = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : undefined;
    if (chave !== undefined && chave.length > 0 && (chave.length < 8 || chave.length > 512 || /\s/.test(chave))) {
      throw new ConfigInvalida("Chave de acesso inválida.");
    }
    const jaTem = Boolean((await getSecretStatus(chaveApi(e))).isSet);
    if (!jaTem && !chave) throw new ConfigInvalida("Informe a chave de acesso da instância.");
    await salvarConfig(e, baseUrl, instanceName, chave, `empresa:${e}`);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ConfigInvalida) { res.status(400).json({ error: err.message }); return; }
    // dns.lookup falhou: o servidor não existe
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[evolution] config recusada");
    res.status(400).json({ error: "Não foi possível resolver o endereço do servidor." });
  }
});

// ── Conexão e QR Code ───────────────────────────────────────────────────────
router.get("/evolution/conexao", requireCollaborator, async (req, res) => {
  const e = exigeEmpresa(req, res); if (e === null) return;
  res.json(await consultarConexao(e));
});

router.post("/evolution/qr", requireCollaborator, async (req, res) => {
  const e = exigeAdmin(req, res); if (e === null) return;
  res.json(await obterQr(e));
});

router.post("/evolution/webhook/registrar", requireCollaborator, async (req, res) => {
  const e = exigeAdmin(req, res); if (e === null) return;
  const base = baseApiPublica(req);
  const tok = await getSecret(chaveWebhook(e));
  if (!base || !tok) { res.status(409).json({ error: "Endereço público da API ou token do webhook ausente." }); return; }
  const r = await registrarWebhook(e, urlDoWebhook(base, e, tok));
  if (!r.ok) { res.status(502).json({ ok: false, status: r.status || null, falha: r.falha ?? null }); return; }
  res.json({ ok: true });
});

// ── Central: conversas e envio humano ──────────────────────────────────────
router.get("/evolution/conversas", requireCollaborator, async (req, res) => {
  const e = exigeEmpresa(req, res); if (e === null) return;
  await garantirTabelasEvolution();
  const r = await pool.query(
    `SELECT DISTINCT ON (contato) contato, direcao, corpo, status, criado_em
       FROM evolution_mensagens WHERE empresa_id = $1
      ORDER BY contato, criado_em DESC LIMIT 200`, [e]);
  const conversas = (r.rows as any[])
    .sort((a, b) => +new Date(b.criado_em) - +new Date(a.criado_em))
    .map((x) => ({ contato: x.contato, exibicao: mascararContato(x.contato), ultimaDirecao: x.direcao, ultimoTrecho: String(x.corpo).slice(0, 80), status: x.status, em: x.criado_em }));
  res.json({ conversas });
});

router.get("/evolution/mensagens", requireCollaborator, async (req, res) => {
  const e = exigeEmpresa(req, res); if (e === null) return;
  const contato = String(req.query.contato ?? "");
  if (!contato) { res.status(400).json({ error: "Informe o contato." }); return; }
  await garantirTabelasEvolution();
  const r = await pool.query(
    `SELECT id, direcao, corpo, status, erro, criado_em, atualizado_em FROM evolution_mensagens
      WHERE empresa_id = $1 AND contato = $2 ORDER BY criado_em DESC LIMIT 100`, [e, contato]);
  res.json({ mensagens: (r.rows as any[]).reverse() });
});

async function enviarUma(empresaId: number, destino: string, texto: string, contexto: string, usuarioId: number | null,
  atendimento?: {clienteId:number;mensagemOrigemId:number}) {
  const envio = await enviarTextoEvolution(empresaId, destino, texto, contexto, usuarioId, undefined, atendimento);
  return { http: envio.status, corpo: {
    ok: envio.accepted, id: envio.id, status: envio.messageStatus,
    erro: envio.error, error: envio.error, estado: envio.id ? undefined : envio.error,
  } };
}

async function autorizarSaidaEvolution(entrada: EntradaAtendimento, plano: PlanoAtendimento, revalidarDocumento = true): Promise<boolean> {
  if ((await resolverIdentidadeWhatsapp(db, entrada.empresaId, entrada.chatId))?.id !== entrada.clienteId) return false;
  const config = await pool.query(`SELECT motor_ativo FROM evolution_homologacao_config WHERE empresa_id=$1`, [entrada.empresaId]);
  if (!config.rows[0]?.motor_ativo) return false;
  const cfg = await depsReaisAtendimento(entrada.empresaId).lerConfig();
  if (!(cfg.modo === "ligado" || (cfg.modo === "lista" && cfg.permitidos.has(entrada.clienteId)))) return false;
  if (plano.desfecho === "queixa_texto_enviado" && !cfg.queixaRevisada) return false;
  if (plano.desfecho === "apresentacao_enviada" &&
    await depsReaisAtendimento(entrada.empresaId).textoApresentacao?.(entrada.empresaId) !== plano.resposta) return false;
  if (plano.fonteOperacional) {
    const ops = depsOperacionaisWhatsapp(entrada);
    const f = plano.fonteOperacional;
    if (await ops.frase(f.chave,f.variaveis) !== plano.resposta) return false;
    if (f.chave === "atendimento_endereco" &&
      await ops.endereco?.() !== f.variaveis?.endereco) return false;
    if (f.chave === "atendimento_consulta_agenda" &&
      await ops.consultarRetorno() !== f.variaveis?.compromissos) return false;
  }
  return fonteAtendimentoAindaAutorizada(db, entrada, plano, revalidarDocumento);
}
const usuarioDe = (req: Request): number | null => {
  const id = (req as any).tenantContext?.userId ?? (req as any).tenantContext?.colaboradorId;
  return Number.isSafeInteger(id) ? id : null;
};

async function processarEntradaEvolution(p: {
  empresaId: number;
  mensagemId: number;
  telefone: string;
  texto: string;
  clienteId: number;
  clienteNome: string;
}): Promise<void> {
  const eventoMotorId = 1_000_000_000_000 + p.mensagemId;
  const entrada = {
    inboxMessageId: eventoMotorId,
    empresaId: p.empresaId,
    clienteId: p.clienteId,
    clienteNome: p.clienteNome,
    chatId: p.telefone,
    texto: p.texto,
    canal: "whatsapp" as const,
    simulacao: false,
  };
  await pool.query(`UPDATE evolution_mensagens SET processamento='processando',cliente_id=$3,atualizado_em=NOW() WHERE id=$1 AND empresa_id=$2`, [p.mensagemId, p.empresaId,p.clienteId]);
  try {
    const uso = { interprete: false, conferente: false };
    const deps = depsReaisAtendimento(p.empresaId, eventoMotorId, uso);
    const plano = await planejarAtendimentoWhatsapp(deps, entrada, depsOperacionaisWhatsapp(entrada,
      () => autorizarSaidaEvolution(entrada, {pausa:null,alerta:null,resposta:null,orientacaoId:null,desfecho:"agendamento_conduzido"})));
    if (plano.desfecho === "desligado" || plano.desfecho === "fora_da_lista" || plano.desfecho === "pausado_humano") {
      await pool.query(
        `UPDATE evolution_mensagens SET processamento=$3, desfecho_atendimento=$4, plano_atendimento=$5::jsonb
          WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId, plano.desfecho, plano.desfecho, JSON.stringify(plano)]);
      return;
    }
    if (!await autorizarSaidaEvolution(entrada, plano)) {
      await pool.query(`UPDATE evolution_mensagens SET processamento='autorizacao_revogada' WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId]);
      return;
    }
    await pool.query(`UPDATE evolution_mensagens SET plano_atendimento=$3::jsonb,desfecho_atendimento=$4
      WHERE id=$1 AND empresa_id=$2`,[p.mensagemId,p.empresaId,JSON.stringify(plano),plano.desfecho]);
    if (plano.pausa) {
      await pool.query(
        `INSERT INTO telegram_atendimento (cliente_id, modo, motivo, alterado_por)
         SELECT id,'humano',$3,NULL FROM clients WHERE id=$1 AND empresa_id=$2 AND status='active' AND deleted_at IS NULL
         ON CONFLICT (cliente_id) DO UPDATE SET modo='humano',motivo=EXCLUDED.motivo,alterado_em=NOW(),alterado_por=NULL
         WHERE telegram_atendimento.modo='ia'`,
        [p.clienteId, p.empresaId, plano.pausa]);
      plano.encaminhamento = "registrado";
    }
    if (plano.alerta && !await deps.alertarEquipe(plano.alerta)) {
      plano.encaminhamento = "falha_alerta";
      // Nunca dizer que avisou a equipe quando o provedor recusou o alerta.
      const falha = await depsOperacionaisWhatsapp(entrada).frase("atendimento_falha_alerta");
      let avisoAceito = false;
      if (await autorizarSaidaEvolution(entrada, plano, false)) {
        const aviso = await enviarUma(p.empresaId,p.telefone,falha,"motor_evolution_falha_alerta",null,
          {clienteId:p.clienteId,mensagemOrigemId:p.mensagemId});
        avisoAceito = Boolean(aviso.corpo.ok);
      }
      await pool.query(
        `UPDATE evolution_mensagens SET processamento='falha_alerta', desfecho_atendimento=$3, plano_atendimento=$4::jsonb
          WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId, plano.desfecho, JSON.stringify({...plano,alertaEquipeAceito:false,avisoFalhaAceito:avisoAceito,resposta:falha})]);
      return;
    }
    if (plano.alerta) plano.encaminhamento = "alerta_aceito";
    if (plano.documento?.acao === "ofertar_reenvio" &&
        !await autorizarOfertaReenvio(db, entrada, plano)) {
      await pool.query(
        `UPDATE evolution_mensagens SET processamento='segunda_via_bloqueada', desfecho_atendimento=$3,
          plano_atendimento=$4::jsonb WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId, plano.desfecho, JSON.stringify(plano)]);
      return;
    }
    if (plano.documento?.acao === "confirmar_reenvio" &&
        !await autorizarConfirmacaoReenvio(db, entrada, plano)) {
      await pool.query(
        `UPDATE evolution_mensagens SET processamento='segunda_via_bloqueada', desfecho_atendimento=$3,
          plano_atendimento=$4::jsonb WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId, plano.desfecho, JSON.stringify(plano)]);
      return;
    }
    if (plano.documento?.acao === "cancelar_reenvio" &&
        !await autorizarCancelamentoReenvio(db, entrada, plano)) {
      await pool.query(
        `UPDATE evolution_mensagens SET processamento='segunda_via_bloqueada', desfecho_atendimento=$3,
          plano_atendimento=$4::jsonb WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId, plano.desfecho, JSON.stringify(plano)]);
      return;
    }

    if (plano.documento?.acao === "confirmar_reenvio") {
      if (!await autorizarSaidaEvolution(entrada, plano, false)) {
        await pool.query(`UPDATE evolution_mensagens SET processamento='autorizacao_revogada' WHERE id=$1 AND empresa_id=$2`,
          [p.mensagemId, p.empresaId]);
        return;
      }
      const resultado = await enviarLinkReceitaConfirmada(p.telefone, entrada, plano, `evolution:${p.mensagemId}`);
      if (resultado.documentLinkAccepted) await marcarReenvioConcluido(entrada, plano);
      const alertaEntregue = resultado.sent || await deps.alertarEquipe(
        `Falha ao entregar a segunda via pelo WhatsApp. Atendimento ${p.mensagemId}, cliente ${p.clienteId}, solicitação ${plano.documento.reissueRequestId ?? "não identificada"}. Motivo: ${resultado.error ?? "resultado não confirmado"}. Conferir na fila protegida de segundas vias; não repetir automaticamente.`,
      );
      await pool.query(
        `UPDATE evolution_mensagens SET processamento=$3, desfecho_atendimento=$4, orientacao_id=$5,
          plano_atendimento=$6::jsonb WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId, resultado.documentLinkAccepted ? "concluido" :
          alertaEntregue ? "segunda_via_pendente_de_conferencia" : "falha_alerta",
          plano.desfecho, plano.orientacaoId, JSON.stringify(plano)]);
      return;
    }

    if (!plano.resposta) {
      await pool.query(
        `UPDATE evolution_mensagens SET processamento='sem_resposta', desfecho_atendimento=$3,
          plano_atendimento=$4::jsonb WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId, plano.desfecho, JSON.stringify(plano)]);
      return;
    }
    if (!await autorizarSaidaEvolution(entrada, plano, !plano.documento?.acao)) {
      await pool.query(`UPDATE evolution_mensagens SET processamento='autorizacao_revogada' WHERE id=$1 AND empresa_id=$2`,
        [p.mensagemId, p.empresaId]);
      return;
    }
    const enviado = await enviarUma(p.empresaId, p.telefone, plano.resposta, "motor_evolution", null,
      {clienteId:p.clienteId,mensagemOrigemId:p.mensagemId});
    const dados = enviado.corpo as { ok?: boolean };
    if (dados.ok && plano.documento?.acao === "ofertar_reenvio") await marcarOfertaReenvioEntregue(entrada);
    // Só é "pendente de reenvio" o que está PROVADO como não enviado (sem registro de saída ou falha definitiva).
    // Resultado incerto nunca é repetido automaticamente.
    const provadoNaoEnviado = !dados.ok && (!enviado.corpo.id || enviado.corpo.status === "falha");
    await pool.query(
      `UPDATE evolution_mensagens SET processamento=$3, desfecho_atendimento=$4, orientacao_id=$5,
        plano_atendimento=$6::jsonb, atualizado_em=NOW() WHERE id=$1 AND empresa_id=$2`,
      [p.mensagemId, p.empresaId, dados.ok ? "concluido" : provadoNaoEnviado ? "envio_pendente" : "incerto",
        plano.desfecho, plano.orientacaoId, JSON.stringify(plano)]);
  } catch (error) {
    logger.error({ empresaId: p.empresaId, mensagemId: p.mensagemId, errorType: error instanceof Error ? error.constructor.name : typeof error }, "[evolution] falha no motor; sem repetição automática");
    await pool.query(
      `UPDATE evolution_mensagens SET processamento='incerto' WHERE id=$1 AND empresa_id=$2`,
      [p.mensagemId, p.empresaId]).catch(() => undefined);
  }
}

/** Responder dentro de uma conversa que o contato já iniciou (contato precisa ter escrito antes). */
router.post("/evolution/responder", requireCollaborator, async (req, res) => {
  const e = exigeEmpresa(req, res); if (e === null) return;
  const contato = String(req.body?.contato ?? "");
  const texto = String(req.body?.texto ?? "").trim();
  if (!contato || !texto || texto.length > 4000) { res.status(400).json({ error: "Contato e texto (até 4000) são obrigatórios." }); return; }
  await garantirTabelasEvolution();
  const ja = await pool.query(`SELECT 1 FROM evolution_mensagens WHERE empresa_id=$1 AND contato=$2 AND direcao='entrada' LIMIT 1`, [e, contato]);
  if (!ja.rows.length) { res.status(403).json({ error: "Só é possível responder a quem já escreveu para esta clínica." }); return; }
  const destino = destinoDeEnvio(contato);
  if (!destino) { res.status(400).json({ error: "Contato inválido." }); return; }
  const r = await enviarUma(e, destino, texto, "central_resposta", usuarioDe(req));
  res.status(r.http).json(r.corpo);
});

/** Teste isolado: um número escolhido pela equipe, confirmação explícita, um por vez. */
router.post("/evolution/teste", requireCollaborator, async (req, res) => {
  const e = exigeAdmin(req, res); if (e === null) return;
  if (req.body?.confirmo !== true) { res.status(400).json({ error: "Confirme que o destinatário autorizou o teste." }); return; }
  if (typeof req.body?.numero !== "string") { res.status(400).json({ error: "Informe um único número." }); return; }
  const destino = destinoDeEnvio(req.body.numero);
  if (!destino || destino.includes("@")) { res.status(400).json({ error: "Número inválido. Use DDD + número (ou +código do país)." }); return; }
  // Texto já cadastrado (ex.: prévia do motor de lembretes) segue INTEGRAL. Só passa de 4000 caracteres é dividido,
  // sem perda, e enviado em sequência a UM destinatário; para na primeira parte que falhar.
  const texto = String(req.body?.texto ?? "").trim();
  if (!texto) { res.status(400).json({ error: "Informe um texto editável. Não há mensagem de teste embutida." }); return; }
  const partes = dividirTextoSemPerda(texto.trim());
  const contexto = typeof req.body?.contexto === "string" && /^[a-z0-9_]{1,60}$/.test(req.body.contexto) ? req.body.contexto : "teste_isolado";
  const resultados: Array<{ parte: number; de: number; caracteres: number; http: number; ok?: boolean; id?: number; status?: string; erro?: string | null }> = [];
  let ultimoCorpo: Record<string, unknown> = {};
  for (let i = 0; i < partes.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000));
    const r = await enviarUma(e, destino, partes[i]!, contexto, usuarioDe(req));
    ultimoCorpo = r.corpo as Record<string, unknown>;
    const c = r.corpo as { ok?: boolean; id?: number; status?: string; erro?: string | null; error?: string };
    resultados.push({ parte: i + 1, de: partes.length, caracteres: partes[i]!.length, http: r.http, ok: c.ok, id: c.id, status: c.status, erro: c.erro ?? c.error ?? null });
    if (!c.ok) break;
  }
  const primeiro = resultados[0]!;
  if (partes.length === 1) { res.status(primeiro.http).json({ ...ultimoCorpo, partes: resultados }); return; }
  const todas = resultados.length === partes.length && resultados.every((x) => x.ok);
  res.status(todas ? 200 : 502).json({ ok: todas, partesTotal: partes.length, partes: resultados });
});

// ── Parâmetros editáveis, vínculo explícito e simulação supervisionada ──────
router.get("/evolution/homologacao/config", requireCollaborator, async (req, res) => {
  const empresaId = exigeAdmin(req, res); if (empresaId === null) return;
  await garantirTabelasEvolution();
  const textoInicial = "Olá, {cliente}. Vamos realizar um teste supervisionado do atendimento do PAXMED.\n\nA pergunta a seguir foi imaginada para teste e NÃO foi enviada por você: “{pergunta}”\n\nResposta produzida pelo motor real do PAXMED: {resposta}\n\nEste teste não criou pedido, cobrança nem documento.";
  await pool.query(
    `INSERT INTO evolution_homologacao_config (empresa_id, texto_teste)
     VALUES ($1,$2) ON CONFLICT (empresa_id) DO NOTHING`,
    [empresaId, textoInicial]);
  const texto = await pool.query(
    `SELECT texto_teste,motor_ativo,modelo_selecao,modelo_interprete,modelo_conferente,modelo_aprendiz,nome_assistente
       FROM evolution_homologacao_config WHERE empresa_id=$1`,
    [empresaId],
  );
  const atual = texto.rows[0] as {
    texto_teste?: string; motor_ativo?: boolean;
    modelo_selecao?: string; modelo_interprete?: string; modelo_conferente?: string;
    modelo_aprendiz?: string; nome_assistente?: string;
  } | undefined;
  res.json({
    empresaId,
    modelos: {
      selecao: atual?.modelo_selecao ?? "",
      interprete: atual?.modelo_interprete ?? "",
      conferente: atual?.modelo_conferente ?? "",
      aprendizagem: atual?.modelo_aprendiz ?? "",
    },
    textoTeste: atual?.texto_teste ?? "",
    motorAtivo: Boolean(atual?.motor_ativo),
    nomeAssistente: atual?.nome_assistente ?? "",
  });
});

router.get("/evolution/homologacao/agrupamento", requireCollaborator, async (req, res) => {
  const empresaId = exigeAdmin(req, res); if (empresaId === null) return;
  await garantirTabelasEvolution();
  res.json({ agrupamentoMs: await lerAgrupamentoMs(empresaId), maximoMs: 12000 });
});
// Intervalo para juntar mensagens seguidas da mesma pessoa. 0 desliga o agrupamento.
router.put("/evolution/homologacao/agrupamento", requireCollaborator, async (req, res) => {
  const empresaId = exigeAdmin(req, res); if (empresaId === null) return;
  await garantirTabelasEvolution();
  const ms = req.body?.agrupamentoMs;
  if (!Number.isInteger(ms) || ms < 0 || ms > 12000) { res.status(400).json({ error: "Informe de 0 a 12000 milissegundos." }); return; }
  await pool.query(
    `INSERT INTO evolution_homologacao_config (empresa_id,agrupamento_ms,atualizado_por) VALUES ($1,$2,$3)
     ON CONFLICT (empresa_id) DO UPDATE SET agrupamento_ms=EXCLUDED.agrupamento_ms,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW()`,
    [empresaId, ms, usuarioDe(req)]);
  res.json({ ok: true, agrupamentoMs: ms });
});

router.put("/evolution/homologacao/config", requireCollaborator, async (req, res) => {
  const empresaId = exigeAdmin(req, res); if (empresaId === null) return;
  await garantirTabelasEvolution();
  const modelos = req.body?.modelos ?? {};
  const entradasModelo: unknown[] = [modelos.selecao, modelos.interprete, modelos.conferente, modelos.aprendizagem];
  const textoTeste = req.body?.textoTeste;
  const nomeAssistente = req.body?.nomeAssistente;
  const motorAtivo = req.body?.motorAtivo;
  if (entradasModelo.some((value) => typeof value !== "string") ||
      entradasModelo.some((value) => String(value).trim().length > 100 ||
        (String(value).trim() !== "" && !/^[A-Za-z0-9._:-]+$/.test(String(value).trim()))) ||
      typeof textoTeste !== "string" || textoTeste.length > 4000 ||
      (textoTeste.trim() && (!textoTeste.includes("{cliente}") || !textoTeste.includes("{pergunta}") ||
        !textoTeste.includes("{resposta}") || /\{(?!cliente\}|pergunta\}|resposta\})[^}]+\}/.test(textoTeste))) ||
      typeof nomeAssistente !== "string" || nomeAssistente.trim().length > 80 ||
      typeof motorAtivo !== "boolean") {
    res.status(400).json({ error: "Revise os campos. O texto deve conter {cliente}, {pergunta} e {resposta}." }); return;
  }
  try {
    await pool.query(
      `INSERT INTO evolution_homologacao_config (
         empresa_id,texto_teste,motor_ativo,modelo_selecao,modelo_interprete,modelo_conferente,modelo_aprendiz,nome_assistente,atualizado_por
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (empresa_id) DO UPDATE SET
         texto_teste=EXCLUDED.texto_teste, motor_ativo=EXCLUDED.motor_ativo,
         modelo_selecao=EXCLUDED.modelo_selecao,modelo_interprete=EXCLUDED.modelo_interprete,
         modelo_conferente=EXCLUDED.modelo_conferente,modelo_aprendiz=EXCLUDED.modelo_aprendiz,
         nome_assistente=EXCLUDED.nome_assistente,
         atualizado_por=EXCLUDED.atualizado_por, atualizado_em=NOW()`,
      [
        empresaId, textoTeste.trim(), motorAtivo,
        String(modelos.selecao).trim(), String(modelos.interprete).trim(),
        String(modelos.conferente).trim(), String(modelos.aprendizagem).trim(),
        nomeAssistente.trim(), usuarioDe(req),
      ]);
  } catch (error) {
    logger.error({ empresaId, errorType: error instanceof Error ? error.constructor.name : typeof error }, "[evolution] falha ao salvar parâmetros");
    res.status(500).json({ error: "Não foi possível salvar os parâmetros." }); return;
  }
  res.json({ ok: true });
});

router.get("/evolution/homologacao/clientes", requireCollaborator, async (req, res) => {
  const empresaId = exigeAdmin(req, res); if (empresaId === null) return;
  await garantirTabelasEvolution();
  const r = await pool.query(
    `SELECT c.id, c.name, c.phone, v.telefone AS telefone_vinculado
       FROM clients c
       LEFT JOIN evolution_vinculos_cliente v
         ON v.empresa_id=c.empresa_id AND v.cliente_id=c.id
      WHERE c.empresa_id=$1 AND c.status='active' AND c.deleted_at IS NULL
      ORDER BY c.name`, [empresaId]);
  const clientes = (r.rows as Array<{ id: number; name: string | null; phone: string | null; telefone_vinculado: string | null }>)
    .map((c) => {
      const telefone = c.telefone_vinculado ?? telefoneCanonico(c.phone);
      return {
        id: Number(c.id),
        nome: c.name ?? "Sem nome cadastrado",
        telefone: telefone && contatoAutorizado(telefone) ? telefone : null,
        telefoneMascarado: telefone ? mascararContato(telefone) : null,
        vinculoExplicito: Boolean(c.telefone_vinculado),
      };
    });
  res.json({ clientes });
});

router.put("/evolution/homologacao/vinculo", requireCollaborator, async (req, res) => {
  const empresaId = exigeAdmin(req, res); if (empresaId === null) return;
  const clienteId = Number(req.body?.clienteId);
  const telefoneInformado = typeof req.body?.telefone === "string" ? req.body.telefone.trim() : "";
  const telefoneFinal = typeof req.body?.telefoneFinal === "string" ? req.body.telefoneFinal.replace(/\D/g, "") : "";
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0 || req.body?.confirmo !== true ||
      Boolean(telefoneInformado) === Boolean(telefoneFinal) || (telefoneFinal && telefoneFinal.length !== 4)) {
    res.status(400).json({ error: "Informe um único telefone completo ou os quatro últimos dígitos autorizados e confirme a origem." }); return;
  }
  let telefone = telefoneInformado ? telefoneCanonico(telefoneInformado) : null;
  if (telefoneFinal) {
    const matches = contatosAutorizados().filter((item) => item.endsWith(telefoneFinal));
    if (matches.length !== 1) {
      res.status(409).json({ error: "Os quatro últimos dígitos não identificam um único contato autorizado." }); return;
    }
    telefone = matches[0]!;
  }
  if (!telefone) {
    res.status(400).json({ error: "O telefone completo não é válido." }); return;
  }
  if (!contatoAutorizado(telefone)) {
    res.status(403).json({ error: "O telefone não está na lista de homologação autorizada." }); return;
  }
  await garantirTabelasEvolution();
  const cliente = await pool.query(
    `SELECT id FROM clients WHERE id=$1 AND empresa_id=$2 AND status='active' AND deleted_at IS NULL`,
    [clienteId, empresaId]);
  if (!cliente.rows.length) { res.status(404).json({ error: "Cliente ativo não encontrado nesta clínica." }); return; }
  const conflito = await pool.query(
    `SELECT cliente_id FROM evolution_vinculos_cliente WHERE empresa_id=$1 AND telefone=$2 AND cliente_id<>$3
     UNION ALL
     SELECT id AS cliente_id FROM clients
      WHERE empresa_id=$1 AND id<>$3 AND status='active' AND deleted_at IS NULL
        AND regexp_replace(COALESCE(phone,''),'\\D','','g') IN ($2, substring($2 from 3))
     LIMIT 1`, [empresaId, telefone, clienteId]);
  if (conflito.rows.length) { res.status(409).json({ error: "Este telefone já está associado a outro cadastro ativo." }); return; }
  await pool.query(
    `INSERT INTO evolution_vinculos_cliente (empresa_id, cliente_id, telefone, origem, confirmado_por)
     VALUES ($1,$2,$3,'confirmacao_administrador_homologacao',$4)
     ON CONFLICT (empresa_id, cliente_id) DO UPDATE SET
       telefone=EXCLUDED.telefone, origem=EXCLUDED.origem, confirmado_por=EXCLUDED.confirmado_por,
       confirmado_em=NOW(), atualizado_em=NOW()`,
    [empresaId, clienteId, telefone, usuarioDe(req)]);
  res.json({ ok: true, telefoneMascarado: mascararContato(telefone) });
});

router.post("/evolution/homologacao/planejar", requireCollaborator, async (req, res) => {
  const empresaId = exigeAdmin(req, res); if (empresaId === null) return;
  const clienteId = Number(req.body?.clienteId);
  const pergunta = typeof req.body?.pergunta === "string" ? req.body.pergunta.trim() : "";
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0 || !pergunta || pergunta.length > 1000) {
    res.status(400).json({ error: "Informe o cadastro e uma pergunta de teste de até 1000 caracteres." }); return;
  }
  await garantirTabelasEvolution();
  const r = await pool.query(
    `SELECT c.name, c.phone, v.telefone AS telefone_vinculado
       FROM clients c LEFT JOIN evolution_vinculos_cliente v
         ON v.empresa_id=c.empresa_id AND v.cliente_id=c.id
      WHERE c.id=$1 AND c.empresa_id=$2 AND c.status='active' AND c.deleted_at IS NULL`,
    [clienteId, empresaId]);
  const cliente = r.rows[0] as { name: string | null; phone: string | null; telefone_vinculado: string | null } | undefined;
  if (!cliente) { res.status(404).json({ error: "Cliente ativo não encontrado nesta clínica." }); return; }
  const destino = cliente.telefone_vinculado ?? telefoneCanonico(cliente.phone);
  if (!destino || !contatoAutorizado(destino)) {
    res.status(403).json({ error: "Este cadastro ainda não tem telefone autorizado para homologação." }); return;
  }
  if ((await resolverIdentidadeWhatsapp(db, empresaId, destino))?.id !== clienteId) {
    res.status(409).json({ error: "Identidade do contato ambígua ou não confirmada. Nada foi enviado." }); return;
  }
  const uso = { interprete: false, conferente: false };
  const entrada = {
    inboxMessageId: 0,
    empresaId,
    clienteId,
    clienteNome: cliente.name ?? "",
    chatId: destino,
    texto: pergunta,
    canal: "whatsapp" as const,
    simulacao: true,
  };
  try {
    const deps = depsReaisAtendimento(empresaId, undefined, uso);
    if (await deps.modoDoCliente(clienteId) === "humano") {
      res.status(409).json({ error: "Atendimento humano ativo. A conversa não foi reativada automaticamente e nada foi enviado.", desfecho: "pausado_humano" }); return;
    }
    const plano = await planejarAtendimentoWhatsapp(deps, entrada, depsOperacionaisWhatsapp(entrada));
    if ((await resolverIdentidadeWhatsapp(db, empresaId, destino))?.id !== clienteId ||
        !await fonteAtendimentoAindaAutorizada(db, entrada, plano)) {
      res.status(409).json({ error: "Identidade ou autorização mudou durante o planejamento. Nada foi enviado." }); return;
    }
    res.json({
      simulacao: true,
      mensagemDeEntradaRegistrada: false,
      resposta: plano.resposta,
      desfecho: plano.desfecho,
      caminhoResolucao: plano.caminhoResolucao ?? "equipe",
      orientacaoId: plano.orientacaoId,
      motor: {
        decisao: "atendimento PAXMED",
        interpretadorChamado: uso.interprete,
        conferidorChamado: uso.conferente,
        modeloSelecionado: Boolean(await getModeloAtendimento(empresaId, "selecao")),
      },
      efeitosExecutados: uso.interprete || uso.conferente
        ? ["inferência de IA contabilizada no motor de mensageria"]
        : [],
    });
  } catch (error) {
    logger.error({ empresaId, clienteId, errorType: error instanceof Error ? error.constructor.name : typeof error }, "[evolution] falha no plano supervisionado");
    res.status(500).json({ error: "O motor não conseguiu montar o plano. Nenhuma mensagem foi enviada." });
  }
});

router.post("/evolution/homologacao/enviar-resposta", requireCollaborator, async (req, res) => {
  const empresaId = exigeAdmin(req, res); if (empresaId === null) return;
  if (req.body?.confirmo !== true) { res.status(400).json({ error: "Confirme o envio individual da resposta do motor." }); return; }
  await garantirTabelasEvolution();
  const conf = await pool.query(`SELECT texto_teste FROM evolution_homologacao_config WHERE empresa_id=$1`, [empresaId]);
  const textoTeste = String((conf.rows[0] as { texto_teste?: string } | undefined)?.texto_teste ?? "").trim();
  if (!textoTeste) { res.status(409).json({ error: "Cadastre e salve o texto de teste editável antes de enviar." }); return; }
  const clienteId = Number(req.body?.clienteId);
  const pergunta = typeof req.body?.pergunta === "string" ? req.body.pergunta.trim() : "";
  const contexto = typeof req.body?.contexto === "string" && /^[a-z0-9_]{1,60}$/.test(req.body.contexto)
    ? `simulacao_motor_${req.body.contexto}` : "simulacao_motor";
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0 || !pergunta || pergunta.length > 1000) {
    res.status(400).json({ error: "Informe o cadastro e uma pergunta de teste de até 1000 caracteres." }); return;
  }
  const r = await pool.query(
    `SELECT c.name, c.phone, v.telefone AS telefone_vinculado
       FROM clients c LEFT JOIN evolution_vinculos_cliente v
         ON v.empresa_id=c.empresa_id AND v.cliente_id=c.id
      WHERE c.id=$1 AND c.empresa_id=$2 AND c.status='active' AND c.deleted_at IS NULL`,
    [clienteId, empresaId]);
  const cliente = r.rows[0] as { name: string | null; phone: string | null; telefone_vinculado: string | null } | undefined;
  if (!cliente) { res.status(404).json({ error: "Cliente ativo não encontrado nesta clínica." }); return; }
  const destino = cliente.telefone_vinculado ?? telefoneCanonico(cliente.phone);
  if (!destino || !contatoAutorizado(destino)) {
    res.status(403).json({ error: "Este cadastro ainda não tem telefone autorizado para homologação." }); return;
  }
  if ((await resolverIdentidadeWhatsapp(db, empresaId, destino))?.id !== clienteId) {
    res.status(409).json({ error: "Identidade do contato ambígua ou não confirmada. Nada foi enviado." }); return;
  }
  const uso = { interprete: false, conferente: false };
  try {
    const entrada: EntradaAtendimento = {
      inboxMessageId: 0, empresaId, clienteId, clienteNome: cliente.name ?? "", chatId: destino,
      texto: pergunta, canal: "whatsapp", simulacao: true,
    };
    const deps = depsReaisAtendimento(empresaId, undefined, uso);
    if (await deps.modoDoCliente(clienteId) === "humano") {
      res.status(409).json({ error: "Atendimento humano ativo. A conversa não foi reativada automaticamente e nada foi enviado.", desfecho: "pausado_humano" }); return;
    }
    const plano = await planejarAtendimentoWhatsapp(deps, entrada, depsOperacionaisWhatsapp(entrada));
    if (!plano.resposta) {
      res.status(409).json({ error: "O motor não produziu resposta. Nenhuma mensagem foi enviada.", desfecho: plano.desfecho }); return;
    }
    const corpo = textoTeste
      .replaceAll("{cliente}", cliente.name ?? "")
      .replaceAll("{pergunta}", pergunta)
      .replaceAll("{resposta}", plano.resposta);
    if (corpo.length > 4000) { res.status(400).json({ error: "A mensagem final excedeu o limite do canal." }); return; }
    if ((await resolverIdentidadeWhatsapp(db, empresaId, destino))?.id !== clienteId ||
        !await fonteAtendimentoAindaAutorizada(db, entrada, plano)) {
      res.status(409).json({ error: "Identidade ou autorização mudou durante o planejamento. Nada foi enviado." }); return;
    }
    const envio = await enviarUma(empresaId, destino, corpo, contexto, usuarioDe(req));
    res.status(envio.http).json({
      ...envio.corpo as Record<string, unknown>,
      simulacao: true,
      perguntaRegistradaComoEntrada: false,
      respostaGeradaPor: "motor PAXMED",
      desfecho: plano.desfecho,
      caminhoResolucao: plano.caminhoResolucao ?? "equipe",
      inferenciaIA: uso.interprete || uso.conferente,
    });
  } catch (error) {
    logger.error({ empresaId, clienteId, errorType: error instanceof Error ? error.constructor.name : typeof error }, "[evolution] falha no envio supervisionado");
    res.status(500).json({ error: "Falha ao gerar ou enviar. Confira o histórico antes de repetir." });
  }
});


/** Fecha o grupo: junta as mensagens aguardando, marca as anteriores como agrupadas e processa a última. */
async function lerAgrupamentoMs(empresaId: number): Promise<number> {
  const r = await pool.query(`SELECT agrupamento_ms FROM evolution_homologacao_config WHERE empresa_id=$1`, [empresaId]);
  const v = Number(r.rows[0]?.agrupamento_ms);
  return Number.isInteger(v) && v >= 0 && v <= 12000 ? v : 4000;
}

async function dispararAgrupamento(chave: string): Promise<void> {
  const [empresaTxt, contato] = chave.split("|");
  const empresaId = Number(empresaTxt);
  if (!Number.isSafeInteger(empresaId) || !contato) return;
  const r = await pool.query(
    `UPDATE evolution_mensagens SET processamento='agrupando'
      WHERE empresa_id=$1 AND contato=$2 AND direcao='entrada' AND processamento='aguardando_agrupamento'
      RETURNING id,corpo,cliente_id`, [empresaId, contato]);
  const linhas = (r.rows as Array<{ id: number | string; corpo: string; cliente_id: number | string }>)
    .sort((a, b) => Number(a.id) - Number(b.id));
  if (!linhas.length) return;
  const ultima = linhas[linhas.length - 1];
  const anteriores = linhas.slice(0, -1).map((l) => Number(l.id));
  if (anteriores.length) {
    await pool.query(
      `UPDATE evolution_mensagens SET processamento='agrupada',desfecho_atendimento='agrupada',
         plano_atendimento=jsonb_build_object('agrupadaEm',$3::bigint) WHERE empresa_id=$1 AND id=ANY($2::bigint[])`,
      [empresaId, anteriores, Number(ultima.id)]);
  }
  const cli = await pool.query(`SELECT name FROM clients WHERE id=$1 AND empresa_id=$2 AND status='active' AND deleted_at IS NULL`,
    [Number(ultima.cliente_id), empresaId]);
  await processarEntradaEvolution({
    empresaId, mensagemId: Number(ultima.id), telefone: contato,
    texto: linhas.map((l) => l.corpo).join("\n"),
    clienteId: Number(ultima.cliente_id), clienteNome: (cli.rows[0] as { name?: string } | undefined)?.name ?? "",
  });
}
const agrupadorEvolution = criarAgrupador(dispararAgrupamento);

/** Recuperação após reinício: o que ficou aguardando há mais de 15 s é processado agora. */
async function varrerAgrupamentosPendentes(): Promise<void> {
  const r = await pool.query(
    `SELECT DISTINCT empresa_id,contato FROM evolution_mensagens
      WHERE direcao='entrada' AND processamento='aguardando_agrupamento' AND criado_em < NOW() - interval '15 seconds'
        AND criado_em > NOW() - interval '1 day'`);
  for (const x of r.rows as Array<{ empresa_id: number; contato: string }>) agrupadorEvolution.agendar(`${x.empresa_id}|${x.contato}`, 0);
}

/**
 * Recupera SOMENTE o envio pendente: usa o plano já gravado (não reprocessa a intenção, não chama IA) e
 * só reenvia se não existir saída aceita/incerta para a mesma origem. Resultado incerto nunca é repetido.
 * O índice único evolution_saida_origem_unica é a trava final contra resposta duplicada.
 */
export async function recuperarEnviosPendentesEvolution(limite = 10, esperaSegundos = 60): Promise<number> {
  await garantirTabelasEvolution();
  const r = await pool.query(
    `SELECT e.id,e.empresa_id,e.contato,e.cliente_id,e.plano_atendimento,e.corpo
       FROM evolution_mensagens e
      WHERE e.direcao='entrada' AND e.processamento IN ('envio_pendente','processando')
        AND e.plano_atendimento->>'resposta' IS NOT NULL AND e.plano_atendimento->>'alerta' IS NULL
        AND e.plano_atendimento->'documento' IS NULL AND e.cliente_id IS NOT NULL
        AND COALESCE(e.atualizado_em,e.criado_em) < NOW() - make_interval(secs => $2)
        AND e.criado_em > NOW() - interval '1 day' AND e.tentativas_envio < 3
        AND NOT EXISTS (SELECT 1 FROM evolution_mensagens s WHERE s.empresa_id=e.empresa_id AND s.mensagem_origem_id=e.id
          AND s.direcao='saida' AND s.contexto='motor_evolution' AND s.status IN ('incerto','aceito','enviado','entregue','lido'))
      ORDER BY e.id LIMIT $1`, [limite, esperaSegundos]);
  let reenviados = 0;
  for (const l of r.rows as Array<{ id: number|string; empresa_id: number; contato: string; cliente_id: number; plano_atendimento: PlanoAtendimento; corpo: string }>) {
    const claim = await pool.query(
      `UPDATE evolution_mensagens SET processamento='reenviando',tentativas_envio=tentativas_envio+1,atualizado_em=NOW()
        WHERE id=$1 AND empresa_id=$2 AND processamento IN ('envio_pendente','processando') RETURNING id`, [l.id, l.empresa_id]);
    if (!claim.rows.length) continue;
    const plano = l.plano_atendimento;
    const entrada: EntradaAtendimento = { inboxMessageId: 1_000_000_000_000 + Number(l.id), empresaId: l.empresa_id,
      clienteId: Number(l.cliente_id), clienteNome: "", chatId: l.contato, texto: l.corpo, canal: "whatsapp", simulacao: false };
    try {
      if (!await autorizarSaidaEvolution(entrada, plano)) {
        await pool.query(`UPDATE evolution_mensagens SET processamento='autorizacao_revogada',atualizado_em=NOW() WHERE id=$1`, [l.id]);
        continue;
      }
      const env = await enviarUma(l.empresa_id, l.contato, plano.resposta as string, "motor_evolution", null,
        { clienteId: Number(l.cliente_id), mensagemOrigemId: Number(l.id) });
      const ok = Boolean(env.corpo.ok);
      const naoEnviado = !ok && (!env.corpo.id || env.corpo.status === "falha");
      await pool.query(`UPDATE evolution_mensagens SET processamento=$2,atualizado_em=NOW() WHERE id=$1`,
        [l.id, ok ? "concluido" : naoEnviado ? "envio_pendente" : "incerto"]);
      if (ok) reenviados++;
    } catch {
      await pool.query(`UPDATE evolution_mensagens SET processamento='incerto',atualizado_em=NOW() WHERE id=$1`, [l.id]).catch(() => undefined);
    }
  }
  return reenviados;
}
if (process.env.NODE_ENV !== "test") {
  setInterval(() => void recuperarEnviosPendentesEvolution().catch(() => undefined), 30_000).unref();
  setTimeout(() => void varrerAgrupamentosPendentes().catch(() => undefined), 20_000).unref();
  setInterval(() => void varrerAgrupamentosPendentes().catch(() => undefined), 60_000).unref();
}

// ── Webhook público (autenticidade = token secreto da clínica) ─────────────
publico.post("/evolution/webhook/:empresaId/:token", async (req, res) => {
  const empresaId = Number(req.params.empresaId);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) { res.status(403).json({ error: "recusado" }); return; }
  const esperado = await getSecret(chaveWebhook(empresaId)).catch(() => null);
  if (!tokenConfere(String(req.params.token ?? ""), esperado)) {
    logger.warn({ event: "evolution_webhook_token_invalido", empresaId }, "webhook Evolution recusado");
    res.status(403).json({ error: "recusado" });
    return;
  }
  const cfg = await lerConfig(empresaId);
  const corpo = (req.body ?? {}) as { event?: unknown; instance?: unknown; data?: any };
  // A instância do evento precisa ser a da clínica: evita misturar clínicas.
  if (!cfg || String(corpo.instance ?? "") !== cfg.instanceName) { res.status(200).json({ ok: true, ignorado: "instancia_diferente" }); return; }
  try {
    const evento = normalizarEvento(corpo.event);
    const itens: any[] = Array.isArray(corpo.data) ? corpo.data : corpo.data ? [corpo.data] : [];
    if (evento === "messages.upsert") {
      const motorConfig = await pool.query(
        `SELECT motor_ativo FROM evolution_homologacao_config WHERE empresa_id=$1`, [empresaId]);
      const motorAtivo = Boolean((motorConfig.rows[0] as { motor_ativo?: boolean } | undefined)?.motor_ativo);
      for (const d of itens) {
        const jid = String(d?.key?.remoteJid ?? "");
        const id = typeof d?.key?.id === "string" ? d.key.id : null;
        const c = contatoDoJid(jid);
        if (!c || c.grupo || d?.key?.fromMe || !id) continue;
        if (!contatoAutorizado(c.contato)) { logger.info({ empresaId, contato: mascararContato(c.contato) }, "[evolution] recebida ignorada: contato fora da homologação"); continue; }
        const texto = textoDaMensagem(d?.message);
        if (!texto) continue; // mídia e outros tipos: não registrados nesta versão
        const saved = await pool.query(
          `INSERT INTO evolution_mensagens (empresa_id, instancia, direcao, contato, corpo, provider_id, status, contexto)
           VALUES ($1,$2,'entrada',$3,$4,$5,'recebida','inbound') ON CONFLICT DO NOTHING RETURNING id`,
          [empresaId, cfg.instanceName, c.contato, texto, id]);
        if (!saved.rows.length) continue;
        const mensagemId = Number(saved.rows[0].id);
        if (!motorAtivo) continue;
        const identidade = await pool.query(
          `SELECT c.id,c.name FROM clients c
           LEFT JOIN evolution_vinculos_cliente v
             ON v.empresa_id=c.empresa_id AND v.cliente_id=c.id
           WHERE c.empresa_id=$1 AND c.status='active' AND c.deleted_at IS NULL
             AND (v.telefone=$2 OR regexp_replace(COALESCE(c.phone,''),'\\D','','g') IN ($2,substring($2 from 3)))
           ORDER BY c.id LIMIT 2`,
          [empresaId, c.contato]);
        if (identidade.rows.length !== 1) {
          const alertou = await depsReaisAtendimento(empresaId).alertarEquipe(
            `WhatsApp: identificação ${identidade.rows.length ? "ambígua" : "não confirmada"} no atendimento ${mensagemId}. Confira o contato no painel protegido antes de responder; nenhum documento foi enviado.`,
          );
          const frase = (await carregarFrases())(alertou
            ? "whatsapp_identidade_nao_confirmada" : "whatsapp_identidade_alerta_indisponivel");
          const aviso = await enviarUma(empresaId, c.contato, frase, "identidade_nao_confirmada", null);
          await pool.query(
            `UPDATE evolution_mensagens SET processamento=$3,plano_atendimento=$4::jsonb WHERE id=$1 AND empresa_id=$2`,
            [mensagemId, empresaId, identidade.rows.length ? "identidade_ambigua" : "identidade_nao_confirmada",
              JSON.stringify({ alertaEquipeAceito: alertou, avisoAoContatoAceito: Boolean(aviso.corpo.ok), dadosClinicosConsultados: false })]);
          continue;
        }
        const cliente = identidade.rows[0] as { id: number | string; name: string | null };
        const esperaMs = await lerAgrupamentoMs(empresaId);
        // Testes de agrupamento optam por usar a janela real da clínica com EVOLUTION_AGRUPAMENTO_TESTE=1.
        if ((process.env.NODE_ENV === "test" && process.env.EVOLUTION_AGRUPAMENTO_TESTE !== "1") || process.env.EVOLUTION_AGRUPAMENTO_MS === "0" || esperaMs === 0) {
          await processarEntradaEvolution({
            empresaId, mensagemId, telefone: c.contato, texto,
            clienteId: Number(cliente.id), clienteNome: cliente.name ?? "",
          });
          continue;
        }
        // Mensagens seguidas esperam 4 s e viram uma única entrada de atendimento.
        await pool.query(
          `UPDATE evolution_mensagens SET processamento='aguardando_agrupamento',cliente_id=$3 WHERE id=$1 AND empresa_id=$2`,
          [mensagemId, empresaId, Number(cliente.id)]);
        agrupadorEvolution.agendar(`${empresaId}|${c.contato}`, esperaMs);
      }
    } else if (evento === "messages.update") {
      for (const d of itens) {
        const id = d?.keyId ?? d?.key?.id;
        const novo = statusDoProvedor(d?.status);
        if (typeof id !== "string" || !novo) continue;
        await registrarStatusEvolution(empresaId, id, novo);
      }
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), empresaId }, "[evolution] falha ao processar webhook");
  }
  res.status(200).json({ ok: true });
});

export { publico as evolutionWebhookRouter, agrupadorEvolution };
export default router;
