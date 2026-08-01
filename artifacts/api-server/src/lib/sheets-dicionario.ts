/**
 * sheets-dicionario.ts
 * Sincronização unidirecional  GLOSSARIO → aba DICIONARIO do Google Sheets.
 *
 * FONTE DA VERDADE: array GLOSSARIO em slack-glossario.ts
 *   — número permanente, nunca reordena, nunca remove.
 *
 * REGRA DE ESCRITA:
 *   • Aba inexistente  → cria, grava cabeçalho + todos os termos + formatação.
 *   • Aba já existente → detecta quais números (Col A) ainda não estão lá e
 *     ANEXA somente os termos novos; para os existentes, preenche apenas as
 *     células C/D/E/F que estiverem VAZIAS (não sobrescreve o que o CEO editou).
 */

import { getGoogleSheetsClient } from "./google-drive";
import { GLOSSARIO }             from "./slack-glossario";
import { logger }                from "./logger";

export const DICIONARIO_NOME_ABA = "DICIONARIO";

const HEADER_ROW = [
  "Nº",
  "Termo",
  "Explicação",
  "Analogia para Leigo",
  "Onde usar no Projeto",
  "Função usualmente Requisitada",
];
const COLUNAS_PX = [60, 160, 220, 300, 220, 220];
const COL_LETRA  = ["", "A", "B", "C", "D", "E", "F"]; // índice 1-based

// ─── Formatação visual da aba ────────────────────────────────────────────────
async function formatarAba(
  sheets:      Awaited<ReturnType<typeof getGoogleSheetsClient>>,
  sid:         string,
  sheetId:     number,
  totalLinhas: number,
) {
  const rgb = (r: number, g: number, b: number) => ({ red: r, green: g, blue: b });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: rgb(0.133, 0.141, 0.173),
                textFormat: { bold: true, foregroundColor: rgb(1, 1, 1), fontSize: 10 },
                horizontalAlignment: "CENTER",
                verticalAlignment: "MIDDLE",
                wrapStrategy: "WRAP",
              },
            },
            fields:
              "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: totalLinhas + 1 },
            cell: {
              userEnteredFormat: {
                wrapStrategy: "WRAP",
                verticalAlignment: "TOP",
                textFormat: { fontSize: 9 },
              },
            },
            fields: "userEnteredFormat(wrapStrategy,verticalAlignment,textFormat)",
          },
        },
        ...COLUNAS_PX.map((px, i) => ({
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
            properties: { pixelSize: px },
            fields: "pixelSize",
          },
        })),
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
      ],
    },
  });
}

// ─── Função principal exportada ──────────────────────────────────────────────
/**
 * Sincroniza a aba DICIONARIO com o GLOSSARIO canônico.
 * Idempotente — pode ser chamada quantas vezes quiser.
 * Retorna array de mensagens de log.
 */
export async function sincronizarDicionarioSheets(sid: string): Promise<string[]> {
  const log: string[] = [];

  try {
    const sheets = await getGoogleSheetsClient();

    // 1. Verificar se a aba existe
    const meta      = await sheets.spreadsheets.get({ spreadsheetId: sid, includeGridData: false });
    const todasAbas = meta.data.sheets ?? [];
    const dicAba    = todasAbas.find(s => s.properties?.title === DICIONARIO_NOME_ABA);

    let sheetId: number;

    if (!dicAba) {
      // ── CASO A: aba não existe — criar do zero com todos os campos ──────
      const resp = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: DICIONARIO_NOME_ABA,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          }],
        },
      });
      sheetId = resp.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
      log.push(`Aba "${DICIONARIO_NOME_ABA}" criada.`);

      const linhas = [
        HEADER_ROW,
        ...GLOSSARIO.map(e => [
          String(e.numero),
          e.termo,
          e.explicacao  ?? "",
          e.leigo,
          e.ondeUsar    ?? "",
          e.funcaoUsual ?? "",
        ]),
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId: sid,
        range:            `${DICIONARIO_NOME_ABA}!A1`,
        valueInputOption: "RAW",
        requestBody:      { values: linhas },
      });
      log.push(`${GLOSSARIO.length} termos gravados.`);

      await formatarAba(sheets, sid, sheetId, GLOSSARIO.length);
      log.push("Formatação aplicada.");

    } else {
      // ── CASO B: aba existe — enriquecer células vazias + anexar novos ───
      sheetId = dicAba.properties?.sheetId ?? 0;

      // Ler todas as linhas de dados (A:F, sem cabeçalho)
      const dataResp = await sheets.spreadsheets.values.get({
        spreadsheetId: sid,
        range: `${DICIONARIO_NOME_ABA}!A2:F500`,
      });
      const linhasExistentes: string[][] = (dataResp.data.values ?? []) as string[][];

      // Mapear Nº → índice de linha (0-based a partir da linha de dados)
      const mapaNumero = new Map<number, number>(); // numero → índice em linhasExistentes
      linhasExistentes.forEach((row, idx) => {
        const n = Number(row[0]);
        if (Number.isFinite(n) && n > 0) mapaNumero.set(n, idx);
      });

      // Coletar células a enriquecer (apenas vazias)
      // Mapeamento de coluna: A=1,B=2,C=3,D=4,E=5,F=6  (1-based)
      // Linha real na planilha = idx + 2 (linha 1 = cabeçalho, linha 2 = 1º dado)
      const aEnriquecer: Array<{ range: string; values: string[][] }> = [];

      for (const entry of GLOSSARIO) {
        const idx = mapaNumero.get(entry.numero);
        if (idx === undefined) continue; // novo — será appendado abaixo
        const row      = linhasExistentes[idx] ?? [];
        const linhaNum = idx + 2;

        const checks: Array<[number, string | undefined]> = [
          [2, entry.termo],        // col B — Termo
          [3, entry.explicacao],   // col C — Explicação
          [4, entry.leigo],        // col D — Analogia
          [5, entry.ondeUsar],     // col E — Onde usar
          [6, entry.funcaoUsual],  // col F — Função usual
        ];
        for (const [colIdx, valor] of checks) {
          if (valor && !row[colIdx - 1]) { // colIdx é 1-based, row é 0-based
            aEnriquecer.push({
              range:  `${DICIONARIO_NOME_ABA}!${COL_LETRA[colIdx]}${linhaNum}`,
              values: [[valor]],
            });
          }
        }
      }

      if (aEnriquecer.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: sid,
          requestBody:   { valueInputOption: "RAW", data: aEnriquecer },
        });
        log.push(`${aEnriquecer.length} célula(s) preenchida(s) em termos já existentes.`);
      }

      // Anexar termos que ainda não existem na aba
      const novos = GLOSSARIO.filter(e => !mapaNumero.has(e.numero));
      if (novos.length > 0) {
        const novasLinhas = novos.map(e => [
          String(e.numero),
          e.termo,
          e.explicacao  ?? "",
          e.leigo,
          e.ondeUsar    ?? "",
          e.funcaoUsual ?? "",
        ]);
        await sheets.spreadsheets.values.append({
          spreadsheetId:  sid,
          range:          `${DICIONARIO_NOME_ABA}!A:F`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody:    { values: novasLinhas },
        });
        const totalAtual = mapaNumero.size + novos.length;
        await formatarAba(sheets, sid, sheetId, totalAtual);
        log.push(
          `${novos.length} termo(s) novo(s) adicionado(s): ` +
          novos.map(e => `#${e.numero} ${e.termo}`).join(", ") + ".",
        );
      }

      if (aEnriquecer.length === 0 && novos.length === 0) {
        log.push(`"${DICIONARIO_NOME_ABA}" já está completamente em dia — nenhuma alteração.`);
      }
    }

  } catch (err: any) {
    const msg = `sincronizarDicionarioSheets: erro — ${err.message}`;
    logger.error({ err }, msg);
    log.push(`ERRO: ${msg}`);
  }

  return log;
}
