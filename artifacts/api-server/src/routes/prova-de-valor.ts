/**
 * Prova de Valor — Dashboard de KPIs auditáveis para licenciamento
 *
 * GET  /api/prova-de-valor?de=<ISO>&ate=<ISO>
 * POST /api/prova-de-valor/exportar-pdf   body: { de, ate, minutosReceita, minutosLembrete }
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const router: IRouter = Router();

// ─── GET /api/prova-de-valor ────────────────────────────────────────────────

router.get("/prova-de-valor", async (req: Request, res: Response): Promise<void> => {
  try {
    const de = req.query.de ? new Date(req.query.de as string) : new Date(Date.now() - 30 * 24 * 3600_000);
    const ate = req.query.ate ? new Date(req.query.ate as string) : new Date();

    if (isNaN(de.getTime()) || isNaN(ate.getTime())) {
      res.status(400).json({ error: "Parâmetros de data inválidos. Use formato ISO 8601 (ex.: 2026-07-01T00:00:00Z)." });
      return;
    }

    const [
      receitasResult,
      documentosResult,
      taxaResult,
      iaResult,
      lembretesResult,
      laudosResult,
    ] = await Promise.all([
      // Receitas emitidas
      db.execute(sql`
        SELECT COUNT(*) AS n FROM prescriptions
        WHERE created_at >= ${de.toISOString()} AND created_at <= ${ate.toISOString()}
      `),
      // Documentos entregues (status sent)
      db.execute(sql`
        SELECT COUNT(*) AS n FROM dispatch_log
        WHERE status = 'sent'
          AND created_at >= ${de.toISOString()} AND created_at <= ${ate.toISOString()}
      `),
      // Taxa de confirmação
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmados,
          COUNT(*) AS total
        FROM dispatch_log
        WHERE created_at >= ${de.toISOString()} AND created_at <= ${ate.toISOString()}
      `),
      // Dúvidas respondidas pela IA
      db.execute(sql`
        SELECT COUNT(*) AS n FROM agente_messages
        WHERE role = 'assistant'
          AND created_at >= ${de.toISOString()} AND created_at <= ${ate.toISOString()}
      `),
      // Lembretes de dose entregues
      db.execute(sql`
        SELECT COUNT(*) AS n FROM mensageria_lembrete
        WHERE status = 'enviado'
          AND enviado_em >= ${de.toISOString()} AND enviado_em <= ${ate.toISOString()}
      `),
      // Laudos processados pelo Drive Watcher
      db.execute(sql`
        SELECT COUNT(*) AS n FROM drive_watcher_files
        WHERE status = 'ok'
          AND processed_at >= ${de.toISOString()} AND processed_at <= ${ate.toISOString()}
      `),
    ]);

    const receitas = Number((receitasResult.rows[0] as Record<string, unknown>)?.n ?? 0);
    const documentos = Number((documentosResult.rows[0] as Record<string, unknown>)?.n ?? 0);
    const taxaRow = taxaResult.rows[0] as Record<string, unknown> | undefined;
    const confirmados = Number(taxaRow?.confirmados ?? 0);
    const totalDispatch = Number(taxaRow?.total ?? 0);
    const taxaConfirmacao = totalDispatch > 0 ? Math.round((confirmados / totalDispatch) * 100) : 0;
    const ia = Number((iaResult.rows[0] as Record<string, unknown>)?.n ?? 0);
    const lembretes = Number((lembretesResult.rows[0] as Record<string, unknown>)?.n ?? 0);
    const laudos = Number((laudosResult.rows[0] as Record<string, unknown>)?.n ?? 0);

    res.json({
      de: de.toISOString(),
      ate: ate.toISOString(),
      kpis: {
        receitasEmitidas: receitas,
        documentosEntregues: documentos,
        taxaConfirmacaoPercent: taxaConfirmacao,
        duvidasRespondidas: ia,
        lembretesEntregues: lembretes,
        laudosProcessados: laudos,
      },
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "prova-de-valor: erro ao buscar KPIs");
    res.status(500).json({ error: "Erro ao carregar dados do painel." });
  }
});

// ─── POST /api/prova-de-valor/exportar-pdf ──────────────────────────────────

router.post("/prova-de-valor/exportar-pdf", async (req: Request, res: Response): Promise<void> => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Tempo limite atingido. Reduza o período e tente novamente." });
    }
  }, 28_000);

  try {
    const { de: deRaw, ate: ateRaw, minutosReceita = 8, minutosLembrete = 3 } = req.body as {
      de?: string;
      ate?: string;
      minutosReceita?: number;
      minutosLembrete?: number;
    };

    const de = deRaw ? new Date(deRaw) : new Date(Date.now() - 30 * 24 * 3600_000);
    const ate = ateRaw ? new Date(ateRaw) : new Date();

    if (isNaN(de.getTime()) || isNaN(ate.getTime())) {
      clearTimeout(timeout);
      res.status(400).json({ error: "Datas inválidas." });
      return;
    }

    // Re-usa a mesma query do GET para manter consistência
    const [recR, docR, taxaR, iaR, lemR, laudR] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) AS n FROM prescriptions WHERE created_at >= ${de.toISOString()} AND created_at <= ${ate.toISOString()}`),
      db.execute(sql`SELECT COUNT(*) AS n FROM dispatch_log WHERE status = 'sent' AND created_at >= ${de.toISOString()} AND created_at <= ${ate.toISOString()}`),
      db.execute(sql`SELECT COUNT(*) FILTER (WHERE status='confirmed') AS confirmados, COUNT(*) AS total FROM dispatch_log WHERE created_at >= ${de.toISOString()} AND created_at <= ${ate.toISOString()}`),
      db.execute(sql`SELECT COUNT(*) AS n FROM agente_messages WHERE role='assistant' AND created_at >= ${de.toISOString()} AND created_at <= ${ate.toISOString()}`),
      db.execute(sql`SELECT COUNT(*) AS n FROM mensageria_lembrete WHERE status='enviado' AND enviado_em >= ${de.toISOString()} AND enviado_em <= ${ate.toISOString()}`),
      db.execute(sql`SELECT COUNT(*) AS n FROM drive_watcher_files WHERE status='ok' AND processed_at >= ${de.toISOString()} AND processed_at <= ${ate.toISOString()}`),
    ]);

    const receitas = Number((recR.rows[0] as Record<string, unknown>)?.n ?? 0);
    const documentos = Number((docR.rows[0] as Record<string, unknown>)?.n ?? 0);
    const taxaRow2 = taxaR.rows[0] as Record<string, unknown> | undefined;
    const totalDispatch2 = Number(taxaRow2?.total ?? 0);
    const confirmados2 = Number(taxaRow2?.confirmados ?? 0);
    const taxaPct = totalDispatch2 > 0 ? Math.round((confirmados2 / totalDispatch2) * 100) : 0;
    const ia = Number((iaR.rows[0] as Record<string, unknown>)?.n ?? 0);
    const lembretes = Number((lemR.rows[0] as Record<string, unknown>)?.n ?? 0);
    const laudos = Number((laudR.rows[0] as Record<string, unknown>)?.n ?? 0);

    const totalMinutos = receitas * Number(minutosReceita) + lembretes * Number(minutosLembrete);
    const totalHoras = (totalMinutos / 60).toFixed(1);

    // Gera PDF com pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const navyR = 0.094, navyG = 0.114, navyB = 0.196;
    const goldR = 0.749, goldG = 0.584, goldB = 0.212;

    // Faixa de topo
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(navyR, navyG, navyB) });
    page.drawText("PADAXOR", {
      x: 40, y: height - 52, size: 28, font: fontBold, color: rgb(goldR, goldG, goldB),
    });
    page.drawText("Clinical Intelligence System", {
      x: 40, y: height - 70, size: 10, font: fontReg, color: rgb(0.8, 0.8, 0.8),
    });

    // Título
    page.drawText("PAINEL DE PROVA DE VALOR", {
      x: 40, y: height - 110, size: 18, font: fontBold, color: rgb(navyR, navyG, navyB),
    });

    const periodoStr = `Período: ${de.toLocaleDateString("pt-BR")} a ${ate.toLocaleDateString("pt-BR")}`;
    page.drawText(periodoStr, {
      x: 40, y: height - 132, size: 10, font: fontReg, color: rgb(0.4, 0.4, 0.4),
    });

    // KPIs
    const kpis = [
      ["RECEITAS EMITIDAS", String(receitas)],
      ["DOCUMENTOS ENTREGUES", String(documentos)],
      ["TAXA DE CONFIRMAÇÃO", `${taxaPct}%`],
      ["DÚVIDAS RESPONDIDAS PELA IA", String(ia)],
      ["LEMBRETES DE DOSE ENTREGUES", String(lembretes)],
      ["LAUDOS PROCESSADOS", String(laudos)],
    ];

    let y = height - 170;
    for (const [label, value] of kpis) {
      page.drawRectangle({ x: 40, y: y - 30, width: width - 80, height: 40, color: rgb(0.96, 0.97, 0.99) });
      page.drawText(label, { x: 55, y: y - 10, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.4) });
      page.drawText(value, { x: width - 120, y: y - 10, size: 18, font: fontBold, color: rgb(navyR, navyG, navyB) });
      y -= 52;
    }

    // Secretaria economizada
    y -= 10;
    page.drawRectangle({ x: 40, y: y - 50, width: width - 80, height: 60, color: rgb(0.99, 0.97, 0.92) });
    page.drawText("TEMPO DE SECRETARIA ECONOMIZADO", { x: 55, y: y - 12, size: 9, font: fontBold, color: rgb(0.5, 0.35, 0.1) });
    page.drawText(`${totalHoras} horas`, { x: 55, y: y - 32, size: 20, font: fontBold, color: rgb(navyR, navyG, navyB) });
    page.drawText(`(${receitas} receitas × ${minutosReceita}min + ${lembretes} lembretes × ${minutosLembrete}min)`, {
      x: 55, y: y - 46, size: 8, font: fontReg, color: rgb(0.5, 0.5, 0.5),
    });

    // Rodapé
    page.drawRectangle({ x: 0, y: 0, width, height: 40, color: rgb(navyR, navyG, navyB) });
    page.drawText(`PADAXOR — Instituto Pádua — Painel de Prova de Valor — Gerado em ${new Date().toLocaleDateString("pt-BR")}`, {
      x: 40, y: 14, size: 8, font: fontReg, color: rgb(0.7, 0.7, 0.7),
    });

    clearTimeout(timeout);
    const bytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="prova-de-valor-${de.toISOString().slice(0,10)}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (err) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "prova-de-valor: erro ao gerar PDF");
      res.status(500).json({ error: "Erro ao gerar PDF." });
    }
  }
});

// ─── GET /api/prova-de-valor/por-empresa ─────────────────────────────────────
//
// Retorna, por empresa, os mesmos 6 KPIs + tempo economizado.
// Só lista empresas ativas e não-platformOwner.
//
router.get("/prova-de-valor/por-empresa", async (req: Request, res: Response): Promise<void> => {
  try {
    const de = req.query.de ? new Date(req.query.de as string) : new Date(Date.now() - 30 * 24 * 3600_000);
    const ate = req.query.ate ? new Date(req.query.ate as string) : new Date();

    if (isNaN(de.getTime()) || isNaN(ate.getTime())) {
      res.status(400).json({ error: "Parâmetros de data inválidos." });
      return;
    }

    // Busca todas as empresas ativas (exceto a plataforma dona)
    const empresasResult = await db.execute(sql`
      SELECT id, nome, nick, tipo_licenciamento, tipo_relacionamento
      FROM empresas
      WHERE ativa = true AND (is_platform_owner IS NULL OR is_platform_owner = false)
      ORDER BY CASE WHEN id = 5 THEN 0 ELSE 1 END, nome ASC
    `);

    const empresas = empresasResult.rows as Array<{
      id: number;
      nome: string;
      nick: string | null;
      tipo_licenciamento: string | null;
      tipo_relacionamento: string | null;
    }>;

    const deISO  = de.toISOString();
    const ateISO = ate.toISOString();

    const por_empresa = await Promise.all(
      empresas.map(async (emp) => {
        const eid = emp.id;
        const [recR, docR, taxaR, iaR, lemR, laudR] = await Promise.all([
          // Receitas emitidas pela clínica
          db.execute(sql`
            SELECT COUNT(*) AS n FROM prescriptions
            WHERE empresa_id = ${eid}
              AND created_at >= ${deISO} AND created_at <= ${ateISO}
          `),
          // Documentos entregues (dispatch_log)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM dispatch_log
            WHERE empresa_id = ${eid} AND status = 'sent'
              AND created_at >= ${deISO} AND created_at <= ${ateISO}
          `),
          // Taxa de confirmação
          db.execute(sql`
            SELECT
              COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmados,
              COUNT(*) AS total
            FROM dispatch_log
            WHERE empresa_id = ${eid}
              AND created_at >= ${deISO} AND created_at <= ${ateISO}
          `),
          // Dúvidas respondidas pela IA
          db.execute(sql`
            SELECT COUNT(*) AS n FROM agente_messages
            WHERE empresa_id = ${eid} AND role = 'assistant'
              AND created_at >= ${deISO} AND created_at <= ${ateISO}
          `),
          // Lembretes de dose entregues (mensageria_lembrete)
          db.execute(sql`
            SELECT COUNT(*) AS n FROM mensageria_lembrete
            WHERE empresa_id = ${eid} AND status = 'enviado'
              AND enviado_em >= ${deISO} AND enviado_em <= ${ateISO}
          `),
          // Laudos processados (drive_watcher_files → join clients → empresa_id)
          db.execute(sql`
            SELECT COUNT(*) AS n
            FROM drive_watcher_files dwf
            JOIN clients c ON c.id = dwf.client_id
            WHERE c.empresa_id = ${eid} AND dwf.status = 'ok'
              AND dwf.processed_at >= ${deISO} AND dwf.processed_at <= ${ateISO}
          `),
        ]);

        const receitas   = Number((recR.rows[0]  as Record<string, unknown>)?.n ?? 0);
        const documentos = Number((docR.rows[0]  as Record<string, unknown>)?.n ?? 0);
        const taxaRow    = taxaR.rows[0] as Record<string, unknown> | undefined;
        const confirmados   = Number(taxaRow?.confirmados ?? 0);
        const totalDispatch = Number(taxaRow?.total ?? 0);
        const taxaConfirmacao = totalDispatch > 0 ? Math.round((confirmados / totalDispatch) * 100) : 0;
        const ia       = Number((iaR.rows[0]  as Record<string, unknown>)?.n ?? 0);
        const lembretes = Number((lemR.rows[0] as Record<string, unknown>)?.n ?? 0);
        const laudos   = Number((laudR.rows[0] as Record<string, unknown>)?.n ?? 0);
        const total    = receitas + documentos + lembretes + laudos + ia;

        const tipoLic = emp.tipo_licenciamento ?? emp.tipo_relacionamento ?? "licenciada_direta";

        return {
          empresaId: eid,
          nome: emp.nick?.trim() || emp.nome,
          nomeCompleto: emp.nome,
          tipoLicenciamento: tipoLic,
          isPropria: tipoLic === "propria",
          isLicenciada: tipoLic === "licenciada_direta",
          isSublicenciada: tipoLic === "licenciada_por_clinica" || tipoLic === "sub_unidade",
          kpis: {
            receitasEmitidas:       receitas,
            documentosEntregues:    documentos,
            taxaConfirmacaoPercent: taxaConfirmacao,
            duvidasRespondidas:     ia,
            lembretesEntregues:     lembretes,
            laudosProcessados:      laudos,
          },
          totalEventos: total,
        };
      }),
    );

    // Totais consolidados para a visão geral
    const totais = por_empresa.reduce(
      (acc, e) => {
        acc.receitasEmitidas       += e.kpis.receitasEmitidas;
        acc.documentosEntregues    += e.kpis.documentosEntregues;
        acc.duvidasRespondidas     += e.kpis.duvidasRespondidas;
        acc.lembretesEntregues     += e.kpis.lembretesEntregues;
        acc.laudosProcessados      += e.kpis.laudosProcessados;
        return acc;
      },
      { receitasEmitidas: 0, documentosEntregues: 0, duvidasRespondidas: 0, lembretesEntregues: 0, laudosProcessados: 0 },
    );

    res.json({
      de: de.toISOString(),
      ate: ate.toISOString(),
      totais,
      por_empresa,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "prova-de-valor/por-empresa: erro");
    res.status(500).json({ error: "Erro ao carregar dados por empresa." });
  }
});

export default router;
