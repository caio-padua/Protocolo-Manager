const MASS_UNIT = "(?:mg|g|mcg|µg|μg|ug|ui|iu)";
const MASS_VALUE = `\\d+(?:[.,]\\d+)?\\s*${MASS_UNIT}`;
const MASS_SEQUENCE = new RegExp(`^${MASS_VALUE}(?:\\s*\\+\\s*${MASS_VALUE})*$`, "i");
const SINGLE_MASS = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${MASS_UNIT})$`, "i");
const MASS_WITH_VOLUME = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*(${MASS_UNIT})\\s*\\/\\s*\\d+(?:[.,]\\d+)?\\s*ml$`,
  "i",
);
const SIMPLE_DOSE_UNIT =
  "(?:c[aá]psulas?|comprimidos?|gotas?|doses?|implantes?|pellets?|unidades?|puffs?|sprays?|aplica[cç][aã]o(?:es|ões)?)";
const SINGLE_FORM_DOSE = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*(${SIMPLE_DOSE_UNIT})$`,
  "i",
);

function compactDose(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatDoseToken(value: string, unit: string): string {
  const normalizedUnit = unit.toLowerCase();
  const displayUnit = normalizedUnit === "ug" || normalizedUnit === "mcg" || normalizedUnit === "μg"
    ? "µg"
    : normalizedUnit === "ui" || normalizedUnit === "iu"
      ? normalizedUnit.toUpperCase()
      : normalizedUnit;
  return `${value} ${displayUnit}`;
}

/**
 * Preenche o formulário somente quando o cadastro contém uma dose inequívoca.
 * O caso "100 mg / 2 mL" é a convenção já confirmada pelo responsável:
 * aproveita-se apenas a dose em massa, nunca o volume.
 */
export function dosePadraoPrescrita(defaultDose?: string | null): string {
  const value = compactDose(defaultDose ?? "");
  if (!value) return "";

  const withVolume = value.match(MASS_WITH_VOLUME);
  if (withVolume) return formatDoseToken(withVolume[1], withVolume[2]);

  const mass = value.match(SINGLE_MASS);
  if (mass) return formatDoseToken(mass[1], mass[2]);

  const form = value.match(SINGLE_FORM_DOSE);
  if (form) return `${form[1]} ${form[2].toLowerCase()}`;

  return "";
}

/**
 * Formata uma dose já prescrita para telas e documentos.
 * Retorna texto vazio quando a dose não pode ser separada com segurança.
 */
export function dosePrescritaParaDocumento(rawDose?: string | null): string {
  const value = compactDose(rawDose ?? "");
  if (!value) return "";

  const withVolume = value.match(MASS_WITH_VOLUME);
  if (withVolume) return formatDoseToken(withVolume[1], withVolume[2]);

  if (
    /\d+(?:[.,]\d+)?\s*(?:m[lL]\b|mililitros?\b)/i.test(value) ||
    /\/\s*m[lL]\b/i.test(value) ||
    /\d+(?:[.,]\d+)?\s*%/.test(value) ||
    /\bconcentra[cç][aã]o\b|\bvolume\b/i.test(value) ||
    /\d+\s*amp(?:ola|olas)?\b|\bamp(?:ola|olas)?\b/i.test(value) ||
    value.includes("/")
  ) {
    return "";
  }

  const mass = value.match(SINGLE_MASS);
  if (mass) return formatDoseToken(mass[1], mass[2]);

  if (MASS_SEQUENCE.test(value)) {
    return value.replace(
      /(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|μg|ug|ui|iu)/gi,
      (_match, amount: string, unit: string) => formatDoseToken(amount, unit),
    );
  }

  const form = value.match(SINGLE_FORM_DOSE);
  if (form) return `${form[1]} ${form[2].toLowerCase()}`;

  return "";
}

/** Bloqueia dose de protocolo que ainda carregue apresentação ou concentração. */
export function doseTemApresentacaoProibida(rawDose?: string | null): boolean {
  const value = compactDose(rawDose ?? "");
  return (
    /\d+(?:[.,]\d+)?\s*(?:m[lL]\b|mililitros?\b)/i.test(value) ||
    /\/\s*m[lL]\b/i.test(value) ||
    /\d+(?:[.,]\d+)?\s*%/.test(value) ||
    /\bconcentra[cç][aã]o\b|\bvolume\b/i.test(value) ||
    /\d+\s*amp(?:ola|olas)?\b|\bamp(?:ola|olas)?\b/i.test(value)
  );
}

/** Nome legível no protocolo, sem teor percentual ou apresentação em volume. */
export function nomeSubstanciaNoProtocolo(rawName?: string | null): string {
  const name = compactDose(rawName ?? "");
  if (!name) return "Substância";

  const visible = name
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

  return visible || "Substância";
}

/**
 * Retira um campo narrativo do documento quando ele contém apresentação
 * proibida. O valor original permanece intacto no cadastro e na fotografia.
 */
export function detalheCatalogoSeguroParaProtocolo(
  value?: string | null,
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (
    /\d+(?:[.,]\d+)?\s*(?:m[lL]\b|mililitros?\b)/i.test(text) ||
    /\/\s*m[lL]\b|\bm[lL]\b/i.test(text) ||
    /\d+(?:[.,]\d+)?\s*%/.test(text) ||
    /\bconcentra[cç][aã]o\b|\bvolume\b/i.test(text) ||
    /\d+\s*amp(?:ola|olas)?\b|\bamp(?:ola|olas)?\b/i.test(text)
  ) {
    return undefined;
  }
  return text;
}

export const MENSAGEM_DOSE_CLINICA_REVISAO =
  "A dose precisa de revisão clínica. Informe somente a dose prescrita, sem concentração, volume ou quantidade de ampolas.";
