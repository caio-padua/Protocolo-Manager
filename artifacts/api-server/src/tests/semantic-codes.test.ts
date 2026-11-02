import { describe, expect, it } from "vitest";
import {
  deriveSemanticBase,
  formatSemanticCode,
  isSemanticRelation,
  isValidCnpj,
  SEMANTIC_RELATIONS,
} from "../lib/semantic-codes";

describe("códigos semânticos internos por unidade", () => {
  it("deriva quatro letras do nome principal sem acentos e prefixos genéricos", () => {
    expect(deriveSemanticBase("Instituto Pádua")).toBe("PADU");
    expect(deriveSemanticBase("Clínica Mooca Integrativa")).toBe("MOOC");
    expect(deriveSemanticBase("Centro Materno IHE")).toBe("MATE");
  });

  it("recusa nomes que não geram quatro letras sem inventar um sufixo", () => {
    expect(deriveSemanticBase("Clínica IHE")).toBeNull();
  });

  it("valida o CNPJ completo antes de usar seu prefixo", () => {
    expect(isValidCnpj("63.865.940/0001-63")).toBe(true);
    expect(isValidCnpj("63.865.940/0001-00")).toBe(false);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
  });

  it("emite o código com quatro blocos e sequência independente", () => {
    expect(formatSemanticCode({
      base: "PADU",
      relation: "propria",
      cnpj: "63.865.940/0001-63",
      sequence: 1,
    })).toBe("PADU.PROU.6386.0001");
    expect(formatSemanticCode({
      base: "PADU",
      relation: "filial_interna",
      cnpj: "63.865.940/0001-63",
      sequence: 42,
    })).toBe("PADU.FILU.6386.0042");
  });

  it("bloqueia sequência fora do tamanho de quatro dígitos", () => {
    expect(formatSemanticCode({
      base: "PADU",
      relation: "propria",
      cnpj: "63.865.940/0001-63",
      sequence: 10000,
    })).toBeNull();
  });

  it("limita as classificações a valores semânticos conhecidos", () => {
    expect(isSemanticRelation("independente")).toBe(true);
    expect(isSemanticRelation("UNICA")).toBe(false);
    expect(Object.keys(SEMANTIC_RELATIONS)).toHaveLength(6);
  });
});
