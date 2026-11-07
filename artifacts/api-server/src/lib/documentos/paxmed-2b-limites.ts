import { PDFDocument, StandardFonts } from "pdf-lib";

const mm = (value: number) => value * 72 / 25.4;

export type TextosEmpresa2b = {
  nomeCabecalho: string;
  rodapeLinha1: string;
  rodapeLinha2: string;
  rodapeLinha3: string;
};

// Medidas da área útil da prova A4. Cada texto é medido na fonte e tamanho
// escolhidos para o respectivo local; contar letras não mede largura.
export async function validarTextosEmpresa2b(data: TextosEmpresa2b): Promise<void> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const fields = [
    ["Nome do cabeçalho", data.nomeCabecalho, bold, 20, 54],
    ["Primeira linha do rodapé", data.rodapeLinha1, bold, 12.6, 66],
    ["Segunda linha do rodapé", data.rodapeLinha2, regular, 7.65, 66],
    ["Terceira linha do rodapé", data.rodapeLinha3, regular, 7.65, 66],
  ] as const;
  for (const [label, text, font, size, width] of fields) {
    if (!text || /[\r\n\t]/.test(text)) throw new Error(`${label}: preencha uma única linha.`);
    try {
      font.encodeText(text);
      if (font.widthOfTextAtSize(text, size) > mm(width)) {
        throw new Error(`${label}: o texto não cabe no espaço disponível. Reduza o texto.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(label)) throw error;
      throw new Error(`${label}: há caracteres que a fonte do documento não suporta.`);
    }
  }
}
