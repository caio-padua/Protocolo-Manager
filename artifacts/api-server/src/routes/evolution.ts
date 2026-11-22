/**
 * Evolution API (WhatsApp por QR Code) — rotas por clínica.
 * A clínica vem SEMPRE da sessão (tenantContext), nunca do corpo. O webhook é público e
 * só vale com o token secreto da clínica na URL. Nada responde sozinho: toda saída
 * parte de uma ação humana, para UM destinatário por vez.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getSecret, getSecretStatus } from "../lib/secure-settings";
import { logger } from "../lib/logger";
import { requireCollaborator } from "./collaborator";
import {
  ConfigInvalida, contatoAutorizado, contatosAutorizados, homologacaoAtiva, chamar, chaveApi, chaveWebhook, consultarConexao, contatoDoJid, destinoDeEnvio,
  enderecoSeguro, garantirTabelasEvolution, lerConfig, mascararContato, normalizarBaseUrl, normalizarEvento,
  obterQr, podeEnviarAgora, registrarWebhook, salvarConfig, statusDoProvedor, statusEvolutionPodeAvancar,
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

async function enviarUma(empresaId: number, destino: string, texto: string, contexto: string, usuarioId: number | null) {
  const cfg = await lerConfig(empresaId);
  if (!cfg) return { http: 409, corpo: { error: "Instância Evolution não configurada.", estado: "nao_configurado" } };
  if (!contatoAutorizado(destino)) {
    logger.warn({ event: "evolution_envio_bloqueado_homologacao", empresaId, contato: mascararContato(destino) }, "envio Evolution bloqueado: contato fora da lista autorizada");
    return { http: 403, corpo: { error: "Homologação: este número não está na lista de contatos autorizados.", estado: "contato_nao_autorizado" } };
  }
  const conn = await consultarConexao(empresaId);
  if (conn.estado !== "conectado") return { http: 409, corpo: { error: "WhatsApp não está conectado.", estado: conn.estado } };
  if (!podeEnviarAgora(empresaId)) return { http: 429, corpo: { error: "Limite de envios por minuto atingido." } };
  const r = await chamar(cfg, "POST", `/message/sendText/${encodeURIComponent(cfg.instanceName)}`, { number: destino, text: texto });
  const provId = typeof r.json?.key?.id === "string" ? r.json.key.id : null;
  const aceito = r.ok && provId !== null;
  const erro = aceito ? null : (r.status ? `HTTP_${r.status}` : r.falha ?? "sem_resposta");
  const ins = await pool.query(
    `INSERT INTO evolution_mensagens (empresa_id, instancia, direcao, contato, corpo, provider_id, status, erro, contexto, enviado_por)
     VALUES ($1,$2,'saida',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [empresaId, cfg.instanceName, destino, texto, provId, aceito ? "aceito" : "falha", erro, contexto, usuarioId]);
  // "aceito" = o servidor Evolution recebeu o pedido. Entrega só existe quando o webhook confirmar.
  return { http: aceito ? 200 : 502, corpo: { ok: aceito, id: ins.rows[0].id, status: aceito ? "aceito" : "falha", erro } };
}

const usuarioDe = (req: Request): number | null => {
  const id = (req as any).tenantContext?.userId ?? (req as any).tenantContext?.colaboradorId;
  return Number.isSafeInteger(id) ? id : null;
};

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
  // Texto já cadastrado (ex.: prévia do motor de lembretes) segue INTEIRO: acima do limite do WhatsApp recusa, nunca corta.
  const texto = String(req.body?.texto ?? "Teste de conexão do WhatsApp da clínica. Pode ignorar esta mensagem.").trim();
  if (!texto || texto.length > 4000) { res.status(400).json({ error: "Texto vazio ou acima de 4000 caracteres; nada foi cortado nem enviado." }); return; }
  const r = await enviarUma(e, destino, texto, "teste_isolado", usuarioDe(req));
  res.status(r.http).json(r.corpo);
});

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
      for (const d of itens) {
        const jid = String(d?.key?.remoteJid ?? "");
        const id = typeof d?.key?.id === "string" ? d.key.id : null;
        const c = contatoDoJid(jid);
        if (!c || c.grupo || d?.key?.fromMe || !id) continue;
        if (!contatoAutorizado(c.contato)) { logger.info({ empresaId, contato: mascararContato(c.contato) }, "[evolution] recebida ignorada: contato fora da homologação"); continue; }
        const texto = textoDaMensagem(d?.message);
        if (!texto) continue; // mídia e outros tipos: não registrados nesta versão
        await pool.query(
          `INSERT INTO evolution_mensagens (empresa_id, instancia, direcao, contato, corpo, provider_id, status, contexto)
           VALUES ($1,$2,'entrada',$3,$4,$5,'recebida','inbound') ON CONFLICT DO NOTHING`,
          [empresaId, cfg.instanceName, c.contato, texto, id]);
      }
    } else if (evento === "messages.update") {
      for (const d of itens) {
        const id = d?.keyId ?? d?.key?.id;
        const novo = statusDoProvedor(d?.status);
        if (typeof id !== "string" || !novo) continue;
        const atual = await pool.query(`SELECT status FROM evolution_mensagens WHERE empresa_id=$1 AND provider_id=$2 AND direcao='saida'`, [empresaId, id]);
        const st = atual.rows[0]?.status as string | undefined;
        if (st && statusEvolutionPodeAvancar(st, novo)) {
          await pool.query(`UPDATE evolution_mensagens SET status=$3, erro=$4, atualizado_em=NOW() WHERE empresa_id=$1 AND provider_id=$2`,
            [empresaId, id, novo, novo === "falha" ? "provedor_reportou_erro" : null]);
        }
      }
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), empresaId }, "[evolution] falha ao processar webhook");
  }
  res.status(200).json({ ok: true });
});

export { publico as evolutionWebhookRouter };
export default router;
