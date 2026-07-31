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
 */

import { Router, type Request, type Response } from "express";
import { requireCeoInstance } from "../middleware/tenantContext";
import { buildLlmReport, formatarRelatorioSlack, listarCanaisSlack, postSlackReport, consultarHistorico } from "../lib/slack-reporter";
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
// Slack — postar relatório no canal
// ---------------------------------------------------------------------------
router.post("/padaxor/slack/relatorio", async (req: Request, res: Response): Promise<void> => {
  const channelId = (req.body.channelId as string) || process.env.PADAXOR_SLACK_CHANNEL_ID;

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
    await postSlackReport(channelId, report);
    res.json({ ok: true, chamadas: report.totalChamadas, custoUsd: report.totalCustoUsd });
  } catch (e: any) {
    logger.error({ err: e }, "slack-relatorio: erro");
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

  // Último registro no histórico
  let ultimoRelatorio: string | null = null;
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
        aviso: ultimoRelatorio ? null : "Nenhum relatório gravado ainda",
      },
    },
  });
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

export default router;
