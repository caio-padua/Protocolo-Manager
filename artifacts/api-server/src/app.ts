import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { checkAiSetup } from "./lib/ai-central";
import { tenantContextMiddleware } from "./middleware/tenantContext";
import { corsMiddleware, helmetMiddleware, rateLimitMiddleware } from "./middleware/securityConfig";
import { basicAuthMiddleware } from "./middleware/basicAuth";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

// Replit usa um proxy reverso entre o cliente e o app.
// trust proxy: 1 diz ao Express para confiar em 1 salto de proxy (o proxy Replit).
// Com isso, req.ip resolve para o IP real do cliente (via XFF adicionado pelo proxy),
// e NÃO para o XFF enviado pelo próprio cliente — essencial para o fingerprint
// antiautomação do Concierge (ARQUITETURA.md §6.2).
app.set("trust proxy", 1);

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

// O proxy do Clerk precisa vir antes dos parsers, pois encaminha o corpo bruto.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Ordem obrigatória:
// 1. CORS primeiro — o preflight OPTIONS não carrega credencial;
//    se o Basic Auth vier antes, o padcom leva 401 no preflight.
// 2. Helmet — cabeçalhos de segurança HTTP.
// 3. Body parsers — antes do Basic Auth para poder ler webhooks.
// 4. Clerk — valida a sessão Google, sem substituir o token de colaborador.
// 5. Basic Auth — porta de entrada única do sistema.
// 6. Rate limit — após o Basic Auth (rotas do paciente já passaram pelo bypass).
// 7. Tenant context — só para as rotas autenticadas.
app.use(corsMiddleware);
app.use(helmetMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
// Rota pública — serve o PDF de pré-visualização da capa sem autenticação.
// Remove este bloco quando a tarefa de validação visual estiver concluída.
app.get("/preview-capa.pdf", (_req, res) => {
  // Procura o arquivo em src/../assets (dev) e dist/../assets (produção)
  const candidates = [
    path.resolve(import.meta.dirname, "../assets/preview-capa.pdf"),
    path.resolve(import.meta.dirname, "../../assets/preview-capa.pdf"),
  ];
  const p = candidates.find(c => fs.existsSync(c));
  if (!p) { res.status(404).send("preview não encontrado"); return; }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=capa-padaxor.pdf");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(p).pipe(res);
});

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
