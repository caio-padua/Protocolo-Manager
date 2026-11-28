import { describe, expect, it } from "vitest";
import { resumirSubstanciasDaVisita } from "../lib/substancias-constantes";

// K7 — função pura única do protocolo completo constante (dados sintéticos).
const item = (substanceId: number, dose = "Dose", totalSessions = 4) => ({ substanceId, dose, totalSessions });

describe("K7 — resumirSubstanciasDaVisita", () => {
  it("T-K7-1: protocolo sem itens gravados não afirma nada (nulo)", () => {
    expect(resumirSubstanciasDaVisita([{ substanceId: 1, availability: "disp" }], [])).toBeNull();
  });

  it("T-K7-2: constantes são só as substâncias sem linha na visita; item repetido conta uma vez; X de Y coerente", () => {
    const result = resumirSubstanciasDaVisita(
      [
        { substanceId: 1, availability: "disp" },
        { substanceId: 1, availability: "disp" }, // mesma substância aplicada duas vezes na visita
        { substanceId: 2, availability: "prox" },
      ],
      [item(1), item(2), item(3, "Dose C", 5), item(3, "Dose C repetida", 9), item(4)],
    );
    expect(result).toEqual({
      visitCount: 1,
      protocolCount: 4,
      constants: [item(3, "Dose C", 5), item(4)],
    });
    expect(result!.visitCount).toBeLessThanOrEqual(result!.protocolCount);
  });

  it("T-K7-2b: substância com linha na visita (qualquer disponibilidade) nunca vira constante", () => {
    const result = resumirSubstanciasDaVisita(
      [{ substanceId: 1, availability: "prox" }, { substanceId: 2, availability: "missed" }],
      [item(1), item(2)],
    );
    expect(result).toEqual({ visitCount: 0, protocolCount: 2, constants: [] });
  });

  it("T-K7-2c: linha da visita sem item no protocolo entra no Y (X nunca passa de Y; Y é o que a enfermagem vê listado)", () => {
    const result = resumirSubstanciasDaVisita(
      [{ substanceId: 9, availability: "disp" }, { substanceId: 1, availability: "disp" }],
      [item(1), item(2)],
    );
    expect(result).toEqual({ visitCount: 2, protocolCount: 3, constants: [item(2)] });
    expect(result!.visitCount).toBeLessThanOrEqual(result!.protocolCount);
  });
});
