import { describe, expect, it } from "vitest";
import { alterarAtivo, lerPartesAtivo, montarLinhaAtivo } from "./ativos-linhas";

describe("ativos-linhas", () => {
  it("lê nome, dose e unidade", () => {
    expect(lerPartesAtivo("Lactase 9000 fcc")).toMatchObject({ nome: "Lactase", dose: "9000", unidade: "fcc" });
    expect(lerPartesAtivo("DPP-IV (Dipeptidil Peptidase-IV) 200 mg")).toMatchObject({ nome: "DPP-IV (Dipeptidil Peptidase-IV)", dose: "200", unidade: "mg" });
    expect(lerPartesAtivo("Vitamina D3 5.000 UI")).toMatchObject({ dose: "5.000", unidade: "UI" });
  });
  it("devolve a linha idêntica quando nada muda", () => {
    for (const l of ["Lactase 9000 fcc", "Bile bovina 300mg", "Selênio 200 mcg por cápsula", "Cápsulas XR (DRcaps)"]) {
      expect(montarLinhaAtivo(lerPartesAtivo(l))).toBe(l);
    }
  });
  it("sem dose reconhecida, a linha inteira é o nome", () => {
    expect(lerPartesAtivo("Cápsulas XR Liberação Entérica")).toMatchObject({ nome: "Cápsulas XR Liberação Entérica", dose: null });
    expect(lerPartesAtivo("500 mg")).toMatchObject({ dose: null });
    expect(alterarAtivo("Cápsulas XR", "nome", "Cápsulas Y")).toBe("Cápsulas Y");
  });
  it("altera só o campo escolhido", () => {
    expect(alterarAtivo("Bile bovina 300mg", "dose", "350")).toBe("Bile bovina 350mg");
    expect(alterarAtivo("Selênio 200 mcg por cápsula", "unidade", "mg")).toBe("Selênio 200 mg por cápsula");
    expect(alterarAtivo("Lactase 9000 fcc", "nome", "Lactase ácida")).toBe("Lactase ácida 9000 fcc");
  });
  it("não confunde unidade colada em palavra", () => {
    expect(lerPartesAtivo("Vitamina B12 1 gengibre").dose).toBeNull();
  });
});
