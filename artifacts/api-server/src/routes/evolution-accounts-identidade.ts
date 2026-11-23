import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getSecret, getSecretStatus } from "../lib/secure-settings.js";
import {
  diagnoseLegacyEvolutionAccounts,
  evolutionAccountWebhookUrl,
  evolutionAccountWebhookKeyName,
  getEvolutionAccountForClinic,
  getEvolutionAccountQr,
  getEvolutionAccountSecretStatus,
  isEvolutionAccountKey,
  linkEvolutionAccountToClinic,
  listEvolutionAccountsForClinic,
  processEvolutionAccountWebhook,
  queryEvolutionAccountConnection,
  registerEvolutionAccountWebhook,
  revokeEvolutionAccountClinicLink,
  saveEvolutionAccountConfig,
  updateEvolutionAccountControls,
  type EvolutionAccountIdentity,
  type EvolutionAccountKey,
} from "../lib/evolution-contas-identidade.js";
import { enderecoSeguro, lerConfig } from "../lib/evolution.js";
import {
  chaveApiEvolutionConta,
  chaveWebhookEvolutionConta,
} from "../lib/evolution-contas.js";
import { logger } from "../lib/logger.js";
import { requireCollaborator } from "./collaborator.js";

const router: IRouter = Router();
const publicWebhook: IRouter = Router();

function clinicFromSession(req: Request): number | null {
  const context = req.tenantContext;
  return context?.authenticated && Number.isSafeInteger(context.empresaId) && context.empresaId > 0
    ? context.empresaId
    : null;
}

function ownerFromSession(req: Request): number | null {
  const context = req.tenantContext;
  const collaboratorId = req.collaborator?.professionalId;
  if (
    !context?.authenticated ||
    !context.isPlatformOwner ||
    !Number.isSafeInteger(context.professionalId) ||
    context.professionalId !== collaboratorId
  ) return null;
  return context.professionalId;
}

function accountKeyFromRoute(req: Request): EvolutionAccountKey | null {
  const raw = Array.isArray(req.params.accountKey) ? req.params.accountKey[0] : req.params.accountKey;
  return isEvolutionAccountKey(raw) ? raw : null;
}

function accountDto(account: EvolutionAccountIdentity, secrets: {
  apiKeyDefined?: boolean;
  webhookTokenDefined?: boolean;
}) {
  return {
    accountId: account.accountId,
    accountKey: account.accountKey,
    ownerProfessionalId: account.ownerProfessionalId,
    baseUrl: account.baseUrl,
    instanceName: account.instanceName,
    configured: Boolean(account.baseUrl && account.instanceName),
    connectionEnabled: account.connectionEnabled,
    connectionStatus: "not_checked" as const,
    captureEnabled: account.captureEnabled,
    learningEnabled: account.learningEnabled,
    repliesEnabled: account.repliesEnabled,
    apiKeyDefined: secrets.apiKeyDefined ?? false,
    webhookTokenDefined: secrets.webhookTokenDefined ?? false,
    capabilities: {
      outboundMessages: false,
      automaticReplies: false,
      learningExecution: false,
      messageCapture: true,
      capturedMessageProvenance: "nao_classificada" as const,
    },
  };
}

async function authorizedAccount(
  req: Request,
  res: Response,
  empresaId: number,
  accountKey: EvolutionAccountKey,
  next: NextFunction,
): Promise<EvolutionAccountIdentity | null> {
  const ownerId = ownerFromSession(req);
  if (ownerId === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return null;
  }
  const account = await getEvolutionAccountForClinic(empresaId, accountKey, ownerId);
  if (!account) {
    if (await legacySlotExists(empresaId, accountKey, ownerId)) next("router");
    else res.status(404).json({ error: "Conta não encontrada." });
    return null;
  }
  return account;
}

async function legacyAccountRows(
  empresaId: number,
  ownerProfessionalId: number,
): Promise<Array<Record<string, unknown>>> {
  const present = await pool.query("SELECT to_regclass('public.evolution_contas') AS accounts");
  const table = (present.rows[0] as { accounts?: string | null } | undefined)?.accounts;
  if (!table) return [];
  const result = await pool.query(
    `SELECT empresa_id, account_key, owner_professional_id, base_url, instance_name,
            connection_enabled, capture_enabled, learning_enabled, replies_enabled, atualizado_em
       FROM evolution_contas
      WHERE empresa_id = $1 AND owner_professional_id = $2`,
    [empresaId, ownerProfessionalId],
  );
  return result.rows as Array<Record<string, unknown>>;
}

router.get("/evolution/accounts/migration-diagnostics", requireCollaborator, async (req, res): Promise<void> => {
  if (clinicFromSession(req) === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (ownerFromSession(req) === null) {
    res.status(404).json({ error: "Diagnóstico não encontrado." });
    return;
  }
  res.json(await diagnoseLegacyEvolutionAccounts());
});

router.get("/evolution/accounts", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = clinicFromSession(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  const business = await lerConfig(empresaId);
  const accounts: Array<Record<string, unknown>> = [{
    accountKey: "empresarial",
    accountId: null,
    legacy: true,
    configured: Boolean(business),
    baseUrl: business?.baseUrl ?? null,
    instanceName: business?.instanceName ?? null,
    connectionStatus: "not_checked",
    controlsManagedByLegacyRoutes: true,
  }];
  const ownerId = ownerFromSession(req);
  if (ownerId !== null) {
    const linked = await listEvolutionAccountsForClinic(empresaId, ownerId);
    const byKey = new Map(linked.map((account) => [account.accountKey, account]));
    const oldRows = await legacyAccountRows(empresaId, ownerId);
    const oldByKey = new Map(oldRows.map((row) => [row.account_key as string, row]));
    for (const accountKey of ["pessoal_proprietario", "terceira"] as const) {
      const account = byKey.get(accountKey);
      const oldAccount = oldByKey.get(accountKey);
      if (account) {
        accounts.push({
            ...accountDto(account, await getEvolutionAccountSecretStatus(account.accountId)),
            legacy: false,
            linked: true,
            controlsManagedByLegacyRoutes: false,
          });
      } else if (oldAccount) {
        const [apiKey, webhookToken] = await Promise.all([
          getSecretStatus(chaveApiEvolutionConta(empresaId, accountKey)),
          getSecretStatus(chaveWebhookEvolutionConta(empresaId, accountKey)),
        ]);
        accounts.push({
          accountKey,
          accountId: null,
          ownerProfessionalId: ownerId,
          baseUrl: typeof oldAccount.base_url === "string" ? oldAccount.base_url : null,
          instanceName: typeof oldAccount.instance_name === "string" ? oldAccount.instance_name : null,
          configured: Boolean(oldAccount.base_url && oldAccount.instance_name),
          connectionEnabled: oldAccount.connection_enabled === true,
          connectionStatus: "not_checked",
          captureEnabled: oldAccount.capture_enabled === true,
          learningEnabled: oldAccount.learning_enabled === true,
          repliesEnabled: oldAccount.replies_enabled === true,
          apiKeyDefined: Boolean(apiKey.isSet),
          webhookTokenDefined: Boolean(webhookToken.isSet),
          legacy: true,
          legacyPerClinic: true,
          linked: true,
          controlsManagedByLegacyRoutes: false,
          capabilities: {
            outboundMessages: false,
            automaticReplies: false,
            learningExecution: false,
            messageCapture: true,
            capturedMessageProvenance: "nao_classificada",
          },
        });
      } else {
        accounts.push({
            accountKey,
            accountId: null,
            legacy: false,
            linked: false,
            configured: false,
            connectionEnabled: false,
            connectionStatus: "not_checked",
            captureEnabled: false,
            learningEnabled: false,
            repliesEnabled: false,
            controlsManagedByLegacyRoutes: false,
            capabilities: {
              outboundMessages: false,
              automaticReplies: false,
              learningExecution: false,
              messageCapture: true,
              capturedMessageProvenance: "nao_classificada",
            },
          });
      }
    }
  }
  res.json({ accounts });
});

router.post("/evolution/accounts/:accountKey", requireCollaborator, async (req, res, next): Promise<void> => {
  const empresaId = clinicFromSession(req);
  const ownerId = ownerFromSession(req);
  const accountKey = accountKeyFromRoute(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (ownerId === null || accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  try {
    const result = await linkEvolutionAccountToClinic({
      empresaId,
      accountKey,
      ownerProfessionalId: ownerId,
      authorizedBy: ownerId,
    });
    const status = await getEvolutionAccountSecretStatus(result.account.accountId);
    res.status(result.linked ? 201 : 200).json({
      ...accountDto(result.account, status),
      linked: true,
      clinicAssociationCreated: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "legacy_account_requires_review") {
      next("router");
      return;
    }
    if (message === "clinic_account_slot_taken") {
      res.status(409).json({ error: "Esta categoria já está associada a outra conta nesta clínica." });
      return;
    }
    logger.warn({ accountKey, empresaId }, "Associação de conta Evolution recusada");
    res.status(500).json({ error: "Não foi possível associar a conta a esta clínica." });
  }
});

router.delete(
  "/evolution/accounts/:accountKey/association",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const empresaId = clinicFromSession(req);
    const ownerId = ownerFromSession(req);
    const accountKey = accountKeyFromRoute(req);
    if (empresaId === null) {
      res.status(401).json({ error: "Sessão sem clínica identificada." });
      return;
    }
    if (ownerId === null || accountKey === null) {
      res.status(404).json({ error: "Conta não encontrada." });
      return;
    }
    const revoked = await revokeEvolutionAccountClinicLink({
      empresaId,
      accountKey,
      ownerProfessionalId: ownerId,
      revokedBy: ownerId,
    });
    if (!revoked) {
      res.status(404).json({ error: "Associação não encontrada." });
      return;
    }
    res.json({ ok: true, accountKey, linked: false });
  },
);

router.get("/evolution/accounts/:accountKey", requireCollaborator, async (req, res, next): Promise<void> => {
  const empresaId = clinicFromSession(req);
  const accountKey = accountKeyFromRoute(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await authorizedAccount(req, res, empresaId, accountKey, next);
  if (!account) return;
  const status = await getEvolutionAccountSecretStatus(account.accountId);
  res.json({ ...accountDto(account, status), linked: true });
});

router.put("/evolution/accounts/:accountKey/config", requireCollaborator, async (req, res, next): Promise<void> => {
  const empresaId = clinicFromSession(req);
  const accountKey = accountKeyFromRoute(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await authorizedAccount(req, res, empresaId, accountKey, next);
  if (!account) return;
  try {
    const baseUrl = String(req.body?.baseUrl ?? "").trim();
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : undefined;
    await enderecoSeguro(baseUrl);
    await saveEvolutionAccountConfig({
      account,
      baseUrl,
      instanceName: req.body?.instanceName,
      apiKey,
      updatedBy: account.ownerProfessionalId,
    });
    res.json({ ok: true, accountId: account.accountId, accountKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "api_key_required" || message === "api_key_invalid") {
      res.status(400).json({ error: "Informe uma chave de acesso válida." });
      return;
    }
    if (message === "instance_already_associated") {
      res.status(409).json({ error: "Esta instância já está associada a outra conta." });
      return;
    }
    logger.warn({ accountKey, empresaId }, "Configuração de conta Evolution recusada");
    res.status(400).json({ error: "Não foi possível validar a configuração da conta." });
  }
});

router.patch("/evolution/accounts/:accountKey/controls", requireCollaborator, async (req, res, next): Promise<void> => {
  const empresaId = clinicFromSession(req);
  const ownerId = ownerFromSession(req);
  const accountKey = accountKeyFromRoute(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await authorizedAccount(req, res, empresaId, accountKey, next);
  if (!account || ownerId === null) return;
  const allowed = new Set(["connectionEnabled", "captureEnabled", "learningEnabled", "repliesEnabled"]);
  const entries = Object.entries(req.body ?? {});
  if (!entries.length || entries.some(([key, value]) => !allowed.has(key) || typeof value !== "boolean")) {
    res.status(400).json({ error: "Informe somente controles independentes como verdadeiro ou falso." });
    return;
  }
  const updated = await updateEvolutionAccountControls(
    account.accountId,
    Object.fromEntries(entries),
    ownerId,
  );
  if (!updated) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  res.json({
    ...accountDto(updated, await getEvolutionAccountSecretStatus(account.accountId)),
    linked: true,
  });
});

router.get("/evolution/accounts/:accountKey/connection", requireCollaborator, async (req, res, next): Promise<void> => {
  const empresaId = clinicFromSession(req);
  const accountKey = accountKeyFromRoute(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await authorizedAccount(req, res, empresaId, accountKey, next);
  if (!account) return;
  res.json(await queryEvolutionAccountConnection(account));
});

router.post("/evolution/accounts/:accountKey/qr", requireCollaborator, async (req, res, next): Promise<void> => {
  const empresaId = clinicFromSession(req);
  const accountKey = accountKeyFromRoute(req);
  if (empresaId === null) {
    res.status(401).json({ error: "Sessão sem clínica identificada." });
    return;
  }
  if (accountKey === null) {
    res.status(404).json({ error: "Conta não encontrada." });
    return;
  }
  const account = await authorizedAccount(req, res, empresaId, accountKey, next);
  if (!account) return;
  const result = await getEvolutionAccountQr(account);
  res.status(result.status).json(result.json);
});

router.post(
  "/evolution/accounts/:accountKey/webhook/register",
  requireCollaborator,
  async (req, res, next): Promise<void> => {
    const empresaId = clinicFromSession(req);
    const accountKey = accountKeyFromRoute(req);
    if (empresaId === null) {
      res.status(401).json({ error: "Sessão sem clínica identificada." });
      return;
    }
    if (accountKey === null) {
      res.status(404).json({ error: "Conta não encontrada." });
      return;
    }
    const account = await authorizedAccount(req, res, empresaId, accountKey, next);
    if (!account) return;
    const configuredBaseUrl = process.env.PUBLIC_API_BASE_URL?.trim();
    const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
    const baseApiUrl = configuredBaseUrl || (domain ? `https://${domain}` : "");
    const token = await getSecret(evolutionAccountWebhookKeyName(account.accountId));
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
    const result = await registerEvolutionAccountWebhook(
      account,
      evolutionAccountWebhookUrl(baseApiUrl, account.accountId, token),
    );
    res.status(result.status).json(result.json);
  },
);

publicWebhook.post("/evolution/account-webhook/:accountId", async (req, res): Promise<void> => {
  const rawAccountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (
    typeof rawAccountId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawAccountId) ||
    !token ||
    token.length > 256
  ) {
    res.status(403).json({ ok: false });
    return;
  }
  const result = await processEvolutionAccountWebhook({
    accountId: rawAccountId,
    token,
    payload: req.body,
  });
  res.status(result.status).json({ ok: result.status === 200 });
});

export const evolutionAccountsIdentityWebhookRouter: IRouter = publicWebhook;
export default router;
