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

export default router;
