// ============================================================================
// GERADOR DE PLANO NUTRICIONAL PDF — PADAXOR Clinical Intelligence System
// Entrega 100% do padrão Instituto Pádua (8-10 páginas, 3 opções por refeição,
// texto clínico, suplementação, monitoramento) + melhorias Kaizen.
// Motor: Claude claude-sonnet-4-6 (conteúdo) + pdf-lib (renderização).
// ============================================================================

import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import { brtNow } from "./brt";
import { anthropic } from "@workspace/integrations-anthropic-ai";

// ─── Paleta PADAXOR ──────────────────────────────────────────────────────────
const NAVY    = rgb(0.043, 0.114, 0.227);   // #0B1D3A
const GOLD    = rgb(0.831, 0.686, 0.216);   // #D4AF37
const CREAM   = rgb(0.980, 0.976, 0.965);   // #FAF9F6
const WHITE   = rgb(1, 1, 1);
const BLACK   = rgb(0, 0, 0);
const GRAY    = rgb(0.38, 0.38, 0.38);
const LGRAY   = rgb(0.91, 0.91, 0.91);
const MGOLD   = rgb(0.95, 0.88, 0.60);     // gold claro para fundo de header
const EMERALD = rgb(0.05, 0.55, 0.30);
const AMBER   = rgb(0.78, 0.47, 0.06);

const PAGE_W  = 595.28;
const PAGE_H  = 841.89;
const ML      = 44;   // margem esquerda
const MR      = 44;   // margem direita
const MT      = 50;   // margem topo (após header)
const MB      = 52;   // margem rodapé
const CW      = PAGE_W - ML - MR;   // largura útil

export interface MedicoAssinatura {
  nome: string;
  /** Número de registro (CRM, COREN, CRP, CRN…) */
  crm: string;
  /** Conselho que emitiu o registro (ex: "CRM", "COREN"). Default: "CRM". */
  registrationCouncil?: string | null;
  especialidade?: string | null;
  /** Bytes brutos da imagem de assinatura (PNG ou JPEG). Null = sem assinatura. */
  signatureImageBytes?: Buffer | Uint8Array | null;
  /** MIME type da imagem — "image/png" | "image/jpeg". */
  signatureMime?: string | null;
}
export interface DietaPdfInput {
  nomePaciente: string;
  email?: string | null;
  sexo: "F" | "M";
  objetivo: string;
  estiloAlimentar?: string | null;
  pesoKg: number;
  alturaCm: number;
  idade: number;
  nivelAtividade: string;
  caloriasAlvo: number;
  tmb: number;
  tdee: number;
  dataEmissao?: string;  // YYYY-MM-DD, default = hoje BRT
  medico?: MedicoAssinatura | null;
}

interface ItemRefeicao {
  nome: string;
  medidaCaseira: string;
  pesoG: number;
  kcal: number;
  proteinaG: number;
}

interface OpcaoRefeicao {
  numero: number;
  totalKcal: number;
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
  itens: ItemRefeicao[];
}

interface RefeicaoPlano {
  id: string;
  nome: string;
  horario: string;
  subtitulo: string;
  faixaKcal: string;
  proteinaFaixa: string;
  funcaoClinica: string;
  opcoes: OpcaoRefeicao[];
}

interface Suplemento {
  nome: string;
  dose: string;
  comoUsar: string;
  seguranca: string;
}

interface PlanoGerado {
  estrategiaTexto: string;
  apresentacaoInstitucional: string;
  instrucoesPrincipais: string[];
  notaClinica: string;
  metas: {
    proteinaFaixa: string;
    carboidratoFaixa: string;
    gorduraFaixa: string;
    fibraFaixa: string;
  };
  regrasHipertrofia: string[];
  guiaTreino: Array<{ situacao: string; conduta: string }>;
  refeicoes: RefeicaoPlano[];
  suplementos: Suplemento[];
  guiaEscolhas: { priorizar: string[]; evitar: string[] };
  criteriosReavaliacao: string[];
}

// ─── Claude call ─────────────────────────────────────────────────────────────

async function gerarConteudoPlano(input: DietaPdfInput, signal?: AbortSignal): Promise<PlanoGerado> {
  const client = anthropic;

  const imc = input.pesoKg / ((input.alturaCm / 100) ** 2);
  const sexoLabel = input.sexo === "F" ? "feminino" : "masculino";
  const atividadeLabel: Record<string, string> = {
    sedentario: "Sedentário",
    leve: "Leve (1-2x/semana)",
    moderado: "Moderado (musculação 3x/semana)",
    intenso: "Intenso (5+x/semana)",
    atleta: "Atleta",
  };

  // Prompt dividido em 2 etapas para evitar JSON muito longo (>8k tokens)
  // Etapa 1: texto clínico e estrutura geral
  // Etapa 2: cardápio (refeições com 3 opções cada)
  // Aqui fazemos 1 chamada com JSON compacto
  const prompt = `Nutricionista clínico. Gere plano nutricional em JSON MINIFICADO (sem espaços extras) para:
PACIENTE: ${input.nomePaciente} | SEXO: ${sexoLabel} | ${input.idade}a | ${input.pesoKg}kg | ${input.alturaCm}cm | IMC ${imc.toFixed(1)}
ATIVIDADE: ${atividadeLabel[input.nivelAtividade] ?? input.nivelAtividade} | OBJETIVO: ${input.objetivo}
ESTILO: ${input.estiloAlimentar ?? "Low carb hiperproteica"} | META: ${input.caloriasAlvo} kcal/dia
PROTEÍNA ALVO: ${Math.round(input.pesoKg * 2.0)} g/dia (2 g/kg)

REGRAS:
- 3 opções por refeição (café, lanche manhã, almoço, lanche tarde, jantar, ceia = 6 refeições)
- Cada opção: 3-6 alimentos com peso em g, kcal, proteína
- Totais calóricos corretos (soma real dos itens)
- Textos curtos (máx 80 chars por campo de texto)
- JSON VÁLIDO E MINIFICADO

{"estrategiaTexto":"...","apresentacaoInstitucional":"...","instrucoesPrincipais":["...","...","...","...","..."],"notaClinica":"...","metas":{"proteinaFaixa":"...","carboidratoFaixa":"...","gorduraFaixa":"...","fibraFaixa":"..."},"regrasHipertrofia":["...","...","...","..."],"guiaTreino":[{"situacao":"Treino manhã","conduta":"..."},{"situacao":"Treino tarde","conduta":"..."},{"situacao":"Treino noite","conduta":"..."},{"situacao":"Sem treino","conduta":"..."}],"refeicoes":[{"id":"cafe_manha","nome":"CAFÉ DA MANHÃ","horario":"07:00–08:30","subtitulo":"Proteína desde o início","faixaKcal":"280-320 kcal","proteinaFaixa":"28-34 g","funcaoClinica":"Âncora proteica e controle de fome","opcoes":[{"numero":1,"totalKcal":310,"proteinaG":31,"carboidratoG":22,"gorduraG":12,"itens":[{"nome":"Ovo inteiro","medidaCaseira":"2 un","pesoG":100,"kcal":144,"proteinaG":12.6},{"nome":"Claras","medidaCaseira":"3 un","pesoG":90,"kcal":51,"proteinaG":10.8}]},{"numero":2,"totalKcal":315,"proteinaG":30,"carboidratoG":28,"gorduraG":8,"itens":[]},{"numero":3,"totalKcal":308,"proteinaG":32,"carboidratoG":20,"gorduraG":11,"itens":[]}]},{"id":"lanche_manha","nome":"LANCHE DA MANHÃ","horario":"10:00–10:30","subtitulo":"Opcional e modular","faixaKcal":"120-150 kcal","proteinaFaixa":"12-16 g","funcaoClinica":"Evita fome e mantém oferta proteica","opcoes":[]},{"id":"almoco","nome":"ALMOÇO","horario":"12:30–13:30","subtitulo":"Proteína magra e carboidrato medido","faixaKcal":"420-460 kcal","proteinaFaixa":"36-44 g","funcaoClinica":"Maior refeição, vegetais e amido estratégico","opcoes":[]},{"id":"lanche_tarde","nome":"LANCHE DA TARDE","horario":"15:30–16:30","subtitulo":"Pré ou pós-treino","faixaKcal":"180-220 kcal","proteinaFaixa":"18-24 g","funcaoClinica":"Suporte ao treino e meta proteica","opcoes":[]},{"id":"jantar","nome":"JANTAR","horario":"19:30–20:30","subtitulo":"Proteína alta e baixo amido","faixaKcal":"360-400 kcal","proteinaFaixa":"32-38 g","funcaoClinica":"Proteína alta, legumes e carboidrato reduzido","opcoes":[]},{"id":"ceia","nome":"CEIA","horario":"22:00–22:30","subtitulo":"Opcional, antes de dormir","faixaKcal":"90-125 kcal","proteinaFaixa":"10-14 g","funcaoClinica":"Opcional para meta proteica noturna","opcoes":[]}],"suplementos":[{"nome":"Creatina monoidratada","dose":"5 g/dia","comoUsar":"...","seguranca":"..."},{"nome":"Whey protein","dose":"25-30 g/uso","comoUsar":"...","seguranca":"..."},{"nome":"Ômega-3 (DHA)","dose":"conforme rótulo","comoUsar":"...","seguranca":"..."}],"guiaEscolhas":{"priorizar":["...","...","...","..."],"evitar":["...","...","...","..."]},"criteriosReavaliacao":["...","...","..."]}

Complete TODOS os campos com dados reais e realistas. Preencha as opcoes vazias de TODAS as 6 refeições. Responda APENAS o JSON sem texto extra.`;

  const message = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    },
    signal ? { signal } : undefined,
  );

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude não retornou JSON válido no plano nutricional");

  const raw = JSON.parse(jsonMatch[0]) as PlanoGerado;
  // Sanitize all strings recursively (WinAnsi constraint)
  return sanitizeObj(raw) as PlanoGerado;
}

// ─── Sanitizador de texto para WinAnsi (pdf-lib Helvetica) ───────────────────
// Remove/substitui caracteres fora do range WinAnsi (0x00-0xFF básico)
// Fontes padrão do pdf-lib não suportam Unicode além de Latin-1.
function safe(text: string): string {
  if (typeof text !== "string") return String(text ?? "");
  return text
    .replace(/↓/g, "(-)").replace(/↑/g, "(+)").replace(/→/g, ">").replace(/←/g, "<")
    .replace(/[▸▶►•·]/g, ">")
    .replace(/[✓✔]/g, "+")
    .replace(/[✗✘]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/\u2013/g, "-").replace(/\u2014/g, "-")
    .replace(/[""]/g, '"').replace(/['']/g, "'")
    .replace(/\u2019/g, "'").replace(/\u2018/g, "'")
    .replace(/\u201c/g, '"').replace(/\u201d/g, '"')
    .replace(/[…]/g, "...")
    .replace(/[^\x00-\xFF]/g, ""); // remove qualquer outro fora de Latin-1
}

// Sanitiza recursivamente todos os campos de string em um objeto/array
function sanitizeObj<T>(obj: T): T {
  if (typeof obj === "string") return safe(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map(sanitizeObj) as unknown as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = sanitizeObj(v);
    }
    return out as T;
  }
  return obj;
}

// ─── Utilitários de renderização ─────────────────────────────────────────────

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function drawPageHeader(page: PDFPage, fonts: Fonts, titulo: string, subtitulo: string, pageNum: number, totalPages: number) {
  page.drawRectangle({ x: 0, y: PAGE_H - 38, width: PAGE_W, height: 38, color: NAVY });
  dt(page, "PADAXOR", { x: ML, y: PAGE_H - 25, size: 11, font: fonts.bold, color: GOLD });
  dt(page, "Clinical Intelligence System", { x: ML, y: PAGE_H - 35, size: 5.5, font: fonts.regular, color: rgb(0.7, 0.7, 0.7) });
  const safeTitulo = safe(titulo);
  const safeSub = safe(subtitulo);
  dt(page, safeTitulo, { x: PAGE_W - MR - fonts.bold.widthOfTextAtSize(safeTitulo, 8.5), y: PAGE_H - 24, size: 8.5, font: fonts.bold, color: WHITE });
  dt(page, safeSub, { x: PAGE_W - MR - fonts.regular.widthOfTextAtSize(safeSub, 6), y: PAGE_H - 34, size: 6, font: fonts.regular, color: rgb(0.78, 0.78, 0.78) });
  page.drawRectangle({ x: 0, y: PAGE_H - 40, width: PAGE_W, height: 2, color: GOLD });
  const now = brtNow();
  const dateStr = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const footer = `PADAXOR - Nutricao Clinica - Documento personalizado e intransferivel - ${dateStr} - Pag. ${pageNum} de ${totalPages}`;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: MB - 4, color: NAVY });
  dt(page, footer, { x: ML, y: 18, size: 5.5, font: fonts.regular, color: rgb(0.65, 0.65, 0.65) });
}

// Wrapper seguro: qualquer texto antes de drawText passa por safe()
function dt(page: PDFPage, text: string, opts: Parameters<PDFPage["drawText"]>[1]) {
  page.drawText(safe(text), opts);
}

function drawSectionTitle(page: PDFPage, fonts: Fonts, text: string, y: number): number {
  page.drawRectangle({ x: ML, y: y - 3, width: CW, height: 18, color: NAVY });
  dt(page, text, { x: ML + 8, y: y + 3, size: 8.5, font: fonts.bold, color: GOLD });
  return y - 18 - 6;
}

function drawBullet(page: PDFPage, fonts: Fonts, text: string, y: number, indent = 0): number {
  const safeText = safe(text);
  const maxW = CW - indent - 14;
  const words = safeText.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (fonts.regular.widthOfTextAtSize(test, 7.5) > maxW) { lines.push(line); line = w; }
    else { line = test; }
  }
  if (line) lines.push(line);
  dt(page, ">", { x: ML + indent, y, size: 7, font: fonts.bold, color: GOLD });
  for (let i = 0; i < lines.length; i++) {
    dt(page, lines[i], { x: ML + indent + 10, y: y - i * 11, size: 7.5, font: fonts.regular, color: BLACK });
  }
  return y - lines.length * 11 - 4;
}

function drawTextBlock(page: PDFPage, fonts: Fonts, text: string, y: number, maxWidth = CW, size = 7.5, color = GRAY): number {
  const safeText = safe(text);
  const words = safeText.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (fonts.regular.widthOfTextAtSize(test, size) > maxWidth) { lines.push(line); line = w; }
    else { line = test; }
  }
  if (line) lines.push(line);
  for (let i = 0; i < lines.length; i++) {
    dt(page, lines[i], { x: ML, y: y - i * (size + 3.5), size, font: fonts.regular, color });
  }
  return y - lines.length * (size + 3.5) - 4;
}

function drawTableRow(page: PDFPage, fonts: Fonts, cols: string[], widths: number[], y: number, isHeader = false, isAlt = false) {
  const rowH = 14;
  const bgColor = isHeader ? NAVY : isAlt ? rgb(0.97, 0.97, 0.97) : WHITE;
  let x = ML;
  page.drawRectangle({ x: ML, y: y - rowH + 2, width: CW, height: rowH, color: bgColor });
  page.drawLine({ start: { x: ML, y: y - rowH + 2 }, end: { x: ML + CW, y: y - rowH + 2 }, thickness: 0.4, color: LGRAY });
  for (let i = 0; i < cols.length; i++) {
    const w = widths[i];
    const textColor = isHeader ? GOLD : BLACK;
    const font = isHeader ? fonts.bold : fonts.regular;
    dt(page, cols[i], { x: x + 3, y: y - rowH + 5, size: 7, font, color: textColor, maxWidth: w - 6 });
    x += w;
  }
  x = ML;
  for (let i = 0; i < cols.length - 1; i++) {
    x += widths[i];
    page.drawLine({ start: { x, y: y - rowH + 2 }, end: { x, y: y + 2 }, thickness: 0.3, color: LGRAY });
  }
  return y - rowH;
}

function drawOpcaoRefeicao(
  page: PDFPage,
  fonts: Fonts,
  opcao: OpcaoRefeicao,
  y: number,
): number {
  // Header da opção (ouro)
  const headerText = `OPÇÃO ${opcao.numero}  ·  ${opcao.totalKcal} kcal  ·  P ${opcao.proteinaG}g  ·  C ${opcao.carboidratoG}g  ·  G ${opcao.gorduraG}g`;
  page.drawRectangle({ x: ML, y: y - 3, width: CW, height: 15, color: rgb(0.20, 0.15, 0.02) });
  dt(page, headerText, { x: ML + 6, y: y + 1, size: 7, font: fonts.bold, color: GOLD });
  y -= 18;

  // Tabela de itens
  const colW = [CW * 0.36, CW * 0.26, CW * 0.10, CW * 0.14, CW * 0.14];
  y = drawTableRow(page, fonts, ["Alimento", "Medida caseira", "Peso (g)", "Calorias", "Proteína"], colW, y, true);

  for (let i = 0; i < opcao.itens.length; i++) {
    const it = opcao.itens[i];
    y = drawTableRow(page, fonts, [
      it.nome,
      it.medidaCaseira,
      `${it.pesoG} g`,
      `${it.kcal} kcal`,
      `${it.proteinaG} g`,
    ], colW, y, false, i % 2 === 1);
  }

  y -= 6;
  return y;
}

/**
 * Desenha o bloco de assinatura do médico responsável no rodapé da última
 * página. Embute a imagem da assinatura quando disponível; caso contrário,
 * renderiza linha tracejada para assinatura manuscrita.
 * Se medico for null/undefined, exibe placeholder completo para preenchimento manual.
 *
 * ATENÇÃO: esta função é async pois pode chamar page.doc.embedPng / embedJpg.
 */
async function buildRodapeAssinatura(
  page: PDFPage,
  fonts: Fonts,
  pdfDoc: PDFDocument,
  medico: MedicoAssinatura | null | undefined,
  yStart: number,
): Promise<{ y: number; imageEmbedded: boolean }> {
  const BLOCK_H = 64;
  const y = yStart;

  // Fundo navy do bloco
  page.drawRectangle({ x: ML, y: y - BLOCK_H, width: CW, height: BLOCK_H, color: NAVY });

  // Linha dourada no topo do bloco
  page.drawLine({
    start: { x: ML, y },
    end:   { x: ML + CW, y },
    thickness: 1.2,
    color: GOLD,
  });

  // Coluna esquerda: área de assinatura pictórica (imagem ou linha tracejada)
  const colW = CW * 0.44;
  dt(page, "Assinatura do Profissional Responsavel", {
    x: ML + 8, y: y - 12, size: 6, font: fonts.regular, color: rgb(0.65, 0.65, 0.65),
  });

  let imageEmbedded = false;
  if (medico?.signatureImageBytes && medico.signatureImageBytes.length > 0) {
    // Embutir imagem da assinatura
    try {
      const imgBytes = medico.signatureImageBytes instanceof Buffer
        ? new Uint8Array(medico.signatureImageBytes)
        : medico.signatureImageBytes;

      const isPng = !medico.signatureMime || medico.signatureMime === "image/png";
      const embeddedImg = isPng
        ? await pdfDoc.embedPng(imgBytes)
        : await pdfDoc.embedJpg(imgBytes);

      const imgMaxW = colW - 16;
      const imgMaxH = 36;
      const dims = embeddedImg.scaleToFit(imgMaxW, imgMaxH);
      page.drawImage(embeddedImg, {
        x: ML + 8,
        y: y - 20 - dims.height,
        width: dims.width,
        height: dims.height,
      });
      imageEmbedded = true;
    } catch {
      // Fallback: linha tracejada se a imagem não puder ser embebida
      page.drawLine({
        start: { x: ML + 8, y: y - 40 },
        end:   { x: ML + colW - 8, y: y - 40 },
        thickness: 0.5,
        color: rgb(0.40, 0.40, 0.55),
        dashArray: [3, 3],
      });
    }
  } else {
    // Sem imagem: linha tracejada para assinatura manuscrita
    page.drawLine({
      start: { x: ML + 8, y: y - 40 },
      end:   { x: ML + colW - 8, y: y - 40 },
      thickness: 0.5,
      color: rgb(0.40, 0.40, 0.55),
      dashArray: [3, 3],
    });
  }

  // Coluna direita: nome + número de registro + especialidade
  const rxStart = ML + colW + 12;
  const rxW = CW - colW - 20;

  if (medico) {
    const council = safe(medico.registrationCouncil ?? "CRM");
    dt(page, "PROFISSIONAL RESPONSAVEL PELO PLANO", {
      x: rxStart, y: y - 11, size: 5.5, font: fonts.bold, color: rgb(0.65, 0.65, 0.65),
    });
    dt(page, safe(medico.nome), {
      x: rxStart, y: y - 25, size: 9, font: fonts.bold, color: WHITE, maxWidth: rxW,
    });
    dt(page, `${council} ${safe(medico.crm)}`, {
      x: rxStart, y: y - 37, size: 7.5, font: fonts.regular, color: GOLD,
    });
    if (medico.especialidade) {
      dt(page, safe(medico.especialidade), {
        x: rxStart, y: y - 49, size: 6, font: fonts.italic, color: rgb(0.75, 0.75, 0.75), maxWidth: rxW,
      });
    }
  } else {
    dt(page, "PROFISSIONAL RESPONSAVEL PELO PLANO", {
      x: rxStart, y: y - 11, size: 5.5, font: fonts.bold, color: rgb(0.65, 0.65, 0.65),
    });
    page.drawLine({
      start: { x: rxStart, y: y - 28 },
      end:   { x: rxStart + rxW, y: y - 28 },
      thickness: 0.5,
      color: rgb(0.40, 0.40, 0.55),
      dashArray: [3, 3],
    });
    dt(page, "Conselho ______  N. _________________", {
      x: rxStart, y: y - 42, size: 7, font: fonts.regular, color: rgb(0.50, 0.50, 0.60),
    });
  }

  return { y: y - BLOCK_H, imageEmbedded };
}
async function buildCoverPage(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  input: DietaPdfInput,
  plano: PlanoGerado,
  pageNum: number,
  totalPages: number,
): Promise<PDFPage> {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawPageHeader(page, fonts, "Plano Nutricional Personalizado", input.nomePaciente, pageNum, totalPages);

  let y = PAGE_H - 60;

  // Título principal
  page.drawRectangle({ x: ML, y: y - 40, width: CW, height: 42, color: NAVY });
  const titulo = "PLANO ALIMENTAR PERSONALIZADO";
  const tW = fonts.bold.widthOfTextAtSize(titulo, 13);
  dt(page, titulo, { x: ML + (CW - tW) / 2, y: y - 15, size: 13, font: fonts.bold, color: WHITE });
  const sub = plano.estrategiaTexto.toUpperCase();
  const sW = fonts.regular.widthOfTextAtSize(sub, 7);
  dt(page, sub, { x: ML + (CW - Math.min(sW, CW - 10)) / 2, y: y - 28, size: 7, font: fonts.regular, color: GOLD, maxWidth: CW - 10 });
  y -= 52;

  // Data
  const hoje = input.dataEmissao ?? brtNow().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  y -= 10;

  // Grid de perfil (2 colunas)
  const gridW = CW / 2 - 4;
  const rows: Array<[string, string, string, string]> = [
    ["PACIENTE", input.nomePaciente, "META ENERGÉTICA", `${input.caloriasAlvo} kcal/dia`],
    ["SEXO / IDADE", `${input.sexo === "F" ? "Feminino" : "Masculino"} · ${input.idade} anos`, "PROTEÍNA PLANEJADA", plano.metas.proteinaFaixa],
    ["PESO / ALTURA", `${input.pesoKg} kg · ${input.alturaCm} cm`, "CARBOIDRATOS", plano.metas.carboidratoFaixa],
    ["ATIVIDADE", input.nivelAtividade.charAt(0).toUpperCase() + input.nivelAtividade.slice(1), "GORDURAS", plano.metas.gorduraFaixa],
    ["OBJETIVO", input.objetivo, "FIBRA DIÁRIA", plano.metas.fibraFaixa],
    ["DATA DE EMISSÃO", hoje, "REAVALIAÇÃO", "A cada 8 semanas ou conforme protocolo"],
  ];

  for (const [lk, lv, rk, rv] of rows) {
    page.drawRectangle({ x: ML, y: y - 18, width: gridW, height: 20, color: rgb(0.94, 0.92, 0.80) });
    dt(page, lk, { x: ML + 4, y: y - 8, size: 6.5, font: fonts.bold, color: NAVY });
    dt(page, lv, { x: ML + 4, y: y - 16, size: 7.5, font: fonts.regular, color: BLACK, maxWidth: gridW - 8 });

    page.drawRectangle({ x: ML + gridW + 8, y: y - 18, width: gridW, height: 20, color: rgb(0.94, 0.92, 0.80) });
    dt(page, rk, { x: ML + gridW + 12, y: y - 8, size: 6.5, font: fonts.bold, color: NAVY });
    dt(page, rv, { x: ML + gridW + 12, y: y - 16, size: 7.5, font: fonts.regular, color: BLACK, maxWidth: gridW - 8 });
    y -= 24;
  }

  y -= 10;

  // TMB / TDEE box
  page.drawRectangle({ x: ML, y: y - 32, width: CW, height: 34, color: NAVY });
  const labels = [
    { l: "TMB (Repouso)", v: `${input.tmb} kcal` },
    { l: "TDEE (Total)", v: `${input.tdee} kcal` },
    { l: "Meta Diária", v: `${input.caloriasAlvo} kcal` },
    { l: "Deficit / Superavit", v: `${Math.abs(input.caloriasAlvo - input.tdee)} kcal ${input.caloriasAlvo < input.tdee ? "(deficit)" : "(superavit)"}` },
  ];
  const bw = CW / labels.length;
  for (let i = 0; i < labels.length; i++) {
    const { l, v } = labels[i];
    const bx = ML + i * bw;
    if (i > 0) page.drawLine({ start: { x: bx, y: y - 30 }, end: { x: bx, y: y - 2 }, thickness: 0.4, color: rgb(0.25, 0.25, 0.35) });
    dt(page, l, { x: bx + 6, y: y - 12, size: 6, font: fonts.regular, color: rgb(0.72, 0.72, 0.72) });
    dt(page, v, { x: bx + 6, y: y - 22, size: 9.5, font: fonts.bold, color: GOLD });
  }
  y -= 44;

  // Apresentação institucional
  y = drawSectionTitle(page, fonts, "APRESENTAÇÃO INSTITUCIONAL", y);
  y = drawTextBlock(page, fonts, plano.apresentacaoInstitucional, y, CW, 7.5, BLACK);
  y -= 6;

  // Como utilizar
  y = drawSectionTitle(page, fonts, "COMO UTILIZAR O PLANO", y);
  for (const instr of plano.instrucoesPrincipais) {
    y = drawBullet(page, fonts, instr, y);
    if (y < MB + 20) break;
  }
  y -= 6;

  // Nota clínica
  if (y > MB + 60) {
    page.drawRectangle({ x: ML, y: y - 48, width: CW, height: 50, color: rgb(0.98, 0.96, 0.88) });
    page.drawRectangle({ x: ML, y: y - 48, width: 3, height: 50, color: GOLD });
    dt(page, "NOTA CLÍNICA IMPORTANTE", { x: ML + 8, y: y - 10, size: 7, font: fonts.bold, color: NAVY });
    drawTextBlock(page, fonts, plano.notaClinica, y - 22, CW - 12, 7, GRAY);
  }

  return page;
}

async function buildStrategyPage(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  input: DietaPdfInput,
  plano: PlanoGerado,
  pageNum: number,
  totalPages: number,
): Promise<PDFPage> {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawPageHeader(page, fonts, "Plano Nutricional Personalizado", input.nomePaciente, pageNum, totalPages);

  let y = PAGE_H - 55;

  // META OPERACIONAL DO DIA
  y = drawSectionTitle(page, fonts, "ESTRATÉGIA ENERGÉTICA E DISTRIBUIÇÃO POR REFEIÇÃO", y);
  y -= 4;

  // Tabela de meta por refeição
  const metaCols = [CW * 0.25, CW * 0.22, CW * 0.22, CW * 0.31];
  y = drawTableRow(page, fonts, ["Refeição", "Faixa calórica", "Proteína", "Função clínica"], metaCols, y, true);
  const refMetaRows: Array<[string, string, string, string]> = [];
  for (const ref of plano.refeicoes) {
    refMetaRows.push([ref.nome.replace(/^\s+/, ""), ref.faixaKcal, ref.proteinaFaixa, ref.funcaoClinica]);
  }
  for (let i = 0; i < refMetaRows.length; i++) {
    y = drawTableRow(page, fonts, refMetaRows[i], metaCols, y, false, i % 2 === 1);
  }
  y -= 12;

  // Faixa de macros
  y = drawSectionTitle(page, fonts, "FAIXA ESTIMADA DE MACRONUTRIENTES", y);
  y -= 4;
  const macroData = [
    { l: "PROTEÍNA", v: plano.metas.proteinaFaixa, desc: "Distribuída ao longo do dia. Pelo menos 25g por refeição principal." },
    { l: "CARBOIDRATOS", v: plano.metas.carboidratoFaixa, desc: "Concentrados ao redor do treino. Fontes: frutas, leguminosas, tubérculos, aveia integral." },
    { l: "GORDURAS", v: plano.metas.gorduraFaixa, desc: "Priorizar azeite, peixes, sementes, castanhas e abacate." },
    { l: "FIBRA", v: plano.metas.fibraFaixa, desc: "Progredir conforme tolerância intestinal e hidratação." },
  ];
  const mw = CW / 4 - 3;
  const mxStart = ML;
  for (let i = 0; i < macroData.length; i++) {
    const { l, v, desc } = macroData[i];
    const mx = mxStart + i * (mw + 4);
    page.drawRectangle({ x: mx, y: y - 55, width: mw, height: 57, color: NAVY });
    dt(page, l, { x: mx + 4, y: y - 12, size: 6, font: fonts.bold, color: GOLD });
    dt(page, v, { x: mx + 4, y: y - 24, size: 8.5, font: fonts.bold, color: WHITE });
    dt(page, desc, { x: mx + 4, y: y - 36, size: 5.8, font: fonts.regular, color: rgb(0.75, 0.75, 0.75), maxWidth: mw - 8 });
  }
  y -= 68;

  // Regras para hipertrofia
  y = drawSectionTitle(page, fonts, "REGRAS PARA DEFINIÇÃO E HIPERTROFIA", y);
  for (const regra of plano.regrasHipertrofia) {
    y = drawBullet(page, fonts, regra, y);
  }
  y -= 8;

  // Guia de treino
  y = drawSectionTitle(page, fonts, "GUIA DE AJUSTE POR HORÁRIO DE TREINO", y);
  y -= 4;
  const gtCols = [CW * 0.30, CW * 0.70];
  y = drawTableRow(page, fonts, ["Situação", "Conduta prática"], gtCols, y, true);
  for (let i = 0; i < plano.guiaTreino.length; i++) {
    const { situacao, conduta } = plano.guiaTreino[i];
    y = drawTableRow(page, fonts, [situacao, conduta], gtCols, y, false, i % 2 === 1);
  }
  y -= 12;

  // Cálculo energético (box)
  if (y > MB + 80) {
    page.drawRectangle({ x: ML, y: y - 70, width: CW, height: 72, color: rgb(0.97, 0.97, 0.97) });
    page.drawRectangle({ x: ML, y: y - 70, width: 3, height: 72, color: GOLD });
    dt(page, "BASE DE CÁLCULO (MIFFLIN-ST JEOR)", { x: ML + 8, y: y - 12, size: 7, font: fonts.bold, color: NAVY });
    const calcLines = [
      `TMB: 10 × ${input.pesoKg} + 6,25 × ${input.alturaCm} − 5 × ${input.idade} ${input.sexo === "F" ? "− 161" : "+ 5"} = ${input.tmb} kcal`,
      `TDEE: ${input.tmb} × fator atividade = ${input.tdee} kcal/dia`,
      `Meta (objetivo ${input.objetivo}): ${input.tdee} × fator = ${input.caloriasAlvo} kcal/dia`,
      `Proteína planejada: ${(input.pesoKg * 2.0).toFixed(0)} g/dia (2,0 g/kg · ajustável por resposta)`,
    ];
    let cy = y - 25;
    for (const cl of calcLines) {
      dt(page, cl, { x: ML + 8, y: cy, size: 7, font: fonts.regular, color: GRAY, maxWidth: CW - 16 });
      cy -= 12;
    }
  }

  return page;
}

async function buildRefeicaoPage(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  input: DietaPdfInput,
  ref: RefeicaoPlano,
  pageNum: number,
  totalPages: number,
): Promise<PDFPage> {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawPageHeader(page, fonts, "Plano Nutricional Personalizado", input.nomePaciente, pageNum, totalPages);

  let y = PAGE_H - 55;

  // Header da refeição
  page.drawRectangle({ x: ML, y: y - 38, width: CW, height: 40, color: NAVY });
  dt(page, ref.nome, { x: ML + 8, y: y - 12, size: 12, font: fonts.bold, color: GOLD });
  dt(page, ref.subtitulo, { x: ML + 8, y: y - 24, size: 8, font: fonts.regular, color: CREAM });
  dt(page, `Horário sugerido: ${ref.horario}  ·  ${ref.faixaKcal}  ·  Proteína: ${ref.proteinaFaixa}`, {
    x: ML + 8, y: y - 34, size: 6.5, font: fonts.regular, color: rgb(0.78, 0.78, 0.78)
  });
  y -= 50;

  // 3 opções
  for (const opcao of ref.opcoes.slice(0, 3)) {
    if (y < MB + 80) break;
    y = drawOpcaoRefeicao(page, fonts, opcao, y);
    y -= 8;
  }

  return page;
}

async function buildSuplementacaoPage(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  input: DietaPdfInput,
  plano: PlanoGerado,
  pageNum: number,
  totalPages: number,
  medico?: MedicoAssinatura | null,
): Promise<{ page: PDFPage; signatureImageEmbedded: boolean }> {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawPageHeader(page, fonts, "Plano Nutricional Personalizado", input.nomePaciente, pageNum, totalPages);

  let y = PAGE_H - 55;

  // Suplementação
  y = drawSectionTitle(page, fonts, "SUPLEMENTAÇÃO ESTRUTURADA", y);
  y -= 4;
  const supCols = [CW * 0.20, CW * 0.15, CW * 0.33, CW * 0.32];
  y = drawTableRow(page, fonts, ["Suplemento", "Dose", "Como usar", "Segurança"], supCols, y, true);
  for (let i = 0; i < plano.suplementos.length; i++) {
    const s = plano.suplementos[i];
    y = drawTableRow(page, fonts, [s.nome, s.dose, s.comoUsar, s.seguranca], supCols, y, false, i % 2 === 1);
  }
  y -= 12;

  // Hidratação box
  page.drawRectangle({ x: ML, y: y - 40, width: CW, height: 42, color: NAVY });
  dt(page, "HIDRATAÇÃO E ELETRÓLITOS", { x: ML + 8, y: y - 12, size: 8, font: fonts.bold, color: GOLD });
  dt(page, "Meta: 35-40 mL/kg de peso corporal por dia. Aumentar nos dias de treino e clima quente.", {
    x: ML + 8, y: y - 24, size: 7, font: fonts.regular, color: CREAM, maxWidth: CW - 16
  });
  dt(page, "Sódio, magnésio e potássio via alimentação natural; suplementar somente se sintomático e sob orientação.", {
    x: ML + 8, y: y - 34, size: 7, font: fonts.regular, color: rgb(0.75, 0.75, 0.75), maxWidth: CW - 16
  });
  y -= 54;

  // Guia rápido de escolhas
  y = drawSectionTitle(page, fonts, "GUIA RÁPIDO DE ESCOLHAS", y);
  y -= 4;
  const halfW = (CW - 8) / 2;

  page.drawRectangle({ x: ML, y: y - 6, width: halfW, height: 14, color: EMERALD });
  dt(page, "PRIORIZAR", { x: ML + 6, y: y - 2, size: 7.5, font: fonts.bold, color: WHITE });
  page.drawRectangle({ x: ML + halfW + 8, y: y - 6, width: halfW, height: 14, color: rgb(0.65, 0.10, 0.10) });
  dt(page, "EVITAR PRINCIPALMENTE", { x: ML + halfW + 14, y: y - 2, size: 7.5, font: fonts.bold, color: WHITE });
  y -= 20;

  const maxItems = Math.max(plano.guiaEscolhas.priorizar.length, plano.guiaEscolhas.evitar.length);
  for (let i = 0; i < Math.min(maxItems, 7); i++) {
    const pri = plano.guiaEscolhas.priorizar[i] ?? "";
    const evi = plano.guiaEscolhas.evitar[i] ?? "";
    if (pri) {
      dt(page, "+", { x: ML + 2, y, size: 7, font: fonts.bold, color: EMERALD });
      dt(page, pri, { x: ML + 12, y, size: 7, font: fonts.regular, color: BLACK, maxWidth: halfW - 16 });
    }
    if (evi) {
      dt(page, "x", { x: ML + halfW + 10, y, size: 7, font: fonts.bold, color: rgb(0.65, 0.10, 0.10) });
      dt(page, evi, { x: ML + halfW + 20, y, size: 7, font: fonts.regular, color: BLACK, maxWidth: halfW - 24 });
    }
    y -= 12;
  }
  y -= 8;

  // Tabela de acompanhamento
  y = drawSectionTitle(page, fonts, "TABELA DE ACOMPANHAMENTO — 8 SEMANAS", y);
  y -= 4;
  const semCols = [CW * 0.08, CW * 0.14, CW * 0.12, CW * 0.12, CW * 0.16, CW * 0.16, CW * 0.22];
  y = drawTableRow(page, fonts, ["Sem.", "Peso (kg)", "Cintura", "Variação", "Treino/Força", "Adesão/Prot.", "Observações"], semCols, y, true);
  for (let i = 1; i <= 8; i++) {
    y = drawTableRow(page, fonts, [String(i), "", "", "", "", "", ""], semCols, y, false, i % 2 === 0);
  }
  y -= 12;

  // Critérios de reavaliação
  if (y > MB + 60) {
    y = drawSectionTitle(page, fonts, "CRITÉRIOS DE REAVALIAÇÃO", y);
    for (const crit of plano.criteriosReavaliacao) {
      if (y < MB + 20) break;
      y = drawBullet(page, fonts, crit, y);
    }
    y -= 6;
  }

  // ─── Assinatura médica (sempre na última página) ──────────────────────────
  // Reservar 68px acima do rodapé impresso (MB). Se não houver espaço, empurra
  // o bloco logo acima do footer do header (mínimo visível).
  const sigY = Math.max(y > MB + 70 ? y : MB + 70, MB + 70);
  const { imageEmbedded: signatureImageEmbedded } = await buildRodapeAssinatura(page, fonts, pdfDoc, medico, sigY);

  return { page, signatureImageEmbedded };
}

// ─── Ponto de entrada público ─────────────────────────────────────────────────

/**
 * Gera o PDF completo do plano nutricional para um paciente.
 * Retorna os bytes do PDF.
 */
export interface DietaPdfResultado {
  pdfBytes: Uint8Array;
  plano: PlanoGerado;
  /**
   * true  = imagem de assinatura embebida com sucesso.
   * false = fallback para linha tracejada (sem imagem cadastrada ou erro ao embutir).
   */
  signatureImageEmbedded: boolean;
}

export async function gerarDietaPdf(input: DietaPdfInput, signal?: AbortSignal): Promise<DietaPdfResultado> {
  // 1. Gerar conteúdo via Claude
  const plano = await gerarConteudoPlano(input, signal);

  // 2. Calcular total de páginas
  const totalPages = 2 + plano.refeicoes.length + 1; // capa + estratégia + 1/refeição + suplementação

  // 3. Montar o documento
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fonts: Fonts = { regular, bold, italic };

  // Metadata
  pdfDoc.setTitle(`Plano Nutricional — ${input.nomePaciente}`);
  pdfDoc.setAuthor("PADAXOR Clinical Intelligence System");
  pdfDoc.setSubject("Plano Alimentar Personalizado");
  pdfDoc.setCreator("PADAXOR · Instituto Pádua");
  pdfDoc.setLanguage("pt-BR");

  let pageNum = 1;

  // Página 1: Capa
  await buildCoverPage(pdfDoc, fonts, input, plano, pageNum++, totalPages);

  // Página 2: Estratégia
  await buildStrategyPage(pdfDoc, fonts, input, plano, pageNum++, totalPages);

  // Páginas 3-8: Refeições
  for (const ref of plano.refeicoes) {
    await buildRefeicaoPage(pdfDoc, fonts, input, ref, pageNum++, totalPages);
  }

  // Última página: Suplementação + Monitoramento + Assinatura
  const { signatureImageEmbedded } = await buildSuplementacaoPage(pdfDoc, fonts, input, plano, pageNum, totalPages, input.medico);

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, plano, signatureImageEmbedded };
}
