import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/** Aplicada antes da assinatura, inclusive em páginas adicionais. */
export async function marcarDemonstracao(doc: PDFDocument): Promise<void> {
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const message = "HOMOLOGAÇÃO — DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA";
    const size = 11;
    const x = (width - font.widthOfTextAtSize(message, size)) / 2;
    page.drawRectangle({
      x: 25, y: 4, width: width - 50, height: 20,
      color: rgb(1, 0.96, 0.96), borderColor: rgb(0.66, 0.08, 0.08), borderWidth: 0.8,
    });
    page.drawText(message, { x, y: 10, font, size, color: rgb(0.66, 0.08, 0.08) });
  }
}
