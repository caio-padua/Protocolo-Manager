import { PDFDocument, rgb, StandardFonts, PDFPage, degrees } from "pdf-lib";
import forge from "node-forge";
import fs from "fs";
import path from "path";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { gerarRasFapPdf, type DadosRasFap, type ModoRasFap } from "./ras-fap";
import QRCode from "qrcode";

const signpdf = new SignPdf();

// Site institucional do Paxter (placeholder). QR no rodape dos documentos emitidos
// aponta aqui. Trocar so esta linha quando o site real existir.
const PAXTER_SITE_URL = "https://paxter.com.br";

type QrImage = Awaited<ReturnType<PDFDocument["embedPng"]>> | null;

// Gera+embute o QR uma unica vez (best-effort): se falhar, documento sai sem QR.
async function embedPaxterQr(pdfDoc: PDFDocument): Promise<QrImage> {
  try {
    const buf = await QRCode.toBuffer(PAXTER_SITE_URL, { width: 120, margin: 0, color: { dark: "#0d1830ff", light: "#ffffffff" } });
    return await pdfDoc.embedPng(buf);
  } catch {
    return null;
  }
}

// Fonte do certificado: cache configuravel (cofre/object storage) com fallback
// ao arquivo local. NUNCA quebra no carregamento do modulo — so falha (com
// mensagem clara) na hora de assinar, se nada estiver configurado.
import { getCertBufferSync, getCertPasswordsSync } from "./cert-source.js";

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
  const pfxBuffer = getCertBufferSync();
  const pfxBinary = forge.util.binary.raw.encode(new Uint8Array(pfxBuffer));
  const pfxAsn1 = forge.asn1.fromDer(pfxBinary);

  let p12: forge.pkcs12.Pkcs12Pfx | null = null;

  for (const pw of getCertPasswordsSync()) {
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

let cachedCertPassword: string | null = null;
function getCertPassword(): string {
  if (cachedCertPassword) return cachedCertPassword;
  const pfxBuffer = getCertBufferSync();
  const pfxBinary = forge.util.binary.raw.encode(new Uint8Array(pfxBuffer));
  const pfxAsn1 = forge.asn1.fromDer(pfxBinary);
  for (const pw of getCertPasswordsSync()) {
    try {
      forge.pkcs12.pkcs12FromAsn1(pfxAsn1, pw);
      cachedCertPassword = pw;
      return pw;
    } catch {
      continue;
    }
  }
  throw new Error("Could not determine PFX password");
}

async function embedPadesSignature(
  pdfDoc: PDFDocument,
  opts: { name: string; reason: string; location?: string; contactInfo?: string },
): Promise<Uint8Array> {
  pdflibAddPlaceholder({
    pdfDoc,
    reason: opts.reason,
    contactInfo: opts.contactInfo || "",
    name: opts.name,
    location: opts.location || "Brasil",
    signatureLength: 16384,
  });
  const withPlaceholder = await pdfDoc.save({ useObjectStreams: false });
  const pfxBuffer = getCertBufferSync();
  const signer = new P12Signer(Buffer.from(pfxBuffer), { passphrase: getCertPassword() });
  const signed = await signpdf.sign(Buffer.from(withPlaceholder), signer);
  return new Uint8Array(signed);
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

function drawPageFooter(page: PDFPage, fonts: Fonts, pageNum: number, totalPages: number, qrImg: QrImage = null) {
  const footerText = `Instituto Pádua · Paxter — desenvolvido pela Padcon · Advanced Systems Architecture · Página ${pageNum} de ${totalPages} · ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  page.drawText(footerText, {
    x: MARGIN,
    y: MARGIN - 20,
    size: 6.5,
    font: fonts.regular,
    color: GRAY,
  });
  if (qrImg) {
    try {
      const qs = 22;
      const qx = PAGE_W - MARGIN - qs;
      const qy = 20;
      page.drawImage(qrImg, { x: qx, y: qy, width: qs, height: qs });
      page.drawText("Paxter", { x: qx - 52, y: qy + 13, size: 5.5, font: fonts.bold, color: GRAY });
      page.drawText("paxter.com.br", { x: qx - 52, y: qy + 5, size: 5, font: fonts.regular, color: GRAY });
    } catch { /* nunca derruba a emissao */ }
  }
}

function wrapText(text: string | number | null | undefined, font: Fonts["regular"], fontSize: number, maxWidth: number): string[] {
  const words = safeTxt(text).split(" ");
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
  const { cert } = loadCertificate();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`RAS ${String(ras.id).padStart(6, "0")} — ${ras.clientName}`);
  pdfDoc.setAuthor("Instituto Pádua — Paxter");
  pdfDoc.setSubject("Registro de Administração de Substâncias");
  pdfDoc.setCreator("Sistema Paxter");

  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  // Fontes serifadas (Times) — toque classico/editorial nos titulos das fichas.
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  // Tom marfim para as caixas de destaque (funcao principal).
  const IVORY = rgb(0.98, 0.97, 0.93);

  const qrImg = await embedPaxterQr(pdfDoc);

  const allPages: PDFPage[] = [];

  // Cursor de página compartilhado — garante que o conteúdo nunca caia fora da folha.
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  allPages.push(page);
  let y = PAGE_H - MARGIN;

  function newPage(): void {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    allPages.push(page);
    y = PAGE_H - MARGIN;
  }

  function ensureSpace(needed: number): void {
    // Quebra de pagina so quando nao cabe E ainda nao estamos no topo de uma
    // pagina nova. Isso evita criar pagina em branco quando um unico bloco e
    // maior que a area util (nesse caso desenha no topo da pagina nova, sem
    // ciclo de paginas vazias).
    const atTop = y >= PAGE_H - MARGIN - 0.5;
    if (y - needed < MARGIN + 24 && !atTop) newPage();
  }

  // ============================================================
  // PAGE 1: RAS — REGISTRO DE ADMINISTRAÇÃO DE SUBSTÂNCIAS
  // ============================================================
  {

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

    function drawSubstHeader(): void {
      let cxh = MARGIN;
      page.drawRectangle({ x: MARGIN, y: y - rowH + 4, width: CONTENT_W, height: rowH, color: LIGHT_GRAY });
      for (let i = 0; i < colHeaders.length; i++) {
        page.drawText(colHeaders[i], { x: cxh + 4, y: y - 8, size: 7, font: fonts.bold, color: DARK_BLUE });
        cxh += colWidths[i];
      }
      y -= rowH;
    }

    let cx = MARGIN;
    drawSubstHeader();

    for (const sub of ras.substances) {
      if (y - rowH < MARGIN + 24) {
        newPage();
        drawSubstHeader();
      }
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
      ensureSpace(40);
      sectionTitle("Observações");
      const obsLines = wrapText(ras.observations, fonts.regular, 9, CONTENT_W);
      for (const line of obsLines) {
        ensureSpace(13);
        page.drawText(line, { x: MARGIN, y, size: 9, font: fonts.regular, color: BLACK });
        y -= 13;
      }
      y -= 10;
    }

    // Mantém todo o bloco de assinatura junto, nunca cortado entre páginas.
    ensureSpace(230);
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
  // PAGES 2+: FICHAS DAS SUBSTÂNCIAS — layout editorial premium
  // (faixa navy + fio dourado, nome serifado, barras de impacto por sistema)
  // ============================================================
  const substancesWithInfo = ras.substances.filter(s => s.description || s.mainFunction);

  // Titulo de secao da ficha: rotulo + fio fino colorido (estilo editorial).
  function fichaTitle(title: string, accent: ReturnType<typeof rgb> = GOLD): void {
    ensureSpace(24);
    page.drawText(title, { x: MARGIN, y, size: 8.5, font: fonts.bold, color: DARK_BLUE });
    y -= 5;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.8, color: accent, opacity: 0.55 });
    y -= 15;
  }

  const LIGHT_BLUE = rgb(0.72, 0.8, 0.95);
  const TEXT_INK = rgb(0.2, 0.2, 0.22);

  for (let si = 0; si < substancesWithInfo.length; si++) {
    const sub = substancesWithInfo[si];
    newPage();

    // --- Cabecalho: faixa navy com fio dourado, nome serifado e eficacia ---
    const bandTop = y;
    const bandH = 60;
    const bandY = bandTop - bandH;
    page.drawRectangle({ x: MARGIN, y: bandY, width: CONTENT_W, height: bandH, color: DARK_BLUE });
    page.drawRectangle({ x: MARGIN, y: bandTop - 3, width: CONTENT_W, height: 3, color: GOLD });

    page.drawText(`FICHA DA SUBSTANCIA   ${si + 1} DE ${substancesWithInfo.length}`, {
      x: MARGIN + 16, y: bandTop - 19, size: 7, font: fonts.bold, color: GOLD,
    });

    const nameUpper = sub.substanceName.toUpperCase();
    let nameSize = 20;
    while (serifBold.widthOfTextAtSize(nameUpper, nameSize) > CONTENT_W - 130 && nameSize > 12) nameSize -= 0.5;
    page.drawText(nameUpper, { x: MARGIN + 16, y: bandTop - 43, size: nameSize, font: serifBold, color: rgb(1, 1, 1) });

    const procLabel = sub.procedureType === "im" ? "INTRAMUSCULAR (IM)" : sub.procedureType === "implant" ? "IMPLANTE" : "ENDOVENOSO (IV)";
    page.drawText(procLabel, { x: MARGIN + 16, y: bandY + 10, size: 8, font: fonts.regular, color: LIGHT_BLUE });

    if (sub.starRating !== undefined) {
      page.drawText("EFICACIA", { x: PAGE_W - MARGIN - 86, y: bandTop - 15, size: 6, font: fonts.bold, color: GOLD });
      drawStars(page, PAGE_W - MARGIN - 86, bandTop - 32, sub.starRating);
    }
    const doseLabel = `Dose ${sub.dose}  ·  Sessao ${sub.sessionNumber}/${sub.totalSessions}`;
    const dlw = fonts.regular.widthOfTextAtSize(doseLabel, 8);
    page.drawText(doseLabel, { x: PAGE_W - MARGIN - 16 - dlw, y: bandY + 10, size: 8, font: fonts.regular, color: LIGHT_BLUE });

    y = bandY - 24;

    // --- O QUE E (descricao) ---
    if (sub.description) {
      fichaTitle("O QUE E");
      const descLines = wrapText(sub.description, fonts.regular, 9.5, CONTENT_W);
      for (const line of descLines) {
        ensureSpace(13);
        page.drawText(line, { x: MARGIN, y, size: 9.5, font: fonts.regular, color: TEXT_INK });
        y -= 13;
      }
      y -= 10;
    }

    // --- FUNCAO PRINCIPAL (caixa marfim com tarja dourada lateral, texto serifado) ---
    if (sub.mainFunction) {
      const fnLines = wrapText(sub.mainFunction, serif, 11, CONTENT_W - 30);
      const boxH = 12 + fnLines.length * 15 + 6;
      ensureSpace(boxH + 32);
      fichaTitle("FUNCAO PRINCIPAL");
      const boxTop = y + 4;
      const boxBottom = boxTop - boxH;
      page.drawRectangle({ x: MARGIN, y: boxBottom, width: CONTENT_W, height: boxH, color: IVORY, borderColor: GOLD, borderWidth: 0.6 });
      page.drawRectangle({ x: MARGIN, y: boxBottom, width: 4, height: boxH, color: GOLD });
      let fy = boxTop - 17;
      for (const line of fnLines) {
        page.drawText(line, { x: MARGIN + 16, y: fy, size: 11, font: serif, color: DARK_BLUE });
        fy -= 15;
      }
      y = boxBottom - 16;
    }

    // --- IMPACTO POR SISTEMA DO CORPO (barras 0-5, mais alto primeiro) ---
    if (sub.bodySystemEffects && typeof sub.bodySystemEffects === "object") {
      const entries = Object.entries(sub.bodySystemEffects as Record<string, unknown>)
        .map(([k, v]) => ({ k, v: impactNum(v) }))
        .filter(e => e.v > 0)
        .sort((a, b) => b.v - a.v);
      if (entries.length) {
        fichaTitle("IMPACTO POR SISTEMA DO CORPO", ACCENT_BLUE);
        for (const e of entries) {
          ensureSpace(16);
          drawImpactBar(page, fonts, MARGIN, y, CONTENT_W, systemLabel(e.k), e.v);
          y -= 16;
        }
        y -= 8;
      }
    }

    // --- EFEITOS PERCEBIDOS PELO CLIENTE ---
    if (sub.perceivedEffects) {
      fichaTitle("EFEITOS PERCEBIDOS PELO CLIENTE", GREEN);
      const effectLines = wrapText(sub.perceivedEffects, fonts.regular, 9.5, CONTENT_W - 16);
      for (const line of effectLines) {
        ensureSpace(13);
        page.drawCircle({ x: MARGIN + 3, y: y + 3, size: 2, color: GREEN });
        page.drawText(line, { x: MARGIN + 12, y, size: 9.5, font: fonts.regular, color: TEXT_INK });
        y -= 13;
      }
      y -= 8;
    }

    // --- TEMPO PARA PERCEBER O EFEITO ---
    if (sub.timeToEffect) {
      fichaTitle("TEMPO PARA PERCEBER O EFEITO", GOLD);
      const timeLines = wrapText(sub.timeToEffect, fonts.regular, 9.5, CONTENT_W - 16);
      for (const line of timeLines) {
        ensureSpace(13);
        page.drawCircle({ x: MARGIN + 3, y: y + 3, size: 2, color: GOLD });
        page.drawText(line, { x: MARGIN + 12, y, size: 9.5, font: fonts.regular, color: TEXT_INK });
        y -= 13;
      }
    }
  }

  // ============================================================
  // LAST PAGE(S): TERMO DE CONSENTIMENTO INFORMADO
  // ============================================================
  {
    newPage();

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
        text: "Autorizo o armazenamento digital de todos os registros de atendimento, incluindo o presente termo, no sistema Paxter e, quando aplicável, em ambiente de nuvem seguro (Google Drive), com compartilhamento exclusivo ao meu e-mail cadastrado, em modo somente leitura.",
      },
      {
        title: "10. DECLARAÇÃO FINAL",
        text: "Declaro ter lido e compreendido integralmente o presente termo. Tive a oportunidade de fazer perguntas e esclarecer todas as minhas dúvidas antes de assinar. Autorizo livremente a realização dos procedimentos descritos.",
      },
    ];

    for (const section of consentSections) {
      const lines = wrapText(section.text, fonts.regular, 8.5, CONTENT_W);
      // Mantém o título junto das primeiras linhas; quebra antes de um título órfão.
      const beforeLen = allPages.length;
      ensureSpace(14 + Math.min(lines.length, 3) * 12);
      if (allPages.length > beforeLen) {
        page.drawText("TERMO DE CONSENTIMENTO (cont.)", { x: MARGIN, y, size: 9, font: fonts.bold, color: ACCENT_BLUE });
        y -= 20;
      }

      page.drawText(section.title, { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_BLUE });
      y -= 14;

      for (const line of lines) {
        ensureSpace(12);
        page.drawText(line, { x: MARGIN, y, size: 8.5, font: fonts.regular, color: BLACK });
        y -= 12;
      }
      y -= 10;
    }

    // Assinatura do cliente — sempre cabe inteira (cria página se faltar espaço).
    ensureSpace(60);
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

  // Add brand header (top-right) + page numbers to all pages.
  // Pagina 1 (i===0) ja usa o canto superior direito para "RAS N.o ..." +
  // "Sessao ID", entao o cabecalho de marca so vai da pagina 2 em diante.
  for (let i = 0; i < allPages.length; i++) {
    if (i > 0) drawDocHeaderBrand(allPages[i], fonts);
    drawPageFooter(allPages[i], fonts, i + 1, allPages.length, qrImg);
  }

  // === SIGN THE PDF (PAdES embarcado — selo verde Adobe) ===
  const cnAttrInfo = cert.subject.getField("CN");
  const signerName = cnAttrInfo?.value ? String(cnAttrInfo.value) : ras.professionalName;

  const pdfBytes = await embedPadesSignature(pdfDoc, {
    name: signerName,
    reason: "Assinatura digital do RAS (ICP-Brasil)",
    location: ras.unit || "Instituto Pádua",
    contactInfo: ras.clientCpf || "",
  });

  return {
    pdfBytes,
    certInfo: { ...certInfo, signerName },
  };
}

interface PhysicalRASSubstance {
  name: string;
  color: string;
  totalSessions: number;
  frequencyDays: number;
  startDate: string;
  procedureType?: string;
  dose?: string;
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
  protocolNumber?: number | string;
  valorTratamento?: string;
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

function getSubstanceColor(color: string | undefined | null): ReturnType<typeof rgb> {
  if (!color) return rgb(0.8, 0.7, 0.2);
  return SUBSTANCE_COLORS[color.toLowerCase()] ?? rgb(0.8, 0.7, 0.2);
}

/**
 * RAS FAP (Formulario de Auditoria de Procedimentos) — modelo "PDF PREMIUM".
 * Paisagem A4, tema azul-marinho, replica o modelo aprovado pelo CEO (FABIO MORGON).
 */
export async function generatePhysicalRASPdf(
  data: PhysicalRASData,
  modo: ModoRasFap = "PREMIUM",
): Promise<Uint8Array> {
  // Adaptador: o RAS FAP agora e desenhado pelo motor pdfkit em ./ras-fap (grade
  // IDENTICA a fonte-da-verdade do IHE). Aqui apenas mapeamos os dados do banco
  // (PhysicalRASData) para o formato DadosRasFap e devolvemos os bytes do PDF.
  // `modo` escolhe SO a estetica (a "pele"); a grade nao muda.
  const buf = await gerarRasFapPdf(physicalDataToFap(data), modo);
  return new Uint8Array(buf);
}

// "YYYY-MM-DD" -> Date local (evita deslocamento de fuso horario no fmtData).
// Falha EXPLICITA em data invalida: melhor um 500 claro do que imprimir um
// cronograma de aplicacoes silenciosamente errado num documento clinico.
function parseISODateLocal(s: string, campo: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  throw new Error(`RAS FAP: data invalida em ${campo}: "${s}"`);
}

// Garante inteiro finito dentro de [min,max] (defende a grade contra dados ruins
// do banco: undefined, NaN, negativos ou valores absurdamente altos).
function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.floor(Number(v));
  if (!isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

// "R$ 14.890,00" -> 14890
function parseMoedaBR(s?: string): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : undefined;
}

function viaLabel(t?: string): string | undefined {
  if (!t) return undefined;
  const map: Record<string, string> = {
    iv: "EV", endovenoso: "EV", im: "IM", intramuscular: "IM",
    sc: "SC", subcutaneo: "SC", implant: "IMPL", implante: "IMPL",
  };
  return map[t.toLowerCase()] ?? t.toUpperCase();
}

function physicalDataToFap(data: PhysicalRASData): DadosRasFap {
  return {
    nome: data.clientName,
    cpf: data.clientCpf || undefined,
    celular: data.clientPhone || undefined,
    idade: data.clientAge != null ? `${data.clientAge} ANOS` : undefined,
    medicoResponsavel: data.professionalName,
    enfermeira: data.nurseName || "",
    unidade: data.unit,
    dataAtendimento: parseISODateLocal(data.startDate, "dataAtendimento"),
    protocoloNumero: data.protocolNumber != null ? String(data.protocolNumber) : undefined,
    valorTratamento: parseMoedaBR(data.valorTratamento),
    substancias: data.substances.map((s) => ({
      nome: s.name,
      dose: s.dose || undefined,
      sessoes: clampInt(s.totalSessions, 1, 365, 1),
      frequenciaDias: clampInt(s.frequencyDays, 1, 365, 1),
      inicio: parseISODateLocal(s.startDate, `substancia "${s.name}"`),
      via: viaLabel(s.procedureType),
    })),
  };
}

interface ProtocolDocSubstance {
  name: string;
  dose: string;
  color: string;
  totalSessions: number;
  intervalDays: number;
  startDate: string;
  procedureType: string;
  unitPrice?: number;
  description?: string;
  mainFunction?: string;
  perceivedEffects?: string;
  timeToEffect?: string;
  starRating?: number;
  bodySystemEffects?: Record<string, string>;
  contraindications?: string;
  scientificEvidence?: string;
  longevityBenefit?: string;
  qualityOfLifeImpact?: string;
  sleepBenefit?: string;
  energyBenefit?: string;
  libidoBenefit?: string;
  physicalPerformance?: string;
  muscleStrength?: string;
  mentalClarity?: string;
  skinHairNails?: string;
  immuneSupport?: string;
  // Checkpoint D — Bindings adicionados para Carta de Tratamento Premium (Item #88)
  composicao?: string;
  posologia?: string;
  // Cabeçalho de identidade (spec R3) — classificação vinda do cadastro.
  categoryType?: string | null;
  category?: string | null;
}

interface ProtocolDocSession {
  number: number;
  scheduledDate: string;
  status: string;
  substanceStatuses: Array<{
    substanceName: string;
    sessionNumber: number;
    totalSessions: number;
    status: string;
  }>;
}

interface ProtocolDocPayment {
  amount: number;
  method: string;
  status: string;
  dueDate?: string | null;
  paidAt?: string | null;
  description?: string | null;
  installments?: number | null;
  cardLabel?: string | null;
}

interface ProtocolDocumentData {
  protocolId: number;
  protocolTitle: string;
  clientName: string;
  clientCpf: string;
  clientEmail: string;
  clientPhone?: string;
  clientBirthDate?: string;
  professionalName: string;
  professionalCrm?: string | null;
  nurseName?: string;
  unit: string;
  serviceType: string;
  startDate: string;
  endDate?: string | null;
  totalValue: number;
  notes?: string | null;
  substances: ProtocolDocSubstance[];
  sessions: ProtocolDocSession[];
  payments: ProtocolDocPayment[];
}

const PETROL = rgb(0.12, 0.33, 0.33);
const PETROL_LIGHT = rgb(0.85, 0.93, 0.93);
const PETROL_MID = rgb(0.18, 0.45, 0.45);
const COVER_BG = rgb(0.08, 0.22, 0.22);
const WHITE = rgb(1, 1, 1);
const GOLD_ACCENT = rgb(0.82, 0.68, 0.21);
const CYAN = rgb(0.27, 0.72, 0.80);
const BAR_TRACK = rgb(0.90, 0.92, 0.92);

function drawRubricLine(page: PDFPage, fonts: Fonts, clientName: string) {
  const rY = 38;
  page.drawLine({ start: { x: PAGE_W - MARGIN - 140, y: rY }, end: { x: PAGE_W - MARGIN, y: rY }, thickness: 0.5, color: PETROL });
  page.drawText("RUBRICA CLIENTE", { x: PAGE_W - MARGIN - 140, y: rY - 10, size: 6, font: fonts.regular, color: GRAY });
  page.drawText(clientName.split(" ")[0], { x: PAGE_W - MARGIN - 80, y: rY - 10, size: 6, font: fonts.regular, color: GRAY });
}

function drawDocFooter(page: PDFPage, fonts: Fonts, pageNum: number, totalPages: number, clientName: string) {
  const footerText = `Instituto Padua · Padaxor - desenvolvido pela Padcon · Advanced Systems Architecture | Protocolo Medico Personalizado | Pagina ${pageNum} de ${totalPages}`;
  page.drawText(footerText, { x: MARGIN, y: 18, size: 6, font: fonts.regular, color: GRAY });
  drawRubricLine(page, fonts, clientName);
}

// Cabecalho de marca no CANTO SUPERIOR DIREITO das paginas de conteudo do
// documento emitido: PAXTER + sua frase em ingles (regra do CEO 23/06/2026).
// A capa (pagina 0) ja traz a marca grande, entao este header vai da pagina 2
// em diante. PADCON + frase em ingles fica no RODAPE (drawDocFooter).
function drawDocHeaderBrand(page: PDFPage, fonts: Fonts) {
  const tag = "Clinical Intelligence System";
  const nameW = fonts.bold.widthOfTextAtSize("PADAXOR", 9);
  const tagW = fonts.regular.widthOfTextAtSize(tag, 6);
  page.drawText("PADAXOR", { x: PAGE_W - MARGIN - nameW, y: PAGE_H - 26, size: 9, font: fonts.bold, color: DARK_BLUE });
  page.drawText(tag, { x: PAGE_W - MARGIN - tagW, y: PAGE_H - 34, size: 6, font: fonts.regular, color: GOLD_ACCENT });
}

function newDocPage(pdfDoc: PDFDocument, allPages: PDFPage[]): PDFPage {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  allPages.push(page);
  return page;
}

function drawSectionHeader(page: PDFPage, fonts: Fonts, y: number, title: string): number {
  page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 20, color: PETROL });
  page.drawText(title, { x: MARGIN + 10, y: y + 3, size: 9, font: fonts.bold, color: WHITE });
  return y - 28;
}

function safeTxt(text: string | number | undefined | null): string {
  if (text === undefined || text === null) return "";
  const str = String(text);
  return str
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00B2/g, "2")
    .replace(/\u00B3/g, "3");
}

function toDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function benefitLabel(val: string | undefined): string {
  if (!val) return "-";
  const t = safeTxt(val).trim();
  return t.length > 40 ? t.slice(0, 38) + ".." : t;
}

// Coage o valor de impacto (0-5) que pode chegar como numero ou string.
function impactNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Cor da barra conforme intensidade: vermelho (baixo) -> verde (maximo).
function impactColor(v: number): ReturnType<typeof rgb> {
  if (v >= 4.5) return rgb(0.05, 0.55, 0.25); // verde forte
  if (v >= 3.5) return rgb(0.16, 0.63, 0.60); // ciano-petroleo
  if (v >= 2.5) return rgb(0.82, 0.68, 0.21); // ambar/ouro
  if (v >= 1.5) return rgb(0.85, 0.52, 0.18); // laranja
  if (v > 0) return rgb(0.78, 0.30, 0.25);    // vermelho suave
  return rgb(0.70, 0.72, 0.72);               // neutro
}

function impactWord(v: number): string {
  if (v >= 4.5) return "MAXIMO";
  if (v >= 3.5) return "ALTO";
  if (v >= 2.5) return "MODERADO";
  if (v >= 1.5) return "LEVE";
  if (v > 0) return "BAIXO";
  return "-";
}

// Rotulos legiveis (PT) para as chaves snake_case de bodySystemEffects.
const SYSTEM_LABELS: Record<string, string> = {
  cardiovascular: "Cardiovascular",
  neurologico: "Neurologico",
  neurocognicao: "Neurocognicao",
  metabolismo: "Metabolismo",
  muscular: "Muscular",
  muscular_hipertrofia: "Musculo/Hipertrofia",
  hepatico: "Figado",
  imunologico: "Imunologico",
  dermatologico: "Pele/Dermato",
  endocrino: "Endocrino",
  longevidade: "Longevidade",
  hematologico: "Sangue/Hemato",
  osteoarticular: "Ossos/Articulacoes",
  libido_sexual: "Libido/Sexual",
  performance_fisica: "Performance Fisica",
  respiratorio: "Respiratorio",
  digestivo: "Digestivo",
  renal: "Renal",
};
function systemLabel(k: string): string {
  return SYSTEM_LABELS[k] ?? safeTxt(k).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Desenha uma barra horizontal de impacto 0-5: rotulo | trilho com preenchimento | valor.
function drawImpactBar(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  y: number,
  totalW: number,
  label: string,
  rawValue: unknown,
): void {
  const value = impactNum(rawValue);
  const labelW = 110;
  const valW = 62;
  const barX = x + labelW;
  const barW = Math.max(40, totalW - labelW - valW);
  const barH = 7;

  const lbl = label.length > 22 ? label.slice(0, 21) + "." : label;
  page.drawText(lbl, { x, y: y - 1, size: 7, font: fonts.bold, color: PETROL });

  page.drawRectangle({ x: barX, y: y - 2, width: barW, height: barH, color: BAR_TRACK });
  const frac = Math.max(0, Math.min(1, value / 5));
  if (frac > 0) {
    page.drawRectangle({ x: barX, y: y - 2, width: barW * frac, height: barH, color: impactColor(value) });
  }
  // Separadores das 5 unidades.
  for (let i = 1; i < 5; i++) {
    const tx = barX + (barW / 5) * i;
    page.drawLine({ start: { x: tx, y: y - 2 }, end: { x: tx, y: y - 2 + barH }, thickness: 0.4, color: WHITE });
  }
  const valTxt = value > 0 ? `${value % 1 === 0 ? value : value.toFixed(1)}/5 ${impactWord(value)}` : "-";
  page.drawText(valTxt, { x: barX + barW + 6, y: y - 1, size: 6, font: fonts.bold, color: impactColor(value) });
}

// Dimensoes de beneficio (campos texto) usadas na matriz e na ficha.
const BENEFIT_DIMS: Array<{ key: string; label: string; color: ReturnType<typeof rgb> }> = [
  { key: "longevityBenefit", label: "LONGEVIDADE", color: rgb(0.45, 0.30, 0.60) },
  { key: "energyBenefit", label: "ENERGIA", color: rgb(0.85, 0.55, 0.15) },
  { key: "sleepBenefit", label: "SONO", color: rgb(0.25, 0.40, 0.70) },
  { key: "libidoBenefit", label: "LIBIDO", color: rgb(0.80, 0.25, 0.40) },
  { key: "mentalClarity", label: "CLAREZA MENTAL", color: rgb(0.20, 0.55, 0.65) },
  { key: "immuneSupport", label: "IMUNIDADE", color: rgb(0.15, 0.60, 0.35) },
  { key: "physicalPerformance", label: "PERFORMANCE FISICA", color: rgb(0.60, 0.40, 0.15) },
  { key: "muscleStrength", label: "FORCA MUSCULAR", color: rgb(0.30, 0.45, 0.50) },
  { key: "skinHairNails", label: "PELE/CABELO/UNHAS", color: rgb(0.85, 0.50, 0.40) },
  { key: "qualityOfLifeImpact", label: "QUALIDADE DE VIDA", color: PETROL_MID },
];

function methodLabel(m: string): string {
  const map: Record<string, string> = {
    pix: "PIX", credit: "Cartao Credito", debit: "Cartao Debito",
    boleto: "Boleto", cash: "Dinheiro",
  };
  return map[m] ?? m;
}

function procTypeLabel(t: string): string {
  const map: Record<string, string> = {
    iv: "ENDOVENOSO (IV)", im: "INTRAMUSCULAR (IM)",
    sc: "SUBCUTANEO (SC)", implant: "IMPLANTE",
  };
  return map[t] ?? t.toUpperCase();
}

// ── Radar de Foco (teia de aranha) ─────────────────────────────────────────

interface RadarDim { label: string; value: number; } // 0 = ausente, 1 = Apoio, 2 = Foco, 3 = Foco principal

function deriveRadarDimensions(substances: ProtocolDocSubstance[]): RadarDim[] {
  type DimSpec = { label: string; bodyKeys: string[]; benefitKeys: string[] };
  const DIMS: DimSpec[] = [
    { label: "Energia",              bodyKeys: ["metabolismo","cardiovascular","performance_fisica"],       benefitKeys: ["energyBenefit","physicalPerformance"] },
    { label: "Clareza Mental",       bodyKeys: ["neurocognicao","neurologico"],                             benefitKeys: ["mentalClarity"] },
    { label: "Imunidade",            bodyKeys: ["imunologico","hematologico"],                              benefitKeys: ["immuneSupport"] },
    { label: "Ossos e Articulacoes", bodyKeys: ["osteoarticular"],                                         benefitKeys: [] },
    { label: "Forca Muscular",       bodyKeys: ["muscular","muscular_hipertrofia"],                        benefitKeys: ["muscleStrength"] },
    { label: "Saude Metabolica",     bodyKeys: ["endocrino","hepatico","renal"],                           benefitKeys: ["longevityBenefit"] },
    { label: "Longevidade",          bodyKeys: ["longevidade","libido_sexual","dermatologico"],            benefitKeys: ["qualityOfLifeImpact","libidoBenefit","skinHairNails"] },
  ];

  return DIMS.map(dim => {
    let maxRaw = 0;
    for (const sub of substances) {
      if (sub.bodySystemEffects && typeof sub.bodySystemEffects === "object") {
        for (const key of dim.bodyKeys) {
          const v = impactNum((sub.bodySystemEffects as Record<string, unknown>)[key]);
          if (v > maxRaw) maxRaw = v;
        }
      }
      for (const bk of dim.benefitKeys) {
        const bv = (sub as Record<string, unknown>)[bk];
        if (bv && String(bv).trim().length > 0 && maxRaw < 3) maxRaw = 3;
      }
    }
    let value = 0;
    if (maxRaw >= 4.5) value = 3;
    else if (maxRaw >= 2.5) value = 2;
    else if (maxRaw >= 0.5) value = 1;
    return { label: dim.label, value };
  });
}

function drawRadarChart(
  page: PDFPage,
  fonts: Fonts,
  cx: number,
  cy: number,
  radius: number,
  dims: RadarDim[],
  // Aditivo e opcional: coluna estreita precisa de rótulo menor, senão o texto
  // dos eixos invade a coluna vizinha. Default preserva o comportamento antigo.
  labelSize = 7,
): void {
  const n = dims.length;
  if (n < 3) return;
  const TWO_PI = Math.PI * 2;

  // PDF y-up, clockwise radar starting at top (π/2)
  function ang(i: number): number { return Math.PI / 2 - (i / n) * TWO_PI; }
  function ptR(i: number, r: number): { x: number; y: number } {
    const a = ang(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  // Pastel palette — elegant, not garish
  const RING_C   = rgb(0.70, 0.77, 0.77);
  const AXIS_C   = rgb(0.68, 0.76, 0.76);
  const FILL_C   = rgb(0.86, 0.92, 0.87);   // mint-cream pastel
  const STROKE_C = rgb(0.72, 0.58, 0.12);   // gold
  const LBL_C    = rgb(0.08, 0.18, 0.20);   // dark navy

  // 1. Concentric scale rings
  const RING_NAMES = ["Apoio", "Foco", "Foco principal"];
  for (let ring = 1; ring <= 3; ring++) {
    const r = (ring / 3) * radius;
    const segs: string[] = [];
    for (let i = 0; i <= n; i++) {
      const p = ptR(i % n, r);
      segs.push(`${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    segs.push("Z");
    try {
      page.drawSvgPath(segs.join(" "), {
        x: 0, y: 0,
        borderColor: RING_C,
        borderWidth: ring === 3 ? 0.8 : 0.35,
        borderOpacity: 0.7,
        opacity: 0,
      });
    } catch {
      for (let i = 0; i < n; i++) {
        const p1 = ptR(i, r); const p2 = ptR((i + 1) % n, r);
        page.drawLine({ start: p1, end: p2, thickness: ring === 3 ? 0.8 : 0.35, color: RING_C, opacity: 0.7 });
      }
    }
    // Ring label at 0° (right side)
    page.drawText(RING_NAMES[ring - 1], { x: cx + r + 3, y: cy - 3, size: 5.5, font: fonts.regular, color: RING_C });
  }

  // 2. Axes from center to outer ring
  for (let i = 0; i < n; i++) {
    const outer = ptR(i, radius);
    page.drawLine({ start: { x: cx, y: cy }, end: outer, thickness: 0.35, color: AXIS_C, opacity: 0.6 });
  }

  // 3. Center dot
  page.drawCircle({ x: cx, y: cy, size: 2, color: RING_C });

  // 4. Filled data polygon — caminho SVG fechado (drawSvgPath suportado pelo pdf-lib@1.17.1)
  const dataPts = dims.map((d, i) => ptR(i, (Math.min(3, Math.max(0, d.value)) / 3) * radius));
  try {
    const polySegs = dataPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    polySegs.push("Z");
    page.drawSvgPath(polySegs.join(" "), {
      x: 0, y: 0,
      color: FILL_C, opacity: 0.42,
      borderColor: FILL_C, borderWidth: 0,
    });
  } catch {
    /* fallback silencioso se o path for inválido */
  }
  // Contorno dourado por cima do polígono
  for (let i = 0; i < n; i++) {
    page.drawLine({ start: dataPts[i], end: dataPts[(i + 1) % n], thickness: 1.5, color: STROKE_C, opacity: 0.9 });
  }

  // 5. Data point dots
  for (const p of dataPts) {
    page.drawCircle({ x: p.x, y: p.y, size: 3.5, color: STROKE_C });
  }

  // 6. Axis labels — positioned beyond outer ring with smart horizontal alignment
  const LABEL_PAD = labelSize <= 6 ? 12 : 20;
  for (let i = 0; i < n; i++) {
    const a = ang(i);
    const lx = cx + (radius + LABEL_PAD) * Math.cos(a);
    const ly = cy + (radius + LABEL_PAD) * Math.sin(a);
    const label = safeTxt(dims[i].label);
    const lw = fonts.bold.widthOfTextAtSize(label, labelSize);
    const cosA = Math.cos(a);
    let ax = lx - lw / 2;
    if (cosA > 0.55) ax = lx + 3;
    else if (cosA < -0.55) ax = lx - lw - 3;
    page.drawText(label, { x: ax, y: ly - 3.5, size: labelSize, font: fonts.bold, color: LBL_C });
  }
}

// ── fim radar ────────────────────────────────────────────────────────────────

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  ITEM #88 — CARTA DE TRATAMENTO PREMIUM PADAXOR                            ║
// ║  Checkpoint A: Paleta, fontes e ativos de marca                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const NAVY_P   = rgb(22/255,  40/255,  74/255);   // #16284A
const GOLD_P   = rgb(154/255, 123/255, 50/255);   // #9A7B32
const IVORY_P  = rgb(250/255, 248/255, 243/255);  // #FAF8F3
const INK_P    = rgb(31/255,  39/255,  52/255);   // #1F2734
const MIST_P   = rgb(224/255, 218/255, 205/255);  // #E0DACD
const LINE_P   = rgb(215/255, 209/255, 195/255);  // #D7D1C3
const SCYAN    = rgb(0,       180/255, 190/255);  // #00B4BE
const SAFETY_C = rgb(145/255, 77/255,  69/255);   // #914D45

interface PremiumFonts {
  cgReg:      Awaited<ReturnType<PDFDocument["embedFont"]>>;
  cgBold:     Awaited<ReturnType<PDFDocument["embedFont"]>>;
  cgSemiBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  manReg:     Awaited<ReturnType<PDFDocument["embedFont"]>>;
  manBold:    Awaited<ReturnType<PDFDocument["embedFont"]>>;
}

async function loadPremiumFonts(pdfDoc: PDFDocument): Promise<PremiumFonts> {
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  pdfDoc.registerFontkit(fontkit);
  const fd = path.resolve(import.meta.dirname, "../assets/fonts");
  const [cgRegB, cgBoldB, cgSemiBoldB, manRegB, manBoldB] = await Promise.all([
    fs.promises.readFile(path.join(fd, "CormorantGaramond-Regular.woff")),
    fs.promises.readFile(path.join(fd, "CormorantGaramond-Bold.woff")),
    fs.promises.readFile(path.join(fd, "CormorantGaramond-SemiBold.woff")),
    fs.promises.readFile(path.join(fd, "Manrope-Regular.woff")),
    fs.promises.readFile(path.join(fd, "Manrope-Bold.woff")),
  ]);
  // CRÍTICO: { subset: true } é OBRIGATÓRIO para fonte .woff.
  // Sem o recorte (subset), o pdf-lib embute o arquivo .woff comprimido cru dentro do
  // PDF; nenhum leitor consegue descomprimi-lo e o texto sai como quadradinhos/pontos
  // ("Embedded font file may be invalid"). Com subset:true o fontkit reescreve a fonte
  // em TrueType puro contendo só os glifos usados. NUNCA remover esta opção.
  const [cgReg, cgBold, cgSemiBold, manReg, manBold] = await Promise.all([
    pdfDoc.embedFont(cgRegB,     { subset: true }),
    pdfDoc.embedFont(cgBoldB,    { subset: true }),
    pdfDoc.embedFont(cgSemiBoldB,{ subset: true }),
    pdfDoc.embedFont(manRegB,    { subset: true }),
    pdfDoc.embedFont(manBoldB,   { subset: true }),
  ]);
  return { cgReg, cgBold, cgSemiBold, manReg, manBold };
}

async function embedPadaxorSymbol(pdfDoc: PDFDocument): Promise<Awaited<ReturnType<PDFDocument["embedPng"]>> | null> {
  try {
    const buf = await fs.promises.readFile(
      path.resolve(import.meta.dirname, "../assets/brand/03-loginho-vidro-sistema.png"),
    );
    return await pdfDoc.embedPng(buf);
  } catch { return null; }
}

function maskCpf(cpf: string | undefined): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}
function maskEmail(email: string | undefined): string {
  if (!email || !email.includes("@")) return email ?? "—";
  const [user, domain] = email.split("@");
  return `${(user ?? "").slice(0, 2)}***@${domain}`;
}

// ── Checkpoint C: Barras verticais de impacto 0-5 ────────────────────────────
function drawVerticalSystemMap(
  page: PDFPage,
  pf: PremiumFonts,
  x: number,
  topY: number,
  totalW: number,
  bse: Record<string, unknown>,
): number {
  const entries = Object.entries(bse)
    .map(([k, v]) => ({ k, v: impactNum(v) }))
    .filter(e => e.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  if (entries.length === 0) return topY;

  const BAR_H = 72;
  const barW = Math.min(26, (totalW - 4) / entries.length - 4);
  const gap = entries.length > 1 ? (totalW - entries.length * barW) / (entries.length - 1) : 0;
  const baseY = topY - BAR_H;

  for (let i = 1; i <= 5; i++) {
    const ly = baseY + (i / 5) * BAR_H;
    page.drawLine({ start: { x, y: ly }, end: { x: x + totalW, y: ly }, thickness: 0.25, color: LINE_P });
    page.drawText(String(i), { x: x - 10, y: ly - 3, size: 4.5, font: pf.manReg, color: MIST_P });
  }

  const BAR_COLORS = [NAVY_P, GOLD_P, SCYAN, rgb(0.45, 0.30, 0.60), rgb(0.16, 0.63, 0.35), SAFETY_C];
  for (let i = 0; i < entries.length; i++) {
    const bx = x + i * (barW + gap);
    const bh = (entries[i].v / 5) * BAR_H;
    const col = BAR_COLORS[i % BAR_COLORS.length];
    page.drawRectangle({ x: bx, y: baseY, width: barW, height: BAR_H, color: LINE_P, opacity: 0.35 });
    if (bh > 0) page.drawRectangle({ x: bx, y: baseY, width: barW, height: bh, color: col });
    const valTxt = entries[i].v % 1 === 0 ? String(entries[i].v) : entries[i].v.toFixed(1);
    const vW = pf.manBold.widthOfTextAtSize(valTxt, 6.5);
    page.drawText(valTxt, { x: bx + (barW - vW) / 2, y: baseY + bh + 3, size: 6.5, font: pf.manBold, color: NAVY_P });
    const lbl = (SYSTEM_LABELS[entries[i].k] ?? entries[i].k).replace(/_/g, " ");
    const lblShort = lbl.length > 13 ? lbl.slice(0, 12) + "." : lbl;
    const lblW = pf.manBold.widthOfTextAtSize(lblShort, 4.5);
    page.drawText(lblShort, { x: bx + (barW - lblW) / 2, y: baseY - 9, size: 4.5, font: pf.manBold, color: INK_P });
  }
  return baseY - 22;
}

function deriveRadarDimensionsForSubstance(sub: ProtocolDocSubstance): RadarDim[] {
  return deriveRadarDimensions([sub]);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  GRADE FIXA — LEI DO DOCUMENTO (spec R2, ordem do CEO 13/08/2026)        ║
// ║                                                                          ║
// ║  O CEO tem TDAH de HIPERFOCO. Padrão que muda de página para página      ║
// ║  gera desconforto de leitura. Portanto:                                  ║
// ║                                                                          ║
// ║   1. Toda ficha tem os MESMOS blocos, na MESMA ordem, nas MESMAS coords. ║
// ║   2. Campo sem dado NUNCA desaparece — recebe placeholder elegante.      ║
// ║   3. Proibido reflow: conteúdo não sobe para preencher buraco.           ║
// ║                                                                          ║
// ║  Quem alterar esta ficha DEVE manter a grade. Ver:                       ║
// ║  specs/carta-tratamento-premium-v2.md                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/** Placeholder para valor curto ausente (grade R2.2). */
const EMPTY_SHORT = "—";
/** Placeholder para bloco de texto ausente (grade R2.2). */
const EMPTY_LONG = "A definir em avaliação clínica.";
/** Tom suave para placeholder: presente, porém discreto — não compete com o dado real. */
const EMPTY_C = rgb(158 / 255, 152 / 255, 138 / 255);

/** Um bloco narrativo da ficha: rótulo fixo + campo de origem. */
interface NarrativeBlock {
  label: string;
  value: string | undefined;
  safety?: boolean;
}

/**
 * Grade narrativa CANÔNICA. Esta lista define a ficha inteira.
 * Toda substância desenha TODOS estes blocos, tenha dado ou não (R2.1/R2.2).
 * Rótulos em português do CEO, herdando a linguagem humana validada (R4.1).
 */
function narrativeGrid(sub: ProtocolDocSubstance): NarrativeBlock[] {
  return [
    { label: "O QUE É",                  value: sub.description },
    { label: "FUNÇÃO NO SEU PLANO",      value: sub.mainFunction },
    { label: "O QUE PODE SER PERCEBIDO", value: sub.perceivedEffects },
    { label: "COMPOSIÇÃO",               value: sub.composicao },
    { label: "POSOLOGIA",                value: sub.posologia },
    { label: "SEGURANÇA",                value: sub.contraindications, safety: true },
    { label: "CIÊNCIA & INDICAÇÃO",      value: sub.scientificEvidence },
  ];
}

/** Os 10 benefícios por área do cadastro, sempre na mesma ordem (R3.1). */
function benefitGrid(sub: ProtocolDocSubstance): Array<{ label: string; value: string | undefined }> {
  return [
    { label: "Longevidade",        value: sub.longevityBenefit },
    { label: "Qualidade de vida",  value: sub.qualityOfLifeImpact },
    { label: "Sono",               value: sub.sleepBenefit },
    { label: "Energia",            value: sub.energyBenefit },
    { label: "Libido",             value: sub.libidoBenefit },
    { label: "Performance física", value: sub.physicalPerformance },
    { label: "Força muscular",     value: sub.muscleStrength },
    { label: "Clareza mental",     value: sub.mentalClarity },
    { label: "Pele, cabelo, unhas",value: sub.skinHairNails },
    { label: "Imunidade",          value: sub.immuneSupport },
  ];
}

/**
 * Escreve texto com quebra automática, devolvendo o que NÃO coube.
 * Placeholder é desenhado em itálico-claro quando o valor está vazio (R2.2),
 * garantindo que o bloco ocupe seu lugar na grade mesmo sem dado.
 */
function drawGridText(
  pg: PDFPage,
  pf: PremiumFonts,
  x: number,
  startY: number,
  w: number,
  value: string | undefined,
  floorY: number,
  size = 7.4,
  lineH = 10.2,
): { endY: number; overflow: string } {
  const txt = safeTxt(value ?? "").trim();
  if (!txt) {
    // Campo vazio: placeholder no lugar exato — a grade não se move (R2.2/R2.4).
    pg.drawText(EMPTY_LONG, { x, y: startY, size, font: pf.cgReg, color: EMPTY_C });
    return { endY: startY - lineH, overflow: "" };
  }
  const lines = wrapText(txt, pf.manReg, size, w);
  let y = startY;
  let i = 0;
  for (; i < lines.length; i++) {
    if (y - lineH < floorY) break;
    pg.drawText(lines[i], { x, y, size, font: pf.manReg, color: INK_P });
    y -= lineH;
  }
  return { endY: y, overflow: i < lines.length ? lines.slice(i).join(" ") : "" };
}

/** Rótulo de bloco com filete — âncora visual repetida em toda ficha (R2.1). */
function drawGridLabel(
  pg: PDFPage,
  pf: PremiumFonts,
  x: number,
  y: number,
  w: number,
  label: string,
  safety = false,
): number {
  const c = safety ? SAFETY_C : GOLD_P;
  pg.drawText(label, { x, y, size: 6, font: pf.manBold, color: c });
  pg.drawLine({ start: { x, y: y - 4.5 }, end: { x: x + w, y: y - 4.5 }, thickness: 0.5, color: c, opacity: 0.45 });
  return y - 15;
}

// ── Checkpoint C: Ficha individual por substância (1 por A4) ─────────────────
function drawSubstancePremiumPage(
  pdfDoc: PDFDocument,
  allPages: PDFPage[],
  sub: ProtocolDocSubstance,
  idx: number,
  total: number,
  pf: PremiumFonts,
  fb: Fonts,
): void {
  const pg = newDocPage(pdfDoc, allPages);
  pg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });

  // Hero band
  const BAND_H = 70;
  const bandY = PAGE_H - MARGIN - BAND_H;
  pg.drawRectangle({ x: MARGIN, y: bandY, width: CONTENT_W, height: BAND_H, color: NAVY_P });
  pg.drawRectangle({ x: MARGIN, y: PAGE_H - MARGIN - 3, width: CONTENT_W, height: 3, color: GOLD_P });

  const sheetTxt = `FICHA ${idx + 1} DE ${total}`;
  const stW = pf.manBold.widthOfTextAtSize(sheetTxt, 6.5);
  pg.drawText(sheetTxt, { x: MARGIN + CONTENT_W - stW - 4, y: PAGE_H - MARGIN - 16, size: 6.5, font: pf.manBold, color: GOLD_P });

  // Nome: encolhe até 11pt e, se ainda assim não couber (nome absurdamente longo),
  // trunca com reticências. Sem isso o texto vazava para fora da faixa navy.
  const NAME_MAX_W = CONTENT_W - 140;
  let rawName = safeTxt(sub.name).toUpperCase();
  let nameSize = 27;
  while (pf.cgBold.widthOfTextAtSize(rawName, nameSize) > NAME_MAX_W && nameSize > 11) nameSize -= 0.5;
  while (rawName.length > 4 && pf.cgBold.widthOfTextAtSize(rawName, nameSize) > NAME_MAX_W) {
    rawName = rawName.slice(0, -2) + "…";
  }
  pg.drawText(rawName, { x: MARGIN + 10, y: PAGE_H - MARGIN - 38, size: nameSize, font: pf.cgBold, color: WHITE });

  // Classificação do cadastro (spec R3 — cabeçalho de identidade).
  // categoryType/category viajam no DTO; se ausentes, a linha continua existindo
  // exibindo só a via, sem buraco na faixa.
  const classParts = [safeTxt(sub.categoryType ?? "").trim(), safeTxt(sub.category ?? "").trim()]
    .filter(Boolean)
    .map(s => s.toUpperCase());
  const routeTxt = [procTypeLabel(sub.procedureType), ...classParts].join("  ·  ");
  pg.drawText(routeTxt, { x: MARGIN + 10, y: bandY + 10, size: 7, font: pf.manBold, color: GOLD_P });

  const cleanDose = safeTxt(sub.dose).replace(/\s*\/\s*\d+[\.,]?\d*\s*(ml|mL|ML)/gi, "").trim();
  const doW = pf.manReg.widthOfTextAtSize(cleanDose || EMPTY_SHORT, 7);
  pg.drawText(cleanDose || EMPTY_SHORT, { x: MARGIN + CONTENT_W - doW - 4, y: bandY + 10, size: 7, font: pf.manReg, color: MIST_P });

  // ── GRADE 1: prescrição — 6 células fixas, sempre presentes (R2/R3) ────────
  const presY = bandY - 42;
  const PRES_H = 38;
  pg.drawRectangle({ x: MARGIN, y: presY, width: CONTENT_W, height: PRES_H, color: MIST_P, opacity: 0.42 });
  const presCells: Array<{ lbl: string; val: string }> = [
    { lbl: "DOSE PRESCRITA",  val: cleanDose },
    { lbl: "VIA",             val: procTypeLabel(sub.procedureType).split("(")[0].trim() },
    { lbl: "SESSÕES",         val: sub.totalSessions > 0 ? String(sub.totalSessions) : "" },
    { lbl: "INTERVALO",       val: sub.intervalDays > 0 ? `${sub.intervalDays} dias` : "" },
    { lbl: "TEMPO ATÉ EFEITO",val: safeTxt(sub.timeToEffect) },
    { lbl: "ESCALA CLÍNICA",  val: sub.starRating != null && sub.starRating > 0 ? `${sub.starRating} de 5` : "" },
  ];
  const cellW = CONTENT_W / presCells.length;
  for (let ci = 0; ci < presCells.length; ci++) {
    const cx0 = MARGIN + ci * cellW;
    if (ci > 0) {
      pg.drawLine({ start: { x: cx0, y: presY + 4 }, end: { x: cx0, y: presY + PRES_H - 4 }, thickness: 0.4, color: LINE_P });
    }
    pg.drawText(presCells[ci].lbl, { x: cx0 + 5, y: presY + PRES_H - 12, size: 4.4, font: pf.manBold, color: INK_P });
    const raw = presCells[ci].val;
    const has = raw.trim().length > 0;
    const shown = has ? raw : EMPTY_SHORT;
    const cellFont = has ? pf.cgBold : pf.cgReg;
    // Fonte adaptativa + quebra em 2 linhas. Valores longos (ex.: "Energia em 2-3
    // semanas, beneficio cardiovascular gradual") vazavam para a célula vizinha;
    // agora encolhem e quebram dentro do próprio compartimento.
    let vs = 9;
    while (cellFont.widthOfTextAtSize(shown, vs) > cellW - 10 && vs > 5.2) vs -= 0.25;
    const cellLines = cellFont.widthOfTextAtSize(shown, vs) > cellW - 10
      ? wrapText(shown, cellFont, vs, cellW - 10).slice(0, 2)
      : [shown];
    for (let li = 0; li < cellLines.length; li++) {
      pg.drawText(cellLines[li], {
        x: cx0 + 5,
        y: presY + (cellLines.length > 1 ? 13 : 9) - li * (vs + 1.5),
        size: vs,
        font: cellFont,
        color: has ? NAVY_P : EMPTY_C,
      });
    }
  }

  // ── GRADE 2: duas colunas de altura fixa ───────────────────────────────────
  const bodyTop = presY - 20;
  const leftW = 200;
  const rightX = MARGIN + leftW + 16;
  const rightW = CONTENT_W - leftW - 16;
  const FLOOR = 74; // piso reservado ao rodapé — idêntico em toda ficha

  // COLUNA ESQUERDA — painéis visuais, posições FIXAS (R2.1).
  // Cada painel ocupa sua faixa mesmo sem dado, exibindo aviso discreto (R2.2).
  let leftY = bodyTop;

  // Painel A: impacto por sistema
  leftY = drawGridLabel(pg, pf, MARGIN, leftY, leftW, "IMPACTO POR SISTEMA");
  const bse = sub.bodySystemEffects;
  const hasBse = bse && typeof bse === "object" && Object.keys(bse as object).length > 0;
  const SYS_PANEL_H = 118;
  const sysFloor = leftY - SYS_PANEL_H;
  if (hasBse) {
    drawVerticalSystemMap(pg, pf, MARGIN + 10, leftY, leftW - 14, bse as Record<string, unknown>);
  } else {
    pg.drawText("Mapa de sistemas não cadastrado.", { x: MARGIN, y: leftY - 12, size: 6.6, font: pf.cgReg, color: EMPTY_C });
  }
  leftY = sysFloor; // posição fixa: não depende de quantas barras existem

  // Painel B: radar de foco — sempre no mesmo lugar
  leftY = drawGridLabel(pg, pf, MARGIN, leftY, leftW, "PERFIL DE FOCO");
  const RADAR_R = 58;
  const rcy = leftY - RADAR_R - 8;
  try {
    const dims = deriveRadarDimensionsForSubstance(sub);
    if (dims.some(d => d.value > 0)) {
      // labelSize 5.2: a coluna esquerda é estreita — rótulo maior invadiria a
      // coluna de narrativa à direita (defeito visto na validação de 13/08/2026).
      drawRadarChart(pg, { regular: pf.manReg, bold: pf.manBold }, MARGIN + leftW / 2 - 6, rcy, RADAR_R, dims, 5.2);
    } else {
      pg.drawText("Perfil de foco a definir.", { x: MARGIN, y: leftY - 12, size: 6.6, font: pf.cgReg, color: EMPTY_C });
    }
  } catch { /* best-effort: nunca derruba a geração */ }
  leftY = rcy - RADAR_R - 26;

  // Painel C: benefícios por área — os 10 do cadastro, SEMPRE os 10 (R3.1).
  // Correção do parecer do architect: o loop antigo usava `break`, que fazia
  // sumir os benefícios finais da grade E descartava o dado cadastrado deles.
  // Agora TODO benefício é processado: o que não couber na folha é desenhado
  // até onde há espaço e o restante segue íntegro para a continuação.
  leftY = drawGridLabel(pg, pf, MARGIN, leftY, leftW, "BENEFÍCIOS POR ÁREA");
  const benefits = benefitGrid(sub);
  const benefitOverflow: Array<[string, string]> = [];
  for (const b of benefits) {
    const val = safeTxt(b.value ?? "").trim();
    const key = `BENEFÍCIO · ${b.label.toUpperCase()}`;

    if (leftY - 10 < FLOOR) {
      // Acabou a folha: nada é perdido — o benefício inteiro vai para a continuação.
      if (val) benefitOverflow.push([key, val]);
      continue;
    }
    pg.drawText(b.label, { x: MARGIN, y: leftY, size: 5.6, font: pf.manBold, color: val ? NAVY_P : EMPTY_C });
    leftY -= 8;
    if (val) {
      const lines = wrapText(val, pf.manReg, 6.2, leftW - 6);
      let used = 0;
      for (; used < lines.length && used < 2; used++) {
        if (leftY - 8 < FLOOR) break;
        pg.drawText(lines[used], { x: MARGIN + 4, y: leftY, size: 6.2, font: pf.manReg, color: INK_P });
        leftY -= 7.6;
      }
      if (used < lines.length) benefitOverflow.push([key, lines.slice(used).join(" ")]);
    } else {
      pg.drawText(EMPTY_SHORT, { x: MARGIN + 4, y: leftY, size: 6.2, font: pf.cgReg, color: EMPTY_C });
      leftY -= 7.6;
    }
    leftY -= 2;
  }

  // COLUNA DIREITA — narrativa clínica na ordem canônica, sempre completa (R2.1).
  // Correção do parecer do architect: antes, faltando espaço, o `continue` pulava
  // o drawGridLabel e o rótulo SUMIA da ficha — a grade deixava de ser invariável.
  // Agora o rótulo é SEMPRE desenhado; só o corpo do texto migra para a continuação.
  // ORÇAMENTO DE ESPAÇO POR BLOCO — garante que os 7 rótulos SEMPRE caibam.
  // Correção final do parecer do architect: reservar espaço antecipadamente é a
  // única forma de a grade ser realmente invariável. Um bloco longo não pode
  // consumir a folha e empurrar os rótulos seguintes para fora da ficha.
  const grid = narrativeGrid(sub);
  const MIN_BODY_H = 10;         // ao menos uma linha de corpo/placeholder
  const availableH = bodyTop - FLOOR;
  const perBlockH = availableH / grid.length;

  let rightY = bodyTop;
  const narrativeOverflow: Array<[string, string]> = [];
  for (let bi = 0; bi < grid.length; bi++) {
    const blk = grid[bi];
    const full = safeTxt(blk.value ?? "").trim();

    // ÂNCORA FIXA: o bloco começa SEMPRE na sua coordenada de cota, jamais em
    // função do tamanho do texto anterior. É isto que torna a grade invariável —
    // a ficha 1 e a ficha 6 têm os 7 rótulos exatamente na mesma altura da folha.
    // O corpo que não couber na cota vai para a continuação.
    const blockCeil = bodyTop - bi * perBlockH;
    rightY = blockCeil;
    const blockFloor = Math.max(FLOOR, bodyTop - (bi + 1) * perBlockH);

    // O rótulo é desenhado SEMPRE — é a âncora visual da grade (R2.1).
    rightY = drawGridLabel(pg, pf, rightX, rightY, rightW, blk.label, blk.safety);

    if (rightY - MIN_BODY_H < FLOOR) {
      // Caso extremo: nem uma linha cabe. O rótulo já está na folha; o corpo migra.
      if (full) narrativeOverflow.push([blk.label, full]);
      continue;
    }
    const r = drawGridText(pg, pf, rightX, rightY, rightW, blk.value, blockFloor);
    rightY = r.endY - 8;
    if (r.overflow) narrativeOverflow.push([blk.label, r.overflow]);
  }

  // Continuações — mesma identidade visual da ficha (R6.2)
  for (const [lbl, rem] of [...narrativeOverflow, ...benefitOverflow]) {
    if (rem.trim()) drawOverflowPage(pdfDoc, allPages, sub.name, lbl, rem, pf);
  }
}

// ── Checkpoint D: Página(s) de overflow ──────────────────────────────────────
// Recebe SOMENTE o texto que não coube na ficha (já calculado por drawSecPremium).
// Pagina automaticamente criando quantas páginas forem necessárias.
function drawOverflowPage(
  pdfDoc: PDFDocument,
  allPages: PDFPage[],
  subName: string,
  label: string,
  remainingText: string,
  pf: PremiumFonts,
): void {
  if (!remainingText?.trim()) return;

  // Quebra o texto restante usando a largura e tamanho da própria página de overflow.
  const allLines = wrapText(remainingText.trim(), pf.manReg, 7.2, CONTENT_W);
  if (allLines.length === 0) return;

  const HEADER_H = 30; // título + linha dourada
  const LINE_H = 9.8;
  const FOOTER_RESERVE = 68;
  const linesPerPage = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 - HEADER_H - FOOTER_RESERVE) / LINE_H));

  // Teto de segurança (parecer do architect): um campo do cadastro preenchido com
  // texto gigantesco geraria centenas de páginas e esgotaria memória/tempo.
  // 3 páginas por campo é folga larga para uso clínico real; o excedente é
  // sinalizado ao leitor em vez de silenciosamente descartado.
  const MAX_OVERFLOW_PAGES = 3;
  const totalPagesNeeded = Math.ceil(allLines.length / linesPerPage);
  const pagesToDraw = Math.min(totalPagesNeeded, MAX_OVERFLOW_PAGES);
  const truncated = totalPagesNeeded > MAX_OVERFLOW_PAGES;

  for (let ovpg = 0; ovpg < pagesToDraw; ovpg++) {
    const pg = newDocPage(pdfDoc, allPages);
    pg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });
    let y = PAGE_H - MARGIN;
    // Mesmo ajuste de nome da ficha-base: encolhe e, no limite, trunca.
    // Sem isso um nome extremo vazaria para fora da folha nesta página.
    let header = `${safeTxt(subName).toUpperCase()} — ${label} (cont. ${ovpg + 2})`;
    let hSize = 11;
    while (pf.cgBold.widthOfTextAtSize(header, hSize) > CONTENT_W && hSize > 7) hSize -= 0.25;
    while (header.length > 8 && pf.cgBold.widthOfTextAtSize(header, hSize) > CONTENT_W) {
      header = header.slice(0, -2) + "…";
    }
    pg.drawText(header, { x: MARGIN, y, size: hSize, font: pf.cgBold, color: NAVY_P });
    y -= 5;
    pg.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.8, color: GOLD_P });
    y -= 14;
    for (const ln of allLines.slice(ovpg * linesPerPage, (ovpg + 1) * linesPerPage)) {
      pg.drawText(ln, { x: MARGIN, y, size: 7.2, font: pf.manReg, color: INK_P });
      y -= LINE_H;
    }
    // Aviso honesto: nunca cortar texto clínico em silêncio.
    if (truncated && ovpg === pagesToDraw - 1) {
      y -= 8;
      pg.drawText(
        "Conteúdo extenso: o restante deste campo está disponível no seu prontuário. Peça ao consultório se desejar a versão completa.",
        { x: MARGIN, y, size: 6.8, font: pf.cgReg, color: EMPTY_C },
      );
    }
  }
}

/**
 * Página "LEVE ESTAS PERGUNTAS" (spec R4.3).
 * Fecha o documento com perguntas que o paciente leva à consulta — o documento
 * deixa de ser só informativo e vira instrumento de diálogo clínico.
 * As perguntas são fixas e genéricas de propósito: NÃO inventam dado clínico
 * sobre o paciente nem sobre a substância (linha vermelha da spec).
 */
function drawQuestionsPage(
  pdfDoc: PDFDocument,
  allPages: PDFPage[],
  data: ProtocolDocumentData,
  pf: PremiumFonts,
): void {
  const pg = newDocPage(pdfDoc, allPages);
  pg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });

  const BAND_H = 62;
  const bandY = PAGE_H - MARGIN - BAND_H;
  pg.drawRectangle({ x: MARGIN, y: bandY, width: CONTENT_W, height: BAND_H, color: NAVY_P });
  pg.drawRectangle({ x: MARGIN, y: PAGE_H - MARGIN - 3, width: CONTENT_W, height: 3, color: GOLD_P });
  pg.drawText("LEVE ESTAS PERGUNTAS", { x: MARGIN + 12, y: PAGE_H - MARGIN - 34, size: 22, font: pf.cgBold, color: WHITE });
  pg.drawText("PARA A SUA PRÓXIMA CONSULTA", { x: MARGIN + 12, y: bandY + 12, size: 7, font: pf.manBold, color: GOLD_P });

  let y = bandY - 30;
  const intro = `${safeTxt(data.clientName).split(" ")[0]}, este espaço é seu. Anote o que sentir ao longo do plano e leve estas perguntas ao seu médico.`;
  for (const ln of wrapText(intro, pf.manReg, 8, CONTENT_W)) {
    pg.drawText(ln, { x: MARGIN, y, size: 8, font: pf.manReg, color: INK_P });
    y -= 11;
  }
  y -= 14;

  const questions = [
    "Como vou perceber que o plano está funcionando para mim?",
    "Em quanto tempo devo esperar os primeiros sinais de resultado?",
    "O que é considerado normal sentir nos primeiros dias após cada sessão?",
    "Quais sinais devem me fazer entrar em contato imediatamente?",
    "Preciso mudar algo na alimentação, no sono ou nos treinos durante o plano?",
    "Algum medicamento ou suplemento que uso hoje interfere neste plano?",
    "O que acontece se eu precisar remarcar uma sessão?",
    "Como será feito o acompanhamento entre uma sessão e outra?",
    "Quais exames serão repetidos para medir a minha evolução?",
    "O que muda no meu plano depois que este ciclo terminar?",
  ];

  for (let i = 0; i < questions.length; i++) {
    if (y - 34 < 90) break;
    // Numeral em Cormorant — mesma âncora visual das fichas
    pg.drawText(String(i + 1).padStart(2, "0"), { x: MARGIN, y: y - 2, size: 13, font: pf.cgBold, color: GOLD_P });
    const qx = MARGIN + 26;
    const qw = CONTENT_W - 26;
    let qy = y;
    for (const ln of wrapText(questions[i], pf.manReg, 8.2, qw)) {
      pg.drawText(ln, { x: qx, y: qy, size: 8.2, font: pf.manReg, color: INK_P });
      qy -= 11;
    }
    // Linha pautada para anotação manuscrita
    qy -= 5;
    pg.drawLine({ start: { x: qx, y: qy }, end: { x: qx + qw, y: qy }, thickness: 0.4, color: LINE_P });
    y = qy - 16;
  }

  if (y > 96) {
    pg.drawText("ANOTAÇÕES", { x: MARGIN, y, size: 6, font: pf.manBold, color: GOLD_P });
    y -= 12;
    while (y > 88) {
      pg.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.4, color: LINE_P, opacity: 0.7 });
      y -= 16;
    }
  }
}

// ── Checkpoint B: Capa premium PADAXOR ────────────────────────────────────────
function drawPremiumCover(
  pdfDoc: PDFDocument,
  allPages: PDFPage[],
  data: ProtocolDocumentData,
  pf: PremiumFonts,
  symbolImg: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
): void {
  const pg = newDocPage(pdfDoc, allPages);
  pg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: NAVY_P });

  // Header
  pg.drawText(safeTxt(data.unit), { x: MARGIN, y: PAGE_H - 32, size: 8, font: pf.manBold, color: IVORY_P });
  pg.drawText(safeTxt(data.professionalName), { x: MARGIN, y: PAGE_H - 44, size: 6.5, font: pf.manReg, color: MIST_P });
  const docLbl = "CARTA DE TRATAMENTO";
  pg.drawText(docLbl, { x: PAGE_W - MARGIN - pf.manBold.widthOfTextAtSize(docLbl, 7), y: PAGE_H - 32, size: 7, font: pf.manBold, color: GOLD_P });
  pg.drawLine({ start: { x: MARGIN, y: PAGE_H - 56 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 56 }, thickness: 0.5, color: GOLD_P, opacity: 0.3 });

  // Symbol (120×90 pt, centered)
  if (symbolImg) {
    try {
      pg.drawImage(symbolImg, { x: (PAGE_W - 120) / 2, y: PAGE_H - 195, width: 120, height: 90 });
    } catch { /* best-effort */ }
  }

  // Wordmark
  const kickerTxt = "SISTEMA CLINICO INTELIGENTE";
  const kW = pf.manBold.widthOfTextAtSize(kickerTxt, 7);
  pg.drawText(kickerTxt, { x: (PAGE_W - kW) / 2, y: PAGE_H - 230, size: 7, font: pf.manBold, color: GOLD_P });

  const padaxorW = pf.cgBold.widthOfTextAtSize("PADAXOR", 42);
  pg.drawText("PADAXOR", { x: (PAGE_W - padaxorW) / 2, y: PAGE_H - 278, size: 42, font: pf.cgBold, color: WHITE });

  const cisTxt = "Clinical Intelligence System";
  const cisW = pf.manReg.widthOfTextAtSize(cisTxt, 9);
  pg.drawText(cisTxt, { x: (PAGE_W - cisW) / 2, y: PAGE_H - 303, size: 9, font: pf.manReg, color: GOLD_P });

  const sepLen = 180;
  pg.drawLine({ start: { x: (PAGE_W - sepLen) / 2, y: PAGE_H - 322 }, end: { x: (PAGE_W + sepLen) / 2, y: PAGE_H - 322 }, thickness: 0.8, color: GOLD_P, opacity: 0.5 });

  const cartaTxt = "Carta do seu protocolo de cuidado";
  const cartaW = pf.cgSemiBold.widthOfTextAtSize(cartaTxt, 13);
  pg.drawText(cartaTxt, { x: (PAGE_W - cartaW) / 2, y: PAGE_H - 346, size: 13, font: pf.cgSemiBold, color: IVORY_P });

  const expLines = wrapText("Este documento organiza as substancias, posologias e referencias do seu plano clinico personalizado.", pf.manReg, 7, 300);
  for (let i = 0; i < expLines.length; i++) {
    const lw = pf.manReg.widthOfTextAtSize(expLines[i], 7);
    pg.drawText(expLines[i], { x: (PAGE_W - lw) / 2, y: PAGE_H - 366 - i * 10, size: 7, font: pf.manReg, color: MIST_P });
  }

  // Identification grid (3 columns)
  const gridY = PAGE_H - 432;
  const colW3 = CONTENT_W / 3;
  const idCols = [
    { lbl: "PACIENTE",    val: safeTxt(data.clientName), sub: maskCpf(data.clientCpf) },
    { lbl: "PROTOCOLO",   val: safeTxt(data.protocolTitle).slice(0, 30), sub: toDateBR(data.startDate) },
    { lbl: "RESPONSAVEL", val: safeTxt(data.professionalName), sub: data.professionalCrm ? safeTxt(data.professionalCrm) : "CRM nao informado" },
  ];
  pg.drawRectangle({ x: MARGIN, y: gridY - 48, width: CONTENT_W, height: 58, color: WHITE, opacity: 0.05 });
  for (let c = 0; c < idCols.length; c++) {
    const cx = MARGIN + c * colW3;
    if (c > 0) pg.drawLine({ start: { x: cx, y: gridY + 6 }, end: { x: cx, y: gridY - 44 }, thickness: 0.4, color: GOLD_P, opacity: 0.4 });
    pg.drawText(idCols[c].lbl, { x: cx + 8, y: gridY + 4, size: 5, font: pf.manBold, color: GOLD_P });
    const v = idCols[c].val.length > 22 ? idCols[c].val.slice(0, 20) + "…" : idCols[c].val;
    pg.drawText(v, { x: cx + 8, y: gridY - 12, size: 8, font: pf.cgBold, color: IVORY_P });
    pg.drawText(safeTxt(idCols[c].sub), { x: cx + 8, y: gridY - 26, size: 6, font: pf.manReg, color: MIST_P });
  }

  // Status row
  const statY = PAGE_H - 520;
  const statCols = [
    { lbl: "SUBSTANCIAS", val: String(data.substances.length) },
    { lbl: "SESSOES PREVISTAS", val: String(data.sessions.length) },
    { lbl: "VALOR DO TRATAMENTO", val: `R$ ${data.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
  ];
  pg.drawRectangle({ x: MARGIN, y: statY - 44, width: CONTENT_W, height: 52, color: WHITE, opacity: 0.07 });
  for (let c = 0; c < statCols.length; c++) {
    const cx = MARGIN + c * colW3;
    if (c > 0) pg.drawLine({ start: { x: cx, y: statY + 6 }, end: { x: cx, y: statY - 40 }, thickness: 0.4, color: GOLD_P, opacity: 0.3 });
    pg.drawText(statCols[c].lbl, { x: cx + 8, y: statY + 4, size: 5, font: pf.manBold, color: MIST_P });
    pg.drawText(statCols[c].val, { x: cx + 8, y: statY - 20, size: 18, font: pf.cgBold, color: IVORY_P });
  }

  if (data.clientEmail) {
    const em = maskEmail(data.clientEmail);
    pg.drawText(`E-mail: ${em}`, { x: MARGIN, y: PAGE_H - 582, size: 6, font: pf.manReg, color: MIST_P, opacity: 0.7 });
  }

  const footTxt = "Documento clinico individual — PADAXOR Clinical Intelligence System — tecnologia PADCON — Pagina 1";
  pg.drawText(footTxt, { x: MARGIN, y: 22, size: 5.5, font: pf.manReg, color: MIST_P, opacity: 0.6 });
}

// ── Checkpoint B: Header e footer premium para páginas internas ───────────────
function drawPremiumHeaderBrand(page: PDFPage, pf: PremiumFonts): void {
  const nW = pf.manBold.widthOfTextAtSize("PADAXOR", 9);
  page.drawText("PADAXOR", { x: PAGE_W - MARGIN - nW, y: PAGE_H - 26, size: 9, font: pf.manBold, color: DARK_BLUE });
  const tag = "Clinical Intelligence System";
  const tW = pf.manReg.widthOfTextAtSize(tag, 6);
  page.drawText(tag, { x: PAGE_W - MARGIN - tW, y: PAGE_H - 34, size: 6, font: pf.manReg, color: GOLD_P });
}

function drawPremiumFooter(page: PDFPage, pf: PremiumFonts, pageNum: number, totalPages: number, qrImg: QrImage = null): void {
  const txt = `PADAXOR Clinical Intelligence System · tecnologia PADCON · Advanced Systems Architecture · Pagina ${pageNum} de ${totalPages}`;
  page.drawText(txt, { x: MARGIN, y: 22, size: 5.5, font: pf.manReg, color: GRAY });
  if (qrImg) {
    try {
      const qs = 20;
      page.drawImage(qrImg, { x: PAGE_W - MARGIN - qs, y: 18, width: qs, height: qs });
    } catch { /* best-effort */ }
  }
}

type PdfCertData = {
  cert: ReturnType<typeof loadCertificate>["cert"];
  certInfo: ReturnType<typeof getCertInfo>;
} | null;

// Exportada para testes unitários — monta todas as páginas de layout sem assinar.
// certData = null → página de assinatura usa fallback (nome do profissional / "—").
export async function buildProtocolDocumentLayout(
  pdfDoc: PDFDocument,
  data: ProtocolDocumentData,
  certData: PdfCertData = null,
): Promise<void> {
  const cert = certData?.cert ?? null;
  const certInfo = certData?.certInfo ?? null;

  // ── Checkpoint A: Premium fonts + assets ────────────────────────────────────
  const fb: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold:    await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const pf: PremiumFonts = await loadPremiumFonts(pdfDoc).catch(() => ({
    cgReg: fb.regular, cgBold: fb.bold, cgSemiBold: fb.bold,
    manReg: fb.regular, manBold: fb.bold,
  }));
  const [symbolImg, qrImg] = await Promise.all([
    embedPadaxorSymbol(pdfDoc),
    embedPaxterQr(pdfDoc),
  ]);

  const allPages: PDFPage[] = [];

  // ── Checkpoint B: Capa premium PADAXOR ──────────────────────────────────────
  drawPremiumCover(pdfDoc, allPages, data, pf, symbolImg);

  // ── Checkpoint C+D: Uma ficha A4 por substância + overflow interno ───────────
  // (overflow é gerenciado dentro de drawSubstancePremiumPage)
  for (let si = 0; si < data.substances.length; si++) {
    drawSubstancePremiumPage(pdfDoc, allPages, data.substances[si], si, data.substances.length, pf, fb);
  }

  // ── "Leve estas perguntas" — página de diálogo com o médico (spec R4.3) ──────
  drawQuestionsPage(pdfDoc, allPages, data, pf);

  // ── Cronograma de sessões (premium grid) ─────────────────────────────────────
  if (data.sessions.length > 0) {
    const sessColW = 30;
    const nameColW = 110;
    const maxCols = Math.max(1, Math.floor((CONTENT_W - nameColW) / sessColW));
    const sRowH = 16;

    for (let gp = 0; gp * maxCols < data.sessions.length; gp++) {
      const startS = gp * maxCols;
      const endS = Math.min(startS + maxCols, data.sessions.length);
      const colCount = endS - startS;

      let sPg = newDocPage(pdfDoc, allPages);
      sPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });
      let sy = PAGE_H - MARGIN;

      const sTitle = gp === 0 ? "CRONOGRAMA DE SESSOES" : `CRONOGRAMA DE SESSOES (cont. S${startS + 1}–S${endS})`;
      sPg.drawText(sTitle, { x: MARGIN, y: sy, size: 11, font: pf.cgBold, color: NAVY_P });
      sy -= 18;
      sPg.drawLine({ start: { x: MARGIN, y: sy }, end: { x: MARGIN + CONTENT_W, y: sy }, thickness: 1, color: GOLD_P, opacity: 0.5 });
      sy -= 18;

      if (gp === 0) {
        const fDate = toDateBR(data.sessions[0].scheduledDate);
        const lDate = toDateBR(data.sessions[data.sessions.length - 1].scheduledDate);
        sPg.drawText(`Periodo: ${fDate} a ${lDate}  |  Total: ${data.sessions.length} sessoes  |  ${data.substances.length} substancias`, {
          x: MARGIN, y: sy, size: 7, font: pf.manReg, color: INK_P,
        });
        sy -= 16;
      }

      const drawSessHead = (p: PDFPage, yh: number): number => {
        p.drawRectangle({ x: MARGIN, y: yh - sRowH + 4, width: nameColW + colCount * sessColW, height: sRowH, color: NAVY_P });
        p.drawText("SUBSTANCIA", { x: MARGIN + 4, y: yh - 8, size: 5.5, font: pf.manBold, color: WHITE });
        for (let s = 0; s < colCount; s++) {
          const sess = data.sessions[startS + s];
          const sx = MARGIN + nameColW + s * sessColW;
          p.drawText(`S${startS + s + 1}`, { x: sx + 2, y: yh - 7, size: 5.5, font: pf.manBold, color: WHITE });
          p.drawText(toDateBR(sess.scheduledDate).slice(0, 5), { x: sx + 1, y: yh - 13, size: 4.5, font: pf.manReg, color: MIST_P });
        }
        return yh - sRowH;
      };

      sy = drawSessHead(sPg, sy);
      let szebra = false;
      for (const sub of data.substances) {
        if (sy < MARGIN + 40) {
          sPg = newDocPage(pdfDoc, allPages);
          sPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });
          sy = PAGE_H - MARGIN;
          sy = drawSessHead(sPg, sy);
          szebra = false;
        }
        if (szebra) sPg.drawRectangle({ x: MARGIN, y: sy - sRowH + 4, width: nameColW + colCount * sessColW, height: sRowH, color: MIST_P, opacity: 0.35 });
        szebra = !szebra;
        const sCol = getSubstanceColor(sub.color);
        sPg.drawCircle({ x: MARGIN + 5, y: sy - 6, size: 3, color: sCol });
        const nm = safeTxt(sub.name);
        sPg.drawText(nm.length > 15 ? nm.slice(0, 14) + "." : nm, { x: MARGIN + 12, y: sy - 8, size: 6, font: pf.manReg, color: INK_P });
        for (let s = 0; s < colCount; s++) {
          const sess = data.sessions[startS + s];
          const sx2 = MARGIN + nameColW + s * sessColW;
          const ss = sess.substanceStatuses.find(x => x.substanceName === sub.name);
          if (ss) {
            const applied = ss.status === "applied";
            sPg.drawRectangle({ x: sx2 + 1, y: sy - sRowH + 5, width: sessColW - 2, height: sRowH - 2, color: sCol, opacity: applied ? 0.8 : 0.2 });
            const sn = String(ss.sessionNumber);
            const snW = (applied ? pf.manBold : pf.manReg).widthOfTextAtSize(sn, 6);
            sPg.drawText(sn, { x: sx2 + (sessColW - snW) / 2, y: sy - 8, size: 6, font: applied ? pf.manBold : pf.manReg, color: applied ? WHITE : INK_P });
          }
        }
        sPg.drawLine({ start: { x: MARGIN, y: sy - sRowH + 4 }, end: { x: MARGIN + nameColW + colCount * sessColW, y: sy - sRowH + 4 }, thickness: 0.2, color: LINE_P });
        sy -= sRowH;
      }
      sy -= 10;
      sPg.drawText("Celula forte = aplicado  |  Celula leve = agendado  |  Numero = sessao da substancia", {
        x: MARGIN, y: sy, size: 6, font: pf.manReg, color: GRAY,
      });
    }
  }

  // ── Resumo financeiro ─────────────────────────────────────────────────────────
  {
    let finPg = newDocPage(pdfDoc, allPages);
    finPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });
    let fy = PAGE_H - MARGIN;
    finPg.drawText("RESUMO FINANCEIRO", { x: MARGIN, y: fy, size: 11, font: pf.cgBold, color: NAVY_P });
    fy -= 18;
    finPg.drawLine({ start: { x: MARGIN, y: fy }, end: { x: MARGIN + CONTENT_W, y: fy }, thickness: 1, color: GOLD_P, opacity: 0.5 });
    fy -= 22;
    finPg.drawText("VALOR TOTAL DO PROTOCOLO", { x: MARGIN, y: fy, size: 7, font: pf.manBold, color: INK_P });
    fy -= 14;
    finPg.drawText(`R$ ${data.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, { x: MARGIN, y: fy, size: 22, font: pf.cgBold, color: NAVY_P });
    fy -= 32;
    finPg.drawLine({ start: { x: MARGIN, y: fy }, end: { x: MARGIN + CONTENT_W, y: fy }, thickness: 0.4, color: LINE_P });
    fy -= 18;

    finPg.drawText("COMPOSICAO DO PROTOCOLO", { x: MARGIN, y: fy, size: 8, font: pf.manBold, color: INK_P });
    fy -= 16;
    // Columns: Substância | Dose | Sessoes | Via | Intervalo | Valor/sessao | Total substância
    const subCols = ["Substancia", "Dose", "Sessoes", "Via", "Intervalo", "Vl/sessao", "Total"];
    const subWidths = [122, 68, 46, 60, 46, 66, 62];
    const fRowH = 15;
    finPg.drawRectangle({ x: MARGIN, y: fy - fRowH + 4, width: CONTENT_W, height: fRowH, color: NAVY_P });
    let ftx = MARGIN;
    for (let c = 0; c < subCols.length; c++) {
      finPg.drawText(subCols[c], { x: ftx + 4, y: fy - 7, size: 6, font: pf.manBold, color: WHITE });
      ftx += subWidths[c];
    }
    fy -= fRowH;
    let fzebra = false;
    for (const sub of data.substances) {
      if (fy < MARGIN + 30) { finPg = newDocPage(pdfDoc, allPages); finPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P }); fy = PAGE_H - MARGIN; }
      if (fzebra) finPg.drawRectangle({ x: MARGIN, y: fy - fRowH + 4, width: CONTENT_W, height: fRowH, color: MIST_P, opacity: 0.4 });
      fzebra = !fzebra;
      const cleanD = safeTxt(sub.dose).replace(/\s*\/\s*\d+[\.,]?\d*\s*(ml|mL|ML)/gi, "").trim();
      const unitPr = sub.unitPrice ?? 0;
      const subTotal = unitPr * sub.totalSessions;
      const fmtUnit = unitPr > 0 ? `R$ ${unitPr.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-";
      const fmtTot  = subTotal > 0 ? `R$ ${subTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-";
      const fVals = [
        safeTxt(sub.name), cleanD, `${sub.totalSessions}`,
        procTypeLabel(sub.procedureType).split("(")[0].trim(),
        `${sub.intervalDays}d`, fmtUnit, fmtTot,
      ];
      ftx = MARGIN;
      for (let c = 0; c < fVals.length; c++) {
        const v = fVals[c].length > 17 ? fVals[c].slice(0, 15) + ".." : fVals[c];
        finPg.drawText(v, { x: ftx + 4, y: fy - 7, size: 6.2, font: pf.manReg, color: INK_P });
        ftx += subWidths[c];
      }
      finPg.drawLine({ start: { x: MARGIN, y: fy - fRowH + 4 }, end: { x: MARGIN + CONTENT_W, y: fy - fRowH + 4 }, thickness: 0.2, color: LINE_P });
      fy -= fRowH;
    }
    fy -= 20;

    if (data.payments.length > 0) {
      if (fy < MARGIN + 80) { finPg = newDocPage(pdfDoc, allPages); finPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P }); fy = PAGE_H - MARGIN; }
      finPg.drawText("HISTORICO DE PAGAMENTOS", { x: MARGIN, y: fy, size: 8, font: pf.manBold, color: INK_P });
      fy -= 16;
      // Coluna "Cartão" dedicada — cardLabel preservado por inteiro via fonte adaptativa (sem truncamento)
      const payCols   = ["Valor", "Metodo",  "Cartao/Final", "Status",    "Vencimento", "Pago em"];
      const payWidths = [80,      76,         90,             56,          68,           60];
      finPg.drawRectangle({ x: MARGIN, y: fy - fRowH + 4, width: CONTENT_W, height: fRowH, color: NAVY_P });
      ftx = MARGIN;
      for (let c = 0; c < payCols.length; c++) {
        finPg.drawText(payCols[c], { x: ftx + 4, y: fy - 7, size: 6, font: pf.manBold, color: WHITE });
        ftx += payWidths[c];
      }
      fy -= fRowH;
      // Rótulos curtos de método — cardLabel fica na coluna própria, sem concatenação
      const shortMethod = (m: string): string => {
        const sm: Record<string, string> = {
          credit_card: "Credito", debit_card: "Debito", pix: "Pix",
          cash: "Dinheiro", bank_slip: "Boleto", bank_transfer: "Transf.",
        };
        return sm[m] ?? safeTxt(m).slice(0, 10);
      };
      let pzebra = false;
      for (const pay of data.payments) {
        if (fy < MARGIN + 30) { finPg = newDocPage(pdfDoc, allPages); finPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P }); fy = PAGE_H - MARGIN; }
        if (pzebra) finPg.drawRectangle({ x: MARGIN, y: fy - fRowH + 4, width: CONTENT_W, height: fRowH, color: MIST_P, opacity: 0.4 });
        pzebra = !pzebra;
        const statusLbl = pay.status === "paid" ? "Pago" : pay.status === "pending" ? "Pendente" : pay.status;
        // cardCol: texto completo sem slice — fonte ajustada para caber na coluna
        const cardCol = pay.cardLabel ? safeTxt(pay.cardLabel) : "\u2014";
        const pVals = [
          `R$ ${pay.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          shortMethod(pay.method), cardCol, statusLbl,
          pay.dueDate ? toDateBR(pay.dueDate) : "-",
          pay.paidAt  ? toDateBR(pay.paidAt)  : "-",
        ];
        ftx = MARGIN;
        for (let c = 0; c < pVals.length; c++) {
          if (c === 2) {
            // Coluna Cartão/Final: nunca truncar — encolher fonte até caber (mín 4.5pt)
            let cardSz = 6.5;
            while (cardSz > 4.5 && pf.manReg.widthOfTextAtSize(pVals[c], cardSz) > payWidths[c] - 6) {
              cardSz -= 0.5;
            }
            finPg.drawText(pVals[c], { x: ftx + 4, y: fy - 7, size: cardSz, font: pf.manReg, color: INK_P });
          } else {
            const v = pVals[c].length > 16 ? pVals[c].slice(0, 14) + ".." : pVals[c];
            finPg.drawText(v, { x: ftx + 4, y: fy - 7, size: 6.5, font: pf.manReg, color: INK_P });
          }
          ftx += payWidths[c];
        }
        finPg.drawLine({ start: { x: MARGIN, y: fy - fRowH + 4 }, end: { x: MARGIN + CONTENT_W, y: fy - fRowH + 4 }, thickness: 0.2, color: LINE_P });
        fy -= fRowH;
      }
      fy -= 14;
    }

    // Saldo SEMPRE renderizado — mesmo protocolo sem histórico de cobranças
    {
      const totalPaid = data.payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
      const saldoDevedor = Math.max(0, data.totalValue - totalPaid);
      if (fy < MARGIN + 30) { finPg = newDocPage(pdfDoc, allPages); finPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P }); fy = PAGE_H - MARGIN; }
      finPg.drawText(
        `Total Pago: R$ ${totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}   |   Saldo Devedor: R$ ${saldoDevedor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}   |   Total Protocolo: R$ ${data.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        { x: MARGIN, y: fy, size: 8, font: pf.manBold, color: NAVY_P },
      );
    }
  }

  // ── TCLE ──────────────────────────────────────────────────────────────────────
  {
    const procTypes = [...new Set(data.substances.map(s => s.procedureType))];
    let tcPg = newDocPage(pdfDoc, allPages);
    tcPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });
    let ty = PAGE_H - MARGIN;
    tcPg.drawText("TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)", { x: MARGIN, y: ty, size: 10, font: pf.cgBold, color: NAVY_P });
    ty -= 18;
    tcPg.drawLine({ start: { x: MARGIN, y: ty }, end: { x: MARGIN + CONTENT_W, y: ty }, thickness: 0.8, color: GOLD_P, opacity: 0.5 });
    ty -= 16;

    const substNames = data.substances.map(s => safeTxt(s.name)).join(", ");
    const tcSecs: Array<{ t: string; txt: string }> = [
      { t: "1. IDENTIFICACAO", txt: `Eu, ${safeTxt(data.clientName)}, portador(a) do CPF ${data.clientCpf}, declaro que fui informado(a) pelo(a) profissional ${safeTxt(data.professionalName)}${data.professionalCrm ? ` (${data.professionalCrm})` : ""} sobre os procedimentos a serem realizados na unidade ${safeTxt(data.unit)} com inicio em ${toDateBR(data.startDate)}.` },
      { t: "2. PROCEDIMENTOS AUTORIZADOS", txt: `Autorizo a administracao das seguintes substancias: ${substNames}. Os procedimentos injetaveis podem incluir aplicacoes por via endovenosa (IV), intramuscular (IM), subcutanea (SC) e/ou implante, conforme indicacao clinica individualizada.` },
      { t: "3. FINALIDADE TERAPEUTICA", txt: "Os procedimentos tem por finalidade suplementacao de micronutrientes, modulacao bioquimica, terapia antioxidante e/ou outra indicacao clinica conforme avaliacao profissional. Os resultados podem variar de pessoa para pessoa e dependem de fatores individuais como metabolismo, estilo de vida e adesao ao protocolo." },
      { t: "4. RISCOS E EFEITOS ADVERSOS", txt: "Fui informado(a) sobre possiveis efeitos adversos, incluindo: dor e/ou hematoma no local da aplicacao, reacoes alergicas, rubor facial, cefaleia, nausea, hipotensao transitoria e, em casos raros, reacoes anafilaticas. Declaro ter informado sobre alergias, medicamentos em uso, condicoes pre-existentes e gestacao/amamentacao." },
      { t: "5. CONTRAINDICACOES", txt: "Declaro ter respondido com veracidade sobre: gestacao ou suspeita de gravidez; amamentacao; uso de anticoagulantes; doencas renais, hepaticas ou cardiacas; alergias conhecidas; uso de suplementos e fitoterapicos; e quaisquer condicoes que possam afetar a seguranca do procedimento." },
    ];
    if (procTypes.includes("iv"))      tcSecs.push({ t: `${tcSecs.length + 1}. VIA ENDOVENOSA (IV)`,     txt: "Autorizo procedimentos por via endovenosa. Fui informado(a) que infusoes IV requerem acesso venoso periferico, podendo ocorrer dor no local da puncao, hematoma, flebite e, raramente, infiltracao. No caso de Vitamina C IV em alta dose (>10g) declaro ciencia da necessidade de dosagem previa de G6PD." });
    if (procTypes.includes("im"))      tcSecs.push({ t: `${tcSecs.length + 1}. VIA INTRAMUSCULAR (IM)`,  txt: "Autorizo procedimentos por via intramuscular. Estou ciente de que aplicacoes IM podem causar dor local, hematoma, nodulacao transitoria e, em raros casos, lesao nervosa periferica." });
    if (procTypes.includes("sc"))      tcSecs.push({ t: `${tcSecs.length + 1}. VIA SUBCUTANEA (SC)`,      txt: "Autorizo procedimentos por via subcutanea. Estou ciente de que aplicacoes SC podem causar dor local, hematoma, nodulacao transitoria e reacao no local de injecao. A absorcao gradual e proposital e caracteristica desta via de administracao." });
    if (procTypes.includes("implant")) tcSecs.push({ t: `${tcSecs.length + 1}. IMPLANTE SUBCUTANEO`,      txt: "Autorizo a realizacao de implante subcutaneo. Estou ciente dos riscos: necessidade de pequeno procedimento cirurgico, possibilidade de infeccao local, extrusao do implante, formacao de cicatriz e necessidade de retorno para remocao ao final do periodo terapeutico." });
    tcSecs.push({ t: `${tcSecs.length + 1}. LGPD`, txt: "Autorizo a coleta, armazenamento e processamento dos meus dados pessoais e dados sensiveis de saude para fins exclusivos de execucao do protocolo terapeutico, emissao de documentos clinicos e acompanhamento da evolucao clinica, conforme a Lei n. 13.709/2018 (LGPD)." });
    tcSecs.push({ t: `${tcSecs.length + 1}. DECLARACAO FINAL`, txt: "Declaro ter lido e compreendido integralmente o presente termo. Tive a oportunidade de esclarecer todas as minhas duvidas antes de assinar. Autorizo livremente a realizacao dos procedimentos descritos neste protocolo." });

    for (const sec of tcSecs) {
      if (ty < MARGIN + 90) {
        tcPg = newDocPage(pdfDoc, allPages);
        tcPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });
        ty = PAGE_H - MARGIN;
        tcPg.drawText("TCLE (CONTINUACAO)", { x: MARGIN, y: ty, size: 8, font: pf.manBold, color: NAVY_P });
        ty -= 18;
      }
      tcPg.drawText(sec.t, { x: MARGIN, y: ty, size: 8.5, font: pf.manBold, color: NAVY_P });
      ty -= 13;
      for (const ln of wrapText(sec.txt, pf.manReg, 8, CONTENT_W)) {
        if (ty < MARGIN + 50) {
          tcPg = newDocPage(pdfDoc, allPages);
          tcPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });
          ty = PAGE_H - MARGIN;
        }
        tcPg.drawText(ln, { x: MARGIN, y: ty, size: 8, font: pf.manReg, color: INK_P });
        ty -= 11;
      }
      ty -= 7;
    }

    if (ty > MARGIN + 80) {
      ty -= 16;
      const swTcle = CONTENT_W / 2 - 20;
      tcPg.drawLine({ start: { x: MARGIN, y: ty }, end: { x: MARGIN + swTcle, y: ty }, thickness: 0.8, color: NAVY_P });
      tcPg.drawText("Assinatura do Cliente", { x: MARGIN + 5, y: ty - 12, size: 7, font: pf.manReg, color: GRAY });
      tcPg.drawText(safeTxt(data.clientName), { x: MARGIN + 5, y: ty - 22, size: 8, font: pf.cgBold, color: INK_P });
      tcPg.drawText(`CPF: ${data.clientCpf}`, { x: MARGIN + 5, y: ty - 32, size: 6.5, font: pf.manReg, color: GRAY });
      const dtX = MARGIN + swTcle + 40;
      tcPg.drawLine({ start: { x: dtX, y: ty }, end: { x: dtX + swTcle, y: ty }, thickness: 0.8, color: NAVY_P });
      tcPg.drawText("Data", { x: dtX + 4, y: ty - 12, size: 7, font: pf.manReg, color: GRAY });
    }
  }

  // ── Página de assinatura digital ──────────────────────────────────────────────
  {
    const sgPg = newDocPage(pdfDoc, allPages);
    sgPg.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: IVORY_P });
    let gy = PAGE_H - MARGIN;
    sgPg.drawText("ASSINATURA DIGITAL ICP-BRASIL", { x: MARGIN, y: gy, size: 11, font: pf.cgBold, color: NAVY_P });
    gy -= 18;
    sgPg.drawLine({ start: { x: MARGIN, y: gy }, end: { x: MARGIN + CONTENT_W, y: gy }, thickness: 1, color: GOLD_P, opacity: 0.5 });
    gy -= 20;

    sgPg.drawRectangle({ x: MARGIN, y: gy - 82, width: CONTENT_W, height: 90, borderColor: NAVY_P, borderWidth: 1, color: IVORY_P });
    sgPg.drawText("DOCUMENTO ASSINADO DIGITALMENTE", { x: MARGIN + 12, y: gy - 4, size: 9, font: pf.manBold, color: NAVY_P });
    const cnDoc = cert?.subject.getField("CN") ?? null;
    const signName = cnDoc?.value ? String(cnDoc.value) : safeTxt(data.professionalName);
    const signDetails = [
      `Assinante: ${safeTxt(signName)}`,
      `CPF: ${certInfo?.cpf ?? "-"}`,
      `Emissor: ${cert ? safeTxt(String(cert.issuer.getField("CN")?.value ?? "ICP-Brasil")) : "\u2014"}`,
      `Serial: ${cert ? cert.serialNumber.toUpperCase().slice(0, 40) : "\u2014"}`,
      `Valido: ${certInfo ? `${new Date(certInfo.validFrom).toLocaleDateString("pt-BR")} a ${new Date(certInfo.validTo).toLocaleDateString("pt-BR")}` : "\u2014"}`,
      `Assinado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    ];
    for (let i = 0; i < signDetails.length; i++) {
      sgPg.drawText(signDetails[i], { x: MARGIN + 12, y: gy - 18 - i * 12, size: 8, font: pf.manReg, color: NAVY_P });
    }
    gy -= 110;
    gy -= 20;
    const swSig = CONTENT_W / 3 - 10;
    const signers = [
      { label: "Assinatura do Profissional", name: safeTxt(data.professionalName), extra: data.professionalCrm },
      { label: "Assinatura do Cliente",      name: safeTxt(data.clientName),        extra: `CPF: ${data.clientCpf}` },
      { label: "Data",                       name: toDateBR(data.startDate),         extra: null },
    ];
    for (let i = 0; i < signers.length; i++) {
      const bx = MARGIN + i * (swSig + 15);
      sgPg.drawLine({ start: { x: bx, y: gy }, end: { x: bx + swSig, y: gy }, thickness: 0.8, color: NAVY_P });
      const lW = pf.manReg.widthOfTextAtSize(signers[i].label, 7);
      sgPg.drawText(signers[i].label, { x: bx + (swSig - lW) / 2, y: gy - 12, size: 7, font: pf.manReg, color: GRAY });
      const nW2 = pf.manBold.widthOfTextAtSize(signers[i].name, 8);
      sgPg.drawText(signers[i].name, { x: bx + (swSig - nW2) / 2, y: gy - 23, size: 8, font: pf.manBold, color: INK_P });
      if (signers[i].extra) {
        const eW = pf.manReg.widthOfTextAtSize(signers[i].extra!, 7);
        sgPg.drawText(signers[i].extra!, { x: bx + (swSig - eW) / 2, y: gy - 33, size: 7, font: pf.manReg, color: GRAY });
      }
    }
    gy -= 60;
    sgPg.drawLine({ start: { x: MARGIN, y: gy }, end: { x: MARGIN + CONTENT_W, y: gy }, thickness: 0.4, color: LINE_P });
    gy -= 14;
    sgPg.drawText("Este documento foi gerado e assinado digitalmente pelo sistema PADAXOR.", { x: MARGIN, y: gy, size: 7.5, font: pf.manReg, color: GRAY });
    gy -= 12;
    sgPg.drawText("A assinatura digital ICP-Brasil confere validade juridica ao documento (MP 2.200-2/2001).", { x: MARGIN, y: gy, size: 7.5, font: pf.manReg, color: GRAY });
  }

  // ── Header + footer premium em todas as páginas internas (pula capa) ──────────
  for (let i = 0; i < allPages.length; i++) {
    if (i === 0) continue;
    drawPremiumHeaderBrand(allPages[i], pf);
    drawPremiumFooter(allPages[i], pf, i + 1, allPages.length, qrImg);
  }
}

// Wrapper público: carrega cert → monta layout → assina com PAdES.
export async function generateProtocolDocumentPdf(data: ProtocolDocumentData): Promise<{ pdfBytes: Uint8Array; certInfo: any }> {
  const certInfo = getCertInfo();
  const { cert } = loadCertificate();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Protocolo ${data.protocolTitle} — ${data.clientName}`);
  pdfDoc.setAuthor("Instituto Padua — PADAXOR");
  pdfDoc.setSubject("Carta de Tratamento Premium PADAXOR");
  pdfDoc.setCreator("Sistema PADAXOR");

  await buildProtocolDocumentLayout(pdfDoc, data, { cert, certInfo });

  // ── PAdES (embedPadesSignature intacta — nunca tocar) ──────────────────────
  const cnAttrFin = cert.subject.getField("CN");
  const sName = cnAttrFin?.value ? String(cnAttrFin.value) : data.professionalName;

  const pdfBytes = await embedPadesSignature(pdfDoc, {
    name: sName,
    reason: "Assinatura digital do protocolo (ICP-Brasil)",
    location: data.unit || "Instituto Padua",
    contactInfo: data.clientCpf || "",
  });

  return {
    pdfBytes,
    certInfo: { ...certInfo, signerName: sName },
  };
}

export { getCertInfo, loadCertificate, embedPadesSignature };
