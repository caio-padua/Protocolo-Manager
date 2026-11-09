import { describe, expect, it } from "vitest";
import { identidadeLocalReceituario } from "../lib/identidade-local-receituario";

describe("identidade do local no receituário", () => {
  it("usa o nome, endereço e telefone reais de cada local", () => {
    expect(identidadeLocalReceituario({
      name: "Clínica Exemplo",
      address: "Rua Um, 10",
      phone: "1111-1111",
    }, "Nome alternativo")).toEqual({
      nome: "Clínica Exemplo",
      endereco: "Rua Um, 10",
      telefone: "1111-1111",
    });
    expect(identidadeLocalReceituario({
      name: "Clínica Outra",
      address: "Rua Dois, 20",
      phone: null,
    })).toEqual({
      nome: "Clínica Outra",
      endereco: "Rua Dois, 20",
      telefone: undefined,
    });
  });

  it("não inventa endereço ou nome quando faltam no cadastro", () => {
    expect(identidadeLocalReceituario({ name: null, address: null })).toEqual({
      nome: null, endereco: "", telefone: undefined,
    });
    expect(identidadeLocalReceituario({ name: "  ", address: " " }, "Local autorizado"))
      .toEqual({ nome: "Local autorizado", endereco: "", telefone: undefined });
  });
});
