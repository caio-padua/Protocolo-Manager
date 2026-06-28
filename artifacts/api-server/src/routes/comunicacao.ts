import { Router, type IRouter } from "express";
import { isTelegramConfigured } from "../lib/telegram";
import { isWhatsappConfigured } from "../lib/whatsapp";
import { isGupshupConfigured } from "../lib/gupshup";
import { isGmailConnected } from "../lib/google-gmail";
import { isDriveConnected } from "../lib/google-drive";
import { getJsonSetting, setSetting } from "../lib/secure-settings";
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
    status.whatsapp = isWhatsappConfigured();
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
// Dois indicadores HONESTOS por plataforma:
//  - configured: as credenciais existem no ambiente? (real, so leitura)
//  - enabled: o operador escolheu usar esta plataforma? (preferencia persistida
//    em app_settings na chave gateway.<provider>.enabled)
//
// A luz da tela reflete `configured` (nunca verde sem credencial). O toggle
// reflete `enabled` (sobrevive a recarregar). Nenhum valor de token e exposto.
// ===========================================================================
type GatewayProvider = "twilio" | "gupshup";

function twilioMissingKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
  if (!process.env.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
  if (!(process.env.TWILIO_WHATSAPP_FROM || process.env.WHATSAPP_FROM)) {
    missing.push("TWILIO_WHATSAPP_FROM");
  }
  return missing;
}

function gupshupMissingKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.GUPSHUP_API_KEY) missing.push("GUPSHUP_API_KEY");
  if (!process.env.GUPSHUP_APP_NAME) missing.push("GUPSHUP_APP_NAME");
  return missing;
}

async function isGatewayEnabled(provider: GatewayProvider): Promise<boolean> {
  const v = await getJsonSetting<boolean>(`gateway.${provider}.enabled`);
  return v === true;
}

router.get("/comunicacao/gateways", async (req, res) => {
  let twilioConfigured = false;
  let gupshupConfigured = false;
  try {
    twilioConfigured = isWhatsappConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "gateway twilio configured falhou");
  }
  try {
    gupshupConfigured = isGupshupConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "gateway gupshup configured falhou");
  }

  const [twilioEnabled, gupshupEnabled] = await Promise.all([
    isGatewayEnabled("twilio").catch(() => false),
    isGatewayEnabled("gupshup").catch(() => false),
  ]);

  res.json({
    gateways: [
      {
        provider: "twilio",
        label: "Twilio",
        configured: twilioConfigured,
        enabled: twilioEnabled,
        missingKeys: twilioMissingKeys(),
      },
      {
        provider: "gupshup",
        label: "Gupshup",
        configured: gupshupConfigured,
        enabled: gupshupEnabled,
        missingKeys: gupshupMissingKeys(),
      },
    ],
  });
});

// Escrita de configuracao operacional: exige colaborador logado (a luz/leitura
// segue livre; so a mudanca de estado e protegida, como nas demais escritas
// sensiveis do app).
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

export default router;
