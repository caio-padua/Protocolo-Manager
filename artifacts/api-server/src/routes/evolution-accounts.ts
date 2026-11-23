import { Router, type IRouter, type Request, type Response } from "express";
import { getSecret, getSecretStatus } from "../lib/secure-settings.js";
import {
  atualizarControlesEvolutionConta,
  buscarContaEvolution,
  chaveApiEvolutionConta,
  chaveWebhookEvolutionConta,
  criarContaEvolution,
  isEvolutionAccountKey,
  listarContasEvolution,
  obterQrEvolutionConta,
  processarWebhookEvolutionConta,
  registrarWebhookEvolutionConta,
  salvarConfiguracaoEvolutionConta,
  urlWebhookEvolutionConta,
  consultarConexaoEvolutionConta,
  type EvolutionAccount,
  type EvolutionAccountControls,
  type EvolutionAccountKey,
} from "../lib/evolution-contas.js";
import { enderecoSeguro, lerConfig } from "../lib/evolution.js";
import { logger } from "../lib/logger.js";
import { requireCollaborator } from "./collaborator.js";

const router: IRouter = Router();
const publico: IRouter = Router();

function empresaDaSessao(req: Request): number | null {
  const context = req.tenantContext;
  return context?.authenticated && Number.isSafeInteger(context.empresaId) && context.empresaId > 0
    ? context.empresaId
    : null;
}

function titularDaPlataforma(req: Request): number | null {
  const context = req.tenantContext;
  if (!context?.authenticated || !context.isPlatformOwner || !Number.isSafeInteger(context.professionalId)) {
    return null;
  }
  return context.professionalId as number;
}

function chaveDaRota(req: Request): EvolutionAccountKey | null {
  const raw = Array.isArray(req.params.accountKey) ? req.params.accountKey[0] : req.params.accountKey;
  return isEvolutionAccountKey(raw) ? raw : null;
}

function dtoConta(account: EvolutionAccount | null, accountKey: EvolutionAccountKey) {
  return {
    accountKey,
    configured: Boolean(account?.baseUrl && account.instanceName),
    baseUrl: account?.baseUrl ?? null,
    instanceName: account?.instanceName ?? null,
    connectionEnabled: account?.connectionEnabled ?? false,
    captureEnabled: account?.captureEnabled ?? false,
    learningEnabled: account?.learningEnabled ?? false,
    repliesEnabled: account?.repliesEnabled ?? false,
    apiKeyDefined: false,
    secretDefined: false,
    capabilities: {
      outboundMessages: false,
      automaticReplies: false,
      learningExecution: false,
      messageCapture: true,
      capturedMessageProvenance: "nao_classificada",
    },
  };
}

async function contaAutorizada(
  req: Request,
  res: Response,
  empresaId: number,
  accountKey: EvolutionAccountKey,
): Promise<EvolutionAccount | null> {
  const ownerId = titularDaPlataforma(req);
  if (ownerId === null) {
    // Resposta indistinguível de conta inexistente evita revelar sua presença.
    res.status(404).json({ error: "Conta não encontrada." });
    return null;
  }
  const account = await buscarContaEvolution(empresaId, accountKey);
  if (!account || account.ownerProfessionalId !== ownerId) {
    res.status(404).json({ error: "Conta não encontrada." });
    return null;
  }
  return account;
}

// A empresa é sempre derivada da sessão; não há company_id aceito na URL ou no corpo.
router.get("/evolution/accounts", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  const businessConfig = await lerConfig(empresaId);
  const accounts = [{
    accountKey: "empresarial",
    legacy: true,
    configured: Boolean(businessConfig),
    baseUrl: businessConfig?.baseUrl ?? null,
    instanceName: businessConfig?.instanceName ?? null,
    controlsManagedByLegacyRoutes: true,
  }];

  const ownerId = titularDaPlataforma(req);
  if (ownerId !== null) {
    const stored = await listarContasEvolution(empresaId);
    for (const accountKey of ["pessoal_proprietario", "terceira"] as const) {
      const account = stored.find(
        (candidate) => candidate.accountKey === accountKey && candidate.ownerProfessionalId === ownerId,
      ) ?? null;
      const dto = dtoConta(account, accountKey);
      const [apiKey, webhookToken] = account
        ? await Promise.all([
            getSecretStatus(chaveApiEvolutionConta(empresaId, accountKey)),
            getSecretStatus(chaveWebhookEvolutionConta(empresaId, accountKey)),
          ])
        : [{ isSet: false }, { isSet: false }];
      dto.apiKeyDefined = Boolean(apiKey.isSet);
      dto.secretDefined = Boolean(webhookToken.isSet);
      accounts.push({ ...dto, legacy: false, controlsManagedByLegacyRoutes: false });
    }
  }
  res.json({ accounts });
});

// Slots are created empty and with all controls off; no credentials or conversations are copied.
router.post("/evolution/accounts/:accountKey", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req);
  const ownerId = titularDaPlataforma(req);
  const accountKey = chaveDaRota(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (ownerId === null || accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const result = await criarContaEvolution(empresaId, accountKey, ownerId, ownerId);
  if (result.ownerConflict) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  res.status(result.created ? 201 : 200).json(dtoConta(result.account, accountKey));
});

router.get("/evolution/accounts/:accountKey", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req);
  const accountKey = chaveDaRota(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await contaAutorizada(req, res, empresaId, accountKey);
  if (!account) return;
  const [apiKey, webhookToken] = await Promise.all([
    getSecretStatus(chaveApiEvolutionConta(empresaId, accountKey)),
    getSecretStatus(chaveWebhookEvolutionConta(empresaId, accountKey)),
  ]);
  res.json({
    ...dtoConta(account, accountKey),
    apiKeyDefined: apiKey.isSet,
    secretDefined: webhookToken.isSet,
    capabilities: {
      outboundMessages: false,
      automaticReplies: false,
      learningExecution: false,
      messageCapture: true,
      capturedMessageProvenance: "nao_classificada",
    },
  });
});

router.put("/evolution/accounts/:accountKey/config", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req);
  const ownerId = titularDaPlataforma(req);
  const accountKey = chaveDaRota(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  if (ownerId === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await contaAutorizada(req, res, empresaId, accountKey);
  if (!account) return;
  try {
    const baseUrl = String(req.body?.baseUrl ?? "").trim();
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : undefined;
    if (apiKey !== undefined && (apiKey.length < 8 || apiKey.length > 512 || /\s/.test(apiKey))) {
      res.status(400).json({ error: "Chave de acesso inválida." });
      return;
    }
    await enderecoSeguro(baseUrl);
    await salvarConfiguracaoEvolutionConta(
      account,
      baseUrl,
      req.body?.instanceName,
      apiKey,
      ownerId,
    );
    res.json({ ok: true, accountKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "api_key_obrigatoria" || message === "api_key_invalida") {
      res.status(400).json({ error: "Informe uma chave de acesso válida." });
      return;
    }
    if (message === "instancia_ja_associada") {
      res.status(409).json({ error: "Esta instância já está associada a outra conta." });
      return;
    }
    logger.warn({ accountKey, empresaId }, "Configuração de conta Evolution recusada");
    res.status(400).json({ error: "Não foi possível validar a configuração da conta." });
  }
});

router.patch("/evolution/accounts/:accountKey/controls", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req);
  const ownerId = titularDaPlataforma(req);
  const accountKey = chaveDaRota(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  if (ownerId === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await contaAutorizada(req, res, empresaId, accountKey);
  if (!account) return;

  const allowed = new Set(["connectionEnabled", "captureEnabled", "learningEnabled", "repliesEnabled"]);
  const entries = Object.entries(req.body ?? {});
  if (!entries.length || entries.some(([key, value]) => !allowed.has(key) || typeof value !== "boolean")) {
    res.status(400).json({ error: "Informe somente controles independentes como verdadeiro ou falso." });
    return;
  }
  const controls = Object.fromEntries(entries) as EvolutionAccountControls;
  const updated = await atualizarControlesEvolutionConta(empresaId, accountKey, controls, ownerId);
  if (!updated) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  res.json({
    ...dtoConta(updated, accountKey),
    capabilities: {
      outboundMessages: false,
      automaticReplies: false,
      learningExecution: false,
      messageCapture: true,
      capturedMessageProvenance: "nao_classificada",
    },
  });
});

router.get("/evolution/accounts/:accountKey/connection", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req);
  const accountKey = chaveDaRota(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await contaAutorizada(req, res, empresaId, accountKey);
  if (!account) return;
  res.json(await consultarConexaoEvolutionConta(account));
});

router.post("/evolution/accounts/:accountKey/qr", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req);
  const accountKey = chaveDaRota(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await contaAutorizada(req, res, empresaId, accountKey);
  if (!account) return;
  const result = await obterQrEvolutionConta(account);
  res.status(result.status).json(result.json);
});

router.post("/evolution/accounts/:accountKey/webhook/register", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = empresaDaSessao(req);
  const accountKey = chaveDaRota(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await contaAutorizada(req, res, empresaId, accountKey);
  if (!account) return;
  const configuredBaseUrl = process.env.PUBLIC_API_BASE_URL?.trim();
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  const baseApiUrl = configuredBaseUrl || (domain ? `https://${domain}` : "");
  const token = await getSecret(chaveWebhookEvolutionConta(empresaId, accountKey));
  let validPublicBaseUrl = false;
  try {
    const parsed = new URL(baseApiUrl);
    validPublicBaseUrl = parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    validPublicBaseUrl = false;
  }
  if (!validPublicBaseUrl || !token) {
    res.status(409).json({ error: "Endereço público da API ou token do webhook ausente." });
    return;
  }
  const result = await registrarWebhookEvolutionConta(
    account,
    urlWebhookEvolutionConta(baseApiUrl, empresaId, accountKey, token),
  );
  res.status(result.status).json(result.json);
});

// Endpoint público separado da conta empresarial. Não chama atendimento, aprendizado ou envio.
publico.post(
  "/evolution/account-webhook/:empresaId/:accountKey",
  async (req, res): Promise<void> => {
    const rawEmpresaId = Array.isArray(req.params.empresaId) ? req.params.empresaId[0] : req.params.empresaId;
    const rawToken = typeof req.query.token === "string" ? req.query.token : "";
    const accountKey = chaveDaRota(req);
    const empresaId = Number(rawEmpresaId);
    if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || !accountKey || !rawToken || rawToken.length > 256) {
      res.status(403).json({ ok: false });
      return;
    }
    const result = await processarWebhookEvolutionConta({
      empresaId,
      accountKey,
      token: rawToken,
      payload: req.body,
    });
    res.status(result.status).json({ ok: result.status === 200 });
  },
);

export const evolutionAccountsWebhookRouter: IRouter = publico;
export default router;
