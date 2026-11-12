import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { normalizeMatriz, podeUsar, type Matriz } from "@workspace/governanca";
import { condicaoCorpoClinico } from "./corpo-clinico.js";
import { getJsonSetting } from "./secure-settings";

export const FERRAMENTA_PIT_STOP = "agenda_gerenciamento";

export type AcessoPitStop =
  | { ok: true; empresaId: number; me: number }
  | { ok: false; status: 401 | 403; code: string; error: string };

/**
 * Autoriza gerenciar e confirmar planos do Pit Stop SEM depender de vínculo legado com local nem de ser o
 * profissional executor. Exige, juntos: sessão de colaborador ativa; empresa da sessão; ser do corpo clínico DESSA empresa
 * (ou proprietário da plataforma); e a ferramenta liberada para a categoria na matriz de Governança.
 */
export async function autorizarPitStop(req: Request): Promise<AcessoPitStop> {
  const ctx = req.tenantContext;
  const me = req.collaborator?.professionalId;
  if (!req.collaborator || !me || !ctx?.authenticated) {
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
  if (!podeUsar(matriz, FERRAMENTA_PIT_STOP, String(prof.category ?? ""))) {
    return { ok: false, status: 403, code: "sem_permissao_pit_stop",
      error: "Seu perfil não está autorizado a gerenciar a Agenda Gerenciamento. Peça ao CEO para liberar em Governança." };
  }
  return { ok: true, empresaId, me };
}
