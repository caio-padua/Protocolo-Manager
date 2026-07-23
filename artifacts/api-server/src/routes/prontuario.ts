import { Router, type IRouter } from "express";
import { db, clientsTable, protocolsTable, examRequestPdfsTable, examDocumentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ============================================================================
// GET /api/prontuario/:clientId
// Retorna o "prontuário consolidado" de um paciente: prescrições emitidas,
// protocolos indicados, exames solicitados e exames recebidos.
// ============================================================================

const router: IRouter = Router();

router.get("/prontuario/:clientId", async (req, res): Promise<void> => {
  const clientId = parseInt(req.params.clientId, 10);
  if (!clientId || isNaN(clientId)) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }

  try {
    // 1. Dados do cliente
    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);

    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    // 2. Prescrições emitidas (receituário) — tabela raw, sem Drizzle schema
    let prescricoes: Record<string, unknown>[] = [];
    try {
      const rows = await db.execute(sql`
        SELECT token, paciente, medico, crm, clinica, data_emissao, arquivo, drive_url, criado_em
        FROM receituario_tokens
        WHERE client_id = ${clientId}
        ORDER BY criado_em DESC
        LIMIT 50
      `);
      prescricoes = (
        (rows as unknown as { rows: Record<string, unknown>[] }).rows ??
        (Array.isArray(rows) ? rows : [])
      );
    } catch {
      // tabela ainda não existe (nenhuma receita emitida)
    }

    // 3. Protocolos indicados
    const protocolos = await db
      .select({
        id: protocolsTable.id,
        titulo: protocolsTable.title,
        status: protocolsTable.status,
        createdAt: protocolsTable.createdAt,
      })
      .from(protocolsTable)
      .where(eq(protocolsTable.clientId, clientId))
      .orderBy(desc(protocolsTable.createdAt))
      .limit(50);

    // 4. Exames solicitados (pedidos de exame emitidos)
    const examesIndicados = await db
      .select({
        id: examRequestPdfsTable.id,
        tipo: examRequestPdfsTable.tipo,
        fileName: examRequestPdfsTable.fileName,
        examCount: examRequestPdfsTable.examCount,
        observacao: examRequestPdfsTable.observacao,
        token: examRequestPdfsTable.token,
        createdAt: examRequestPdfsTable.createdAt,
      })
      .from(examRequestPdfsTable)
      .where(eq(examRequestPdfsTable.clientId, clientId))
      .orderBy(desc(examRequestPdfsTable.createdAt))
      .limit(50);

    // 5. Exames recebidos (laudos/resultados)
    const examesRecebidos = await db
      .select({
        id: examDocumentsTable.id,
        fileName: examDocumentsTable.fileName,
        labName: examDocumentsTable.labName,
        collectionDate: examDocumentsTable.collectionDate,
        examKind: examDocumentsTable.examKind,
        status: examDocumentsTable.status,
        origin: examDocumentsTable.origin,
        sourcePdfDriveId: examDocumentsTable.sourcePdfDriveId,
        createdAt: examDocumentsTable.createdAt,
      })
      .from(examDocumentsTable)
      .where(eq(examDocumentsTable.clientId, clientId))
      .orderBy(desc(examDocumentsTable.createdAt))
      .limit(100);

    res.json({
      client: {
        id: client.id,
        nome: client.name,
        cpf: client.cpf,
        email: client.email,
        telefone: client.phone,
        dataNascimento: client.birthDate,
        foto: client.photoUrl,
        driveFolderId: client.driveFolderId,
      },
      prescricoes,
      protocolos,
      examesIndicados,
      examesRecebidos,
    });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : String(err) }, "prontuario: erro");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
