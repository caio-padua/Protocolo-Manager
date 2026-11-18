import { describe, expect, it } from "vitest";
import { cnpjValido } from "../lib/cnpj";
describe("cnpjValido", () => {
  it("aceita CNPJ com dígitos corretos, com ou sem máscara", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
  });
  it("recusa dígito errado, repetidos, tamanho errado, vazio e nulo", () => {
    for (const v of ["11.222.333/0001-82", "00000000000000", "1122233300018", "", null, undefined, "12.345.678/0001-90"]) expect(cnpjValido(v)).toBe(false);
  });
});
