import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { checkAiSetup } from "./lib/ai-central";
import { tenantContextMiddleware } from "./middleware/tenantContext";
import { corsMiddleware, helmetMiddleware, rateLimitMiddleware } from "./middleware/securityConfig";
import { basicAuthMiddleware } from "./middleware/basicAuth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Ordem obrigatória:
// 1. CORS primeiro — o preflight OPTIONS não carrega credencial;
//    se o Basic Auth vier antes, o padcom leva 401 no preflight.
// 2. Helmet — cabeçalhos de segurança HTTP.
// 3. Body parsers — antes do Basic Auth para poder ler webhooks.
// 4. Basic Auth — porta de entrada única do sistema.
// 5. Rate limit — após o Basic Auth (rotas do paciente já passaram pelo bypass).
// 6. Tenant context — só para as rotas autenticadas.
app.use(corsMiddleware);
app.use(helmetMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(basicAuthMiddleware);
app.use(rateLimitMiddleware);
app.use(tenantContextMiddleware);

// ─── DICIONARIO: sincronizar aba Google Sheets no boot ───────────────────────
// Adiciona termos novos do GLOSSARIO sem sobrescrever o que o CEO preencheu.
import("./lib/sheets-dicionario").then(({ sincronizarDicionarioSheets }) => {
  const sid = process.env.PADAXOR_PLANILHA_ID ?? "1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw";
  sincronizarDicionarioSheets(sid)
    .then(log => logger.info({ log }, "sheets-dicionario: sync no boot concluído"))
    .catch(err => logger.warn({ err }, "sheets-dicionario: sync no boot falhou (ignorado)"));
}).catch(() => { /* módulo não carregado — ignora */ });

// ─── AVATARES: seed dos 3 avatares do Instituto Pádua no boot ────────────────
import("./lib/seed-avatares").then(({ runSeedAvatares }) => {
  runSeedAvatares((msg) => logger.info({ msg }, "seed-avatares"))
    .then(r => logger.info(r, "seed-avatares: concluído"))
    .catch(err => logger.warn({ err }, "seed-avatares: falhou (ignorado)"));
}).catch(() => { /* módulo não carregado — ignora */ });

// ─── AI Central: verifica configuração do guard de clone no boot ─────────────
checkAiSetup({
  warn: (msg: string) => logger.warn(msg),
  info: (msg: string) => logger.info(msg),
});

// ─── IS_CLONE: bloqueia rotas de IA quando é clone de clínica ───────────────
// Um clone NÃO deve ter acesso aos agentes de IA do PADAXOR Central.
// Rotas de IA vivem em /api/agentes/* e /api/agentes-chat/*.
// LINHA VERMELHA: nunca criar clone até separação física da IA (ver Onda 4).
if (process.env.IS_CLONE === "true") {
  app.use("/api/agentes", (_req, res) => {
    res.status(503).json({
      error: "Módulo de IA não disponível nesta instância.",
      hint: "Os agentes de IA são exclusivos da plataforma central PADAXOR.",
    });
  });
  app.use("/api/agentes-chat", (_req, res) => {
    res.status(503).json({
      error: "Módulo de IA não disponível nesta instância.",
      hint: "Os agentes de IA são exclusivos da plataforma central PADAXOR.",
    });
  });
}

app.use("/api", router);

// Drive Watcher e cron jobs removidos do api-server (Onda 2).
// Agora vivem exclusivamente no api-worker para evitar duplicação
// com múltiplas réplicas Railway. Ver: artifacts/api-worker/src/worker.ts

export default app;
