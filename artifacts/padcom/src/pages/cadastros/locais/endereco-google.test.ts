import { describe, expect, it } from "vitest";
import { lerEnderecoGoogle } from "./endereco-google";

describe("lerEnderecoGoogle", () => {
  it("le o endereco da agenda EXTERNO", () => {
    expect(lerEnderecoGoogle("R. Vilela, 652 - Sl 706 - Tatuapé, São Paulo - SP, 03314-000")).toEqual({
      cep: "03314-000", logradouro: "R. Vilela", numero: "652", complemento: "Sl 706",
      bairro: "Tatuapé", cidade: "São Paulo", estado: "SP",
    });
  });
  it("devolve null para texto livre (nunca chuta)", () => {
    expect(lerEnderecoGoogle("CLINICA MEDICINA INTEGRATIVA PADUA \n\nRUA GUAXUPE 3")).toBeNull();
    expect(lerEnderecoGoogle("")).toBeNull();
    expect(lerEnderecoGoogle(null)).toBeNull();
  });
});
