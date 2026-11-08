import { getSetting } from "./secure-settings";

// A precisão é armazenada em segundos; o valor antigo em minutos inteiros
// permanece disponível para registros ainda não migrados.
export function substanceDurationMinutes(value: {
  durationMinutes: number;
  preciseDurationSeconds?: number | null;
}): number {
  return value.preciseDurationSeconds == null
    ? value.durationMinutes
    : value.preciseDurationSeconds / 60;
}

export function durationSecondsFromMinutes(minutes: unknown): number {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("A duração deve ser um número positivo de minutos.");
  }
  const seconds = minutes * 60;
  const rounded = Math.round(seconds);
  if (Math.abs(seconds - rounded) > 1e-7 || !Number.isSafeInteger(rounded) || rounded <= 0 || rounded > 2147483647) {
    throw new Error("Informe uma duração que corresponda a segundos inteiros.");
  }
  return rounded;
}

const durationSettingKeys: Record<string, string> = {
  im: "agenda.duracao.intramuscular.segundos",
  sc: "agenda.duracao.subcutanea.segundos",
  implant: "agenda.duracao.implante.segundos",
};

// Valores de negócio são lidos da configuração persistida, não inventados.
// null significa que o tipo não tem padrão configurado por esta regra.
export async function configuredDurationSeconds(type: string): Promise<number | null> {
  const key = durationSettingKeys[type];
  if (!key) return null;
  const raw = await getSetting(key);
  if (!raw || !/^[1-9]\d*$/.test(raw)) {
    throw new Error(`Duração padrão não configurada para ${type}.`);
  }
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds) || seconds > 2147483647) {
    throw new Error(`Duração padrão inválida para ${type}.`);
  }
  return seconds;
}

// A reimportação atualiza dados de catálogo, mas não volta tempos já editados.
export function catalogSubstanceUpdate<T extends {
  pricePerUnit: number;
  durationMinutes: number;
  preciseDurationSeconds: number | null;
}>(catalog: T, hasPrice: boolean) {
  const { pricePerUnit, durationMinutes: _legacy, preciseDurationSeconds: _precise, ...rest } = catalog;
  return hasPrice ? { ...rest, pricePerUnit } : rest;
}
