import { describe, expect, it } from "vitest";
import { resumirResultados, resumirLeituras, type ContextoFaixas, type FaixaLinha } from "../lib/exam-progresso-resultados";

const f = (code: string, ordem: number, name: string, low: number | null, high: number | null, sex = "any"): FaixaLinha =>
  ({ analyteCode: code, faixaName: name, low, high, color: null, ordem, sex });
const cinco = (code: string, p: string, sex = "any") => [f(code, 1, `${p}1`, null, 10, sex), f(code, 2, `${p}2`, 10, 20, sex), f(code, 3, `${p}3`, 20, 30, sex), f(code, 4, `${p}4`, 30, 40, sex), f(code, 5, `${p}5`, 40, null, sex)];
const ctx = (sexo: "male" | "female" | null = null): ContextoFaixas => ({
  faixasPorChave: new Map([["a", cinco("a", "A")], ["b", cinco("b", "B", "male").concat(cinco("b", "C", "female"))], ["inc", cinco("inc", "I").slice(0, 3)]]),
  sexoDependentePorCode: new Map([["b", true]]),
  sexoCliente: sexo,
});
const L = (analyteCode: string | null, status: string | null, valueCanonical: string | null, unitConverted = false) => ({ analyteCode, status, valueCanonical, unitConverted });

describe("resumirResultados (só conta; não classifica)", () => {
  it("documento vazio: tudo zero, sem divisão nem pendência inventada", () => {
    expect(resumirResultados([], ctx())).toMatchObject({ total: 0, elegiveis: 0, cincoZonas: 0, pendentes: 0 });
  });
  it("exclusões explícitas: não mapeado, unidade sem fator, sem valor numérico", () => {
    const r = resumirResultados([L(null, "dentro", "5"), L("a", "conferencia", null), L("a", null, null)], ctx());
    expect(r.excluidos).toEqual({ naoMapeados: 1, semUnidadeHomologada: 1, semValorNumerico: 1 });
    expect(r.elegiveis).toBe(0);
  });
  it("cinco zonas só quando o status gravado é a zona calculada; senão divergente", () => {
    const r = resumirResultados([L("a", "A2", "15"), L("a", "dentro", "15"), L("a", "A5", "40")], ctx());
    expect(r).toMatchObject({ elegiveis: 3, cincoZonas: 2, divergentes: 1, pendentes: 1 });
  });
  it("conjunto com menos de 5 zonas é curadoria (faixaIncompleta), não classificado", () => {
    expect(resumirResultados([L("inc", "I1", "5")], ctx())).toMatchObject({ faixaIncompleta: 1, cincoZonas: 0, pendentes: 1 });
  });
  it("sexo-dependente: usa o sexo do cadastro; sem sexo, sem faixa geral, não escolhe e sinaliza", () => {
    expect(resumirResultados([L("b", "C2", "15")], ctx("female"))).toMatchObject({ cincoZonas: 1 });
    expect(resumirResultados([L("b", "B2", "15")], ctx("female"))).toMatchObject({ cincoZonas: 0, divergentes: 1 });
    expect(resumirResultados([L("b", "dentro", "15")], ctx(null))).toMatchObject({ cincoZonas: 0, simples: 1, faltaSexo: 1 });
  });
  it("sem faixa institucional: simples ou sem classificação", () => {
    const c = ctx();
    expect(resumirResultados([L("x", "acima", "9"), L("x", null, "9")], c)).toMatchObject({ simples: 1, semClassificacao: 1, pendentes: 2 });
  });
});

describe("resumirLeituras", () => {
  it("sem pipeline gravado: indisponível (não presume IAs)", () => {
    expect(resumirLeituras(null).reconciliacao).toBe("indisponivel");
    expect(resumirLeituras(undefined).leituras).toEqual([]);
  });
  it("lê só o que foi gravado", () => {
    expect(resumirLeituras([{ provider: "gemini", ok: true }, { provider: "claude", ok: false }])).toMatchObject({ leituras: ["gemini"], reconciliacao: "nao_aplicavel" });
  });
});
