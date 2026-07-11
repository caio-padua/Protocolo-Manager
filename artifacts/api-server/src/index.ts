import app from "./app";
import { logger } from "./lib/logger";
import { startCronJobs } from "./lib/cron";
import { runSeedSiteContent } from "./lib/seed-site-content";
import { runSeedMensageriaOpus } from "./lib/seed-mensageria-opus";
import { runSeedDemoRogerio } from "./lib/seed-demo-rogerio";
import { refreshCertCache } from "./lib/cert-source";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startCronJobs();
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
});
