/** TEX — gerador do PDF único. Dados 100% sintéticos; sem banco, sem rede. Nível: MOCK/puro. */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { gerarTexPdf, decidirFormato, selecionarColunas } from "../lib/tex-evolucao-pdf";
import type { EvolucaoMontada } from "../routes/exames-lab";

function evo(nDatas: number, naoConferida = false): EvolucaoMontada {
  const columns = Array.from({ length: nDatas }, (_, i) => ({
    key: `2024-${String((i % 12) + 1).padStart(2, "0")}-${String(10 + Math.floor(i / 12)).padStart(2, "0")}|Lab Sintético ${i % 2}`,
    date: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-10`,
    lab: `Laboratório Sintético ${i % 2}`,
    confLevel: (naoConferida && i === nDatas - 1 ? "ia" : "c2") as "ia" | "c2",
    conferenteName: null, conferenteCargo: null, isHistory: false,
  }));
  columns.forEach((c, i) => { c.key = `${c.date}|${c.lab}`; });
  const analytes = Array.from({ length: 30 }, (_, k) => ({
    key: `A${k}`, name: `Analito sintético número ${k + 1} com nome longo`, unit: "mg/dL", refLow: "10", refHigh: "100",
    direction: "target" as never, zonesSource: null, zones: null, trend: null,
    cells: Object.fromEntries(columns.map((c, i) => [c.key, {
      value: String(20 + k + i), valueNum: 20 + k + i, unit: "mg/dL", unitConverted: i === 1, unitRaw: i === 1 ? "mmol/L" : "mg/dL",
      refLow: "10", refHigh: i === 2 ? "110" : "100", status: null, documentId: 1, zone: null,
    }])),
  }));
  return { columns, analytes } as unknown as EvolucaoMontada;
}
const base = { paciente: { nome: "Paciente Fictício Teste", documentoMinimo: "Nasc. 01/01/1980" }, emissao: "2026-11-16", rotuloAmbiente: "DOCUMENTO SINTÉTICO — SEM VALIDADE CLÍNICA" };

describe("decisão de formato", () => {
  it("até 5 datas: retrato; 6 a 10: paisagem; modo últimas 5 sempre retrato", () => {
    expect(decidirFormato(5, "completo").orientacao).toBe("retrato");
    expect(decidirFormato(6, "completo").orientacao).toBe("paisagem");
    expect(decidirFormato(20, "ultimas5").orientacao).toBe("retrato");
    expect(decidirFormato(11, "completo").porBloco).toBe(10);
  });
  it("data mais recente é a última; sem data nunca fica à direita", () => {
    const e = evo(8); e.columns.push({ key: "?|x", date: null, lab: "x", confLevel: "c2", conferenteName: null, conferenteCargo: null, isHistory: false } as never);
    const cols = selecionarColunas(e, "completo");
    expect(cols[0].date).toBeNull();
    expect(cols[cols.length - 1].date).toBe("2020-08-10");
  });
});

describe("PDF único", () => {
  for (const [n, modo, orient, blocos] of [[1, "completo", "retrato", 1], [5, "completo", "retrato", 1], [6, "completo", "paisagem", 1], [10, "completo", "paisagem", 1], [11, "completo", "paisagem", 2], [20, "completo", "paisagem", 2], [20, "ultimas5", "retrato", 1]] as const) {
    it(`${n} datas, modo ${modo}: ${orient}, ${blocos} bloco(s), um só arquivo`, async () => {
      const r = await gerarTexPdf({ ...base, modo, evolucao: evo(n) });
      const doc = await PDFDocument.load(r.pdf);
      expect(r.orientacao).toBe(orient);
      expect(r.blocos).toBe(blocos);
      expect(doc.getPageCount()).toBe(r.paginas);
      const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
      expect(orient === "retrato" ? w < h : w > h).toBe(true);
      if (n === 5 || n === 11) writeFileSync(`/tmp/tex/tex-${n}-${modo}.pdf`, r.pdf);
      if (n === 6) writeFileSync(`/tmp/tex/tex-6.pdf`, r.pdf);
    });
  }
  it("0 datas: recusa com erro claro", async () => {
    await expect(gerarTexPdf({ ...base, modo: "completo", evolucao: evo(0) })).rejects.toThrow(/Não há resultados/);
  });
  it("resultado não conferido é sinalizado", async () => {
    const r = await gerarTexPdf({ ...base, modo: "completo", evolucao: evo(3, true) });
    expect(r.contemNaoConferidos).toBe(true);
    expect((await gerarTexPdf({ ...base, modo: "completo", evolucao: evo(3) })).contemNaoConferidos).toBe(false);
  });
});
