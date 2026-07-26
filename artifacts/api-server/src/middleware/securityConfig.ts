/**
 * securityConfig — CORS, Helmet e rate limit da Onda 1.
 *
 * Escrito pelo Dr. Claude para o Dr. Replit Manager usar direto.
 *
 * Hoje o app.ts tem `app.use(cors())` sem argumento, que responde
 * Access-Control-Allow-Origin: * — qualquer site do mundo pode chamar a API
 * pelo navegador do usuario. Nao ha helmet nem rate limit instalados.
 *
 * DEPENDENCIAS A INSTALAR (runtime, nao dev):
 *   pnpm --filter @workspace/api-server add helmet express-rate-limit
 */

import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import { logger } from "../lib/logger";
import { isRotaIsenta } from "./basicAuth";

/**
 * Origens autorizadas, lidas de ALLOWED_ORIGINS (separadas por virgula).
 * Em producao: os dominios Railway do padcom e do parxis-site.
 */
function origensPermitidas(): string[] {
  const bruto = process.env["ALLOWED_ORIGINS"];

  if (!bruto) {
    if (process.env["NODE_ENV"] === "production") {
      // Nao derruba o boot: derrubar por CORS seria pior que a falha que ele
      // previne. Mas grita, porque em producao isto e configuracao faltando.
      logger.error(
        "ALLOWED_ORIGINS ausente em producao — o navegador so vai aceitar " +
          "chamadas de mesma origem. Defina com os dominios do padcom e do site.",
      );
    }
    return ["http://localhost:5173", "http://localhost:4173", "http://localhost:3000"];
  }

  return bruto
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export const corsMiddleware: RequestHandler = cors({
  origin: origensPermitidas(),
  credentials: true,
});

export const helmetMiddleware: RequestHandler = helmet({
  // O padcom serve o frontend por vite preview em outro dominio, e o
  // api-server responde JSON. CSP aqui nao protege o HTML e costuma quebrar
  // o proxy. A CSP correta e no servidor que entrega o HTML.
  contentSecurityPolicy: false,
  // Permite que o padcom em outro dominio consuma a API.
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

/**
 * Rate limit APENAS das rotas sem senha (portal do paciente e webhooks).
 *
 * Por que so nelas: as rotas administrativas ja exigem credencial, e o CEO
 * operando o Cockpit dispara dezenas de chamadas por tela. Limitar o operador
 * autenticado criaria um bug que parece lentidao do sistema.
 */
export const limitadorPublico: RequestHandler = rateLimit({
  windowMs: 60_000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Rotas atras da senha nao entram na contagem.
  skip: (req) => !isRotaIsenta(req),
  message: { error: "Muitas requisicoes. Aguarde um momento." },
});

/**
 * Limite estreito para as rotas que disparam custo real por chamada
 * (IA, envio de mensagem, OCR de exame). Aplicar rota a rota:
 *
 *   router.post("/agentes/chat", limitadorCaro, handler);
 */
export const limitadorCaro: RequestHandler = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Limite de uso atingido. Aguarde um momento." },
});
