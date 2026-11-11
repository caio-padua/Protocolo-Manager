import { describe, expect, it } from "vitest";
import { doseSeguraProduto, doseSugeridaProduto, duracaoValidaMinutos, nomeSugeridoProduto } from "./sugestao-produto";

describe("sugestão segura do cadastro de produtos", () => {
  it("remove dose, concentração e volume sem remover números integrantes do nome", () => {
    expect(nomeSugeridoProduto("5 HTP (OH-TRIPTOFANO) - 20 MG / 5 ML")).toBe("5 HTP (OH-TRIPTOFANO)");
    expect(nomeSugeridoProduto("COENZIMA Q10 IM")).toBe("COENZIMA Q10 IM");
    expect(nomeSugeridoProduto("AZUL DE METILENO 1% - 20 MG / 2 ML")).toBe("AZUL DE METILENO");
    expect(nomeSugeridoProduto("ADEK")).toBe("ADEK");
    expect(nomeSugeridoProduto("100 MG / 2 ML")).toBe("");
  });
  it("admite segundos inteiros e não arredonda durações impossíveis", () => {
    for (const minutos of [2.5, 1 / 60, 151 / 60, 1440]) expect(duracaoValidaMinutos(minutos)).toBe(true);
    for (const minutos of [0, -1, 2.51, NaN, Infinity, 1441]) expect(duracaoValidaMinutos(minutos)).toBe(false);
  });
  it("sugere apenas uma dose simples e nunca interpreta volume ou mistura", () => {
    expect(doseSeguraProduto("100 MG")).toBe("100 MG");
    for (const valor of ["100 MG / 2 ML", "20 mg/mL", "A 25.000 UI + D3 100.000 UI", "1%", "", null, undefined]) {
      expect(doseSeguraProduto(valor)).toBeNull();
    }
  });
  it("ordena as doses de um composto pelo nome e preserva cada unidade", () => {
    const produto = {
      name: "ADEK (VITAMINAS A, D, E, K)",
      defaultDose: "A 25.000 UI + D3 100.000 UI + E 200 UI + K2 1.300 MCG / 2 ML",
      components: [
        { componentName: "Vitamina E (alfatocoferol)", doseValue: 200, doseUnit: "UI" },
        { componentName: "Vitamina A (retinol)", doseValue: 25000, doseUnit: "UI" },
        { componentName: "Vitamina K2-MK7", doseValue: 1300, doseUnit: "mcg" },
        { componentName: "Vitamina D3 (colecalciferol)", doseValue: 100000, doseUnit: "UI" },
      ],
    };
    expect(doseSugeridaProduto(produto)).toBe("25.000 UI + 100.000 UI + 200 UI + 1.300 mcg");
    expect(doseSugeridaProduto({ ...produto, components: produto.components.map((c, i) => i === 0 ? { ...c, doseValue: null } : c) })).toBeNull();
    expect(doseSugeridaProduto({ ...produto, components: produto.components.map((c, i) => i === 0 ? { ...c, doseUnit: "mL" } : c) })).toBeNull();
    expect(doseSugeridaProduto({ ...produto, name: "Composto sem nomes dos componentes" })).toBeNull();
    expect(doseSugeridaProduto({ ...produto, name: "Vitamina A + A + D + E + K" })).toBeNull();
    expect(doseSugeridaProduto({ ...produto, name: "VITAMINAS A, D2, E, K" })).toBeNull();
    expect(doseSugeridaProduto({ ...produto, components: produto.components.map((c, i) => i === 0 ? { ...c, doseValue: 0.29 } : c) })).toContain("0,29 UI");
  });
});
