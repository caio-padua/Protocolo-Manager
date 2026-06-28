// Rota PÚBLICA do banner de marca PAXTER (imagem). Precisa ficar acessível sem
// sessão porque é buscada por provedores externos (Twilio MediaUrl, Telegram
// sendPhoto). Registrada ANTES do portão de colaborador no barril de rotas.
import { Router, type IRouter } from "express";
import { renderPaxterBannerPng } from "../lib/messaging/banner.js";

const router: IRouter = Router();

router.get("/brand/paxter-banner.png", (_req, res): void => {
  const png = renderPaxterBannerPng();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.end(png);
});

export default router;
