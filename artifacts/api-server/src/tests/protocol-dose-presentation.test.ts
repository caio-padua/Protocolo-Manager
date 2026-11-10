import { describe, expect, it } from "vitest";
import {
  detalheCatalogoSeguroParaProtocolo,
  dosePadraoPrescrita,
  dosePrescritaParaDocumento,
  doseTemApresentacaoProibida,
  nomeSubstanciaNoProtocolo,
} from "../lib/protocol-dose-presentation";
import { blocoTabelaSubstancias, soMiligramas } from "../lib/messaging/substance-table";

describe("dose e nome exibidos no protocolo e no RAS FAP", () => {
  it("separa apenas a dose em massa de uma apresentação exata em volume", () => {
    expect(dosePadraoPrescrita("100 MG / 2 ML")).toBe("100 mg");
    expect(dosePrescritaParaDocumento("100 MG / 2 ML")).toBe("100 mg");
  });

  it("mantém unidades de massa inequívocas e dose por unidade farmacêutica", () => {
    expect(dosePadraoPrescrita("250 MCG")).toBe("250 µg");
    expect(dosePadraoPrescrita("1 cápsula")).toBe("1 cápsula");
    expect(dosePrescritaParaDocumento("1,5 cápsulas")).toBe("1,5 cápsulas");
    expect(dosePrescritaParaDocumento("100 mg + 200 mcg")).toBe("100 mg + 200 µg");
  });

  it("deixa dose ambígua para revisão clínica", () => {
    for (const dose of [
      "A 25.000 UI + D3 100.000 UI + E 200 UI + K2 1.300 MCG / 2 ML",
      "6,10% / 2 ML",
      "20mcg/mL",
      "15mg/200mcg",
      "150+50 MG — 2 A 4 pellets",
      "1amp",
      "2 mL",
    ]) {
      expect(dosePadraoPrescrita(dose)).toBe("");
      expect(dosePrescritaParaDocumento(dose)).toBe("");
    }
  });

  it("bloqueia cadastro de dose que ainda contenha apresentação", () => {
    expect(doseTemApresentacaoProibida("100 mg / 2 mL")).toBe(true);
    expect(doseTemApresentacaoProibida("1 ampola")).toBe(true);
    expect(doseTemApresentacaoProibida("100 mg")).toBe(false);
  });

  it("retira teor percentual e volume do nome visível sem alterar a origem", () => {
    expect(nomeSubstanciaNoProtocolo("LIDOCAINA 1%")).toBe("LIDOCAINA");
    expect(nomeSubstanciaNoProtocolo("COENZIMA Q10 100 mg / 2 mL")).toBe("COENZIMA Q10");
    expect(nomeSubstanciaNoProtocolo("LIDOCAINA 100 mg/mL")).toBe("LIDOCAINA");
  });

  it("omite detalhe narrativo que contém volume, concentração ou ampolas", () => {
    expect(detalheCatalogoSeguroParaProtocolo("Dose: 100 mg/mL")).toBeUndefined();
    expect(detalheCatalogoSeguroParaProtocolo("Aplicar 1 ampola")).toBeUndefined();
    expect(detalheCatalogoSeguroParaProtocolo("Aplicação intramuscular")).toBe("Aplicação intramuscular");
  });

  it("renderiza dose segura nas mensagens de e-mail", () => {
    expect(soMiligramas("100 MG / 2 ML")).toBe("100 mg");
    const html = blocoTabelaSubstancias([{
      nome: "LIDOCAINA 1%",
      dose: "100 MG / 2 ML",
    }]).toLowerCase();
    expect(html).toContain("lidocaina");
    expect(html).toContain("100 mg");
    expect(html).not.toContain("1%");
    expect(html).not.toContain("2 ml");
    expect(html).not.toContain("ampola");
  });
});
