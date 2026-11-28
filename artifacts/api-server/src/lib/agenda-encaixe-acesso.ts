import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { normalizeMatriz, podeUsar, type Matriz } from "@workspace/governanca";
import { condicaoCorpoClinico } from "./corpo-clinico.js";
import { getJsonSetting } from "./secure-settings";

export const FERRAMENTA_ENCAIXE_INTERNO = "agenda_encaixe_interno";

export type AcessoEncaixe =
  | { ok: true; empresaId: number; me: number }
  | { ok: false; status: 401 | 403; code: string; error: string };

/**
 * O CANAL do encaixe interno é decidido AQUI, no servidor, e só pela identidade comprovada da sessão: nunca por
 * parâmetro, cabeçalho ou campo do navegador. Exige, juntos: sessão de colaborador autenticada; empresa da sessão;
 * profissional ATIVO do corpo clínico dessa empresa (ou proprietário da plataforma); e a ferramenta liberada para a
 * categoria na matriz de Governança. Quem não passa recebe recusa explícita; nunca é rebaixado em silêncio para
 * outra regra.
 */
export async function autorizarEncaixeInterno(req: Request): Promise<AcessoEncaixe> {
  const ctx = req.tenantContext;
  const me = ctx?.professionalId;
  if (!ctx?.authenticated || !me || (req.collaborator && req.collaborator.professionalId !== me)) {
    return { ok: false, status: 401, code: "sem_sessao", error: "Entre com seu acesso profissional." };
  }
  const empresaId = ctx.empresaId;
  if (!empresaId) return { ok: false, status: 403, code: "sem_clinica", error: "Sessão sem clínica." };
  const prof = (await db.execute(sql`SELECT p.active, p.category, p.is_platform_owner,
      ${condicaoCorpoClinico(empresaId)} AS da_empresa FROM professionals p WHERE p.id=${me}`)).rows[0];
  if (!prof || prof.active !== true) {
    return { ok: false, status: 403, code: "profissional_inativo", error: "O acesso autenticado não pertence a um profissional ativo." };
  }
  if (prof.is_platform_owner === true) return { ok: true, empresaId, me };
  if (prof.da_empresa !== true) {
    return { ok: false, status: 403, code: "fora_da_empresa", error: "Este profissional não pertence ao corpo clínico desta clínica." };
  }
  const matriz: Matriz = normalizeMatriz(await getJsonSetting<Matriz>("governanca.matriz"));
  if (!podeUsar(matriz, FERRAMENTA_ENCAIXE_INTERNO, String(prof.category ?? ""))) {
    return { ok: false, status: 403, code: "sem_permissao_encaixe",
      error: "Seu perfil não está autorizado ao encaixe rápido interno. Peça ao CEO para liberar em Governança." };
  }
  return { ok: true, empresaId, me };
}
