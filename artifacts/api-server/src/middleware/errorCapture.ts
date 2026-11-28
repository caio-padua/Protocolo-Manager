import type { Request, Response, NextFunction } from "express";
import { redigirTexto } from "../lib/redact";
import { registrarErroSistema } from "../lib/system-error-log";

// Captura toda resposta 5xx (erro do servidor) para a Central de Erros.
// Se a rota ja registrou com detalhe (res.locals.erroRegistrado), nao duplica.
export function errorCaptureMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 500 && !res.locals.erroRegistrado) {
      const msg = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error : null;
      res.locals.erroRegistrado = true;
      registrarErroSistema({
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        message: msg ? redigirTexto(msg) : msg,
        professionalId: req.collaborator?.professionalId ?? null,
      });
    }
    return originalJson(body);
  }) as Response["json"];
  next();
}
