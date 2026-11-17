import { randomUUID } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, clientsTable, clientBodyPhotosTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { verifyPortalToken } from "../lib/portal-token";
import { ObjectStorageService } from "../lib/objectStorage";
import { brtISODate } from "../lib/brt";
import {
  ANGULOS, ANGULOS_INFO, MAX_BYTES_FOTO, ORIENTACOES_GERAIS, FotoCorpoError, ehAngulo, prepararFotoCorpo,
} from "../lib/fotos-corpo";

/**
 * Fotos de evolucao corporal (ver specs/fotos-evolucao-corporal.md).
 *   Cliente (token do portal): GET/POST /area-paciente/fotos-corpo, GET .../:id/arquivo
 *   Equipe (acesso profissional da mesma clinica): GET /clients/:id/fotos-corpo, GET .../:fotoId/arquivo
 * O arquivo fica em armazenamento PRIVADO e so sai por estas rotas autenticadas.
 */
const router: IRouter = Router();
const storage = new ObjectStorageService();
const MAX_FOTOS_ATIVAS_POR_CLIENTE = 400;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES_FOTO, files: 1 },
});

function uploadMw(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Foto maior que 10 MB. Envie uma foto menor." : "Arquivo inválido." });
      return;
    }
    if (err) { res.status(400).json({ error: "Falha no envio do arquivo." }); return; }
    next();
  });
}

const idDe = (v: unknown): number | null => (/^[1-9]\d{0,9}$/.test(String(v ?? "")) ? Number(v) : null);

function clientIdDoPortal(req: Request): number | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return verifyPortalToken(auth.slice(7));
}

const naoAutorizado = (res: Response) => res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." });

type Linha = { id: number; takenOn: string; angle: string };

function montarSeries(linhas: Linha[]) {
  const porData = new Map<string, Record<string, { id: number } | null>>();
  for (const l of linhas) {
    let s = porData.get(l.takenOn);
    if (!s) { s = Object.fromEntries(ANGULOS.map((a) => [a, null])); porData.set(l.takenOn, s); }
    s[l.angle] = { id: l.id };
  }
  return [...porData.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, fotos]) => ({ data, fotos }));
}

async function lerSeries(clientId: number, empresaId: number) {
  const linhas = await db.select({ id: clientBodyPhotosTable.id, takenOn: clientBodyPhotosTable.takenOn, angle: clientBodyPhotosTable.angle })
    .from(clientBodyPhotosTable)
    .where(and(eq(clientBodyPhotosTable.clientId, clientId), eq(clientBodyPhotosTable.empresaId, empresaId), isNull(clientBodyPhotosTable.deletedAt)))
    .orderBy(asc(clientBodyPhotosTable.takenOn), asc(clientBodyPhotosTable.id));
  return montarSeries(linhas);
}

const angulosParaTela = ANGULOS.map((k) => ({ chave: k, rotulo: ANGULOS_INFO[k].rotulo, como: ANGULOS_INFO[k].como }));

async function enviarArquivo(res: Response, caminho: string): Promise<void> {
  try {
    const buf = await storage.readPrivateObject(caminho);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(buf);
  } catch {
    res.status(404).json({ error: "Arquivo da foto não encontrado." });
  }
}

// ── Cliente ──────────────────────────────────────────────────────────────────
router.get("/area-paciente/fotos-corpo", async (req, res): Promise<void> => {
  const clientId = clientIdDoPortal(req);
  if (clientId === null) { naoAutorizado(res); return; }
  try {
    const [c] = await db.select({ empresaId: clientsTable.empresaId }).from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), isNull(clientsTable.deletedAt)));
    if (!c || !c.empresaId) { res.status(404).json({ error: "Cliente não encontrado." }); return; }
    res.json({ hoje: brtISODate(), angulos: angulosParaTela, orientacoes: ORIENTACOES_GERAIS, series: await lerSeries(clientId, c.empresaId) });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao listar fotos do corpo (cliente)");
    res.status(500).json({ error: "Erro ao carregar as fotos." });
  }
});

router.post("/area-paciente/fotos-corpo", uploadMw, async (req, res): Promise<void> => {
  const clientId = clientIdDoPortal(req);
  if (clientId === null) { naoAutorizado(res); return; }
  const { angulo, data, consentimento } = (req.body ?? {}) as Record<string, unknown>;
  if (!ehAngulo(angulo)) { res.status(400).json({ error: "Escolha qual foto é: frente, costas, perfil esquerdo ou perfil direito." }); return; }
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data) || new Date(`${data}T00:00:00Z`).toISOString().slice(0, 10) !== data) {
    res.status(400).json({ error: "Informe uma data válida." }); return;
  }
  if (data > brtISODate()) { res.status(400).json({ error: "A data da foto não pode ser futura." }); return; }
  if (data < "2000-01-01") { res.status(400).json({ error: "Data anterior a 2000 não é aceita." }); return; }
  if (consentimento !== "true") { res.status(400).json({ error: "Confirme a autorização para guardar as suas fotos." }); return; }
  if (!req.file || req.file.size === 0) { res.status(400).json({ error: "Escolha a foto no campo de envio." }); return; }

  let pronta;
  try { pronta = prepararFotoCorpo(req.file.buffer); }
  catch (e) {
    if (e instanceof FotoCorpoError) { res.status(400).json({ error: e.message }); return; }
    throw e;
  }

  let caminho: string | null = null;
  try {
    const [c] = await db.select({ empresaId: clientsTable.empresaId, status: clientsTable.status }).from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), isNull(clientsTable.deletedAt)));
    if (!c || !c.empresaId || c.status !== "active") { res.status(404).json({ error: "Cliente não encontrado." }); return; }
    const empresaId = c.empresaId;

    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(clientBodyPhotosTable)
      .where(and(eq(clientBodyPhotosTable.clientId, clientId), isNull(clientBodyPhotosTable.deletedAt)));
    if (total >= MAX_FOTOS_ATIVAS_POR_CLIENTE) { res.status(400).json({ error: "Limite de fotos atingido. Fale com a equipe." }); return; }

    caminho = `fotos-corpo/${empresaId}/${clientId}/${randomUUID()}.jpg`;
    await storage.savePrivateObject(caminho, pronta.buffer, "image/jpeg");

    const criada = await db.transaction(async (tx) => {
      // Substituir = a anterior do mesmo angulo e data fica preservada com deleted_at.
      await tx.update(clientBodyPhotosTable).set({ deletedAt: new Date() }).where(and(
        eq(clientBodyPhotosTable.clientId, clientId), eq(clientBodyPhotosTable.takenOn, data),
        eq(clientBodyPhotosTable.angle, angulo), isNull(clientBodyPhotosTable.deletedAt)));
      const [nova] = await tx.insert(clientBodyPhotosTable).values({
        clientId, empresaId, takenOn: data, angle: angulo, storagePath: caminho!, bytes: pronta.buffer.length,
        width: pronta.width, height: pronta.height, source: "cliente", consentAt: new Date(),
      }).returning({ id: clientBodyPhotosTable.id });
      return nova;
    });
    res.status(201).json({ id: criada.id, data, angulo });
  } catch (err) {
    if (caminho) void storage.deletePrivateObject(caminho).catch(() => undefined);
    const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") { res.status(409).json({ error: "Outro envio da mesma foto estava em andamento. Tente de novo." }); return; }
    req.log.error({ err: String(err) }, "Erro ao salvar foto do corpo");
    res.status(500).json({ error: "Não foi possível salvar a foto. Tente de novo." });
  }
});

router.get("/area-paciente/fotos-corpo/:id/arquivo", async (req, res): Promise<void> => {
  const clientId = clientIdDoPortal(req);
  if (clientId === null) { naoAutorizado(res); return; }
  const id = idDe(req.params.id);
  if (id === null) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const [f] = await db.select({ path: clientBodyPhotosTable.storagePath }).from(clientBodyPhotosTable)
    .where(and(eq(clientBodyPhotosTable.id, id), eq(clientBodyPhotosTable.clientId, clientId), isNull(clientBodyPhotosTable.deletedAt)));
  if (!f) { res.status(404).json({ error: "Foto não encontrada." }); return; }
  await enviarArquivo(res, f.path);
});

// ── Equipe ───────────────────────────────────────────────────────────────────
function empresaDoAcesso(req: Request, res: Response): number | null {
  if (!req.tenantContext?.authenticated || req.tenantContext.professionalId !== req.collaborator?.professionalId) {
    res.status(401).json({ error: "Entre com seu acesso profissional." });
    return null;
  }
  return req.tenantContext.empresaId;
}

async function clienteDaClinica(clientId: number, empresaId: number): Promise<boolean> {
  const [c] = await db.select({ id: clientsTable.id }).from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.empresaId, empresaId), isNull(clientsTable.deletedAt)));
  return Boolean(c);
}

router.get("/clients/:id/fotos-corpo", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDoAcesso(req, res);
  if (empresaId === null) return;
  const clientId = idDe(req.params.id);
  if (clientId === null) { res.status(400).json({ error: "Cliente inválido." }); return; }
  if (!(await clienteDaClinica(clientId, empresaId))) { res.status(404).json({ error: "Cliente não encontrado." }); return; }
  res.json({ angulos: angulosParaTela, series: await lerSeries(clientId, empresaId) });
});

router.get("/clients/:id/fotos-corpo/:fotoId/arquivo", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDoAcesso(req, res);
  if (empresaId === null) return;
  const clientId = idDe(req.params.id), fotoId = idDe(req.params.fotoId);
  if (clientId === null || fotoId === null) { res.status(400).json({ error: "Identificador inválido." }); return; }
  if (!(await clienteDaClinica(clientId, empresaId))) { res.status(404).json({ error: "Cliente não encontrado." }); return; }
  const [f] = await db.select({ path: clientBodyPhotosTable.storagePath }).from(clientBodyPhotosTable)
    .where(and(eq(clientBodyPhotosTable.id, fotoId), eq(clientBodyPhotosTable.clientId, clientId),
      eq(clientBodyPhotosTable.empresaId, empresaId), isNull(clientBodyPhotosTable.deletedAt)));
  if (!f) { res.status(404).json({ error: "Foto não encontrada." }); return; }
  await enviarArquivo(res, f.path);
});

export default router;
