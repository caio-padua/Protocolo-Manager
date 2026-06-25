import { PDFParse } from "pdf-parse";

export interface PdfTextResult {
  text: string;
  charCount: number;
  pageCount: number;
  enough: boolean;
}

const MIN_CHARS_FOR_DIGITAL = 200;

/**
 * Compacta o texto do laudo removendo linhas idênticas repetidas (cabeçalhos e
 * rodapés que se repetem em todas as páginas) preservando a PRIMEIRA ocorrência.
 * Reduz drasticamente o tamanho enviado à IA (menos custo e menos latência) sem
 * perder analitos: uma linha de analito só é descartada se for byte-a-byte igual
 * a outra já vista, o que significa o MESMO dado impresso duas vezes.
 */
export function compactExamText(text: string): { text: string; charCount: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  const joined = out.join("\n");
  return { text: joined, charCount: joined.replace(/\s/g, "").length };
}

/** Assinaturas de laboratórios brasileiros por rodapé/URL de validação. */
const LAB_SIGNATURES: Array<[RegExp, string]> = [
  [/valida\.dasa|\bdasa\b/i, "DASA"],
  [/fleury/i, "Fleury"],
  [/hermes\s*pardini|hermespardini/i, "Hermes Pardini"],
  [/delboni|db\s*diagn/i, "Delboni Auriemo"],
  [/alta\s*diagn|altadiagnosticos/i, "Alta Diagnósticos"],
  [/lavoisier/i, "Lavoisier"],
  [/\bsabin\b/i, "Sabin"],
  [/\bunimed\b/i, "Unimed"],
];

/** Infere o laboratório pelo texto bruto quando a IA não o identifica. */
export function inferLabName(rawText: string): string | null {
  for (const [re, name] of LAB_SIGNATURES) {
    if (re.test(rawText)) return name;
  }
  return null;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text ?? "";
    const charCount = text.replace(/\s/g, "").length;
    return {
      text,
      charCount,
      pageCount: result.total ?? result.pages?.length ?? 0,
      enough: charCount >= MIN_CHARS_FOR_DIGITAL,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
