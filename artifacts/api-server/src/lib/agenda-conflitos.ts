import { sql } from "drizzle-orm";
import type { AgendaExecutor } from "./agenda-occupancy";

/**
 * Conflitos de horário e travas de participantes da agenda.
 *
 * A trava por clínica (19872026) já serializa as marcações da MESMA clínica. Ela não protege dois casos:
 *  1. o mesmo profissional atendendo em duas clínicas (cada clínica tem a sua trava);
 *  2. o mesmo cliente em duas agendas (a verificação de conflito lê o banco antes de gravar; sem trava
 *     própria do cliente, duas transações leem "livre" ao mesmo tempo e as duas gravam).
 *
 * Ordem OBRIGATÓRIA de aquisição, em toda transação que grava sessão: clínica -> profissionais (ids crescentes)
 * -> cliente. Uma ordem única entre todos os caminhos impede impasse (deadlock). Travas são transacionais:
 * soltam sozinhas no COMMIT ou no ROLLBACK.
 */
export const TRAVA_PROFISSIONAL = 19872031;
export const TRAVA_CLIENTE = 19872032;

export const STATUS_QUE_OCUPAM = ["scheduled", "confirmed", "completed"];

export async function travarParticipantes(
  executor: AgendaExecutor,
  p: { professionalIds: (number | null | undefined)[]; clientId: number },
): Promise<void> {
  const ids = [...new Set(p.professionalIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0))].sort((a, b) => a - b);
  for (const id of ids) await executor.execute(sql`SELECT pg_advisory_xact_lock(${TRAVA_PROFISSIONAL},${id})`);
  await executor.execute(sql`SELECT pg_advisory_xact_lock(${TRAVA_CLIENTE},${p.clientId})`);
}

const toMinutes = (hhmm: string) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };

export type ConflitoDeHorario =
  | { tipo: "agenda"; error: string }
  | { tipo: "profissional"; error: string }
  | { tipo: "cliente"; error: string };

export const MENSAGEM_AGENDA_OCUPADA = "Horário já ocupado";
export const MENSAGEM_CLIENTE_OCUPADO = "O cliente já tem outra marcação que se sobrepõe a este horário";

/**
 * Procura sobreposição do INTERVALO COMPLETO [início, início + duração) com sessões ativas do mesmo dia.
 *
 * - agenda: mesma agenda (recurso);
 * - profissional: sessão em agenda VINCULADA ao mesmo profissional, em QUALQUER clínica. O profissional só é
 *   considerado ocupado por agenda dele: o campo "profissional" da sessão de enfermagem guarda o prescritor do
 *   protocolo e não prova presença, por isso não entra aqui;
 * - cliente: outra sessão do mesmo cliente. Sessões da mesma ocorrência de equipe conjunta (mesmo procedimento
 *   feito ao mesmo tempo por mais de um profissional) NÃO são conflito entre si.
 *
 * A mensagem é sempre genérica: nunca indica clínica, profissional, agenda ou paciente de terceiros.
 * Deve ser chamada DEPOIS de travarParticipantes, dentro da mesma transação.
 */
export async function acharConflitoDeHorario(
  executor: AgendaExecutor,
  p: {
    date: string; time: string; durationMinutes: number; slotMinutes: number;
    resourceId: number; professionalId: number | null; clientId: number;
    ignoreSessionIds?: number[];
  },
): Promise<ConflitoDeHorario | null> {
  const start = toMinutes(p.time);
  const end = start + p.durationMinutes;
  const ignore = p.ignoreSessionIds ?? [];
  const ignoreList = `{${ignore.join(",")}}`;
  const found = await executor.execute(sql`
    SELECT s.id, s.client_id, s.resource_id, s.scheduled_time,
      COALESCE(s.duration_minutes, r.slot_minutes, ${p.slotMinutes}) AS duration, r.professional_id AS agenda_professional
    FROM sessions s
    LEFT JOIN agenda_resources r ON r.id=s.resource_id
    WHERE s.scheduled_date=${p.date} AND s.status=ANY(${`{${STATUS_QUE_OCUPAM.join(",")}}`}::text[]) AND NOT s.agenda_archived
      AND NOT (s.id=ANY(${ignoreList}::int[]))
      AND (s.resource_id=${p.resourceId} OR s.client_id=${p.clientId}
        OR (${p.professionalId}::int IS NOT NULL AND r.professional_id=${p.professionalId}::int))`);
  const overlapping = found.rows.filter((row) => {
    const from = toMinutes(String(row.scheduled_time));
    return start < from + Number(row.duration) && end > from;
  });
  if (!overlapping.length) return null;
  if (overlapping.some((row) => Number(row.resource_id) === p.resourceId)) {
    return { tipo: "agenda", error: MENSAGEM_AGENDA_OCUPADA };
  }
  if (p.professionalId != null && overlapping.some((row) => row.agenda_professional != null && Number(row.agenda_professional) === p.professionalId)) {
    return { tipo: "profissional", error: MENSAGEM_AGENDA_OCUPADA };
  }
  const doCliente = overlapping.filter((row) => Number(row.client_id) === p.clientId);
  if (!doCliente.length) return null;
  const irmas = await irmasDeEquipeConjunta(executor, ignore);
  if (doCliente.some((row) => !irmas.has(Number(row.id)))) {
    return { tipo: "cliente", error: MENSAGEM_CLIENTE_OCUPADO };
  }
  return null;
}

/** Sessões que pertencem à mesma ocorrência de equipe conjunta de alguma das sessões informadas. */
async function irmasDeEquipeConjunta(executor: AgendaExecutor, sessionIds: number[]): Promise<Set<number>> {
  if (!sessionIds.length) return new Set();
  const exists = await executor.execute(sql`SELECT to_regclass('protocolo_ocorrencia_participantes') AS t`);
  if (!exists.rows[0]?.t) return new Set();
  const irmas = await executor.execute(sql`SELECT DISTINCT b.session_id FROM protocolo_ocorrencia_participantes a
    JOIN protocolo_ocorrencia_participantes b ON b.ocorrencia_id=a.ocorrencia_id
    WHERE a.session_id=ANY(${`{${sessionIds.join(",")}}`}::int[]) AND b.session_id IS NOT NULL`);
  return new Set(irmas.rows.map((r) => Number(r.session_id)));
}
