import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { and, eq } from "drizzle-orm";
import { db, antropometriaFigurasTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { requireClientWriter } from "./clients";

/**
 * Fotos de orientacao da antropometria (Configuracoes > Parametros de Saude).
 * Uma foto por regiao e por empresa. Leitura: qualquer acesso profissional da empresa.
 * Gravacao/remocao: acesso profissional com permissao de escrita.
 */
const router: IRouter = Router();

const REGIOES = ["pescoco", "torax", "cintura", "abdomen", "quadril", "braco", "coxa", "panturrilha"] as const;
const MAX_BYTES = 4 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });
function uploadMw(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Imagem maior que 4 MB. Envie uma menor." : "Arquivo inválido." });
      return;
    }
    if (err) { res.status(400).json({ error: "Falha no envio do arquivo." }); return; }
    next();
  });
}

// O tipo vem dos primeiros bytes do arquivo, nunca do que o navegador declara.
function tipoPelosBytes(b: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

const regiaoDe = (v: unknown) => (REGIOES as readonly string[]).includes(String(v)) ? String(v) : null;

function empresaDaSessao(req: Request, res: Response): number | null {
  if (!req.tenantContext?.authenticated || req.tenantContext.professionalId !== req.collaborator?.professionalId) {
    res.status(401).json({ error: "Entre com seu acesso profissional." });
    return null;
  }
  return req.tenantContext.empresaId;
}

router.get("/antropometria/figuras", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req, res);
  if (empresaId === null) return;
  const linhas = await db.select({ regiao: antropometriaFigurasTable.regiao, updatedAt: antropometriaFigurasTable.updatedAt })
    .from(antropometriaFigurasTable).where(eq(antropometriaFigurasTable.empresaId, empresaId));
  res.json(linhas.map((l) => ({ regiao: l.regiao, atualizadoEm: l.updatedAt.toISOString() })));
});

router.get("/antropometria/figuras/:regiao/arquivo", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req, res);
  if (empresaId === null) return;
  const regiao = regiaoDe(req.params.regiao);
  if (!regiao) { res.status(400).json({ error: "Região inválida." }); return; }
  const [l] = await db.select().from(antropometriaFigurasTable)
    .where(and(eq(antropometriaFigurasTable.empresaId, empresaId), eq(antropometriaFigurasTable.regiao, regiao)));
  if (!l) { res.status(404).json({ error: "Sem foto para esta região." }); return; }
  res.setHeader("Content-Type", l.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.send(l.dados);
});

router.put("/antropometria/figuras/:regiao", requireClientWriter, uploadMw, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req, res);
  if (empresaId === null) return;
  const regiao = regiaoDe(req.params.regiao);
  if (!regiao) { res.status(400).json({ error: "Região inválida." }); return; }
  const arq = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!arq || !arq.buffer.length) { res.status(400).json({ error: "Escolha uma imagem." }); return; }
  const mime = tipoPelosBytes(arq.buffer);
  if (!mime) { res.status(400).json({ error: "Use imagem PNG, JPEG ou WebP." }); return; }
  const prof = req.tenantContext.professionalId;
  await db.insert(antropometriaFigurasTable)
    .values({ empresaId, regiao, mime, dados: arq.buffer, atualizadoPor: prof })
    .onConflictDoUpdate({
      target: [antropometriaFigurasTable.empresaId, antropometriaFigurasTable.regiao],
      set: { mime, dados: arq.buffer, atualizadoPor: prof, updatedAt: new Date() },
    });
  res.json({ regiao });
});

router.delete("/antropometria/figuras/:regiao", requireClientWriter, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req, res);
  if (empresaId === null) return;
  const regiao = regiaoDe(req.params.regiao);
  if (!regiao) { res.status(400).json({ error: "Região inválida." }); return; }
  await db.delete(antropometriaFigurasTable)
    .where(and(eq(antropometriaFigurasTable.empresaId, empresaId), eq(antropometriaFigurasTable.regiao, regiao)));
  res.json({ regiao });
});

export default router;
