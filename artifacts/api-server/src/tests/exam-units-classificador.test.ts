/** Classificador dimensional de unidades: puro, sem banco e sem IA; valores sintéticos. */
import { describe, expect, it } from "vitest";
import { aprovacaoAutomatica, classificarUnidade, fatorComoNumero, rac } from "../lib/exam-units/classificador-unidades";

const c = (b: string, k: string) => classificarUnidade(b, k);

describe("equivalências seguras (fator 1)", () => {
  it.each([
    ["/μL", "/mm³"], ["/µL", "/mm³"], ["/uL", "/mm3"], ["10^6/μL", "milhões/mm³"], ["x106/uL", "milhões/mm³"],
    ["10³/µL", "10^3/uL"], ["mg/dL", "mg/dL"], ["s", "seg"], ["mL/min/1,73m²", "mL/min/1.73m²"],
  ])("%s -> %s", (b, k) => {
    const r = c(b, k);
    expect(["SAFE_ALIAS", "MATCH_EXISTING"]).toContain(r.classe);
    expect(r.fator).toEqual(rac(1n));
  });
});

describe("conversões dimensionais exatas", () => {
  it("mg/dL -> g/L = 1/100 e volta = 100 (ida e volta)", () => {
    const ida = c("mg/dL", "g/L"), volta = c("g/L", "mg/dL");
    expect(ida.classe).toBe("DIMENSIONAL_CONVERSION");
    expect(ida.fator).toEqual(rac(1n, 100n));
    expect(volta.fator).toEqual(rac(100n));
  });
  it("ng/mL <-> µg/L é fator 1; ng/dL -> ng/mL = 1/100; 10³/µL -> /µL = 1000", () => {
    expect(c("ng/mL", "µg/L").fator).toEqual(rac(1n));
    expect(c("ng/dL", "ng/mL").fator).toEqual(rac(1n, 100n));
    expect(c("10³/µL", "/µL").fator).toEqual(rac(1000n));
  });
  it("propriedade: fator(a->b) x fator(b->a) = 1 em pares convertíveis", () => {
    const pares = [["mg/dL", "g/L"], ["ng/mL", "pg/mL"], ["µg/dL", "ng/mL"], ["mU/L", "U/L"], ["10³/µL", "/mm³"]];
    for (const [a, b] of pares) {
      const f = c(a, b).fator!, g = c(b, a).fator!;
      expect(fatorComoNumero(f) * fatorComoNumero(g)).toBeCloseTo(1, 12);
    }
  });
});

describe("nunca converte o que depende de contexto", () => {
  it("massa/volume x mol/volume exige massa molar (mg/dL x mmol/L)", () => {
    const r = c("mg/dL", "mmol/L");
    expect(r.classe).toBe("ANALYTE_SPECIFIC");
    expect(r.fator).toBeNull();
  });
  it("contagem absoluta x percentual exige o total do mesmo exame", () => {
    const r = c("/μL", "%");
    expect(r.classe).toBe("CONTEXT_DEPENDENT");
    expect(r.fator).toBeNull();
  });
  it("atividade % x tempo em segundos é grandeza diferente", () => {
    expect(c("%", "seg").classe).toBe("NON_CONVERTIBLE");
  });
  it("FEU sem propriedade de ensaio não vira DDU nem sem qualificador", () => {
    expect(c("ng/mL FEU", "ng/mL DDU").classe).toBe("CONTEXT_DEPENDENT");
    expect(c("ng/mL FEU", "ng/mL").classe).toBe("CONTEXT_DEPENDENT");
    expect(c("ng/mL FEU", "ng/mL").fator).toBeNull();
  });
  it("mU/L x µIU/mL (U x UI) fica para o analito (insulina)", () => {
    expect(c("mU/L", "µIU/mL").classe).toBe("ANALYTE_SPECIFIC");
  });
  it("unidade fora da gramática é ambígua e não ganha fator", () => {
    const r = c("gotas/frasco", "mg/dL");
    expect(r.classe).toBe("AMBIGUOUS");
    expect(r.fator).toBeNull();
  });
});

describe("política de aprovação automática", () => {
  it("só alias seguro e conversão dimensional exata", () => {
    expect(aprovacaoAutomatica("SAFE_ALIAS")).toBe(true);
    expect(aprovacaoAutomatica("DIMENSIONAL_CONVERSION")).toBe(true);
    for (const k of ["ANALYTE_SPECIFIC", "CONTEXT_DEPENDENT", "NON_CONVERTIBLE", "AMBIGUOUS", "MATCH_EXISTING"] as const)
      expect(aprovacaoAutomatica(k)).toBe(false);
  });
});
