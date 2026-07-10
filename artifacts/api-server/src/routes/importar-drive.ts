import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import { requireCollaborator } from "./collaborator";
import { getImportState, startImport } from "../lib/drive-import/worker";

// ============================================================================
// Importacao em massa do Drive (spec importacao-massa-drive-exames).
// TODAS as rotas exigem colaborador logado: dispara IA (custo) e expoe PII
// clinica. Modo "scan" (dry-run, sem IA) e "run" (extracao real).
// ============================================================================

const router: IRouter = Router();

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function scope(v: unknown): "active" | "all" {
  return v === "all" ? "all" : "active";
}

// POST /api/importar-drive/scan — varredura barata (casa pastas, conta PDFs,
// lista homonimos e sem-cliente) SEM baixar nem chamar IA.
router.post("/importar-drive/scan", requireCollaborator, (req, res): void => {
  const r = startImport({
    mode: "scan",
    scope: scope(req.body?.scope),
    maxFolders: num(req.body?.maxFolders),
  });
  res.status(r.ok ? 202 : 409).json(r);
});

// POST /api/importar-drive/run — importacao real: baixa, classifica e extrai.
router.post("/importar-drive/run", requireCollaborator, (req, res): void => {
  const r = startImport({
    mode: "full",
    scope: scope(req.body?.scope),
    maxFolders: num(req.body?.maxFolders),
    maxFiles: num(req.body?.maxFiles ?? req.body?.maxPdfs),
  });
  res.status(r.ok ? 202 : 409).json(r);
});

// GET /api/importar-drive/status — estado atual do run (para o console 3D).
router.get("/importar-drive/status", requireCollaborator, (_req, res): void => {
  res.json(getImportState());
});

// GET /api/importar-drive/relatorio.xlsx — planilha de conferencia do run.
router.get("/importar-drive/relatorio.xlsx", requireCollaborator, async (_req, res): Promise<void> => {
  const s = getImportState();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Padcon Conect — Paxter";
  wb.created = new Date();

  const PASTEL = "FFDDEFF0"; // tom pastel (cabecalho) — Art. 39
  function header(ws: ExcelJS.Worksheet, cols: Array<{ h: string; w: number }>): void {
    ws.columns = cols.map((c) => ({ header: c.h, width: c.w }));
    const row = ws.getRow(1);
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PASTEL } };
      cell.border = { bottom: { style: "thin" } };
    });
  }

  const resumo = wb.addWorksheet("Resumo");
  header(resumo, [
    { h: "Indicador", w: 40 },
    { h: "Valor", w: 20 },
  ]);
  const t = s.totals;
  const linhas: Array<[string, string | number]> = [
    ["Status", s.status],
    ["Modo", s.mode ?? "-"],
    ["Escopo", s.scope],
    ["Inicio", s.startedAt ?? "-"],
    ["Fim", s.finishedAt ?? "-"],
    ["Pastas varridas", `${t.foldersScanned} / ${t.foldersTotal}`],
    ["Arquivos encontrados (PDF + imagem)", t.filesFound],
    ["Exames importados", t.ingested],
    ["  dos quais laboratoriais", t.labDocs],
    ["  dos quais de imagem", t.imageDocs],
    ["Ja existentes (duplicados)", t.duplicates],
    ["Nao-exame (ignorados pelo porteiro)", t.nonExam],
    ["Erros de extracao", t.errors],
    ["Homonimos unidos (mesma pessoa)", t.homonimUnited],
    ["Sem cliente correspondente", t.noMatch],
    ["Ignorados (inativos)", t.skippedInactive],
  ];
  for (const [k, v] of linhas) resumo.addRow([k, v]);

  const hom = wb.addWorksheet("Homonimos unidos");
  header(hom, [
    { h: "Pasta no Drive", w: 40 },
    { h: "Cliente escolhido (nome + CPF)", w: 50 },
    { h: "Candidatos com o mesmo nome", w: 80 },
  ]);
  for (const a of s.homonims) {
    hom.addRow([a.folderName, a.chosenClientName, a.candidateNames.join("  |  ")]);
  }

  const sem = wb.addWorksheet("Sem cliente");
  header(sem, [
    { h: "Pasta no Drive", w: 40 },
    { h: "Arquivos", w: 10 },
  ]);
  for (const n of s.noMatches) sem.addRow([n.folderName, n.fileCount]);

  const err = wb.addWorksheet("Erros");
  header(err, [
    { h: "Pasta", w: 40 },
    { h: "Arquivo", w: 50 },
    { h: "Mensagem", w: 70 },
  ]);
  for (const e of s.errors) err.addRow([e.folderName, e.fileName, e.message]);

  const cli = wb.addWorksheet("Por cliente");
  header(cli, [
    { h: "Cliente", w: 40 },
    { h: "Pasta", w: 40 },
    { h: "Casou por", w: 16 },
    { h: "Lab", w: 8 },
    { h: "Imagem", w: 10 },
    { h: "Duplicados", w: 12 },
    { h: "Nao-exame", w: 12 },
    { h: "Erros", w: 8 },
  ]);
  for (const c of s.clientResults) {
    cli.addRow([
      c.clientName,
      c.folderName,
      c.matchedHow,
      c.labDocs,
      c.imageDocs,
      c.duplicates,
      c.nonExam,
      c.errors,
    ]);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="importacao-drive-${stamp}.xlsx"`,
  );
  await wb.xlsx.write(res);
  res.end();
});

export default router;
