import app from "./app";
import { logger } from "./lib/logger";
// startCronJobs migrado para api-worker (Onda 2 — evita duplicação em múltiplas réplicas)
import { aquecerBannersAnimados } from "./lib/messaging/banner";
import { ensurePhotoHistoryTable } from "./routes/client-photo.js";
import { ensureTelegramInboxTable } from "./lib/ensure-telegram-inbox.js";
import { runSeedSiteContent } from "./lib/seed-site-content";
import { runSeedMensageriaOpus } from "./lib/seed-mensageria-opus";
import { runSeedDemoRogerio } from "./lib/seed-demo-rogerio";
import { runSeedDieta } from "./lib/seed-dieta";
import { ensureDietaReceitasSchema } from "./lib/ensure-dieta-receitas-schema";
import { ensurePesquisasSchema } from "./lib/ensure-pesquisas-schema";
import { ensureSubstanceApplicationsUnique } from "./lib/ensure-substance-applications-unique";
import { seedDirecoesExames } from "./lib/exam-extraction/seed-direcoes";
import { seedCatalogoAnalitos } from "./lib/exam-extraction/seed-analitos";
import { seedFaixasSexo } from "./lib/exam-extraction/seed-faixas-sexo";
import { refreshCertCache } from "./lib/cert-source";
import { recoverStuckDocuments } from "./routes/exames-lab";
import { purgeOldDeviceOfferLimits } from "./lib/concierge-device-throttle";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Boot sequenciado: migrações críticas rodam ANTES do listen para evitar
// race condition entre requests e criação de tabelas auxiliares.
(async () => {
  try {
    await ensurePhotoHistoryTable();
    logger.info("client_photo_history: tabela pronta antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao criar tabela client_photo_history — abortando boot");
    process.exit(1);
  }

  try {
    await ensureTelegramInboxTable();
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao criar tabela telegram_inbox_messages — abortando boot");
    process.exit(1);
  }

  try {
    await ensureDietaReceitasSchema();
    logger.info("dieta_receitas + colunas de preço do catálogo: schema pronto antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao criar schema de receitas/preços da Dieta — abortando boot");
    process.exit(1);
  }

  try {
    await ensurePesquisasSchema();
    logger.info("pesquisas (Central de Pesquisa/Apify): schema pronto antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao criar schema da Central de Pesquisa — abortando boot");
    process.exit(1);
  }

  try {
    await ensureSubstanceApplicationsUnique();
    logger.info("substance_applications: índice único (session_id, substance_id, session_number) garantido antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao garantir índice único de substance_applications — abortando boot");
    process.exit(1);
  }

  // Semeado (aguardado, não fire-and-forget): protocolos/catálogo/receitas
  // precisam existir ANTES do listen, senão a primeira visita às telas novas
  // de Dieta recebe lista vazia e o React Query trata como resultado final
  // (só corrige com refresh manual). Mesmo tratamento crítico do schema acima.
  try {
    const r = await runSeedDieta((m) => logger.info({ seed: "dieta" }, m));
    logger.info({ seed: "dieta", ...r }, "Tipos de dieta, catálogo e receitas semeados antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao semear tipos de dieta/receitas — abortando boot");
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    // startCronJobs() removido — roda no api-worker (evita duplicação com múltiplas réplicas)
    aquecerBannersAnimados();
    refreshCertCache().catch((e) =>
      logger.error({ err: e }, "Falha ao carregar cache do certificado"),
    );
    runSeedSiteContent((m) => logger.info({ seed: "site-content" }, m)).catch((e) =>
      logger.error({ err: e }, "Falha ao semear site-content"),
    );
    runSeedMensageriaOpus((m) => logger.info({ seed: "mensageria-opus" }, m)).catch((e) =>
      logger.error({ err: e }, "Falha ao semear mensageria-opus"),
    );
    runSeedDemoRogerio((m) => logger.info({ seed: "demo-rogerio" }, m)).catch((e) =>
      logger.error({ err: e }, "Falha ao semear demo Rogério Juarez"),
    );
    seedDirecoesExames()
      .then((r) => logger.info({ seed: "direcoes-exames", ...r }, "Direções de exames semeadas"))
      .catch((e) => logger.error({ err: e }, "Falha ao semear direções de exames"));
    seedCatalogoAnalitos()
      .then((r) => logger.info({ seed: "catalogo-analitos", ...r }, "Catálogo/unidades/faixas semeados"))
      .then(() => seedFaixasSexo())
      .then((r) => logger.info({ seed: "faixas-sexo", ...r }, "Faixas por sexo semeadas"))
      .catch((e) => logger.error({ err: e }, "Falha ao semear catálogo de analitos"));

    // Recupera documentos de exame que ficaram presos em "processando"
    // por reinicializacao do servidor durante a extracao por IA.
    recoverStuckDocuments().catch((e) =>
      logger.error({ err: e }, "[ExamesLab] Falha na recuperacao de documentos presos"),
    );

    // Limpeza preventiva de device_offer_limits no boot: apaga linhas com
    // dia_brt > 2 dias atrás para não acumular entre restarts.
    purgeOldDeviceOfferLimits()
      .then((removed) =>
        logger.info({ removed }, "[device-throttle] Limpeza de linhas antigas concluída no boot"),
      )
      .catch((e) =>
        logger.error({ err: e }, "[device-throttle] Falha na limpeza de linhas antigas no boot"),
      );
  });
})();
