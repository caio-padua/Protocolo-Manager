import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createPhotoToken, verifyPhotoToken } from "../lib/portal-token.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { enviarMensagemPaxter, type PaxterDoc } from "../lib/messaging/index.js";

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

/**
 * Documento Paxter da FOTO de cadastro. A marca (casco Hermes navy/ouro) é
 * vestida pelo Motor Único — esta rota só descreve o CONTEÚDO (Art. 57/66).
 */
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
  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const token = createPhotoToken(id);
  const link = `${absoluteBaseUrl(req)}/foto?token=${token}`;

  // Envio pelo Motor Único — todos os canais disponíveis (e-mail, WhatsApp,
  // Telegram). O motor pula silenciosamente os canais sem destino configurado.
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
