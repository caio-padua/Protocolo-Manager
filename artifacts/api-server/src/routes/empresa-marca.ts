import { randomUUID } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { sql } from "drizzle-orm";
import { PNG } from "pngjs";
import { db } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { ObjectStorageService } from "../lib/objectStorage";
import { recortarSimbolo } from "../lib/documentos/paxmed-recortar-simbolo";
import { aplicarOuroAoSimbolo } from "../lib/documentos/paxmed-ouro";

// Marca da empresa da SESSAO (nunca de outra): simbolo (ja cadastrado no Paxmed 2B) e logo (novo).
const router: IRouter = Router();
const storage = new ObjectStorageService();
const LIMITE = 2 * 1024 * 1024;
const PNG_ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE, files: 1 } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function autenticado(req: Request, res: Response): number | null {
  const prof = req.collaborator?.professionalId;
  if (!prof || !req.tenantContext?.authenticated || req.tenantContext.professionalId !== prof) {
    res.status(401).json({ error: "Faça login novamente." });
    return null;
  }
  return req.tenantContext.empresaId;
}

async function baixar(dir: string, id: string): Promise<Buffer> {
  if (!uuid.test(id)) throw new Error("id inválido");
  const file = await storage.getObjectEntityFile(`/objects/${dir}/${id}`);
  const [bytes] = await file.download();
  return bytes;
}

router.get("/empresa-marca/simbolo", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = autenticado(req, res); if (empresaId === null) return;
  const r = await db.execute(sql`SELECT simbolo_path FROM paxmed_2b_empresa_identidade WHERE empresa_id = ${empresaId}`);
  const id = (r.rows[0] as { simbolo_path?: string } | undefined)?.simbolo_path;
  if (!id) { res.status(404).json({ error: "Símbolo não cadastrado na empresa." }); return; }
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.type("png").send(recortarSimbolo(aplicarOuroAoSimbolo(await baixar("paxmed-marcas-finais", id))));
  } catch { res.status(404).json({ error: "Símbolo indisponível." }); }
});

router.get("/empresa-marca/logo", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = autenticado(req, res); if (empresaId === null) return;
  const r = await db.execute(sql`SELECT logo_path FROM empresa_marca_logo WHERE empresa_id = ${empresaId}`);
  const id = (r.rows[0] as { logo_path?: string } | undefined)?.logo_path;
  if (!id) { res.status(404).json({ error: "Logo não cadastrado na empresa." }); return; }
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.type("png").send(await baixar("empresa-logos", id));
  } catch { res.status(404).json({ error: "Logo indisponível." }); }
});

function receber(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: "Envie um arquivo PNG de até 2 MB." }); return; }
    next();
  });
}

// Quem pode trocar o logo: CEO (dono do Paxmed) ou administrador da propria empresa.
router.put("/empresa-marca/logo", requireCollaborator, receber, async (req, res): Promise<void> => {
  const empresaId = autenticado(req, res); if (empresaId === null) return;
  const perfil = req.tenantContext.perfilPlataforma;
  if (perfil !== "platform_owner" && perfil !== "admin") {
    res.status(403).json({ error: "Somente o CEO ou o administrador da empresa troca o logo." }); return;
  }
  const bytes = req.file?.buffer;
  if (!bytes || bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_ASSINATURA)) {
    res.status(400).json({ error: "O logo precisa ser um arquivo PNG." }); return;
  }
  try {
    const png = PNG.sync.read(bytes);
    if (png.width < 16 || png.height < 16 || png.width > 4000 || png.height > 4000) throw new Error("tamanho");
  } catch { res.status(400).json({ error: "PNG inválido ou com dimensões fora de 16 a 4000 pixels." }); return; }
  const id = randomUUID();
  try { await storage.savePrivateObject(`empresa-logos/${id}`, bytes, "image/png"); }
  catch { res.status(503).json({ error: "Armazenamento indisponível. O logo anterior foi preservado." }); return; }
  await db.execute(sql`INSERT INTO empresa_marca_logo (empresa_id, logo_path, atualizado_por)
    VALUES (${empresaId}, ${id}, ${req.tenantContext.professionalId})
    ON CONFLICT (empresa_id) DO UPDATE SET logo_path = EXCLUDED.logo_path, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`);
  res.json({ ok: true });
});

export default router;
