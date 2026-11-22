import { describe, expect, it } from "vitest";
import { faixaImc, formatarImc, idadeAdultaNaMedicao } from "./classificacaoImc";

describe("faixas de referência do índice de massa corporal", () => {
  it.each([
    [18.4999, "baixo"], [18.5, "normal"], [24.9999, "normal"], [25, "sobrepeso"],
    [29.9999, "sobrepeso"], [30, "obesidade1"], [34.9999, "obesidade1"],
    [35, "obesidade2"], [39.9999, "obesidade2"], [40, "obesidade3"],
  ])("classifica %s sem arredondar", (valor, esperado) => {
    expect(faixaImc(valor)?.key).toBe(esperado);
    const exibido = Number(formatarImc(valor).replace(/\./g, "").replace(",", "."));
    expect(faixaImc(exibido)?.key).toBe(esperado);
  });

  it("recusa valores impossíveis ou não numéricos", () => {
    expect(faixaImc(0)).toBeNull();
    expect(faixaImc(-1)).toBeNull();
    expect(faixaImc(Number.NaN)).toBeNull();
    expect(faixaImc(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("idade na data da medição", () => {
  it("considera o aniversário na data da medição, não a idade atual", () => {
    expect(idadeAdultaNaMedicao("2008-11-22", "2026-11-21")).toBe(false);
    expect(idadeAdultaNaMedicao("2008-11-22", "2026-11-22")).toBe(true);
    expect(idadeAdultaNaMedicao("2008-11-22T00:00:00.000Z", "2026-11-23")).toBe(true);
  });
  it("recusa datas ausentes, inválidas e anteriores ao nascimento", () => {
    expect(idadeAdultaNaMedicao(null, "2026-11-22")).toBe(false);
    expect(idadeAdultaNaMedicao("2008-02-30", "2026-11-22")).toBe(false);
    expect(idadeAdultaNaMedicao("2008-11-22", "2026-02-30")).toBe(false);
    expect(idadeAdultaNaMedicao("2026-11-22", "2008-11-22")).toBe(false);
  });
  it("considera 1º de março para aniversário de 29 de fevereiro em ano não bissexto", () => {
    expect(idadeAdultaNaMedicao("2008-02-29", "2026-02-28")).toBe(false);
    expect(idadeAdultaNaMedicao("2008-02-29", "2026-03-01")).toBe(true);
  });
});
