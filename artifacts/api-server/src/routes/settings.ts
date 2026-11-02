import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import jpeg from "jpeg-js";
import {
  UpdateCompanySettingsBody,
  UpdateClinicsSettingsBody,
  UpdatePaymentGatewaySettingsBody,
  UpdateESignatureSettingsBody,
} from "@workspace/api-zod";
import { db, professionalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  normalizeMatriz,
  permissoesDefault,
  PAPEIS,
  GRUPOS,
  type Matriz,
} from "@workspace/governanca";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError } from "../lib/clinical-emitter";
import { inspectPrescriptionCertificate } from "../lib/prescription-signing";
import { getTelegramBotInfo, setTelegramBotName } from "../lib/telegram";
import {
  getJsonSetting,
  setJsonSetting,
  getSetting,
  setSetting,
  getSecretStatus,
  setSecret,
} from "../lib/secure-settings";
import {
  getCertificateStatus,
  saveCertificate,
  validatePfx,
  refreshCertCache,
} from "../lib/cert-source";

// ===========================================================================
// CONFIGURACOES (anti-hardcode) — tudo que antes vivia cravado no codigo agora
// e editavel aqui: dados da empresa, clinicas, certificado A1, assinatura
// eletronica (ZapSign) e porta de pagamento (Asaas). Segredos vao para o cofre
// cifrado; nao-sensiveis para app_settings. TODA rota exige requireCollaborator.
// ===========================================================================

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // .pfx e pequeno; 5MB sobra
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    const ok = name.endsWith(".pfx") || name.endsWith(".p12");
    if (!ok) {
      cb(new MulterError("LIMIT_UNEXPECTED_FILE", "file"));
      return;
    }
    cb(null, true);
  },
});

const doctorPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    const validName = name.endsWith(".jpg") || name.endsWith(".jpeg");
    const validMime = file.mimetype === "image/jpeg";
    const valid = validName && validMime;
    if (!valid) {
      cb(new MulterError("LIMIT_UNEXPECTED_FILE", "file"));
      return;
    }
    cb(null, true);
  },
});

function doctorPhotoUploadMw(req: Request, res: Response, next: NextFunction): void {
  doctorPhotoUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "Imagem maior que 5 MB. Envie um JPEG menor."
        : "Arquivo inválido. Envie uma imagem JPEG (.jpg ou .jpeg).";
      res.status(400).json({ error: msg });
      return;
    }
    if (err) {
      res.status(400).json({ error: "Falha no envio da imagem." });
      return;
    }
    next();
  });
}

function doctorPhotoPath(): string {
  const assetDirs = [
    path.resolve(import.meta.dirname, "../assets"),
    path.resolve(import.meta.dirname, "../../assets"),
    path.resolve(process.cwd(), "assets"),
  ];
  const assetsDir = assetDirs.find((candidate) => fs.existsSync(candidate));
  if (!assetsDir) {
    throw new Error("Diretório de assets do servidor não encontrado.");
  }
  return path.join(assetsDir, "dr-caio-photo.jpg");
}

// Traduz erros do multer (tamanho/tipo de arquivo) em 400 com mensagem clara,
// em vez de cair no handler genérico de 500.
function certUploadMw(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Arquivo maior que 5 MB. Envie um .pfx/.p12 menor."
          : err.code === "LIMIT_UNEXPECTED_FILE"
            ? "Arquivo invalido. Envie um certificado .pfx ou .p12."
            : "Falha no envio do arquivo.";
      res.status(400).json({ error: msg });
      return;
    }
    if (err) {
      res.status(400).json({ error: "Falha no envio do arquivo." });
      return;
    }
    next();
  });
}

const DEFAULT_ASAAS_BASE_URL = "https://api.asaas.com/v3";

function actor(req: Parameters<Parameters<IRouter["get"]>[1]>[0]): string | undefined {
  const c = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
  return c ? `${c.role ?? "?"}:${c.professionalId ?? "?"}` : undefined;
}

// ------------------------------------------------ FOTO DA CAPA DO PROTOCOLO ---
router.get("/settings/doctor-photo", requireCollaborator, async (_req, res): Promise<void> => {
  const photoPath = doctorPhotoPath();
  try {
    await fs.promises.access(photoPath, fs.constants.R_OK);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(photoPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: "Foto do médico ainda não cadastrada." });
      return;
    }
    throw error;
  }
});

router.post(
  "/settings/doctor-photo",
  requireCollaborator,
  doctorPhotoUploadMw,
  async (req, res): Promise<void> => {
    const actorId = req.collaborator!.professionalId;
    const [authenticatedProfessional] = await db
      .select({ isPrimaryDoctor: professionalsTable.isPrimaryDoctor })
      .from(professionalsTable)
      .where(eq(professionalsTable.id, actorId))
      .limit(1);
    if (!authenticatedProfessional?.isPrimaryDoctor) {
      res.status(403).json({ error: "Apenas o médico principal pode alterar a foto da capa." });
      return;
    }

    const file = req.file;
    if (!file || file.size === 0 || file.buffer.length === 0) {
      res.status(400).json({ error: "Envie uma imagem JPEG não vazia no campo 'file'." });
      return;
    }

    let normalizedJpeg: Buffer;
    try {
      const image = jpeg.decode(file.buffer, {
        useTArray: true,
        maxMemoryUsageInMB: 128,
        maxResolutionInMP: 64,
      });
      if (
        !Number.isInteger(image.width)
        || !Number.isInteger(image.height)
        || image.width < 1
        || image.height < 1
        || image.width > 8_000
        || image.height > 8_000
      ) {
        res.status(400).json({ error: "A imagem deve ter dimensões entre 1 e 8.000 pixels." });
        return;
      }
      normalizedJpeg = jpeg.encode(
        { data: image.data, width: image.width, height: image.height },
        92,
      ).data;
    } catch {
      res.status(400).json({ error: "O arquivo não contém uma imagem JPEG válida." });
      return;
    }

    const target = doctorPhotoPath();
    const temporary = `${target}.${randomUUID()}.tmp`;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.promises.writeFile(temporary, normalizedJpeg, { flag: "wx" });
      await fs.promises.rename(temporary, target);
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }

    req.log.info(
      { receivedBytes: file.size, storedBytes: normalizedJpeg.length, actor: actor(req) },
      "Foto do médico da capa atualizada",
    );
    res.status(200).json({ updated: true });
  },
);

// ---------------------------------------------------------------- EMPRESA ----
router.get("/settings/company", requireCollaborator, async (_req, res): Promise<void> => {
  const data = (await getJsonSetting<Record<string, unknown>>("company")) ?? {};
  res.json(data);
});

router.put("/settings/company", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = UpdateCompanySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  await setJsonSetting("company", parsed.data);
  res.json(parsed.data);
});

// ---------------------------------------------------------------- CLINICAS ---
router.get("/settings/clinics", requireCollaborator, async (_req, res): Promise<void> => {
  const data = (await getJsonSetting<{ clinics: unknown[] }>("clinics")) ?? { clinics: [] };
  res.json(data);
});

router.put("/settings/clinics", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = UpdateClinicsSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  await setJsonSetting("clinics", parsed.data);
  res.json(parsed.data);
});

// ------------------------------------------------------- PORTA DE PAGAMENTO ---
async function paymentGatewayPayload(): Promise<unknown> {
  const baseUrl =
    (await getSetting("asaas.baseUrl")) || process.env.ASAAS_BASE_URL || DEFAULT_ASAAS_BASE_URL;
  const [apiKeyStatus, webhookTokenStatus] = await Promise.all([
    getSecretStatus("asaas.apiKey"),
    getSecretStatus("asaas.webhookToken"),
  ]);
  return { provider: "asaas", baseUrl, apiKeyStatus, webhookTokenStatus };
}

router.get("/settings/payment-gateway", requireCollaborator, async (_req, res): Promise<void> => {
  res.json(await paymentGatewayPayload());
});

router.put("/settings/payment-gateway", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = UpdatePaymentGatewaySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  const { baseUrl, apiKey, webhookToken } = parsed.data;
  if (typeof baseUrl === "string" && baseUrl.trim()) await setSetting("asaas.baseUrl", baseUrl.trim());
  if (typeof apiKey === "string" && apiKey.trim()) await setSecret("asaas.apiKey", apiKey.trim(), actor(req));
  if (typeof webhookToken === "string" && webhookToken.trim())
    await setSecret("asaas.webhookToken", webhookToken.trim(), actor(req));
  res.json(await paymentGatewayPayload());
});

// -------------------------------------------------- ASSINATURA ELETRONICA ----
async function esignaturePayload(): Promise<unknown> {
  const activeRaw = await getSetting("zapsign.active");
  const tokenStatus = await getSecretStatus("zapsign.token");
  return { provider: "zapsign", active: activeRaw === "true", tokenStatus };
}

router.get("/settings/esignature", requireCollaborator, async (_req, res): Promise<void> => {
  res.json(await esignaturePayload());
});

router.put("/settings/esignature", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = UpdateESignatureSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  const { active, token } = parsed.data;
  if (typeof active === "boolean") await setSetting("zapsign.active", active ? "true" : "false");
  if (typeof token === "string" && token.trim()) await setSecret("zapsign.token", token.trim(), actor(req));
  res.json(await esignaturePayload());
});

// ----------------------------------------------------------------- TELEGRAM ---
// Token do bot vai para o COFRE cifrado (telegram.botToken). Status devolve
// apenas {isSet, masked}; NUNCA o valor. Sem token => canal opera em MOCK.
async function telegramPayload(): Promise<unknown> {
  const activeRaw = await getSetting("telegram.active");
  const tokenStatus = await getSecretStatus("telegram.botToken");
  const webhookSecretStatus = await getSecretStatus("telegram.webhookSecret");
  return { provider: "telegram", active: activeRaw === "true", tokenStatus, webhookSecretStatus };
}

router.get("/settings/telegram", requireCollaborator, async (_req, res): Promise<void> => {
  res.json(await telegramPayload());
});

router.put("/settings/telegram", requireCollaborator, async (req, res): Promise<void> => {
  const active = req.body?.active;
  const token = req.body?.token;
  const webhookSecret = req.body?.webhookSecret;
  if (active !== undefined && typeof active !== "boolean") {
    res.status(400).json({ error: "active deve ser booleano" });
    return;
  }
  if (token !== undefined && typeof token !== "string") {
    res.status(400).json({ error: "token deve ser texto" });
    return;
  }
  if (webhookSecret !== undefined && typeof webhookSecret !== "string") {
    res.status(400).json({ error: "webhookSecret deve ser texto" });
    return;
  }
  if (typeof active === "boolean") await setSetting("telegram.active", active ? "true" : "false");
  if (typeof token === "string" && token.trim()) await setSecret("telegram.botToken", token.trim(), actor(req));
  if (typeof webhookSecret === "string" && webhookSecret.trim())
    await setSecret("telegram.webhookSecret", webhookSecret.trim(), actor(req));
  res.json(await telegramPayload());
});

// GET /settings/telegram/bot-info — público (retorna nome/username do bot via getMe)
// Usado pela tela de Comunicação Digital sem exigir login de colaborador.
router.get("/settings/telegram/bot-info", async (_req, res): Promise<void> => {
  res.json(await getTelegramBotInfo());
});

// POST /settings/telegram/set-name — bidirecional: o que o CEO muda na tela
// reflete no Telegram via setMyName. Exige colaborador para proteger a operação.
router.post("/settings/telegram/set-name", requireCollaborator, async (req, res): Promise<void> => {
  const { name } = (req.body ?? {}) as { name?: string };
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name obrigatório" });
    return;
  }
  res.json(await setTelegramBotName(name.trim()));
});

// ------------------------------------------------------------------ STRIPE ---
// Chave secreta do Stripe (pagamento internacional) vai para o COFRE cifrado
// (stripe.secretKey). Status devolve apenas {isSet, masked}; NUNCA o valor.
async function stripePayload(): Promise<unknown> {
  const activeRaw = await getSetting("stripe.active");
  const secretKeyStatus = await getSecretStatus("stripe.secretKey");
  return { provider: "stripe", active: activeRaw === "true", secretKeyStatus };
}

router.get("/settings/stripe", requireCollaborator, async (_req, res): Promise<void> => {
  res.json(await stripePayload());
});

router.put("/settings/stripe", requireCollaborator, async (req, res): Promise<void> => {
  const active = req.body?.active;
  const secretKey = req.body?.secretKey;
  if (active !== undefined && typeof active !== "boolean") {
    res.status(400).json({ error: "active deve ser booleano" });
    return;
  }
  if (secretKey !== undefined && typeof secretKey !== "string") {
    res.status(400).json({ error: "secretKey deve ser texto" });
    return;
  }
  if (typeof active === "boolean") await setSetting("stripe.active", active ? "true" : "false");
  if (typeof secretKey === "string" && secretKey.trim())
    await setSecret("stripe.secretKey", secretKey.trim(), actor(req));
  res.json(await stripePayload());
});

// ------------------------------------------------------------- CERTIFICADO ---
router.get("/settings/certificate", requireCollaborator, async (req, res): Promise<void> => {
  res.json(await getCertificateStatus(req.collaborator!.professionalId));
});

// Upload do .pfx (multipart): campo "file" + "password" (+ opcional "cpf").
router.post(
  "/settings/certificate",
  requireCollaborator,
  certUploadMw,
  async (req, res): Promise<void> => {
    const file = req.file;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!file || !file.buffer?.length) {
      res.status(400).json({ error: "Arquivo .pfx ausente." });
      return;
    }
    if (!password) {
      res.status(400).json({ error: "Senha do certificado ausente." });
      return;
    }
    const check = validatePfx(file.buffer, password);
    if (!check.ok) {
      res.status(400).json({ error: "Nao foi possivel abrir o certificado com a senha informada." });
      return;
    }
    const professionalId = req.collaborator!.professionalId;
    const [professional] = await db.select().from(professionalsTable)
      .where(eq(professionalsTable.id, professionalId)).limit(1);
    if (!professional?.active || professional.professionalType !== "medico") {
      res.status(403).json({ error: "Somente o médico ativo pode cadastrar seu certificado." }); return;
    }
    try {
      const meta = inspectPrescriptionCertificate(file.buffer, password, professional.cpf);
      await saveCertificate(file.buffer, file.originalname || "certificado.pfx", password, meta.cpf, actor(req), professionalId);
      res.json(await getCertificateStatus(professionalId));
    } catch (err) {
      if (err instanceof ClinicalIdentityError) { res.status(err.status).json({ error: err.message }); return; }
      throw err;
    }
  },
);

// ------------------------------------------------- EXAMES (validacao humana) ---
// Toggle global "liberar validacoes": quando LIGADO (padrao), a Evolucao do
// cliente so mostra resultados de documentos CONFERIDOS por humano. Quando
// DESLIGADO, a Evolucao mostra tudo que ja foi lido pela IA (menos processando/
// erro). Guardado em app_settings (nao-sensivel). Chave: exames.exigirValidacaoHumana.
interface ExamesConfig {
  exigirValidacaoHumana: boolean;
  triagemAtiva: boolean;
  autoCriarDescoberto: boolean;
  autoAbsorverApelidoAltaConfianca: boolean;
  // Motor Multi-IA: cada flag ativa o respectivo provedor na cadeia de extração.
  // Gemini = provedor primário (default true). Claude/OpenAI = encadeados opcionalmente.
  llmGeminiAtivo: boolean;
  llmClaudeAtivo: boolean;
  llmOpenaiAtivo: boolean;
}

// Cada chave ausente => padrao SEGURO/ligado (true) para os existentes;
// novos LLMs secundários default FALSE (nao ativar sem config explícita).
async function examesPayload(): Promise<ExamesConfig> {
  const [ev, ta, ac, aa, lg, lc, lo] = await Promise.all([
    getSetting("exames.exigirValidacaoHumana"),
    getSetting("exames.triagemAtiva"),
    getSetting("exames.autoCriarDescoberto"),
    getSetting("exames.autoAbsorverApelidoAltaConfianca"),
    getSetting("exames.llmGeminiAtivo"),
    getSetting("exames.llmClaudeAtivo"),
    getSetting("exames.llmOpenaiAtivo"),
  ]);
  return {
    exigirValidacaoHumana: ev === null ? true : ev === "true",
    triagemAtiva: ta === null ? true : ta === "true",
    autoCriarDescoberto: ac === null ? true : ac === "true",
    autoAbsorverApelidoAltaConfianca: aa === null ? true : aa === "true",
    llmGeminiAtivo: lg === null ? true : lg === "true",
    llmClaudeAtivo: lc === null ? false : lc === "true",
    llmOpenaiAtivo: lo === null ? false : lo === "true",
  };
}

router.get("/settings/exames", requireCollaborator, async (_req, res): Promise<void> => {
  res.json(await examesPayload());
});

router.put("/settings/exames", requireCollaborator, async (req, res): Promise<void> => {
  const chaves: Record<string, string> = {
    exigirValidacaoHumana: "exames.exigirValidacaoHumana",
    triagemAtiva: "exames.triagemAtiva",
    autoCriarDescoberto: "exames.autoCriarDescoberto",
    autoAbsorverApelidoAltaConfianca: "exames.autoAbsorverApelidoAltaConfianca",
    llmGeminiAtivo: "exames.llmGeminiAtivo",
    llmClaudeAtivo: "exames.llmClaudeAtivo",
    llmOpenaiAtivo: "exames.llmOpenaiAtivo",
  };
  // aceita atualizacao parcial: so grava as chaves booleanas enviadas.
  let tocou = false;
  for (const [campo, settingKey] of Object.entries(chaves)) {
    const v = req.body?.[campo];
    if (v === undefined) continue;
    if (typeof v !== "boolean") {
      res.status(400).json({ error: `${campo} deve ser booleano` });
      return;
    }
    await setSetting(settingKey, v ? "true" : "false");
    tocou = true;
  }
  if (!tocou) {
    res.status(400).json({ error: "Nenhuma configuração de exames enviada" });
    return;
  }
  res.json(await examesPayload());
});

// -------------------------------------------------------------- GOVERNANCA ---
// Matriz Ferramenta x Papel (quem pode o que). Fonte unica em app_settings,
// chave `governanca.matriz`. GET semeia o default de forma NAO destrutiva (so
// quando a chave nao existe). PUT so o proprietário global (isPlatformOwner) — senao 403.
async function governancaPayload(): Promise<{ matriz: Matriz; papeis: typeof PAPEIS; ferramentas: typeof GRUPOS }> {
  const stored = await getJsonSetting<Matriz>("governanca.matriz");
  const matriz = stored ? normalizeMatriz(stored) : permissoesDefault();
  if (!stored) await setJsonSetting("governanca.matriz", matriz);
  return { matriz, papeis: PAPEIS, ferramentas: GRUPOS };
}

async function isCeo(req: Request): Promise<boolean> {
  const c = (req as { collaborator?: { professionalId?: number } }).collaborator;
  if (!c?.professionalId) return false;
  const [prof] = await db
    .select({ isPlatformOwner: professionalsTable.isPlatformOwner })
    .from(professionalsTable)
    .where(eq(professionalsTable.id, c.professionalId))
    .limit(1);
  return Boolean(prof?.isPlatformOwner);
}

router.get("/settings/governanca", requireCollaborator, async (_req, res): Promise<void> => {
  res.json(await governancaPayload());
});

router.put("/settings/governanca", requireCollaborator, async (req, res): Promise<void> => {
  if (!(await isCeo(req))) {
    res.status(403).json({ error: "Só o CEO altera as permissões." });
    return;
  }
  const matriz = req.body?.matriz;
  if (!matriz || typeof matriz !== "object") {
    res.status(400).json({ error: "matriz é obrigatória" });
    return;
  }
  // normalizeMatriz descarta chaves desconhecidas e forca soCeo=false: seguro.
  const limpa = normalizeMatriz(matriz);
  await setJsonSetting("governanca.matriz", limpa);
  res.json(await governancaPayload());
});

// ─── Toggle Boas-vindas WPP (Kaizen B) ────────────────────────────────────────
router.get("/settings/boas_vindas_wpp", requireCollaborator, async (_req, res): Promise<void> => {
  const valor = await getSetting("boas_vindas_wpp_ativo");
  res.json({ chave: "boas_vindas_wpp_ativo", valor: valor ?? "true" });
});

router.put("/settings/boas_vindas_wpp", requireCollaborator, async (req, res): Promise<void> => {
  const { valor } = req.body ?? {};
  if (typeof valor !== "string") { res.status(400).json({ error: "valor é string obrigatório" }); return; }
  await setSetting("boas_vindas_wpp_ativo", valor);
  res.json({ ok: true, valor });
});

export default router;
