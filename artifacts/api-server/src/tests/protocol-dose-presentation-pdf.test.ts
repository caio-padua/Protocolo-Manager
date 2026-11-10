import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { buildProtocolDocumentLayout } from "../lib/pdf-signer";
import { gerarRasFapPdf, type DadosRasFap } from "../lib/ras-fap";
import { soMiligramas } from "../lib/messaging/substance-table";

async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy?.();
  }
}

describe("dose apresentada em documentos clínicos", () => {
  it("PDF do protocolo mostra dose prescrita e omite concentração e apresentação", async () => {
    const pdf = await PDFDocument.create();
    const data = {
      protocolId: 99001,
      protocolTitle: "Protocolo sintético de teste",
      clientName: "CLIENTE TESTE",
      clientCpf: "000.000.000-00",
      clientEmail: "teste@example.invalid",
      professionalName: "Profissional de teste",
      professionalCrm: "CRM/SP 000000",
      unit: "Clínica de teste",
      serviceType: "clinic",
      startDate: "2026-11-10",
      totalValue: 0,
      substances: [{
        name: "LIDOCAINA 1%",
        dose: "100 MG / 2 ML",
        color: "blue",
        procedureType: "im",
        totalSessions: 1,
        intervalDays: 7,
        startDate: "2026-11-10",
        unitPrice: 10,
        concentrationMg: "400 mg/mL",
        volumeAmpola: "2 mL",
        composicao: "Composição sintética: 400 mg/mL",
        posologia: "Aplicar 2 mL; 1 ampola",
        description: "Descrição de teste sem apresentação proibida",
      }],
      sessions: [],
      payments: [],
    } as Parameters<typeof buildProtocolDocumentLayout>[1];

    await buildProtocolDocumentLayout(pdf, data);
    const text = (await textoDoPdf(await pdf.save())).toLowerCase().replace(/\s+/g, " ");

    expect(text).toContain("100 mg");
    expect(text).toContain("lidocaina");
    expect(text).not.toContain("1%");
    expect(text).not.toContain("2 ml");
    expect(text).not.toContain("400 mg/ml");
    expect(text).not.toContain("ampola");
    expect(text).not.toContain("concentração");
  });

  it("RAS FAP impresso mostra a dose sem volume, teor percentual ou ampolas", async () => {
    const data = {
      nome: "CLIENTE TESTE",
      medicoResponsavel: "Profissional de teste",
      enfermeira: "Equipe de teste",
      unidade: "Clínica de teste",
      dataAtendimento: new Date(2026, 10, 10, 12),
      protocoloNumero: "TESTE-99001",
      substancias: [{
        nome: "LIDOCAINA 1%",
        dose: "100 MG / 2 ML",
        sessoes: 1,
        frequenciaDias: 7,
        inicio: new Date(2026, 10, 10, 12),
        via: "IM",
      }],
    } as DadosRasFap;
    const pdf = await gerarRasFapPdf(data, "PREMIUM");
    const text = (await textoDoPdf(pdf)).toLowerCase().replace(/\s+/g, " ");

    expect(text).toContain("100 mg");
    expect(text).toContain("lidocaina");
    expect(text).not.toContain("1%");
    expect(text).not.toContain("2 ml");
    expect(text).not.toContain("ampola");
  });

  it("e-mails que reutilizam a tabela de substâncias também exibem só a dose", () => {
    expect(soMiligramas("100 MG / 2 ML")).toBe("100 mg");
    expect(soMiligramas("20mcg/mL")).toBe("");
    expect(soMiligramas("1 ampola")).toBe("");
  });
});
