import { and, desc, eq, sql } from "drizzle-orm";
import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, clientVisitPreferenceRevisionsTable, db, locationsTable,
  type ClientVisitPreferences,
} from "@workspace/db";
import { computeAgendaSlots } from "./agenda-motor";

type Executor = Pick<typeof db, "select" | "insert" | "execute">;
type Kind = "medical" | "nursing";
type WindowRow = {
  name: string; kind: string; slotMinutes: number; weekday: number | null;
  startTime: string | null; endTime: string | null;
};
export type VisitOptions = Record<Kind, {
  days: { weekday: number; times: string[] }[];
  mismatchedResources: string[];
}>;
export class VisitPreferenceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const emptyVisitPreferences = (): ClientVisitPreferences => ({
  medical: { weekdays: [], times: [] }, nursing: { weekdays: [], times: [] },
});

// São referências semanais, não vagas. Exceções e ocupações são resolvidas
// pelo motor na data escolhida, não neste cadastro.
export function buildVisitOptions(rows: WindowRow[], blockMinutes: number): VisitOptions {
  const result: VisitOptions = {
    medical: { days: [], mismatchedResources: [] },
    nursing: { days: [], mismatchedResources: [] },
  };
  const days: Record<Kind, Map<number, Set<string>>> = { medical: new Map(), nursing: new Map() };
  for (const row of rows) {
    const kind: Kind | null = row.kind === "medico" ? "medical" : row.kind === "enfermagem" ? "nursing" : null;
    if (!kind) continue;
    const expected = kind === "medical" ? 60 : 20;
    if (row.slotMinutes !== expected) {
      if (!result[kind].mismatchedResources.includes(row.name)) result[kind].mismatchedResources.push(row.name);
      continue;
    }
    if (row.weekday == null || row.weekday < 0 || row.weekday > 6 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime ?? "") ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime ?? "")) continue;
    const options = days[kind].get(row.weekday) ?? new Set<string>();
    // A data é apenas referência para calcular a geometria: ocupação, exceção
    // e liberação continuam sendo verificadas pelo motor na data da marcação.
    const geometry = computeAgendaSlots({
      windows: [{ startTime: row.startTime!, endTime: row.endTime! }],
      slotMinutes: row.slotMinutes,
      settings: { blockMinutes, triggerPercent: 0, minLeadHours: 0 },
      occupiedTimes: new Set(), now: new Date(0), date: "2099-01-01", isException: false,
    });
    for (const slot of geometry.slots) options.add(slot.time);
    if (options.size) days[kind].set(row.weekday, options);
  }
  for (const kind of ["medical", "nursing"] as const) {
    result[kind].days = [...days[kind]].sort(([a], [b]) => a - b)
      .map(([weekday, values]) => ({ weekday, times: [...values].sort() }));
    result[kind].mismatchedResources.sort();
  }
  return result;
}

export async function getVisitOptions(executor: Executor, empresaId: number): Promise<VisitOptions> {
  const [settings] = await executor.select({ blockMinutes: agendaSettingsTable.blockMinutes })
    .from(agendaSettingsTable).orderBy(agendaSettingsTable.id).limit(1);
  const blockMinutes = settings?.blockMinutes ?? agendaSettingsTable.blockMinutes.default;
  if (typeof blockMinutes !== "number" || !Number.isSafeInteger(blockMinutes) || blockMinutes <= 0) {
    throw new VisitPreferenceError("Configure os blocos do motor de agenda antes de escolher preferências.", 503);
  }
  const rows = await executor.select({
    name: agendaResourcesTable.name, kind: agendaResourcesTable.kind, slotMinutes: agendaResourcesTable.slotMinutes,
    weekday: agendaWindowsTable.weekday, startTime: agendaWindowsTable.startTime, endTime: agendaWindowsTable.endTime,
  }).from(agendaResourcesTable)
    .innerJoin(locationsTable, eq(locationsTable.id, agendaResourcesTable.locationId))
    .leftJoin(agendaWindowsTable, and(eq(agendaWindowsTable.resourceId, agendaResourcesTable.id), eq(agendaWindowsTable.active, true)))
    .where(and(eq(agendaResourcesTable.active, true), eq(locationsTable.empresaId, empresaId), eq(locationsTable.active, "true")));
  return buildVisitOptions(rows, blockMinutes);
}

export async function getVisitPreferences(executor: Executor, empresaId: number, clientId: number) {
  const [latest] = await executor.select().from(clientVisitPreferenceRevisionsTable).where(and(
    eq(clientVisitPreferenceRevisionsTable.empresaId, empresaId), eq(clientVisitPreferenceRevisionsTable.clientId, clientId),
  )).orderBy(desc(clientVisitPreferenceRevisionsTable.id)).limit(1);
  return latest ? { preferences: latest.preferences, revision: latest.id } : { preferences: emptyVisitPreferences(), revision: 0 };
}

function normalize(input: ClientVisitPreferences, previous?: ClientVisitPreferences): ClientVisitPreferences {
  const normalized = emptyVisitPreferences();
  for (const kind of ["medical", "nursing"] as const) {
    const weekdays = [...new Set(input[kind].weekdays)].sort((a, b) => a - b);
    const times = [...new Map(input[kind].times.map(t => [`${t.weekday}:${t.time}`, t])).values()]
      .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
    if (times.some(t => !weekdays.includes(t.weekday))) {
      throw new VisitPreferenceError("Selecione o dia correspondente a cada horário preferencial.");
    }
    const selectedTimes = new Set(times.map(t => `${t.weekday}:${t.time}`));
    const requestedPriority = input[kind].priority;
    const inheritedPriority = previous?.[kind].priority;
    const source = requestedPriority ?? inheritedPriority;
    let priority: ClientVisitPreferences[Kind]["priority"];
    if (source !== undefined) {
      const seen = new Set<string>();
      priority = [];
      for (const entry of source) {
        const key = `${entry.weekday}:${entry.time}`;
        if (!selectedTimes.has(key)) {
          if (requestedPriority !== undefined) {
            throw new VisitPreferenceError("A ordem só pode conter dias e horários preferenciais selecionados.");
          }
          continue;
        }
        if (seen.has(key)) throw new VisitPreferenceError("Um horário não pode aparecer duas vezes na ordem de preferência.");
        seen.add(key);
        priority.push({ weekday: entry.weekday, time: entry.time });
      }
    }
    normalized[kind] = { weekdays, times, ...(priority === undefined ? {} : { priority }) };
  }
  return normalized;
}

// A linha do cliente já está bloqueada pela transação chamadora.
export async function setVisitPreferences(
  executor: Executor, empresaId: number, clientId: number, professionalId: number,
  preferences: ClientVisitPreferences | undefined, expectedRevision: number | undefined,
  origin?: { kind: "agent"; label: string; authorizerProfessionalId: number },
) {
  if (preferences === undefined) return getVisitPreferences(executor, empresaId, clientId);
  await executor.execute(sql`SELECT pg_advisory_xact_lock(19872026,${empresaId})`);
  const previous = await getVisitPreferences(executor, empresaId, clientId);
  if (expectedRevision === undefined || expectedRevision !== previous.revision) {
    throw new VisitPreferenceError("As preferências mudaram. Recarregue o cadastro e confira antes de salvar.", 409);
  }
  const desired = normalize(preferences, previous.preferences);
  if (JSON.stringify(desired) === JSON.stringify(normalize(previous.preferences))) return previous;
  const options = await getVisitOptions(executor, empresaId);
  for (const kind of ["medical", "nursing"] as const) {
    const allowed = new Map(options[kind].days.map(day => [day.weekday, new Set(day.times)]));
    const existing = previous.preferences[kind];
    for (const day of desired[kind].weekdays) {
      if (!allowed.has(day) && !existing.weekdays.includes(day)) {
        throw new VisitPreferenceError("O dia escolhido não está no expediente configurado da empresa.");
      }
    }
    for (const selected of desired[kind].times) {
      const alreadySaved = existing.times.some(t => t.weekday === selected.weekday && t.time === selected.time);
      if (!allowed.get(selected.weekday)?.has(selected.time) && !alreadySaved) {
        throw new VisitPreferenceError("O horário escolhido não está na grade configurada da empresa.");
      }
    }
  }
  if (origin && (!origin.label.trim() || origin.authorizerProfessionalId !== professionalId)) {
    throw new VisitPreferenceError("A origem da alteração delegada é inválida.");
  }
  const [saved] = await executor.insert(clientVisitPreferenceRevisionsTable)
    .values({
      clientId, empresaId, preferences: desired, createdBy: professionalId,
      executorKind: origin ? "agent" : "professional",
      executorLabel: origin?.label ?? null,
      authorizerProfessionalId: origin?.authorizerProfessionalId ?? null,
    }).returning();
  return { preferences: saved.preferences, revision: saved.id };
}
