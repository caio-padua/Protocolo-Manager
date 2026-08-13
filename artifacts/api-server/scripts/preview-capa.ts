/**
 * Pré-visualização SEGURA da capa da Carta de Tratamento.
 *
 * Existe porque a rota GET /api/protocols/:id/document-pdf tem efeitos colaterais
 * reais: sobe o arquivo no Google Drive e ENVIA E-MAIL AO PACIENTE. Usá-la para
 * conferir aparência manda mensagem de verdade para uma pessoa de verdade.
 *
 * Este script monta o layout com dados fictícios e escreve o PDF em disco.
 * Não envia e-mail, não sobe no Drive, não toca no banco.
 *
 * Uso:  npx tsx scripts/preview-capa.ts /tmp/capa.pdf
 */
import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
import { buildProtocolDocumentLayout } from "../src/lib/pdf-signer.js";

const out = process.argv[2] ?? "/tmp/capa-preview.pdf";

const dados = {
  protocolId: 31,
  protocolTitle: "LONGEVIDADE + HORMONAL + METABOLISMO",
  clientName: "CARLUCIA SANTOS FERNANDES",
  clientCpf: "024862801",
  clientEmail: "exemplo@exemplo.com",
  professionalName: "Dr. Caio Henrique Fernandes Pádua",
  professionalCrm: "CRM SP 125.475",
  unit: "Tatuapé",
  serviceType: "Protocolo injetável",
  startDate: "2026-08-12",
  totalValue: 3385.28,
  substances: [
    {
      name: "COENZIMA Q10",
      dose: "100 MG",
      color: "yellow",
      totalSessions: 8,
      intervalDays: 7,
      startDate: "2026-08-12",
      procedureType: "im",
      categoryType: "SIMPLES",
      category: "ORTOMOLECULAR",
      unitPrice: 10.7,
      posologia: "100 MG / 2 ML",
    },
  ],
  sessions: [],
  payments: [],
};

const pdfDoc = await PDFDocument.create();
// certData = null → não usa certificado, não assina: é só pré-visualização.
await buildProtocolDocumentLayout(pdfDoc, dados as never, null);
fs.writeFileSync(out, Buffer.from(await pdfDoc.save()));
console.log(`OK ${out} (${fs.statSync(out).size} bytes)`);
