import { Router, type IRouter } from "express";
import { requireCollaborator } from "./collaborator.js";
import {
  scanWatchedFolders,
  processWatchedFolders,
  getWatcherState,
  getWatcherStats,
  WATCHED_FOLDERS,
} from "../lib/drive-watcher.js";

// ============================================================================
// Rotas do Motor de Vigilância de Pasta Drive
// GET  /api/drive-watcher/status   — estado do worker + stats da tabela
// POST /api/drive-watcher/scan     — só lista arquivos novos (sem processar)
// POST /api/drive-watcher/process  — processa arquivos novos
// ============================================================================

const router: IRouter = Router();

// Todas as rotas exigem colaborador autenticado
router.use(requireCollaborator);

// GET /api/drive-watcher/status
router.get("/drive-watcher/status", async (req, res): Promise<void> => {
  try {
    const [state, stats] = await Promise.all([
      Promise.resolve(getWatcherState()),
      getWatcherStats(),
    ]);
    res.json({ state, stats, watchedFolders: WATCHED_FOLDERS.map((f) => ({ id: f.id, type: f.type, label: f.label })) });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : String(err) }, "drive-watcher/status: erro");
    res.status(500).json({ error: "Erro interno" });
  }
});

// POST /api/drive-watcher/scan
router.post("/drive-watcher/scan", async (req, res): Promise<void> => {
  try {
    const result = await scanWatchedFolders();
    res.json({ ok: true, result });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : String(err) }, "drive-watcher/scan: erro");
    res.status(500).json({ error: "Erro ao escanear pastas" });
  }
});

// POST /api/drive-watcher/process
router.post("/drive-watcher/process", async (req, res): Promise<void> => {
  if (getWatcherState().running) {
    res.status(409).json({ error: "Worker já está rodando" });
    return;
  }
  const maxFiles = req.body?.maxFiles ? parseInt(req.body.maxFiles, 10) : 20;

  // Inicia em background (fire-and-forget) e responde imediatamente
  processWatchedFolders({ maxFiles }).catch((e) =>
    req.log.error({ err: e instanceof Error ? e.message : String(e) }, "drive-watcher/process: fatal")
  );

  res.status(202).json({ ok: true, message: "Processamento iniciado em background" });
});

export default router;
