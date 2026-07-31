/**
 * admin-planilha-temp.ts
 * Rotas temporárias de administração da planilha de produção.
 * Uso único: ler, validar e limpar a pasta do Drive.
 *
 * REMOVER após concluída a operação.
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
    const correcoes: [number, string][] = [
      [18, "CONCLUIDO"],
      [42, "CONCLUIDO"],
      [43, "PARCIAL"],
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

    // Adicionar linhas novas ao final
    const totalLinhas = rows.length; // inclui header
    const novasLinhas = [
      [
        "49", "Monitor de LLMs no Slack (#padaxor-projeto)",
        "Dr. Replit", "CONCLUIDO", "P1 alto", "42",
        "O sistema agora posta automaticamente no canal do Slack toda manha o que cada IA fez, quanto custou e se ha divergencias — em linguagem tecnica e em linguagem simples.",
        "feito",
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sid,
      range: `A${totalLinhas + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: novasLinhas },
    });

    res.json({
      ok: true,
      estadosAtualizados: correcoes.map(([n, e]) => ({ item: n, novoEstado: e })),
      linhasAdicionadas: novasLinhas.length,
    });
  } catch (e: any) {
    logger.error({ err: e }, "atualizar-estados: erro");
    res.status(500).json({ error: e.message });
  }
});

export default router;
