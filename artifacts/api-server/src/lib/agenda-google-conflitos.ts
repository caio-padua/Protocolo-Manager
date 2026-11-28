import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import type { GoogleConflito, IntervaloEvento } from "./google-conflito";

/**
 * Trilha dos conflitos de edição concorrente com o Google. Nunca guarda título, descrição, nome de cliente ou CPF:
 * só horários e identificadores. A decisão (enviar o do sistema ou dispensar) é sempre humana e fica registrada.
 */
export interface ConflitoGoogleLinha {
  id: number; sessaoId: number; tipo: "alterado" | "apagado"; estado: "aberto" | "resolvido" | "dispensado";
  agenda: string | null; remotoInicio: string | null; remotoFim: string | null;
  sistemaInicio: string | null; sistemaFim: string | null; criadoEm: string; resolvidoEm: string | null; decisao: string | null;
}

export async function registrarConflitoGoogle(p: {
  empresaId: number | null; sessaoId: number; calendarId: string; eventId: string;
  conflito: GoogleConflito; sistema: IntervaloEvento;
}): Promise<void> {
  if (p.empresaId == null) { logger.warn({ sessaoId: p.sessaoId }, "Conflito com o Google sem empresa: não registrado"); return; }
  try {
    await db.execute(sql`
      INSERT INTO agenda_google_conflitos
        (empresa_id, sessao_id, google_calendar_id, google_event_id, tipo, remoto_inicio, remoto_fim, sistema_inicio, sistema_fim)
      VALUES (${p.empresaId}, ${p.sessaoId}, ${p.calendarId}, ${p.eventId}, ${p.conflito.tipo},
        ${p.conflito.remoto?.inicio ?? null}, ${p.conflito.remoto?.fim ?? null},
        ${p.sistema.inicio}::timestamptz, ${p.sistema.fim}::timestamptz)
      ON CONFLICT (sessao_id) WHERE estado = 'aberto' DO UPDATE SET
        tipo = EXCLUDED.tipo, remoto_inicio = EXCLUDED.remoto_inicio, remoto_fim = EXCLUDED.remoto_fim,
        sistema_inicio = EXCLUDED.sistema_inicio, sistema_fim = EXCLUDED.sistema_fim, atualizado_em = now()`);
  } catch (error) {
    // O bloqueio da sobrescrita não depende do registro; a falha do registro é visível no log do servidor.
    logger.error({ err: error, sessaoId: p.sessaoId }, "Não foi possível registrar o conflito com o Google");
  }
}

export async function listarConflitosGoogle(empresaId: number, estado: "aberto" | "todos" = "aberto"): Promise<ConflitoGoogleLinha[]> {
  const filtroEstado = estado === "aberto" ? sql`AND c.estado = 'aberto'` : sql``;
  const { rows } = await db.execute(sql`
    SELECT c.id, c.sessao_id AS "sessaoId", c.tipo, c.estado, r.name AS agenda,
      c.remoto_inicio AS "remotoInicio", c.remoto_fim AS "remotoFim",
      c.sistema_inicio AS "sistemaInicio", c.sistema_fim AS "sistemaFim",
      c.criado_em AS "criadoEm", c.resolvido_em AS "resolvidoEm", c.decisao
    FROM agenda_google_conflitos c
    LEFT JOIN agenda_resources r ON r.google_calendar_id = c.google_calendar_id
    WHERE c.empresa_id = ${empresaId} ${filtroEstado}
    ORDER BY c.id DESC LIMIT 200`);
  return rows.map((r: any) => ({
    ...r, id: Number(r.id), sessaoId: Number(r.sessaoId),
    sistemaInicio: r.sistemaInicio ? new Date(r.sistemaInicio).toISOString() : null,
    sistemaFim: r.sistemaFim ? new Date(r.sistemaFim).toISOString() : null,
    criadoEm: new Date(r.criadoEm).toISOString(),
    resolvidoEm: r.resolvidoEm ? new Date(r.resolvidoEm).toISOString() : null,
  })) as ConflitoGoogleLinha[];
}

export async function carregarConflitoAberto(empresaId: number, id: number) {
  const { rows } = await db.execute(sql`SELECT id, sessao_id AS "sessaoId", estado FROM agenda_google_conflitos
    WHERE id = ${id} AND empresa_id = ${empresaId}`);
  const row = rows[0] as { id: number; sessaoId: number; estado: string } | undefined;
  return row ? { id: Number(row.id), sessaoId: Number(row.sessaoId), estado: row.estado } : null;
}

/** Fecha o conflito só se ainda estiver aberto (idempotente em clique duplo). */
export async function fecharConflitoGoogle(empresaId: number, id: number, estado: "resolvido" | "dispensado",
  decisao: string, atorId: number | null): Promise<boolean> {
  const { rows } = await db.execute(sql`UPDATE agenda_google_conflitos
    SET estado = ${estado}, decisao = ${decisao}, ator_id = ${atorId}, resolvido_em = now(), atualizado_em = now()
    WHERE id = ${id} AND empresa_id = ${empresaId} AND estado = 'aberto' RETURNING id`);
  return rows.length > 0;
}
