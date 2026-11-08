import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";
import jsQR from "jsqr";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { generateExamRequestPdf } from "../lib/exam-request-pdf";
import { generateReceituarioPdfV2 } from "../lib/receituario-pdf";
import { buildPrescricaoHtml } from "../lib/receituario-html";
import { htmlToPdfBytes } from "../lib/puppeteer-capture";
import { signExistingPrescriptionPdf, validatePrescriptionCertificate } from "../lib/prescription-signing";

const identity = {
  professional: { id: 1, name: "MEDICO SINTETICO", cpf: "12345678901", crm: "12345", uf: "SP" },
  client: { id: 2, name: "CLIENTE SINTETICO", cpf: "00000000000", email: null, phone: null, birthDate: null },
  clinic: { id: 3, name: "CLINICA SINTETICA", empresaId: 4 }, canPrescribe: true, issue: null,
};
function syntheticSigner() {
  const pair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = pair.publicKey;
  cert.serialNumber = "A2E469E69691CF631A3E";
  cert.validity.notBefore = new Date("2020-01-01");
  cert.validity.notAfter = new Date("2040-01-01");
  cert.setSubject([{ name: "commonName", value: "MEDICO SINTETICO:12345678901" }]);
  cert.setIssuer(cert.subject.attributes);
  cert.setExtensions([{ name: "basicConstraints", cA: false }, { name: "keyUsage", digitalSignature: true }]);
  cert.sign(pair.privateKey, forge.md.sha256.create());
  const password = "synthetic-test-only";
  const bytes = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(pair.privateKey, [cert], password, { algorithm: "3des" })).getBytes(), "binary");
  return validatePrescriptionCertificate(bytes, password, identity);
}

async function qrFromPng(png: Buffer): Promise<string | undefined> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  // Ignora o QR do rodapé e verifica apenas a região esquerda do novo quadro.
  const left = Math.floor(image.width * 0.09);
  const width = Math.floor(image.width * 0.14);
  const pixels = ctx.getImageData(left, 0, width, image.height);
  return jsQR(pixels.data, width, image.height)?.data;
}

async function verifyPdf(bytes: Uint8Array, label: string) {
  const dir = mkdtempSync(join(tmpdir(), "modelo-3a1c-"));
  const file = join(dir, `${label}.pdf`);
  writeFileSync(file, bytes);
  const validation = execFileSync("pdfsig", [file], { encoding: "utf8" });
  expect(validation).toContain("Signature is Valid");
  const pdf = await PDFDocument.load(bytes);
  const count = pdf.getPageCount();
  let qrFound = false;
  for (let n = 1; n <= count; n++) {
    const page = execFileSync("pdftoppm", ["-f", String(n), "-l", String(n), "-r", "200", "-png", file], { maxBuffer: 20_000_000 });
    if (await qrFromPng(page) === "https://validar.iti.gov.br/") qrFound = true;
  }
  expect(qrFound).toBe(true);
  return { file, count, text: execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }) };
}

describe("Modelo 3A-1C", () => {
  it("assina as provas 2B dos dois motores depois de paginar e carimbar", async () => {
    const signer = syntheticSigner();
    const prescription = await generateReceituarioPdfV2({
      modelo2bProva: true, homologacao: true,
      medicoName: identity.professional.name, medicoCrm: "12345 / SP", clinicaNome: identity.clinic.name,
      pacienteNome: identity.client.name, dataEmissao: "2026-11-07", tipoReceita: "simples",
      formulas: Array.from({ length: 20 }, (_, i) => ({
        nome: `FORMULA FICTICIA ${String(i + 1).padStart(2, "0")}`, posologia: "TESTE — NÃO DISPENSAR",
      })),
    }, signer);
    const recipeProof = await verifyPdf(prescription, "receita-2b-prova");
    expect(recipeProof.count).toBeGreaterThan(1);
    expect(recipeProof.text).toContain("FORMULA FICTICIA 20");
    expect(recipeProof.text).toContain("DOCUMENTO DE TESTE");

    const unsignedExam = await generateExamRequestPdf({
      modelo2bProva: true, homologacao: true, tipo: "sangue", tipoLabel: "SANGUE",
      clientName: identity.client.name, professionalName: identity.professional.name,
      professionalCrm: "12345 / SP", dateBR: "07/11/2026", certificado: signer.meta,
      items: Array.from({ length: 30 }, (_, i) => ({ nomeExame: `EXAME FICTICIO ${String(i + 1).padStart(2, "0")}` })),
    });
    const examProof = await verifyPdf(await signExistingPrescriptionPdf(unsignedExam, signer), "exames-2b-prova");
    expect(examProof.count).toBeGreaterThan(1);
    expect(examProof.text).toContain("EXAME FICTICIO 30");
    expect(examProof.text).toContain("DOCUMENTO DE TESTE");
  }, 90_000);

  it("gera receita e exames com certificado sintético válido e QR legível", async () => {
    const signer = syntheticSigner();
    const prescription = await generateReceituarioPdfV2({
      medicoName: identity.professional.name, medicoCrm: "12345 / SP", clinicaNome: identity.clinic.name,
      pacienteNome: identity.client.name, dataEmissao: "2026-11-07",
      tipoReceita: "simples",
      formulas: [{ nome: "HOMOLOGAÇÃO SEM VALIDADE CLÍNICA", posologia: "TESTE — NÃO DISPENSAR" }],
    }, signer);
    const p = await verifyPdf(prescription, "prescricao");
    expect(p.text).toContain("ASSINADO DIGITALMENTE");
    expect(p.text).toContain("A2E469E69691CF631A3E");
    expect(p.text).toContain("12345 / SP");
    const unsignedExam = await generateExamRequestPdf({
      tipo: "outros", tipoLabel: "HOMOLOGAÇÃO — SEM VALIDADE CLÍNICA",
      clientName: identity.client.name, professionalName: identity.professional.name,
      professionalCrm: "12345 / SP", dateBR: "07/11/2026",
      items: [{ nomeExame: "EXAME SINTÉTICO — NÃO REALIZAR" }], certificado: signer.meta,
    });
    const e = await verifyPdf(await signExistingPrescriptionPdf(unsignedExam, signer), "exames");
    expect(e.text).toContain("ASSINADO DIGITALMENTE");
    expect(e.text).toContain("A2E469E69691CF631A3E");
  }, 60_000);

  it("mostra explicitamente a exceção sem assinatura e não cria QR de validação", async () => {
    const prescription = await generateReceituarioPdfV2({
      medicoName: identity.professional.name, medicoCrm: "12345 / SP", clinicaNome: identity.clinic.name,
      pacienteNome: identity.client.name, dataEmissao: "2026-11-07",
      formulas: [{ nome: "HOMOLOGAÇÃO SEM VALIDADE CLÍNICA", posologia: "TESTE" }],
      assinaturaDigitalEstado: "sem_certificado_vencido", certificadoValidoAte: "2020-01-01",
    });
    const dir = mkdtempSync(join(tmpdir(), "modelo-3a1c-sem-"));
    const file = join(dir, "sem-assinatura.pdf");
    writeFileSync(file, prescription);
    const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
    expect(text).toContain("GERADA SEM ASSINATURA DIGITAL");
    expect(text).not.toContain("ASSINADO DIGITALMENTE");
    const image = execFileSync("pdftoppm", ["-png", "-r", "200", file], { maxBuffer: 20_000_000 });
    expect(await qrFromPng(image)).toBeUndefined();
  }, 60_000);

  it("aplica o quadro ao modelo renderizado no navegador", async () => {
    const signer = syntheticSigner();
    const html = buildPrescricaoHtml({
      medicoNome: identity.professional.name, medicoCrm: "12345 / SP", clinicaNome: identity.clinic.name,
      clinicaEndereco: "ENDEREÇO SINTÉTICO", pacienteNome: identity.client.name, pacienteCpf: "00000000000",
      formulas: [{ numero: 1, nome: "HOMOLOGAÇÃO SEM VALIDADE CLÍNICA", ativos: "NÃO DISPENSAR", posologia: "TESTE" }],
      tipoReceita: "simples", dataEmissao: "2026-11-07", assetsBaseUrl: "", certMeta: signer.meta,
    });
    expect(html).not.toContain("00.000.000/0001-00");
    const pdf = await signExistingPrescriptionPdf(await htmlToPdfBytes(html), signer);
    await verifyPdf(pdf, "faixas");
  }, 90_000);

  it("não comprime nem separa fórmulas no modelo com faixas longo", async () => {
    const signer = syntheticSigner();
    const formulas = Array.from({ length: 12 }, (_, i) => ({
      numero: i + 1, nome: `FORMULATEST${String(i + 1).padStart(2, "0")}`,
      ativos: "ELEMENTO A\nELEMENTO B\nELEMENTO C\nELEMENTO D\nELEMENTO E",
      posologia: `FINALFORMULA${String(i + 1).padStart(2, "0")}`,
    }));
    const html = buildPrescricaoHtml({
      medicoNome: identity.professional.name, medicoCrm: "12345 / SP", clinicaNome: identity.clinic.name,
      clinicaEndereco: "ENDEREÇO SINTÉTICO", pacienteNome: identity.client.name, pacienteCpf: "00000000000",
      formulas, tipoReceita: "simples", dataEmissao: "2026-11-07", assetsBaseUrl: "", certMeta: signer.meta,
    });
    const signed = await signExistingPrescriptionPdf(await htmlToPdfBytes(html), signer);
    const result = await verifyPdf(signed, "faixas-longo");
    expect(result.count).toBeGreaterThan(1);
    const pageTexts = Array.from({ length: result.count }, (_, i) =>
      execFileSync("pdftotext", ["-f", String(i + 1), "-l", String(i + 1), result.file, "-"], { encoding: "utf8" }));
    for (let i = 1; i <= 12; i++) {
      const id = String(i).padStart(2, "0");
      const page = pageTexts.find(t => t.includes(`FORMULATEST${id}`));
      expect(page).toContain(`FINALFORMULA${id}`);
    }
  }, 90_000);
});
