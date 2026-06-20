import app from "./app";
import { logger } from "./lib/logger";
import { startCronJobs } from "./lib/cron";
import { runSeedSiteContent } from "./lib/seed-site-content";

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
  runSeedSiteContent((m) => logger.info({ seed: "site-content" }, m)).catch((e) =>
    logger.error({ err: e }, "Falha ao semear site-content"),
  );
});
