import type { NextFunction, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { normalizeMatriz, podeUsar, type Matriz } from "@workspace/governanca";
import { getJsonSetting } from "./secure-settings";
import { garantirComercial } from "./comercial-migracao";

export const FERRAMENTA_POLITICA_COMERCIAL = "politica_comercial";
export const FERRAMENTA_APROVAR_EXCECAO = "aprovar_excecao";

export type AcessoComercial =
  | { ok: true; empresaId: number; usuarioId: number; donoPlataforma: boolean }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Autoriza SEMPRE no servidor, pela sessão comprovada: colaborador autenticado, profissional ativo, clínica da sessão.
 * Com `ferramenta`, exige ainda a permissão na matriz de Governança (o dono da plataforma passa por fora da matriz).
 * Nunca lê clínica, papel ou permissão de parâmetro, cabeçalho ou corpo.
 */
export async function autorizarComercial(req: Request, ferramenta?: string): Promise<AcessoComercial> {
  const ctx = req.tenantContext;
  const me = ctx?.professionalId;
  if (!ctx?.authenticated || !me || (req.collaborator && req.collaborator.professionalId !== me)) {
    return { ok: false, status: 401, error: "Entre com seu acesso profissional." };
  }
  if (!ctx.empresaId) return { ok: false, status: 403, error: "Sessão sem clínica." };
  const prof = (await db.execute(sql`SELECT active, category, is_platform_owner FROM professionals WHERE id=${me}`)).rows[0];
  if (!prof || prof.active !== true) return { ok: false, status: 403, error: "O acesso autenticado não pertence a um profissional ativo." };
  const dono = prof.is_platform_owner === true;
  if (!dono && ferramenta) {
    const matriz: Matriz = normalizeMatriz(await getJsonSetting<Matriz>("governanca.matriz"));
    if (!podeUsar(matriz, ferramenta, String(prof.category ?? ""))) {
      return { ok: false, status: 403, error: "Seu perfil não tem permissão para esta ação comercial. Peça ao CEO para liberar em Governança." };
    }
  }
  return { ok: true, empresaId: ctx.empresaId, usuarioId: me, donoPlataforma: dono };
}

declare global {
  namespace Express {
    interface Request { comercial?: { empresaId: number; usuarioId: number; donoPlataforma: boolean } }
  }
}

/** Middleware: migra (uma vez), autoriza e deixa `req.comercial` pronto. Recusa explícita; nunca rebaixa em silêncio. */
export function exigirComercial(ferramenta?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      await garantirComercial(pool);
      const a = await autorizarComercial(req, ferramenta);
      if (!a.ok) {
        // Tentativa recusada fica na trilha da PRÓPRIA clínica da sessão (sem sessão/clínica, só no log). Nada de outra clínica é citado.
        const empresa = req.tenantContext?.empresaId;
        if (empresa && Number.isSafeInteger(empresa)) {
          await pool.query(
            `INSERT INTO budget_eventos (empresa_id,budget_id,tipo,usuario_id,detalhe) VALUES ($1,0,'acesso_recusado',$2,$3::jsonb)`,
            [empresa, req.tenantContext?.professionalId ?? null, JSON.stringify({ metodo: req.method, rota: req.baseUrl + req.path, status: a.status, ferramenta: ferramenta ?? null })],
          ).catch(() => undefined);
        }
        req.log?.warn?.({ status: a.status, rota: req.path }, "acesso comercial recusado");
        res.status(a.status).json({ error: a.error });
        return;
      }
      req.comercial = { empresaId: a.empresaId, usuarioId: a.usuarioId, donoPlataforma: a.donoPlataforma };
      next();
    })().catch(next);
  };
}
