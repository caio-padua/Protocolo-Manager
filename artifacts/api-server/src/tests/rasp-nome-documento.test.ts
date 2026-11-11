import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { PDFDocument } from "pdf-lib";
import forge from "node-forge";
import { gerarRasFapPdf, type DadosRasFap, type ModoRasFap } from "../lib/ras-fap";
import { generateSignedRASPdf } from "../lib/pdf-signer";
import { runWithDoctorCertificate } from "../lib/cert-source";

const inicio = new Date(2026, 10, 10, 12);
const dados: DadosRasFap = {
  nome: "CLIENTE SINTETICO",
  medicoResponsavel: "MEDICO TESTE",
  enfermeira: "ENFERMAGEM TESTE",
  unidade: "CLINICA TESTE",
  dataAtendimento: inicio,
  protocoloNumero: "TESTE-1",
  substancias: [{
    nome: "SUBSTANCIA TESTE",
    dose: "100 MG / 2 ML",
    sessoes: 1,
    frequenciaDias: 7,
    inicio,
    via: "IM",
  }],
};

describe("RASP FAP: nome e dose nos documentos novos", () => {
  for (const modo of ["PREMIUM", "SIMPLES", "MARCA", "MINIMAL", "BRONZE"] as ModoRasFap[]) {
    it(`mantém o novo nome e a dose prescrita no modo ${modo}`, async () => {
      const pdf = await gerarRasFapPdf(dados, modo);
      const parser = new PDFParse({ data: new Uint8Array(pdf) });
      try {
        const text = (await parser.getText()).text.replace(/\s+/g, " ");
        expect(text).toContain("RASP FAP");
        expect(text).toContain("Registro de Atendimentos, Substâncias e Procedimentos.");
        expect(text).not.toContain("RAS FAP");
        expect(text.toLowerCase()).toContain("100 mg");
        expect(text.toLowerCase()).not.toContain("2 ml");
      } finally {
        await parser.destroy();
      }
    });
  }

  it("gera o documento individual com o novo nome e certificado sintético", async () => {
    const pair = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = pair.publicKey;
    cert.serialNumber = "12345678";
    cert.validity.notBefore = new Date("2020-01-01");
    cert.validity.notAfter = new Date("2040-01-01");
    cert.setSubject([{ name: "commonName", value: "MEDICO SINTETICO" }]);
    cert.setIssuer(cert.subject.attributes);
    cert.sign(pair.privateKey, forge.md.sha256.create());
    const password = "synthetic-test-only";
    const buffer = Buffer.from(
      forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(pair.privateKey, [cert], password, { algorithm: "3des" })).getBytes(),
      "binary",
    );
    const { pdfBytes } = await runWithDoctorCertificate({ buffer, password }, () =>
      generateSignedRASPdf({
        id: 1, sessionId: 1, clientName: "CLIENTE SINTETICO", clientCpf: "000.000.000-00",
        professionalName: "MEDICO SINTETICO", professionalCrm: null, unit: "CLINICA SINTETICA",
        serviceDate: "2026-11-10", serviceType: "clinic", observations: null, substances: [],
      }),
    );
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getTitle()).toContain("RASP");
    const parser = new PDFParse({ data: pdfBytes });
    try {
      const text = (await parser.getText()).text.replace(/\s+/g, " ");
      expect(text).toContain("RASP N.");
      expect(text).toContain("REGISTRO DE ATENDIMENTOS,");
      expect(text).toContain("SUBSTÂNCIAS E PROCEDIMENTOS");
      expect(text).not.toContain("RAS N.");
    } finally {
      await parser.destroy();
    }
  });
});
