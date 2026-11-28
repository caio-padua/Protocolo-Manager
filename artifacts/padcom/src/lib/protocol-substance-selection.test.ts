import { describe, expect, it } from "vitest";
import {
  protocolIntervalDays,
  dosePrescritaExibivel,
  dosePrescritaValida,
  nomeSubstanciaProtocolo,
  resolveProtocolSubstanceDefaults,
  UNCONFIGURED_PROTOCOL_INTERVAL,
} from "./protocol-substance-selection";

describe("defaults from the exact substance catalog record", () => {
  it("uses only the explicit default dose and leaves a missing interval unconfigured", () => {
    expect(resolveProtocolSubstanceDefaults({
      defaultDose: "100 MG / 2 ML",
      intervalDays: null,
    })).toEqual({
      dose: "",
      frequency: UNCONFIGURED_PROTOCOL_INTERVAL,
      customDays: null,
    });
  });
  it("só usa dose legada com volume total confirmado e sem divergência", () => {
    const base = { defaultDose: "100 MG / 2 ML", intervalDays: 15,
      presentationQuantity: 1, presentationUnit: "ampola", ampouleVolumeMl: 2 };
    expect(resolveProtocolSubstanceDefaults(base).dose).toBe("100 mg");
    expect(resolveProtocolSubstanceDefaults({ ...base, ampouleVolumeMl: 4 }).dose).toBe("");
    expect(resolveProtocolSubstanceDefaults({ ...base, concentrationMg: "25 mg/mL" }).dose).toBe("");
    expect(resolveProtocolSubstanceDefaults({ ...base, defaultDose: "50 MG / 2 ML", concentrationMg: "25 mg/mL" }).dose).toBe("50 mg");
  });
  it("exige revisão de composição textual não estruturada", () => {
    expect(resolveProtocolSubstanceDefaults({ name: "ADEK", defaultDose: "100 mg",
      composicao: "Vitaminas A, D, E e K", isBlend: false }).dose).toBe("");
  });
  it("recusa componente malformado e dose zero digitada", () => {
    expect(resolveProtocolSubstanceDefaults({ name: "ADEK", isBlend: true,
      components: [null, null] as unknown as NonNullable<Parameters<typeof resolveProtocolSubstanceDefaults>[0]["components"]> }).dose).toBe("");
    expect(dosePrescritaValida("0 mg")).toBe(false);
    expect(dosePrescritaValida("10 mg + 0 mg")).toBe(false);
    expect(dosePrescritaValida("10 mg + 1 mg")).toBe(true);
    expect(resolveProtocolSubstanceDefaults({ name: "ADEK", defaultDose: "100 mg",
      components: {} as unknown as NonNullable<Parameters<typeof resolveProtocolSubstanceDefaults>[0]["components"]> }).dose).toBe("");
  });

  it("keeps ADEK's 15-day interval but requires dose review for a mixture", () => {
    expect(resolveProtocolSubstanceDefaults({
      defaultDose: "A 25.000 UI + D3 100.000 UI + E 200 UI + K2 1.300 MCG / 2 ML",
      intervalDays: 15,
    })).toEqual({
      dose: "",
      frequency: "biweekly",
      customDays: null,
    });
  });

  it("shows only an unambiguous dose and flags a mixture for review", () => {
    expect(dosePrescritaExibivel("100 MG / 2 ML")).toBe("100 mg");
    expect(dosePrescritaExibivel(
      "A 25.000 UI + D3 100.000 UI + E 200 UI + K2 1.300 MCG / 2 ML",
    )).toBe("");
  });

  it("preserves a custom interval while leaving an unclear default dose blank", () => {
    expect(resolveProtocolSubstanceDefaults({
      defaultDose: "dose cadastrada",
      intervalDays: 13,
    })).toEqual({ dose: "", frequency: "custom", customDays: 13 });
  });

  it("does not infer a prescribed dose from concentration or ampoule volume", () => {
    const catalogEntry = {
      defaultDose: null,
      concentrationMg: "100 MG",
      volumeAmpola: "2 ML",
      ampouleVolumeMl: 2,
      intervalDays: 15,
    };
    expect(resolveProtocolSubstanceDefaults(catalogEntry).dose).toBe("");
  });

  it("does not turn missing, zero, or invalid intervals into a weekly schedule", () => {
    for (const intervalDays of [null, 0, -1, undefined, 7.5]) {
      expect(resolveProtocolSubstanceDefaults({ defaultDose: null, intervalDays }).frequency)
        .toBe(UNCONFIGURED_PROTOCOL_INTERVAL);
    }
    expect(protocolIntervalDays(UNCONFIGURED_PROTOCOL_INTERVAL, null)).toBeNull();
    expect(protocolIntervalDays("custom", null)).toBeNull();
  });

  it("retains the exact clinician-selected custom interval", () => {
    expect(protocolIntervalDays("custom", 13)).toBe(13);
  });

  it("does not fill concentration, percentages, mixed ingredients, or ampoule counts", () => {
    for (const defaultDose of [
      "20mcg/mL",
      "6,10% / 2 ML",
      "15mg/200mcg",
      "150+50 MG — 2 A 4 pellets",
      "1amp",
      "0 mg",
    ]) {
      expect(resolveProtocolSubstanceDefaults({ defaultDose, intervalDays: 7 }).dose).toBe("");
    }
  });

  it("normalizes explicit mass and keeps a clear non-volume dose unit", () => {
    expect(resolveProtocolSubstanceDefaults({ defaultDose: "250 MCG", intervalDays: 7 }).dose)
      .toBe("250 µg");
    expect(resolveProtocolSubstanceDefaults({ defaultDose: "1 implante", intervalDays: 180 }).dose)
      .toBe("1 implante");
  });

  it("hides concentration and presentation from the visible substance name", () => {
    expect(nomeSubstanciaProtocolo("LIDOCAINA 1%")).toBe("LIDOCAINA");
    expect(nomeSubstanciaProtocolo("LIDOCAINA 100 mg/mL")).toBe("LIDOCAINA");
  });
});
