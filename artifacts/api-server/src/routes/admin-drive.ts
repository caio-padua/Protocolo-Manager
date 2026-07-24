import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { empresasTable } from "@workspace/db/schema";
import { ne, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { ensureEmpresaFolder } from "../lib/google-drive";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Pasta-raiz cedida pelo CEO para todas as empresas do sistema
const EMPRESAS_ROOT_FOLDER_ID = "12QD1LsvJuPK3jC6-lqXSbPeiry9ocUob";

/**
 * POST /api/admin/drive/setup-empresas
 * Cria (ou localiza) uma subpasta no Drive para cada empresa cadastrada.
 * Nomenclatura: "[NOME FANTASIA MAIÚSCULO SEM TRAÇO] [CNPJ XX.XXX.XXX/XXXX-XX]"
 * Grava o ID da pasta de volta em empresas.drive_folder_empresa_id.
 * Idempotente: pode ser chamado quantas vezes quiser.
 */
router.post("/admin/drive/setup-empresas", async (req: Request, res: Response): Promise<void> => {
  try {
    // Carrega todas as empresas exceto a de teste (nome = 'x')
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

      // Persiste o ID de volta na empresa
      await db.execute(
        sql`UPDATE empresas SET drive_folder_empresa_id = ${folderId} WHERE id = ${emp.id}`,
      );

      logger.info(
        { empresaId: emp.id, folderName, folderId, jaExistia },
        "[AdminDrive] pasta empresa configurada",
      );

      results.push({ id: emp.id, nomeFantasia, folderName, folderId, jaExistia });
    }

    res.json({
      ok: true,
      rootFolderId: EMPRESAS_ROOT_FOLDER_ID,
      total: results.length,
      empresas: results,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[AdminDrive] Erro ao configurar pastas de empresas");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
