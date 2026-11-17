/**
 * Exames do cliente na Área do Cliente (/area).
 * A identidade vem SOMENTE do token do portal (Authorization: Bearer). Nenhum clientId
 * é aceito na URL, no corpo ou na consulta: o que vier é ignorado. A clínica é a do cadastro do cliente.
 * O cliente nunca vê resultados clínicos, justificativas internas, dados de outro documento ou CPF completo.
 */
import { resumirDocumentos } from "../lib/exam-progresso-resultados";
import { montarMarcosEnvio, type EntradaMarcos } from "../lib/exam-marcos";
import { buildPortalIdentityIssue, type PortalIdentityIssue } from "../lib/exam-extraction/identity-display";
import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { and, desc, eq, sql } from "drizzle-orm";
import { clientsTable, db, examDocumentsTable } from "@workspace/db";
import { verifyPortalToken } from "../lib/portal-token";
import { logger } from "../lib/logger";
import { lerVisibilidadePreliminarExames } from "../lib/exam-preliminary-visibility";
import { handleEvolucao, montarEvolucao, startExamIngestion } from "./exames-lab";
import { gerarEvolucaoExamesPdf } from "../lib/evolucao-exames-pdf";
import { carregarIdentidadeClinica2b, IdentidadeEmpresa2bError } from "../lib/documentos/paxmed-2b-identidade-clinica";
import { brtISODate } from "../lib/brt";
import { NOME_COMERCIAL_EVOLUCAO } from "../lib/evolucao-exames-nome";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

// Rótulo textual do status (apenas descrição). As ETAPAS do painel vêm de montarMarcosEnvio (evidência por marco).
const STATUS_LABEL: Record<string, { etapa: string; texto: string; final: boolean }> = {
  processando: { etapa: "leitura", texto: "Em leitura", final: false },
  quarentena: { etapa: "identidade", texto: "Em conferência pela equipe", final: false },
  recebido: { etapa: "conferencia", texto: "Lido, aguardando conferência da equipe", final: false },
  conferido_1: { etapa: "conferencia", texto: "Em conferência clínica", final: false },
  conferido: { etapa: "concluido", texto: "Concluído", final: true },
  erro: { etapa: "erro", texto: "Não foi possível ler este arquivo", final: true },
  identidade_rejeitada: { etapa: "identidade", texto: "Não incorporado ao seu prontuário", final: true },
};

function portalClient(req: Request): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const id = verifyPortalToken(header.slice(7).trim());
  return id !== null && Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function ownClient(req: Request, res: Response): Promise<{ id: number; empresaId: number } | null> {
  const id = portalClient(req);
  if (id === null) {
    res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." });
    return null;
  }
  const [client] = await db
    .select({ id: clientsTable.id, empresaId: clientsTable.empresaId, status: clientsTable.status })
    .from(clientsTable)
    .where(eq(clientsTable.id, id))
    .limit(1);
  if (!client || client.status !== "active" || client.empresaId == null) {
    res.status(404).json({ error: "Cadastro não encontrado." });
    return null;
  }
  return { id: client.id, empresaId: client.empresaId };
}

router.get("/area-paciente/exames/evolucao", async (req: Request, res: Response) => {
  try {
    const client = await ownClient(req, res);
    if (!client) return;
    const preliminares = await lerVisibilidadePreliminarExames(client.empresaId);
    await handleEvolucao(client.id, req, res, false, {
      empresaId: client.empresaId,
      habilitado: preliminares,
    });
  } catch (err) {
    logger.error({ err }, "[ExamesPaciente] evolução falhou");
    if (!res.headersSent) res.status(500).json({ error: "Erro ao montar a evolução." });
  }
});

// DEEx do próprio cliente. Identidade só pelo token; modo fixo por consulta (ultimas5|completo).
// Sempre ESTRITO: só resultados conferidos (C2). Não existe prévia nesta rota; se algo não conferido
// aparecesse, a emissão é recusada em vez de entregar dado sem conferência.
router.get("/area-paciente/exames/evolucao/pdf", async (req: Request, res: Response) => {
  try {
    const client = await ownClient(req, res);
    if (!client) return;
    const modoQ = req.query["modo"] ?? "ultimas5";
    if (modoQ !== "ultimas5" && modoQ !== "completo") {
      res.status(400).json({ error: "Modo inválido." });
      return;
    }
    let identidade;
    try {
      identidade = await carregarIdentidadeClinica2b(client.empresaId);
    } catch (e) {
      if (e instanceof IdentidadeEmpresa2bError) {
        res.status(e.status).json({ error: "Documento indisponível no momento." });
        return;
      }
      throw e;
    }
    const [cli] = await db
      .select({ name: clientsTable.name, birth: clientsTable.birthDate })
      .from(clientsTable)
      .where(eq(clientsTable.id, client.id))
      .limit(1);
    const evolucao = await montarEvolucao(client.id, { portalEmpresaId: client.empresaId });
    if (evolucao.columns.length === 0) {
      res.status(404).json({ error: "Ainda não há resultados conferidos para gerar o DEEx." });
      return;
    }
    const nasc = cli?.birth && /^\d{4}-\d{2}-\d{2}/.test(cli.birth) ? cli.birth.slice(0, 10).split("-").reverse().join("/") : null;
    const r = await gerarEvolucaoExamesPdf({
      evolucao,
      modo: modoQ,
      emissao: brtISODate(),
      identidade,
      paciente: { nome: cli?.name ?? "", documentoMinimo: nasc ? `Nasc. ${nasc}` : null },
      rotuloAmbiente: null,
    });
    if (r.contemNaoConferidos) {
      res.status(409).json({ error: "Documento indisponível enquanto houver resultado em conferência." });
      return;
    }
    logger.info({ evento: "evolucao_exames_emitido_portal", clientId: client.id, modo: modoQ, colunas: r.colunasUsadas }, "DEEx emitido ao próprio cliente");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${NOME_COMERCIAL_EVOLUCAO}-${brtISODate()}.pdf"`);
    res.send(Buffer.from(r.pdf));
  } catch (err) {
    logger.error({ err }, "[ExamesPaciente] DEEx falhou");
    if (!res.headersSent) res.status(500).json({ error: "Não foi possível gerar o DEEx." });
  }
});

router.post("/area-paciente/exames/enviar", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const client = await ownClient(req, res);
    if (!client) return;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Envie o arquivo do exame." });
      return;
    }
    if (file.mimetype !== "application/pdf" || !file.buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
      res.status(400).json({ error: "Envie o exame em PDF." });
      return;
    }
    const result = await startExamIngestion({
      clientId: client.id,
      buffer: file.buffer,
      fileName: file.originalname,
      notify: true,
      empresaId: client.empresaId,
    });
    res.status(result.duplicate ? 200 : 202).json({ documentId: result.documentId, duplicado: result.duplicate });
  } catch (err) {
    logger.error({ err }, "[ExamesPaciente] envio falhou");
    res.status(500).json({ error: "Não foi possível receber o exame." });
  }
});

router.get("/area-paciente/exames/envios", async (req: Request, res: Response) => {
  try {
    const client = await ownClient(req, res);
    if (!client) return;
    const rows = await db
      .select({
        id: examDocumentsTable.id,
        fileName: examDocumentsTable.fileName,
        status: examDocumentsTable.status,
        createdAt: examDocumentsTable.createdAt,
        conf1At: examDocumentsTable.conf1At,
        conf2At: examDocumentsTable.conf2At,
        analitos: sql<number>`CASE
           WHEN ${examDocumentsTable.status} IN ('quarentena', 'identidade_rejeitada') THEN 0
           ELSE (SELECT COUNT(*)::int FROM exam_results r WHERE r.exam_document_id = exam_documents.id)
         END`,
      })
      .from(examDocumentsTable)
      .where(and(eq(examDocumentsTable.clientId, client.id), sql`${examDocumentsTable.status} <> 'ignorado'`))
      .orderBy(desc(examDocumentsTable.id))
      .limit(50);

    const ids = rows.map((r) => r.id);
    const marcosPorDoc = new Map<number, EntradaMarcos["marcos"]>();
    const identPorDoc = new Map<number, EntradaMarcos["identidade"]>();
    if (ids.length > 0) {
      const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
      // Último registro de cada marco. Escopo duplo: só documentos deste cliente (ids já vêm dele).
      const marcos = await db.execute(sql`
        SELECT DISTINCT ON (document_id, marco) document_id, marco, estado, created_at
        FROM exam_document_marcos WHERE document_id IN (${lista})
        ORDER BY document_id, marco, id DESC
      `);
      for (const m of (marcos as unknown as { rows: Array<Record<string, any>> }).rows) {
        const d = Number(m.document_id);
        const atual = marcosPorDoc.get(d) ?? {};
        atual[m.marco as keyof typeof atual] = { estado: m.estado, em: m.created_at };
        marcosPorDoc.set(d, atual);
      }
      const checks = await db.execute(sql`
        SELECT c.document_id, c.event, c.verdict, c.rule_set_version, c.created_at
        FROM exam_identity_checks c
        JOIN exam_documents d ON d.id = c.document_id
        WHERE c.document_id IN (${lista}) AND c.client_id = ${client.id}
          AND c.empresa_id = ${client.empresaId}
          AND d.client_id = ${client.id} AND d.empresa_id = ${client.empresaId}
          AND c.event IN ('verificacao', 'liberacao_humana', 'rejeicao_humana')
      `);
      for (const c of (checks as unknown as { rows: Array<Record<string, any>> }).rows) {
        const d = Number(c.document_id);
        const atual = identPorDoc.get(d) ?? {};
        if (c.event === "verificacao") atual.verificacao = { verdict: c.verdict, em: c.created_at, ruleSetVersion: c.rule_set_version };
        else if (c.event === "liberacao_humana") atual.liberacaoHumana = { em: c.created_at };
        else atual.rejeicaoHumana = { em: c.created_at };
        identPorDoc.set(d, atual);
      }
    }

    const identidadePorDoc = new Map<number, PortalIdentityIssue>();
    if (ids.length > 0) {
      const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
      // A consulta recorta o JSON no banco: nenhum analito, motivo interno ou trilha sai desta seleção.
      const verificacoes = await db.execute(sql`
        SELECT c.document_id,
          jsonb_build_object(
            'name', c.field_results->'name',
            'cpf', c.field_results->'cpf',
            'birthDate', c.field_results->'birthDate'
          ) AS field_results,
          jsonb_build_object(
            'name', c.extracted_json #>> '{extracted,patient,name}',
            'cpf', c.extracted_json #>> '{extracted,patient,cpf}',
            'birthDate', c.extracted_json #>> '{extracted,patient,birthDate}'
          ) AS identity_data
        FROM exam_identity_checks c
        JOIN exam_documents d ON d.id = c.document_id
        WHERE c.document_id IN (${lista}) AND c.client_id = ${client.id}
          AND c.empresa_id = ${client.empresaId}
          AND d.client_id = ${client.id} AND d.empresa_id = ${client.empresaId}
          AND d.status IN ('quarentena', 'identidade_rejeitada')
          AND c.event = 'verificacao' AND c.verdict IS DISTINCT FROM 'confirmada'
      `);
      for (const row of (verificacoes as unknown as { rows: Array<Record<string, any>> }).rows) {
        identidadePorDoc.set(
          Number(row.document_id),
          buildPortalIdentityIssue(row.field_results, row.identity_data),
        );
      }
    }

    // Nome do arquivo ao chegar x nome atual (renomeado). A cópia interna guarda o nome do envio;
    // a varredura do Drive guarda original_name/renamed_to. Só ids deste cliente; nunca bytes.
    const nomeOriginalPorDoc = new Map<number, string>();
    const nomeRenomeadoPorDoc = new Map<number, string>();
    if (ids.length > 0) {
      const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
      try {
        const copias = await db.execute(sql`
          SELECT document_id, file_name FROM exam_document_files WHERE document_id IN (${lista})
        `);
        for (const c of (copias as unknown as { rows: Array<Record<string, any>> }).rows) {
          if (typeof c.file_name === "string" && c.file_name) nomeOriginalPorDoc.set(Number(c.document_id), c.file_name);
        }
      } catch (err) {
        logger.warn({ err }, "[ExamesPaciente] nomes da cópia interna indisponíveis");
      }
      try {
        const varredura = await db.execute(sql`
          SELECT exam_document_id, original_name, renamed_to FROM drive_watcher_files
          WHERE exam_document_id IN (${lista}) AND client_id = ${client.id}
        `);
        for (const w of (varredura as unknown as { rows: Array<Record<string, any>> }).rows) {
          const d = Number(w.exam_document_id);
          if (typeof w.original_name === "string" && w.original_name) nomeOriginalPorDoc.set(d, w.original_name);
          if (typeof w.renamed_to === "string" && w.renamed_to) nomeRenomeadoPorDoc.set(d, w.renamed_to);
        }
      } catch (err) {
        logger.warn({ err }, "[ExamesPaciente] nomes da varredura indisponíveis");
      }
    }

    const idsComResultados = rows
      .filter((r) => r.status !== "quarentena" && r.status !== "identidade_rejeitada")
      .map((r) => r.id);
    const resumos = await resumirDocumentos(client.id, idsComResultados);
    res.json(rows.map((r) => {
      const label = STATUS_LABEL[r.status] ?? { etapa: "leitura", texto: "Em andamento", final: false };
      const m = montarMarcosEnvio({
        status: r.status, createdAt: r.createdAt, conf1At: r.conf1At, conf2At: r.conf2At, analitos: r.analitos,
        marcos: marcosPorDoc.get(r.id) ?? {}, identidade: identPorDoc.get(r.id) ?? {},
      });
      return {
        id: r.id, arquivo: r.fileName,
        nomeOriginal: nomeOriginalPorDoc.get(r.id) ?? r.fileName,
        nomeRenomeado: ((nomeRenomeadoPorDoc.get(r.id) ?? r.fileName) !== (nomeOriginalPorDoc.get(r.id) ?? r.fileName))
          ? (nomeRenomeadoPorDoc.get(r.id) ?? r.fileName) : null,
        enviadoEm: r.createdAt, etapa: label.etapa, situacao: label.texto, finalizado: label.final,
        analitos: r.status === "quarentena" || r.status === "identidade_rejeitada" ? 0 : r.analitos,
        percentual: m.percentual, etapas: m.etapas, etapaAvancada: m.etapaAvancada,
        resultados: r.status === "quarentena" || r.status === "identidade_rejeitada" ? null : (resumos.get(r.id) ?? null),
        inconsistenciaIdentidade: identidadePorDoc.get(r.id) ?? null,
      };
    }));
  } catch (err) {
    logger.error({ err }, "[ExamesPaciente] lista de envios falhou");
    res.status(500).json({ error: "Erro ao listar os envios." });
  }
});

export default router;
