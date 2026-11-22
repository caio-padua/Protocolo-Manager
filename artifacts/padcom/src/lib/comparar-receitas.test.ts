import { describe, expect, it } from "vitest";
import { compararReceitas, lerAtivos, type ReceitaParaComparar } from "./comparar-receitas";

const oxidacao = (alfa: string, extra = "") => ({
  name: "Fórmula Oxidação X",
  ativos: `Ácido alfa lipoico ${alfa} - antioxidante\nVitamina E 400 UI - proteção${extra}`,
  posologia: "1 dose VO – Almoço",
});

const r = (id: number, formulas: ReceitaParaComparar["formulas"]): ReceitaParaComparar => ({ id, rotulo: `#${id}`, formulas });

describe("leitura dos ativos", () => {
  it("separa nome e dose, com ou sem espaço e acento", () => {
    expect(lerAtivos("Ácido alfa lipoico 200mg - função\nBile bovina purificada - 300 mg - função\nLactase 9000 FCC - digestão"))
      .toEqual([
        { nome: "Ácido alfa lipoico", dose: "200 mg" },
        { nome: "Bile bovina purificada", dose: "300 mg" },
        { nome: "Lactase", dose: "9000 fcc" },
      ]);
  });
  it("normaliza ponto e vírgula decimal", () => {
    expect(lerAtivos("Minoxidil 1.5mg")[0].dose).toBe("1,5 mg");
  });
  it("ativo sem dose continua existindo", () => {
    expect(lerAtivos("Extrato de gengibre - pró-digestivo")).toEqual([{ nome: "Extrato de gengibre", dose: null }]);
  });
});

describe("comparação de receitas", () => {
  it("ácido alfa lipoico 200 mg contra 100 mg na mesma fórmula → alterada, só o ativo muda", () => {
    const res = compararReceitas([r(1, [oxidacao("200 mg")]), r(2, [oxidacao("100 mg")])]);
    expect(res.formulas).toHaveLength(1);
    const f = res.formulas[0];
    expect(f.status).toBe("alterada");
    expect(f.ativos.find((a) => a.nome === "Ácido alfa lipoico")).toMatchObject({ doses: ["200 mg", "100 mg"], status: "dose_diferente" });
    expect(f.ativos.find((a) => a.nome === "Vitamina E")?.status).toBe("igual");
    expect(f.posologiaDiferente).toBe(false);
    expect(res.resumo).toEqual({ iguais: 0, alteradas: 1, soEmAlgumas: 0 });
  });

  it("fórmulas idênticas → igual, mesmo com 200mg escrito de outro jeito", () => {
    const res = compararReceitas([r(1, [oxidacao("200 mg")]), r(2, [oxidacao("200MG")])]);
    expect(res.formulas[0].status).toBe("igual");
  });

  it("fórmula que só existe em uma receita → so_em_algumas", () => {
    const res = compararReceitas([r(1, [oxidacao("200 mg"), { name: "T3 10mcg", ativos: "T3 10 mcg", posologia: "Em jejum" }]), r(2, [oxidacao("200 mg")])]);
    const t3 = res.formulas.find((f) => f.nome === "T3 10mcg")!;
    expect(t3.status).toBe("so_em_algumas");
    expect(t3.presente).toEqual([true, false]);
    expect(res.resumo).toEqual({ iguais: 1, alteradas: 0, soEmAlgumas: 1 });
  });

  it("ativo que entrou em uma versão → ausente_em_algumas e fórmula alterada", () => {
    const res = compararReceitas([r(1, [oxidacao("200 mg")]), r(2, [oxidacao("200 mg", "\nSelênio 100 mcg - cofator")])]);
    const f = res.formulas[0];
    expect(f.status).toBe("alterada");
    expect(f.ativos.find((a) => a.nome === "Selênio")).toMatchObject({ doses: [undefined, "100 mcg"], status: "ausente_em_algumas" });
  });

  it("mudança só na posologia também conta como alterada", () => {
    const b = { ...oxidacao("200 mg"), posologia: "2 doses VO – Jantar" };
    const res = compararReceitas([r(1, [oxidacao("200 mg")]), r(2, [b])]);
    expect(res.formulas[0]).toMatchObject({ status: "alterada", posologiaDiferente: true });
  });

  it("compara três receitas e acha o nome mesmo com acento ou caixa diferente", () => {
    const outra = { ...oxidacao("300 mg"), name: "FORMULA OXIDACAO X" };
    const res = compararReceitas([r(1, [oxidacao("200 mg")]), r(2, [oxidacao("100 mg")]), r(3, [outra])]);
    expect(res.formulas).toHaveLength(1);
    expect(res.formulas[0].ativos[0].doses).toEqual(["200 mg", "100 mg", "300 mg"]);
  });
});
