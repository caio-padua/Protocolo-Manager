import { format, type FormatOptions } from "date-fns";

/**
 * Parse calendar-only values without treating YYYY-MM-DD as a UTC instant.
 * Noon is used so formatting remains on the same civil day in every timezone.
 */
export function toCivilDate(value: string | Date): Date {
  if (value instanceof Date) return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error("Data inválida.");
    return parsed;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error("Data civil inválida.");
  }
  return parsed;
}

export function formatCivilDate(
  value: string | Date,
  pattern: string,
  options?: FormatOptions,
): string {
  return format(toCivilDate(value), pattern, options);
}
