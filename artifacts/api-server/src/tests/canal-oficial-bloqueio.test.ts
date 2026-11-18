import { describe, expect, it } from "vitest";
import { CanalOficialBloqueio, validarBloqueioCanalOficial } from "../routes/clients";

const base = { numeroOficialEmpresa: true, cpf: "12345678901", email: "a@x.invalid", birthDate: null, notes: null, status: "active", name: "Clínica", phone: "11900000000" };

describe("bloqueio do celular oficial da empresa", () => {
  it("permite nome e telefone", () => {
    expect(() => validarBloqueioCanalOficial(base, { name: "Outra", phone: "11911111111" }, undefined)).not.toThrow();
  });
  it("aceita campos pessoais iguais ao atual (null, vazio e espaços equivalem)", () => {
    expect(() => validarBloqueioCanalOficial(base, { cpf: "12345678901", notes: "", birthDate: undefined, email: " a@x.invalid " }, undefined)).not.toThrow();
  });
  it("recusa mudar CPF, e-mail, nascimento, notas, status e preferências", () => {
    for (const mudanca of [{ cpf: "00000000000" }, { email: "b@x.invalid" }, { birthDate: "1990-01-01" }, { notes: "x" }, { status: "inactive" }]) {
      expect(() => validarBloqueioCanalOficial(base, mudanca, undefined)).toThrow(CanalOficialBloqueio);
    }
    expect(() => validarBloqueioCanalOficial(base, {}, { medical: {} })).toThrow(CanalOficialBloqueio);
  });
  it("cadastro de pessoa (chave desligada) não é afetado", () => {
    expect(() => validarBloqueioCanalOficial({ ...base, numeroOficialEmpresa: false }, { cpf: "00000000000", email: "z@x.invalid" }, { a: 1 })).not.toThrow();
  });
});
