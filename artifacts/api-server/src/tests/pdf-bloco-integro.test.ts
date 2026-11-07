/**
 * Regra do CEO: fórmula/item nunca é cortado entre páginas; se não couber inteiro mais
 * 1 linha em branco, vai inteiro para a página seguinte. Vale para todos os documentos médicos.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blocoDeveIrParaProximaPagina } from "../lib/pdf-bloco-integro";
import { generateReceituarioPdfV2 } from "../lib/receituario-pdf";
import { generateRecipePdf } from "../lib/prescription-pdf";
import { generateExamRequestPdf } from "../lib/exam-request-pdf";

const base = { limiteInferior: 100, linhaEmBranco: 12, topoPaginaNova: 700 };

function paginas(bytes: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), "pdfbloco-"));
  const f = join(dir, "d.pdf");
  writeFileSync(f, bytes);
  const out = execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" });
  return out.split("\f").filter((p, i, a) => i < a.length - 1 || p.trim());
}

/** Cada marcador INICIO/FIM do mesmo número precisa estar na mesma página. */
function assertSemCorte(pgs: string[], n: number) {
  const paginasUsadas = new Set<number>();
  for (let i = 1; i <= n; i++) {
    const id = String(i).padStart(2, "0");
    const ini = pgs.findIndex((p) => p.includes(`INICIO${id}`));
    const fim = pgs.findIndex((p) => p.includes(`FIM${id}`));
    expect(ini, `INICIO${id} ausente`).toBeGreaterThanOrEqual(0);
    expect(fim, `FIM${id} ausente`).toBeGreaterThanOrEqual(0);
    expect(fim, `item ${id} cortado entre páginas`).toBe(ini);
    paginasUsadas.add(ini);
  }
  return paginasUsadas.size;
}

describe("blocoDeveIrParaProximaPagina (regras 1 e 2)", () => {
  it("cabe com folga de 1 linha em branco: fica na página", () => {
    expect(blocoDeveIrParaProximaPagina({ ...base, y: 300, alturaBloco: 150 })).toBe(false);
  });
  it("cabe exato, mas SEM a linha em branco: vai para a próxima", () => {
    // y - 188 = 112 >= 100 cabe; y=200,h=100 -> 200-112=88 <100 não cabe com folga
    expect(blocoDeveIrParaProximaPagina({ ...base, y: 200, alturaBloco: 100 })).toBe(true);
    expect(blocoDeveIrParaProximaPagina({ ...base, y: 200, alturaBloco: 88 })).toBe(false);
    expect(blocoDeveIrParaProximaPagina({ ...base, y: 200, alturaBloco: 89 })).toBe(true);
  });
  it("não cabe: vai inteiro para a próxima", () => {
    expect(blocoDeveIrParaProximaPagina({ ...base, y: 150, alturaBloco: 200 })).toBe(true);
  });
  it("maior que uma página inteira: não adianta empurrar, flui", () => {
    expect(blocoDeveIrParaProximaPagina({ ...base, y: 150, alturaBloco: 900 })).toBe(false);
  });
});

describe("Documentos médicos não cortam item entre páginas (regra 3)", () => {
  it("Receituário: 14 fórmulas de tamanhos variados, nenhuma cortada", async () => {
    const formulas = Array.from({ length: 14 }, (_, k) => {
      const id = String(k + 1).padStart(2, "0");
      const nAtivos = 3 + ((k * 5) % 9);
      return {
        nome: `Formula INICIO${id}`,
        ativos: Array.from({ length: nAtivos }, (_, j) => `Ativo ${j + 1} ${10 + j}mg`).join("\n"),
        posologia: `1 dose VO - Pela manha\n2 doses VO - Antes do jantar FIM${id}`,
      };
    });
    const bytes = await generateReceituarioPdfV2({
      medicoName: "Medico Teste", medicoCrm: "000000", clinicaNome: "Clinica Teste",
      pacienteNome: "Paciente Sintetico", formulas, assinaturaDigitalEstado: "sem_certificado_vencido",
    });
    const pgs = paginas(bytes);
    expect(pgs.length).toBeGreaterThanOrEqual(2);
    expect(assertSemCorte(pgs, 14)).toBeGreaterThanOrEqual(2);
  });

  it("Receita por fornecedor: itens inteiros", async () => {
    const items = Array.from({ length: 16 }, (_, k) => {
      const id = String(k + 1).padStart(2, "0");
      return {
        name: `Item INICIO${id}`,
        ativos: Array.from({ length: 2 + (k % 7) }, (_, j) => `Ativo ${j + 1} ${5 + j}mg`).join("\n"),
        posologia: `1 dose VO - Pela manha FIM${id}`,
      };
    });
    const bytes = await generateRecipePdf(
      { recipeType: "manipulacao", pharmacyId: null, anvisaType: null, anvisaColor: null,
        anvisaColorName: null, internalColor: null, needsSncr: false, title: "Teste", items },
      { clientName: "Paciente Sintetico", dateBR: "06/11/2026" },
    );
    const pgs = paginas(bytes);
    expect(pgs.length).toBeGreaterThanOrEqual(2);
    assertSemCorte(pgs, 16);
  });

  it("Pedido de exames: itens inteiros (nome + preparo)", async () => {
    const items = Array.from({ length: 40 }, (_, k) => {
      const id = String(k + 1).padStart(2, "0");
      return {
        nomeExame: `Exame INICIO${id}`,
        preparo: `Jejum de 8 horas. ${"Evitar exercicio fisico antes da coleta. ".repeat(k % 4)}FIM${id}`,
      };
    });
    const bytes = await generateExamRequestPdf({
      tipo: "laboratorial", tipoLabel: "Laboratorial", clientName: "Paciente Sintetico",
      dateBR: "06/11/2026", items,
    } as never);
    const pgs = paginas(bytes);
    expect(pgs.length).toBeGreaterThanOrEqual(2);
    assertSemCorte(pgs, 40);
  });
});
