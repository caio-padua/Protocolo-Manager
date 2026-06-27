import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createRegistrationToken,
  verifyRegistrationToken,
} from "../lib/portal-token.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { sendGmailMessage } from "../lib/google-gmail.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
});

// Roda o multer manualmente (cadastro envia multipart: campos de texto + foto
// opcional). Transforma erro de upload (ex.: arquivo grande) em 400 com mensagem
// clara. Retorna true quando recebeu sem erro; false quando já respondeu.
function runUpload(req: Request, res: Response): Promise<boolean> {
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

/**
 * E-mail Hermes do CADASTRO. Estrutura idêntica ao e-mail de foto (símbolo de
 * vidro + wordmark PAXTER + frase em inglês + botão dourado bulletproof). Regra
 * do CEO: cada frase que termina em ponto final começa em SEU PRÓPRIO parágrafo.
 */
function buildRegistrationEmailHTML(clientName: string, link: string, baseUrl: string): string {
  const firstName = clientName.split(" ")[0] || clientName;
  const symbolSrc = `${baseUrl}/brand/paxter-symbol.png`;
  const wordmarkSrc = `${baseUrl}/brand/paxter-wordmark.png`;
  const serif = "Georgia,'Times New Roman',Times,serif";
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const para = "margin:0 0 14px; color:#c2cee0; font-size:15px; line-height:1.7;";
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
          <div style="color:#f3ead6; font-family:${serif}; font-size:30px; line-height:1.25; font-weight:400;">Complete o seu cadastro.</div>
        </td></tr>

        <tr><td style="padding:18px 40px 4px; text-align:center;">
          <p style="${para}">Para começarmos o seu acompanhamento, toque no botão abaixo e preencha o seu cadastro pelo próprio celular.</p>
          <p style="${para}">Você pode preencher falando: cada campo tem um microfone.</p>
          <p style="margin:0; color:#c2cee0; font-size:15px; line-height:1.7;">No final, basta enviar uma foto do rosto.</p>
        </td></tr>

        <tr><td align="center" style="padding:30px 40px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td align="center" bgcolor="#d4ad5c" style="border-radius:12px; background:linear-gradient(135deg,#f0d488 0%,#d4ad5c 48%,#b88a3f 100%); box-shadow:0 10px 24px rgba(184,138,63,.45);">
              <a href="${link}" style="display:inline-block; padding:17px 46px; color:#0a162e; font-family:${serif}; font-size:15px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-decoration:none;">Completar meu cadastro</a>
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
 * POST /client-registration/send-link/:id
 *
 * Gera um token de CADASTRO (HMAC, 7 dias) e envia ao cliente o e-mail Hermes
 * com o link da tela pública de cadastro completo. Ação do médico/equipe (admin).
 */
router.post("/client-registration/send-link/:id", async (req: Request, res: Response): Promise<void> => {
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

  const token = createRegistrationToken(id);
  const link = `${absoluteBaseUrl(req)}/cadastro?token=${token}`;

  let emailSent = false;
  let emailError: string | undefined;
  if (client.email && client.email.trim()) {
    try {
      const result = await sendGmailMessage({
        to: client.email.trim(),
        subject: "Instituto Padua | Complete o seu cadastro",
        html: buildRegistrationEmailHTML(client.name, link, absoluteBaseUrl(req)),
      });
      emailSent = result.success;
      if (!result.success) emailError = result.error;
    } catch (error) {
      req.log.error({ err: error }, "Falha ao enviar e-mail de cadastro");
      emailError = "Falha ao enviar e-mail";
    }
  }

  res.json({ link, emailSent, emailError });
});

/**
 * GET /client-registration/info?token=...
 *
 * Tela pública usa para PRÉ-PREENCHER o formulário com o que já existe. Só
 * devolve dado após validar o token (posse do link) — anti-IDOR.
 */
router.get("/client-registration/info", async (req: Request, res: Response): Promise<void> => {
  const token = String(req.query.token || "");
  const clientId = verifyRegistrationToken(token);
  if (!clientId) {
    res.status(401).json({ error: "Link inválido ou expirado" });
    return;
  }
  const [client] = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      cpf: clientsTable.cpf,
      email: clientsTable.email,
      phone: clientsTable.phone,
      birthDate: clientsTable.birthDate,
      address: clientsTable.address,
      pais: clientsTable.pais,
      instagram: clientsTable.instagram,
      comoConheceu: clientsTable.comoConheceu,
      locationId: clientsTable.locationId,
      photoUrl: clientsTable.photoUrl,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }
  res.json(client);
});

// Pega um campo de texto do corpo multipart e devolve string aparada, ou
// undefined quando vazio (para não sobrescrever dado existente com vazio).
function field(body: Record<string, unknown>, key: string): string | undefined {
  const v = body?.[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * POST /client-registration/submit
 *
 * Recebe o cadastro completo (multipart: campos de texto + foto opcional) + token.
 * Valida token (posse do link) e os obrigatórios no servidor (não confia só na
 * tela). Sobe a foto ao Object Storage se vier. Atualiza o cliente.
 */
router.post(
  "/client-registration/submit",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await runUpload(req, res))) return;
    const body = (req.body as Record<string, unknown>) || {};
    const token = String(body.token || req.query.token || "");
    const clientId = verifyRegistrationToken(token);
    if (!clientId) {
      res.status(401).json({ error: "Link inválido ou expirado" });
      return;
    }

    const [exists] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    if (!exists) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }

    // Obrigatórios (seleção do CEO): nome, data de nascimento, CPF, e-mail, celular.
    const name = field(body, "name");
    const birthDate = field(body, "birthDate");
    const cpf = field(body, "cpf");
    const email = field(body, "email");
    const phone = field(body, "phone");
    const missing: string[] = [];
    if (!name) missing.push("nome");
    if (!birthDate) missing.push("data de nascimento");
    if (!cpf) missing.push("CPF");
    if (!email) missing.push("e-mail");
    if (!phone) missing.push("celular");
    if (missing.length) {
      res.status(400).json({ error: `Preencha os campos obrigatórios: ${missing.join(", ")}.` });
      return;
    }

    // Monta o conjunto a gravar. Só inclui o que veio preenchido (não apaga dado
    // existente com vazio). Obrigatórios sempre presentes aqui.
    const updates: Record<string, unknown> = {
      name,
      birthDate,
      cpf,
      email,
      phone,
    };
    const address = field(body, "address");
    if (address !== undefined) updates.address = address;
    const pais = field(body, "pais");
    if (pais !== undefined) updates.pais = pais;
    const instagram = field(body, "instagram");
    if (instagram !== undefined) updates.instagram = instagram;
    const comoConheceu = field(body, "comoConheceu");
    if (comoConheceu !== undefined) updates.comoConheceu = comoConheceu;
    const locationIdRaw = field(body, "locationId");
    if (locationIdRaw !== undefined && Number.isInteger(Number(locationIdRaw))) {
      updates.locationId = Number(locationIdRaw);
    }

    // Foto opcional.
    const file = req.file;
    let photoUrl: string | undefined;
    if (file) {
      const ext = ALLOWED_IMAGE_TYPES[file.mimetype];
      if (!ext) {
        res.status(400).json({ error: "Formato de imagem não aceito" });
        return;
      }
      try {
        const relativePath = `uploads/photos/${clientId}-${randomUUID()}.${ext}`;
        await objectStorageService.saveUploadObject(relativePath, file.buffer, file.mimetype);
        photoUrl = `/api/storage/objects/${relativePath}`;
        updates.photoUrl = photoUrl;
      } catch (error) {
        req.log.error({ err: error }, "Falha ao salvar foto do cadastro");
        res.status(500).json({ error: "Falha ao salvar foto" });
        return;
      }
    }

    try {
      await db.update(clientsTable).set(updates).where(eq(clientsTable.id, clientId));
      res.json({ ok: true, photoUrl: photoUrl ?? null });
    } catch (error) {
      req.log.error({ err: error }, "Falha ao salvar cadastro do cliente");
      res.status(500).json({ error: "Falha ao salvar cadastro" });
    }
  },
);

export default router;
