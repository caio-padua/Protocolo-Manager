import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createPhotoToken, verifyPhotoToken } from "../lib/portal-token.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { sendGmailMessage } from "../lib/google-gmail.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Upload em memoria (a foto e pequena; subimos o buffer direto ao Object
// Storage). Limite de 15 MB cobre foto de celular com folga.
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
});

// Roda o multer manualmente para transformar erro de upload (ex.: arquivo grande
// demais) em uma resposta 400 com mensagem clara, em vez de um erro genérico.
// Retorna true quando o arquivo foi recebido sem erro; false quando já respondeu.
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

// Tipos de imagem aceitos. Endurece o contrato no servidor (nao so na tela)
// para o upload publico nao virar porta de qualquer arquivo.
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

// Monta a URL publica do sistema (mesmo padrao do portal de exames): prioriza
// REPLIT_DOMAINS, cai para o dominio de dev e por fim para o host do request.
function absoluteBaseUrl(req: Request): string {
  const fromDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const host = fromDomains || process.env.REPLIT_DEV_DOMAIN || req.get("host") || "localhost";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

function buildPhotoEmailHTML(clientName: string, link: string): string {
  const firstName = clientName.split(" ")[0] || clientName;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background:#0b1220; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220; padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.25);">
        <tr><td style="background:linear-gradient(135deg,#0f2a3a,#13455a); padding:28px 32px; text-align:center;">
          <div style="color:#e9c46a; font-size:22px; letter-spacing:3px; font-weight:700;">PAXTER</div>
          <div style="color:#cfe8ef; font-size:12px; letter-spacing:1px; margin-top:4px;">Instituto Pádua</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px; color:#1e293b; font-size:18px;">Olá, ${firstName}!</p>
          <p style="margin:0 0 20px; color:#475569; font-size:15px; line-height:1.6;">
            Para deixar o seu cadastro completo, precisamos de uma foto sua.
            É rápido: toque no botão abaixo e envie uma foto pelo próprio celular.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 24px;">
            <tr><td align="center" style="border-radius:10px; background:linear-gradient(135deg,#13455a,#1d6f8b);">
              <a href="${link}" style="display:inline-block; padding:15px 36px; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none;">Enviar minha foto</a>
            </td></tr>
          </table>
          <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">
            Se o botão não funcionar, copie e cole este endereço no navegador:<br>
            <span style="color:#475569; word-break:break-all;">${link}</span>
          </p>
          <p style="margin:20px 0 0; color:#94a3b8; font-size:12px;">Este link é pessoal e expira em 7 dias.</p>
        </td></tr>
        <tr><td style="background:#f8fafc; padding:18px 32px; text-align:center; color:#94a3b8; font-size:11px;">
          Instituto Pádua — Protocolos Injetáveis
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * POST /client-photo/send-link/:id
 *
 * Gera um token de foto (HMAC, 7 dias) e envia ao cliente um e-mail responsivo
 * com o link da tela publica de envio. Acao do medico/equipe (admin). Devolve o
 * link para distribuicao manual (ex.: WhatsApp) mesmo quando ha e-mail.
 */
router.post("/client-photo/send-link/:id", async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id inválido" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const token = createPhotoToken(id);
  const link = `${absoluteBaseUrl(req)}/foto?token=${token}`;

  let emailSent = false;
  let emailError: string | undefined;
  if (client.email && client.email.trim()) {
    try {
      const result = await sendGmailMessage({
        to: client.email.trim(),
        subject: "Instituto Padua | Envie a sua foto de cadastro",
        html: buildPhotoEmailHTML(client.name, link),
      });
      emailSent = result.success;
      if (!result.success) emailError = result.error;
    } catch (error) {
      req.log.error({ err: error }, "Falha ao enviar e-mail de foto");
      emailError = "Falha ao enviar e-mail";
    }
  }

  res.json({ link, emailSent, emailError });
});

/**
 * GET /client-photo/info?token=...
 *
 * Usado pela tela publica para saudar o cliente pelo nome. So devolve dado
 * apos validar o token (posse do link), nunca por id cru — anti-IDOR.
 */
router.get("/client-photo/info", async (req: Request, res: Response): Promise<void> => {
  const token = String(req.query.token || "");
  const clientId = verifyPhotoToken(token);
  if (!clientId) {
    res.status(401).json({ error: "Link inválido ou expirado" });
    return;
  }
  const [client] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, photoUrl: clientsTable.photoUrl })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }
  res.json({ name: client.name, photoUrl: client.photoUrl ?? null });
});

/**
 * POST /client-photo/upload
 *
 * Recebe a foto (multipart) + token no corpo. Valida o token (posse do link),
 * sobe o arquivo ao Object Storage sob "uploads/photos/" (servivel pela rota
 * publica GET /storage/objects/uploads/*) e grava photoUrl no cliente.
 */
router.post(
  "/client-photo/upload",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await runPhotoUpload(req, res))) return;
    const token = String((req.body as Record<string, unknown>)?.token || req.query.token || "");
    const clientId = verifyPhotoToken(token);
    if (!clientId) {
      res.status(401).json({ error: "Link inválido ou expirado" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Arquivo não enviado" });
      return;
    }
    const ext = ALLOWED_IMAGE_TYPES[file.mimetype];
    if (!ext) {
      res.status(400).json({ error: "Formato de imagem não aceito" });
      return;
    }

    // Garante que o cliente ainda existe antes de gravar.
    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    try {
      const relativePath = `uploads/photos/${clientId}-${randomUUID()}.${ext}`;
      await objectStorageService.saveUploadObject(relativePath, file.buffer, file.mimetype);
      const photoUrl = `/api/storage/objects/${relativePath}`;
      await db.update(clientsTable).set({ photoUrl }).where(eq(clientsTable.id, clientId));
      res.json({ photoUrl });
    } catch (error) {
      req.log.error({ err: error }, "Falha ao salvar foto do cliente");
      res.status(500).json({ error: "Falha ao salvar foto" });
    }
  },
);

/**
 * POST /client-photo/admin-upload/:id
 *
 * Upload direto pela equipe (sem e-mail/token): o medico sobe a foto do
 * computador na propria tela de cadastro. Mesma API admin sem sessao do resto
 * do sistema (single-tenant atras de proxy). Grava photoUrl no cliente.
 */
router.post(
  "/client-photo/admin-upload/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await runPhotoUpload(req, res))) return;
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      res.status(400).json({ error: "id inválido" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Arquivo não enviado" });
      return;
    }
    const ext = ALLOWED_IMAGE_TYPES[file.mimetype];
    if (!ext) {
      res.status(400).json({ error: "Formato de imagem não aceito" });
      return;
    }

    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (!client) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    try {
      const relativePath = `uploads/photos/${clientId}-${randomUUID()}.${ext}`;
      await objectStorageService.saveUploadObject(relativePath, file.buffer, file.mimetype);
      const photoUrl = `/api/storage/objects/${relativePath}`;
      await db.update(clientsTable).set({ photoUrl }).where(eq(clientsTable.id, clientId));
      res.json({ photoUrl });
    } catch (error) {
      req.log.error({ err: error }, "Falha ao salvar foto (admin)");
      res.status(500).json({ error: "Falha ao salvar foto" });
    }
  },
);

export default router;
