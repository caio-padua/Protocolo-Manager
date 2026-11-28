import { describe, expect, it } from "vitest";
import {
  buildPortalIdentityIssue,
  formatPortalIdentityBirthDate,
  formatPortalIdentityCpf,
  formatPortalIdentityName,
} from "./identity-display";

describe("apresentação segura da identidade no portal", () => {
  it("mantém o primeiro nome e os dois componentes finais do sobrenome, abreviando o meio", () => {
    expect(formatPortalIdentityName("Bruno Henrique Fernandes Padua")).toBe("Bruno H. Fernandes Padua");
    expect(formatPortalIdentityName("Bruno Henrique de Exemplo Lima")).toBe("Bruno H. de Exemplo Lima");
    expect(formatPortalIdentityName("Bruno de Lima")).toBe("Bruno de Lima");
    expect(formatPortalIdentityName("  Bruno   Henrique de Exemplo Lima  ")).toBe("Bruno H. de Exemplo Lima");
  });

  it("mostra somente os quatro primeiros dígitos do CPF", () => {
    expect(formatPortalIdentityCpf("000.000.000-00")).toBe("000.0••.•••-••");
    expect(formatPortalIdentityCpf("123")).toBe("123.••.•••-••");
    expect(formatPortalIdentityCpf("sem dígitos")).toBeNull();
  });

  it("formata a data completa e recusa uma data impossível", () => {
    expect(formatPortalIdentityBirthDate("04/05/1970")).toBe("04/05/1970");
    expect(formatPortalIdentityBirthDate("1970-05-04")).toBe("04/05/1970");
    expect(formatPortalIdentityBirthDate("31/02/1970")).toBeNull();
    expect(formatPortalIdentityBirthDate(null)).toBeNull();
  });

  it("produz somente três campos de identidade permitidos e estados reconhecidos", () => {
    const issue = buildPortalIdentityIssue(
      { name: "diferente", cpf: "diferente", birthDate: "igual", reasons: ["interno"] },
      {
        name: "Bruno Henrique Fernandes Padua",
        cpf: "000.000.000-00",
        birthDate: "04/05/1970",
        analytes: [{ name: "VALOR_CLINICO_SINTETICO" }],
      },
    );

    expect(issue).toEqual({
      nome: { valor: "Bruno H. Fernandes Padua", status: "diferente" },
      cpf: { valor: "000.0••.•••-••", status: "diferente" },
      dataNascimento: { valor: "04/05/1970", status: "igual" },
    });
    expect(JSON.stringify(issue)).not.toContain("000.000.000-00");
    expect(JSON.stringify(issue)).not.toContain("Bruno Henrique");
    expect(JSON.stringify(issue)).not.toContain("VALOR_CLINICO_SINTETICO");
    expect(JSON.stringify(issue)).not.toContain("interno");
  });
});
