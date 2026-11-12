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

export type SessaoCandidata = {
  id: number; clientId: number; resourceId: number | null; scheduledTime: string;
  duration: number; agendaProfessional: number | null;
};

/**
 * Sessões ativas do dia que podem colidir: da mesma agenda, do mesmo cliente ou de agenda do mesmo profissional
 * (qualquer clínica). Uma só leitura serve à marcação (um horário) e ao seletor (todos os horários do dia).
 */
export async function listarSessoesCandidatas(
  executor: AgendaExecutor,
  p: { date: string; slotMinutes: number; resourceId: number; professionalId: number | null; clientId: number | null; ignoreSessionIds?: number[] },
): Promise<SessaoCandidata[]> {
  const ignoreList = `{${(p.ignoreSessionIds ?? []).join(",")}}`;
  // Fragmentos condicionais: parâmetro nulo tipado (${null}::int) não é enviado ao Postgres.
  const porCliente = p.clientId != null ? sql`OR s.client_id=${p.clientId}` : sql``;
  const porProfissional = p.professionalId != null ? sql`OR r.professional_id=${p.professionalId}` : sql``;
  const found = await executor.execute(sql`
    SELECT s.id, s.client_id, s.resource_id, s.scheduled_time,
      COALESCE(s.duration_minutes, r.slot_minutes, ${p.slotMinutes}) AS duration, r.professional_id AS agenda_professional
    FROM sessions s
    LEFT JOIN agenda_resources r ON r.id=s.resource_id
    WHERE s.scheduled_date=${p.date} AND s.status=ANY(${`{${STATUS_QUE_OCUPAM.join(",")}}`}::text[]) AND NOT s.agenda_archived
      AND NOT (s.id=ANY(${ignoreList}::int[]))
      AND (s.resource_id=${p.resourceId} ${porCliente} ${porProfissional})`);
  return found.rows.map((row) => ({
    id: Number(row.id), clientId: Number(row.client_id),
    resourceId: row.resource_id == null ? null : Number(row.resource_id),
    scheduledTime: String(row.scheduled_time), duration: Number(row.duration),
    agendaProfessional: row.agenda_professional == null ? null : Number(row.agenda_professional),
  }));
}

/**
 * Regra ÚNICA de sobreposição do intervalo [início, fim) (em minutos do dia) contra as sessões candidatas.
 * Pura: a marcação e o seletor chamam a mesma função, então decidem igual.
 */
export function classificarSobreposicao(
  rows: SessaoCandidata[],
  p: { start: number; end: number; resourceId: number; professionalId: number | null; clientId: number | null },
  irmas: Set<number> = new Set(),
): ConflitoDeHorario | null {
  const overlapping = rows.filter((row) => {
    const from = toMinutes(row.scheduledTime);
    return p.start < from + row.duration && p.end > from;
  });
  if (!overlapping.length) return null;
  if (overlapping.some((row) => row.resourceId === p.resourceId)) {
    return { tipo: "agenda", error: MENSAGEM_AGENDA_OCUPADA };
  }
  if (p.professionalId != null && overlapping.some((row) => row.agendaProfessional != null && row.agendaProfessional === p.professionalId)) {
    return { tipo: "profissional", error: MENSAGEM_AGENDA_OCUPADA };
  }
  if (p.clientId == null) return null;
  const doCliente = overlapping.filter((row) => row.clientId === p.clientId);
  if (doCliente.some((row) => !irmas.has(row.id))) {
    return { tipo: "cliente", error: MENSAGEM_CLIENTE_OCUPADO };
  }
  return null;
}

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
  const ignore = p.ignoreSessionIds ?? [];
  const rows = await listarSessoesCandidatas(executor, p);
  const irmas = ignore.length ? await irmasDeEquipeConjunta(executor, ignore) : new Set<number>();
  return classificarSobreposicao(rows, {
    start, end: start + p.durationMinutes, resourceId: p.resourceId, professionalId: p.professionalId, clientId: p.clientId,
  }, irmas);
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
