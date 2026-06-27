import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import {
  UpdateCompanySettingsBody,
  UpdateClinicsSettingsBody,
  UpdatePaymentGatewaySettingsBody,
  UpdateESignatureSettingsBody,
} from "@workspace/api-zod";
import { requireCollaborator } from "./collaborator";
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

// ------------------------------------------------------------- CERTIFICADO ---
router.get("/settings/certificate", requireCollaborator, async (_req, res): Promise<void> => {
  res.json(await getCertificateStatus());
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
    const cpf =
      (typeof req.body?.cpf === "string" && req.body.cpf.trim()) || check.cpf || null;
    await saveCertificate(file.buffer, file.originalname || "certificado.pfx", password, cpf, actor(req));
    await refreshCertCache();
    res.json(await getCertificateStatus());
  },
);

export default router;
