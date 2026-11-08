import { rrulestr } from "rrule";
import { brtISODate, parseBrtParts } from "./brt";

export const GOOGLE_AGENDA_FLOOR = "2026-09-01";

export interface ImportedCommitment {
  id: number;
  titulo: string | null;
  inicio: Date | string;
  fim: Date | string;
  diaInteiro: boolean;
  recorrencia: string | null;
  origem: string;
  agenda: string;
  cor: string;
  papel: string | null;
}

export function projectImportedCommitment(row: ImportedCommitment, from: Date, until: Date) {
  const floor = new Date(`${GOOGLE_AGENDA_FLOOR}T00:00:00-03:00`);
  const lower = new Date(Math.max(from.getTime(), floor.getTime()));
  if (until <= lower) return [];
  let starts = [new Date(row.inicio)];
  let duration = new Date(row.fim).getTime() - starts[0].getTime();
  if (row.origem === "google_recorrente") {
    const data = JSON.parse(row.recorrencia ?? "") as {
      version: number; start: string; end: string; lines: string[]; excluded: string[];
    };
    if (data.version !== 1 || !data.lines?.length) throw new Error("Regra de recorrência inválida");
    const original = new Date(data.start);
    duration = new Date(data.end).getTime() - original.getTime();
    const stamp = original.toISOString().replace(/[-:]/g, "").replace(".000", "");
    const rule = rrulestr([`DTSTART:${stamp}`, ...data.lines].join("\n"), { forceset: true });
    const excluded = new Set(data.excluded.map((value) => new Date(value).getTime()));
    starts = rule.between(new Date(lower.getTime() - Math.max(0, duration)), until, true)
      .filter((date) => !excluded.has(date.getTime()));
  }
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Duração de compromisso inválida");
  return starts.filter((start) => start >= floor && start < until && start.getTime() + duration > lower.getTime())
    .map((start) => ({
      id: `${row.id}:${start.toISOString()}`,
      titulo: row.titulo ?? "Sem título",
      inicio: start.toISOString(),
      fim: new Date(start.getTime() + duration).toISOString(),
      data: brtISODate(start),
      horario: row.diaInteiro ? "Dia inteiro" : (() => {
        const parts = parseBrtParts(start);
        return `${parts.hour}:${parts.minute}`;
      })(),
      diaInteiro: row.diaInteiro,
      agenda: row.agenda,
      cor: row.cor,
      recorrente: row.origem === "google_recorrente",
    }));
}
