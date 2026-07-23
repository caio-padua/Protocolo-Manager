import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { tenantContextMiddleware } from "./middleware/tenantContext";

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
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(tenantContextMiddleware);

app.use("/api", router);

// ─── Vigilância Drive: execução automática ────────────────────────────────
// Roda a cada 4 horas sem intervenção manual. Primeira rodada 2 min após boot.
import { processWatchedFolders, getWatcherState } from "./lib/drive-watcher.js";

const DRIVE_WATCH_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 horas

function runDriveWatcher() {
  if (getWatcherState().running) return; // já em andamento
  processWatchedFolders({ maxFiles: 50 }).catch((e: unknown) =>
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "drive-watcher: erro no cron")
  );
}

setTimeout(runDriveWatcher, 2 * 60 * 1000);              // primeira execução em 2 min
setInterval(runDriveWatcher, DRIVE_WATCH_INTERVAL_MS);   // recorrente a cada 4h

export default app;
