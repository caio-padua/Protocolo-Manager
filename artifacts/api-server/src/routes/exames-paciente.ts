/**
 * Exames do cliente na Área do Cliente (/area).
 * A identidade vem SOMENTE do token do portal (Authorization: Bearer). Nenhum clientId
 * é aceito na URL, no corpo ou na consulta: o que vier é ignorado. A clínica é a do cadastro do cliente.
 * O cliente nunca vê modelo de IA, motivo de quarentena nem dado de outra pessoa.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { and, desc, eq, sql } from "drizzle-orm";
import { clientsTable, db, examDocumentsTable } from "@workspace/db";
import { verifyPortalToken } from "../lib/portal-token";
import { logger } from "../lib/logger";
import { handleEvolucao, startExamIngestion } from "./exames-lab";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

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
    await handleEvolucao(client.id, req, res);
  } catch (err) {
    logger.error({ err }, "[ExamesPaciente] evolução falhou");
    if (!res.headersSent) res.status(500).json({ error: "Erro ao montar a evolução." });
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
        analitos: sql<number>`(SELECT COUNT(*)::int FROM exam_results r WHERE r.exam_document_id = exam_documents.id)`,
      })
      .from(examDocumentsTable)
      .where(and(eq(examDocumentsTable.clientId, client.id), sql`${examDocumentsTable.status} <> 'ignorado'`))
      .orderBy(desc(examDocumentsTable.id))
      .limit(50);
    res.json(rows.map((r) => {
      const label = STATUS_LABEL[r.status] ?? { etapa: "leitura", texto: "Em andamento", final: false };
      return { id: r.id, arquivo: r.fileName, enviadoEm: r.createdAt, etapa: label.etapa, situacao: label.texto, finalizado: label.final, analitos: r.status === "quarentena" ? 0 : r.analitos };
    }));
  } catch (err) {
    logger.error({ err }, "[ExamesPaciente] lista de envios falhou");
    res.status(500).json({ error: "Erro ao listar os envios." });
  }
});

export default router;
