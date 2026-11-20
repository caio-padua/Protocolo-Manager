import { Router, type IRouter } from "express";
import { consultarLink, LinkIndisponivel } from "../lib/cobranca-link.js";

// Publico (celular do cliente, sem sessao). Token aleatorio + consulta ao provedor a cada abertura.
export const pagamentoLinkPublicRouter: IRouter = Router();

pagamentoLinkPublicRouter.get("/pagamento/:token", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    res.json(await consultarLink(String(req.params.token)));
  } catch (e) {
    if (e instanceof LinkIndisponivel) { res.status(e.codigo).json({ error: e.message }); return; }
    req.log.error({ err: e instanceof Error ? e.constructor.name : typeof e }, "Falha ao consultar link de pagamento");
    res.status(500).json({ error: "Erro interno." });
  }
});
