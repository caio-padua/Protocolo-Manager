/**
 * securityConfig — CORS fechado + Helmet + Rate Limit
 *
 * CORS: lista de origens permitidas via ALLOWED_ORIGINS (env, vírgula-separado).
 *       Fallback para localhost em desenvolvimento.
 *
 * Helmet: cabeçalhos HTTP de segurança padrão (X-Frame-Options, HSTS, etc.)
 *         CSP desabilitado — o proxy Railway não precisa e pode interferir.
 *
 * Rate Limit: 200 requisições por minuto por IP.
 *             Aplicado apenas nas rotas protegidas por Basic Auth.
 *             Rotas de operação interna (Cockpit, etc.) disparam dezenas de
 *             requisições por tela — 200/min é o piso seguro para operação real.
 *
 * Nota: este arquivo exporta três middlewares separados para que app.ts
 * possa ordenar corretamente: cors → helmet → basicAuth → rateLimit → rotas.
 */

import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { logger } from "../lib/logger";

function buildAllowedOrigins(): string[] {
  // Lê ALLOWED_ORIGINS (lista manual do operador, separada por vírgula).
  const fromManual = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  // Lê REPLIT_DOMAINS (injetada automaticamente pela plataforma Replit em
  // todos os ambientes — dev e deploy). Adiciona automaticamente sem precisar
  // que o operador copie o valor para ALLOWED_ORIGINS.
  const fromReplit = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .map((d) => (d.startsWith("http") ? d : `https://${d}`));

  // União sem duplicatas.
  const merged = Array.from(new Set([...fromManual, ...fromReplit]));

  if (merged.length === 0) {
    logger.warn(
      "ALLOWED_ORIGINS e REPLIT_DOMAINS não definidas. Usando fallback de " +
      "desenvolvimento (localhost:5173 e localhost:4173). Em produção, defina " +
      "ALLOWED_ORIGINS com o domínio do frontend."
    );
    return ["http://localhost:5173", "http://localhost:4173"];
  }

  logger.info({ origens: merged }, "CORS: origens permitidas carregadas");
  return merged;
}

const allowedOrigins = buildAllowedOrigins();

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origem não permitida — ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-scheduling-token"],
});

export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
});

export const rateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas requisições. Aguarde um momento e tente novamente." },
  skip: (req) => {
    const p = req.path;
    return (
      p === "/api/healthz" ||
      p === "/api/health" ||
      p.startsWith("/api/health/") ||
      p.startsWith("/api/whatsapp/inbound") ||
      p.startsWith("/api/webhooks")
    );
  },
});
