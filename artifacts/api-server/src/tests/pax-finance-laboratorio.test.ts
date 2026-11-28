import { describe, expect, it } from "vitest";
import { calcularLab, premissasPadrao, faseDoMes, somaMes, SELO_LAB } from "../pax-finance/laboratorio-calc";

const P = { ...premissasPadrao(new Date(2026, 10, 21)), inicio: "2025-12" };

describe("laboratório de 24 meses (simulação)", () => {
  const r = calcularLab(P);
  it("tem 24 meses, selo fixo e is_simulation verdadeiro", () => {
    expect(r.meses).toHaveLength(24);
    expect(r.meses[0].mes).toBe("2025-12"); expect(r.meses[23].mes).toBe("2027-11");
    expect(r.isSimulation).toBe(true); expect(r.selo).toBe(SELO_LAB);
  });
  it("meses anteriores à constituição (13/08/2026) não pertencem à PADUMANN", () => {
    expect(faseDoMes("2026-07").fase).toBe("anterior_abertura");
    expect(faseDoMes("2026-07").rotulo).toMatch(/sem CNPJ/);
    expect(faseDoMes("2026-08").fase).toBe("mes_abertura");
    expect(faseDoMes("2026-09").fase).toBe("posterior_abertura");
    expect(r.meses.filter((m) => m.fase.fase === "anterior_abertura")).toHaveLength(8);
  });
  it("alíquota efetiva cresce por faixa e nunca é fixa", () => {
    const aliq = r.meses.map((m) => m.sem.aliquotaEfetivaPct!);
    expect(new Set(aliq).size).toBeGreaterThan(5);
  });
  it("lucro contábil e distribuível nunca são afirmados", () => {
    for (const m of r.meses) { expect(m.sem.lucroContabilCents).toBeNull(); expect(m.com.lucroDistribuivelCents).toBeNull(); }
  });
  it("planejamento pode piorar um mês isolado, mas o total é calculado e a economia é a diferença exata", () => {
    const c = (k: "sem" | "com") => r.meses.reduce((a, m) => a + m[k].tributosCents + m[k].retencoesCents, 0);
    expect(r.totais.economiaCargaCents).toBe(c("sem") - c("com"));
    expect(r.totais.economiaCargaCents).toBeGreaterThan(0);
    expect(r.meses[23].com.anexo).toBe("III"); expect(r.meses[23].sem.anexo).toBe("V");
  });
  it("RPA não entra no Fator R sem marcação", () => {
    const a = calcularLab({ ...P, rpaContaFatorR: false }), b = calcularLab({ ...P, rpaContaFatorR: true });
    expect(b.meses[10].sem.fatorRPct).toBeGreaterThan(a.meses[10].sem.fatorRPct);
  });
  it("valor digitado vira nova curva: meses seguintes crescem a partir dele, anteriores intactos", () => {
    const e = calcularLab(P, { "2026-03": { faturamentoCents: 9_900_000 } });
    expect(e.meses[3].sem.faturamentoCents).toBe(9_900_000);
    expect(e.meses[2].sem.faturamentoCents).toBe(r.meses[2].sem.faturamentoCents);
    expect(e.meses[4].sem.faturamentoCents).toBe(Math.round(9_900_000 * (1 + P.crescimentoMensalPct / 100)));
  });
  it("caixa começa no mês 0 com o saldo inicial", () => {
    const e = calcularLab({ ...P, caixaInicialCents: 1_000_000 });
    expect(e.meses[0].sem.saldoCaixaCents).not.toBeNull();
    expect(somaMes("2025-12", 23)).toBe("2027-11");
  });
});
