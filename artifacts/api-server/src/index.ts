import app from "./app";
import { logger } from "./lib/logger";
// startCronJobs migrado para api-worker (Onda 2 — evita duplicação em múltiplas réplicas)
import { aquecerBannersAnimados } from "./lib/messaging/banner";
import { ensurePhotoHistoryTable } from "./routes/client-photo.js";
import { ensureExamSetsTable } from "./lib/exam-sets";
import { ensureTelegramInboxTable } from "./lib/ensure-telegram-inbox.js";
import { runSeedSiteContent } from "./lib/seed-site-content";
import { runSeedMensageriaPaxmed } from "./lib/seed-mensageria-paxmed";
import { runSeedDemoRogerio } from "./lib/seed-demo-rogerio";
import { runSeedDieta } from "./lib/seed-dieta";
import { ensureDietaReceitasSchema } from "./lib/ensure-dieta-receitas-schema";
import { ensurePesquisasSchema } from "./lib/ensure-pesquisas-schema";
import { ensureSubstanceApplicationsUnique } from "./lib/ensure-substance-applications-unique";
import { ensureSubstanceBlendsSchema } from "./lib/ensure-substance-blends-schema";
import { ensureProtocolEmissoesTable } from "./routes/protocols.js";
import { ensureEmailLogProtocolId } from "./lib/ensure-email-log-protocol-id";
import { ensureProfessionalClerkIdentitySchema } from "./lib/ensure-professional-clerk-identity-schema";
import { seedDirecoesExames } from "./lib/exam-extraction/seed-direcoes";
import { seedCatalogoAnalitos } from "./lib/exam-extraction/seed-analitos";
import { seedFaixasSexo } from "./lib/exam-extraction/seed-faixas-sexo";
import { refreshCertCache } from "./lib/cert-source";
import { recoverStuckDocuments } from "./routes/exames-lab";
import { purgeOldDeviceOfferLimits } from "./lib/concierge-device-throttle";
import { startWebhookGuard } from "./lib/telegram-webhook-guard";
import { purgeOldDietaPdfs } from "./lib/dieta-planos-storage";
import { checkDicionarioAndAlert } from "./lib/dicionario-sync-alert";

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
    await ensureProfessionalClerkIdentitySchema();
    logger.info("identidades Google por ambiente: schema pronto antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao garantir identidades Google — abortando boot");
    process.exit(1);
  }

  await ensureExamSetsTable();
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

  try {
    await ensureSubstanceBlendsSchema();
    logger.info("substance blends: schema e correção segura da ADEK garantidos antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao garantir schema de blends — abortando boot");
    process.exit(1);
  }

  try {
    await ensureProtocolEmissoesTable();
    logger.info("protocol_emissoes: tabela de auditoria de emissões garantida antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha crítica ao garantir tabela protocol_emissoes — abortando boot");
    process.exit(1);
  }

  try {
    await ensureEmailLogProtocolId();
    logger.info("email_log.protocol_id: coluna de rastreio por protocolo garantida antes do listen");
  } catch (e) {
    logger.error({ err: e }, "Falha ao garantir coluna email_log.protocol_id — abortando boot");
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

  // Copia para o ambiente do processo os segredos que o CEO gravou pela TELA
  // (cofre cifrado). Sem isto, motores antigos que leem `process.env` direto
  // — alerta ao CEO por WhatsApp, chatId do Telegram — ficariam cegos e a tela
  // mostraria "configurado" sem nada funcionar. Nao e critico: se falhar, o
  // servidor sobe do mesmo jeito e o fallback de env continua valendo.
  try {
    const { hydrateEnvFromVault } = await import("./lib/secure-settings.js");
    const { hidratadas } = await hydrateEnvFromVault();
    logger.info(
      { hidratadas, total: hidratadas.length },
      "Segredos do cofre hidratados no ambiente do processo",
    );
  } catch (e) {
    logger.error({ err: e }, "Falha ao hidratar segredos do cofre (boot segue)");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    // startCronJobs() removido — roda no api-worker (evita duplicação com múltiplas réplicas)
    aquecerBannersAnimados();
    // Carrega o cache do certificado (Object Storage / cofre) no boot.
    // A verificação periódica de prazo vive no api-worker (Job 10 — cert-expiry-08h)
    // para evitar alertas duplicados entre réplicas Railway.
    refreshCertCache().catch((e) =>
      logger.error({ err: e }, "Falha ao carregar cache do certificado"),
    );
    runSeedSiteContent((m) => logger.info({ seed: "site-content" }, m)).catch((e) =>
      logger.error({ err: e }, "Falha ao semear site-content"),
    );
    runSeedMensageriaPaxmed((m) => logger.info({ seed: "mensageria-paxmed" }, m)).catch((e) =>
      logger.error({ err: e }, "Falha ao semear mensageria-paxmed"),
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

    // Guard periódico: detecta se o webhook Telegram foi substituído por polling
    // e alerta o CEO via Slack/Telegram. Primeira verificação em 30 s, depois a cada 5 min.
    startWebhookGuard(logger);

    // Verifica sincronismo GLOSSARIO ↔ DICIONARIO.md no boot e alerta no Slack
    // se houver termos faltantes. Roda 10 s após o listen para não disputar
    // recursos com as seeds críticas. Fail-open: nunca derruba o servidor.
    setTimeout(
      () =>
        checkDicionarioAndAlert().catch((e) =>
          logger.error({ err: e }, "[dicionario-sync] Erro inesperado"),
        ),
      10_000,
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

    // Limpeza de PDFs de planos nutricionais com mais de 180 dias: roda no boot
    // e depois a cada 24h para não acumular no Object Storage.
    function runPurgeDietaPdfs() {
      purgeOldDietaPdfs()
        .then((removed) =>
          logger.info({ removed }, "[dieta-pdfs] Limpeza de PDFs antigos concluída"),
        )
        .catch((e) =>
          logger.error({ err: e }, "[dieta-pdfs] Falha na limpeza de PDFs antigos"),
        );
    }
    runPurgeDietaPdfs();
    setInterval(runPurgeDietaPdfs, 24 * 60 * 60 * 1000);

  });
})();
