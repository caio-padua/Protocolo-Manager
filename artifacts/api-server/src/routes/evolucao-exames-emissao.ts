/**
 * TEX — Descritivo de Evolução de Exames (emissão interna da equipe).
 * Fatia 2 da SPEC 7: a clínica vem SEMPRE da sessão; o cliente precisa pertencer a ela (404 caso contrário).
 * Emissão administrativa é gratuita. Resultado não conferido gera PRÉVIA marcada (nunca definitiva).
 * Nada de dado clínico vai para log. O envio ao paciente (portal) depende das fatias 3 e 4 e NÃO existe aqui.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { requireCollaborator } from "./collaborator";
import { requireClientInSession } from "../lib/exam-tenant";
import { montarEvolucao } from "./exames-lab";
import { gerarEvolucaoExamesPdf, type ModoEvolucaoExames } from "../lib/evolucao-exames-pdf";
import { carregarIdentidadeClinica2b, IdentidadeEmpresa2bError } from "../lib/documentos/paxmed-2b-identidade-clinica";
import { brtISODate } from "../lib/brt";
import { NOME_COMERCIAL_EVOLUCAO } from "../lib/evolucao-exames-nome";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function modoDe(v: unknown): ModoEvolucaoExames | null {
  return v === "ultimas5" || v === "completo" ? v : null;
}

router.get("/evolucao-exames/cliente/:clientId/pdf", requireCollaborator, async (req: Request, res: Response) => {
  try {
    const modo = modoDe(req.query["modo"] ?? "ultimas5");
    if (!modo) { res.status(400).json({ error: "modo deve ser ultimas5 ou completo." }); return; }
    const escopo = await requireClientInSession(req, res, Number(req.params["clientId"]));
    if (!escopo) return;

    let identidade;
    try { identidade = await carregarIdentidadeClinica2b(escopo.empresaId); }
    catch (e) {
      if (e instanceof IdentidadeEmpresa2bError) { res.status(e.status).json({ error: e.message }); return; }
      throw e;
    }

    const [cli] = await db.select({ birth: clientsTable.birthDate }).from(clientsTable).where(eq(clientsTable.id, escopo.id)).limit(1);
    const evolucao = await montarEvolucao(escopo.id, { respeitarToggleProfissional: true });
    if (evolucao.columns.length === 0) { res.status(404).json({ error: "Sem resultados de exames para este cliente." }); return; }

    const nasc = cli?.birth && /^\d{4}-\d{2}-\d{2}/.test(cli.birth) ? cli.birth.slice(0, 10).split("-").reverse().join("/") : null;
    const r = await gerarEvolucaoExamesPdf({
      evolucao, modo, emissao: brtISODate(), identidade,
      paciente: { nome: escopo.name, documentoMinimo: nasc ? `Nasc. ${nasc}` : null },
      rotuloAmbiente: null,
    });
    if (r.contemNaoConferidos && req.query["previa"] !== "1") {
      res.status(409).json({ error: "Há resultados sem conferência final. Emita como prévia interna (previa=1) ou conclua a conferência.", codigo: "EVOLUCAO_EXAMES_NAO_CONFERIDO" });
      return;
    }
    req.log?.info({ evento: "evolucao_exames_emitido", clientId: escopo.id, empresaId: escopo.empresaId, modo, colunas: r.colunasUsadas, paginas: r.paginas, previa: r.contemNaoConferidos }, "Evolução de exames emitida (interno)");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${NOME_COMERCIAL_EVOLUCAO}-${escopo.id}-${brtISODate()}.pdf"`);
    res.send(Buffer.from(r.pdf));
  } catch (err) {
    req.log?.error({ err: String(err) }, "Evolução de exames: falha ao emitir");
    if (!res.headersSent) res.status(500).json({ error: "Não foi possível gerar o descritivo de evolução de exames." });
  }
});

export default router;
