/**
 * basicAuth — Porta de entrada única para o sistema PADAXOR
 *
 * Operador único: Dr. Caio. Uma senha. Fail-closed no boot.
 * Comparação em tempo constante (timingSafeEqual) para evitar ataque de tempo.
 *
 * EXCEÇÕES (sem Basic Auth — trava própria ou provedor externo):
 *
 *  Health check:
 *    /api/health, /api/healthz
 *
 *  Portal do paciente (token HMAC próprio):
 *    /api/area-paciente, /api/client-portal, /api/anamnese-portal,
 *    /api/anamnese-v2, /api/client-photo, /api/client-registration,
 *    /api/scheduling, /api/ical
 *
 *  Webhooks externos (assinatura do provedor):
 *    /api/brand            — imagens públicas para Twilio/Telegram
 *    /api/webhooks         — ZapSign (/webhooks/assinatura) + Telegram
 *    /api/whatsapp/inbound — Twilio InboundRequestUrl
 *    /api/whatsapp/status  — Twilio StatusCallback
 *    /api/asaas            — webhook + cobranças (requireCollaborator interno)
 *
 * ATENÇÃO: este middleware deve vir DEPOIS do cors() em app.ts.
 * O preflight OPTIONS do navegador não carrega credencial; se o Basic Auth
 * vier antes do CORS, o padcom leva 401 no preflight e não fala com a API.
 */

import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual, createHash } from "crypto";
import { logger } from "../lib/logger";

const BYPASS_PREFIXES = [
  "/api/health",
  "/api/healthz",
  "/api/area-paciente",
  "/api/client-portal",
  "/api/anamnese-portal",
  "/api/anamnese-v2",
  "/api/client-photo",
  "/api/client-registration",
  "/api/scheduling",
  "/api/ical",
  "/api/brand",
  "/api/webhooks",
  "/api/whatsapp/inbound",
  "/api/whatsapp/status",
  "/api/asaas",
];

function isPublicPath(path: string): boolean {
  return BYPASS_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + "/")
  );
}

function toFixedBuffer(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function buildMiddleware() {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;
  const isProd = process.env.NODE_ENV === "production";

  // Produção: fail-closed — o servidor não sobe sem credenciais.
  // Desenvolvimento: warn + bypass (API não é pública no Replit).
  if (!user || !pass) {
    if (isProd) {
      logger.fatal(
        "FATAL: ADMIN_USERNAME e/ou ADMIN_PASSWORD não definidas em produção. " +
        "O servidor não pode subir sem porta travada. " +
        "Defina as variáveis de ambiente e reinicie."
      );
      process.exit(1);
    }
    logger.warn(
      "ADMIN_USERNAME e/ou ADMIN_PASSWORD não definidas. " +
      "Basic Auth DESATIVADO (modo desenvolvimento). " +
      "Em produção (NODE_ENV=production), defina essas variáveis."
    );
    // Bypass completo em desenvolvimento: qualquer rota passa.
    return function basicAuthBypass(
      _req: Request,
      _res: Response,
      next: NextFunction
    ): void {
      next();
    };
  }

  const expectedUserBuf = toFixedBuffer(user);
  const expectedPassBuf = toFixedBuffer(pass);

  return function basicAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (isPublicPath(req.path)) {
      next();
      return;
    }

    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Padaxor"');
      res.status(401).json({ error: "Autenticação necessária." });
      return;
    }

    let decoded: string;
    try {
      decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    } catch {
      res.setHeader("WWW-Authenticate", 'Basic realm="Padaxor"');
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }

    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Padaxor"');
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }

    const sentUser = decoded.slice(0, colonIdx);
    const sentPass = decoded.slice(colonIdx + 1);

    const sentUserBuf = toFixedBuffer(sentUser);
    const sentPassBuf = toFixedBuffer(sentPass);

    const userMatch = timingSafeEqual(expectedUserBuf, sentUserBuf);
    const passMatch = timingSafeEqual(expectedPassBuf, sentPassBuf);

    if (!userMatch || !passMatch) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Padaxor"');
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }

    next();
  };
}

export const basicAuthMiddleware = buildMiddleware();
