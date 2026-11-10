import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { gerarRasFapPdf, type DadosRasFap, type LinhaGrade } from "../lib/ras-fap";
import { prepararRubrica } from "../lib/client-rubrica-imagem";
import type { RegistroRasFap } from "../lib/ras-fap-rubrica";
import { comoPng, rabisco } from "./helpers/rubrica-sintetica";

// Rubrica do cliente em imagem — como o RAS FAP em PDF a desenha (dados 100% sintéticos, Código Paxter, Art. 82).
const RUBRICA = prepararRubrica(comoPng(rabisco(580, 170, { grossura: 3, margem: 0.05 }))).png;

const inicio = new Date(2026, 10, 10);
const grade: LinhaGrade[] = [1, 2, 3, 4, 5].map((n) => ({
  numero: n, data: new Date(2026, 10, 10 + 7 * (n - 1)), contadores: [`${n}/5`, n <= 3 ? `${n}/3` : null],
}));
const dados = (registros?: Map<number, RegistroRasFap>): DadosRasFap => ({
  nome: "CARLUCIA FERREIRA SOUZA", medicoResponsavel: "DR TESTE", enfermeira: "ENF TESTE", unidade: "UNIDADE TESTE",
  dataAtendimento: inicio, protocoloNumero: "9", gradePersistida: grade, registros,
  substancias: [
    { nome: "COENZIMA Q10", sessoes: 5, frequenciaDias: 7, inicio },
    { nome: "VITAMINA B12", sessoes: 3, frequenciaDias: 7, inicio },
  ],
});
const reg = (o: Partial<RegistroRasFap>): RegistroRasFap => ({
  dataEfetiva: "09/11/2026", hora: "22:30", enfermeira: "Carlos Mendes", clienteNome: "Carlúcia Ferreira Souza",
  confirmacaoCliente: null, aplicadas: [true, true], ...o,
});

async function texto(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try { return (await parser.getText()).text; } finally { await parser.destroy?.(); }
}
/** Imagens embutidas no PDF (cada PNG com transparência vira uma imagem + uma máscara). */
const imagensNoPdf = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;
/** O documento já tem imagens próprias (marcas); o que interessa é quantas a MAIS a rubrica traz. */
let _base: number | null = null;
async function imagensDaMarca(): Promise<number> {
  if (_base === null) _base = imagensNoPdf(await gerarRasFapPdf(dados(undefined)));
  return _base;
}

describe("Rubrica do cliente em imagem — RAS FAP em PDF", () => {
  it("T-RUB-15: a imagem entra no PDF UMA vez, mesmo desenhada em várias linhas (F71)", async () => {
    const uma = new Map([[1, reg({ confirmacaoCliente: "plena", rubricaPng: RUBRICA })]]);
    const quatro = new Map([1, 2, 3, 4].map((n) => [n, reg({ confirmacaoCliente: "plena", rubricaPng: RUBRICA })] as const));
    const pdfUma = await gerarRasFapPdf(dados(uma));
    const pdfQuatro = await gerarRasFapPdf(dados(quatro));
    const base = await imagensDaMarca();
    expect(imagensNoPdf(pdfUma)).toBeGreaterThan(base);
    expect(imagensNoPdf(pdfQuatro)).toBe(imagensNoPdf(pdfUma)); // 4 linhas, mesmas imagens embutidas
    expect(pdfQuatro.length - pdfUma.length).toBeLessThan(RUBRICA.length / 2); // e o arquivo não cresce uma imagem por linha
  });

  it("T-RUB-16: com imagem, ela substitui as iniciais; '(cadastro)' continua escrito; sem imagem, iniciais como antes (R17, F73)", async () => {
    const registros = new Map<number, RegistroRasFap>([
      [1, reg({ confirmacaoCliente: "plena", rubricaPng: RUBRICA })],
      [2, reg({ confirmacaoCliente: "cadastro", rubricaPng: RUBRICA })],
      [3, reg({ confirmacaoCliente: "plena", rubricaPng: null })],
      [4, reg({ confirmacaoCliente: "cadastro" })],
      [5, reg({ confirmacaoCliente: "aguardando", rubricaPng: RUBRICA })],
    ]);
    const pdf = await gerarRasFapPdf(dados(registros));
    const t = await texto(pdf);
    // visitas 3 e 4 não têm imagem: iniciais (a 4 com o sufixo); visitas 1 e 2 têm imagem: nenhuma inicial delas
    expect(t.match(/Souza, C\.F\./g)?.length).toBe(2);
    expect(t).toContain("Souza, C.F. (cadastro)");
    // a visita 2 (imagem + cadastro) mantém a palavra "(cadastro)" escrita: 2 ocorrências (visitas 2 e 4)
    expect(t.match(/\(cadastro\)/g)?.length).toBe(2);
    // AGUARDANDO não troca por imagem, mesmo que o cadastro tenha rubrica
    expect(t).toContain("AGUARDANDO");
    expect(imagensNoPdf(pdf)).toBeGreaterThan(await imagensDaMarca());
  });

  it("T-RUB-17: nas marcas que não mostram rubrica a imagem nunca é desenhada", async () => {
    for (const marca of ["aguardando", "nao_confirmada", null] as const) {
      const pdf = await gerarRasFapPdf(dados(new Map([[1, reg({ confirmacaoCliente: marca, rubricaPng: RUBRICA })]])));
      expect(imagensNoPdf(pdf), String(marca)).toBe(await imagensDaMarca());
    }
  });

  it("T-RUB-18: os 5 modos de impressão desenham a imagem", async () => {
    for (const modo of ["PREMIUM", "SIMPLES", "MARCA", "MINIMAL", "BRONZE"] as const) {
      const pdf = await gerarRasFapPdf(dados(new Map([[1, reg({ confirmacaoCliente: "plena", rubricaPng: RUBRICA })]])), modo);
      const semImagem = await gerarRasFapPdf(dados(new Map([[1, reg({ confirmacaoCliente: "plena" })]])), modo);
      expect(imagensNoPdf(pdf), modo).toBeGreaterThan(imagensNoPdf(semImagem));
    }
  });
});
