/**
 * Cabine de Comando do CEO — documentos persistentes, mapa de permissões e documentação.
 * Todas as rotas exigem isPlatformOwner (CEO). Arquivo no Object Storage PRIVADO; só sai por aqui.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePlatformOwner } from "../middleware/tenantContext";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { DOMINIOS_NOMES, montarMapaPermissoes } from "../lib/perfis-permissoes.js";

const router = Router();
const storage = new ObjectStorageService();
const MAX_BYTES = 25 * 1024 * 1024;

const TIPOS: Record<string, { mime: string; valido: (b: Buffer) => boolean }> = {
  pdf: { mime: "application/pdf", valido: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  png: { mime: "image/png", valido: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: "image/jpeg", valido: (b) => b[0] === 0xff && b[1] === 0xd8 },
  jpeg: { mime: "image/jpeg", valido: (b) => b[0] === 0xff && b[1] === 0xd8 },
  webp: { mime: "image/webp", valido: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  svg: { mime: "image/svg+xml", valido: (b) => b.subarray(0, 2000).toString("utf8").includes("<svg") },
  txt: { mime: "text/plain; charset=utf-8", valido: (b) => !b.includes(0) },
  md: { mime: "text/markdown; charset=utf-8", valido: (b) => !b.includes(0) },
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

function extensao(nome: string): string {
  return path.extname(nome).replace(".", "").toLowerCase();
}

const LISTA_CAMPOS = sql`id, empresa_id AS "empresaId", titulo, descricao, nome_original AS "nomeOriginal",
  mime_type AS "mimeType", tamanho_bytes AS "tamanhoBytes", criado_em AS "criadoEm"`;

router.get("/ceo/documentos", requirePlatformOwner, async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const empresaRaw = typeof req.query.empresaId === "string" ? req.query.empresaId : "";
  const filtros = [sql`arquivado_em IS NULL`];
  if (empresaRaw) {
    if (!/^[1-9]\d*$/.test(empresaRaw)) { res.status(400).json({ error: "Clínica inválida." }); return; }
    filtros.push(sql`empresa_id = ${Number(empresaRaw)}`);
  }
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    filtros.push(sql`(titulo ILIKE ${like} OR coalesce(descricao,'') ILIKE ${like} OR nome_original ILIKE ${like})`);
  }
  const onde = sql.join(filtros, sql` AND `);
  const r = await db.execute(sql`SELECT ${LISTA_CAMPOS} FROM ceo_documentos WHERE ${onde} ORDER BY criado_em DESC LIMIT 500`);
  res.set("Cache-Control", "no-store").json({ documentos: r.rows });
});

router.post("/ceo/documentos", requirePlatformOwner, (req: Request, res: Response): void => {
  upload.single("arquivo")(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError) {
        res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Arquivo maior que 25 MB." : "Envio inválido." });
        return;
      }
      if (err) throw err;
      const file = req.file;
      if (!file || file.size === 0) { res.status(400).json({ error: "Envie um arquivo não vazio." }); return; }
      const nomeOriginal = Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 200);
      const ext = extensao(nomeOriginal);
      const tipo = TIPOS[ext];
      if (!tipo) { res.status(415).json({ error: `Tipo não aceito. Aceitos: ${Object.keys(TIPOS).join(", ")}.` }); return; }
      if (!tipo.valido(file.buffer)) { res.status(415).json({ error: "O conteúdo não corresponde ao tipo do arquivo." }); return; }
      const titulo = String(req.body?.titulo ?? "").trim().slice(0, 200) || nomeOriginal;
      const descricao = String(req.body?.descricao ?? "").trim().slice(0, 1000) || null;
      let empresaId: number | null = null;
      if (req.body?.empresaId) {
        if (!/^[1-9]\d*$/.test(String(req.body.empresaId))) { res.status(400).json({ error: "Clínica inválida." }); return; }
        empresaId = Number(req.body.empresaId);
        const ok = await db.execute(sql`SELECT 1 FROM empresas WHERE id = ${empresaId} AND ativa = true LIMIT 1`);
        if (!ok.rows.length) { res.status(400).json({ error: "Clínica não encontrada ou inativa." }); return; }
      }
      const objeto = `ceo-docs/${randomUUID()}.${ext}`;
      await storage.savePrivateObject(objeto, file.buffer, tipo.mime);
      const r = await db.execute(sql`INSERT INTO ceo_documentos
        (empresa_id, titulo, descricao, nome_original, mime_type, tamanho_bytes, objeto_path, enviado_por)
        VALUES (${empresaId}, ${titulo}, ${descricao}, ${nomeOriginal}, ${tipo.mime}, ${file.size}, ${objeto}, ${req.tenantContext.professionalId})
        RETURNING ${LISTA_CAMPOS}`);
      res.status(201).json({ documento: r.rows[0] });
    } catch (e) {
      req.log?.error({ err: e }, "ceo-cabine: falha no upload");
      res.status(500).json({ error: "Falha ao guardar o documento." });
    }
  });
});

router.get("/ceo/documentos/:id/arquivo", requirePlatformOwner, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const r = await db.execute(sql`SELECT objeto_path, mime_type, nome_original FROM ceo_documentos WHERE id = ${id} AND arquivado_em IS NULL`);
  const row = r.rows[0] as { objeto_path: string; mime_type: string; nome_original: string } | undefined;
  if (!row) { res.status(404).json({ error: "Documento não encontrado." }); return; }
  try {
    const buf = await storage.readPrivateObject(row.objeto_path);
    res.set({
      "Content-Type": row.mime_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.nome_original)}`,
      "X-Content-Type-Options": "nosniff",
      // SVG e texto nunca executam script dentro da nossa origem.
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "Cache-Control": "no-store",
    });
    res.send(buf);
  } catch (e) {
    req.log?.error({ err: e }, "ceo-cabine: arquivo ausente no armazenamento");
    res.status(404).json({ error: "O arquivo não está mais no armazenamento." });
  }
});

// Regra de Ouro: arquivar, nunca apagar.
router.post("/ceo/documentos/:id/arquivar", requirePlatformOwner, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const r = await db.execute(sql`UPDATE ceo_documentos SET arquivado_em = NOW() WHERE id = ${id} AND arquivado_em IS NULL RETURNING id`);
  if (!r.rows.length) { res.status(404).json({ error: "Documento não encontrado." }); return; }
  res.json({ ok: true });
});

router.get("/ceo/permissoes/mapa", requirePlatformOwner, (_req: Request, res: Response): void => {
  res.set("Cache-Control", "no-store").json({ perfis: montarMapaPermissoes(), dominios: DOMINIOS_NOMES });
});

// ── Documentação de referência (arquivos .md em docs/permissoes) ────────────
function pastaDocs(): string | null {
  const candidatos = [
    path.resolve(process.cwd(), "docs/permissoes"),
    path.resolve(process.cwd(), "../../docs/permissoes"),
    path.resolve(process.cwd(), "../docs/permissoes"),
  ];
  return candidatos.find((c) => fs.existsSync(c)) ?? null;
}

router.get("/ceo/docs-referencia", requirePlatformOwner, (_req: Request, res: Response): void => {
  const dir = pastaDocs();
  if (!dir) { res.status(404).json({ error: "Pasta docs/permissoes não encontrada neste ambiente." }); return; }
  const arquivos = fs.readdirSync(dir).filter((f) => /^[A-Za-z0-9_-]+\.md$/.test(f)).sort();
  res.set("Cache-Control", "no-store").json({ arquivos });
});

router.get("/ceo/docs-referencia/:nome", requirePlatformOwner, (req: Request, res: Response): void => {
  const nome = String(req.params.nome);
  if (!/^[A-Za-z0-9_-]+\.md$/.test(nome)) { res.status(400).json({ error: "Nome inválido." }); return; }
  const dir = pastaDocs();
  const arquivo = dir ? path.join(dir, nome) : null;
  if (!arquivo || !fs.existsSync(arquivo)) { res.status(404).json({ error: "Documento não encontrado." }); return; }
  res.set("Cache-Control", "no-store").json({ nome, conteudo: fs.readFileSync(arquivo, "utf8") });
});

export default router;
