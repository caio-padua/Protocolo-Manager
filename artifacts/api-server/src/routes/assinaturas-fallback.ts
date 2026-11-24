import { Router } from "express";
import { requireCollaborator } from "./collaborator";
import { requirePlatformOwner } from "../middleware/tenantContext";
import { reenviarFallbacks, saudeFallback } from "../lib/assinatura/fallback";
import {
  ReenviarAssinaturasFallbackBody, ReenviarAssinaturasFallbackResponse,
  GetAssinaturasFallbackSaudeResponse,
} from "@workspace/api-zod";

const router = Router();
router.use("/assinaturas/fallback", requireCollaborator, requirePlatformOwner);
router.get("/assinaturas/fallback/saude", async (req, res): Promise<void> => {
  try {
    res.json(GetAssinaturasFallbackSaudeResponse.parse(await saudeFallback()));
  } catch {
    req.log.error("[assinatura] falha ao consultar fila de reenvio real");
    res.status(503).json({ error: "fila_indisponivel" });
  }
});
router.post("/assinaturas/fallback/reenviar", async (req, res): Promise<void> => {
  if (!ReenviarAssinaturasFallbackBody.safeParse(req.body).success) {
    res.status(400).json({ error: "confirmacao_obrigatoria" });
    return;
  }
  try {
    res.json(ReenviarAssinaturasFallbackResponse.parse(await reenviarFallbacks()));
  } catch {
    req.log.error("[assinatura] falha no lote de reenvio real");
    res.status(503).json({ error: "reenvio_indisponivel" });
  }
});
export default router;
