import type { Request, Response, NextFunction } from "express";
import { redigirPorValor } from "../lib/redact.js";

// Etapa 0: (1) nenhuma rota devolve credencial em claro; (2) rede de seguranca
// global: qualquer resposta JSON passa por varredura de VALOR (formatos
// conhecidos de token), mesmo se uma rota futura esquecer de mascarar.
const ROTAS_DE_REVELACAO = /\/(reveal|revelar)\/?$/i;

export function protecaoCredenciaisMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Canais digitais: revelam so slots NAO secretos (identidade, URL); a rota
  // filtra os secretos por conta propria.
  if (req.method === "POST" && ROTAS_DE_REVELACAO.test(req.path) && !/\/comunicacao\/canais\//.test(req.path)) {
    res.status(403).json({
      error:
        "Revelacao de credenciais desativada. O sistema mostra apenas estado (configurado, validade, ambiente, data de verificacao). Para trocar, informe o novo valor no campo protegido.",
    });
    return;
  }
  const original = res.json.bind(res);
  res.json = ((body: unknown) => original(redigirPorValor(body))) as Response["json"];
  next();
}
