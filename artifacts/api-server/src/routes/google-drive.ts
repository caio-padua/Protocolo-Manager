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
  migrateExistingCadastros,
} from "../lib/google-drive";
import { renameAllClientFiles, diagnosePdfContent } from "../lib/drive-file-renamer";

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

router.post("/migrate-cadastros", async (_req: Request, res: Response) => {
  try {
    console.log("[Drive] Iniciando migracao de cadastros existentes...");
    res.json({ success: true, message: "Migracao iniciada em background. Acompanhe pelos logs do servidor." });

    migrateExistingCadastros().then(result => {
      console.log(`[Drive] Migracao finalizada:`, JSON.stringify({
        migrated: result.migrated,
        alreadyNew: result.alreadyNew,
        noData: result.noData,
        skipped: result.skipped,
        errors: result.errors.length,
      }));
    }).catch(err => {
      console.error("[Drive] Erro na migracao:", err.message);
    });
  } catch (err: any) {
    console.error("Migrate cadastros error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/diagnose-pdfs", async (req: Request, res: Response) => {
  try {
    const max = parseInt(req.query.max as string) || 5;
    console.log(`[Drive] Diagnosticando ${max} PDFs...`);
    const results = await diagnosePdfContent(max);
    res.json({ success: true, count: results.length, results });
  } catch (err: any) {
    console.error("Diagnose PDFs error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/rename-files", async (_req: Request, res: Response) => {
  try {
    console.log("[Drive] Iniciando renomeacao inteligente de arquivos...");
    res.json({ success: true, message: "Renomeacao iniciada em background. Acompanhe pelos logs do servidor." });

    renameAllClientFiles().then(result => {
      console.log(`[Drive] Renomeacao concluida: ${result.totalRenamed} renomeados, ${result.skipped} ignorados, ${result.errors.length} erros`);
    }).catch(err => {
      console.error("[Drive] Erro na renomeacao:", err.message);
    });
  } catch (err: any) {
    console.error("Rename files error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Upload de asset local para uma pasta Drive arbitrária (uso interno / design)
router.post("/upload-asset", async (req: Request, res: Response) => {
  try {
    const { folderId, fileName, filePath } = req.body as {
      folderId: string;
      fileName: string;
      filePath: string;
    };
    if (!folderId || !fileName || !filePath) {
      return res.status(400).json({ error: "folderId, fileName e filePath sao obrigatorios" });
    }
    const fs = await import("fs/promises");
    const path = await import("path");
    const abs = path.resolve(filePath);
    const buf = await fs.readFile(abs);
    const ext = abs.split(".").pop()?.toLowerCase();
    const mime = ext === "pdf" ? "application/pdf"
      : ext === "png" ? "image/png"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : "application/octet-stream";
    const result = await uploadFileToDrive(folderId, fileName, mime, buf, true);
    res.json({ ok: true, fileId: result.fileId, webViewLink: result.webViewLink });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
