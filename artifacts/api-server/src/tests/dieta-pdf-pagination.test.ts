import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { gerarDietaPdf, type DietaPdfInput } from "../lib/dieta-pdf";

const { createMessage } = vi.hoisted(() => ({ createMessage: vi.fn() }));
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create: createMessage } },
}));

const input: DietaPdfInput = {
  nomePaciente: "Paciente Ficticio",
  sexo: "F",
  objetivo: "Manutencao",
  pesoKg: 70,
  alturaCm: 170,
  idade: 40,
  nivelAtividade: "moderado",
  caloriasAlvo: 2000,
  tmb: 1400,
  tdee: 2000,
  medico: { nome: "Profissional Ficticio", crm: "000000", especialidade: "Nutricao" },
};

// Only the AI response is mocked. Rendering, serialization and text extraction
// use the real libraries, without database access, email or external API calls.
function planoFixture(supplementCount: number) {
  return {
    estrategiaTexto: "Plano sintetico para verificar paginacao.",
    apresentacaoInstitucional: "Documento de teste.",
    instrucoesPrincipais: ["Seguir orientacao profissional."],
    notaClinica: "Dados inteiramente ficticios.",
    metas: {
      proteinaFaixa: "140 g", carboidratoFaixa: "200 g",
      gorduraFaixa: "70 g", fibraFaixa: "30 g",
    },
    regrasHipertrofia: ["Manter regularidade."],
    guiaTreino: [{ situacao: "Manha", conduta: "Hidratar." }],
    refeicoes: [{
      id: "almoco", nome: "Almoco", horario: "12:00",
      subtitulo: "Refeicao principal", faixaKcal: "600 kcal",
      proteinaFaixa: "40 g", funcaoClinica: "Nutricao", opcoes: [],
    }],
    suplementos: Array.from({ length: supplementCount }, (_, i) => ({
      nome: `Suplemento ${i + 1}`, dose: "1 g",
      comoUsar: "Com agua", seguranca: "Sob orientacao",
    })),
    guiaEscolhas: {
      priorizar: Array.from({ length: 7 }, (_, i) => `Escolha ${i + 1}`),
      evitar: Array.from({ length: 7 }, (_, i) => `Evitar ${i + 1}`),
    },
    criteriosReavaliacao: ["Reavaliar em oito semanas."],
  };
}

async function generateAndRead(supplementCount: number) {
  createMessage.mockReset();
  createMessage.mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(planoFixture(supplementCount)) }],
  });
  const result = await gerarDietaPdf(input);
  const pdf = await PDFDocument.load(result.pdfBytes);
  // Copy the bytes: PDF.js may transfer ownership of its input buffer.
  const parser = new PDFParse({ data: new Uint8Array(result.pdfBytes) });
  try {
    const text = await parser.getText();
    expect(text.pages).toHaveLength(pdf.getPageCount());
    expect(createMessage).toHaveBeenCalledOnce();
    return {
      pageCount: pdf.getPageCount(),
      pages: text.pages.map((page) => page.text),
    };
  } finally {
    await parser.destroy();
  }
}

function pagination(text: string) {
  // drawPageHeader writes the page number in the FOOTER, not the top banner.
  const match = text.match(/Pag\.\s*(\d+)\s+de\s+(\d+)/);
  expect(match, "Cada pagina deve declarar seu numero e total").not.toBeNull();
  return { number: Number(match![1]), total: Number(match![2]) };
}

describe("dieta PDF — pagina extra de assinatura", () => {
  it("mantem assinatura na suplementacao quando ha espaco e declara o total real", async () => {
    const { pageCount, pages } = await generateAndRead(1);
    expect(pageCount).toBe(4); // capa + estrategia + refeicao + suplementacao
    pages.forEach((text, index) => {
      expect(pagination(text)).toEqual({ number: index + 1, total: pageCount });
    });
    expect(pages[3]).toContain("SUPLEMENTAÇÃO ESTRUTURADA");
    expect(pages[3]).toContain("Assinatura do Profissional Responsavel");
    expect(pages[3]).toContain(input.medico!.nome);
  });

  it("cria pagina exclusiva com assinatura e numero valido, expondo o total antigo nas anteriores", async () => {
    // Sixteen short rows plus seven choices leave y < MB + 80, naturally
    // triggering overflow without mocking coordinates or private functions.
    const { pageCount, pages } = await generateAndRead(16);
    expect(pageCount).toBe(5);
    const last = pages[pageCount - 1];
    expect(pages[3]).toContain("SUPLEMENTAÇÃO ESTRUTURADA");
    expect(pages[3]).toContain("Suplemento 16");
    expect(pages[3]).not.toContain("Assinatura do Profissional Responsavel");
    expect(last).not.toContain("SUPLEMENTAÇÃO ESTRUTURADA");
    expect(last).toContain("Plano Nutricional Personalizado");
    expect(last).toContain(input.nomePaciente);
    expect(last).toContain("Assinatura do Profissional Responsavel");
    expect(last).toContain(input.medico!.nome);
    expect(last).toContain("CRM 000000");

    const declared = pages.map(pagination);
    declared.forEach(({ number, total }, index) => {
      expect(number).toBe(index + 1);
      expect(number).toBeGreaterThan(0);
      expect(number).toBeLessThanOrEqual(total);
    });
    expect(declared.at(-1)).toEqual({ number: pageCount, total: pageCount });

    // Characterization of the known discrepancy, NOT approval of this layout:
    // earlier footers were drawn before the extra page existed. A pagination
    // fix should update this assertion to require pageCount on EVERY page.
    expect(declared.map(({ total }) => total)).toEqual([4, 4, 4, 4, 5]);
  });
});
