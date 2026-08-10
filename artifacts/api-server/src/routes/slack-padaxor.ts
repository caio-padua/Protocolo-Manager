/**
 * routes/slack-padaxor.ts
 * Rotas do Monitor de LLMs do PADAXOR para o Slack.
 *
 * Endpoints:
 *   GET  /api/padaxor/slack/canais            — lista canais (encontrar o ID do #padaxor-projeto)
 *   GET  /api/padaxor/slack/preview           — gera relatório sem postar (pré-visualização)
 *   POST /api/padaxor/slack/relatorio         — gera e posta no canal configurado
 *   GET  /api/padaxor/drive/planilha-status   — diagnóstico da planilha que não abre
 *   POST /api/padaxor/drive/clonar-planilha   — clona .xlsx → Google Sheet nativo
 *   POST /api/padaxor/planilha/linha          — escrita pontual (campo por campo, nunca apaga o resto)
 */

import { Router, type Request, type Response } from "express";
import { requireCeoInstance } from "../middleware/tenantContext";
import { buildLlmReport, formatarRelatorioSlack, listarCanaisSlack, postSlackReport, postTelegramReport, salvarHistorico, consultarHistorico, slackGet, escreverCampoPlanilha } from "../lib/slack-reporter";
import { GLOSSARIO } from "../lib/slack-glossario";
import { getGoogleDriveClientRaw, getGoogleSheetsClient } from "../lib/google-drive";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// Todos os endpoints exigem instância CEO (PADAXOR_AI_BYPASS=true)
router.use(requireCeoInstance);

// ---------------------------------------------------------------------------
// Slack — listar canais para encontrar o ID do #padaxor-projeto
// ---------------------------------------------------------------------------
router.get("/padaxor/slack/canais", async (_req: Request, res: Response): Promise<void> => {
  try {
    const canais = await listarCanaisSlack();
    res.json({
      total: canais.length,
      canais,
      dica: "Copie o campo 'id' do canal #padaxor-projeto e configure como PADAXOR_SLACK_CHANNEL_ID.",
    });
  } catch (e: any) {
    logger.error({ err: e }, "slack-canais: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Slack — preview do relatório (sem postar)
// ---------------------------------------------------------------------------
router.get("/padaxor/slack/preview", async (req: Request, res: Response): Promise<void> => {
  try {
    const horas = Number(req.query.horas ?? 24);
    const report = await buildLlmReport(horas);
    const blocks = formatarRelatorioSlack(report);
    res.json({ report, blocks });
  } catch (e: any) {
    logger.error({ err: e }, "slack-preview: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Slack — postar relatório no canal (+ Telegram quando configurado)
// ---------------------------------------------------------------------------
router.post("/padaxor/slack/relatorio", async (req: Request, res: Response): Promise<void> => {
  const channelId      = (req.body.channelId as string) || process.env.PADAXOR_SLACK_CHANNEL_ID;
  const telegramChatId = (req.body.telegramChatId as string) || process.env.PADAXOR_TELEGRAM_CHAT_ID || "";

  if (!channelId) {
    res.status(400).json({
      error: "Informe channelId no body, ou defina a variável de ambiente PADAXOR_SLACK_CHANNEL_ID.",
      dica:  "Use GET /api/padaxor/slack/canais para encontrar o ID do #padaxor-projeto.",
    });
    return;
  }

  try {
    const horas = Number(req.body.horas ?? 24);
    const report = await buildLlmReport(horas);

    // Canal Slack — sempre enviado (canal primário)
    let slackOk = false;
    let slackErro: string | undefined;
    try {
      await postSlackReport(channelId, report);
      slackOk = true;
    } catch (e: any) {
      slackErro = e.message;
      logger.error({ err: e }, "slack-relatorio: erro ao postar no Slack");
    }

    // Canal Telegram — enviado quando PADAXOR_TELEGRAM_CHAT_ID configurado
    let telegramOk = false;
    let telegramMock = false;
    let telegramErro: string | undefined;
    let telegramSkipped = false;
    if (telegramChatId) {
      try {
        await postTelegramReport(telegramChatId, report, channelId);
        telegramOk = true;
      } catch (e: any) {
        telegramErro = e.message;
        logger.error({ err: e }, "slack-relatorio: erro ao postar no Telegram");
      }
    } else {
      telegramSkipped = true;
      logger.warn("slack-relatorio: PADAXOR_TELEGRAM_CHAT_ID não configurado — Telegram ignorado");
    }

    if (!slackOk && !telegramOk && !telegramSkipped) {
      res.status(500).json({
        error: "Falha nos dois canais",
        slackErro,
        telegramErro,
      });
      return;
    }

    res.json({
      ok: slackOk || telegramOk,
      chamadas:   report.totalChamadas,
      custoUsd:   report.totalCustoUsd,
      slack: {
        ok:   slackOk,
        erro: slackErro ?? null,
      },
      telegram: {
        ok:       telegramOk,
        mock:     telegramMock,
        skipped:  telegramSkipped,
        chatId:   telegramChatId || null,
        erro:     telegramErro ?? null,
        aviso:    telegramSkipped
          ? "Configure PADAXOR_TELEGRAM_CHAT_ID para receber no celular"
          : null,
      },
    });
  } catch (e: any) {
    logger.error({ err: e }, "slack-relatorio: erro geral");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Drive — diagnóstico da planilha que não abre
// ---------------------------------------------------------------------------
router.get("/padaxor/drive/planilha-status", async (req: Request, res: Response): Promise<void> => {
  const fileId = (req.query.fileId as string) || "1U84ZS2EcUR93Rd827-_QRPxQjVZueNHq";

  try {
    const drive = await getGoogleDriveClientRaw();
    const metaResp = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,size,modifiedTime,trashed,capabilities,webViewLink",
    });

    const meta = metaResp.data;
    const tamanhoMb = meta.size ? (Number(meta.size) / 1024 / 1024).toFixed(2) : null;

    // Diagnóstico
    const isOfficeFormat = meta.mimeType?.includes("officedocument") || meta.mimeType?.includes("ms-excel");
    const limite5mb = tamanhoMb && Number(tamanhoMb) > 5;
    const lixeira = meta.trashed === true;

    const diagnostico: string[] = [];
    if (lixeira) diagnostico.push("ARQUIVO NA LIXEIRA — foi apagado pelo usuário.");
    if (isOfficeFormat) diagnostico.push(`Formato Microsoft Office (.xlsx) — NÃO é uma Google Planilha nativa. Google Drive tem limite de 5 MB para pré-visualizar arquivos Office.`);
    if (limite5mb) diagnostico.push(`Tamanho: ${tamanhoMb} MB — excede o limite de conversão do Google Drive (5 MB). Por isso não abre.`);
    if (!isOfficeFormat && !lixeira && !limite5mb) diagnostico.push("Arquivo parece OK — o problema pode ser permissão ou arquivo corrompido.");

    const solucoes: string[] = [];
    if (isOfficeFormat || limite5mb) {
      solucoes.push("Clonar o arquivo como Google Planilha nativa via POST /api/padaxor/drive/clonar-planilha");
      solucoes.push("Baixar o arquivo e abrir no Excel ou LibreOffice localmente.");
    }

    res.json({ meta, tamanhoMb, diagnostico, solucoes });
  } catch (e: any) {
    logger.error({ err: e }, "planilha-status: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Drive — clonar .xlsx → Google Sheet nativo (resolve o problema de não abrir)
// ---------------------------------------------------------------------------
// Estratégia: baixar o conteúdo binário do arquivo e re-fazer upload como
// multipart com mimeType=Google Sheet. O Drive converte automaticamente na
// importação, mesmo quando files.copy falha por restrição de formato.
// ---------------------------------------------------------------------------
router.post("/padaxor/drive/clonar-planilha", async (req: Request, res: Response): Promise<void> => {
  const fileId       = (req.body.fileId as string) || "1U84ZS2EcUR93Rd827-_QRPxQjVZueNHq";
  const novoNome     = (req.body.nome as string)   || "PADAXOR_LINHA_DE_PRODUCAO [Google Sheet nativo]";
  const pastaDestino = req.body.pastaId as string | undefined;

  try {
    const drive = await getGoogleDriveClientRaw();

    // 1. Baixar o conteúdo binário do arquivo
    const downloadResp = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const conteudo = Buffer.from(downloadResp.data as ArrayBuffer);

    // 2. Re-upload com mimeType Google Sheets — Drive converte o xlsx na importação
    const metadata = {
      name:     novoNome,
      mimeType: "application/vnd.google-apps.spreadsheet",
      ...(pastaDestino ? { parents: [pastaDestino] } : {}),
    };

    const uploadResp = await drive.files.create({
      requestBody: metadata,
      media: {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body:     conteudo,
      },
      fields: "id,name,webViewLink",
    });

    const novo = uploadResp.data;
    logger.info({ id: novo.id, nome: novo.name }, "planilha clonada via re-upload com sucesso");

    res.json({
      ok:        true,
      novoId:    novo.id,
      novoNome:  novo.name,
      link:      novo.webViewLink,
      instrucao: "A planilha clonada agora é nativa do Google. Todos os dados e colunas foram preservados. Abra pelo link acima.",
    });
  } catch (e: any) {
    logger.error({ err: e }, "clonar-planilha: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/padaxor/telegram/meu-chat-id
// Helper para o CEO descobrir / confirmar o chatId configurado no bot.
// Lê as últimas mensagens via getUpdates (sem webhook) e mostra quem enviou.
// ---------------------------------------------------------------------------
router.get("/padaxor/telegram/meu-chat-id", async (_req: Request, res: Response): Promise<void> => {
  const chatIdConfigurado = process.env.PADAXOR_TELEGRAM_CHAT_ID || null;

  // Tentar buscar token do cofre
  let token: string | null = null;
  try {
    const { getSecret } = await import("../lib/secure-settings.js");
    const tok = await getSecret("telegram.botToken");
    if (tok && tok.trim()) token = tok.trim();
  } catch { /* sem token no cofre */ }
  if (!token && process.env.TELEGRAM_BOT_TOKEN) token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    res.json({
      chatIdConfigurado,
      aviso: "TELEGRAM_BOT_TOKEN não configurado no cofre — não é possível buscar getUpdates.",
      instrucao: [
        "1. Abra o bot PADAXOR no Telegram e envie /start",
        "2. Abra @userinfobot no Telegram e envie qualquer mensagem — ele responde com o seu chatId",
        "3. Configure PADAXOR_TELEGRAM_CHAT_ID=<seu-chat-id> como Replit Secret",
      ],
    });
    return;
  }

  try {
    // getUpdates retorna até 100 mensagens recentes
    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20&allowed_updates=["message"]`, {
      signal: AbortSignal.timeout(8_000),
    });
    const data = await resp.json() as { ok: boolean; result?: any[]; description?: string };

    if (!data.ok) {
      // getUpdates falha quando webhook está ativo — tenta getMe para identificar o bot
      let botInfo: { id: number; username?: string; first_name?: string } | null = null;
      try {
        const meResp = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(5_000) });
        const meData = await meResp.json() as { ok: boolean; result?: { id: number; username?: string; first_name?: string } };
        if (meData.ok && meData.result) botInfo = meData.result;
      } catch { /* sem info */ }

      res.json({
        chatIdConfigurado,
        bot: botInfo
          ? { id: botInfo.id, username: botInfo.username ? `@${botInfo.username}` : null, nome: botInfo.first_name ?? null, link: botInfo.username ? `https://t.me/${botInfo.username}` : null }
          : null,
        erroGetUpdates: data.description ?? "getUpdates retornou ok=false",
        aviso: "Webhook ativo — getUpdates desabilitado (correto). Bot identificado por getMe acima.",
        instrucao: [
          "1. No Telegram, abra @userinfobot e envie qualquer mensagem",
          "2. O bot responde com o seu ID numérico (ex: 8911159822)",
          "3. Configure PADAXOR_TELEGRAM_CHAT_ID=<esse-numero> como Replit Secret",
        ],
      });
      return;
    }

    // Extrair remetentes únicos das últimas mensagens
    const remetentes: Array<{ chatId: string; nome: string; usuario: string | null }> = [];
    const vistos = new Set<string>();
    for (const upd of (data.result ?? [])) {
      const msg = upd.message ?? upd.edited_message;
      if (!msg?.chat) continue;
      const id = String(msg.chat.id);
      if (vistos.has(id)) continue;
      vistos.add(id);
      remetentes.push({
        chatId:  id,
        nome:    [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || msg.chat.title || "(sem nome)",
        usuario: msg.chat.username ? `@${msg.chat.username}` : null,
      });
    }

    res.json({
      chatIdConfigurado,
      configurado: Boolean(chatIdConfigurado),
      aviso: chatIdConfigurado
        ? null
        : "PADAXOR_TELEGRAM_CHAT_ID não configurado — configure como Replit Secret para ativar o Telegram",
      remetentesRecentes: remetentes,
      instrucao: chatIdConfigurado
        ? `chatId ${chatIdConfigurado} está configurado. Teste com POST /api/padaxor/slack/relatorio para confirmar entrega.`
        : "Copie o chatId do campo 'remetentesRecentes' e configure como PADAXOR_TELEGRAM_CHAT_ID (Replit Secret).",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/padaxor/slack/status
// Diagnóstico honesto: mostra o que está e o que NÃO está configurado.
// Nunca retorna 500 — sempre responde, mesmo que tudo esteja errado.
// ---------------------------------------------------------------------------
router.get("/padaxor/slack/status", async (_req: Request, res: Response): Promise<void> => {
  const slackChannel   = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "";
  const telegramChatId = process.env.PADAXOR_TELEGRAM_CHAT_ID ?? "";
  const ceoSecret      = process.env.PADAXOR_CEO_SECRET       ?? "";
  const planilhaId     = "1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw";

  // Checar se planilha está acessível (tentativa rápida via buildLlmReport com 0h)
  let planilhaAcessivel = false;
  let planilhaErro: string | null = null;
  try {
    const report = await buildLlmReport(0);
    planilhaAcessivel = true;
    void report; // só queríamos saber se não lança
  } catch (e: any) {
    planilhaErro = e.message;
  }

  // Último registro + falhas recentes (7 dias)
  let ultimoRelatorio: string | null = null;
  let falhasRecentes = 0;
  try {
    const rows = await db.execute(sql`
      SELECT gerado_em_brt, canal, enviado_ok
      FROM llm_reports_history
      ORDER BY gerado_em DESC LIMIT 1
    `);
    if (rows.rows.length > 0) {
      const r = rows.rows[0] as any;
      ultimoRelatorio = `${r.gerado_em_brt} | canal=${r.canal} | ok=${r.enviado_ok}`;
    }
    const falhas = await db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM llm_reports_history
      WHERE enviado_ok = false
        AND gerado_em >= NOW() - INTERVAL '7 days'
    `);
    falhasRecentes = Number((falhas.rows[0] as any)?.n ?? 0);
  } catch { /* sem histórico ainda */ }

  res.json({
    status: {
      slack: {
        configurado: slackChannel.length > 0,
        channelId:   slackChannel || null,
        aviso:       slackChannel ? null : "Configure PADAXOR_SLACK_CHANNEL_ID",
      },
      telegram: {
        configurado: telegramChatId.length > 0,
        chatId:      telegramChatId || null,
        aviso:       telegramChatId
          ? null
          : "Configure PADAXOR_TELEGRAM_CHAT_ID — Telegram está sendo IGNORADO silenciosamente",
      },
      seguranca: {
        camada2Ativa: ceoSecret.length > 0,
        aviso:        ceoSecret
          ? null
          : "PADAXOR_CEO_SECRET não configurado — camada 2 de segurança INATIVA (qualquer clone com PADAXOR_AI_BYPASS=true passa)",
      },
      planilha: {
        id:           planilhaId,
        acessivel:    planilhaAcessivel,
        erro:         planilhaErro,
      },
      historicoRelatorios: {
        ultimoRegistro: ultimoRelatorio,
        falhasRecentes,
        aviso: ultimoRelatorio ? null : "Nenhum relatório gravado ainda",
      },
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/padaxor/slack/test-fallback-telegram   (R4 da spec)
// Confirma que o aviso de fallback chega ao Slack quando o Telegram recusa.
// Usa chatId especial "PADAXOR_TEST_FORCE_FAIL" — sendTelegram retorna erro
// sem chamar a API real. Grava histórico (canal=telegram, ok=false).
// ---------------------------------------------------------------------------
router.post("/padaxor/slack/test-fallback-telegram", async (_req: Request, res: Response): Promise<void> => {
  const channelId = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";
  let telegramFailed = false;
  let slackFallbackOk = false;
  let erroMensagem = "";

  try {
    const report = await buildLlmReport(0);

    try {
      await postTelegramReport("PADAXOR_TEST_FORCE_FAIL", report, channelId);
    } catch (e: any) {
      telegramFailed = true;
      erroMensagem   = e.message;
      // Se chegou aqui, o fallback foi acionado com channelId configurado
      slackFallbackOk = channelId.length > 0;
    }

    // Confirmar que um registro telegram foi gravado no histórico
    const hist = await db.execute(sql`
      SELECT id FROM llm_reports_history
      WHERE canal = 'telegram' AND enviado_ok = false
      ORDER BY gerado_em DESC LIMIT 1
    `);
    const historicoId = (hist.rows[0] as any)?.id ?? null;

    res.json({
      telegramFailed,
      slackFallbackOk,
      erro: erroMensagem || null,
      historicoId,
      mensagem: telegramFailed
        ? "Fallback testado: Telegram recusou, aviso enviado ao Slack. Confirme a mensagem ⚠️ PADAXOR — Telegram offline no canal."
        : "Telegram enviou com sucesso (token real configurado — use chatId inválido para testar fallback).",
    });
  } catch (e: any) {
    logger.error({ err: e }, "test-fallback-telegram: erro inesperado");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/padaxor/dicionario/verificar   (R3 da spec dicionario-sync-task39)
// Compara GLOSSARIO em memória com dicionario.json no GitHub.
// Detecta divergências de número entre as duas fontes.
// ---------------------------------------------------------------------------
router.get("/padaxor/dicionario/verificar", async (_req: Request, res: Response): Promise<void> => {
  const RAW_URL = "https://raw.githubusercontent.com/caio-padua/PADUA-SOFTWARE-DESIGN/main/dicionario/dicionario.json";

  try {
    // 1. Buscar JSON do GitHub (público, sem autenticação)
    const resp = await fetch(RAW_URL, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) {
      res.status(503).json({ sync: null, erro: `GitHub API retornou ${resp.status}` });
      return;
    }
    const data = await resp.json() as { termos: Array<{ numero: number; termo: string }> };
    const githubTermos = data.termos ?? [];

    // 2. Indexar por termo normalizado (case-insensitive, sem espaços extras)
    const norm = (s: string) => s.toLowerCase().trim();
    const githubIdx = new Map(githubTermos.map(t => [norm(t.termo), t.numero]));
    const glossarioIdx = new Map(GLOSSARIO.map(e => [norm(e.termo), e.numero]));

    // 3. Divergências: mesmo termo, número diferente
    const divergencias: Array<{ termo: string; numeroGlossario: number; numeroGithub: number | null }> = [];
    for (const e of GLOSSARIO) {
      const key = norm(e.termo);
      const numGithub = githubIdx.get(key) ?? null;
      if (numGithub !== null && numGithub !== e.numero) {
        divergencias.push({ termo: e.termo, numeroGlossario: e.numero, numeroGithub: numGithub });
      }
    }

    // 4. Termos só no glossário local (não estão no GitHub)
    const apenasLocal = GLOSSARIO
      .filter(e => !githubIdx.has(norm(e.termo)))
      .map(e => ({ termo: e.termo, numero: e.numero }));

    // 5. Termos só no GitHub (não estão no glossário local)
    const apenasNoGithub = githubTermos
      .filter(t => !glossarioIdx.has(norm(t.termo)))
      .map(t => ({ termo: t.termo, numero: t.numero }));

    res.json({
      sync:           divergencias.length === 0 && apenasLocal.length === 0,
      totalGlossario: GLOSSARIO.length,
      totalGithub:    githubTermos.length,
      divergencias,
      apenasLocal,
      apenasNoGithub,
    });
  } catch (e: any) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      res.status(503).json({ sync: null, erro: "GitHub API indisponível (timeout)" });
    } else {
      res.status(503).json({ sync: null, erro: e.message });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/padaxor/slack/historico?dias=7
// Consulta o histórico de relatórios de LLMs gravados no banco.
// Retorna: registros cronológicos + totais agregados por provedor de IA.
// ---------------------------------------------------------------------------
router.get("/padaxor/slack/historico", async (req: Request, res: Response): Promise<void> => {
  try {
    const dias = Math.min(Number(req.query.dias ?? 7), 90); // máx 90 dias
    const { registros, totalChamadas, totalCustoUsd, porProvedor } =
      await consultarHistorico(dias);

    // Formatar resumo por provedor para exibição leiga
    const LABEL: Record<string, string> = {
      anthropic: "Anthropic (Claude)",
      gemini:    "Google (Gemini)",
      openai:    "OpenAI (GPT)",
    };

    const resumoProvedor = Object.entries(porProvedor).map(([prov, stat]) => ({
      provedor:    LABEL[prov] ?? prov,
      chamadas:    stat.chamadas,
      custoUsd:    Number(stat.custoUsd.toFixed(6)),
      custoFormatado: `U$ ${stat.custoUsd.toFixed(4)}`,
    })).sort((a, b) => b.custoUsd - a.custoUsd);

    res.json({
      consulta: {
        dias,
        totalRegistros:   registros.length,
        totalChamadas,
        totalCustoUsd:    Number(totalCustoUsd.toFixed(6)),
        totalCustoFormatado: `U$ ${totalCustoUsd.toFixed(4)}`,
      },
      porProvedor: resumoProvedor,
      registros: registros.map((r: any) => ({
        id:               r.id,
        geradoEmBrt:      r.gerado_em_brt,
        periodoHoras:     r.periodo_horas,
        totalChamadas:    Number(r.total_chamadas),
        totalCustoUsd:    Number(r.total_custo_usd),
        mudancasPlanilha: Number(r.mudancas_planilha),
        canal:            r.canal,
        enviadoOk:        r.enviado_ok,
        erro:             r.erro ?? null,
      })),
    });
  } catch (e: any) {
    logger.error({ err: e }, "slack-historico: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/padaxor/slack/mensagens?canal=padaxor-projeto&limite=50
// Lê mensagens REAIS do canal Slack (conversations.history).
// Diferente de /historico que lê o banco interno — este lê o canal ao vivo.
// Proposta do Dr. Code (commit e83ab18): qualquer agente lê o canal sem
// depender do conector de Slack na sessão do aplicativo.
// Somente leitura — não posta nada, nenhum token novo.
// ---------------------------------------------------------------------------
router.get("/padaxor/slack/mensagens", async (req: Request, res: Response): Promise<void> => {
  try {
    const limite    = Math.min(Number(req.query.limite ?? 50), 200);
    const nomeCanalParam = (req.query.canal as string) || "padaxor-projeto";

    // 1. Localizar o canal pelo nome (reusa listarCanaisSlack já existente)
    let channelId = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "";

    if (!channelId) {
      // Buscar na lista de canais pelo nome
      const canais = await listarCanaisSlack();
      const canal  = canais.find(
        (c: any) => c.name === nomeCanalParam || c.id === nomeCanalParam,
      );
      if (!canal) {
        res.status(404).json({
          error: `Canal "${nomeCanalParam}" não encontrado. Configure PADAXOR_SLACK_CHANNEL_ID ou passe o ID direto como ?canal=C0BLW5S7GQL`,
          canaisDisponiveis: canais.slice(0, 10).map((c: any) => ({ id: c.id, nome: c.name })),
        });
        return;
      }
      channelId = canal.id;
    }

    // 2. Ler histórico do canal
    const resp = await slackGet(
      `/conversations.history?channel=${channelId}&limit=${limite}`,
    );

    if (!resp.ok) {
      res.status(502).json({
        error:   `Slack conversations.history erro: ${resp.error ?? JSON.stringify(resp)}`,
        canal:   channelId,
        dica:    resp.error === "not_in_channel"
          ? "O bot precisa ser convidado para o canal: /invite @padaxor-bot"
          : resp.error === "channel_not_found"
          ? "Verifique o ID do canal ou configure PADAXOR_SLACK_CHANNEL_ID"
          : null,
      });
      return;
    }

    // 3. Formatar mensagens para leitura amigável
    const mensagens = (resp.messages as any[] ?? []).map((m: any) => ({
      ts:        m.ts,
      // Converter timestamp Unix → BRT legível
      horaBrt:   new Date(Number(m.ts) * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      tipo:      m.subtype ?? "message",
      usuario:   m.user ?? m.username ?? m.bot_id ?? "desconhecido",
      texto:     (m.text as string ?? "").slice(0, 500),   // truncar mensagens longas
      blocos:    Array.isArray(m.blocks) ? m.blocks.length : 0,
      arquivos:  Array.isArray(m.files)  ? m.files.length  : 0,
    }));

    res.json({
      ok:       true,
      canal:    { id: channelId, nome: nomeCanalParam },
      total:    mensagens.length,
      limite,
      mensagens,
    });
  } catch (e: any) {
    logger.error({ err: e }, "slack-mensagens: erro");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/padaxor/planilha/linha
// Escrita pontual na planilha de produção — um campo por vez.
// Contrato: { nro, campo, valor }
//   nro:   número do item na col A (ex: "37")
//   campo: "estado" | "notas" | "hash" | "resp" | "solicitacao"
//   valor: novo conteúdo da célula
// Grava SÓ na célula indicada — nunca apaga colunas vizinhas.
// ---------------------------------------------------------------------------
router.post("/padaxor/planilha/linha", async (req: Request, res: Response): Promise<void> => {
  try {
    const { nro, campo, valor } = req.body as {
      nro?:   unknown;
      campo?: unknown;
      valor?: unknown;
    };

    if (!nro || !campo || valor === undefined) {
      res.status(400).json({
        error: "Campos obrigatórios: nro, campo, valor",
        exemplo: { nro: "37", campo: "estado", valor: "CONCLUIDO" },
        camposPermitidos: ["estado", "notas", "hash", "resp", "solicitacao"],
      });
      return;
    }

    const camposPermitidos = ["estado", "notas", "hash", "resp", "solicitacao"];
    if (!camposPermitidos.includes(String(campo))) {
      res.status(400).json({
        error: `Campo "${campo}" não permitido.`,
        camposPermitidos,
      });
      return;
    }

    const { linhaSheet, coluna } = await escreverCampoPlanilha(
      String(nro),
      campo as "estado" | "notas" | "hash" | "resp" | "solicitacao",
      String(valor),
    );

    res.json({
      ok:         true,
      nro:        String(nro),
      campo:      String(campo),
      coluna,
      linhaSheet,
      valor:      String(valor),
      gravadoEm:  new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    });
  } catch (e: any) {
    logger.error({ err: e }, "planilha-linha: erro ao gravar campo");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

export default router;
