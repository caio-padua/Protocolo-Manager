import { Router, type IRouter } from "express";
import {
  runTransmutacao,
  DEFAULT_CATALOGO_URL,
  DEFAULT_PACIENTES_URL,
} from "../lib/transmutacao";

const router: IRouter = Router();

router.post("/transmutacao/import", async (req, res): Promise<void> => {
  const expected = process.env.ADMIN_IMPORT_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "Importador desabilitado: ADMIN_IMPORT_TOKEN nao configurado" });
    return;
  }
  const token = req.header("x-admin-token");
  if (!token || token !== expected) {
    res.status(401).json({ error: "Token de admin invalido" });
    return;
  }

  const body = (req.body ?? {}) as { catalogoUrl?: string; pacientesUrl?: string };
  const catalogoUrl = typeof body.catalogoUrl === "string" && body.catalogoUrl ? body.catalogoUrl : DEFAULT_CATALOGO_URL;
  const pacientesUrl = typeof body.pacientesUrl === "string" && body.pacientesUrl ? body.pacientesUrl : DEFAULT_PACIENTES_URL;

  try {
    const report = await runTransmutacao({ catalogoUrl, pacientesUrl, log: req.log });
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Falha na transmutacao");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
  }
});

export default router;
