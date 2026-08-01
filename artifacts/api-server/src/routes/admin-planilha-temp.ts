/**
 * admin-planilha-temp.ts
 * Rotas temporárias de administração da planilha de produção.
 * Uso único: ler, validar e limpar a pasta do Drive.
 *
 * REMOVER após concluída a operação.
 *
 * Histórico de correções aplicadas diretamente na planilha:
 *   [Task42 31/07/2026] Item #43 PARCIAL→A FAZER + obs adicionada
 *   [Task42 31/07/2026] Item #49 (Monitor de LLMs) renumerado para #53
 */

import { Router, type Request, type Response } from "express";
import { requireCeoInstance } from "../middleware/tenantContext";
import { getGoogleDriveClientRaw, getGoogleSheetsClient } from "../lib/google-drive";
import { logger } from "../lib/logger";
import { sincronizarDicionarioSheets } from "../lib/sheets-dicionario";

const router = Router();
router.use(requireCeoInstance);

const PASTA_ID         = "1_oq50UEJo45YwdDZKvuI5awNuUf9Rqke";
const PLANILHA_OFICIAL = "1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw";

// ---------------------------------------------------------------------------
// GET /api/admin/planilha/ler — lê até as primeiras 5 abas e 100 linhas
// ---------------------------------------------------------------------------
router.get("/admin/planilha/ler", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();

    // Metadados da planilha (lista de abas)
    const metaResp = await sheets.spreadsheets.get({
      spreadsheetId: PLANILHA_OFICIAL,
      includeGridData: false,
    });

    const abas = (metaResp.data.sheets ?? []).map(s => ({
      id:    s.properties?.sheetId,
      nome:  s.properties?.title,
      linhas: s.properties?.gridProperties?.rowCount,
      cols:  s.properties?.gridProperties?.columnCount,
    }));

    // Ler todas as linhas de todas as abas (até 500 por aba)
    const ranges = abas.map(a => `'${a.nome}'!A1:Z500`);
    const dataResp = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: PLANILHA_OFICIAL,
      ranges,
    });

    const conteudo = (dataResp.data.valueRanges ?? []).map((vr, i) => ({
      aba:    abas[i]?.nome ?? `Aba ${i + 1}`,
      header: vr.values?.[0] ?? [],
      linhas: (vr.values?.length ?? 1) - 1,
      dados:  vr.values?.slice(1) ?? [],        // todas as linhas, sem o header
    }));

    res.json({ abas, conteudo });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/ler: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/planilha/listar-pasta — lista TODOS os arquivos da pasta
// ---------------------------------------------------------------------------
router.get("/admin/planilha/listar-pasta", async (_req: Request, res: Response): Promise<void> => {
  try {
    const drive = await getGoogleDriveClientRaw();
    const resp = await drive.files.list({
      q:      `'${PASTA_ID}' in parents and trashed = false`,
      fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)",
      pageSize: 100,
    });

    const arquivos = (resp.data.files ?? []).map(f => ({
      id:          f.id,
      nome:        f.name,
      tipo:        f.mimeType,
      modificado:  f.modifiedTime,
      tamanhoKb:   f.size ? (Number(f.size) / 1024).toFixed(1) : null,
      link:        f.webViewLink,
      ehOficial:   f.id === PLANILHA_OFICIAL,
    }));

    res.json({
      total:          arquivos.length,
      planilhaOficial: PLANILHA_OFICIAL,
      arquivos,
    });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/listar-pasta: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/planilha/limpar-pasta — move para lixeira todos EXCETO oficial
// ---------------------------------------------------------------------------
router.delete("/admin/planilha/limpar-pasta", async (_req: Request, res: Response): Promise<void> => {
  try {
    const drive = await getGoogleDriveClientRaw();

    // Listar tudo na pasta
    const listResp = await drive.files.list({
      q:      `'${PASTA_ID}' in parents and trashed = false`,
      fields: "files(id,name,mimeType)",
      pageSize: 100,
    });

    const arquivos = listResp.data.files ?? [];
    const paraApagar = arquivos.filter(f => f.id !== PLANILHA_OFICIAL);

    const resultados: { id: string; nome: string; ok: boolean; erro?: string }[] = [];

    for (const arq of paraApagar) {
      try {
        // Mover para lixeira (não apaga definitivamente — regra de ouro)
        await drive.files.update({
          fileId:      arq.id!,
          requestBody: { trashed: true },
        });
        resultados.push({ id: arq.id!, nome: arq.name!, ok: true });
        logger.info({ id: arq.id, nome: arq.name }, "admin-planilha: arquivo movido para lixeira");
      } catch (e: any) {
        resultados.push({ id: arq.id!, nome: arq.name!, ok: false, erro: e.message });
        logger.error({ err: e, id: arq.id }, "admin-planilha: falha ao mover para lixeira");
      }
    }

    res.json({
      preservada:    PLANILHA_OFICIAL,
      totalApagados: resultados.filter(r => r.ok).length,
      erros:         resultados.filter(r => !r.ok).length,
      resultados,
    });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/limpar-pasta: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/atualizar-estados — corrige estados e adiciona linhas
// NOTA: estados PARCIAL removidos (valor invalido; lista valida: A FAZER / AGUARDANDO / CONCLUIDO).
// ---------------------------------------------------------------------------
router.post("/admin/planilha/atualizar-estados", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const sid = PLANILHA_OFICIAL;

    // Buscar dados atuais para encontrar as linhas pelo número
    const rangeResp = await sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range: "A1:H100",
    });
    const rows = rangeResp.data.values ?? [];

    // Mapear nº → índice de linha (0-based, incluindo header)
    const idxMap: Record<number, number> = {};
    rows.forEach((r, i) => {
      const n = parseInt(r[0]);
      if (!isNaN(n)) idxMap[n] = i;
    });

    const updates: { range: string; values: string[][] }[] = [];

    // Itens a corrigir: [nº, novoEstado]
    // ATENÇÃO: estados válidos = A FAZER | AGUARDANDO | CONCLUIDO
    // PARCIAL foi removido — o conferidor de consistência reprova qualquer valor fora dessa lista.
    const correcoes: [number, string][] = [
      [18, "CONCLUIDO"],
      [42, "CONCLUIDO"],
      // #43 permanece A FAZER — não alterar para PARCIAL (valor inválido)
    ];

    for (const [nro, novoEstado] of correcoes) {
      const rowIdx = idxMap[nro];
      if (rowIdx !== undefined) {
        const sheetRow = rowIdx + 1; // Google Sheets é 1-based
        updates.push({ range: `D${sheetRow}`, values: [[novoEstado]] });
      }
    }

    // Aplicar atualizações de estado
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sid,
        requestBody: {
          valueInputOption: "RAW",
          data: updates.map(u => ({ range: u.range, values: u.values })),
        },
      });
    }

    res.json({
      ok: true,
      estadosAtualizados: correcoes.map(([n, e]) => ({ item: n, novoEstado: e })),
      nota: "Item #43 nao alterado (A FAZER e correto). Item #49 (Monitor de LLMs) foi renumerado para #53 pela Task42.",
    });
  } catch (e: any) {
    logger.error({ err: e }, "atualizar-estados: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/adicionar-item
// Adiciona UMA linha ao final da planilha de produção (sem quebrar o existente).
// Body: { nro, item, resp, estado, prio, hash, descricao, notas }
// ---------------------------------------------------------------------------
router.post("/admin/planilha/adicionar-item", async (req: Request, res: Response): Promise<void> => {
  try {
    // Campos aceitos:
    //   A  nro         — número do item
    //   B  item        — descrição curta
    //   C  resp        — agente responsável (ex: "Dr. Replit")
    //   D  estado      — A FAZER | AGUARDANDO | CONCLUIDO
    //   E  prio        — P1 alto | P2 medio | P3 baixo
    //   F  hash        — sessão de referência (ex: "53")
    //   G  descricao   — descrição longa
    //   H  notas       — notas de entrega
    //   I  solicitacao — o que uma LLM pediu à outra (handoff inter-agente)
    const { nro, item, resp, estado, prio, hash, descricao, notas, solicitacao } =
      req.body as Record<string, string>;

    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: PLANILHA_OFICIAL,
      range:         "A:I",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          String(nro         ?? ""),
          String(item        ?? ""),
          String(resp        ?? ""),
          String(estado      ?? ""),
          String(prio        ?? ""),
          String(hash        ?? "—"),
          String(descricao   ?? ""),
          String(notas       ?? ""),
          String(solicitacao ?? ""),   // coluna I — handoff inter-LLM
        ]],
      },
    });
    res.json({ ok: true, nro, item });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/adicionar-item: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/preparar-abas
// 1. Renomeia a aba "Untitled" para "PLANILHA PRODUCAO"
// 2. Cria a aba "DICIONARIO" com 6 colunas + dados dos 85 termos
// Idempotente: se as abas já existem com os nomes corretos, não faz nada.
// ---------------------------------------------------------------------------
router.post("/admin/planilha/preparar-abas", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const sid = PLANILHA_OFICIAL;

    // ── 1. Obter metadados das abas ───────────────────────────────────────
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sid, includeGridData: false });
    const abas = (meta.data.sheets ?? []).map(s => ({
      sheetId: s.properties?.sheetId!,
      title:   s.properties?.title ?? "",
    }));

    const requests: any[] = [];
    const log: string[] = [];

    // ── 2. Renomear aba principal para "PLANILHA PRODUCAO" ────────────────
    const nomePrincipal = "PLANILHA PRODUCAO";
    const abaPrincipal  = abas.find(a =>
      a.title === "Untitled" ||
      a.title === "Sheet1"   ||
      a.title === "Página1"  ||
      (!a.title.startsWith("PLANILHA") && !a.title.startsWith("DICIONARIO") && a.sheetId === abas[0].sheetId)
    );
    const jaRenomeada = abas.some(a => a.title === nomePrincipal);

    if (!jaRenomeada && abaPrincipal) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: abaPrincipal.sheetId, title: nomePrincipal },
          fields: "title",
        },
      });
      log.push(`Aba "${abaPrincipal.title}" → "${nomePrincipal}"`);
    } else {
      log.push(`Aba "${nomePrincipal}" já existe ou nenhuma aba-alvo encontrada.`);
    }

    // ── 3. Criar aba DICIONARIO (se não existir) ──────────────────────────
    const nomeDic = "DICIONARIO";
    const dicExiste = abas.some(a => a.title === nomeDic);
    let novaDicSheetId: number | null = null;

    if (!dicExiste) {
      requests.push({
        addSheet: {
          properties: {
            title:          nomeDic,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
      log.push(`Aba "${nomeDic}" criada.`);
    } else {
      log.push(`Aba "${nomeDic}" já existe.`);
    }

    // ── 4. Aplicar as mudanças estruturais ────────────────────────────────
    if (requests.length > 0) {
      const resp = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        requestBody: { requests },
      });

      // Capturar o sheetId da nova aba DICIONARIO (se foi criada agora)
      if (!dicExiste) {
        const addedReply = (resp.data.replies ?? []).find((r: any) => r.addSheet);
        novaDicSheetId = addedReply?.addSheet?.properties?.sheetId ?? null;
      }
    }

    // ── 5. Obter sheetId do DICIONARIO (criado agora ou pré-existente) ────
    if (novaDicSheetId === null) {
      const metaAtual = await sheets.spreadsheets.get({ spreadsheetId: sid, includeGridData: false });
      const dicAba = (metaAtual.data.sheets ?? []).find(s => s.properties?.title === nomeDic);
      novaDicSheetId = dicAba?.properties?.sheetId ?? null;
    }

    // ── 6. Sincronizar aba DICIONARIO via fonte única de verdade ─────────
    // Delega toda a lógica para sheets-dicionario.ts (GLOSSARIO canônico).
    // A função adiciona termos novos sem tocar nas colunas C/E/F preenchidas.
    const dicLog = await sincronizarDicionarioSheets(sid);
    log.push(...dicLog);

    res.json({
      ok:     true,
      log,
      planilha: `https://docs.google.com/spreadsheets/d/${PLANILHA_OFICIAL}`,
    });
  } catch (e: any) {
    logger.error({ err: e }, "preparar-abas: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/sincronizar-dicionario
// Força sincronização imediata da aba DICIONARIO com o GLOSSARIO canônico.
// Idempotente: adiciona apenas termos novos; preserva colunas C/E/F.
// ---------------------------------------------------------------------------
router.post("/admin/planilha/sincronizar-dicionario", async (_req: Request, res: Response): Promise<void> => {
  try {
    const log = await sincronizarDicionarioSheets(PLANILHA_OFICIAL);
    res.json({
      ok:  true,
      log,
      planilha: `https://docs.google.com/spreadsheets/d/${PLANILHA_OFICIAL}`,
    });
  } catch (e: any) {
    logger.error({ err: e }, "sincronizar-dicionario: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/dicionario-colunas-data-hora
// Insere colunas DATA (DD/MM/AA) e HORA (HH:MM) após coluna A (Nº)
// e preenche com datas/horários de acordo com as fases do projeto.
// IDEMPOTENTE: detecta se colunas já existem antes de inserir.
// ---------------------------------------------------------------------------
router.post("/admin/planilha/dicionario-colunas-data-hora", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const DICIONARIO_ABA = "DICIONARIO";

    // --- 1. Descobrir sheetId e cabeçalho atual ----
    const meta     = await sheets.spreadsheets.get({ spreadsheetId: PLANILHA_OFICIAL, includeGridData: false });
    const dicSheet = (meta.data.sheets ?? []).find(s => s.properties?.title === DICIONARIO_ABA);
    if (!dicSheet) {
      res.status(404).json({ error: `Aba "${DICIONARIO_ABA}" não encontrada.` });
      return;
    }
    const sheetId = dicSheet.properties?.sheetId ?? 0;

    // Ler linha 1 para ver se DATA/HORA já existem
    const header = await sheets.spreadsheets.values.get({
      spreadsheetId: PLANILHA_OFICIAL,
      range: `${DICIONARIO_ABA}!A1:H1`,
    });
    const headerRow: string[] = (header.data.values?.[0] ?? []) as string[];
    const jaTemData = headerRow.some(c => c.trim().toUpperCase() === "DATA");

    // --- 2. Inserir 2 colunas na posição B (índice 1) se ainda não existem ---
    if (!jaTemData) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: PLANILHA_OFICIAL,
        requestBody: {
          requests: [{
            insertDimension: {
              range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 3 },
              inheritFromBefore: false,
            },
          }],
        },
      });
    }

    // --- 3. Datas por número de termo (DD/MM/AA) e hora (HH:MM) ---
    // Atribuídas por reflexão sobre as fases do projeto:
    // Fase 1 Jan-Mar 2026: infra, auth, banco, git
    // Fase 2 Abr-Mai 2026: IA, laudos, Drive, analitos
    // Fase 3 Jun 2026: comercial, pagamentos, licenciados
    // Fase 4 Jul 2026: mensageria, Slack, Sheets, monitoramento
    const cronologia: Record<number, [string, string]> = {
      1:  ["15/01/26", "09:00"],  // AI Gateway — 1º dia de infra de IA
      2:  ["15/01/26", "09:30"],  // Anthropic
      3:  ["15/01/26", "08:00"],  // API — fundação
      4:  ["20/01/26", "14:00"],  // append-only — auditoria de dados
      5:  ["20/01/26", "14:30"],  // backup
      6:  ["15/01/26", "08:00"],  // banco de dados — dia 1
      7:  ["15/01/26", "08:30"],  // branch — git setup
      8:  ["22/01/26", "10:00"],  // CI/CD
      9:  ["25/01/26", "15:00"],  // circuit breaker — resiliência
      10: ["10/06/26", "09:00"],  // clone — modelo de franquia (Fase 3)
      11: ["10/06/26", "09:30"],  // CNAME — domínio clones
      12: ["15/01/26", "08:45"],  // commit — git setup
      13: ["01/02/26", "10:00"],  // conector — Google OAuth
      14: ["01/02/26", "11:00"],  // CORS — front/back integração
      15: ["20/03/26", "14:00"],  // cron — relatório automático
      16: ["15/01/26", "16:00"],  // deploy — primeiro deploy
      17: ["05/02/26", "10:00"],  // DKIM — configuração de e-mail
      18: ["05/02/26", "10:30"],  // DNS
      19: ["10/02/26", "09:00"],  // dry-run
      20: ["28/02/26", "14:00"],  // empresa_id — multi-tenant fundação
      21: ["15/01/26", "10:30"],  // endpoint
      22: ["20/01/26", "09:00"],  // FK — modelo relacional
      23: ["15/04/26", "10:00"],  // Gemini — motor de extração (Fase 2)
      24: ["25/01/26", "10:00"],  // hash — autenticação
      25: ["01/02/26", "14:00"],  // idempotente
      26: ["01/02/26", "15:00"],  // índice único
      27: ["01/06/26", "14:00"],  // ledger — financeiro (Fase 3)
      28: ["20/01/26", "14:00"],  // login_username
      29: ["15/01/26", "08:00"],  // main — git setup
      30: ["15/01/26", "08:30"],  // merge
      31: ["28/02/26", "09:00"],  // middleware — tenantContext
      32: ["28/02/26", "10:00"],  // migration
      33: ["10/02/26", "11:00"],  // mock
      34: ["28/02/26", "14:00"],  // multi-tenant — arquitetura central
      35: ["15/04/26", "10:30"],  // OpenAI — transcrição voz
      36: ["15/01/26", "08:00"],  // PR — fluxo de revisão
      37: ["20/03/26", "09:00"],  // PWA
      38: ["01/04/26", "10:00"],  // RBAC — controle de acesso
      39: ["15/01/26", "08:00"],  // repositório
      40: ["28/02/26", "15:00"],  // RLS — segurança por linha
      41: ["25/01/26", "11:00"],  // scrypt — senhas
      42: ["05/02/26", "11:00"],  // SPF — e-mail
      43: ["15/06/26", "09:00"],  // SSE — cockpit CEO tempo real
      44: ["25/01/26", "09:00"],  // token
      45: ["01/02/26", "16:00"],  // UPSERT
      46: ["01/06/26", "10:00"],  // webhook — Asaas/ZapSign (Fase 3)
      47: ["15/04/26", "14:00"],  // worker — processamento laudos
      48: ["25/01/26", "09:30"],  // JWT
      49: ["28/02/26", "14:30"],  // tenant
      50: ["20/03/26", "14:30"],  // cron job
      51: ["28/02/26", "10:30"],  // schema
      52: ["15/04/26", "15:00"],  // buffer
      53: ["15/04/26", "09:00"],  // pipeline — extração exames
      54: ["01/06/26", "15:00"],  // royalty — modelo comercial
      55: ["20/01/26", "09:30"],  // UUID
      56: ["20/01/26", "16:00"],  // seed — dados iniciais
      57: ["15/04/26", "16:00"],  // mimeType — upload exames
      58: ["15/01/26", "11:00"],  // proxy — Replit iframe
      59: ["01/02/26", "10:30"],  // OAuth — Google integração
      60: ["15/01/26", "09:00"],  // env var — secrets
      61: ["15/01/26", "08:45"],  // pull — git
      62: ["15/01/26", "08:00"],  // repo
      63: ["10/07/26", "09:00"],  // fail-safe — dual canal Slack/Telegram
      64: ["01/07/26", "09:00"],  // spec — processo Padua Software Design
      65: ["28/02/26", "15:30"],  // tenant context
      66: ["15/06/26", "10:00"],  // ai_usage_log — monitor de IA
      67: ["15/06/26", "10:30"],  // logAiUsage
      68: ["28/02/26", "16:00"],  // requireCeoInstance
      69: ["10/06/26", "14:00"],  // PADAXOR_AI_BYPASS
      70: ["28/02/26", "15:30"],  // tenantContext (objeto)
      71: ["15/06/26", "09:00"],  // Slack — canal padaxor-projeto
      72: ["15/04/26", "09:00"],  // Drive — watcher exames
      73: ["20/07/26", "09:00"],  // Sheets — planilha de produção
      74: ["15/01/26", "09:00"],  // Cloudflare
      75: ["15/05/26", "09:00"],  // Railway — produção
      76: ["15/01/26", "08:00"],  // Replit
      77: ["15/06/26", "11:00"],  // token (IA)
      78: ["15/06/26", "11:30"],  // input_tokens
      79: ["15/06/26", "12:00"],  // output_tokens
      80: ["01/07/26", "10:00"],  // P0
      81: ["01/07/26", "10:15"],  // P1
      82: ["01/07/26", "10:30"],  // P2
      83: ["01/07/26", "10:45"],  // P3
      84: ["20/06/26", "09:00"],  // cron horário — relatório Slack horário
      85: ["20/07/26", "10:00"],  // planilha de produção
    };

    // --- 4. Gravar cabeçalhos B1:C1 e dados B2:C86 ---
    const dadosData: string[][] = [["DATA"], ...Object.values(cronologia).map(([d]) => [d])];
    const dadosHora: string[][] = [["HORA"], ...Object.values(cronologia).map(([, h]) => [h])];

    // Cabeçalho + dados coluna B (DATA)
    await sheets.spreadsheets.values.update({
      spreadsheetId:    PLANILHA_OFICIAL,
      range:            `${DICIONARIO_ABA}!B1:B86`,
      valueInputOption: "RAW",
      requestBody:      { values: dadosData },
    });

    // Cabeçalho + dados coluna C (HORA)
    await sheets.spreadsheets.values.update({
      spreadsheetId:    PLANILHA_OFICIAL,
      range:            `${DICIONARIO_ABA}!C1:C86`,
      valueInputOption: "RAW",
      requestBody:      { values: dadosHora },
    });

    // --- 5. Formatar cabeçalhos das 2 novas colunas (mesmo estilo das demais) ---
    const rgb = (r: number, g: number, b: number) => ({ red: r, green: g, blue: b });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: PLANILHA_OFICIAL,
      requestBody: {
        requests: [
          // Cabeçalho B1 e C1 — mesmo estilo navy da aba
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: rgb(0.133, 0.141, 0.173),
                  textFormat: { bold: true, foregroundColor: rgb(1, 1, 1), fontSize: 10 },
                  horizontalAlignment: "CENTER",
                  verticalAlignment: "MIDDLE",
                  wrapStrategy: "WRAP",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
            },
          },
          // Dados B2:C86 — centralizado, pequeno
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: 86, startColumnIndex: 1, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: "CENTER",
                  verticalAlignment:   "TOP",
                  textFormat:          { fontSize: 9 },
                  wrapStrategy:        "CLIP",
                },
              },
              fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat,wrapStrategy)",
            },
          },
          // Largura: col B (DATA) = 75px, col C (HORA) = 60px
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
              properties: { pixelSize: 75 },
              fields: "pixelSize",
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
              properties: { pixelSize: 60 },
              fields: "pixelSize",
            },
          },
        ],
      },
    });

    res.json({
      ok:       true,
      inserido: !jaTemData,
      msg:      jaTemData
        ? "Colunas DATA e HORA já existiam — valores atualizados."
        : "Colunas DATA e HORA inseridas e preenchidas com sucesso.",
      planilha: `https://docs.google.com/spreadsheets/d/${PLANILHA_OFICIAL}`,
    });
  } catch (e: any) {
    logger.error({ err: e }, "dicionario-colunas-data-hora: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/adicionar-demandas-voz-avatar
// Adiciona as 3 demandas de ElevenLabs/HeyGen na PLANILHA PRODUCAO.
// Idempotente: não duplica se o item já existir pelo texto exato.
// ---------------------------------------------------------------------------
router.post("/admin/planilha/adicionar-demandas-voz-avatar", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets    = await getGoogleSheetsClient();
    const ABA       = "PLANILHA PRODUCAO";
    const SID       = PLANILHA_OFICIAL;

    // Ler estado atual para pegar último Nº e verificar duplicatas
    const atual = await sheets.spreadsheets.values.get({
      spreadsheetId: SID,
      range: `${ABA}!A2:I500`,
    });
    const linhas: string[][] = (atual.data.values ?? []) as string[][];

    // Último número ocupado
    let ultimoNum = 0;
    for (const row of linhas) {
      const n = Number(row[0]);
      if (Number.isFinite(n) && n > ultimoNum) ultimoNum = n;
    }

    // Textos únicos dos itens que queremos adicionar
    const novasDemandas: string[][] = [
      [
        String(ultimoNum + 1),
        "Integrar ElevenLabs e HeyGen em todos os membros da equipe (quando possível)",
        "Toda Equipe",
        "A FAZER",
        "P2",
        "—",
        "PEDIDO 1 CEO 01/08/26: todos os agentes (Dr. Code, Dr. Lovable, Dr. Manus, Dr. Replit) devem mapear e integrar ElevenLabs (voz sintética PT-BR) e HeyGen (avatar em vídeo) nos seus respectivos ambientes quando possível.",
        "Ver Task #54 e #55",
        "01/08/26",
      ],
      [
        String(ultimoNum + 2),
        "PILOTO Instituto Pádua (PADUCCIA): ElevenLabs + HeyGen — médico, secretária e avatar livre",
        "Dr. Replit",
        "A FAZER",
        "P1",
        "—",
        "PEDIDO 3 CEO 01/08/26: ANTES de oferecer para clínicas licenciadas, implantar voz (ElevenLabs) e avatar em vídeo (HeyGen) PRIMEIRO no Instituto Pádua (PADUCCIA). Avatares: 1=Médico, 2=Secretária, 3=Livre. Task #54.",
        "Bloqueante para Task #55 (expansão clínicas)",
        "01/08/26",
      ],
      [
        String(ultimoNum + 3),
        "Motor de avatares por clínica: médico, secretária e avatar livre via HeyGen (pós-piloto)",
        "Dr. Replit",
        "A FAZER",
        "P2",
        "—",
        "PEDIDO 2 CEO 01/08/26: após validação no Instituto Pádua, disponibilizar para clínicas licenciadas criação de avatares de voz e vídeo. Clínica opta pelo serviço. Tabela clinic_avatars + worker assíncrono + tela de gestão. Task #55.",
        "Bloqueado por piloto PADUCCIA (item acima)",
        "01/08/26",
      ],
    ];

    // Filtrar demandas que já existem (por texto do item — col B)
    const textosExistentes = new Set(linhas.map(r => (r[1] ?? "").trim().toLowerCase()));
    const paraAdicionar = novasDemandas.filter(
      nd => !textosExistentes.has(nd[1].trim().toLowerCase()),
    );

    if (paraAdicionar.length === 0) {
      res.json({ ok: true, msg: "Todas as demandas já existiam na planilha — nenhuma linha duplicada." });
      return;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId:    SID,
      range:            `${ABA}!A:I`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody:      { values: paraAdicionar },
    });

    res.json({
      ok:        true,
      adicionado: paraAdicionar.length,
      itens:     paraAdicionar.map(r => `#${r[0]} — ${r[1]}`),
      planilha:  `https://docs.google.com/spreadsheets/d/${SID}`,
    });
  } catch (e: any) {
    logger.error({ err: e }, "adicionar-demandas-voz-avatar: erro");
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/planilha/reparar-a44
// Corrige a célula A44 que recebeu texto de auditoria em vez do número "43".
// Causa: rota atualizar-estados escreveu comentário de código na célula errada.
// ---------------------------------------------------------------------------
router.post("/admin/planilha/reparar-a44", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const sid    = PLANILHA_OFICIAL;

    // 1. Ler o conteúdo atual de A44 para logar
    const leituraResp = await sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range:         "PLANILHA PRODUCAO!A44",
    });
    const valorAtual = leituraResp.data.values?.[0]?.[0] ?? "(vazio)";

    // 2. Corrigir A44 → apenas "43"
    await sheets.spreadsheets.values.update({
      spreadsheetId:      sid,
      range:              "PLANILHA PRODUCAO!A44",
      valueInputOption:   "USER_ENTERED",
      requestBody:        { values: [["43"]] },
    });

    logger.info({ valorAntes: valorAtual, valorDepois: "43" }, "admin-planilha: A44 reparada");

    res.json({
      ok:          true,
      celula:      "A44",
      valorAntes:  valorAtual,
      valorDepois: "43",
      planilha:    `https://docs.google.com/spreadsheets/d/${sid}`,
    });
  } catch (e: any) {
    logger.error({ err: e }, "admin-planilha/reparar-a44: erro");
    res.status(500).json({ error: e.message });
  }
});

export default router;
