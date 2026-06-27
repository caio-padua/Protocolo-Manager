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

function buildPhotoEmailHTML(clientName: string, link: string, baseUrl: string): string {
  const firstName = clientName.split(" ")[0] || clientName;
  // Marca PAXTER na "parte escura da skill": fundo navy com o WORDMARK OFICIAL (arte PNG
  // servida pelo app), nunca o nome digitado à mão. E-mail não renderiza o SVG/glint da
  // FONTE ÚNICA, então usamos a mesma arte oficial (URL absoluta) sobre o navy.
  const wordmarkSrc = `${baseUrl}/brand/paxter-wordmark.png`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background:#070d1c; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070d1c; padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:#0d1830; border:1px solid rgba(200,160,90,.35); border-radius:14px; overflow:hidden; box-shadow:0 14px 40px rgba(0,0,0,.55);">
        <tr><td style="background:linear-gradient(160deg,#0f1d3a 0%,#0a1428 60%,#0d1830 100%); padding:34px 32px 28px; text-align:center; border-bottom:1px solid rgba(200,160,90,.28);">
          <img src="${wordmarkSrc}" width="190" alt="PAXTER" style="display:block; margin:0 auto; width:190px; max-width:80%; height:auto;">
          <div style="color:#cdb985; font-size:11px; letter-spacing:3px; text-transform:uppercase; margin-top:10px;">Clinical Intelligence System</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px; color:#f4ede0; font-size:18px; font-weight:600;">Olá, ${firstName}!</p>
          <p style="margin:0 0 22px; color:#c8d2e0; font-size:15px; line-height:1.6;">
            Para deixar o seu cadastro completo, precisamos de uma foto sua.
            É rápido: toque no botão abaixo e envie uma foto pelo próprio celular.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 24px;">
            <tr><td align="center" style="border-radius:10px; background:linear-gradient(135deg,#e6c878 0%,#c9a24f 100%); box-shadow:0 6px 16px rgba(201,162,79,.4);">
              <a href="${link}" style="display:inline-block; padding:15px 38px; color:#0a1428; font-size:16px; font-weight:700; letter-spacing:.5px; text-decoration:none;">Enviar minha foto</a>
            </td></tr>
          </table>
          <p style="margin:0; color:#8da0bb; font-size:12px; line-height:1.6;">
            Se o botão não funcionar, copie e cole este endereço no navegador:<br>
            <span style="color:#cdb985; word-break:break-all;">${link}</span>
          </p>
          <p style="margin:20px 0 0; color:#7e90ab; font-size:12px;">Este link é pessoal e expira em 7 dias.</p>
        </td></tr>
        <tr><td style="background:#0a1428; padding:18px 32px; text-align:center; color:#7e90ab; font-size:11px; letter-spacing:2px; text-transform:uppercase; border-top:1px solid rgba(200,160,90,.18);">
          Clinical Intelligence System
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
        html: buildPhotoEmailHTML(client.name, link, absoluteBaseUrl(req)),
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
