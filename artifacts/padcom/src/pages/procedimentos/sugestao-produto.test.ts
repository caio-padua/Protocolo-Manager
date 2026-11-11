import { describe, expect, it } from "vitest";
import { doseSeguraProduto, duracaoValidaMinutos, nomeSugeridoProduto } from "./sugestao-produto";

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
});
