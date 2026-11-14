import { Router } from "express";
import type { Request, Response } from "express";
import { requireCollaborator } from "./collaborator";
import { requireCeoInstance } from "../middleware/tenantContext";
import { estadoTodas, verificarEGravar, CHAVES_ACOMPANHADAS } from "../lib/cofre-estado";

const router = Router();

// Somente metadados: configurado, origem, ambiente, validade, verificacao, rotacao.
router.get("/cofre/estado", requireCollaborator, requireCeoInstance, async (_req: Request, res: Response) => {
  res.json({ credenciais: await estadoTodas() });
});

router.post("/cofre/verificar", requireCollaborator, requireCeoInstance, async (req: Request, res: Response) => {
  const chave = typeof req.body?.chave === "string" ? req.body.chave : "";
  if (!CHAVES_ACOMPANHADAS.includes(chave)) { res.status(400).json({ error: "Credencial desconhecida." }); return; }
  res.json(await verificarEGravar(chave));
});

export default router;
