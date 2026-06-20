// Motor ÚNICO de iCalendar (.ics) do PADCOM (SUB-04).
// Tanto os downloads (sessions.ts) quanto o anexo de e-mail e o feed assinado
// usam ESTE arquivo — para não existirem dois motores de .ics (linha vermelha SUB-04).

// Fuso fixo da clínica: BRT (UTC-3). O Brasil não tem mais horário de verão
// desde 2019, então America/Sao_Paulo é -03:00 o ano inteiro.
export const CLINIC_TZID = "America/Sao_Paulo";

// Duração por tipo de procedimento (minutos). Fonte única para o .ics.
const DURATION_BY_TYPE: Record<string, number> = {
  iv: 30,
  im: 15,
  implant: 60,
  consultation: 30,
  sc: 15,
};

// Soma das durações dos tipos presentes na ida (tipos únicos). Fallback 30min.
export function durationFromProcedureTypes(types: string[]): number {
  const uniq = Array.from(new Set(types.filter(Boolean)));
  const total = uniq.reduce((acc, t) => acc + (DURATION_BY_TYPE[t] ?? 30), 0);
  return total > 0 ? total : 30;
}

// Escapa texto conforme RFC 5545 (vírgula, ponto-e-vírgula, contrabarra, quebra de linha).
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// SEQUENCE monotônico por envio: epoch em segundos. Cada reenvio gera um número
// maior, então o app do cliente ATUALIZA o evento (mesmo UID) em vez de duplicar,
// sem precisar de coluna nova no banco.
export function nextSequence(): number {
  return Math.floor(Date.now() / 1000);
}

export interface IcsEventInput {
  sessionId: number;
  clientName: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  weekNumber: number;
  unit?: string | null;
  status: string; // status da sessão (cancelled/completed/...)
  durationMinutes: number;
  descriptionLines?: string[];
  sequence?: number;
}

// UID estável por sessão: mesma sessão -> mesmo UID em todo reenvio.
export function sessionUid(sessionId: number): string {
  return `padcom-session-${sessionId}@padcom.clinic`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function utcStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

function icsStatus(sessionStatus: string): string {
  if (sessionStatus === "cancelled") return "CANCELLED";
  if (sessionStatus === "completed") return "COMPLETED";
  return "CONFIRMED";
}

// Bloco VTIMEZONE explícito (BRT fixo -0300). Garante que o horário cai certo no
// app do cliente, independentemente do fuso do servidor (linha vermelha SUB-04).
function vtimezoneLines(): string[] {
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${CLINIC_TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:-03",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

// Monta um VEVENT com horário em TZID (não-UTC, com fuso explícito da clínica).
export function buildVEvent(ev: IcsEventInput): string[] {
  const dateStr = ev.scheduledDate.replace(/-/g, "");
  const [h, m] = ev.scheduledTime.split(":").map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + Math.max(1, ev.durationMinutes);
  const dtStart = `${dateStr}T${pad2(h)}${pad2(m)}00`;
  const dtEnd = `${dateStr}T${pad2(Math.floor(endMinutes / 60) % 24)}${pad2(endMinutes % 60)}00`;

  const summary = `PADCOM: ${ev.clientName} — Semana ${ev.weekNumber}`;
  const description = (ev.descriptionLines ?? []).filter(Boolean).join("\\n");

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${sessionUid(ev.sessionId)}`,
    `DTSTAMP:${utcStamp()}`,
    `SEQUENCE:${ev.sequence ?? 0}`,
    `DTSTART;TZID=${CLINIC_TZID}:${dtStart}`,
    `DTEND;TZID=${CLINIC_TZID}:${dtEnd}`,
    `SUMMARY:${icsEscape(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${description}`);
  lines.push(`LOCATION:${icsEscape(ev.unit ?? "Clínica")}`);
  lines.push(`STATUS:${icsStatus(ev.status)}`);
  lines.push("END:VEVENT");
  return lines;
}

// Monta um VCALENDAR completo (cabeçalho + VTIMEZONE + N eventos). METHOD:PUBLISH
// por padrão (arquivo para o cliente ADICIONAR à própria agenda, sem RSVP).
export function buildVCalendar(
  events: IcsEventInput[],
  opts?: { method?: string; calName?: string },
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PADCOM Protocolos Injetáveis//BR",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts?.method ?? "PUBLISH"}`,
    `X-WR-CALNAME:${opts?.calName ?? "PADCOM Agenda"}`,
    `X-WR-TIMEZONE:${CLINIC_TZID}`,
    ...vtimezoneLines(),
  ];
  for (const ev of events) {
    lines.push(...buildVEvent(ev));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
