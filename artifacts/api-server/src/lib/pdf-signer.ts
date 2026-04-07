import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import forge from "node-forge";
import fs from "fs";
import path from "path";

const CERT_PATH = process.env.CERT_PATH || path.resolve(import.meta.dirname, "../certs/assinatura.pfx");
const CERT_PASSWORDS = ["Padua4321@", "123456"];

interface RASData {
  id: number;
  sessionId: number;
  clientName: string;
  clientCpf: string;
  professionalName: string;
  professionalCrm: string | null;
  unit: string;
  serviceDate: string;
  serviceType: string;
  observations: string | null;
  substances: Array<{
    substanceName: string;
    dose: string;
    route: string;
    sessionNumber: number;
    totalSessions: number;
    lot: string | null;
    validity: string | null;
    status: string;
  }>;
}

function loadCertificate(): { key: forge.pki.rsa.PrivateKey; cert: forge.pki.Certificate; ca: forge.pki.Certificate[] } {
  const pfxBuffer = fs.readFileSync(CERT_PATH);
  const pfxBinary = forge.util.binary.raw.encode(new Uint8Array(pfxBuffer));
  const pfxAsn1 = forge.asn1.fromDer(pfxBinary);

  let p12: forge.pkcs12.Pkcs12Pfx | null = null;

  for (const pw of CERT_PASSWORDS) {
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, pw);
      break;
    } catch {
      continue;
    }
  }

  if (!p12) throw new Error("Could not open PFX certificate with any known password");

  const keyBags = p12.getBags({ bagType: forge.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.oids.certBag });

  const keyBag = keyBags[forge.oids.pkcs8ShroudedKeyBag];
  const certBag = certBags[forge.oids.certBag];

  if (!keyBag || !keyBag.length || !keyBag[0].key) throw new Error("No private key found in PFX");
  if (!certBag || !certBag.length || !certBag[0].cert) throw new Error("No certificate found in PFX");

  const key = keyBag[0].key as forge.pki.rsa.PrivateKey;
  const cert = certBag[0].cert;

  const ca = certBag.slice(1).filter(b => b.cert).map(b => b.cert!);

  return { key, cert, ca };
}

function getCertInfo(): { subject: string; issuer: string; serial: string; validFrom: string; validTo: string; cpf: string | null } {
  const { cert } = loadCertificate();

  const subjectParts = cert.subject.attributes.map(a => `${a.shortName}=${a.value}`);
  const issuerParts = cert.issuer.attributes.map(a => `${a.shortName}=${a.value}`);

  let cpf: string | null = null;
  const cnAttr = cert.subject.getField("CN");
  if (cnAttr?.value) {
    const match = String(cnAttr.value).match(/\d{11}/);
    if (match) cpf = match[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  const sanExt = cert.getExtension("subjectAltName") as any;
  if (sanExt?.altNames) {
    for (const an of sanExt.altNames) {
      if (an.type === 0 && an.value) {
        try {
          const oid2160 = forge.asn1.fromDer(an.value);
          const cpfStr = forge.asn1.derToOid(oid2160.value as string);
          if (!cpf && cpfStr) cpf = cpfStr;
        } catch {}
      }
    }
  }

  return {
    subject: subjectParts.join(", "),
    issuer: issuerParts.join(", "),
    serial: cert.serialNumber,
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    cpf,
  };
}

export async function generateSignedRASPdf(ras: RASData): Promise<{ pdfBytes: Uint8Array; certInfo: ReturnType<typeof getCertInfo> }> {
  const certInfo = getCertInfo();
  const { key, cert } = loadCertificate();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`RAS ${String(ras.id).padStart(6, "0")} — ${ras.clientName}`);
  pdfDoc.setAuthor("PADCOM — Protocolos Injetáveis");
  pdfDoc.setSubject("Registro de Administração de Substâncias");
  pdfDoc.setCreator("Sistema PADCOM");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 9;
  const labelSize = 7;
  const titleSize = 14;
  const headerSize = 8;

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - 2 * margin;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.92, 0.92, 0.92);
  const darkBlue = rgb(0.11, 0.15, 0.24);
  const accentBlue = rgb(0.15, 0.35, 0.65);

  // === HEADER ===
  page.drawText("REGISTRO DE ADMINISTRAÇÃO DE SUBSTÂNCIAS", {
    x: margin,
    y,
    size: titleSize,
    font: fontBold,
    color: darkBlue,
  });
  y -= 16;
  page.drawText("Protocolo de Injetáveis — Medicina Estética", {
    x: margin,
    y,
    size: fontSize,
    font,
    color: gray,
  });

  const rasNumber = `RAS N.° ${String(ras.id).padStart(6, "0")}`;
  const rasNumWidth = fontBold.widthOfTextAtSize(rasNumber, 10);
  page.drawText(rasNumber, {
    x: pageWidth - margin - rasNumWidth,
    y: pageHeight - margin,
    size: 10,
    font: fontBold,
    color: darkBlue,
  });
  page.drawText(`Sessão ID: ${ras.sessionId}`, {
    x: pageWidth - margin - font.widthOfTextAtSize(`Sessão ID: ${ras.sessionId}`, headerSize),
    y: pageHeight - margin - 14,
    size: headerSize,
    font,
    color: gray,
  });

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1.5, color: darkBlue });
  y -= 25;

  // === HELPER FUNCTIONS ===
  function drawSectionTitle(title: string) {
    page.drawText(title.toUpperCase(), {
      x: margin,
      y,
      size: headerSize,
      font: fontBold,
      color: accentBlue,
    });
    y -= 4;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, thickness: 0.5, color: accentBlue, opacity: 0.3 });
    y -= 14;
  }

  function drawField(label: string, value: string, x: number, width: number) {
    page.drawText(label, { x, y: y + 10, size: labelSize, font, color: gray });
    page.drawText(value || "—", { x, y: y - 2, size: fontSize, font: fontBold, color: black });
  }

  // === DADOS DO CLIENTE ===
  drawSectionTitle("Dados do Cliente");

  const halfCol = contentWidth / 2 - 10;
  drawField("Nome Completo", ras.clientName, margin, halfCol);
  drawField("CPF", ras.clientCpf, margin + halfCol + 20, halfCol);
  y -= 30;

  const formattedDate = ras.serviceDate.split("-").reverse().join("/");
  drawField("Data do Atendimento", formattedDate, margin, halfCol);
  drawField("Tipo de Atendimento", ras.serviceType === "homecare" ? "Nurse Care Domiciliar" : "Clínica", margin + halfCol + 20, halfCol);
  y -= 35;

  // === DADOS DO PROFISSIONAL ===
  drawSectionTitle("Dados do Profissional");

  drawField("Profissional Responsável", ras.professionalName, margin, halfCol);
  drawField("CRM / COREN", ras.professionalCrm ?? "—", margin + halfCol + 20, halfCol / 2);
  y -= 30;

  drawField("Unidade", ras.unit, margin, contentWidth);
  y -= 35;

  // === TABELA DE SUBSTÂNCIAS ===
  drawSectionTitle("Substâncias Administradas");

  const colWidths = [140, 70, 55, 40, 60, 60, 70];
  const colHeaders = ["Substância", "Dose", "Sessão", "Via", "Lote", "Validade", "Status"];
  const tableX = margin;

  // Header row
  let cx = tableX;
  const rowH = 18;
  page.drawRectangle({ x: tableX, y: y - rowH + 4, width: contentWidth, height: rowH, color: lightGray });
  for (let i = 0; i < colHeaders.length; i++) {
    page.drawText(colHeaders[i], {
      x: cx + 4,
      y: y - 8,
      size: labelSize,
      font: fontBold,
      color: darkBlue,
    });
    cx += colWidths[i];
  }
  y -= rowH;

  // Data rows
  for (const sub of ras.substances) {
    cx = tableX;
    const values = [
      sub.substanceName,
      sub.dose,
      `${sub.sessionNumber}/${sub.totalSessions}`,
      sub.route,
      sub.lot ?? "—",
      sub.validity ?? "—",
      sub.status === "applied" ? "Aplicado" : sub.status === "missed" ? "Não Aplicado" : sub.status,
    ];
    for (let i = 0; i < values.length; i++) {
      const truncated = values[i].length > 18 ? values[i].slice(0, 16) + "…" : values[i];
      page.drawText(truncated, {
        x: cx + 4,
        y: y - 8,
        size: fontSize - 1,
        font,
        color: black,
      });
      cx += colWidths[i];
    }
    page.drawLine({ start: { x: tableX, y: y - rowH + 4 }, end: { x: tableX + contentWidth, y: y - rowH + 4 }, thickness: 0.3, color: lightGray });
    y -= rowH;
  }
  y -= 15;

  // === OBSERVAÇÕES ===
  if (ras.observations) {
    drawSectionTitle("Observações");
    page.drawText(ras.observations, {
      x: margin,
      y,
      size: fontSize,
      font,
      color: black,
      maxWidth: contentWidth,
    });
    y -= 30;
  }

  // === ASSINATURA DIGITAL ===
  y -= 20;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, thickness: 0.5, color: gray, opacity: 0.4 });
  y -= 25;

  drawSectionTitle("Assinatura Digital ICP-Brasil");

  page.drawRectangle({
    x: margin,
    y: y - 80,
    width: contentWidth,
    height: 90,
    borderColor: accentBlue,
    borderWidth: 1,
    color: rgb(0.95, 0.97, 1),
    opacity: 0.5,
    borderOpacity: 0.6,
  });

  const signY = y - 5;
  page.drawText("DOCUMENTO ASSINADO DIGITALMENTE", {
    x: margin + 10,
    y: signY,
    size: 8,
    font: fontBold,
    color: accentBlue,
  });

  const cnAttr = cert.subject.getField("CN");
  const signerName = cnAttr?.value ? String(cnAttr.value) : ras.professionalName;

  const signDetails = [
    `Assinante: ${signerName}`,
    `CPF: ${certInfo.cpf ?? "—"}`,
    `Emissor: ${cert.issuer.getField("CN")?.value ?? "ICP-Brasil"}`,
    `Serial: ${cert.serialNumber.toUpperCase().slice(0, 40)}`,
    `Válido: ${new Date(certInfo.validFrom).toLocaleDateString("pt-BR")} a ${new Date(certInfo.validTo).toLocaleDateString("pt-BR")}`,
    `Assinado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
  ];

  for (let i = 0; i < signDetails.length; i++) {
    page.drawText(signDetails[i], {
      x: margin + 10,
      y: signY - 14 - i * 11,
      size: 7.5,
      font,
      color: darkBlue,
    });
  }

  y -= 105;

  // Signature boxes
  const boxWidth = contentWidth / 3 - 15;
  const boxes = [
    { label: "Assinatura do Profissional", name: ras.professionalName, extra: ras.professionalCrm },
    { label: "Assinatura do Cliente", name: ras.clientName, extra: null },
    { label: "Data e Hora", name: formattedDate, extra: null },
  ];

  for (let i = 0; i < boxes.length; i++) {
    const bx = margin + i * (boxWidth + 15);
    page.drawLine({ start: { x: bx, y: y }, end: { x: bx + boxWidth, y: y }, thickness: 0.8, color: darkBlue });
    page.drawText(boxes[i].label, {
      x: bx + (boxWidth - font.widthOfTextAtSize(boxes[i].label, labelSize)) / 2,
      y: y - 12,
      size: labelSize,
      font,
      color: gray,
    });
    page.drawText(boxes[i].name, {
      x: bx + (boxWidth - fontBold.widthOfTextAtSize(boxes[i].name, fontSize - 1)) / 2,
      y: y - 23,
      size: fontSize - 1,
      font: fontBold,
      color: black,
    });
    if (boxes[i].extra) {
      page.drawText(boxes[i].extra!, {
        x: bx + (boxWidth - font.widthOfTextAtSize(boxes[i].extra!, labelSize)) / 2,
        y: y - 33,
        size: labelSize,
        font,
        color: gray,
      });
    }
  }

  // === FOOTER ===
  const footerText = `Documento gerado pelo sistema PADCOM — Protocolos Injetáveis · ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  page.drawText(footerText, {
    x: margin,
    y: margin - 20,
    size: 6.5,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  // === SIGN THE PDF ===
  const pdfBytes = await pdfDoc.save();

  // Create PKCS#7 detached signature
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(pdfBytes);
  p7.addCertificate(cert);

  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date(),
      },
    ],
  });

  p7.sign({ detached: false });

  const signatureDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const signatureB64 = forge.util.encode64(signatureDer);

  return {
    pdfBytes,
    certInfo: {
      ...certInfo,
      signatureB64,
      signerName,
    } as any,
  };
}

export { getCertInfo, loadCertificate };
