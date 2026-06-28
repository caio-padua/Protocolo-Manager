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
import { enviarMensagemPaxter, type PaxterDoc } from "../lib/messaging/index.js";
import { ai } from "@workspace/integrations-gemini-ai";

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
 * Documento Paxter do CADASTRO. A marca (casco Hermes navy/ouro) é vestida pelo
 * Motor Único — esta rota só descreve o CONTEÚDO (Art. 57/66).
 */
function docCadastro(clientName: string, link: string): PaxterDoc {
  const firstName = clientName.split(" ")[0] || clientName;
  return {
    eyebrow: `Olá, ${firstName}`,
    titulo: "Complete o seu cadastro.",
    paragrafos: [
      "Para começarmos o seu acompanhamento, toque no botão abaixo e preencha o seu cadastro pelo próprio celular.",
      "Você pode preencher falando: cada campo tem um microfone.",
      "No final, basta enviar uma foto do rosto.",
    ],
    botao: { label: "Completar meu cadastro", url: link },
    notaRodape: "Link pessoal — expira em 7 dias.",
    assunto: "Instituto Padua | Complete o seu cadastro",
  };
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

  // Envio pelo Motor Único (canal e-mail). A marca é vestida pelo motor.
  const envio = await enviarMensagemPaxter(
    docCadastro(client.name, link),
    { email: client.email ?? null, nome: client.name },
    ["EMAIL"],
    { baseUrl: absoluteBaseUrl(req) },
  );
  const r0 = envio.resultados[0];
  const emailSent = r0?.sent ?? false;
  const emailError = r0 && !r0.sent ? r0.error : undefined;

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

/** Tira cercas ```json de uma resposta do Gemini, se houver. */
function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return trimmed;
}

const DOCUMENT_SCAN_PROMPT = `Você é um leitor de documentos de identidade brasileiros (RG, CNH, CIN ou CPF).
Receberá a FOTO de um documento. Extraia SOMENTE os dados do TITULAR do documento, em JSON estrito.

REGRAS:
1. "name": nome completo do titular, exatamente como impresso (sem abreviar). Se ilegível ou ausente, null.
2. "cpf": número do CPF do titular, apenas os 11 dígitos (sem pontos ou traço). Se ausente, null.
   - No RG o CPF costuma vir junto do nome/filiação; na CNH vem no campo "CPF".
3. "birthDate": data de nascimento do titular no formato DD/MM/AAAA. Se ausente, null.
   - Procure "Data de Nascimento", "DATA NASC", "Nascimento" ou similar.
4. NÃO invente dados. Se não tiver certeza de um campo, use null.
5. NÃO inclua nome de pai/mãe (filiação), número do RG, nem qualquer outro campo.

Responda SOMENTE com o objeto JSON {"name":...,"cpf":...,"birthDate":...}, sem comentários, sem markdown.`;

/**
 * POST /client-registration/scan-document
 *
 * Preenchimento rápido por IA: recebe a FOTO de um documento (RG/CNH) + token de
 * cadastro (anti-IDOR). Manda a imagem ao Gemini e devolve { name, cpf, birthDate }
 * para a tela preencher. A imagem NÃO é gravada (nem no banco, nem no Object
 * Storage): vai ao Gemini e é descartada.
 */
router.post(
  "/client-registration/scan-document",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await runUpload(req, res))) return;
    const body = (req.body as Record<string, unknown>) || {};
    const token = String(body.token || req.query.token || "");
    const clientId = verifyRegistrationToken(token);
    if (!clientId) {
      res.status(401).json({ error: "Link inválido ou expirado" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Envie uma foto do documento." });
      return;
    }
    if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
      res.status(400).json({ error: "Formato de imagem não aceito." });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: file.mimetype, data: file.buffer.toString("base64") } },
              { text: DOCUMENT_SCAN_PROMPT },
            ],
          },
        ],
        config: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 8192 },
      });

      const raw = response.text ?? "";
      if (!raw.trim()) {
        res.status(502).json({ error: "Não foi possível ler o documento. Tente outra foto." });
        return;
      }

      let parsed: { name?: unknown; cpf?: unknown; birthDate?: unknown };
      try {
        parsed = JSON.parse(stripJsonFences(raw));
      } catch {
        res.status(502).json({ error: "Não foi possível ler o documento. Tente outra foto." });
        return;
      }

      const cleanStr = (v: unknown): string | null =>
        typeof v === "string" && v.trim().length ? v.trim() : null;
      const cpfDigits = cleanStr(parsed.cpf)?.replace(/\D/g, "") ?? null;

      res.json({
        name: cleanStr(parsed.name),
        cpf: cpfDigits && cpfDigits.length === 11 ? cpfDigits : null,
        birthDate: cleanStr(parsed.birthDate),
      });
    } catch (error) {
      req.log.error({ err: error }, "Falha ao ler documento por IA");
      res.status(500).json({ error: "Falha ao ler o documento. Tente novamente." });
    }
  },
);

export default router;
