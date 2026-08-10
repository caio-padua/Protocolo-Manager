import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { createPhotoToken, verifyPhotoToken } from "../lib/portal-token.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { enviarMensagemPaxter, type PaxterDoc } from "../lib/messaging/index.js";
import { requireCollaborator } from "./collaborator.js";
import { ensureClientFolderStructure, uploadFileToDrive, formatCpfDisplay, removeDiacritics } from "../lib/google-drive.js";
import { sendTelegram } from "../lib/telegram.js";
import { brtNow } from "../lib/brt.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// ── Validação de dimensões 1:1 a partir do buffer ─────────────────────────────
// Suporta PNG (header fixo) e JPEG (parse de markers SOF).
// Retorna null para formatos sem parse (HEIC/HEIF/WebP VP8L) — nesses casos
// não rejeitamos (falha aberta é preferível a bloquear formato legítimo).
function getImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    if (buffer.length < 24) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/jpeg") {
    let i = 2; // pula SOI
    while (i + 3 < buffer.length) {
      if (buffer[i] !== 0xff) break;
      const marker = buffer[i + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (i + 8 >= buffer.length) return null;
        return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
      }
      if (i + 3 >= buffer.length) break;
      const segLen = buffer.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
    return null;
  }
  if (mimeType === "image/webp") {
    if (buffer.length < 30 || buffer.slice(12, 16).toString("ascii") !== "VP8 ") return null;
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null; // HEIC/HEIF — pular
}

// Rejeita se dimensões não puderem ser verificadas (fail-closed) ou se
// a diferença entre largura e altura for > 5px (tolerância da spec).
function assertSquare(buffer: Buffer, mimeType: string, res: Response): boolean {
  const dims = getImageDimensions(buffer, mimeType);
  if (!dims) {
    // Não foi possível extrair dimensões — rejeitar para garantir 1:1.
    res.status(400).json({
      error:
        "Não foi possível verificar as dimensões da imagem. Converta para JPEG ou PNG e tente novamente.",
    });
    return false;
  }
  const diff = Math.abs(dims.width - dims.height);
  if (diff > 5) {
    res.status(400).json({
      error: "Envie uma imagem quadrada (1:1). Use o editor de recorte disponível.",
      dims,
    });
    return false;
  }
  return true;
}

// ── Tabela de histórico de fotos (criada no boot, idempotente) ────────────────
export async function ensurePhotoHistoryTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_photo_history (
      id          SERIAL PRIMARY KEY,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      photo_url   TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_cph_client ON client_photo_history(client_id)
  `);
}

// Upload em memoria (a foto e pequena; subimos o buffer direto ao Object
// Storage). Limite de 15 MB cobre foto de celular com folga.
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
});

function runPhotoUpload(req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "Imagem grande demais. O limite é 15 MB." });
        } else {
          res.status(400).json({ error: "Não foi possível receber o arquivo. Tente outra imagem." });
        }
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

function absoluteBaseUrl(req: Request): string {
  const fromDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const host = fromDomains || process.env.REPLIT_DEV_DOMAIN || req.get("host") || "localhost";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

function docFoto(clientName: string, link: string): PaxterDoc {
  const firstName = clientName.split(" ")[0] || clientName;
  return {
    eyebrow: `Olá, ${firstName}`,
    titulo: "Falta só a sua foto.",
    paragrafos: [
      "Para concluir o seu cadastro, toque no botão abaixo e envie uma foto do rosto pelo próprio celular.",
      "Leva menos de um minuto — bem iluminado e sem óculos escuros.",
    ],
    botao: { label: "Enviar minha foto", url: link },
    notaRodape: "Link pessoal — expira em 7 dias.",
    assunto: "Instituto Padua | Envie a sua foto de cadastro",
  };
}

// ── Convenção de nomenclatura de fotos no Drive ───────────────────────────────
// Formato: "AA.MM.DD FOTO PERFIL NOME PACIENTE.ext"
// AA = ano 2 dígitos (BRT), MM = mês, DD = dia.
// Pasta destino: sempre FOTO PERFIL (jamais IMAGENS para fotos de perfil).
// A mais recente (maior AA.MM.DD) = foto ativa; as anteriores = histórico.
function buildPhotoFileName(clientName: string, ext: string): string {
  const now = brtNow();
  const aa = String(now.getFullYear()).slice(2); // "26"
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const nome = removeDiacritics(clientName).toUpperCase().trim();
  return `${aa}.${mm}.${dd} FOTO PERFIL ${nome}.${ext}`;
}

/**
 * Salva a foto atual do cliente no histórico (banco + Drive/FOTO PERFIL) antes de sobrescrever.
 * Falha silenciosa: nunca bloqueia o upload principal.
 */
async function backupFotoAnterior(
  clientId: number,
  oldPhotoUrl: string,
  clientName: string,
  cpf: string,
  log: Request["log"],
): Promise<void> {
  // 1. Inserir no histórico do banco
  try {
    await db.execute(sql`
      INSERT INTO client_photo_history (client_id, photo_url)
      VALUES (${clientId}, ${oldPhotoUrl})
    `);
  } catch (err) {
    log.warn({ err, clientId }, "Falha ao salvar histórico de foto no banco");
  }

  // 2. Copiar arquivo para Drive/FOTO PERFIL com nomeclatura canônica (fail-safe)
  try {
    const relativePath = oldPhotoUrl.replace(/^\/api\/storage\/objects\//, "");
    if (!relativePath.startsWith("uploads/")) {
      log.warn({ clientId, relativePath }, "Photo URL não começa com uploads/ — pulando backup Drive");
      return;
    }
    const buffer = await objectStorageService.readPrivateObject(relativePath);
    const folders = await ensureClientFolderStructure(clientName, cpf);
    const fotoPerfilFolder = (folders.subfolders as Record<string, string>)["FOTO PERFIL"];
    if (!fotoPerfilFolder) {
      log.warn({ clientId }, "Pasta FOTO PERFIL não encontrada no Drive — pulando backup");
      return;
    }
    // Preserva extensão original; MIME mapeado
    const originalExt = (relativePath.split(".").pop() ?? "jpg").toLowerCase();
    const EXT_TO_MIME: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg",
      png: "image/png", webp: "image/webp",
      heic: "image/heic", heif: "image/heif",
    };
    const originalMime = EXT_TO_MIME[originalExt] ?? "image/jpeg";
    const fileName = buildPhotoFileName(clientName, originalExt);
    // allowDuplicates=true — múltiplos uploads no mesmo dia coexistem pela data no nome
    await uploadFileToDrive(fotoPerfilFolder, fileName, originalMime, buffer, true);
    log.info({ clientId, fileName }, "Foto anterior salva no Drive/FOTO PERFIL");
  } catch (err) {
    log.warn({ err, clientId }, "Falha ao copiar foto para Drive/FOTO PERFIL — upload principal não afetado");
  }
}

/**
 * Após salvar a nova foto no banco:
 * 1. Sobe a foto ativa para Drive/FOTO PERFIL com nomeclatura canônica AA.MM.DD
 * 2. Notifica o médico via Telegram
 * Falha silenciosa em ambas as etapas — não bloqueia a resposta ao cliente.
 */
async function afterPhotoSaved(
  clientId: number,
  clientName: string,
  cpf: string,
  newBuffer: Buffer,
  newMime: string,
  log: Request["log"],
): Promise<void> {
  // 1. Upload da foto ativa para Drive/FOTO PERFIL com nomenclatura canônica
  try {
    const folders = await ensureClientFolderStructure(clientName, cpf);
    const fotoPerfil = (folders.subfolders as Record<string, string>)["FOTO PERFIL"];
    if (fotoPerfil) {
      const ext = newMime === "image/jpeg" ? "jpg" : (newMime.split("/")[1] ?? "jpg");
      // Nomenclatura: "AA.MM.DD FOTO PERFIL NOME PACIENTE.ext"
      // allowDuplicates=true — coexistência no mesmo dia é válida; a mais recente = ativa
      const fileName = buildPhotoFileName(clientName, ext);
      await uploadFileToDrive(fotoPerfil, fileName, newMime, newBuffer, true);
      log.info({ clientId, fileName }, "Foto ativa salva no Drive/FOTO PERFIL com nomenclatura canônica");
    }
  } catch (err) {
    log.warn({ err, clientId }, "Falha ao salvar foto ativa no Drive/FOTO PERFIL — não afeta o upload");
  }

  // 2. Notificação ao médico via Telegram
  try {
    const chatId = process.env["PADAXOR_TELEGRAM_CHAT_ID"];
    if (chatId) {
      const cpfDisplay = formatCpfDisplay(cpf || "00000000000");
      const msg =
        `📸 *Nova foto de perfil adicionada*\n` +
        `Cliente: ${clientName}\n` +
        `CPF: ${cpfDisplay}\n\n` +
        `Verifique em Clientes → Editar → Foto do Cliente.`;
      await sendTelegram(chatId, msg);
      log.info({ clientId }, "Notificação de nova foto enviada ao médico via Telegram");
    }
  } catch (err) {
    log.warn({ err, clientId }, "Falha ao notificar médico sobre nova foto — não afeta o upload");
  }
}

// ── POST /client-photo/send-link/:id (equipe — requireCollaborator) ───────────
router.post("/client-photo/send-link/:id", requireCollaborator, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id inválido" }); return; }

  const [client] = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      email: clientsTable.email,
      phone: clientsTable.phone,
      telegramChatId: clientsTable.telegramChatId,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, id))
    .limit(1);
  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

  const token = createPhotoToken(id);
  const link = `${absoluteBaseUrl(req)}/foto?token=${token}`;

  let resultados: Array<{ canal: string; sent: boolean; error?: string }> = [];
  try {
    const envio = await enviarMensagemPaxter(
      docFoto(client.name, link),
      {
        email: client.email ?? null,
        telefone: client.phone ?? null,
        telegramChatId: client.telegramChatId ?? null,
        nome: client.name,
      },
      ["EMAIL", "WHATSAPP", "TELEGRAM"],
      { baseUrl: absoluteBaseUrl(req) },
    );
    resultados = envio.resultados;
  } catch (err) {
    req.log.error({ err }, "Erro ao enviar link de foto pelo motor de mensageria");
  }

  const emailResult = resultados.find((r) => r.canal === "EMAIL");
  const emailSent = emailResult?.sent ?? false;
  const emailError = emailResult && !emailResult.sent ? emailResult.error : undefined;
  res.json({ link, emailSent, emailError, resultados });
});

// ── GET /client-photo/info?token=... ─────────────────────────────────────────
router.get("/client-photo/info", async (req: Request, res: Response): Promise<void> => {
  const token = String(req.query.token || "");
  const clientId = verifyPhotoToken(token);
  if (!clientId) { res.status(401).json({ error: "Link inválido ou expirado" }); return; }
  const [client] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, photoUrl: clientsTable.photoUrl })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  res.json({ name: client.name, photoUrl: client.photoUrl ?? null });
});

// ── POST /client-photo/upload (token público do cliente) ──────────────────────
router.post(
  "/client-photo/upload",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await runPhotoUpload(req, res))) return;
    const token = String((req.body as Record<string, unknown>)?.token || req.query.token || "");
    const clientId = verifyPhotoToken(token);
    if (!clientId) { res.status(401).json({ error: "Link inválido ou expirado" }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ error: "Arquivo não enviado" }); return; }
    const ext = ALLOWED_IMAGE_TYPES[file.mimetype];
    if (!ext) { res.status(400).json({ error: "Formato de imagem não aceito" }); return; }
    if (file.size === 0) { res.status(400).json({ error: "Imagem vazia — envie um arquivo com conteúdo." }); return; }
    // Validação 1:1 no servidor (tolerância ±5px)
    if (!assertSquare(file.buffer, file.mimetype, res)) return;

    // Busca cliente com name, cpf e photoUrl atual para o backup
    const [client] = await db
      .select({
        id: clientsTable.id,
        name: clientsTable.name,
        cpf: clientsTable.cpf,
        photoUrl: clientsTable.photoUrl,
      })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

    try {
      // Backup aguardado antes de sobrescrever (fail-safe interno — não lança exceção)
      if (client.photoUrl) {
        await backupFotoAnterior(clientId, client.photoUrl, client.name, client.cpf ?? "", req.log);
      }

      const relativePath = `uploads/photos/${clientId}-${randomUUID()}.${ext}`;
      await objectStorageService.saveUploadObject(relativePath, file.buffer, file.mimetype);
      const photoUrl = `/api/storage/objects/${relativePath}`;
      await db.update(clientsTable).set({ photoUrl }).where(eq(clientsTable.id, clientId));
      // Drive/FOTO PERFIL + notificação ao médico (fire-and-forget — fail-safe interno)
      void afterPhotoSaved(clientId, client.name, client.cpf ?? "", file.buffer, file.mimetype, req.log);
      res.json({ photoUrl });
    } catch (error) {
      req.log.error({ err: error }, "Falha ao salvar foto do cliente");
      res.status(500).json({ error: "Falha ao salvar foto" });
    }
  },
);

// ── POST /client-photo/admin-upload/:id (equipe — requireCollaborator) ───────
router.post(
  "/client-photo/admin-upload/:id",
  requireCollaborator,
  async (req: Request, res: Response): Promise<void> => {
    if (!(await runPhotoUpload(req, res))) return;
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) { res.status(400).json({ error: "id inválido" }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ error: "Arquivo não enviado" }); return; }
    const ext = ALLOWED_IMAGE_TYPES[file.mimetype];
    if (!ext) { res.status(400).json({ error: "Formato de imagem não aceito" }); return; }
    if (file.size === 0) { res.status(400).json({ error: "Imagem vazia — envie um arquivo com conteúdo." }); return; }
    // Nota: assertSquare NÃO é aplicado aqui — a equipe pode enviar fotos de perfil
    // em qualquer proporção (retrato, quadrado). A validação 1:1 existe apenas na
    // rota pública /upload onde o cliente edita a foto pelo celular.

    const [client] = await db
      .select({
        id: clientsTable.id,
        name: clientsTable.name,
        cpf: clientsTable.cpf,
        photoUrl: clientsTable.photoUrl,
      })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

    try {
      // Backup aguardado (fail-safe interno — não lança exceção)
      if (client.photoUrl) {
        await backupFotoAnterior(clientId, client.photoUrl, client.name, client.cpf ?? "", req.log);
      }

      const relativePath = `uploads/photos/${clientId}-${randomUUID()}.${ext}`;
      await objectStorageService.saveUploadObject(relativePath, file.buffer, file.mimetype);
      const photoUrl = `/api/storage/objects/${relativePath}`;
      await db.update(clientsTable).set({ photoUrl }).where(eq(clientsTable.id, clientId));
      // Drive/FOTO PERFIL + notificação ao médico (fire-and-forget — fail-safe interno)
      void afterPhotoSaved(clientId, client.name, client.cpf ?? "", file.buffer, file.mimetype, req.log);
      res.json({ photoUrl });
    } catch (error) {
      req.log.error({ err: error }, "Falha ao salvar foto (admin)");
      res.status(500).json({ error: "Falha ao salvar foto" });
    }
  },
);

// ── GET /client-photo/history/:clientId (equipe — requireCollaborator) ────────
router.get(
  "/client-photo/history/:clientId",
  requireCollaborator,
  async (req: Request, res: Response): Promise<void> => {
    const clientId = Number(req.params.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      res.status(400).json({ error: "clientId inválido" });
      return;
    }
    try {
      const rows = await db.execute(sql`
        SELECT id, client_id, photo_url, created_at
        FROM client_photo_history
        WHERE client_id = ${clientId}
        ORDER BY created_at DESC
        LIMIT 50
      `);
      const photos = (rows.rows as Array<{ id: number; photo_url: string; created_at: string }>).map((r) => ({
        id: r.id,
        photoUrl: r.photo_url,
        createdAt: r.created_at,
      }));
      res.json(photos);
    } catch (err) {
      req.log.error({ err }, "Falha ao buscar histórico de fotos");
      res.status(500).json({ error: "Falha ao buscar histórico" });
    }
  },
);

export default router;
