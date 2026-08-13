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

function getSubstanceColor(color: string): ReturnType<typeof rgb> {
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
  const footerText = `Instituto Padua · Paxter - desenvolvido pela Padcon · Advanced Systems Architecture | Protocolo Medico Personalizado | Pagina ${pageNum} de ${totalPages}`;
  page.drawText(footerText, { x: MARGIN, y: 18, size: 6, font: fonts.regular, color: GRAY });
  drawRubricLine(page, fonts, clientName);
}

// Cabecalho de marca no CANTO SUPERIOR DIREITO das paginas de conteudo do
// documento emitido: PAXTER + sua frase em ingles (regra do CEO 23/06/2026).
// A capa (pagina 0) ja traz a marca grande, entao este header vai da pagina 2
// em diante. PADCON + frase em ingles fica no RODAPE (drawDocFooter).
function drawDocHeaderBrand(page: PDFPage, fonts: Fonts) {
  const tag = "Clinical Intelligence System";
  const nameW = fonts.bold.widthOfTextAtSize("PAXTER", 9);
  const tagW = fonts.regular.widthOfTextAtSize(tag, 6);
  page.drawText("PAXTER", { x: PAGE_W - MARGIN - nameW, y: PAGE_H - 26, size: 9, font: fonts.bold, color: PETROL });
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
    { label: "Energia",        bodyKeys: ["metabolismo","cardiovascular","performance_fisica"],       benefitKeys: ["energyBenefit","physicalPerformance"] },
    { label: "Clareza Mental", bodyKeys: ["neurocognicao","neurologico"],                             benefitKeys: ["mentalClarity"] },
    { label: "Imunidade",      bodyKeys: ["imunologico","hematologico"],                              benefitKeys: ["immuneSupport"] },
    { label: "Ossos/Joints",   bodyKeys: ["osteoarticular"],                                         benefitKeys: [] },
    { label: "Forca Muscular", bodyKeys: ["muscular","muscular_hipertrofia"],                        benefitKeys: ["muscleStrength"] },
    { label: "Metabolismo",    bodyKeys: ["endocrino","hepatico","renal"],                           benefitKeys: ["longevityBenefit"] },
    { label: "Longevidade",    bodyKeys: ["longevidade","libido_sexual","dermatologico"],            benefitKeys: ["qualityOfLifeImpact","libidoBenefit","skinHairNails"] },
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

  // 4. Filled data polygon
  const dataPts = dims.map((d, i) => ptR(i, (Math.min(3, Math.max(0, d.value)) / 3) * radius));
  const pathParts = dataPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  pathParts.push("Z");
  try {
    page.drawSvgPath(pathParts.join(" "), {
      x: 0, y: 0,
      color: FILL_C,
      opacity: 0.45,
      borderColor: STROKE_C,
      borderWidth: 1.5,
      borderOpacity: 0.9,
    });
  } catch {
    for (let i = 0; i < n; i++) {
      page.drawLine({ start: dataPts[i], end: dataPts[(i + 1) % n], thickness: 1.5, color: STROKE_C, opacity: 0.9 });
    }
  }

  // 5. Data point dots
  for (const p of dataPts) {
    page.drawCircle({ x: p.x, y: p.y, size: 3.5, color: STROKE_C });
  }

  // 6. Axis labels — positioned beyond outer ring with smart horizontal alignment
  const LABEL_PAD = 20;
  for (let i = 0; i < n; i++) {
    const a = ang(i);
    const lx = cx + (radius + LABEL_PAD) * Math.cos(a);
    const ly = cy + (radius + LABEL_PAD) * Math.sin(a);
    const label = safeTxt(dims[i].label);
    const lw = fonts.bold.widthOfTextAtSize(label, 7);
    const cosA = Math.cos(a);
    let ax = lx - lw / 2;
    if (cosA > 0.55) ax = lx + 3;
    else if (cosA < -0.55) ax = lx - lw - 3;
    page.drawText(label, { x: ax, y: ly - 3.5, size: 7, font: fonts.bold, color: LBL_C });
  }
}

// ── fim radar ────────────────────────────────────────────────────────────────

export async function generateProtocolDocumentPdf(data: ProtocolDocumentData): Promise<{ pdfBytes: Uint8Array; certInfo: any }> {
  const certInfo = getCertInfo();
  const { cert } = loadCertificate();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Protocolo ${data.protocolTitle} - ${data.clientName}`);
  pdfDoc.setAuthor("Instituto Padua - Paxter");
  pdfDoc.setSubject("Protocolo Medico Personalizado");
  pdfDoc.setCreator("Sistema Paxter");

  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  const allPages: PDFPage[] = [];

  // ============================================================
  // PAGE 1: COVER PAGE
  // ============================================================
  {
    const page = newDocPage(pdfDoc, allPages);

    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COVER_BG });

    page.drawRectangle({ x: MARGIN - 10, y: PAGE_H - 160, width: CONTENT_W + 20, height: 3, color: GOLD_ACCENT });

    page.drawText("PAXTER", { x: MARGIN, y: PAGE_H - 100, size: 36, font: fonts.bold, color: WHITE });
    page.drawText("Clinical Intelligence System", { x: MARGIN, y: PAGE_H - 125, size: 14, font: fonts.regular, color: GOLD_ACCENT });

    page.drawRectangle({ x: MARGIN - 10, y: PAGE_H - 175, width: CONTENT_W + 20, height: 1, color: rgb(1, 1, 1, 0.2) });

    let y = PAGE_H - 230;
    page.drawText("PROTOCOLO MEDICO PERSONALIZADO", { x: MARGIN, y, size: 18, font: fonts.bold, color: WHITE });
    y -= 35;

    page.drawText(safeTxt(data.protocolTitle).toUpperCase(), { x: MARGIN, y, size: 22, font: fonts.bold, color: GOLD_ACCENT });
    y -= 50;

    page.drawRectangle({ x: MARGIN, y: y - 5, width: CONTENT_W, height: 1, color: rgb(1, 1, 1, 0.15) });
    y -= 30;

    const coverFields = [
      { label: "CLIENTE", value: data.clientName },
      { label: "CPF", value: data.clientCpf },
      { label: "E-MAIL", value: data.clientEmail },
      { label: "TELEFONE", value: data.clientPhone ?? "-" },
      { label: "MEDICO RESPONSAVEL", value: `${data.professionalName}${data.professionalCrm ? ` (${data.professionalCrm})` : ""}` },
      { label: "UNIDADE", value: data.unit },
      { label: "ATENDIMENTO", value: data.serviceType === "homecare" ? "NURSE CARE DOMICILIAR" : "CLINICA" },
      { label: "INICIO DO PROTOCOLO", value: toDateBR(data.startDate) },
      { label: "TOTAL DE SESSOES", value: `${data.sessions.length} sessoes` },
      { label: "SUBSTANCIAS", value: `${data.substances.length} substancias` },
    ];

    for (const f of coverFields) {
      page.drawText(f.label, { x: MARGIN, y, size: 7, font: fonts.regular, color: rgb(0.6, 0.7, 0.7) });
      page.drawText(safeTxt(f.value), { x: MARGIN + 160, y, size: 9, font: fonts.bold, color: WHITE });
      y -= 18;
    }

    y -= 30;
    page.drawRectangle({ x: MARGIN, y: y - 5, width: CONTENT_W, height: 1, color: rgb(1, 1, 1, 0.15) });
    y -= 25;

    const totalFormatted = `R$ ${data.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    page.drawText("VALOR DO PROTOCOLO", { x: MARGIN, y, size: 8, font: fonts.regular, color: rgb(0.6, 0.7, 0.7) });
    page.drawText(totalFormatted, { x: MARGIN + 160, y, size: 14, font: fonts.bold, color: GOLD_ACCENT });

    page.drawText("Desenvolvido pela Padcon · Paxter", { x: MARGIN, y: 50, size: 7, font: fonts.regular, color: rgb(0.4, 0.5, 0.5) });
    page.drawText(`${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { x: MARGIN, y: 38, size: 7, font: fonts.regular, color: rgb(0.4, 0.5, 0.5) });
  }

  // ============================================================
  // PAGE 2: BENEFITS MATRIX
  // ============================================================
  {
    let currentPage = newDocPage(pdfDoc, allPages);
    let y = PAGE_H - MARGIN;

    const benefitCols = [
      { key: "longevityBenefit", label: "LONGEV.", color: rgb(0.45, 0.30, 0.60) },
      { key: "energyBenefit", label: "ENERGIA", color: rgb(0.85, 0.55, 0.15) },
      { key: "sleepBenefit", label: "SONO", color: rgb(0.25, 0.40, 0.70) },
      { key: "libidoBenefit", label: "LIBIDO", color: rgb(0.80, 0.25, 0.40) },
      { key: "mentalClarity", label: "MENTE", color: rgb(0.20, 0.55, 0.65) },
      { key: "immuneSupport", label: "IMUNE", color: rgb(0.15, 0.60, 0.35) },
      { key: "physicalPerformance", label: "PERFORM.", color: rgb(0.60, 0.40, 0.15) },
      { key: "muscleStrength", label: "MUSCULO", color: rgb(0.30, 0.45, 0.50) },
      { key: "skinHairNails", label: "PELE", color: rgb(0.85, 0.50, 0.40) },
    ];

    const nameColW = 116;
    const starsColW = 80;
    const benefitColW = (CONTENT_W - nameColW - starsColW) / benefitCols.length;
    const rowH = 20;

    const has = (sub: ProtocolDocSubstance, key: string): boolean => {
      const v = (sub as Record<string, unknown>)[key];
      return v !== undefined && v !== null && String(v).trim() !== "";
    };

    function drawBenefitHeader(pg: PDFPage, yPos: number, isFirst: boolean): number {
      yPos = drawSectionHeader(pg, fonts, yPos, isFirst ? "MAPA DE BENEFICIOS POR SUBSTANCIA" : "MAPA DE BENEFICIOS (CONT.)");
      yPos -= 5;
      pg.drawRectangle({ x: MARGIN, y: yPos - rowH + 5, width: CONTENT_W, height: rowH, color: PETROL });
      pg.drawText("SUBSTANCIA", { x: MARGIN + 6, y: yPos - 9, size: 6.5, font: fonts.bold, color: WHITE });
      pg.drawText("AVALIACAO", { x: MARGIN + nameColW + 2, y: yPos - 9, size: 6.5, font: fonts.bold, color: WHITE });
      for (let c = 0; c < benefitCols.length; c++) {
        const bx = MARGIN + nameColW + starsColW + c * benefitColW;
        const lblW = fonts.bold.widthOfTextAtSize(benefitCols[c].label, 5);
        pg.drawText(benefitCols[c].label, { x: bx + (benefitColW - lblW) / 2, y: yPos - 9, size: 5, font: fonts.bold, color: WHITE });
      }
      return yPos - rowH;
    }

    y = drawBenefitHeader(currentPage, y, true);

    let zebra = false;
    for (const sub of data.substances) {
      if (y < MARGIN + 70) {
        currentPage = newDocPage(pdfDoc, allPages);
        y = PAGE_H - MARGIN;
        y = drawBenefitHeader(currentPage, y, false);
      }

      if (zebra) {
        currentPage.drawRectangle({ x: MARGIN, y: y - rowH + 5, width: CONTENT_W, height: rowH, color: PETROL_LIGHT, opacity: 0.45 });
      }
      zebra = !zebra;

      const subColor = getSubstanceColor(sub.color);
      currentPage.drawCircle({ x: MARGIN + 7, y: y - 6, size: 4, color: subColor });
      const nm = safeTxt(sub.name).length > 18 ? safeTxt(sub.name).slice(0, 17) + "." : safeTxt(sub.name);
      currentPage.drawText(nm, { x: MARGIN + 16, y: y - 8, size: 7, font: fonts.bold, color: BLACK });

      if (sub.starRating !== undefined) {
        drawStars(currentPage, MARGIN + nameColW + 2, y - 10, sub.starRating, 5);
      }

      for (let c = 0; c < benefitCols.length; c++) {
        const bx = MARGIN + nameColW + starsColW + c * benefitColW + benefitColW / 2;
        if (has(sub, benefitCols[c].key)) {
          currentPage.drawCircle({ x: bx, y: y - 6, size: 4, color: benefitCols[c].color });
        } else {
          currentPage.drawCircle({ x: bx, y: y - 6, size: 3.5, borderColor: LIGHT_GRAY, borderWidth: 0.8, color: WHITE });
        }
      }

      currentPage.drawLine({ start: { x: MARGIN, y: y - rowH + 5 }, end: { x: MARGIN + CONTENT_W, y: y - rowH + 5 }, thickness: 0.3, color: LIGHT_GRAY });
      y -= rowH;
    }

    y -= 16;
    if (y < MARGIN + 30) {
      currentPage = newDocPage(pdfDoc, allPages);
      y = PAGE_H - MARGIN;
    }
    currentPage.drawText("Legenda: circulo colorido = beneficio presente nesta dimensao | circulo vazio = nao se aplica.", {
      x: MARGIN, y, size: 6.5, font: fonts.regular, color: GRAY,
    });
    y -= 11;
    currentPage.drawText("Estrelas = avaliacao geral de eficacia (1 a 5). Veja a ficha de cada substancia para o impacto por sistema.", {
      x: MARGIN, y, size: 6.5, font: fonts.regular, color: GRAY,
    });
  }

  // ============================================================
  // PAGE: RADAR DE FOCO DO PROTOCOLO (teia de aranha)
  // ============================================================
  {
    const page = newDocPage(pdfDoc, allPages);

    // Fundo creme — pastel, elegante, nao branco puro
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(0.98, 0.97, 0.95) });

    let y = PAGE_H - MARGIN;

    // Titulo centralizado
    const titleTxt = "AREAS DE FOCO DO PROTOCOLO";
    const titleW = fonts.bold.widthOfTextAtSize(titleTxt, 15);
    page.drawText(titleTxt, { x: (PAGE_W - titleW) / 2, y, size: 15, font: fonts.bold, color: DARK_BLUE });
    y -= 18;

    const subTxt = "Quanto mais distante do centro, maior a prioridade definida no plano.";
    const subW = fonts.regular.widthOfTextAtSize(subTxt, 8);
    page.drawText(subTxt, { x: (PAGE_W - subW) / 2, y, size: 8, font: fonts.regular, color: GRAY });
    y -= 16;

    // Linha dourada sutil
    page.drawLine({ start: { x: MARGIN + 80, y }, end: { x: PAGE_W - MARGIN - 80, y }, thickness: 0.6, color: GOLD_ACCENT, opacity: 0.55 });
    y -= 28;

    // Radar centralizado
    const chartRadius = 150;
    const cx = PAGE_W / 2;
    const cy = y - chartRadius - 10;

    const radarDims = deriveRadarDimensions(data.substances);
    try {
      drawRadarChart(page, fonts, cx, cy, chartRadius, radarDims);
    } catch (radarErr: any) {
      page.drawText(`[Radar indisponivel: ${String(radarErr.message ?? radarErr).slice(0, 60)}]`, {
        x: MARGIN, y: cy, size: 8, font: fonts.regular, color: GRAY,
      });
    }

    y = cy - chartRadius - 42;

    // Disclaimer centralizado
    const discTxt = "Este desenho mostra prioridades do plano — nao mede gravidade, resultado ou garantia de beneficio.";
    const discW = fonts.regular.widthOfTextAtSize(discTxt, 7);
    page.drawText(discTxt, { x: (PAGE_W - discW) / 2, y, size: 7, font: fonts.regular, color: GRAY });
    y -= 28;

    // Tabela de leitura por dimensao
    if (y > MARGIN + 110) {
      page.drawText("LEITURA POR DIMENSAO", { x: MARGIN, y, size: 8, font: fonts.bold, color: PETROL });
      y -= 5;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.4, color: PETROL, opacity: 0.25 });
      y -= 15;

      const SCALE_WORDS = ["—", "Apoio", "Foco", "Foco principal"];
      const colDim = 200;
      const colNiv = 70;

      // Cabecalho da tabela
      page.drawRectangle({ x: MARGIN, y: y - 14, width: CONTENT_W, height: 18, color: PETROL_LIGHT });
      page.drawText("Dimensao de Saude", { x: MARGIN + 6, y: y - 8, size: 6.5, font: fonts.bold, color: PETROL });
      page.drawText("Nivel", { x: MARGIN + colDim + 4, y: y - 8, size: 6.5, font: fonts.bold, color: PETROL });
      page.drawText("Significado no Protocolo", { x: MARGIN + colDim + colNiv + 4, y: y - 8, size: 6.5, font: fonts.bold, color: PETROL });
      y -= 18;

      for (let i = 0; i < radarDims.length; i++) {
        const dim = radarDims[i];
        if (i % 2 === 0) {
          page.drawRectangle({ x: MARGIN, y: y - 14, width: CONTENT_W, height: 18, color: PETROL_LIGHT, opacity: 0.3 });
        }
        page.drawText(safeTxt(dim.label), { x: MARGIN + 6, y: y - 8, size: 7.5, font: fonts.regular, color: BLACK });

        // Bolinhas de nivel (1-3 dots)
        const dotX = MARGIN + colDim + 4;
        for (let d = 1; d <= 3; d++) {
          page.drawCircle({
            x: dotX + (d - 1) * 14,
            y: y - 6,
            size: 4,
            color: d <= dim.value ? GOLD_ACCENT : rgb(0.87, 0.87, 0.87),
          });
        }

        page.drawText(SCALE_WORDS[dim.value] ?? "—", { x: MARGIN + colDim + colNiv + 4, y: y - 8, size: 7, font: fonts.regular, color: PETROL });
        y -= 18;
      }
    }
  }

  // ============================================================
  // PAGES: SUBSTANCE FACT SHEETS
  // ============================================================
  for (let si = 0; si < data.substances.length; si++) {
    const sub = data.substances[si];
    const hasClinicalContent = Boolean(
      sub.description ||
      sub.mainFunction ||
      sub.bodySystemEffects ||
      sub.perceivedEffects ||
      sub.timeToEffect ||
      sub.categoryType ||
      sub.scientificEvidence ||
      sub.contraindications ||
      BENEFIT_DIMS.some((d) => {
        const v = (sub as Record<string, unknown>)[d.key];
        return v !== undefined && v !== null && String(v).trim() !== "";
      }),
    );
    if (!hasClinicalContent) continue;

    const subColor = getSubstanceColor(sub.color);
    let page = newDocPage(pdfDoc, allPages);
    let y = PAGE_H - MARGIN;

    const drawHeaderBand = (pg: PDFPage, cont: boolean): number => {
      pg.drawRectangle({ x: MARGIN, y: PAGE_H - MARGIN - 40, width: CONTENT_W, height: 50, color: PETROL });
      pg.drawText(safeTxt(sub.name).toUpperCase() + (cont ? " (CONT.)" : ""), { x: MARGIN + 15, y: PAGE_H - MARGIN - 10, size: 16, font: fonts.bold, color: WHITE });
      pg.drawText(procTypeLabel(sub.procedureType), { x: MARGIN + 15, y: PAGE_H - MARGIN - 28, size: 8, font: fonts.regular, color: GOLD_ACCENT });
      const doseInfo = `Dose: ${safeTxt(sub.dose)} | ${sub.totalSessions} sessoes | Intervalo: ${sub.intervalDays} dias`;
      const diW = fonts.regular.widthOfTextAtSize(doseInfo, 7.5);
      pg.drawText(doseInfo, { x: PAGE_W - MARGIN - 15 - diW, y: PAGE_H - MARGIN - 20, size: 7.5, font: fonts.regular, color: rgb(0.7, 0.85, 0.85) });
      pg.drawRectangle({ x: MARGIN, y: PAGE_H - MARGIN - 42, width: CONTENT_W, height: 3, color: subColor });
      return PAGE_H - MARGIN - 55;
    };

    y = drawHeaderBand(page, false);

    const ensure = (needed: number): void => {
      if (y - needed < MARGIN + 30) {
        page = newDocPage(pdfDoc, allPages);
        y = drawHeaderBand(page, true);
      }
    };

    const sectionTitle = (title: string, color: ReturnType<typeof rgb> = PETROL_MID): void => {
      ensure(26);
      page.drawText(title, { x: MARGIN, y, size: 8, font: fonts.bold, color });
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color, opacity: 0.3 });
      y -= 14;
    };

    // CATEGORIA + TEMPO PARA EFEITO
    {
      const badges: Array<{ label: string; value: string }> = [];
      if (sub.categoryType) badges.push({ label: "CATEGORIA", value: safeTxt(sub.categoryType).toUpperCase() });
      if (sub.timeToEffect) badges.push({ label: "TEMPO PARA EFEITO", value: safeTxt(sub.timeToEffect) });
      for (const b of badges) {
        const valLines = wrapText(b.value, fonts.regular, 8, CONTENT_W - 130);
        ensure(valLines.length * 11 + 4);
        page.drawText(b.label, { x: MARGIN, y: y - 1, size: 6.5, font: fonts.bold, color: CYAN });
        for (let i = 0; i < valLines.length; i++) {
          page.drawText(valLines[i], { x: MARGIN + 120, y: y - 1 - i * 11, size: 8, font: i === 0 ? fonts.bold : fonts.regular, color: BLACK });
        }
        y -= Math.max(13, valLines.length * 11 + 4);
      }
      if (badges.length) y -= 4;
    }

    if (sub.description) {
      sectionTitle("O QUE E");
      for (const line of wrapText(safeTxt(sub.description), fonts.regular, 8.5, CONTENT_W)) {
        ensure(12);
        page.drawText(line, { x: MARGIN, y, size: 8.5, font: fonts.regular, color: BLACK });
        y -= 12;
      }
      y -= 8;
    }

    if (sub.mainFunction) {
      sectionTitle("FUNCAO PRINCIPAL");
      const fnLines = wrapText(safeTxt(sub.mainFunction), fonts.bold, 9, CONTENT_W - 110).slice(0, 2);
      const boxH = 16 + fnLines.length * 12;
      ensure(boxH + 6);
      page.drawRectangle({ x: MARGIN, y: y - (boxH - 13), width: CONTENT_W, height: boxH, color: PETROL_LIGHT, borderColor: PETROL, borderWidth: 0.5 });
      for (let i = 0; i < fnLines.length; i++) {
        page.drawText(fnLines[i], { x: MARGIN + 10, y: y - 5 - i * 12, size: 9, font: fonts.bold, color: PETROL });
      }
      if (sub.starRating !== undefined) {
        drawStars(page, PAGE_W - MARGIN - 85, y - 5, sub.starRating);
      }
      y -= boxH + 4;
    }

    // IMPACTO POR SISTEMA — BARRAS COLORIDAS 0-5 (data binding de bodySystemEffects)
    if (sub.bodySystemEffects && typeof sub.bodySystemEffects === "object") {
      sectionTitle("IMPACTO POR SISTEMA CORPORAL (0 A 5)");
      const systems = Object.entries(sub.bodySystemEffects)
        .map(([k, v]) => [k, impactNum(v)] as [string, number])
        .sort((a, b) => b[1] - a[1]);
      for (const [system, val] of systems) {
        ensure(13);
        drawImpactBar(page, fonts, MARGIN, y, CONTENT_W, systemLabel(system), val);
        y -= 13;
      }
      y -= 6;
    }

    // BENEFICIOS POR DIMENSAO (campos texto)
    {
      const dims = BENEFIT_DIMS.filter(d => {
        const v = (sub as Record<string, unknown>)[d.key];
        return v !== undefined && v !== null && String(v).trim() !== "";
      });
      if (dims.length) {
        sectionTitle("BENEFICIOS POR DIMENSAO");
        for (const d of dims) {
          const txt = safeTxt(String((sub as Record<string, unknown>)[d.key]));
          const lines = wrapText(txt, fonts.regular, 8, CONTENT_W - 130);
          ensure(Math.max(12, lines.length * 10 + 4));
          page.drawCircle({ x: MARGIN + 4, y: y - 2, size: 3, color: d.color });
          page.drawText(d.label, { x: MARGIN + 12, y: y - 4, size: 6.5, font: fonts.bold, color: d.color });
          for (let i = 0; i < lines.length; i++) {
            page.drawText(lines[i], { x: MARGIN + 125, y: y - 4 - i * 10, size: 8, font: fonts.regular, color: BLACK });
          }
          y -= Math.max(12, lines.length * 10 + 5);
        }
        y -= 4;
      }
    }

    if (sub.perceivedEffects) {
      sectionTitle("EFEITOS PERCEBIDOS PELO CLIENTE", GREEN);
      for (const line of wrapText(safeTxt(sub.perceivedEffects), fonts.regular, 8.5, CONTENT_W - 10)) {
        ensure(12);
        page.drawText(`> ${line}`, { x: MARGIN + 5, y, size: 8.5, font: fonts.regular, color: BLACK });
        y -= 12;
      }
      y -= 5;
    }

    if (sub.scientificEvidence) {
      sectionTitle("EVIDENCIA CIENTIFICA", PETROL);
      for (const line of wrapText(safeTxt(sub.scientificEvidence), fonts.regular, 8, CONTENT_W - 10)) {
        ensure(11);
        page.drawText(line, { x: MARGIN + 5, y, size: 8, font: fonts.regular, color: BLACK });
        y -= 11;
      }
      y -= 5;
    }

    if (sub.contraindications) {
      sectionTitle("CONTRAINDICACOES", rgb(0.8, 0.2, 0.2));
      for (const line of wrapText(safeTxt(sub.contraindications), fonts.regular, 8, CONTENT_W - 10)) {
        ensure(11);
        page.drawText(line, { x: MARGIN + 5, y, size: 8, font: fonts.regular, color: BLACK });
        y -= 11;
      }
    }
  }

  // ============================================================
  // TCLE: CONSENT FORMS PER PROCEDURE TYPE
  // ============================================================
  {
    const procTypes = [...new Set(data.substances.map(s => s.procedureType))];

    const page = newDocPage(pdfDoc, allPages);
    let y = PAGE_H - MARGIN;

    y = drawSectionHeader(page, fonts, y, "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)");
    y -= 5;

    const substNames = data.substances.map(s => safeTxt(s.name)).join(", ");
    const formattedDate = toDateBR(data.startDate);

    const baseSections = [
      {
        title: "1. IDENTIFICACAO DO CLIENTE",
        text: `Eu, ${safeTxt(data.clientName)}, portador(a) do CPF ${data.clientCpf}, declaro que fui devidamente informado(a) pelo(a) profissional ${safeTxt(data.professionalName)}${data.professionalCrm ? ` (${data.professionalCrm})` : ""} sobre os procedimentos a serem realizados na unidade ${safeTxt(data.unit)} com inicio em ${formattedDate}.`,
      },
      {
        title: "2. PROCEDIMENTOS AUTORIZADOS",
        text: `Autorizo a administracao das seguintes substancias: ${substNames}. Estou ciente de que os procedimentos injetaveis podem incluir aplicacoes por via endovenosa (IV), intramuscular (IM), subcutanea (SC) e/ou implante, conforme indicacao clinica individualizada.`,
      },
      {
        title: "3. FINALIDADE TERAPEUTICA",
        text: "Os procedimentos descritos tem por finalidade a suplementacao de micronutrientes, modulacao bioquimica, terapia antioxidante e/ou outra indicacao clinica conforme avaliacao profissional. Entendo que os resultados podem variar de pessoa para pessoa e dependem de fatores individuais como metabolismo, estilo de vida e adesao ao protocolo.",
      },
      {
        title: "4. RISCOS E EFEITOS ADVERSOS GERAIS",
        text: "Fui informado(a) sobre possiveis efeitos adversos, incluindo mas nao limitados a: dor e/ou hematoma no local da aplicacao, reacoes alergicas, rubor facial, cefaleia, nausea, hipotensao transitoria e, em casos raros, reacoes anafilaticas. Declaro ter informado sobre alergias, medicamentos em uso, condicoes de saude pre-existentes e gestacao/amamentacao.",
      },
      {
        title: "5. CONTRAINDICACOES",
        text: "Declaro ter sido questionado(a) e ter respondido com veracidade sobre: gestacao ou suspeita de gravidez; amamentacao; uso de anticoagulantes; doencas renais, hepaticas ou cardiacas; alergias conhecidas; uso de suplementos e fitoterapicos; e quaisquer condicoes que possam afetar a seguranca do procedimento.",
      },
    ];

    const procSections: Array<{ title: string; text: string }> = [];

    if (procTypes.includes("iv")) {
      procSections.push({
        title: "6. CONSENTIMENTO ESPECIFICO - VIA ENDOVENOSA (IV)",
        text: "Autorizo procedimentos por via endovenosa. Fui informado(a) que infusoes IV requerem acesso venoso periferico, podendo ocorrer dor no local da puncao, hematoma, flebite e, raramente, infiltracao. No caso de Vitamina C endovenosa em alta dose (acima de 10g), declaro ciencia da necessidade de dosagem previa de G6PD (glicose-6-fosfato desidrogenase). No caso de NAD+, fui orientado(a) sobre a velocidade de infusao adequada e possiveis desconfortos.",
      });
    }

    if (procTypes.includes("im")) {
      procSections.push({
        title: `${procSections.length + 6}. CONSENTIMENTO ESPECIFICO - VIA INTRAMUSCULAR (IM)`,
        text: "Autorizo procedimentos por via intramuscular. Estou ciente de que aplicacoes IM podem causar dor local, hematoma, nodulacao transitoria e, em raros casos, lesao nervosa periferica. A tecnica de aplicacao segue protocolos de seguranca e sera realizada por profissional habilitado.",
      });
    }

    if (procTypes.includes("sc")) {
      procSections.push({
        title: `${procSections.length + 6}. CONSENTIMENTO ESPECIFICO - VIA SUBCUTANEA (SC)`,
        text: "Autorizo procedimentos por via subcutanea. Fui informado(a) que aplicacoes SC podem resultar em nodulos locais, eritema, prurido e dor no ponto de aplicacao. A absorcao e gradual e a tecnica sera realizada conforme boas praticas clinicas.",
      });
    }

    if (procTypes.includes("implant")) {
      procSections.push({
        title: `${procSections.length + 6}. CONSENTIMENTO ESPECIFICO - IMPLANTE`,
        text: "Autorizo a realizacao de implante subcutaneo. Estou ciente dos riscos especificos incluindo: necessidade de pequeno procedimento cirurgico, possibilidade de infeccao local, extrusao do implante, formacao de cicatriz, e necessidade de retorno para remocao ao final do periodo terapeutico. Fui orientado(a) sobre os cuidados pos-procedimento.",
      });
    }

    const lgpdSection = {
      title: `${baseSections.length + procSections.length + 1}. LEI GERAL DE PROTECAO DE DADOS (LGPD)`,
      text: "Em conformidade com a Lei n. 13.709/2018 (LGPD), autorizo a coleta, armazenamento e processamento dos meus dados pessoais e dados sensiveis de saude para fins exclusivos de: execucao do protocolo terapeutico; emissao de documentos clinicos (RAS, receituarios); acompanhamento da evolucao clinica; comunicacao sobre agendamentos e resultados. Autorizo o armazenamento digital no sistema Paxter e em ambiente de nuvem seguro (Google Drive), com compartilhamento exclusivo ao meu e-mail cadastrado em modo somente leitura. Tenho ciencia do meu direito de solicitar a exclusao, correcao ou portabilidade dos meus dados a qualquer momento.",
    };

    const finalSection = {
      title: `${baseSections.length + procSections.length + 2}. DECLARACAO FINAL`,
      text: "Declaro ter lido e compreendido integralmente o presente termo. Tive a oportunidade de fazer perguntas e esclarecer todas as minhas duvidas antes de assinar. Autorizo livremente a realizacao dos procedimentos descritos neste protocolo.",
    };

    const allSections = [...baseSections, ...procSections, lgpdSection, finalSection];

    let currentPage = page;

    for (const section of allSections) {
      if (y < MARGIN + 100) {
        currentPage = newDocPage(pdfDoc, allPages);
        y = PAGE_H - MARGIN;
        currentPage.drawText("TCLE (CONTINUACAO)", { x: MARGIN, y, size: 8, font: fonts.bold, color: PETROL_MID });
        y -= 18;
      }

      currentPage.drawText(section.title, { x: MARGIN, y, size: 8.5, font: fonts.bold, color: PETROL });
      y -= 14;

      const lines = wrapText(section.text, fonts.regular, 8, CONTENT_W);
      for (const line of lines) {
        if (y < MARGIN + 60) {
          currentPage = newDocPage(pdfDoc, allPages);
          y = PAGE_H - MARGIN;
          currentPage.drawText("TCLE (CONTINUACAO)", { x: MARGIN, y, size: 8, font: fonts.bold, color: PETROL_MID });
          y -= 18;
        }
        currentPage.drawText(line, { x: MARGIN, y, size: 8, font: fonts.regular, color: BLACK });
        y -= 11;
      }
      y -= 8;
    }

    if (y > MARGIN + 80) {
      y -= 15;
      const sigW = CONTENT_W / 2 - 20;
      currentPage.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + sigW, y }, thickness: 0.8, color: PETROL });
      currentPage.drawText("Assinatura do Cliente", { x: MARGIN + 5, y: y - 11, size: 7, font: fonts.regular, color: GRAY });
      currentPage.drawText(safeTxt(data.clientName), { x: MARGIN + 5, y: y - 22, size: 8, font: fonts.bold, color: BLACK });
      currentPage.drawText(`CPF: ${data.clientCpf}`, { x: MARGIN + 5, y: y - 32, size: 7, font: fonts.regular, color: GRAY });

      currentPage.drawLine({ start: { x: MARGIN + sigW + 40, y }, end: { x: MARGIN + 2 * sigW + 40, y }, thickness: 0.8, color: PETROL });
      currentPage.drawText("Data", { x: MARGIN + sigW + 45, y: y - 11, size: 7, font: fonts.regular, color: GRAY });
    }
  }

  // ============================================================
  // PAGE(S): RAS GRID (COMPACT SESSION x SUBSTANCE)
  // ============================================================
  {
    const sessColW = 28;
    const nameW = 100;
    const maxSessPerPage = Math.max(1, Math.floor((CONTENT_W - nameW) / sessColW));
    const totalSessions = data.sessions.length;
    const gridRowH = 16;
    const gridPages = Math.max(1, Math.ceil(totalSessions / maxSessPerPage));

    for (let gp = 0; gp < gridPages; gp++) {
      let currentPage = newDocPage(pdfDoc, allPages);
      let y = PAGE_H - MARGIN;

      const startSess = gp * maxSessPerPage;
      const endSess = Math.min(startSess + maxSessPerPage, totalSessions);
      const sessCount = endSess - startSess;
      const headerLabel = gp === 0 ? "CRONOGRAMA DE SESSOES" : `CRONOGRAMA DE SESSOES (S${startSess + 1}-S${endSess})`;

      y = drawSectionHeader(currentPage, fonts, y, headerLabel);
      y -= 5;

      function drawGridHeader(pg: PDFPage, yPos: number): number {
        pg.drawRectangle({ x: MARGIN, y: yPos - gridRowH + 4, width: nameW + sessCount * sessColW, height: gridRowH, color: PETROL_LIGHT });
        pg.drawText("SUBSTANCIA", { x: MARGIN + 4, y: yPos - 7, size: 6, font: fonts.bold, color: PETROL });
        for (let s = 0; s < sessCount; s++) {
          const sx = MARGIN + nameW + s * sessColW;
          pg.drawText(`S${startSess + s + 1}`, { x: sx + 2, y: yPos - 7, size: 6, font: fonts.bold, color: PETROL });
        }
        return yPos - gridRowH;
      }

      y = drawGridHeader(currentPage, y);

      for (const sub of data.substances) {
        if (y < MARGIN + 60) {
          currentPage = newDocPage(pdfDoc, allPages);
          y = PAGE_H - MARGIN;
          y = drawSectionHeader(currentPage, fonts, y, `CRONOGRAMA (CONT. S${startSess + 1}-S${endSess})`);
          y -= 5;
          y = drawGridHeader(currentPage, y);
        }

        const subColor = getSubstanceColor(sub.color);
        currentPage.drawCircle({ x: MARGIN + 6, y: y - 5, size: 3, color: subColor });
        const nm = safeTxt(sub.name).length > 14 ? safeTxt(sub.name).slice(0, 13) + "." : safeTxt(sub.name);
        currentPage.drawText(nm, { x: MARGIN + 14, y: y - 8, size: 6.5, font: fonts.regular, color: BLACK });

        for (let s = 0; s < sessCount; s++) {
          const sess = data.sessions[startSess + s];
          const sx = MARGIN + nameW + s * sessColW;
          const substStatus = sess.substanceStatuses.find(ss => ss.substanceName === sub.name);

          if (substStatus) {
            if (substStatus.status === "applied") {
              currentPage.drawRectangle({ x: sx + 1, y: y - gridRowH + 5, width: sessColW - 2, height: gridRowH - 2, color: subColor, opacity: 0.75 });
              currentPage.drawText(`${substStatus.sessionNumber}`, { x: sx + 3, y: y - 8, size: 6, font: fonts.bold, color: WHITE });
            } else {
              currentPage.drawRectangle({ x: sx + 1, y: y - gridRowH + 5, width: sessColW - 2, height: gridRowH - 2, color: subColor, opacity: 0.2 });
              currentPage.drawText(`${substStatus.sessionNumber}`, { x: sx + 3, y: y - 8, size: 6, font: fonts.regular, color: BLACK });
            }
          }
        }

        currentPage.drawLine({ start: { x: MARGIN, y: y - gridRowH + 4 }, end: { x: MARGIN + nameW + sessCount * sessColW, y: y - gridRowH + 4 }, thickness: 0.2, color: LIGHT_GRAY });
        y -= gridRowH;
      }

      y -= 15;
      currentPage.drawText("Legenda: Celula preenchida forte = aplicado | Celula preenchida leve = agendado | Numeros = sessao da substancia", {
        x: MARGIN, y, size: 6, font: fonts.regular, color: GRAY,
      });
      y -= 12;

      if (data.sessions.length > 0) {
        const firstDate = toDateBR(data.sessions[0].scheduledDate);
        const lastDate = toDateBR(data.sessions[data.sessions.length - 1].scheduledDate);
        currentPage.drawText(`Periodo: ${firstDate} a ${lastDate} | Total: ${data.sessions.length} sessoes`, {
          x: MARGIN, y, size: 6.5, font: fonts.regular, color: GRAY,
        });
      }
    }
  }

  // ============================================================
  // PAGE: FINANCIAL SUMMARY
  // ============================================================
  {
    let page = newDocPage(pdfDoc, allPages);
    let y = PAGE_H - MARGIN;

    y = drawSectionHeader(page, fonts, y, "RESUMO FINANCEIRO");
    y -= 10;

    page.drawText("VALOR TOTAL DO PROTOCOLO", { x: MARGIN, y, size: 9, font: fonts.bold, color: PETROL });
    y -= 18;

    const totalStr = `R$ ${data.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    page.drawText(totalStr, { x: MARGIN, y, size: 22, font: fonts.bold, color: PETROL });
    y -= 30;

    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: PETROL, opacity: 0.3 });
    y -= 15;

    page.drawText("COMPOSICAO POR SUBSTANCIA", { x: MARGIN, y, size: 8, font: fonts.bold, color: PETROL_MID });
    y -= 16;

    const subTableCols = ["Substancia", "Dose", "Sessoes", "Via", "Intervalo", "Inicio"];
    const subTableW = [140, 80, 60, 70, 60, 80];
    const subRowH = 16;

    page.drawRectangle({ x: MARGIN, y: y - subRowH + 4, width: CONTENT_W, height: subRowH, color: PETROL_LIGHT });
    let tx = MARGIN;
    for (let c = 0; c < subTableCols.length; c++) {
      page.drawText(subTableCols[c], { x: tx + 4, y: y - 7, size: 6.5, font: fonts.bold, color: PETROL });
      tx += subTableW[c];
    }
    y -= subRowH;

    for (const sub of data.substances) {
      if (y < MARGIN + 30) { page = newDocPage(pdfDoc, allPages); y = PAGE_H - MARGIN; }
      const vals = [
        safeTxt(sub.name), safeTxt(sub.dose), `${sub.totalSessions}`,
        procTypeLabel(sub.procedureType).split("(")[0].trim(),
        `${sub.intervalDays} dias`, toDateBR(sub.startDate),
      ];
      tx = MARGIN;
      for (let c = 0; c < vals.length; c++) {
        const trunc = vals[c].length > 20 ? vals[c].slice(0, 18) + ".." : vals[c];
        page.drawText(trunc, { x: tx + 4, y: y - 7, size: 7, font: fonts.regular, color: BLACK });
        tx += subTableW[c];
      }
      page.drawLine({ start: { x: MARGIN, y: y - subRowH + 4 }, end: { x: MARGIN + CONTENT_W, y: y - subRowH + 4 }, thickness: 0.2, color: LIGHT_GRAY });
      y -= subRowH;
    }

    y -= 20;

    const hasPricing = data.substances.some(s => (s.unitPrice ?? 0) > 0);
    if (hasPricing) {
      if (y < MARGIN + 60) { page = newDocPage(pdfDoc, allPages); y = PAGE_H - MARGIN; }
      page.drawText("ORCAMENTO - INJETAVEIS (VALOR POR AMPOLA)", { x: MARGIN, y, size: 8, font: fonts.bold, color: PETROL_MID });
      y -= 16;

      const orcCols = ["Substancia", "Valor Ampola", "Sessoes", "Subtotal"];
      const orcW = [180, 110, 90, 115];

      page.drawRectangle({ x: MARGIN, y: y - subRowH + 4, width: CONTENT_W, height: subRowH, color: PETROL_LIGHT });
      tx = MARGIN;
      for (let c = 0; c < orcCols.length; c++) {
        page.drawText(orcCols[c], { x: tx + 4, y: y - 7, size: 6.5, font: fonts.bold, color: PETROL });
        tx += orcW[c];
      }
      y -= subRowH;

      let orcTotal = 0;
      for (const sub of data.substances) {
        if (y < MARGIN + 30) { page = newDocPage(pdfDoc, allPages); y = PAGE_H - MARGIN; }
        const unit = sub.unitPrice ?? 0;
        const line = unit * sub.totalSessions;
        orcTotal += line;
        const vals = [
          safeTxt(sub.name),
          `R$ ${unit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          `${sub.totalSessions}`,
          `R$ ${line.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        ];
        tx = MARGIN;
        for (let c = 0; c < vals.length; c++) {
          const trunc = vals[c].length > 24 ? vals[c].slice(0, 22) + ".." : vals[c];
          page.drawText(trunc, { x: tx + 4, y: y - 7, size: 7, font: fonts.regular, color: BLACK });
          tx += orcW[c];
        }
        page.drawLine({ start: { x: MARGIN, y: y - subRowH + 4 }, end: { x: MARGIN + CONTENT_W, y: y - subRowH + 4 }, thickness: 0.2, color: LIGHT_GRAY });
        y -= subRowH;
      }

      y -= 4;
      page.drawText(`Total estimado (injetaveis): R$ ${orcTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, {
        x: MARGIN, y, size: 9, font: fonts.bold, color: PETROL,
      });
      y -= 20;
    }

    if (data.payments.length > 0) {
      if (y < MARGIN + 60) { page = newDocPage(pdfDoc, allPages); y = PAGE_H - MARGIN; }
      page.drawText("HISTORICO DE PAGAMENTOS", { x: MARGIN, y, size: 8, font: fonts.bold, color: PETROL_MID });
      y -= 16;

      const payH = ["Valor", "Forma", "Status", "Vencimento", "Pago em", "Parcelas", "Cartao"];
      const payW = [80, 80, 60, 70, 70, 50, 80];

      page.drawRectangle({ x: MARGIN, y: y - subRowH + 4, width: CONTENT_W, height: subRowH, color: PETROL_LIGHT });
      tx = MARGIN;
      for (let c = 0; c < payH.length; c++) {
        page.drawText(payH[c], { x: tx + 4, y: y - 7, size: 6.5, font: fonts.bold, color: PETROL });
        tx += payW[c];
      }
      y -= subRowH;

      for (const pay of data.payments) {
        if (y < MARGIN + 30) { page = newDocPage(pdfDoc, allPages); y = PAGE_H - MARGIN; }
        const statusLbl = pay.status === "paid" ? "Pago" : pay.status === "pending" ? "Pendente" : pay.status;
        const vals = [
          `R$ ${pay.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          methodLabel(pay.method),
          statusLbl,
          pay.dueDate ? toDateBR(pay.dueDate) : "-",
          pay.paidAt ? toDateBR(pay.paidAt) : "-",
          pay.installments ? `${pay.installments}x` : "-",
          safeTxt(pay.cardLabel) || "-",
        ];
        tx = MARGIN;
        for (let c = 0; c < vals.length; c++) {
          const trunc = vals[c].length > 12 ? vals[c].slice(0, 10) + ".." : vals[c];
          page.drawText(trunc, { x: tx + 4, y: y - 7, size: 7, font: fonts.regular, color: BLACK });
          tx += payW[c];
        }
        page.drawLine({ start: { x: MARGIN, y: y - subRowH + 4 }, end: { x: MARGIN + CONTENT_W, y: y - subRowH + 4 }, thickness: 0.2, color: LIGHT_GRAY });
        y -= subRowH;
      }

      const totalPaid = data.payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
      const totalPending = data.payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);

      y -= 10;
      page.drawText(`Total Pago: R$ ${totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, {
        x: MARGIN, y, size: 9, font: fonts.bold, color: GREEN,
      });
      y -= 15;
      if (totalPending > 0) {
        page.drawText(`Saldo Pendente: R$ ${totalPending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, {
          x: MARGIN, y, size: 9, font: fonts.bold, color: rgb(0.8, 0.4, 0.1),
        });
      }
    } else {
      page.drawText("Nenhum pagamento registrado para este protocolo.", {
        x: MARGIN, y, size: 9, font: fonts.regular, color: GRAY,
      });
    }
  }

  // ============================================================
  // LAST PAGE: DIGITAL SIGNATURE
  // ============================================================
  {
    const page = newDocPage(pdfDoc, allPages);
    let y = PAGE_H - MARGIN;

    y = drawSectionHeader(page, fonts, y, "ASSINATURA DIGITAL ICP-BRASIL");
    y -= 10;

    page.drawRectangle({ x: MARGIN, y: y - 85, width: CONTENT_W, height: 95, borderColor: PETROL, borderWidth: 1.5, color: PETROL_LIGHT, opacity: 0.5 });

    page.drawText("DOCUMENTO ASSINADO DIGITALMENTE", { x: MARGIN + 12, y: y - 2, size: 9, font: fonts.bold, color: PETROL });

    const cnAttr = cert.subject.getField("CN");
    const signerName = cnAttr?.value ? String(cnAttr.value) : data.professionalName;

    const signDetails = [
      `Assinante: ${safeTxt(signerName)}`,
      `CPF: ${certInfo.cpf ?? "-"}`,
      `Emissor: ${safeTxt(String(cert.issuer.getField("CN")?.value ?? "ICP-Brasil"))}`,
      `Serial: ${cert.serialNumber.toUpperCase().slice(0, 40)}`,
      `Valido: ${new Date(certInfo.validFrom).toLocaleDateString("pt-BR")} a ${new Date(certInfo.validTo).toLocaleDateString("pt-BR")}`,
      `Assinado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    ];

    for (let i = 0; i < signDetails.length; i++) {
      page.drawText(signDetails[i], { x: MARGIN + 12, y: y - 18 - i * 12, size: 8, font: fonts.regular, color: PETROL });
    }
    y -= 110;

    y -= 20;
    const sigW = CONTENT_W / 3 - 10;
    const sigs = [
      { label: "Assinatura do Profissional", name: safeTxt(data.professionalName), extra: data.professionalCrm },
      { label: "Assinatura do Cliente", name: safeTxt(data.clientName), extra: `CPF: ${data.clientCpf}` },
      { label: "Data", name: toDateBR(data.startDate), extra: null },
    ];

    for (let i = 0; i < sigs.length; i++) {
      const bx = MARGIN + i * (sigW + 15);
      page.drawLine({ start: { x: bx, y }, end: { x: bx + sigW, y }, thickness: 0.8, color: PETROL });
      page.drawText(sigs[i].label, { x: bx + (sigW - fonts.regular.widthOfTextAtSize(sigs[i].label, 7)) / 2, y: y - 12, size: 7, font: fonts.regular, color: GRAY });
      page.drawText(sigs[i].name, { x: bx + (sigW - fonts.bold.widthOfTextAtSize(sigs[i].name, 8)) / 2, y: y - 23, size: 8, font: fonts.bold, color: BLACK });
      if (sigs[i].extra) {
        page.drawText(sigs[i].extra!, { x: bx + (sigW - fonts.regular.widthOfTextAtSize(sigs[i].extra!, 7)) / 2, y: y - 33, size: 7, font: fonts.regular, color: GRAY });
      }
    }

    y -= 60;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: PETROL, opacity: 0.3 });
    y -= 15;
    page.drawText("Este documento foi gerado e assinado digitalmente pelo sistema Paxter.", {
      x: MARGIN, y, size: 7.5, font: fonts.regular, color: GRAY,
    });
    y -= 12;
    page.drawText("A assinatura digital ICP-Brasil confere validade juridica ao documento (MP 2.200-2/2001).", {
      x: MARGIN, y, size: 7.5, font: fonts.regular, color: GRAY,
    });
  }

  // Add brand header (top-right) + footer with rubric line to all pages (skip cover)
  for (let i = 0; i < allPages.length; i++) {
    if (i === 0) continue;
    drawDocHeaderBrand(allPages[i], fonts);
    drawDocFooter(allPages[i], fonts, i + 1, allPages.length, data.clientName);
  }

  // === SIGN THE PDF (PAdES embarcado — selo verde Adobe) ===
  const cnAttrInfo = cert.subject.getField("CN");
  const sName = cnAttrInfo?.value ? String(cnAttrInfo.value) : data.professionalName;

  const pdfBytes = await embedPadesSignature(pdfDoc, {
    name: sName,
    reason: "Assinatura digital do protocolo (ICP-Brasil)",
    location: data.unit || "Instituto Pádua",
    contactInfo: data.clientCpf || "",
  });

  return {
    pdfBytes,
    certInfo: { ...certInfo, signerName: sName },
  };
}

export { getCertInfo, loadCertificate, embedPadesSignature };
