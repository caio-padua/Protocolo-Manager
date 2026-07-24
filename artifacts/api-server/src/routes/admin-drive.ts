import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { empresasTable } from "@workspace/db/schema";
import { ne, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  ensureEmpresaFolder,
  ensureEmpresaClientesFolder,
  listDriveFolder,
  moveAllItemsToFolder,
  trashDriveItem,
  driveListChildren,
  driveDownloadFile,
} from "../lib/google-drive";
import { logger } from "../lib/logger";
import { startExamIngestion } from "./exames-lab";

const router: IRouter = Router();

const EMPRESAS_ROOT_FOLDER_ID = "12QD1LsvJuPK3jC6-lqXSbPeiry9ocUob";

/**
 * POST /api/admin/drive/setup-empresas
 * Cria (ou localiza) uma subpasta no Drive para cada empresa cadastrada.
 * Nomenclatura: "[NOME FANTASIA MAIÚSCULO SEM TRAÇO] [CNPJ XX.XXX.XXX/XXXX-XX]"
 * Grava o ID da pasta de volta em empresas.drive_folder_empresa_id.
 * Idempotente.
 */
router.post("/admin/drive/setup-empresas", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: empresasTable.id,
        nome: empresasTable.nome,
        nick: empresasTable.nick,
        cnpj: empresasTable.cnpj,
        driveFolderEmpresaId: empresasTable.driveFolderEmpresaId,
      })
      .from(empresasTable)
      .where(ne(empresasTable.nome, "x"));

    const results: Array<{
      id: number;
      nomeFantasia: string;
      folderName: string;
      folderId: string;
      jaExistia: boolean;
    }> = [];

    for (const emp of rows) {
      const nomeFantasia = (emp.nick ?? emp.nome ?? "").trim() || `Empresa ${emp.id}`;
      const cleanName = nomeFantasia.toUpperCase().replace(/-/g, " ").trim();
      const folderName = emp.cnpj ? `${cleanName} ${emp.cnpj}` : cleanName;
      const jaExistia = !!emp.driveFolderEmpresaId;

      const folderId = await ensureEmpresaFolder(
        nomeFantasia,
        emp.cnpj ?? null,
        EMPRESAS_ROOT_FOLDER_ID,
      );

      await db.execute(
        sql`UPDATE empresas SET drive_folder_empresa_id = ${folderId} WHERE id = ${emp.id}`,
      );

      logger.info({ empresaId: emp.id, folderName, folderId, jaExistia }, "[AdminDrive] pasta empresa configurada");
      results.push({ id: emp.id, nomeFantasia, folderName, folderId, jaExistia });
    }

    res.json({ ok: true, rootFolderId: EMPRESAS_ROOT_FOLDER_ID, total: results.length, empresas: results });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[AdminDrive] Erro ao configurar pastas de empresas");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/drive/setup-clientes-empresas
 * Dentro de cada pasta de empresa, cria "CLIENTES (NOME DA EMPRESA)".
 * Grava o ID em empresas.drive_clientes_folder_id (coluna criada se não existir).
 * Idempotente.
 */
router.post("/admin/drive/setup-clientes-empresas", async (req: Request, res: Response): Promise<void> => {
  try {
    // Garantir que a coluna exista (idempotente via IF NOT EXISTS)
    await db.execute(sql`
      ALTER TABLE empresas ADD COLUMN IF NOT EXISTS drive_clientes_folder_id TEXT;
    `);

    const rows = await db
      .select({
        id: empresasTable.id,
        nome: empresasTable.nome,
        nick: empresasTable.nick,
        driveFolderEmpresaId: empresasTable.driveFolderEmpresaId,
      })
      .from(empresasTable)
      .where(ne(empresasTable.nome, "x"));

    const results: Array<{
      id: number;
      nomeFantasia: string;
      clientesFolderName: string;
      clientesFolderId: string;
      empresaFolderId: string | null;
      status: string;
    }> = [];

    for (const emp of rows) {
      const nomeFantasia = (emp.nick ?? emp.nome ?? "").trim() || `Empresa ${emp.id}`;
      const cleanName = nomeFantasia.toUpperCase().replace(/-/g, " ").trim();
      const clientesFolderName = `CLIENTES (${cleanName})`;

      if (!emp.driveFolderEmpresaId) {
        results.push({
          id: emp.id,
          nomeFantasia,
          clientesFolderName,
          clientesFolderId: "",
          empresaFolderId: null,
          status: "SEM_PASTA_EMPRESA",
        });
        continue;
      }

      const clientesFolderId = await ensureEmpresaClientesFolder(
        nomeFantasia,
        emp.driveFolderEmpresaId,
      );

      await db.execute(
        sql`UPDATE empresas SET drive_clientes_folder_id = ${clientesFolderId} WHERE id = ${emp.id}`,
      );

      logger.info(
        { empresaId: emp.id, clientesFolderName, clientesFolderId },
        "[AdminDrive] subpasta CLIENTES configurada",
      );

      results.push({
        id: emp.id,
        nomeFantasia,
        clientesFolderName,
        clientesFolderId,
        empresaFolderId: emp.driveFolderEmpresaId,
        status: "OK",
      });
    }

    res.json({ ok: true, total: results.length, empresas: results });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[AdminDrive] Erro ao configurar subpastas CLIENTES");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/drive/list-folder?folderId=XXX
 * Lista todos os itens dentro de uma pasta do Drive.
 */
router.get("/admin/drive/list-folder", async (req: Request, res: Response): Promise<void> => {
  try {
    const { folderId } = req.query as { folderId?: string };
    if (!folderId) {
      res.status(400).json({ error: "folderId é obrigatório" });
      return;
    }

    const items = await listDriveFolder(folderId);
    const folders = items.filter(i => i.mimeType === "application/vnd.google-apps.folder");
    const files = items.filter(i => i.mimeType !== "application/vnd.google-apps.folder");

    res.json({
      folderId,
      total: items.length,
      folders: folders.length,
      files: files.length,
      items,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[AdminDrive] Erro ao listar pasta");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/drive/migrar-clientes
 * Move todo o conteúdo de uma pasta CLIENTES antiga para a subpasta
 * "CLIENTES (NOME DA EMPRESA)" dentro da pasta da empresa no Drive.
 *
 * Body: { sourceFolderId: string, empresaId: number }
 * sourceFolderId = pasta antiga de onde vêm os clientes
 * empresaId     = empresa que receberá os clientes (precisa ter drive_clientes_folder_id)
 */
router.post("/admin/drive/migrar-clientes", async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceFolderId, empresaId } = req.body as {
      sourceFolderId?: string;
      empresaId?: number;
    };

    if (!sourceFolderId || !empresaId) {
      res.status(400).json({ error: "sourceFolderId e empresaId são obrigatórios" });
      return;
    }

    // Busca a pasta CLIENTES da empresa destino
    const row = await db.execute(
      sql`SELECT drive_clientes_folder_id, nick, nome FROM empresas WHERE id = ${empresaId} LIMIT 1`,
    );
    const emp = (row.rows as any[])[0];

    if (!emp) {
      res.status(404).json({ error: `Empresa ${empresaId} não encontrada` });
      return;
    }

    const destinationFolderId: string | null = emp.drive_clientes_folder_id;
    if (!destinationFolderId) {
      res.status(400).json({
        error: `Empresa ${empresaId} não tem drive_clientes_folder_id. Rode primeiro /admin/drive/setup-clientes-empresas.`,
      });
      return;
    }

    // Lista o que tem na pasta origem antes de mover (para o relatório)
    const before = await listDriveFolder(sourceFolderId);

    logger.info(
      { empresaId, sourceFolderId, destinationFolderId, totalItems: before.length },
      "[AdminDrive] iniciando migração de clientes",
    );

    // Responde imediatamente — a migração roda em background (346+ itens levam minutos)
    res.json({
      ok: true,
      status: "running",
      empresaId,
      nomeEmpresa: emp.nick ?? emp.nome,
      sourceFolderId,
      destinationFolderId,
      totalEncontrado: before.length,
      message: `Migrando ${before.length} itens em background. Use GET /admin/drive/list-folder?folderId=${sourceFolderId} para acompanhar (folder ficará vazia ao fim).`,
    });

    // Fire-and-forget: não aguarda o resultado
    moveAllItemsToFolder(sourceFolderId, destinationFolderId)
      .then(({ moved, errors }) => {
        logger.info(
          { empresaId, totalMovido: moved.length, totalErros: errors.length },
          "[AdminDrive] migração concluída",
        );
        if (errors.length > 0) {
          logger.warn({ errors }, "[AdminDrive] erros na migração");
        }
      })
      .catch((err: Error) => {
        logger.error({ err: err.message }, "[AdminDrive] erro crítico na migração");
      });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[AdminDrive] Erro ao migrar clientes");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/drive/trash-item
 * Move um arquivo ou pasta para a lixeira do Drive.
 * Body: { fileId: string }
 */
router.post("/admin/drive/trash-item", async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.body;
    if (!fileId || typeof fileId !== "string") {
      res.status(400).json({ error: "fileId obrigatório" });
      return;
    }
    await trashDriveItem(fileId);
    logger.info({ fileId }, "[AdminDrive] item movido para lixeira");
    res.json({ ok: true, fileId, status: "trashed" });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[AdminDrive] Erro ao mover para lixeira");
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/ingest-client-exam/:clientId
 * Rota administrativa (sem auth — fica antes do collaboratorGuard).
 * Lista a pasta EXAMES do cliente no Drive, baixa cada PDF e
 * dispara startExamIngestion para cada um. Idempotente.
 */
router.post("/admin/ingest-client-exam/:clientId", async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = Number(req.params.clientId);
    if (!clientId) { res.status(400).json({ error: "clientId inválido" }); return; }

    const { clientsTable } = await import("@workspace/db/schema");
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

    const rootFolderId = (client as any).driveFolderId ?? (client as any).drive_folder_id;
    if (!rootFolderId) { res.status(400).json({ error: "Cliente sem pasta Drive configurada" }); return; }

    // Listar subpastas para achar EXAMES
    const rootChildren = await driveListChildren(rootFolderId);
    const examesFolder = rootChildren.find(
      c => c.mimeType === "application/vnd.google-apps.folder" &&
           c.name.toUpperCase().includes("EXAME")
    );
    if (!examesFolder) { res.status(404).json({ error: "Pasta EXAMES não encontrada no Drive do cliente" }); return; }

    // Listar PDFs dentro de EXAMES
    const examesChildren = await driveListChildren(examesFolder.id);
    const pdfs = examesChildren.filter(c => c.mimeType === "application/pdf");
    if (pdfs.length === 0) { res.json({ message: "Nenhum PDF encontrado na pasta EXAMES", examesFolderId: examesFolder.id }); return; }

    const results: any[] = [];
    for (const pdf of pdfs) {
      try {
        const buffer = await driveDownloadFile(pdf.id);
        const ingestion = await startExamIngestion({
          clientId,
          buffer,
          fileName: pdf.name,
          sourcePdfDriveId: pdf.id,
          notify: false,
        });
        results.push({ file: pdf.name, driveId: pdf.id, ...ingestion });
      } catch (e: any) {
        results.push({ file: pdf.name, driveId: pdf.id, error: e.message });
      }
    }

    logger.info({ clientId, count: pdfs.length }, "[AdminIngest] ingestão via Drive concluída");
    res.json({ clientId, examesFolderId: examesFolder.id, results });
  } catch (err: any) {
    logger.error({ err: err.message }, "[AdminIngest] erro");
    res.status(500).json({ error: err.message });
  }
});

export default router;
