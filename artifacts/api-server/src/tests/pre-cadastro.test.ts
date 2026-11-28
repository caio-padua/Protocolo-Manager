import { describe, it, expect } from "vitest";
import { pendentesDe } from "../lib/pre-cadastro";

const completo = { birthDate: "1990-01-01", phone: "(11) 90000-0000", email: "a@b.co", sexoBiologico: "F", address: "Rua A, 1" };

describe("pré-cadastro obrigatório: campos pendentes", () => {
  it("completo não tem pendência", () => expect(pendentesDe(completo)).toEqual([]));
  it("vazio aponta todos", () => expect(pendentesDe({ birthDate: "", phone: "", email: "", sexoBiologico: "", address: "" }).length).toBe(5));
  it("telefone curto, e-mail inválido e sexo fora de M/F são recusados", () => {
    expect(pendentesDe({ ...completo, phone: "123", email: "x", sexoBiologico: "X" })).toEqual(["phone", "email", "sexoBiologico"]);
  });
  it("endereço só com espaços é pendente", () => expect(pendentesDe({ ...completo, address: "   " })).toEqual(["address"]));
});
