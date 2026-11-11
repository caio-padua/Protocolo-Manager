import { describe, expect, it } from "vitest";
import { compararIdentidadeCatalogo, type IdentidadeCatalogo } from "../../../../../lib/procedimentos-shared/src/identidade-catalogo";

const q10: IdentidadeCatalogo = {
  nome: "COENZIMA Q10", identidadeConfirmada: true, forma: "ampola",
  componentes: [{ nome: "COENZIMA Q10", doseTotal: "100", unidade: "mg" }],
  composicaoCompletaConfirmada: true,
  volumeMl: "2", concentracao: "50 mg/mL", vias: ["IM"],
};

describe("identidade de cadastro e apresentação", () => {
  it("mantém a ficha para dose total igual com outra concentração e volume", () => {
    expect(compararIdentidadeCatalogo(q10, { ...q10, volumeMl: "4", concentracao: "25 mg/mL" }))
      .toMatchObject({ ficha: "mesma", apresentacao: "distinta" });
  });
  it("separa cadastro de doses totais diferentes", () => {
    expect(compararIdentidadeCatalogo(q10, { ...q10, componentes: [{ ...q10.componentes![0], doseTotal: "50" }],
      volumeMl: "2", concentracao: "25 mg/mL" }))
      .toMatchObject({ ficha: "distinta", apresentacao: "distinta" });
  });
  it("separa ficha de ampola e frasco", () => {
    expect(compararIdentidadeCatalogo(q10, { ...q10, forma: "frasco" })).toMatchObject({ ficha: "distinta" });
  });
  it("admite apresentações iguais de fornecedores diferentes", () => {
    expect(compararIdentidadeCatalogo(q10, { ...q10, volumeMl: "2,00", concentracao: "050,00 MG/mL", vias: ["im"] }))
      .toMatchObject({ ficha: "mesma", apresentacao: "mesma" });
  });
  it("não supõe apresentação igual com volume, concentração ou vias ausentes", () => {
    for (const b of [{ ...q10, volumeMl: null }, { ...q10, concentracao: null }, { ...q10, vias: null }]) {
      expect(compararIdentidadeCatalogo(q10, b)).toMatchObject({ ficha: "mesma", apresentacao: "conferir" });
    }
  });
  it("recusa conciliar quando a concentração contradiz dose ou não é interpretável", () => {
    for (const concentracao of ["25 mg/mL", "5%", "100 mg / 2 mL"]) {
      expect(compararIdentidadeCatalogo(q10, { ...q10, concentracao }))
        .toMatchObject({ ficha: "mesma", apresentacao: "conferir" });
    }
  });
  it("não confunde uma via inválida com duas vias válidas", () => {
    expect(compararIdentidadeCatalogo({ ...q10, vias: ["IM|SC"] }, { ...q10, vias: ["IM", "SC"] }))
      .toMatchObject({ ficha: "mesma", apresentacao: "conferir" });
  });
  it("não converte unidades nem supõe equivalência de nomes", () => {
    expect(compararIdentidadeCatalogo(q10, { ...q10, nome: "OUTRO" })).toMatchObject({ ficha: "conferir" });
    expect(compararIdentidadeCatalogo(q10, { ...q10, componentes: [{ ...q10.componentes![0], doseTotal: "100000", unidade: "mcg" }] }))
      .toMatchObject({ ficha: "conferir" });
  });
  it("exige composição completa e mantém blends distintos", () => {
    expect(compararIdentidadeCatalogo(q10, { ...q10, componentes: null })).toMatchObject({ ficha: "conferir" });
    expect(compararIdentidadeCatalogo(q10, { ...q10, componentes: [...q10.componentes!, { nome: "OUTRO", doseTotal: "2", unidade: "mg" }] }))
      .toMatchObject({ ficha: "conferir" });
  });
  it("distingue implante absorvível do silástico sem presumir subtipo", () => {
    const base = { ...q10, forma: "implante", subtipoImplante: "absorvivel" as const };
    expect(compararIdentidadeCatalogo(base, { ...base, subtipoImplante: "nao_absorvivel" }))
      .toMatchObject({ ficha: "distinta", apresentacao: "distinta" });
    expect(compararIdentidadeCatalogo(base, { ...base, subtipoImplante: null }))
      .toMatchObject({ ficha: "conferir", apresentacao: "conferir" });
  });
  it("não agrupa ADEKs com quantidades diferentes", () => {
    const vitaminas = { ...q10, nome: "ADEK", componentes: [
      { nome: "A", doseTotal: "50000", unidade: "UI" }, { nome: "D3", doseTotal: "600000", unidade: "UI" },
      { nome: "E", doseTotal: "100", unidade: "UI" }, { nome: "K2", doseTotal: "1300", unidade: "mcg" },
    ] };
    expect(compararIdentidadeCatalogo(vitaminas, { ...vitaminas, componentes: vitaminas.componentes.map(c =>
      c.nome === "E" ? { ...c, doseTotal: "500" } : c) })).toMatchObject({ ficha: "distinta" });
  });
  it("não admite confirmação ausente nem unidades malformadas", () => {
    expect(compararIdentidadeCatalogo(q10, { ...q10, composicaoCompletaConfirmada: false })).toMatchObject({ ficha: "conferir" });
    expect(compararIdentidadeCatalogo(q10, { ...q10, componentes: [{ ...q10.componentes![0], unidade: "mg|x" }] }))
      .toMatchObject({ ficha: "conferir" });
  });
  it("não confunde campos desconhecidos com identidade comprovada", () => {
    expect(compararIdentidadeCatalogo(q10, { ...q10, identidadeConfirmada: false })).toMatchObject({ ficha: "conferir" });
    expect(compararIdentidadeCatalogo(q10, { ...q10, forma: "desconhecida" })).toMatchObject({ ficha: "conferir" });
    expect(compararIdentidadeCatalogo({ ...q10, nome: "não informado" }, { ...q10, nome: "não informado" }))
      .toMatchObject({ ficha: "conferir" });
    expect(compararIdentidadeCatalogo(q10, { ...q10, componentes: [{ ...q10.componentes![0], nome: "não informado" }] }))
      .toMatchObject({ ficha: "conferir" });
  });
  it("não altera os dados de entrada", () => {
    const antes = JSON.stringify(q10);
    compararIdentidadeCatalogo(q10, { ...q10, vias: ["SC", "IM"] });
    expect(JSON.stringify(q10)).toBe(antes);
  });
});
