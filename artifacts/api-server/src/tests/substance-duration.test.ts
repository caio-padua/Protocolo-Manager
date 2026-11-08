import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/secure-settings", () => ({
  getSetting: vi.fn(async (key: string) => ({
    "agenda.duracao.intramuscular.segundos": "150",
    "agenda.duracao.subcutanea.segundos": "150",
    "agenda.duracao.implante.segundos": "1800",
  } as Record<string, string>)[key] ?? null),
}));

import { catalogSubstanceUpdate, configuredDurationSeconds, durationSecondsFromMinutes, substanceDurationMinutes } from "../lib/substance-duration";
import { getSetting } from "../lib/secure-settings";

describe("Duração precisa de substância sem alterar dados clínicos", () => {
  it("armazena dois minutos e meio exatamente e recupera em minutos", () => {
    expect(durationSecondsFromMinutes(2.5)).toBe(150);
    expect(substanceDurationMinutes({ durationMinutes: 15, preciseDurationSeconds: 150 })).toBe(2.5);
    expect(substanceDurationMinutes({ durationMinutes: 60, preciseDurationSeconds: 1800 })).toBe(30);
  });

  it("preserva a leitura dos valores anteriores enquanto não houver duração precisa", () => {
    expect(substanceDurationMinutes({ durationMinutes: 15, preciseDurationSeconds: null })).toBe(15);
    expect(substanceDurationMinutes({ durationMinutes: 30 })).toBe(30);
  });

  it("rejeita duração vazia, negativa, não numérica ou sem precisão em segundos", () => {
    for (const value of [null, undefined, "", 0, -1, NaN, Infinity, 0.001, 1e20]) {
      expect(() => durationSecondsFromMinutes(value)).toThrow();
    }
    expect(durationSecondsFromMinutes(2.3)).toBe(138);
  });

  it("usa as configurações armazenadas para os padrões e não inventa outras", async () => {
    expect(await configuredDurationSeconds("im")).toBe(150);
    expect(await configuredDurationSeconds("sc")).toBe(150);
    expect(await configuredDurationSeconds("implant")).toBe(1800);
    expect(await configuredDurationSeconds("iv")).toBeNull();
  });

  it("recusa padrão ausente ou inválido em vez de substituí-lo silenciosamente", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(null).mockResolvedValueOnce("0");
    await expect(configuredDurationSeconds("im")).rejects.toThrow("não configurada");
    await expect(configuredDurationSeconds("sc")).rejects.toThrow("não configurada");
  });

  it("preserva durações ajustadas ao reimportar um cadastro existente", () => {
    const catalog = {
      name: "Substância sintética",
      pricePerUnit: 12,
      durationMinutes: 15,
      preciseDurationSeconds: 150,
    };
    expect(catalogSubstanceUpdate(catalog, true)).toEqual({ name: catalog.name, pricePerUnit: 12 });
    expect(catalogSubstanceUpdate(catalog, false)).toEqual({ name: catalog.name });
  });
});
