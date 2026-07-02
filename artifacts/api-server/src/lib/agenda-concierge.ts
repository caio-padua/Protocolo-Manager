// Motor de OFERTA concierge (Dr. Caio) — decide QUAIS horarios oferecer ao
// paciente ANTES do pagamento, CONFRONTANDO a agenda REAL. Reusa o motor de
// ocupacao real (computeResourceSlots); NUNCA reimplementa o motor de agenda.
//
// Regras (spec specs/marcacao-onda1-onda2.md, Onda A):
//  - Escassez: no maximo 2 dias e 3 chips na oferta inteira (2 no dia primario).
//  - Contiguidade: prioriza slot "aberto" colado a um "ocupado" (encaixe).
//  - Tarde-por-%: so oferece slot de tarde se o motor ja o liberou ("aberto").
//  - Dia vizinho: alem do primario, 1 dia com a manha "mais completa" (consolida).
//  - Nunca beco: se ZERO abertos, sintetiza a partir das JANELAS reais (generated).

import { db, agendaResourcesTable, professionalsTable, agendaWindowsTable } from "@workspace/db";
import { and, eq, asc } from "drizzle-orm";
import { computeResourceSlots } from "./agenda-booking.js";

export type ConciergePeriod = "manha" | "tarde";

export interface ConciergeChip {
  time: string; // HH:mm
  period: ConciergePeriod;
  contig: boolean; // encaixe: colado a um horario ocupado do medico
}

export interface ConciergeDay {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 Dom .. 6 Sab
  times: ConciergeChip[];
  note?: string;
}

export interface ConciergeOffer {
  resourceId: number;
  resourceName: string;
  days: ConciergeDay[];
  generated: boolean; // true = sintetizado por janela (fallback), nao ocupacao real
}

const HHMM = /^\d{2}:\d{2}$/;

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function addMinutes(t: string, delta: number): string {
  const total = toMinutes(t) + delta;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function periodOf(t: string): ConciergePeriod {
  return toMinutes(t) < 12 * 60 ? "manha" : "tarde";
}

// Data de HOJE no fuso do Brasil (America/Sao_Paulo), formato YYYY-MM-DD.
function brazilTodayISO(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Ancora ao meio-dia UTC (igual ao motor: getUTCDay de `${date}T12:00:00Z`),
// para o dia-da-semana nunca escorregar por fuso.
function anchor(dateISO: string): Date {
  return new Date(`${dateISO}T12:00:00Z`);
}
function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function weekdayOf(dateISO: string): number {
  return anchor(dateISO).getUTCDay();
}
function addDaysISO(dateISO: string, days: number): string {
  const d = anchor(dateISO);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
}

// Recurso alvo do Dr. Caio: 1o recurso PRESENCIAL ativo (menor id); fallback ao
// recurso Online ativo. Nunca hardcode de id.
async function pickConciergeResource(): Promise<
  { id: number; name: string; slotMinutes: number } | null
> {
  const doctors = await db
    .select()
    .from(professionalsTable)
    .where(and(eq(professionalsTable.isPrimaryDoctor, true), eq(professionalsTable.active, true)))
    .orderBy(asc(professionalsTable.id));
  const doc = doctors[0];
  if (!doc) return null;
  const resources = await db
    .select()
    .from(agendaResourcesTable)
    .where(and(eq(agendaResourcesTable.professionalId, doc.id), eq(agendaResourcesTable.active, true)))
    .orderBy(asc(agendaResourcesTable.id));
  if (resources.length === 0) return null;
  const presencial = resources.find((r) => !/online/i.test(r.name)) ?? resources[0];
  return { id: presencial.id, name: presencial.name, slotMinutes: presencial.slotMinutes };
}

interface ScannedDay {
  date: string;
  weekday: number;
  chips: ConciergeChip[]; // todos os abertos, ja com contig/period
  morningRatio: number; // ocupacao relativa da manha (0..1)
}

// Varre a agenda real a partir do piso e coleta ate `maxDays` dias com abertos.
async function scanRealDays(
  resourceId: number,
  slotMinutes: number,
  floorISO: string,
  maxDays: number,
  scanHorizon: number,
): Promise<ScannedDay[]> {
  const out: ScannedDay[] = [];
  for (let i = 0; i < scanHorizon && out.length < maxDays; i++) {
    const date = addDaysISO(floorISO, i);
    if (weekdayOf(date) === 0) continue; // domingo: sem expediente
    const computed = await computeResourceSlots(resourceId, date, null);
    if (!computed) continue;
    const slots = computed.result.slots;
    const open = slots.filter((s) => s.state === "aberto");
    if (open.length === 0) continue;
    const occupied = new Set(slots.filter((s) => s.state === "ocupado").map((s) => s.time));
    const morning = slots.filter((s) => toMinutes(s.time) < 12 * 60);
    const morningOcc = morning.filter((s) => s.state === "ocupado").length;
    const chips: ConciergeChip[] = open.map((s) => ({
      time: s.time,
      period: periodOf(s.time),
      contig:
        occupied.has(addMinutes(s.time, slotMinutes)) ||
        occupied.has(addMinutes(s.time, -slotMinutes)),
    }));
    out.push({
      date,
      weekday: weekdayOf(date),
      chips,
      morningRatio: morning.length ? morningOcc / morning.length : 0,
    });
  }
  return out;
}

// Ordena chips por: contiguidade > periodo preferido > mais cedo.
function rankChips(chips: ConciergeChip[], period: ConciergePeriod | null): ConciergeChip[] {
  return [...chips].sort((a, b) => {
    const sa = (a.contig ? 2 : 0) + (period && a.period === period ? 3 : 0);
    const sb = (b.contig ? 2 : 0) + (period && b.period === period ? 3 : 0);
    if (sb !== sa) return sb - sa;
    return toMinutes(a.time) - toMinutes(b.time);
  });
}

// Fallback A9: sintetiza a partir das JANELAS reais do recurso (nunca vazio,
// nunca minuto fora da janela). generated=true.
async function fallbackFromWindows(
  resource: { id: number; name: string; slotMinutes: number },
  floorISO: string,
  preferredWeekday: number | null,
  period: ConciergePeriod | null,
): Promise<ConciergeOffer> {
  // Primeira data (a partir do piso+2 dias, respeitando lead grosseiro) cujo
  // dia-da-semana tenha janela cadastrada.
  const startISO = addDaysISO(floorISO, 2);
  let chosenDate: string | null = null;
  let windows: { startTime: string; endTime: string }[] = [];
  for (let i = 0; i < 21 && !chosenDate; i++) {
    const date = addDaysISO(startISO, i);
    const wd = weekdayOf(date);
    if (wd === 0) continue;
    if (preferredWeekday != null && wd !== preferredWeekday && i < 14) continue;
    const rows = await db
      .select()
      .from(agendaWindowsTable)
      .where(and(eq(agendaWindowsTable.resourceId, resource.id), eq(agendaWindowsTable.weekday, wd)))
      .orderBy(asc(agendaWindowsTable.startTime));
    if (rows.length > 0) {
      chosenDate = date;
      windows = rows.map((r) => ({ startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5) }));
    }
  }
  if (!chosenDate || windows.length === 0) {
    return { resourceId: resource.id, resourceName: resource.name, days: [], generated: true };
  }
  // Escolhe a janela do periodo pedido (manha/tarde) se houver; senao a primeira.
  const wantAfternoon = period === "tarde";
  const win =
    windows.find((w) => (wantAfternoon ? toMinutes(w.startTime) >= 12 * 60 : toMinutes(w.startTime) < 12 * 60)) ??
    windows[0];
  const times: ConciergeChip[] = [];
  let t = win.startTime;
  for (let k = 0; k < 2 && toMinutes(t) + resource.slotMinutes <= toMinutes(win.endTime); k++) {
    times.push({ time: t, period: periodOf(t), contig: false });
    t = addMinutes(t, resource.slotMinutes);
  }
  return {
    resourceId: resource.id,
    resourceName: resource.name,
    days: [
      {
        date: chosenDate,
        weekday: weekdayOf(chosenDate),
        times,
        note: "Encaixe pela agenda do Dr. Caio — confirmamos por contato.",
      },
    ],
    generated: true,
  };
}

export interface ConciergeOfferInput {
  preferredWeekday?: number | null; // 1..6 (Seg..Sab)
  preferredPeriod?: ConciergePeriod | null;
  earliestDate?: string | null; // YYYY-MM-DD (piso)
  now?: Date;
}

export async function computeConciergeOffer(input: ConciergeOfferInput): Promise<ConciergeOffer | null> {
  const resource = await pickConciergeResource();
  if (!resource) return null;

  const now = input.now ?? new Date();
  const today = brazilTodayISO(now);
  const earliest =
    input.earliestDate && /^\d{4}-\d{2}-\d{2}$/.test(input.earliestDate) ? input.earliestDate : null;
  const floorISO = earliest && earliest > today ? earliest : today;
  const preferredWeekday =
    input.preferredWeekday != null && input.preferredWeekday >= 1 && input.preferredWeekday <= 6
      ? input.preferredWeekday
      : null;
  const period = input.preferredPeriod ?? null;

  const scanned = await scanRealDays(resource.id, resource.slotMinutes, floorISO, 8, 30);
  if (scanned.length === 0) {
    return fallbackFromWindows(resource, floorISO, preferredWeekday, period);
  }

  // Dia primario: primeiro que casa com o dia-da-semana pedido; senao o primeiro.
  let primaryIdx = 0;
  if (preferredWeekday != null) {
    const idx = scanned.findIndex((d) => d.weekday === preferredWeekday);
    if (idx >= 0) primaryIdx = idx;
  }
  const primary = scanned[primaryIdx];
  const primaryRanked = rankChips(primary.chips, period);
  const primaryChips = primaryRanked.slice(0, 2);

  const days: ConciergeDay[] = [
    {
      date: primary.date,
      weekday: primary.weekday,
      times: primaryChips,
      note: primaryChips.some((c) => c.contig) ? "Encaixe entre atendimentos do Dr. Caio." : undefined,
    },
  ];

  // Dia vizinho: entre os demais, o de manha "mais completa" com >=1 chip.
  const remaining = scanned.filter((_, i) => i !== primaryIdx).filter((d) => d.chips.length > 0);
  if (remaining.length > 0 && primaryChips.length < 3) {
    remaining.sort((a, b) => b.morningRatio - a.morningRatio);
    const neighbor = remaining[0];
    const neighborChip = rankChips(neighbor.chips, period)[0];
    if (neighborChip) {
      days.push({
        date: neighbor.date,
        weekday: neighbor.weekday,
        times: [neighborChip],
        note: neighbor.morningRatio > 0 ? "Manha quase completa — otimo para consolidar." : undefined,
      });
    }
  }

  return { resourceId: resource.id, resourceName: resource.name, days, generated: false };
}
