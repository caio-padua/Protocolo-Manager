import { Router, type IRouter } from "express";
import { isTelegramConfigured } from "../lib/telegram";
import { isWhatsappConfigured } from "../lib/whatsapp";
import { isGmailConnected } from "../lib/google-gmail";
import { isDriveConnected } from "../lib/google-drive";

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

export default router;
