import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { requireCollaborator } from "./collaborator.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Contrato de entrada validado inline (sem depender do barril de codegen).
const RequestUploadUrlBody = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(500 * 1024 * 1024),
  // Só aceitamos vídeo aqui (escopo da Onda 8.5). Endurece o contrato no
  // servidor, não só na tela, para o upload não virar porta de qualquer tipo.
  contentType: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => v.toLowerCase().startsWith("video/"), {
      message: "Apenas arquivos de vídeo são aceitos",
    }),
});

/**
 * POST /storage/uploads/request-url
 *
 * Devolve uma URL assinada (presigned) para o navegador enviar o arquivo
 * DIRETO ao Object Storage. O cliente manda só os metadados (nome, tamanho,
 * tipo) — nunca o arquivo. Gateado por colaborador: só a equipe sobe vídeo.
 */
router.post(
  "/storage/uploads/request-url",
  requireCollaborator,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Campos obrigatórios ausentes ou inválidos" });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      req.log.error({ err: error }, "Erro ao gerar URL de upload");
      res.status(500).json({ error: "Falha ao gerar URL de upload" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve arquivos públicos de PUBLIC_OBJECT_SEARCH_PATHS. Sem autenticação.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = (req.params as Record<string, unknown>).filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : String(raw);
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "Arquivo não encontrado" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Erro ao servir objeto público");
    res.status(500).json({ error: "Falha ao servir objeto público" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve arquivos do PRIVATE_OBJECT_DIR. Aqui o vídeo de apresentação é público
 * para o paciente (sem ACL) — é conteúdo institucional, não dado sensível.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = (req.params as Record<string, unknown>).path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : String(raw);
    // Esta rota é pública (sem ACL). Por isso só servimos o que está sob
    // "uploads/" — onde nascem os vídeos presigned. Assim, se o diretório
    // privado um dia guardar arquivo sensível, ele NÃO vaza por aqui.
    if (!wildcardPath.startsWith("uploads/")) {
      res.status(404).json({ error: "Objeto não encontrado" });
      return;
    }
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Objeto não encontrado");
      res.status(404).json({ error: "Objeto não encontrado" });
      return;
    }
    req.log.error({ err: error }, "Erro ao servir objeto");
    res.status(500).json({ error: "Falha ao servir objeto" });
  }
});

export default router;
