import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  ensureClientFolderStructure,
  createClientSpreadsheet,
  uploadFileToDrive,
  shareWithClient,
  isDriveConnected,
  formatProtocolFileName,
  formatRASFileName,
  deduplicateClientFolders,
  normalizeAllClientFolders,
} from "../lib/google-drive";
import { renameAllClientFiles } from "../lib/drive-file-renamer";

const router = Router();

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const connected = await isDriveConnected();
    res.json({ connected });
  } catch {
    res.json({ connected: false });
  }
});

router.post("/setup-client/:clientId", async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      return res.status(404).json({ error: "Cliente nao encontrado" });
    }

    const result = await ensureClientFolderStructure(client.name, client.cpf);

    let spreadsheetUrl = "";
    try {
      const sheetResult = await createClientSpreadsheet(
        client.name,
        client.cpf,
        {
          birthDate: client.birthDate,
          phone: client.phone,
          address: client.address,
          email: client.email,
          pais: client.pais,
          instagram: client.instagram,
          comoConheceu: client.comoConheceu,
        },
        result
      );
      spreadsheetUrl = sheetResult.spreadsheetUrl;
    } catch (sheetErr: any) {
      console.error("Erro ao criar planilha:", sheetErr.message);
    }

    if (client.email) {
      await shareWithClient(result.clientFolderId, client.email);
    }

    res.json({
      success: true,
      clientFolderId: result.clientFolderId,
      subfolders: result.subfolders,
      spreadsheetUrl,
      message: `Pastas criadas para ${client.name}`,
    });
  } catch (err: any) {
    console.error("Drive setup error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/setup-all-clients", async (_req: Request, res: Response) => {
  try {
    const allClients = await db.select().from(clientsTable);
    const results: any[] = [];

    for (const client of allClients) {
      try {
        const result = await ensureClientFolderStructure(client.name, client.cpf);

        let spreadsheetUrl = "";
        try {
          const sheetResult = await createClientSpreadsheet(
            client.name,
            client.cpf,
            {
              birthDate: client.birthDate,
              phone: client.phone,
              address: client.address,
              email: client.email,
              pais: client.pais,
              instagram: client.instagram,
              comoConheceu: client.comoConheceu,
            },
            result
          );
          spreadsheetUrl = sheetResult.spreadsheetUrl;
        } catch (sheetErr: any) {
          console.error(`Erro planilha ${client.name}:`, sheetErr.message);
        }

        if (client.email) {
          await shareWithClient(result.clientFolderId, client.email);
        }
        results.push({ clientId: client.id, name: client.name, success: true, spreadsheetUrl });
      } catch (err: any) {
        results.push({ clientId: client.id, name: client.name, success: false, error: err.message });
      }
    }

    res.json({ results, total: allClients.length, created: results.filter(r => r.success).length });
  } catch (err: any) {
    console.error("Drive setup-all error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/upload-protocol/:clientId", async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { pdfBase64, protocolDate, protocolName } = req.body;

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });

    const folders = await ensureClientFolderStructure(client.name, client.cpf);
    const protocolsFolderId = folders.subfolders["PROTOCOLOS"];

    const fileName = formatProtocolFileName(protocolDate || new Date().toISOString().slice(0, 10), client.name);
    const pdfBuffer = Buffer.from(pdfBase64, "base64");

    const result = await uploadFileToDrive(protocolsFolderId, fileName, "application/pdf", pdfBuffer);

    if (client.email) {
      await shareWithClient(result.fileId, client.email);
    }

    res.json({
      success: true,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
      fileName,
    });
  } catch (err: any) {
    console.error("Drive upload protocol error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/upload-ras/:clientId", async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { pdfBase64, rasDate, cpf: rasClientCpf } = req.body;

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });

    const folders = await ensureClientFolderStructure(client.name, client.cpf);

    const fileName = formatRASFileName(
      rasDate || new Date().toISOString().slice(0, 10),
      client.name,
      client.cpf,
    );
    const pdfBuffer = Buffer.from(pdfBase64, "base64");

    const protocolsFolderId = folders.subfolders["PROTOCOLOS"];
    const result = await uploadFileToDrive(protocolsFolderId, fileName, "application/pdf", pdfBuffer);

    if (client.email) {
      await shareWithClient(result.fileId, client.email);
    }

    res.json({
      success: true,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
      fileName,
    });
  } catch (err: any) {
    console.error("Drive upload RAS error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/deduplicate-folders", async (_req: Request, res: Response) => {
  try {
    console.log("[Drive] Iniciando deduplicacao de pastas de clientes...");
    const result = await deduplicateClientFolders();
    console.log(`[Drive] Deduplicacao concluida: ${result.merged.length} clientes mesclados, ${result.errors.length} erros`);
    res.json({
      success: true,
      totalMerged: result.merged.length,
      merged: result.merged,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error("Dedup error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/normalize-folders", async (_req: Request, res: Response) => {
  try {
    console.log("[Drive] Iniciando normalizacao de todas as pastas de clientes...");
    const result = await normalizeAllClientFolders();
    console.log(`[Drive] Normalizacao concluida: ${result.renamed.length} renomeadas, ${result.subfoldersCreated} subpastas criadas, ${result.spreadsheetsCreated} planilhas criadas, ${result.errors.length} erros`);
    res.json({
      success: true,
      totalRenamed: result.renamed.length,
      subfoldersCreated: result.subfoldersCreated,
      spreadsheetsCreated: result.spreadsheetsCreated,
      renamed: result.renamed,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error("Normalize error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/rename-files", async (_req: Request, res: Response) => {
  try {
    console.log("[Drive] Iniciando renomeacao inteligente de arquivos...");
    const result = await renameAllClientFiles();
    console.log(`[Drive] Renomeacao concluida: ${result.totalRenamed} renomeados, ${result.skipped} ignorados, ${result.errors.length} erros`);
    res.json({
      success: true,
      totalRenamed: result.totalRenamed,
      skipped: result.skipped,
      results: result.results,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error("Rename files error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
