import { Router, type IRouter, type Request } from "express";
import { requireCollaborator } from "./collaborator";
import {
  getSecret,
  setSecret,
  deleteSecret,
  getSecretStatus,
  getSetting,
  setSetting,
  type SecretStatus,
} from "../lib/secure-settings";
import {
  INTEGRATIONS,
  getIntegration,
  slugifyCustom,
  type IntegrationDef,
} from "../lib/integration-registry";

// ===========================================================================
// MOTOR UNICO DE INTEGRACOES (Padrao 18) — /api/integrations.
//
// Padroniza TODAS as telas de credencial chave/valor (Asaas, Stripe, ZapSign,
// Telegram) por um registro declarativo (integration-registry.ts). O GET nunca
// expoe valor de segredo (so isSet + mascara). O valor real so sai pelo /reveal,
// acao explicita do dono, protegida por requireCollaborator e registrada em log.
// Campo vazio no PUT = nao altera. Campos config (URL base etc.) trafegam em
// claro (nao sao sensiveis). Campo personalizado: o operador cria chave/valor
// nova pela propria tela, sem o agente.
// ===========================================================================

const router: IRouter = Router();

interface CustomMeta {
  slug: string;
  label: string;
}

function actor(req: Request): string | undefined {
  const c = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
  return c ? `${c.role ?? "?"}:${c.professionalId ?? "?"}` : undefined;
}

function customMetaKey(provider: string): string {
  return `integration.custom.${provider}`;
}

function customVaultKey(provider: string, slug: string): string {
  return `custom.${provider}.${slug}`;
}

async function getCustomMeta(provider: string): Promise<CustomMeta[]> {
  const raw = await getSetting(customMetaKey(provider));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (m): m is CustomMeta =>
          !!m && typeof m.slug === "string" && typeof m.label === "string",
      );
    }
  } catch {
    /* meta corrompido = vazio */
  }
  return [];
}

async function setCustomMeta(provider: string, meta: CustomMeta[]): Promise<void> {
  await setSetting(customMetaKey(provider), JSON.stringify(meta));
}

// URL publica deste sistema (base + caminho do webhook). Em desenvolvimento e
// em producao o REPLIT_DOMAINS ja traz o dominio certo (o publicado, quando ha).
// Sem dominio = null (a tela simplesmente nao mostra a linha).
function publicWebhookUrl(webhookPath?: string): string | null {
  if (!webhookPath) return null;
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (!domain) return null;
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return `${base.replace(/\/$/, "")}${webhookPath}`;
}

// Monta o payload seguro de uma plataforma (nunca inclui valor de segredo).
async function buildPayload(def: IntegrationDef): Promise<unknown> {
  const fieldEntries = await Promise.all(
    def.fields.map(async (f) => {
      if (f.kind === "config") {
        const value = (await getSetting(f.key)) ?? "";
        return {
          field: f.field,
          label: f.label,
          kind: f.kind,
          secret: f.secret,
          isSet: value.trim() !== "",
          value, // config trafega em claro (nao sensivel)
          masked: null as string | null,
          source: value.trim() !== "" ? ("vault" as const) : null,
        };
      }
      const status: SecretStatus = await getSecretStatus(f.key);
      return {
        field: f.field,
        label: f.label,
        kind: f.kind,
        secret: f.secret,
        isSet: status.isSet,
        value: undefined,
        masked: status.masked,
        source: status.source,
      };
    }),
  );

  const meta = await getCustomMeta(def.provider);
  const customEntries = await Promise.all(
    meta.map(async (m) => {
      const status = await getSecretStatus(customVaultKey(def.provider, m.slug));
      return {
        slug: m.slug,
        label: m.label,
        isSet: status.isSet,
        masked: status.masked,
        source: status.source,
      };
    }),
  );

  // "configured" = todos os campos SECRETOS do registro preenchidos.
  const secretDefs = def.fields.filter((f) => f.kind === "secret");
  const missingCount = fieldEntries.filter(
    (f) => f.kind === "secret" && !f.isSet,
  ).length;
  const configured = secretDefs.length > 0 && missingCount === 0;

  let enabled = false;
  if (def.enabledKey) enabled = (await getSetting(def.enabledKey)) === "true";

  return {
    provider: def.provider,
    label: def.label,
    hasToggle: !!def.enabledKey,
    enabled,
    configured,
    missingCount,
    allowCustom: def.allowCustom,
    webhookUrl: publicWebhookUrl(def.webhookPath),
    fields: fieldEntries,
    custom: customEntries,
  };
}

// ----------------------------------------------------------------- LISTA -----
router.get("/integrations", requireCollaborator, async (_req, res): Promise<void> => {
  const payloads = await Promise.all(Object.values(INTEGRATIONS).map(buildPayload));
  res.json({ integrations: payloads });
});

router.get("/integrations/:provider", requireCollaborator, async (req, res): Promise<void> => {
  const def = getIntegration(String(req.params.provider));
  if (!def) {
    res.status(404).json({ error: "Integração desconhecida" });
    return;
  }
  res.json(await buildPayload(def));
});

// --------------------------------------------------------- SALVAR CAMPOS -----
router.put(
  "/integrations/:provider/credentials",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const def = getIntegration(String(req.params.provider));
    if (!def) {
      res.status(404).json({ error: "Integração desconhecida" });
      return;
    }
    const body = (req.body ?? {}) as {
      values?: Record<string, unknown>;
      custom?: Record<string, unknown>;
    };
    const values = body.values ?? {};
    const custom = body.custom ?? {};
    const who = actor(req);
    let saved = 0;

    for (const f of def.fields) {
      const raw = values[f.field];
      if (typeof raw !== "string" || !raw.trim()) continue;
      let value = raw.trim();
      if (f.sanitize === "digits") value = value.replace(/[^0-9]/g, "");
      if (typeof f.minLen === "number" && value.length < f.minLen) {
        res.status(400).json({ error: `Campo "${f.label}" curto demais.` });
        return;
      }
      if (typeof f.maxLen === "number" && value.length > f.maxLen) {
        res.status(400).json({ error: `Campo "${f.label}" longo demais.` });
        return;
      }
      if (f.kind === "config") {
        await setSetting(f.key, value);
      } else {
        await setSecret(f.key, value, who);
      }
      saved += 1;
    }

    // Valores de campos personalizados (sempre cofre): so os ja cadastrados.
    if (Object.keys(custom).length > 0) {
      const meta = await getCustomMeta(def.provider);
      const known = new Set(meta.map((m) => m.slug));
      for (const [slug, raw] of Object.entries(custom)) {
        if (!known.has(slug)) continue;
        if (typeof raw !== "string" || !raw.trim()) continue;
        await setSecret(customVaultKey(def.provider, slug), raw.trim(), who);
        saved += 1;
      }
    }

    const payload = (await buildPayload(def)) as Record<string, unknown>;
    res.json({ ...payload, saved });
  },
);

// --------------------------------------------------------------- REVELAR -----
router.post(
  "/integrations/:provider/reveal",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const def = getIntegration(String(req.params.provider));
    if (!def) {
      res.status(404).json({ error: "Integração desconhecida" });
      return;
    }
    const values: Record<string, string | null> = {};
    // So campos SECRETOS do registro (config ja vem em claro no GET).
    for (const f of def.fields) {
      if (f.kind !== "secret") continue;
      values[f.field] = await getSecret(f.key);
    }
    const meta = await getCustomMeta(def.provider);
    const custom: Record<string, string | null> = {};
    for (const m of meta) {
      custom[m.slug] = await getSecret(customVaultKey(def.provider, m.slug));
    }
    const c = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
    req.log?.info?.(
      {
        event: "integration_secret_reveal",
        provider: def.provider,
        actorId: c?.professionalId ?? null,
        actorRole: c?.role ?? null,
      },
      "Revelacao de credencial de integracao",
    );
    res.json({ provider: def.provider, values, custom });
  },
);

// ----------------------------------------------------------------- TOGGLE ----
router.post(
  "/integrations/:provider/toggle",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const def = getIntegration(String(req.params.provider));
    if (!def) {
      res.status(404).json({ error: "Integração desconhecida" });
      return;
    }
    if (!def.enabledKey) {
      res.status(400).json({ error: "Esta integração não tem liga/desliga." });
      return;
    }
    const enabled = (req.body ?? {}).enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "Campo 'enabled' deve ser booleano." });
      return;
    }
    await setSetting(def.enabledKey, enabled ? "true" : "false");
    res.json(await buildPayload(def));
  },
);

// ------------------------------------------------------ CAMPO PERSONALIZADO --
router.post(
  "/integrations/:provider/custom",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const def = getIntegration(String(req.params.provider));
    if (!def) {
      res.status(404).json({ error: "Integração desconhecida" });
      return;
    }
    if (!def.allowCustom) {
      res.status(400).json({ error: "Esta integração não aceita campos personalizados." });
      return;
    }
    const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
    if (!label) {
      res.status(400).json({ error: "Informe o nome do campo." });
      return;
    }
    if (label.length > 60) {
      res.status(400).json({ error: "Nome do campo longo demais (máx. 60)." });
      return;
    }
    const value = typeof req.body?.value === "string" ? req.body.value.trim() : "";
    if (value.length > 4096) {
      res.status(400).json({ error: "Valor longo demais (máx. 4096)." });
      return;
    }
    let slug = slugifyCustom(label);
    if (!slug) {
      res.status(400).json({ error: "Nome inválido para o campo." });
      return;
    }
    const meta = await getCustomMeta(def.provider);
    if (meta.length >= 20) {
      res.status(400).json({ error: "Limite de 20 campos personalizados atingido." });
      return;
    }
    if (meta.some((m) => m.slug === slug)) {
      // Evita colisao: acrescenta sufixo numerico.
      let n = 2;
      while (meta.some((m) => m.slug === `${slug}_${n}`)) n += 1;
      slug = `${slug}_${n}`;
    }
    meta.push({ slug, label });
    await setCustomMeta(def.provider, meta);

    if (value) await setSecret(customVaultKey(def.provider, slug), value, actor(req));

    res.json(await buildPayload(def));
  },
);

router.delete(
  "/integrations/:provider/custom/:slug",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const def = getIntegration(String(req.params.provider));
    if (!def) {
      res.status(404).json({ error: "Integração desconhecida" });
      return;
    }
    const slug = String(req.params.slug);
    const meta = await getCustomMeta(def.provider);
    const next = meta.filter((m) => m.slug !== slug);
    await setCustomMeta(def.provider, next);
    await deleteSecret(customVaultKey(def.provider, slug));
    res.json(await buildPayload(def));
  },
);

export default router;
