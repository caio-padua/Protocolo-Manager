import { describe, expect, it } from "vitest";
import { abreviarNomeCliente } from "./abreviarNomeCliente";
import { formatarNascimento, idadeCompleta } from "./idadeCliente";

describe("identidade do cliente", () => {
  it("abrevia visualmente da direita para a esquerda sem mudar sobrenome", () => {
    const nome = "Ana Beatriz Clara Duarte Silva";
    const medir = (texto: string) => texto.length;
    expect(abreviarNomeCliente(nome, "Ana Beatriz C. D. Silva".length, medir)).toBe("Ana Beatriz C. D. Silva");
    expect(nome).toBe("Ana Beatriz Clara Duarte Silva");
  });
  it("apresenta idade civil no fuso da clínica", () => {
    expect(idadeCompleta("2000-01-10", new Date("2026-01-10T02:00:00Z"))).toBe("25 anos 11 meses 30 dias");
    expect(idadeCompleta("2000-01-10", new Date("2026-01-10T15:00:00Z"))).toBe("26 anos 0 meses 0 dias");
  });
  it("rejeita datas inválidas ou futuras e formata data válida", () => {
    expect(formatarNascimento("2026-02-30")).toBeNull();
    expect(idadeCompleta("2099-01-01", new Date("2026-01-01T15:00:00Z"))).toBeNull();
    expect(formatarNascimento("2000-02-29")).toBe("29/02/2000");
  });
});
