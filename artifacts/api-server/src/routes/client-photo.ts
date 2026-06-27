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
  // Marca PAXTER pela ARTE OFICIAL (skill skill-layout-paxter), nunca nome digitado à mão.
  // E-mail não roda o SVG/glint da fonte única, então usamos as mesmas PNGs oficiais sobre
  // o navy: o SÍMBOLO DE VIDRO (medalhão dourado, fundo escuro embutido que se funde no
  // navy) e o WORDMARK PAXTER com brilho. Layout Hermes (clássico, espaçado, fios de ouro)
  // e ritmo TDAH: UMA frase de chamada grande, depois UM parágrafo curto.
  const symbolSrc = `${baseUrl}/brand/paxter-symbol.png`;
  const wordmarkSrc = `${baseUrl}/brand/paxter-wordmark.png`;
  const serif = "Georgia,'Times New Roman',Times,serif";
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0; padding:0; background:#05080f; font-family:${sans};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05080f; padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px; background:#0b1426; border:1px solid rgba(201,162,79,.30); border-radius:18px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,.6);">

        <tr><td style="background:linear-gradient(170deg,#102043 0%,#0a162e 55%,#0b1426 100%); padding:40px 32px 30px; text-align:center;">
          <img src="${symbolSrc}" width="84" alt="" style="display:block; margin:0 auto 18px; width:84px; height:auto; border:1px solid rgba(201,162,79,.45); border-radius:18px; box-shadow:0 8px 22px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset;">
          <img src="${wordmarkSrc}" width="196" alt="PAXTER" style="display:block; margin:0 auto; width:196px; max-width:74%; height:auto;">
          <div style="color:#c9a24f; font-family:${serif}; font-size:11px; letter-spacing:5px; text-transform:uppercase; margin-top:12px;">Clinical Intelligence System</div>
        </td></tr>

        <tr><td style="padding:0 32px;"><div style="height:1px; background:linear-gradient(90deg,rgba(201,162,79,0) 0%,rgba(201,162,79,.6) 50%,rgba(201,162,79,0) 100%);"></div></td></tr>

        <tr><td style="padding:36px 40px 8px; text-align:center;">
          <div style="color:#c9a24f; font-size:12px; letter-spacing:3px; text-transform:uppercase; margin-bottom:14px;">Olá, ${firstName}</div>
          <div style="color:#f3ead6; font-family:${serif}; font-size:30px; line-height:1.25; font-weight:400;">Falta só a sua foto.</div>
        </td></tr>

        <tr><td style="padding:18px 40px 4px; text-align:center;">
          <p style="margin:0; color:#c2cee0; font-size:15px; line-height:1.7;">
            Para concluir o seu cadastro, toque no botão abaixo e envie uma foto do rosto pelo próprio celular. Leva menos de um minuto — bem iluminado e sem óculos escuros.
          </p>
        </td></tr>

        <tr><td align="center" style="padding:30px 40px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td align="center" bgcolor="#d4ad5c" style="border-radius:12px; background:linear-gradient(135deg,#f0d488 0%,#d4ad5c 48%,#b88a3f 100%); box-shadow:0 10px 24px rgba(184,138,63,.45);">
              <a href="${link}" style="display:inline-block; padding:17px 46px; color:#0a162e; font-family:${serif}; font-size:15px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-decoration:none;">Enviar minha foto</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:22px 40px 0; text-align:center;">
          <p style="margin:0; color:#7e90ab; font-size:12px; line-height:1.6;">
            Se o botão não abrir, copie e cole este endereço:<br>
            <span style="color:#c9a24f; word-break:break-all;">${link}</span>
          </p>
          <p style="margin:16px 0 36px; color:#62748f; font-size:11px;">Link pessoal — expira em 7 dias.</p>
        </td></tr>

        <tr><td style="background:#070f1f; padding:18px 32px; text-align:center; color:#62748f; font-family:${serif}; font-size:10px; letter-spacing:3px; text-transform:uppercase; border-top:1px solid rgba(201,162,79,.16);">
          Paxter — Clinical Intelligence System
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
