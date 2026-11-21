import { describe, expect, it } from "vitest";
import { idadeDe, mascararCpf, retiraFato, ehIdentidade, ehCirurgia } from "../lib/anamnese-retorno";

describe("idade calculada da data de nascimento", () => {
  it("conta anos completos e respeita o aniversario", () => {
    expect(idadeDe("1988-01-30", "2026-01-29")).toBe(37);
    expect(idadeDe("1988-01-30", "2026-01-30")).toBe(38);
    expect(idadeDe("30/01/1988", "2026-11-20")).toBe(38);
  });
  it("sem data valida nao inventa idade", () => {
    expect(idadeDe(null)).toBeNull();
    expect(idadeDe("")).toBeNull();
    expect(idadeDe("lixo")).toBeNull();
    expect(idadeDe("2999-01-01", "2026-01-01")).toBeNull();
  });
});

describe("identidade e mascara", () => {
  it("nome 1, CPF 2 e idade 41 sao identidade; cirurgias sao 8, 9, 88, 315", () => {
    for (const id of [1, 2, 41]) expect(ehIdentidade(id)).toBe(true);
    for (const id of [8, 9, 88, 315]) expect(ehCirurgia(id)).toBe(true);
    expect(ehIdentidade(8)).toBe(false);
  });
  it("mascara o CPF", () => {
    expect(mascararCpf("111.444.777-35")).toBe("111.***.***-35");
    expect(mascararCpf(null)).toBeNull();
  });
});

describe("retirar fato registrado", () => {
  const multi = (...s: string[]) => ({ tipo: "multi", selecionados: s });
  const texto = (t: string) => ({ tipo: "texto", texto: t });
  it("multi: acrescentar pode, retirar nao", () => {
    expect(retiraFato(multi("A", "B"), multi("A", "B", "C"))).toBe(false);
    expect(retiraFato(multi("A", "B"), multi("A"))).toBe(true);
    expect(retiraFato(multi("A"), texto("A"))).toBe(true);
  });
  it("'Nunca operei' pode sair quando surge uma cirurgia real", () => {
    expect(retiraFato(multi("Nunca operei"), multi("Hernia"))).toBe(false);
  });
  it("texto: precisa conservar o que ja havia", () => {
    expect(retiraFato(texto("Vesicula 2019"), texto("Vesicula 2019; Hernia"))).toBe(false);
    expect(retiraFato(texto("Vesicula 2019"), texto("Hernia"))).toBe(true);
    expect(retiraFato(texto("Não "), texto("Hernia"))).toBe(false);
  });
  it("sim/nao: true nao volta a false", () => {
    expect(retiraFato({ tipo: "boolean", bool: true }, { tipo: "boolean", bool: false })).toBe(true);
    expect(retiraFato({ tipo: "boolean", bool: false }, { tipo: "boolean", bool: true })).toBe(false);
  });
  it("sem registro anterior nada e retirada", () => {
    expect(retiraFato(undefined, multi("A"))).toBe(false);
  });
});
