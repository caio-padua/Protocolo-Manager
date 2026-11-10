export const UNCONFIGURED_PROTOCOL_INTERVAL = "unconfigured";

export const PROTOCOL_FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Semanal (a cada 7 dias)", days: 7 },
  { value: "biweekly", label: "Quinzenal (a cada 15 dias)", days: 15 },
  { value: "triweekly", label: "A cada 21 dias", days: 21 },
  { value: "monthly", label: "Mensal (a cada 30 dias)", days: 30 },
  { value: "custom", label: "Personalizado", days: 0 },
] as const;

type CatalogDefaults = {
  defaultDose?: string | null;
  intervalDays?: number | null;
};

export type ProtocolSubstanceDefaults = {
  dose: string;
  frequency: string;
  customDays: number | null;
};

const MASS_UNIT = "(?:mg|g|mcg|µg|μg|ug|ui|iu)";
const MASS_WITH_VOLUME = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*(${MASS_UNIT})\\s*\\/\\s*\\d+(?:[.,]\\d+)?\\s*ml$`,
  "i",
);
const SINGLE_MASS = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${MASS_UNIT})$`, "i");
const SIMPLE_DOSE_UNIT =
  "(?:c[aá]psulas?|comprimidos?|gotas?|doses?|implantes?|pellets?|unidades?|puffs?|sprays?|aplica[cç][aã]o(?:es|ões)?)";
const SINGLE_FORM_DOSE = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*(${SIMPLE_DOSE_UNIT})$`,
  "i",
);

function formatDose(amount: string, unit: string): string {
  const normalizedUnit = unit.toLowerCase();
  const displayUnit = normalizedUnit === "ug" || normalizedUnit === "mcg" || normalizedUnit === "μg"
    ? "µg"
    : normalizedUnit === "ui" || normalizedUnit === "iu"
      ? normalizedUnit.toUpperCase()
      : normalizedUnit;
  return `${amount} ${displayUnit}`;
}

/** Só preenche quando a dose padrão pode ser separada da apresentação sem inferência. */
export function dosePrescritaDoCadastro(defaultDose?: string | null): string {
  const value = (defaultDose ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";

  const withVolume = value.match(MASS_WITH_VOLUME);
  if (withVolume) return formatDose(withVolume[1], withVolume[2]);

  const mass = value.match(SINGLE_MASS);
  if (mass) return formatDose(mass[1], mass[2]);

  const form = value.match(SINGLE_FORM_DOSE);
  if (form) return `${form[1].replace(",", ".")} ${form[2].toLowerCase()}`;

  return "";
}

export function dosePrescritaTemApresentacao(dose: string): boolean {
  return (
    /\d+(?:[.,]\d+)?\s*(?:m[lL]\b|mililitros?\b)/i.test(dose) ||
    /\/\s*m[lL]\b/i.test(dose) ||
    /\d+(?:[.,]\d+)?\s*%/.test(dose) ||
    /\bconcentra[cç][aã]o\b|\bvolume\b/i.test(dose) ||
    /\d+\s*amp(?:ola|olas)?\b|\bampolas?\b/i.test(dose)
  );
}

export function dosePrescritaExibivel(dose?: string | null): string {
  const value = (dose ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";

  const withVolume = value.match(MASS_WITH_VOLUME);
  if (withVolume) return formatDose(withVolume[1], withVolume[2]);

  if (dosePrescritaTemApresentacao(value) || value.includes("/")) return "";

  const mass = value.match(SINGLE_MASS);
  if (mass) return formatDose(mass[1], mass[2]);

  const massValue = `\\d+(?:[.,]\\d+)?\\s*${MASS_UNIT}`;
  if (new RegExp(`^${massValue}(?:\\s*\\+\\s*${massValue})*$`, "i").test(value)) {
    return value.replace(
      /(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|μg|ug|ui|iu)/gi,
      (_match, amount: string, unit: string) => formatDose(amount, unit),
    );
  }

  const form = value.match(SINGLE_FORM_DOSE);
  if (form) return `${form[1]} ${form[2].toLowerCase()}`;
  return "";
}

export function dosePrescritaValida(dose?: string | null): boolean {
  return !dosePrescritaTemApresentacao(dose ?? "") && Boolean(dosePrescritaExibivel(dose));
}

export function nomeSubstanciaProtocolo(nome?: string | null): string {
  const value = (nome ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "Substância";
  const safe = value
    .replace(
      new RegExp(`\\s+\\d+(?:[.,]\\d+)?\\s*${MASS_UNIT}\\s*\\/\\s*(?:\\d+(?:[.,]\\d+)?\\s*)?ml\\b`, "gi"),
      "",
    )
    .replace(/\s+\d+(?:[.,]\d+)?\s*%/g, "")
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:m[lL]|mililitros?)\b/gi, "")
    .replace(/\s+\d+\s*amp(?:ola|olas)?\b/gi, "")
    .replace(/\bampolas?\b/gi, "")
    .replace(/\s*[-–—|:;,]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return safe || "Substância";
}

export function resolveProtocolSubstanceDefaults(
  substance: CatalogDefaults,
): ProtocolSubstanceDefaults {
  const dose = dosePrescritaDoCadastro(substance.defaultDose);
  const intervalDays = substance.intervalDays;

  if (!Number.isSafeInteger(intervalDays) || intervalDays == null || intervalDays <= 0) {
    return { dose, frequency: UNCONFIGURED_PROTOCOL_INTERVAL, customDays: null };
  }

  const exactPreset = PROTOCOL_FREQUENCY_OPTIONS.find(
    option => option.value !== "custom" && option.days === intervalDays,
  );
  if (exactPreset) return { dose, frequency: exactPreset.value, customDays: null };

  return { dose, frequency: "custom", customDays: intervalDays };
}

export function protocolIntervalDays(
  frequency: string,
  customDays: number | null,
): number | null {
  if (frequency === UNCONFIGURED_PROTOCOL_INTERVAL) return null;
  if (frequency === "custom") {
    return Number.isSafeInteger(customDays) && customDays != null && customDays > 0
      ? customDays
      : null;
  }
  return PROTOCOL_FREQUENCY_OPTIONS.find(option => option.value === frequency)?.days ?? null;
}
