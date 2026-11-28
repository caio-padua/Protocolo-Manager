import type { PrescriptionItemInput } from "./desmembramento";

function doseAlreadyInPosology(dose: string, posology: string): boolean {
  const normalizedDose = dose.trim();
  const literalDose = normalizedDose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|[^\\p{L}\\p{N}])${literalDose}($|[^\\p{L}\\p{N}])`, "iu").test(posology)) return true;
  // Cockpit stores administrations as "1 (08:00); 2" and formats the same
  // information as "1 dose ... 08:00; 2 doses ...". Suppress only when every
  // quantity and every explicitly provided time can be found in its segment.
  const parts = normalizedDose.split(";").map((part) => part.trim());
  const instructions = posology.split(";").map((part) => part.trim());
  if (parts.length !== instructions.length) return false;
  return parts.every((part, index) => {
    const match = /^(\d+(?:[.,]\d+)?)(?:\s*\((\d{1,2}:\d{2})\))?$/.exec(part);
    if (!match) return false;
    const escaped = match[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\s)${escaped}\\s+doses?\\b`, "i").test(instructions[index]) &&
      (!match[2] || instructions[index].includes(match[2]));
  });
}

/**
 * Converts clinical input to display fields without manufacturing a dosage.
 * The Cockpit's `dose` describes the same administration already represented
 * by `posologia`; appending it to active ingredients duplicates instructions.
 */
export function prescriptionItemForDocument(item: PrescriptionItemInput) {
  const suppliedPosology = item.posologia?.trim() ? item.posologia : undefined;
  const distinctDose = suppliedPosology && item.dose?.trim() &&
    !doseAlreadyInPosology(item.dose, suppliedPosology)
    ? item.dose
    : undefined;
  const posologia = suppliedPosology
    ? `${suppliedPosology}${distinctDose ? `\nDose informada: ${distinctDose}` : ""}`
    : [item.dose, item.via, item.frequencia, item.periodo]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" — ") || undefined;

  return {
    nome: item.name,
    ativos: item.ativos || undefined,
    posologia,
    via: item.via ?? undefined,
    forma: item.category ?? undefined,
    observacao: item.observacao ?? undefined,
  };
}
