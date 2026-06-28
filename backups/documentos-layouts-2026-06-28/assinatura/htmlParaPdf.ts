/**
 * Converte o HTML hidratado dos templates de assinatura em um PDF binario real
 * via pdfkit. ZapSign trava o leitor de PDF se receber HTML cru no base64; este
 * helper extrai o texto renderizavel (mantendo quebras semanticas de <p>, <br>,
 * <h1-6>, <li>) e desenha em PDF A4 Helvetica — funcional e juridicamente valido.
 */
import PDFDocument from "pdfkit";

const MARGEM = 56;
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

interface BlocoTexto {
  texto: string;
  estilo: "h1" | "h2" | "h3" | "p" | "li";
}

/**
 * Converte HTML simples em blocos de texto renderizaveis. Suporta:
 * <h1-h6>, <p>, <br>, <li>, <strong>, <em>, <b>, <i>. Outras tags sao
 * desconsideradas (texto interno preservado). Entidades basicas tratadas.
 */
function htmlParaBlocos(html: string): BlocoTexto[] {
  const semScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const semBr = semScript.replace(/<br\s*\/?>(?!\s*$)/gi, "\n");

  const blocos: BlocoTexto[] = [];
  const regex = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  let textoSolto = "";

  const limparTexto = (s: string): string =>
    s
      .replace(/<\/?(strong|em|b|i|span|u|small)[^>]*>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .trim();

  while ((m = regex.exec(semBr)) !== null) {
    if (m.index > lastIndex) {
      const intermediario = limparTexto(semBr.slice(lastIndex, m.index));
      if (intermediario) textoSolto += (textoSolto ? " " : "") + intermediario;
    }
    if (textoSolto) {
      blocos.push({ texto: textoSolto, estilo: "p" });
      textoSolto = "";
    }
    const tag = m[1]!.toLowerCase();
    const conteudo = limparTexto(m[2] || "");
    if (!conteudo) {
      lastIndex = regex.lastIndex;
      continue;
    }
    let estilo: BlocoTexto["estilo"] = "p";
    if (tag === "h1") estilo = "h1";
    else if (tag === "h2") estilo = "h2";
    else if (tag.startsWith("h")) estilo = "h3";
    else if (tag === "li") estilo = "li";
    blocos.push({ texto: conteudo, estilo });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < semBr.length) {
    const restante = limparTexto(semBr.slice(lastIndex));
    if (restante) textoSolto += (textoSolto ? " " : "") + restante;
  }
  if (textoSolto) blocos.push({ texto: textoSolto, estilo: "p" });

  if (blocos.length === 0) {
    const tudo = limparTexto(semBr);
    if (tudo) blocos.push({ texto: tudo, estilo: "p" });
  }
  return blocos;
}

/**
 * Renderiza HTML hidratado como PDF Buffer A4. Layout minimo:
 * Helvetica corpo 11pt, Helvetica-Bold para H1/H2/H3, marcador "•" para li.
 */
export function htmlParaPdfBuffer(htmlHidratado: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: MARGEM,
        info: {
          Title: "Documento Instituto Padua",
          Producer: "Paxter — Motor Clinico",
          CreationDate: new Date(),
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const blocos = htmlParaBlocos(htmlHidratado);

      doc.font("Helvetica").fillColor("#111111");
      const larguraUtil = LARGURA_A4 - MARGEM * 2;

      for (const b of blocos) {
        if (doc.y + 40 > ALTURA_A4 - MARGEM) doc.addPage();
        switch (b.estilo) {
          case "h1":
            doc.moveDown(0.5).font("Helvetica-Bold").fontSize(18)
              .text(b.texto, { width: larguraUtil, align: "left" });
            doc.moveDown(0.5);
            break;
          case "h2":
            doc.moveDown(0.4).font("Helvetica-Bold").fontSize(14)
              .text(b.texto, { width: larguraUtil, align: "left" });
            doc.moveDown(0.3);
            break;
          case "h3":
            doc.moveDown(0.3).font("Helvetica-Bold").fontSize(12)
              .text(b.texto, { width: larguraUtil, align: "left" });
            doc.moveDown(0.2);
            break;
          case "li":
            doc.font("Helvetica").fontSize(11)
              .text(`•  ${b.texto}`, MARGEM + 14, doc.y, {
                width: larguraUtil - 14, align: "left",
              });
            break;
          case "p":
          default:
            doc.font("Helvetica").fontSize(11)
              .text(b.texto, { width: larguraUtil, align: "justify" });
            doc.moveDown(0.4);
            break;
        }
      }

      doc.fontSize(8).fillColor("#666666").font("Helvetica")
        .text(
          `Instituto Padua  ·  Documento gerado em ${new Date().toLocaleString("pt-BR")}`,
          MARGEM,
          ALTURA_A4 - MARGEM + 8,
          { width: larguraUtil, align: "center" },
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** Atalho conveniente: retorna base64 pronto pra adapters. */
export async function htmlParaPdfBase64(htmlHidratado: string): Promise<string> {
  const buf = await htmlParaPdfBuffer(htmlHidratado);
  return buf.toString("base64");
}
