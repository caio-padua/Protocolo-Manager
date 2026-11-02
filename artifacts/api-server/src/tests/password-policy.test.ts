import { describe, expect, it } from "vitest";
import { isAppPasswordValid, PASSWORD_POLICY_MESSAGE } from "@workspace/password-policy";
import { generateProvisionalPassword } from "../lib/patient-auth.js";

describe("política única de senha do sistema", () => {
  it("aceita 10 caracteres quando todos os requisitos estão presentes", () => {
    expect(isAppPasswordValid("A12345678!")).toBe(true);
  });

  it("aceita letra maiúscula acentuada no início", () => {
    expect(isAppPasswordValid("Éxemplo123!")).toBe(true);
  });

  it.each([
    ["abaixo do mínimo", "A123456!"],
    ["acima do máximo", `A1!${"x".repeat(126)}`],
    ["sem maiúscula inicial", "a12345678!"],
    ["sem número", "Abcdefgh!i"],
    ["sem símbolo ou pontuação", "A123456789"],
  ])("rejeita senha %s", (_reason, password) => {
    expect(isAppPasswordValid(password)).toBe(false);
  });

  it("usa mensagem clara e comum às telas e ao servidor", () => {
    expect(PASSWORD_POLICY_MESSAGE).toContain("10 a 128");
    expect(PASSWORD_POLICY_MESSAGE).toContain("letra maiúscula");
    expect(PASSWORD_POLICY_MESSAGE).toContain("número");
    expect(PASSWORD_POLICY_MESSAGE).toContain("caractere especial");
  });

  it("gera senha provisória que já cumpre a política global", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(isAppPasswordValid(generateProvisionalPassword())).toBe(true);
    }
  });
});
