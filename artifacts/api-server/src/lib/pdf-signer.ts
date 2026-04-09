import { PDFDocument, rgb, StandardFonts, PDFPage } from "pdf-lib";
import forge from "node-forge";
import fs from "fs";
import path from "path";

const CERT_PATH = process.env.CERT_PATH || path.resolve(import.meta.dirname, "../certs/assinatura.pfx");
const CERT_PASSWORDS = ["Padua4321@", "123456"];

interface SubstanceInfo {
  substanceName: string;
  dose: string;
  route: string;
  sessionNumber: number;
  totalSessions: number;
  lot: string | null;
  validity: string | null;
  status: string;
  description?: string;
  mainFunction?: string;
  perceivedEffects?: string;
  timeToEffect?: string;
  starRating?: number;
  bodySystemEffects?: Record<string, string>;
  procedureType?: string;
}

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
  substances: SubstanceInfo[];
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

  return {
    subject: subjectParts.join(", "),
    issuer: issuerParts.join(", "),
    serial: cert.serialNumber,
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    cpf,
  };
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.92, 0.92, 0.92);
const DARK_BLUE = rgb(0.11, 0.15, 0.24);
const ACCENT_BLUE = rgb(0.15, 0.35, 0.65);
const GOLD = rgb(0.78, 0.6, 0.15);
const GREEN = rgb(0.05, 0.55, 0.25);
const LIGHT_BG = rgb(0.97, 0.98, 1);
const STAR_FILL = rgb(0.95, 0.75, 0.1);
const STAR_EMPTY = rgb(0.82, 0.82, 0.82);

interface Fonts {
  regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}

function drawPageFooter(page: PDFPage, fonts: Fonts, pageNum: number, totalPages: number) {
  const footerText = `PADCOM — Protocolos Injetáveis · Página ${pageNum} de ${totalPages} · ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  page.drawText(footerText, {
    x: MARGIN,
    y: MARGIN - 20,
    size: 6.5,
    font: fonts.regular,
    color: GRAY,
  });
}

function wrapText(text: string, font: Fonts["regular"], fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawStars(page: PDFPage, x: number, y: number, rating: number, maxStars: number = 5) {
  for (let i = 0; i < maxStars; i++) {
    const filled = i < rating;
    page.drawCircle({
      x: x + i * 14 + 4,
      y: y + 3,
      size: 5,
      color: filled ? STAR_FILL : STAR_EMPTY,
      borderWidth: 0,
    });
  }
}

export async function generateSignedRASPdf(ras: RASData): Promise<{ pdfBytes: Uint8Array; certInfo: any }> {
  const certInfo = getCertInfo();
  const { key, cert } = loadCertificate();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`RAS ${String(ras.id).padStart(6, "0")} — ${ras.clientName}`);
  pdfDoc.setAuthor("PADCOM — Protocolos Injetáveis");
  pdfDoc.setSubject("Registro de Administração de Substâncias");
  pdfDoc.setCreator("Sistema PADCOM");

  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  const allPages: PDFPage[] = [];

  // ============================================================
  // PAGE 1: RAS — REGISTRO DE ADMINISTRAÇÃO DE SUBSTÂNCIAS
  // ============================================================
  {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    allPages.push(page);
    let y = PAGE_H - MARGIN;

    page.drawText("REGISTRO DE ADMINISTRAÇÃO DE SUBSTÂNCIAS", {
      x: MARGIN, y, size: 14, font: fonts.bold, color: DARK_BLUE,
    });
    y -= 16;
    page.drawText("Protocolo de Injetáveis — Medicina Estética", {
      x: MARGIN, y, size: 9, font: fonts.regular, color: GRAY,
    });

    const rasNumber = `RAS N.° ${String(ras.id).padStart(6, "0")}`;
    const rasNumWidth = fonts.bold.widthOfTextAtSize(rasNumber, 10);
    page.drawText(rasNumber, {
      x: PAGE_W - MARGIN - rasNumWidth, y: PAGE_H - MARGIN, size: 10, font: fonts.bold, color: DARK_BLUE,
    });
    const sessText = `Sessão ID: ${ras.sessionId}`;
    page.drawText(sessText, {
      x: PAGE_W - MARGIN - fonts.regular.widthOfTextAtSize(sessText, 8), y: PAGE_H - MARGIN - 14, size: 8, font: fonts.regular, color: GRAY,
    });

    y -= 10;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: DARK_BLUE });
    y -= 25;

    function sectionTitle(title: string) {
      page.drawText(title.toUpperCase(), { x: MARGIN, y, size: 8, font: fonts.bold, color: ACCENT_BLUE });
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: ACCENT_BLUE, opacity: 0.3 });
      y -= 14;
    }

    function drawField(label: string, value: string, x: number) {
      page.drawText(label, { x, y: y + 10, size: 7, font: fonts.regular, color: GRAY });
      page.drawText(value || "—", { x, y: y - 2, size: 9, font: fonts.bold, color: BLACK });
    }

    const halfCol = CONTENT_W / 2 - 10;

    sectionTitle("Dados do Cliente");
    drawField("Nome Completo", ras.clientName, MARGIN);
    drawField("CPF", ras.clientCpf, MARGIN + halfCol + 20);
    y -= 30;

    const formattedDate = ras.serviceDate.split("-").reverse().join("/");
    drawField("Data do Atendimento", formattedDate, MARGIN);
    drawField("Tipo de Atendimento", ras.serviceType === "homecare" ? "Nurse Care Domiciliar" : "Clínica", MARGIN + halfCol + 20);
    y -= 35;

    sectionTitle("Dados do Profissional");
    drawField("Profissional Responsável", ras.professionalName, MARGIN);
    drawField("CRM / COREN", ras.professionalCrm ?? "—", MARGIN + halfCol + 20);
    y -= 30;
    drawField("Unidade", ras.unit, MARGIN);
    y -= 35;

    sectionTitle("Substâncias Administradas");

    const colWidths = [140, 70, 55, 40, 60, 60, 70];
    const colHeaders = ["Substância", "Dose", "Sessão", "Via", "Lote", "Validade", "Status"];
    const rowH = 18;

    let cx = MARGIN;
    page.drawRectangle({ x: MARGIN, y: y - rowH + 4, width: CONTENT_W, height: rowH, color: LIGHT_GRAY });
    for (let i = 0; i < colHeaders.length; i++) {
      page.drawText(colHeaders[i], { x: cx + 4, y: y - 8, size: 7, font: fonts.bold, color: DARK_BLUE });
      cx += colWidths[i];
    }
    y -= rowH;

    for (const sub of ras.substances) {
      cx = MARGIN;
      const route = sub.procedureType === "im" ? "IM" : sub.procedureType === "implant" ? "IMP" : "IV";
      const values = [
        sub.substanceName,
        sub.dose,
        `${sub.sessionNumber}/${sub.totalSessions}`,
        route,
        sub.lot ?? "—",
        sub.validity ?? "—",
        sub.status === "applied" ? "Aplicado" : sub.status === "missed" ? "Não Aplicado" : sub.status,
      ];
      for (let i = 0; i < values.length; i++) {
        const truncated = values[i].length > 18 ? values[i].slice(0, 16) + "…" : values[i];
        page.drawText(truncated, { x: cx + 4, y: y - 8, size: 8, font: fonts.regular, color: BLACK });
        cx += colWidths[i];
      }
      page.drawLine({ start: { x: MARGIN, y: y - rowH + 4 }, end: { x: MARGIN + CONTENT_W, y: y - rowH + 4 }, thickness: 0.3, color: LIGHT_GRAY });
      y -= rowH;
    }
    y -= 15;

    if (ras.observations) {
      sectionTitle("Observações");
      const obsLines = wrapText(ras.observations, fonts.regular, 9, CONTENT_W);
      for (const line of obsLines) {
        page.drawText(line, { x: MARGIN, y, size: 9, font: fonts.regular, color: BLACK });
        y -= 13;
      }
      y -= 10;
    }

    y -= 20;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: GRAY, opacity: 0.4 });
    y -= 25;

    sectionTitle("Assinatura Digital ICP-Brasil");

    page.drawRectangle({ x: MARGIN, y: y - 80, width: CONTENT_W, height: 90, borderColor: ACCENT_BLUE, borderWidth: 1, color: rgb(0.95, 0.97, 1), opacity: 0.5, borderOpacity: 0.6 });

    const signY = y - 5;
    page.drawText("DOCUMENTO ASSINADO DIGITALMENTE", { x: MARGIN + 10, y: signY, size: 8, font: fonts.bold, color: ACCENT_BLUE });

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
      page.drawText(signDetails[i], { x: MARGIN + 10, y: signY - 14 - i * 11, size: 7.5, font: fonts.regular, color: DARK_BLUE });
    }
    y -= 105;

    const boxWidth = CONTENT_W / 3 - 15;
    const boxes = [
      { label: "Assinatura do Profissional", name: ras.professionalName, extra: ras.professionalCrm },
      { label: "Assinatura do Cliente", name: ras.clientName, extra: null },
      { label: "Data e Hora", name: formattedDate, extra: null },
    ];

    for (let i = 0; i < boxes.length; i++) {
      const bx = MARGIN + i * (boxWidth + 15);
      page.drawLine({ start: { x: bx, y }, end: { x: bx + boxWidth, y }, thickness: 0.8, color: DARK_BLUE });
      page.drawText(boxes[i].label, { x: bx + (boxWidth - fonts.regular.widthOfTextAtSize(boxes[i].label, 7)) / 2, y: y - 12, size: 7, font: fonts.regular, color: GRAY });
      page.drawText(boxes[i].name, { x: bx + (boxWidth - fonts.bold.widthOfTextAtSize(boxes[i].name, 8)) / 2, y: y - 23, size: 8, font: fonts.bold, color: BLACK });
      if (boxes[i].extra) {
        page.drawText(boxes[i].extra!, { x: bx + (boxWidth - fonts.regular.widthOfTextAtSize(boxes[i].extra!, 7)) / 2, y: y - 33, size: 7, font: fonts.regular, color: GRAY });
      }
    }
  }

  // ============================================================
  // PAGES 2+: FICHAS DAS SUBSTÂNCIAS (TDAH-friendly)
  // ============================================================
  const substancesWithInfo = ras.substances.filter(s => s.description || s.mainFunction);

  for (let si = 0; si < substancesWithInfo.length; si++) {
    const sub = substancesWithInfo[si];
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    allPages.push(page);
    let y = PAGE_H - MARGIN;

    const pageLabel = `${si + 1}/${substancesWithInfo.length}`;
    page.drawText(`FICHA DA SUBSTÂNCIA — ${pageLabel}`, { x: MARGIN, y, size: 8, font: fonts.bold, color: ACCENT_BLUE });
    y -= 20;

    page.drawRectangle({ x: MARGIN, y: y - 35, width: CONTENT_W, height: 45, color: DARK_BLUE, borderColor: DARK_BLUE, borderWidth: 0 });
    page.drawText(sub.substanceName.toUpperCase(), { x: MARGIN + 15, y: y - 8, size: 18, font: fonts.bold, color: rgb(1, 1, 1) });

    const procLabel = sub.procedureType === "im" ? "INTRAMUSCULAR" : sub.procedureType === "implant" ? "IMPLANTE" : "ENDOVENOSO";
    page.drawText(procLabel, { x: MARGIN + 15, y: y - 27, size: 9, font: fonts.regular, color: rgb(0.7, 0.8, 1) });

    const doseLabel = `Dose: ${sub.dose} · Sessão ${sub.sessionNumber}/${sub.totalSessions}`;
    const dlw = fonts.regular.widthOfTextAtSize(doseLabel, 9);
    page.drawText(doseLabel, { x: PAGE_W - MARGIN - 15 - dlw, y: y - 18, size: 9, font: fonts.regular, color: rgb(0.7, 0.8, 1) });

    y -= 55;

    if (sub.description) {
      page.drawText("O QUE É", { x: MARGIN, y, size: 8, font: fonts.bold, color: ACCENT_BLUE });
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: ACCENT_BLUE, opacity: 0.3 });
      y -= 14;

      const descLines = wrapText(sub.description, fonts.regular, 9, CONTENT_W);
      for (const line of descLines) {
        page.drawText(line, { x: MARGIN, y, size: 9, font: fonts.regular, color: BLACK });
        y -= 13;
      }
      y -= 10;
    }

    if (sub.mainFunction) {
      page.drawText("FUNÇÃO PRINCIPAL", { x: MARGIN, y, size: 8, font: fonts.bold, color: ACCENT_BLUE });
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: ACCENT_BLUE, opacity: 0.3 });
      y -= 16;

      page.drawRectangle({ x: MARGIN, y: y - 15, width: CONTENT_W, height: 30, color: LIGHT_BG, borderColor: ACCENT_BLUE, borderWidth: 0.5, opacity: 0.8 });
      page.drawText(sub.mainFunction, { x: MARGIN + 10, y: y - 5, size: 10, font: fonts.bold, color: DARK_BLUE });

      if (sub.starRating !== undefined) {
        drawStars(page, PAGE_W - MARGIN - 80, y - 5, sub.starRating);
      }

      y -= 30;
    }

    if (sub.bodySystemEffects && typeof sub.bodySystemEffects === "object") {
      y -= 10;
      page.drawText("EFEITO POR SISTEMA DO CORPO", { x: MARGIN, y, size: 8, font: fonts.bold, color: ACCENT_BLUE });
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: ACCENT_BLUE, opacity: 0.3 });
      y -= 16;

      const systemColors: Record<string, typeof ACCENT_BLUE> = {
        "Pele": rgb(0.9, 0.55, 0.35),
        "Fígado": rgb(0.55, 0.35, 0.2),
        "Sistema Imunológico": rgb(0.2, 0.6, 0.35),
        "Neurológico": rgb(0.4, 0.3, 0.7),
        "Cardiovascular": rgb(0.8, 0.2, 0.2),
        "Muscular": rgb(0.2, 0.5, 0.6),
        "Endócrino": rgb(0.6, 0.5, 0.15),
        "Muscular/Esquelético": rgb(0.3, 0.5, 0.5),
      };

      const systems = Object.entries(sub.bodySystemEffects as Record<string, string>);
      const colW = CONTENT_W / 2 - 5;

      for (let row = 0; row < systems.length; row += 2) {
        for (let col = 0; col < 2 && row + col < systems.length; col++) {
          const [system, effect] = systems[row + col];
          const xPos = MARGIN + col * (colW + 10);

          page.drawRectangle({ x: xPos, y: y - 40, width: colW, height: 50, color: LIGHT_BG, borderColor: LIGHT_GRAY, borderWidth: 0.5 });

          const dotColor = systemColors[system] ?? ACCENT_BLUE;
          page.drawCircle({ x: xPos + 12, y: y - 2, size: 4, color: dotColor, borderWidth: 0 });
          page.drawText(system.toUpperCase(), { x: xPos + 22, y: y - 5, size: 7.5, font: fonts.bold, color: DARK_BLUE });

          const effectLines = wrapText(effect, fonts.regular, 7.5, colW - 20);
          for (let el = 0; el < Math.min(effectLines.length, 3); el++) {
            page.drawText(effectLines[el], { x: xPos + 10, y: y - 20 - el * 10, size: 7.5, font: fonts.regular, color: GRAY });
          }
        }
        y -= 55;
      }
    }

    if (sub.perceivedEffects) {
      y -= 5;
      page.drawText("EFEITOS PERCEBIDOS PELO CLIENTE", { x: MARGIN, y, size: 8, font: fonts.bold, color: GREEN });
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: GREEN, opacity: 0.3 });
      y -= 14;

      const effectLines = wrapText(sub.perceivedEffects, fonts.regular, 9, CONTENT_W);
      for (const line of effectLines) {
        page.drawText(`> ${line}`, { x: MARGIN, y, size: 9, font: fonts.regular, color: BLACK });
        y -= 13;
      }
      y -= 8;
    }

    if (sub.timeToEffect) {
      page.drawText("TEMPO PARA PERCEBER O EFEITO", { x: MARGIN, y, size: 8, font: fonts.bold, color: GOLD });
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: GOLD, opacity: 0.3 });
      y -= 14;

      const timeLines = wrapText(sub.timeToEffect, fonts.regular, 9, CONTENT_W);
      for (const line of timeLines) {
        page.drawText(`>> ${line}`, { x: MARGIN, y, size: 9, font: fonts.regular, color: BLACK });
        y -= 13;
      }
    }
  }

  // ============================================================
  // LAST PAGE(S): TERMO DE CONSENTIMENTO INFORMADO
  // ============================================================
  {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    allPages.push(page);
    let y = PAGE_H - MARGIN;

    page.drawText("TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO", {
      x: MARGIN, y, size: 13, font: fonts.bold, color: DARK_BLUE,
    });
    y -= 16;
    page.drawText("Procedimentos Injetáveis — Medicina Estética", {
      x: MARGIN, y, size: 9, font: fonts.regular, color: GRAY,
    });
    y -= 10;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: DARK_BLUE });
    y -= 20;

    const substNames = ras.substances.map(s => s.substanceName).join(", ");
    const formattedDate = ras.serviceDate.split("-").reverse().join("/");

    const consentSections = [
      {
        title: "1. IDENTIFICAÇÃO",
        text: `Eu, ${ras.clientName}, portador(a) do CPF ${ras.clientCpf}, declaro que fui devidamente informado(a) pelo(a) profissional ${ras.professionalName}${ras.professionalCrm ? ` (${ras.professionalCrm})` : ""} sobre os procedimentos a serem realizados na unidade ${ras.unit} em ${formattedDate}.`,
      },
      {
        title: "2. PROCEDIMENTO",
        text: `Autorizo a administração das seguintes substâncias: ${substNames}. Estou ciente de que os procedimentos injetáveis podem incluir aplicações por via endovenosa (IV), intramuscular (IM) e/ou subcutânea, conforme indicação clínica.`,
      },
      {
        title: "3. FINALIDADE TERAPÊUTICA",
        text: "Os procedimentos acima descritos têm por finalidade a suplementação de micronutrientes, modulação bioquímica, terapia antioxidante e/ou outra indicação clínica conforme avaliação profissional. Entendo que os resultados podem variar de pessoa para pessoa e dependem de fatores individuais como metabolismo, estilo de vida e adesão ao protocolo.",
      },
      {
        title: "4. RISCOS E EFEITOS ADVERSOS",
        text: "Fui informado(a) sobre possíveis efeitos adversos, incluindo mas não limitados a: dor e/ou hematoma no local da aplicação, reações alérgicas, rubor facial, cefaleia, náusea, hipotensão transitória e, em casos raros, reações anafiláticas. Declaro ter informado sobre alergias, medicamentos em uso, condições de saúde pré-existentes e gestação/amamentação.",
      },
      {
        title: "5. CONTRAINDICAÇÕES INFORMADAS",
        text: "Declaro ter sido questionado(a) e ter respondido com veracidade sobre: gestação ou suspeita de gravidez; amamentação; uso de anticoagulantes; doenças renais, hepáticas ou cardíacas; alergias conhecidas; uso de suplementos e fitoterápicos; e quaisquer condições que possam afetar a segurança do procedimento.",
      },
      {
        title: "6. CONSENTIMENTO PARA VITAMINA C ENDOVENOSA (quando aplicável)",
        text: "No caso de Vitamina C endovenosa em alta dose (acima de 10g), declaro ter ciência da necessidade de dosagem prévia de G6PD (glicose-6-fosfato desidrogenase). Fui informado(a) que a deficiência desta enzima pode causar anemia hemolítica. Confirmo que realizei ou me comprometo a realizar o exame antes da primeira sessão em dose elevada.",
      },
      {
        title: "7. NAD+ E TERAPIAS DE LONGEVIDADE (quando aplicável)",
        text: "No caso de infusão de NAD+ (Nicotinamida Adenina Dinucleotídeo), fui orientado(a) sobre a velocidade de infusão adequada, possível desconforto torácico, náusea ou cefaleia durante a aplicação, e a importância de comunicar imediatamente qualquer sintoma ao profissional responsável.",
      },
      {
        title: "8. LEI GERAL DE PROTEÇÃO DE DADOS (LGPD)",
        text: "Em conformidade com a Lei nº 13.709/2018 (LGPD), autorizo a coleta, armazenamento e processamento dos meus dados pessoais e dados sensíveis de saúde para fins exclusivos de: execução do protocolo terapêutico; emissão de documentos clínicos (RAS, receituários); acompanhamento da evolução clínica; comunicação sobre agendamentos e resultados. Tenho ciência do meu direito de solicitar a exclusão, correção ou portabilidade dos meus dados a qualquer momento.",
      },
      {
        title: "9. ARMAZENAMENTO DIGITAL",
        text: "Autorizo o armazenamento digital de todos os registros de atendimento, incluindo o presente termo, no sistema PADCOM e, quando aplicável, em ambiente de nuvem seguro (Google Drive), com compartilhamento exclusivo ao meu e-mail cadastrado, em modo somente leitura.",
      },
      {
        title: "10. DECLARAÇÃO FINAL",
        text: "Declaro ter lido e compreendido integralmente o presente termo. Tive a oportunidade de fazer perguntas e esclarecer todas as minhas dúvidas antes de assinar. Autorizo livremente a realização dos procedimentos descritos.",
      },
    ];

    for (const section of consentSections) {
      if (y < MARGIN + 80) {
        const newPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
        allPages.push(newPage);
        y = PAGE_H - MARGIN;
        page.drawText("TERMO DE CONSENTIMENTO (cont.)", { x: MARGIN, y: PAGE_H - MARGIN, size: 9, font: fonts.bold, color: ACCENT_BLUE });
        y -= 20;

        const p = allPages[allPages.length - 1];
        p.drawText(section.title, { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_BLUE });
        y -= 14;

        const lines = wrapText(section.text, fonts.regular, 8.5, CONTENT_W);
        for (const line of lines) {
          if (y < MARGIN + 40) {
            const np = pdfDoc.addPage([PAGE_W, PAGE_H]);
            allPages.push(np);
            y = PAGE_H - MARGIN;
          }
          p.drawText(line, { x: MARGIN, y, size: 8.5, font: fonts.regular, color: BLACK });
          y -= 12;
        }
        y -= 10;
        continue;
      }

      page.drawText(section.title, { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_BLUE });
      y -= 14;

      const lines = wrapText(section.text, fonts.regular, 8.5, CONTENT_W);
      for (const line of lines) {
        if (y < MARGIN + 40) break;
        page.drawText(line, { x: MARGIN, y, size: 8.5, font: fonts.regular, color: BLACK });
        y -= 12;
      }
      y -= 10;
    }

    if (y > MARGIN + 80) {
      y -= 20;
      const boxWidth = CONTENT_W / 2 - 15;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + boxWidth, y }, thickness: 0.8, color: DARK_BLUE });
      page.drawText("Assinatura do Cliente", { x: MARGIN + 10, y: y - 12, size: 7, font: fonts.regular, color: GRAY });
      page.drawText(ras.clientName, { x: MARGIN + 10, y: y - 23, size: 8, font: fonts.bold, color: BLACK });
      page.drawText(`CPF: ${ras.clientCpf}`, { x: MARGIN + 10, y: y - 33, size: 7, font: fonts.regular, color: GRAY });

      page.drawLine({ start: { x: MARGIN + boxWidth + 30, y }, end: { x: MARGIN + 2 * boxWidth + 30, y }, thickness: 0.8, color: DARK_BLUE });
      page.drawText("Data", { x: MARGIN + boxWidth + 40, y: y - 12, size: 7, font: fonts.regular, color: GRAY });
      page.drawText(formattedDate, { x: MARGIN + boxWidth + 40, y: y - 23, size: 8, font: fonts.bold, color: BLACK });
    }
  }

  // Add page numbers to all pages
  for (let i = 0; i < allPages.length; i++) {
    drawPageFooter(allPages[i], fonts, i + 1, allPages.length);
  }

  // === SIGN THE PDF ===
  const pdfBytes = await pdfDoc.save();

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(pdfBytes);
  p7.addCertificate(cert);

  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });

  p7.sign({ detached: false });

  const signatureDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const signatureB64 = forge.util.encode64(signatureDer);

  const cnAttrInfo = cert.subject.getField("CN");
  const signerName = cnAttrInfo?.value ? String(cnAttrInfo.value) : ras.professionalName;

  return {
    pdfBytes,
    certInfo: { ...certInfo, signatureB64, signerName },
  };
}

interface PhysicalRASSubstance {
  name: string;
  color: string;
  totalSessions: number;
  frequencyDays: number;
  startDate: string;
  procedureType?: string;
}

interface PhysicalRASSession {
  number: number;
  scheduledDate: string;
  effectiveDate?: string | null;
  nurseName?: string | null;
  substanceStatuses: Array<{
    substanceName: string;
    sessionNumber: number;
    totalSessions: number;
    status: string;
  }>;
}

interface PhysicalRASData {
  clientName: string;
  clientCpf: string;
  clientPhone?: string;
  clientAge?: number;
  clientHeight?: string;
  clientWeight?: string;
  professionalName: string;
  nurseName?: string;
  unit: string;
  startDate: string;
  substances: PhysicalRASSubstance[];
  sessions: PhysicalRASSession[];
  todayDate?: string;
}

const SUBSTANCE_COLORS: Record<string, ReturnType<typeof rgb>> = {
  yellow: rgb(1, 0.85, 0.3),
  orange: rgb(1, 0.6, 0.2),
  red: rgb(0.9, 0.25, 0.25),
  green: rgb(0.2, 0.7, 0.3),
  blue: rgb(0.3, 0.5, 0.9),
  purple: rgb(0.6, 0.3, 0.8),
  pink: rgb(0.9, 0.4, 0.6),
  teal: rgb(0.2, 0.6, 0.6),
  brown: rgb(0.6, 0.4, 0.2),
  gray: rgb(0.5, 0.5, 0.5),
};

function getSubstanceColor(color: string): ReturnType<typeof rgb> {
  return SUBSTANCE_COLORS[color.toLowerCase()] ?? rgb(0.8, 0.7, 0.2);
}

export async function generatePhysicalRASPdf(data: PhysicalRASData): Promise<Uint8Array> {
  const PAGE_W_L = 841.89;
  const PAGE_H_L = 595.28;
  const M = 30;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`RAS Fisico — ${data.clientName}`);
  pdfDoc.setAuthor("PADCOM — Protocolos Injetaveis");

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const substCount = data.substances.length;
  const maxSessions = Math.max(data.sessions.length, 20);

  const fixedColWidths = {
    agendamento: 40,
    rubricaPaciente: 80,
    rubricaEnf: 40,
    dataPrevista: 60,
    dataEfetiva: 60,
  };
  const fixedTotal = fixedColWidths.agendamento + fixedColWidths.rubricaPaciente + fixedColWidths.rubricaEnf + fixedColWidths.dataPrevista + fixedColWidths.dataEfetiva;
  const availableForSubstances = PAGE_W_L - 2 * M - fixedTotal;
  const substColW = Math.max(50, Math.min(80, Math.floor(availableForSubstances / Math.max(substCount, 1))));

  const substancesPerPage = Math.floor(availableForSubstances / substColW);
  const substancePages = Math.ceil(substCount / substancesPerPage);

  const ROW_H = 22;
  const HEADER_H = 85;
  const PROTO_H = 50;
  const COL_HEADER_H = 30;
  const FOOTER_H = 60;

  const availableBodyH = PAGE_H_L - M - HEADER_H - PROTO_H - COL_HEADER_H - FOOTER_H - M;
  const sessionsPerPage = Math.floor(availableBodyH / ROW_H);

  const today = data.todayDate || new Date().toISOString().slice(0, 10);

  function toShortDate(isoDate: string): string {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y.slice(-2)}`;
  }

  for (let sPage = 0; sPage < substancePages; sPage++) {
    const startSubIdx = sPage * substancesPerPage;
    const endSubIdx = Math.min(startSubIdx + substancesPerPage, substCount);
    const pageSubstances = data.substances.slice(startSubIdx, endSubIdx);
    const pageSubstCount = pageSubstances.length;

    const sessionPages = Math.ceil(maxSessions / sessionsPerPage);

    for (let sessPage = 0; sessPage < sessionPages; sessPage++) {
      const page = pdfDoc.addPage([PAGE_W_L, PAGE_H_L]);
      let y = PAGE_H_L - M;

      page.drawRectangle({ x: M, y: y - 12, width: PAGE_W_L - 2 * M, height: 16, color: rgb(0.92, 0.92, 0.92) });
      page.drawText("RAS - REGISTRO ADMINISTRACAO DE SUBSTANCIAS", {
        x: M + 5, y: y - 8, size: 9, font: bold, color: BLACK,
      });
      if (sPage > 0 || sessPage > 0) {
        const contText = `(cont. pag ${sPage * sessionPages + sessPage + 1})`;
        page.drawText(contText, { x: PAGE_W_L - M - regular.widthOfTextAtSize(contText, 7) - 5, y: y - 7, size: 7, font: regular, color: GRAY });
      }
      y -= 18;

      const fieldH = 11;
      const labelX = M + 5;
      const valueX = M + 130;
      const col2LabelX = M + 340;

      const fields = [
        { label: "NOME", value: data.clientName },
        { label: "CPF", value: data.clientCpf },
        { label: "CELULAR", value: data.clientPhone ?? "" },
        { label: "MEDICO RESPONSAVEL", value: data.professionalName },
        { label: "ENFERMEIRA", value: data.nurseName ?? "" },
        { label: "UNIDADE", value: data.unit },
        { label: "DATA ATENDIMENTO", value: toShortDate(data.startDate) },
      ];

      for (let fi = 0; fi < fields.length; fi++) {
        const fy = y - fi * fieldH;
        page.drawText(fields[fi].label, { x: labelX, y: fy, size: 7, font: bold, color: BLACK });
        page.drawText(fields[fi].value, { x: valueX, y: fy, size: 7, font: regular, color: BLACK });
        page.drawLine({ start: { x: M, y: fy - 3 }, end: { x: M + 320, y: fy - 3 }, thickness: 0.3, color: LIGHT_GRAY });
        page.drawLine({ start: { x: valueX - 2, y: fy + 8 }, end: { x: valueX - 2, y: fy - 3 }, thickness: 0.3, color: LIGHT_GRAY });
      }

      if (data.clientAge || data.clientHeight || data.clientWeight) {
        const extras: string[] = [];
        if (data.clientAge) extras.push(`IDADE: ${data.clientAge}`);
        if (data.clientHeight) extras.push(`ALT.: ${data.clientHeight}`);
        if (data.clientWeight) extras.push(`PESO: ${data.clientWeight}`);
        page.drawText(extras.join("   "), { x: col2LabelX, y: y, size: 7, font: regular, color: BLACK });
      }

      y -= fields.length * fieldH + 8;

      page.drawRectangle({ x: M, y: y - 12, width: PAGE_W_L - 2 * M, height: 14, color: rgb(0.92, 0.92, 0.92) });
      page.drawText("Protocolo Medicamento", { x: M + 5, y: y - 8, size: 8, font: bold, color: BLACK });

      const protoSubX = fixedTotal + M;
      for (let si = 0; si < pageSubstCount; si++) {
        const sub = pageSubstances[si];
        const sx = protoSubX + si * substColW;
        page.drawText(sub.name.length > 10 ? sub.name.slice(0, 9) + "." : sub.name, {
          x: sx + 2, y: y - 8, size: 7, font: bold, color: BLACK,
        });
      }
      y -= 16;

      const protoRows = [
        { label: "Numero de Aplicacoes", key: "total" as const },
        { label: "Frequencia de Aplicacoes", key: "freq" as const },
        { label: "Data Inicio por Substancia", key: "start" as const },
      ];

      for (const pr of protoRows) {
        page.drawText(pr.label, { x: M + 5, y: y - 3, size: 6.5, font: regular, color: BLACK });
        for (let si = 0; si < pageSubstCount; si++) {
          const sub = pageSubstances[si];
          const sx = protoSubX + si * substColW;
          let val = "";
          if (pr.key === "total") val = `Qtde ${sub.totalSessions}`;
          else if (pr.key === "freq") val = `Dias ${sub.frequencyDays}`;
          else val = toShortDate(sub.startDate);
          page.drawText(val, { x: sx + 2, y: y - 3, size: 6.5, font: regular, color: BLACK });
        }
        y -= 11;
      }
      y -= 5;

      const colHeaderY = y;
      page.drawRectangle({ x: M, y: colHeaderY - COL_HEADER_H + 5, width: PAGE_W_L - 2 * M, height: COL_HEADER_H, color: rgb(0.92, 0.92, 0.92) });

      let cx = M;
      const drawColHeaderLine = (w: number) => {
        page.drawLine({ start: { x: cx + w, y: colHeaderY + 5 }, end: { x: cx + w, y: colHeaderY - COL_HEADER_H + 5 }, thickness: 0.3, color: BLACK });
        cx += w;
      };

      drawColHeaderLine(fixedColWidths.agendamento);
      drawColHeaderLine(fixedColWidths.rubricaPaciente);
      drawColHeaderLine(fixedColWidths.rubricaEnf);
      drawColHeaderLine(fixedColWidths.dataPrevista);
      drawColHeaderLine(fixedColWidths.dataEfetiva);

      page.drawText("AGENDA", { x: M + 2, y: colHeaderY - 8, size: 6, font: bold, color: BLACK });
      page.drawText("MENTO", { x: M + 2, y: colHeaderY - 16, size: 6, font: bold, color: BLACK });

      const rpX = M + fixedColWidths.agendamento;
      page.drawText("RUBRICA", { x: rpX + 2, y: colHeaderY - 8, size: 6, font: bold, color: BLACK });
      page.drawText("PACIENTE", { x: rpX + 2, y: colHeaderY - 16, size: 6, font: bold, color: BLACK });

      const reX = rpX + fixedColWidths.rubricaPaciente;
      page.drawText("RUBRICA", { x: reX + 2, y: colHeaderY - 8, size: 6, font: bold, color: BLACK });
      page.drawText("ENF", { x: reX + 2, y: colHeaderY - 16, size: 6, font: bold, color: BLACK });

      const dpHX = reX + fixedColWidths.rubricaEnf;
      page.drawText("DATA", { x: dpHX + 2, y: colHeaderY - 8, size: 6, font: bold, color: BLACK });
      page.drawText("PREVISTA", { x: dpHX + 2, y: colHeaderY - 16, size: 6, font: bold, color: BLACK });

      const deHX = dpHX + fixedColWidths.dataPrevista;
      page.drawText("DATA", { x: deHX + 2, y: colHeaderY - 8, size: 6, font: bold, color: BLACK });
      page.drawText("EFETIVA", { x: deHX + 2, y: colHeaderY - 16, size: 6, font: bold, color: BLACK });

      for (let si = 0; si < pageSubstCount; si++) {
        const sub = pageSubstances[si];
        const sx = protoSubX + si * substColW;
        const subColor = getSubstanceColor(sub.color);

        page.drawRectangle({
          x: sx, y: colHeaderY - COL_HEADER_H + 5,
          width: substColW, height: 4,
          color: subColor,
        });

        page.drawText("STATUS", { x: sx + 2, y: colHeaderY - 8, size: 6, font: bold, color: BLACK });
        page.drawText("SESSAO", { x: sx + 2, y: colHeaderY - 16, size: 6, font: bold, color: BLACK });

        page.drawLine({ start: { x: sx + substColW, y: colHeaderY + 5 }, end: { x: sx + substColW, y: colHeaderY - COL_HEADER_H + 5 }, thickness: 0.3, color: BLACK });
      }

      page.drawLine({ start: { x: M, y: colHeaderY + 5 }, end: { x: PAGE_W_L - M, y: colHeaderY + 5 }, thickness: 0.5, color: BLACK });
      page.drawLine({ start: { x: M, y: colHeaderY - COL_HEADER_H + 5 }, end: { x: PAGE_W_L - M, y: colHeaderY - COL_HEADER_H + 5 }, thickness: 0.5, color: BLACK });

      y = colHeaderY - COL_HEADER_H + 5;

      const startSessIdx = sessPage * sessionsPerPage;
      const endSessIdx = Math.min(startSessIdx + sessionsPerPage, maxSessions);

      for (let si = startSessIdx; si < endSessIdx; si++) {
        const sess = si < data.sessions.length ? data.sessions[si] : null;
        const rowY = y - ROW_H;

        const isToday = sess?.scheduledDate === today;
        if (isToday) {
          page.drawRectangle({ x: M, y: rowY, width: fixedTotal, height: ROW_H, color: rgb(0.92, 0.97, 0.85) });
        }

        page.drawText(String(si + 1), { x: M + 12, y: rowY + 7, size: 8, font: bold, color: BLACK });

        if (sess) {
          const dpX = M + fixedColWidths.agendamento + fixedColWidths.rubricaPaciente + fixedColWidths.rubricaEnf;
          page.drawText(toShortDate(sess.scheduledDate), { x: dpX + 2, y: rowY + 7, size: 7, font: regular, color: BLACK });
        }

        for (let ssi = 0; ssi < pageSubstCount; ssi++) {
          const sub = pageSubstances[ssi];
          const sx = protoSubX + ssi * substColW;

          if (sess) {
            const substStatus = sess.substanceStatuses.find(ss => ss.substanceName === sub.name);
            if (substStatus) {
              const statusText = `${substStatus.sessionNumber} / ${substStatus.totalSessions}`;
              const subColor = getSubstanceColor(sub.color);

              if (substStatus.status === "applied") {
                page.drawRectangle({ x: sx + 1, y: rowY + 1, width: substColW - 2, height: ROW_H - 2, color: subColor, opacity: 0.8 });
                page.drawText(statusText, { x: sx + 4, y: rowY + 7, size: 7, font: bold, color: rgb(1, 1, 1) });
              } else {
                page.drawRectangle({ x: sx + 1, y: rowY + 1, width: substColW - 2, height: ROW_H - 2, color: subColor, opacity: isToday ? 0.45 : 0.25 });
                page.drawText(statusText, { x: sx + 4, y: rowY + 7, size: 7, font: regular, color: BLACK });
              }
            }
          }
        }

        page.drawLine({ start: { x: M, y: rowY }, end: { x: PAGE_W_L - M, y: rowY }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });

        let lx = M;
        page.drawLine({ start: { x: lx + fixedColWidths.agendamento, y: rowY }, end: { x: lx + fixedColWidths.agendamento, y: rowY + ROW_H }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
        lx += fixedColWidths.agendamento;
        page.drawLine({ start: { x: lx + fixedColWidths.rubricaPaciente, y: rowY }, end: { x: lx + fixedColWidths.rubricaPaciente, y: rowY + ROW_H }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
        lx += fixedColWidths.rubricaPaciente;
        page.drawLine({ start: { x: lx + fixedColWidths.rubricaEnf, y: rowY }, end: { x: lx + fixedColWidths.rubricaEnf, y: rowY + ROW_H }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
        lx += fixedColWidths.rubricaEnf;
        page.drawLine({ start: { x: lx + fixedColWidths.dataPrevista, y: rowY }, end: { x: lx + fixedColWidths.dataPrevista, y: rowY + ROW_H }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
        lx += fixedColWidths.dataPrevista;
        page.drawLine({ start: { x: lx + fixedColWidths.dataEfetiva, y: rowY }, end: { x: lx + fixedColWidths.dataEfetiva, y: rowY + ROW_H }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });

        for (let ssi = 0; ssi < pageSubstCount; ssi++) {
          const sx = protoSubX + ssi * substColW;
          page.drawLine({ start: { x: sx + substColW, y: rowY }, end: { x: sx + substColW, y: rowY + ROW_H }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
        }

        y = rowY;
      }

      page.drawLine({ start: { x: M, y }, end: { x: PAGE_W_L - M, y }, thickness: 0.5, color: BLACK });
      page.drawLine({ start: { x: M, y: colHeaderY + 5 }, end: { x: M, y }, thickness: 0.5, color: BLACK });
      page.drawLine({ start: { x: PAGE_W_L - M, y: colHeaderY + 5 }, end: { x: PAGE_W_L - M, y }, thickness: 0.5, color: BLACK });

      y -= 15;
      const totalSigArea = PAGE_W_L - 2 * M - 40;
      const pacienteW = totalSigArea * 0.5;
      const medicoW = totalSigArea * 0.25;
      const enfW = totalSigArea * 0.25;

      const pacX = M;
      page.drawLine({ start: { x: pacX, y: y }, end: { x: pacX + pacienteW, y: y }, thickness: 0.5, color: BLACK });
      page.drawText("Paciente:", { x: pacX, y: y - 10, size: 7, font: bold, color: BLACK });
      page.drawText(data.clientName, { x: pacX, y: y - 20, size: 7, font: regular, color: GRAY });

      const medX = pacX + pacienteW + 20;
      page.drawLine({ start: { x: medX, y: y }, end: { x: medX + medicoW, y: y }, thickness: 0.5, color: BLACK });
      page.drawText("Medico Resp.:", { x: medX, y: y - 10, size: 7, font: bold, color: BLACK });
      page.drawText(data.professionalName, { x: medX, y: y - 20, size: 7, font: regular, color: GRAY });

      const enfSigX = medX + medicoW + 20;
      page.drawLine({ start: { x: enfSigX, y: y }, end: { x: enfSigX + enfW - 20, y: y }, thickness: 0.5, color: BLACK });
      page.drawText("Enfermeiro Resp.:", { x: enfSigX, y: y - 10, size: 7, font: bold, color: BLACK });
      page.drawText(data.nurseName ?? "", { x: enfSigX, y: y - 20, size: 7, font: regular, color: GRAY });

      const footerText = `PADCOM -- Protocolos Injetaveis · RAS Fisico · ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
      page.drawText(footerText, { x: M, y: M - 10, size: 6, font: regular, color: GRAY });
    }
  }

  return await pdfDoc.save();
}

export { getCertInfo, loadCertificate };
