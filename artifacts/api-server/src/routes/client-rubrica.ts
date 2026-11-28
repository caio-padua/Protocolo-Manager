import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { and, eq, isNull } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { requireClientWriter } from "./clients";
import { RUBRICA_MAX_BYTES, RubricaImagemError, prepararRubrica } from "../lib/client-rubrica-imagem";
import { lerRubricaAtiva, salvarRubricaCliente } from "../lib/client-rubrica";

/**
 * Rubrica do cliente como imagem (cadastro do cliente).
 *   POST /clients/:id/rubrica  — envia/troca (portão de quem altera cliente; mesma empresa)
 *   GET  /clients/:id/rubrica  — devolve o PNG ativo (profissional autenticado da mesma empresa; nunca em cache)
 * O arquivo fica em armazenamento privado: não existe endereço público para ele.
 */
const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RUBRICA_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") cb(null, true);
    else cb(new MulterError("LIMIT_UNEXPECTED_FILE", "file"));
  },
});

function uploadMw(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      res.status(400).json({
        error: err.code === "LIMIT_FILE_SIZE"
          ? "Imagem maior que 2 MB. Envie um arquivo menor."
          : "Arquivo inválido. Envie uma imagem PNG ou JPEG.",
      });
      return;
    }
    if (err) {
      res.status(400).json({ error: "Falha no envio do arquivo." });
      return;
    }
    next();
  });
}

function parseClientId(raw: unknown): number | null {
  const text = String(raw ?? "");
  if (!/^[1-9]\d{0,9}$/.test(text)) return null;
  return Number(text);
}

/** Cliente da empresa autenticada e não excluído. */
async function clienteDaEmpresa(clientId: number, empresaId: number): Promise<boolean> {
  const [cliente] = await db.select({ id: clientsTable.id }).from(clientsTable).where(and(
    eq(clientsTable.id, clientId),
    eq(clientsTable.empresaId, empresaId),
    isNull(clientsTable.deletedAt),
  ));
  return Boolean(cliente);
}

router.post("/clients/:id/rubrica", requireClientWriter, uploadMw, async (req, res): Promise<void> => {
  const clientId = parseClientId(req.params.id);
  if (clientId === null) {
    res.status(400).json({ error: "Id inválido." });
    return;
  }
  const empresaId = req.tenantContext.empresaId;
  if (!await clienteDaEmpresa(clientId, empresaId)) {
    res.status(404).json({ error: "Cliente não encontrado." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Envie a imagem da rubrica no campo 'file'." });
    return;
  }
  let pronta;
  try {
    pronta = prepararRubrica(req.file.buffer);
  } catch (error) {
    if (error instanceof RubricaImagemError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
  const salva = await salvarRubricaCliente({
    clientId,
    empresaId,
    professionalId: req.collaborator?.professionalId ?? null,
    pronta,
  });
  res.json({ hasRubrica: true, alterada: salva.alterada, atualizadaEm: salva.atualizadaEm.toISOString() });
});

router.get("/clients/:id/rubrica", requireCollaborator, async (req, res): Promise<void> => {
  if (!req.tenantContext?.authenticated || req.tenantContext.professionalId !== req.collaborator?.professionalId) {
    res.status(401).json({ error: "Entre com seu acesso profissional." });
    return;
  }
  const clientId = parseClientId(req.params.id);
  if (clientId === null) {
    res.status(400).json({ error: "Id inválido." });
    return;
  }
  const empresaId = req.tenantContext.empresaId;
  if (!await clienteDaEmpresa(clientId, empresaId)) {
    res.status(404).json({ error: "Cliente não encontrado." });
    return;
  }
  const png = await lerRubricaAtiva(clientId, empresaId);
  if (!png) {
    res.status(404).json({ error: "Este cliente ainda não tem rubrica." });
    return;
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(png);
});

export default router;
