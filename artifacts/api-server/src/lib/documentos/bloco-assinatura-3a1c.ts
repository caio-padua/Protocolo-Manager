import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFPage, PDFFont, rgb } from "pdf-lib";
import QRCode from "qrcode";

const require = createRequire(import.meta.url);
const mm = 72 / 25.4;
export const ASSINATURA_3A1C_ALTURA = 24.5 * mm;
export const ASSINATURA_3A1C_LARGURA = 180 * mm;
const URL_VALIDADOR = "https://validar.iti.gov.br/";
const ink = rgb(13 / 255, 34 / 255, 52 / 255);
const gold = rgb(182 / 255, 138 / 255, 55 / 255);
const separator = rgb(222 / 255, 211 / 255, 189 / 255);
const gray = rgb(102 / 255, 113 / 255, 123 / 255);

function liberationBold(): Buffer {
  for (const candidate of [
    resolve(import.meta.dirname, "../../../assets/fonts/LiberationSerif-Bold.ttf"),
    resolve(import.meta.dirname, "assets/fonts/LiberationSerif-Bold.ttf"),
  ]) {
    try { return readFileSync(candidate); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("A fonte Liberation Serif não foi encontrada.");
}

export type DadosAssinatura3a1c = {
  certificado?: { assinante: string; cpf?: string | null; ac?: string | null; serial?: string | null; validTo?: string | null } | null;
  profissional: string;
  crm: string;
  assinaturaImagem?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" } | null;
  vencimento?: string | null;
};

function validade(value?: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function crmTexto(crm: string): string {
  return crm.trim().replace(/^CRM\s*[:/]?\s*/i, "") || "—";
}

function fit(font: PDFFont, text: string, max: number, preferred = 7): number {
  for (let size = preferred; size >= 4.4; size -= 0.1) {
    if (font.widthOfTextAtSize(text, size) <= max) return size;
  }
  throw new Error("Os dados do certificado excedem o espaço disponível no quadro de assinatura.");
}

/** Desenha antes de assinar. O QR abre o serviço oficial, que pede o arquivo para validação. */
export async function desenharAssinatura3a1c(
  doc: PDFDocument, page: PDFPage, bottom: number, dados: DadosAssinatura3a1c,
): Promise<void> {
  doc.registerFontkit(fontkit);
  const [regular, bold, serif] = await Promise.all([
    doc.embedFont(readFileSync(require.resolve("@fontsource/lato/files/lato-latin-400-normal.woff")), { subset: true }),
    doc.embedFont(readFileSync(require.resolve("@fontsource/lato/files/lato-latin-700-normal.woff")), { subset: true }),
    doc.embedFont(liberationBold(), { subset: true }),
  ]);
  const x = (page.getWidth() - ASSINATURA_3A1C_LARGURA) / 2;
  const h = ASSINATURA_3A1C_ALTURA;
  const xp = (v: number) => x + v * mm;
  const yp = (v: number) => bottom + v * mm;
  const c = dados.certificado;
  // Caminho SVG tem eixo Y para baixo: ancora no topo do módulo.
  const w = ASSINATURA_3A1C_LARGURA, r = 2.1 * mm;
  page.drawSvgPath(`M ${r} 0 L ${w-r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h-r} Q ${w} ${h} ${w-r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h-r} L 0 ${r} Q 0 0 ${r} 0 Z`, {
    x, y: bottom + h, color: rgb(1, 1, 1), borderColor: gold, borderWidth: 0.18 * mm,
  });
  page.drawRectangle({ x: xp(0.5), y: yp(2.7), width: 1.25 * mm, height: 19.1 * mm, color: ink });
  for (const d of [34.5, 142.4]) {
    page.drawLine({ start: { x: xp(d), y: yp(3.3) }, end: { x: xp(d), y: yp(21.2) }, color: separator, thickness: 0.35 * mm });
  }
  if (c) {
    const qr = await doc.embedPng(await QRCode.toBuffer(URL_VALIDADOR, { width: 400, margin: 4, errorCorrectionLevel: "M" }));
    page.drawImage(qr, { x: xp(8), y: yp(6.8), width: 15 * mm, height: 15 * mm });
    const caption = "CONFERIR QR";
    page.drawText(caption, { x: xp(15.5) - regular.widthOfTextAtSize(caption, 6) / 2, y: yp(3), font: regular, size: 6, color: ink });
  } else {
    const aviso = "NÃO ASSINADO";
    page.drawText(aviso, { x: xp(17.25) - bold.widthOfTextAtSize(aviso, 6.2) / 2, y: yp(11), font: bold, size: 6.2, color: rgb(0.68, 0.1, 0.1) });
  }

  const title = c ? "ASSINADO DIGITALMENTE – ICP-Brasil / PAdES" : "GERADA SEM ASSINATURA DIGITAL";
  page.drawText(title, { x: xp(38.2), y: yp(19.15), font: bold, size: fit(bold, title, 100 * mm, 8.2), color: c ? ink : rgb(0.68, 0.1, 0.1) });
  page.drawLine({ start: { x: xp(38.2), y: yp(17.5) }, end: { x: xp(138.5), y: yp(17.5) }, thickness: 0.35, color: separator });
  const rows: [string, string, boolean?][] = c ? [
    [`Assinante: ${c.assinante}`, `Certificadora: ${c.ac || "—"}`],
    [`CPF: ${c.cpf || "—"}`, `Série: ${c.serial || "—"}`],
    [`CRM: ${crmTexto(dados.crm)}`, `Válido até: ${validade(c.validTo)}`, true],
    ["", "Verificação: validar.iti.gov.br"],
  ] : [
    [`Responsável: ${dados.profissional}`, dados.vencimento ? "Situação: certificado vencido" : "Situação: não assinado"],
    [`CRM: ${crmTexto(dados.crm)}`, `Vencimento: ${validade(dados.vencimento)}`, true],
    ["Exige assinatura manual", "Somente acesso autenticado"],
    ["", ""],
  ];
  const ys = [14.25, 10.7, 7.2, 3.7];
  for (let i = 0; i < rows.length; i++) {
    const [left, right, strong] = rows[i];
    if (left) page.drawText(left, { x: xp(38.2), y: yp(ys[i]), font: strong ? bold : regular, size: fit(strong ? bold : regular, left, 53.5 * mm), color: ink });
    if (right) page.drawText(right, { x: xp(94), y: yp(ys[i]), font: regular, size: fit(regular, right, 45.5 * mm), color: ink });
  }
  const center = xp(161);
  const lineY = yp(12.8);
  if (dados.assinaturaImagem) {
    const img = dados.assinaturaImagem.mime === "image/png"
      ? await doc.embedPng(dados.assinaturaImagem.bytes) : await doc.embedJpg(dados.assinaturaImagem.bytes);
    const scale = Math.min((28 * mm) / img.width, (7 * mm) / img.height);
    page.drawImage(img, { x: center - img.width * scale / 2, y: lineY + 1, width: img.width * scale, height: img.height * scale });
  } else {
    const unavailable = "Assinatura não cadastrada";
    page.drawText(unavailable, { x: center - regular.widthOfTextAtSize(unavailable, 4.6) / 2, y: yp(16), font: regular, size: 4.6, color: gray });
  }
  page.drawLine({ start: { x: xp(147), y: lineY }, end: { x: xp(175), y: lineY }, thickness: 0.45, color: gold });
  const words = dados.profissional.trim().split(/\s+/).filter(Boolean);
  let lines = [words.join(" ")];
  if (serif.widthOfTextAtSize(lines[0], 7) > 32 * mm && words.length > 1) {
    const middle = Math.ceil(words.length / 2);
    lines = [words.slice(0, middle).join(" "), words.slice(middle).join(" ")];
  }
  lines.forEach((line, i) => {
    const size = fit(serif, line, 33 * mm, 7);
    page.drawText(line, { x: center - serif.widthOfTextAtSize(line, size) / 2, y: yp(9.5 - i * 3.1), font: serif, size, color: ink });
  });
  const crm = `CRM ${crmTexto(dados.crm)}`;
  const crmSize = fit(regular, crm, 33 * mm, 6);
  page.drawText(crm, { x: center - regular.widthOfTextAtSize(crm, crmSize) / 2, y: yp(3), font: regular, size: crmSize, color: gray });
}

/** Versão vetorial para o modelo de receituário renderizado pelo navegador. */
export function assinatura3a1cSvg(dados: DadosAssinatura3a1c): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const c = dados.certificado;
  const reg = readFileSync(require.resolve("@fontsource/lato/files/lato-latin-400-normal.woff")).toString("base64");
  const bold = readFileSync(require.resolve("@fontsource/lato/files/lato-latin-700-normal.woff")).toString("base64");
  const serif = liberationBold().toString("base64");
  const text = (x: number, y: number, value: string, max: number, size = 2.47, extra = "") => {
    const estimated = value.length * size * 0.53;
    const adjusted = estimated > max ? size * max / estimated : size;
    if (adjusted < 1.55) throw new Error("Os dados do certificado excedem o espaço disponível no quadro de assinatura.");
    return `<text x="${x}" y="${24.5 - y}" font-size="${adjusted}" ${extra}>${esc(value)}</text>`;
  };
  const signedTitle = c ? "ASSINADO DIGITALMENTE – ICP-Brasil / PAdES" : "GERADA SEM ASSINATURA DIGITAL";
  const rows = c ? [
    [`Assinante: ${c.assinante}`, `Certificadora: ${c.ac || "—"}`],
    [`CPF: ${c.cpf || "—"}`, `Série: ${c.serial || "—"}`],
    [`CRM: ${crmTexto(dados.crm)}`, `Válido até: ${validade(c.validTo)}`],
    ["", "Verificação: validar.iti.gov.br"],
  ] : [
    [`Responsável: ${dados.profissional}`, dados.vencimento ? "Situação: certificado vencido" : "Situação: não assinado"],
    [`CRM: ${crmTexto(dados.crm)}`, `Vencimento: ${validade(dados.vencimento)}`],
    ["Exige assinatura manual", "Somente acesso autenticado"],
    ["", ""],
  ];
  const ys = [14.25, 10.7, 7.2, 3.7];
  const rowTexts = rows.map((row, i) =>
    (row[0] ? text(38.2, ys[i], row[0], 53.5, 2.47, i === 2 && c ? 'font-weight="700"' : "") : "") +
    (row[1] ? text(94, ys[i], row[1], 45.5) : "")).join("");
  let qr = "";
  if (c) {
    const m = QRCode.create(URL_VALIDADOR, { errorCorrectionLevel: "M" }).modules;
    const unit = 15 / (m.size + 8);
    let blocks = "";
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) {
      if (m.get(y, x)) blocks += `<rect x="${8 + (x + 4) * unit}" y="${24.5 - 6.8 - 15 + (y + 4) * unit}" width="${unit}" height="${unit}"/>`;
    }
    qr = `<g fill="#0D2234" shape-rendering="crispEdges">${blocks}</g>${text(15.5, 3, "CONFERIR QR", 30, 2.1, 'text-anchor="middle"')}`;
  } else {
    qr = text(17.25, 11, "NÃO ASSINADO", 30, 2, 'text-anchor="middle" fill="#ad1919" font-weight="700"');
  }
  const image = dados.assinaturaImagem
    ? `<image x="147" y="4.7" width="28" height="7" preserveAspectRatio="xMidYMid meet" href="data:${dados.assinaturaImagem.mime};base64,${Buffer.from(dados.assinaturaImagem.bytes).toString("base64")}"/>`
    : text(161, 16, "Assinatura não cadastrada", 32, 1.7, 'text-anchor="middle" fill="#66717B"');
  const words = dados.profissional.trim().split(/\s+/).filter(Boolean);
  const middle = Math.ceil(words.length / 2);
  const lines = words.join(" ").length > 22 && words.length > 1 ? [words.slice(0, middle).join(" "), words.slice(middle).join(" ")] : [words.join(" ")];
  const names = lines.map((v, i) => text(161, 9.5 - i * 3.1, v, 33, 2.5, 'text-anchor="middle" font-family="Liberation Serif,serif" font-weight="700"')).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180mm" height="24.5mm" viewBox="0 0 180 24.5" role="img" aria-label="Quadro de assinatura e certificado" font-family="Lato,sans-serif" fill="#0D2234">
    <style>@font-face{font-family:Lato;src:url(data:font/woff;base64,${reg})} @font-face{font-family:Lato;src:url(data:font/woff;base64,${bold});font-weight:700} @font-face{font-family:Liberation Serif;src:url(data:font/ttf;base64,${serif});font-weight:700}</style>
    <rect x=".09" y=".09" width="179.82" height="24.32" rx="2.1" fill="#fff" stroke="#B68A37" stroke-width=".18"/>
    <rect x=".5" y="2.7" width="1.25" height="19.1" fill="#0D2234"/>
    <path d="M 34.5 3.3 V 21.2 M 142.4 3.3 V 21.2" stroke="#DED3BD" stroke-width=".35"/>
    ${qr}${text(38.2, 19.15, signedTitle, 100, 2.9, 'font-weight="700"')}
    <path d="M 38.2 7 H 138.5" stroke="#DED3BD" stroke-width=".12"/>
    ${rowTexts}${image}<path d="M 147 11.7 H 175" stroke="#B68A37" stroke-width=".16"/>
    ${names}${text(161, 3, `CRM ${crmTexto(dados.crm)}`, 33, 2.1, 'text-anchor="middle" fill="#66717B"')}
  </svg>`;
}
