import { Router, type Response } from "express";
import multer from "multer";
import { pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { acesso } from "./fornecedores";
import { ErroCatalogo, guardarCatalogo, lerCatalogo, listarCatalogos } from "../lib/fornecedor-catalogos";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });

function tratar(res: Response, e: unknown): void {
  if (e instanceof ErroCatalogo) { res.status(e.status).json({ error: e.message }); return; }
  throw e;
}

router.get("/fornecedores/:id/catalogos", requireCollaborator, acesso, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ErroCatalogo(400, "Fornecedor inválido.");
    res.json({ catalogos: await listarCatalogos(pool, req.tenantContext.empresaId, id) });
  } catch (e) { tratar(res, e); }
});

router.post("/fornecedores/:id/catalogos", requireCollaborator, acesso, (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? "Arquivo acima de 100 MB." : "Falha ao receber o arquivo." }); return; }
    next();
  });
}, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ErroCatalogo(400, "Fornecedor inválido.");
    if (!req.file) throw new ErroCatalogo(400, "Escolha o arquivo do catálogo.");
    const nome = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const r = await guardarCatalogo(pool, {
      empresaId: req.tenantContext.empresaId, fornecedorId: id, nomeArquivo: /Ã|Â/.test(nome) ? req.file.originalname : nome,
      buffer: req.file.buffer, profissionalId: req.tenantContext.professionalId ?? null, origem: "upload",
      referencia: typeof req.body?.referencia === "string" ? req.body.referencia : null,
    });
    res.status(r.jaExistia ? 200 : 201).json(r);
  } catch (e) { tratar(res, e); }
});

router.get("/fornecedores/catalogos/:catalogoId/arquivo", requireCollaborator, acesso, async (req, res) => {
  try {
    const id = Number(req.params.catalogoId);
    if (!Number.isSafeInteger(id) || id < 1) throw new ErroCatalogo(400, "Arquivo inválido.");
    const a = await lerCatalogo(pool, req.tenantContext.empresaId, id);
    res.setHeader("Content-Type", a.mime);
    res.setHeader("Content-Disposition", `attachment; filename="catalogo"; filename*=UTF-8''${encodeURIComponent(a.nome)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(a.buffer);
  } catch (e) { tratar(res, e); }
});

export default router;
