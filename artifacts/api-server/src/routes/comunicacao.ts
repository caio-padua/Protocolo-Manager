import { Router, type IRouter } from "express";
import { isTelegramConfigured } from "../lib/telegram";
import { isWhatsappConfigured } from "../lib/whatsapp";
import { isGupshupConfigured } from "../lib/gupshup";
import { isGmailConnected } from "../lib/google-gmail";
import { isDriveConnected } from "../lib/google-drive";
import {
  getJsonSetting,
  setSetting,
  setSecret,
  getSecret,
  getSecretStatus,
  type SecretStatus,
} from "../lib/secure-settings";
import { requireCollaborator } from "./collaborator.js";

// Console de Comunicacao — status REAL de cada canal (so booleanos; nunca
// expoe valor de token/secret). Leitura livre (sem escrita, sem dado sensivel).
const router: IRouter = Router();

router.get("/comunicacao/status", async (req, res) => {
  const status = {
    telegram: false,
    whatsapp: false,
    gmail: false,
    drive: false,
    onedrive: false, // ainda nao existe integracao — sempre falso (honesto)
  };

  try {
    status.telegram = await isTelegramConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "status telegram falhou");
  }

  try {
    status.whatsapp = await isWhatsappConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "status whatsapp falhou");
  }

  try {
    status.gmail = await isGmailConnected();
  } catch (err) {
    req.log?.debug?.({ err }, "status gmail falhou");
  }

  try {
    status.drive = await isDriveConnected();
  } catch (err) {
    req.log?.debug?.({ err }, "status drive falhou");
  }

  res.json({ status });
});

// ===========================================================================
// PLATAFORMA GATEWAY DE COMUNICACAO — Twilio e Gupshup.
//
// Cada plataforma tem CAMPOS de credencial salvos no COFRE cifrado (twilio.*,
// gupshup.*) e dois indicadores honestos:
//  - configured: as credenciais existem (cofre ou env)? (real, so leitura)
//  - enabled: o operador escolheu usar esta plataforma? (app_settings
//    gateway.<provider>.enabled)
//
// A luz da tela reflete `configured` (nunca verde sem credencial). O toggle
// reflete `enabled`. Nenhum valor de token e exposto — so a mascara (••••1234).
// ===========================================================================
type GatewayProvider = "twilio" | "gupshup";

// Campo da tela -> chave no cofre + rotulo amigavel + nome do env (compat com
// o aviso "faltam credenciais" da tela).
interface GatewayFieldDef {
  field: string;
  vaultKey: string;
  label: string;
  envName: string;
  secret: boolean; // true = mascara/password; false = texto visivel (ex.: numero)
}

const GATEWAY_FIELDS: Record<GatewayProvider, GatewayFieldDef[]> = {
  twilio: [
    { field: "accountSid", vaultKey: "twilio.accountSid", label: "Identificador da conta (Account SID)", envName: "TWILIO_ACCOUNT_SID", secret: true },
    { field: "authToken", vaultKey: "twilio.authToken", label: "Senha de acesso (Auth Token)", envName: "TWILIO_AUTH_TOKEN", secret: true },
    { field: "whatsappFrom", vaultKey: "twilio.whatsappFrom", label: "Número remetente do WhatsApp", envName: "TWILIO_WHATSAPP_FROM", secret: false },
  ],
  gupshup: [
    { field: "apiKey", vaultKey: "gupshup.apiKey", label: "Chave de API (API Key)", envName: "GUPSHUP_API_KEY", secret: true },
    { field: "appName", vaultKey: "gupshup.appName", label: "Nome do aplicativo (App Name)", envName: "GUPSHUP_APP_NAME", secret: false },
  ],
};

async function isGatewayEnabled(provider: GatewayProvider): Promise<boolean> {
  const v = await getJsonSetting<boolean>(`gateway.${provider}.enabled`);
  return v === true;
}

// Monta os campos com status mascarado + a lista de chaves faltando (env names,
// para o aviso amigavel da tela continuar funcionando).
async function buildFields(provider: GatewayProvider): Promise<{
  fields: Array<GatewayFieldDef & { status: SecretStatus }>;
  missingKeys: string[];
}> {
  const defs = GATEWAY_FIELDS[provider];
  const statuses = await Promise.all(defs.map((d) => getSecretStatus(d.vaultKey)));
  const fields = defs.map((d, i) => ({ ...d, status: statuses[i] }));
  const missingKeys = fields.filter((f) => !f.status.isSet).map((f) => f.envName);
  return { fields, missingKeys };
}

router.get("/comunicacao/gateways", requireCollaborator, async (req, res) => {
  let twilioConfigured = false;
  let gupshupConfigured = false;
  try {
    twilioConfigured = await isWhatsappConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "gateway twilio configured falhou");
  }
  try {
    gupshupConfigured = await isGupshupConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "gateway gupshup configured falhou");
  }

  const [twilioEnabled, gupshupEnabled, twilioFields, gupshupFields] = await Promise.all([
    isGatewayEnabled("twilio").catch(() => false),
    isGatewayEnabled("gupshup").catch(() => false),
    buildFields("twilio"),
    buildFields("gupshup"),
  ]);

  res.json({
    gateways: [
      {
        provider: "twilio",
        label: "Twilio",
        configured: twilioConfigured,
        enabled: twilioEnabled,
        missingKeys: twilioFields.missingKeys,
        fields: twilioFields.fields.map((f) => ({
          field: f.field,
          label: f.label,
          secret: f.secret,
          isSet: f.status.isSet,
          masked: f.status.masked,
          source: f.status.source,
        })),
      },
      {
        provider: "gupshup",
        label: "Gupshup",
        configured: gupshupConfigured,
        enabled: gupshupEnabled,
        missingKeys: gupshupFields.missingKeys,
        fields: gupshupFields.fields.map((f) => ({
          field: f.field,
          label: f.label,
          secret: f.secret,
          isSet: f.status.isSet,
          masked: f.status.masked,
          source: f.status.source,
        })),
      },
    ],
  });
});

// Liga/desliga o gateway (preferencia do operador). Escrita protegida.
router.post("/comunicacao/gateways/:provider", requireCollaborator, async (req, res) => {
  const provider = req.params.provider;
  if (provider !== "twilio" && provider !== "gupshup") {
    return res.status(400).json({ error: "Gateway desconhecido" });
  }
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Campo 'enabled' deve ser booleano" });
  }
  await setSetting(`gateway.${provider}.enabled`, JSON.stringify(enabled));
  res.json({ provider, enabled });
});

// Grava as CREDENCIAIS do gateway no cofre cifrado. Campo vazio = nao altera
// (mantem o valor atual). Escrita protegida por colaborador.
router.put("/comunicacao/gateways/:provider/credentials", requireCollaborator, async (req, res) => {
  const provider = req.params.provider;
  if (provider !== "twilio" && provider !== "gupshup") {
    return res.status(400).json({ error: "Gateway desconhecido" });
  }
  const c = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
  const actor = c ? `${c.role ?? "?"}:${c.professionalId ?? "?"}` : undefined;
  const defs = GATEWAY_FIELDS[provider as GatewayProvider];
  const body = (req.body ?? {}) as Record<string, unknown>;
  let saved = 0;
  for (const d of defs) {
    const raw = body[d.field];
    if (typeof raw === "string" && raw.trim()) {
      await setSecret(d.vaultKey, raw.trim(), actor);
      saved += 1;
    }
  }
  const { fields, missingKeys } = await buildFields(provider as GatewayProvider);
  res.json({
    provider,
    saved,
    missingKeys,
    fields: fields.map((f) => ({
      field: f.field,
      label: f.label,
      secret: f.secret,
      isSet: f.status.isSet,
      masked: f.status.masked,
      source: f.status.source,
    })),
  });
});

// REVELA o valor REAL das credenciais do gateway (o "olhinho"). O dono logado
// tem direito de ver o proprio segredo — analogo a ver o proprio RG. NUNCA
// trafega por padrao: so sob acao explicita e com a MESMA protecao da gravacao
// (requireCollaborator). Sem login, nada e revelado. Decifra via getSecret
// (cofre tem prioridade; cai no env). Campo nao configurado volta como null.
router.post("/comunicacao/gateways/:provider/reveal", requireCollaborator, async (req, res) => {
  const provider = req.params.provider;
  if (provider !== "twilio" && provider !== "gupshup") {
    return res.status(400).json({ error: "Gateway desconhecido" });
  }
  const defs = GATEWAY_FIELDS[provider as GatewayProvider];
  const entries = await Promise.all(
    defs.map(async (d) => [d.field, await getSecret(d.vaultKey)] as const),
  );
  const values: Record<string, string | null> = {};
  for (const [field, value] of entries) values[field] = value;
  const actor = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
  req.log.info(
    {
      event: "gateway_secret_reveal",
      provider,
      actorId: actor?.professionalId ?? null,
      actorRole: actor?.role ?? null,
      fields: defs.map((d) => d.field),
    },
    "Revelacao de credencial de gateway",
  );
  res.json({ provider, values });
});

export default router;
