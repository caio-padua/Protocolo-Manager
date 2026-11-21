import { describe, expect, it } from "vitest";
import { calcularPainel } from "../pax-finance/painel-tributario";
import { painelCredito } from "../pax-finance/credito-pesquisa";

const reg = (p: ReturnType<typeof calcularPainel>, k: string) => p.regimes.find((r) => r.key === k)!;
const lin = (p: ReturnType<typeof calcularPainel>, k: string, c: string) => reg(p, k).linhas.find((l) => l.chave === c)!;

describe("painel tributário (simulação)", () => {
  it("sem faturamento: nenhuma linha inventa número e total fica vazio", () => {
    const p = calcularPainel({});
    for (const r of p.regimes) { expect(r.subtotalCents).toBeNull(); expect(r.linhas.every((l) => l.valorCents === null || l.estado === "informativo")).toBe(true); }
    expect(lin(p, "simples_iii", "SIMPLES_CPP").motivo).toMatch(/faturamento/i);
  });

  it("Simples Anexo III, faixa 3: alíquota efetiva 10,56% e DAS de R$ 5.280,00", () => {
    const p = calcularPainel({ faturamentoMensalCents: 5000000, rbt12Cents: 60000000 });
    const r = reg(p, "simples_iii");
    const das = r.linhas.filter((l) => l.chave.startsWith("SIMPLES_")).reduce((a, l) => a + (l.valorCents ?? 0), 0);
    expect(Math.abs(das - 528000)).toBeLessThanOrEqual(6);
    expect(r.subtotalPct).toBeCloseTo(10.56, 1);
    expect(r.liquidoCents).toBe(5000000 - r.subtotalCents!);
  });

  it("Lucro Presumido: bases de 32%, sem adicional abaixo de R$ 20 mil e sem acréscimo da LC 224", () => {
    const p = calcularPainel({ faturamentoMensalCents: 5000000, rbt12Cents: 60000000, issAliquotaPct: 3 });
    expect(lin(p, "presumido", "IRPJ").valorCents).toBe(240000);
    expect(lin(p, "presumido", "IRPJ_ADICIONAL").valorCents).toBe(0);
    expect(lin(p, "presumido", "CSLL").valorCents).toBe(144000);
    expect(lin(p, "presumido", "PIS_CUM").valorCents).toBe(32500);
    expect(lin(p, "presumido", "COFINS_CUM").valorCents).toBe(150000);
    expect(lin(p, "presumido", "ISS").valorCents).toBe(150000);
  });

  it("ISS, RAT e terceiros sem dado ficam vazios com motivo (sem alíquota inventada)", () => {
    const p = calcularPainel({ faturamentoMensalCents: 5000000, folhaMensalCents: 1000000 });
    expect(lin(p, "presumido", "ISS").valorCents).toBeNull();
    expect(lin(p, "presumido", "RAT").motivo).toMatch(/1%, 2% ou 3%/);
    expect(lin(p, "presumido", "TERCEIROS").valorCents).toBeNull();
    expect(reg(p, "presumido").completo).toBe(false);
  });

  it("Fator R decide o anexo (28%)", () => {
    expect(calcularPainel({ faturamentoMensalCents: 5000000, rbt12Cents: 60000000, folhaMensalCents: 1500000 }).fatorR.anexo).toBe("III");
    expect(calcularPainel({ faturamentoMensalCents: 5000000, rbt12Cents: 60000000, folhaMensalCents: 500000 }).fatorR.anexo).toBe("V");
  });

  it("Simples fora do limite de R$ 4,8 milhões fica indisponível", () => {
    const p = calcularPainel({ faturamentoMensalCents: 100000000, rbt12Cents: 600000000 });
    expect(reg(p, "simples_iii").disponivel).toBe(false);
  });

  it("sócio: pró-labore de R$ 5.000 paga INSS 11% e IRRF zero; dividendos acima de R$ 50 mil retêm 10% do total", () => {
    const p = calcularPainel({ faturamentoMensalCents: 5000000, proLaboreMensalCents: 500000, distribuicaoLucrosMensalCents: 6000000 });
    const s = p.socio.linhas;
    expect(s.find((l) => l.chave === "INSS_SOCIO")!.valorCents).toBe(55000);
    expect(s.find((l) => l.chave === "IRRF_PROLABORE")!.valorCents).toBe(0);
    expect(s.find((l) => l.chave === "IRRF_DIVIDENDOS")!.valorCents).toBe(600000);
  });

  it("crédito: Pronampe limita a 30% do faturamento anual e ao teto de R$ 250 mil", () => {
    const a = painelCredito({ faturamentoMensalCents: 5000000 });
    expect(a.linhas.find((l) => l.key === "pronampe")!.limiteTeoricoCents).toBe(18000000);
    const b = painelCredito({ faturamentoMensalCents: 20000000 });
    const pr = b.linhas.find((l) => l.key === "pronampe")!;
    expect(pr.limiteTeoricoCents).toBe(25000000); expect(pr.limitadoPeloTeto).toBe(true);
    expect(b.linhas.find((l) => l.key === "bndes")!.limiteTeoricoCents).toBeNull();
    expect(painelCredito({}).linhas.every((l) => l.limiteTeoricoCents === null)).toBe(true);
  });
});
