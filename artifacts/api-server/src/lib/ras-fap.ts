/**
 * RAS FAP — gerador (Paxter).
 *
 * RAS = Registro de Administracao de Substancias (titulo impresso do documento).
 * FAP = Formulario de Auditoria de Procedimentos (papel fisico, preenchido a
 *       caneta na sala no momento da aplicacao).
 * PDF = arquivo de documento. A4 landscape = folha A4 deitada.
 *
 * MOTOR DA GRADE: copiado IDENTICO da fonte-da-verdade do IHE (rasFap.ts) — as
 * 7 regras de ouro vivem em montarGrade / planejarPaginasRasFap e NAO devem ser
 * editadas. O que muda aqui e SO o desenho (estetica elegante/classica + regras
 * visuais do CEO Dr. Caio):
 *   1) SEMPRE 5 colunas de substancia por folha (largura fixa = (CW-FIXED_W)/5);
 *      acima de 5 -> nova folha; sobras na ultima folha ficam EM BRANCO para
 *      nao perder alinhamento.
 *   2) Cada bloco de informacao tem MOLDURA GROSSA so na caixa externa.
 *   3) Faixa de assinaturas em CAIXAS retangulares; profissionais com espaco
 *      para CARIMBO.
 *
 * Motor pdfkit (controle exato de tabela; puppeteer nao roda neste ambiente).
 */
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

// Site institucional do Paxter (placeholder). QR no rodape do RAS FAP aponta aqui
// para que medicos/farmacias achem o sistema. Trocar so esta linha quando o site existir.
const PAXTER_SITE_URL = "https://paxter.com.br";

// ---------------------------------------------------------------------------
// Tipos (NAO renomear — regra de ferro do CEO)
// ---------------------------------------------------------------------------
export interface SubstanciaFap {
  nome: string; // ex: "COENZIMA Q10"
  dose?: string; // ex: "200MG"
  sessoes: number; // total de aplicacoes (o "total" da fracao N/total)
  frequenciaDias: number; // intervalo de repeticao em DIAS
  inicio: Date; // data da 1a aplicacao
  via?: string; // ex: "EV", "IM", "SC" (opcional)
}

export interface DadosRasFap {
  nome: string;
  cpf?: string;
  celular?: string;
  idade?: string;
  medicoResponsavel: string;
  enfermeira: string;
  unidade: string;
  dataAtendimento: Date;
  protocoloNumero?: string;
  valorTratamento?: number; // em reais
  substancias: SubstanciaFap[];
}

export type ModoRasFap = "PREMIUM" | "SIMPLES" | "MARCA" | "MINIMAL" | "BRONZE";

// ---------------------------------------------------------------------------
// Helpers de data e texto
// ---------------------------------------------------------------------------
function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}
function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtData(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtMoeda(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
// Acentos PRESERVADOS no documento (pedido do CEO). O data bind NUNCA dependeu
// do texto exibido: as colunas fixas sao preenchidas por CHAVE de codigo (c.key)
// e os valores por funcoes (ln.valor / dados.campo). Acentuar e 100% seguro.

// ===========================================================================
// MOTOR DA GRADE — COPIA IDENTICA DO IHE (rasFap.ts). NAO EDITAR A LOGICA.
// Regra Ouro: numa mesma semana ISO (segunda a domingo) o paciente vai UMA
// unica vez a clinica. Todas as substancias cujas datas brutas caem naquela
// semana sao consolidadas no PRIMEIRO dia previsto da semana. A coluna SEM e o
// numero sequencial da ida (Opcao A): continuo, que CRUZA paginas.
// ===========================================================================
export interface LinhaGrade {
  numero: number;
  data?: Date;
  contadores: (string | null)[]; // por substancia (na ordem do grupo)
}

// Segunda-feira (inicio) da semana ISO da data informada.
function segundaDaSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (r.getDay() + 6) % 7; // 0 = segunda ... 6 = domingo
  r.setDate(r.getDate() - dow);
  return r;
}

export function montarGrade(subs: SubstanciaFap[], minLinhas = 20): LinhaGrade[] {
  // 1) Datas brutas por substancia (com indice da sessao).
  interface Bruta {
    data: Date;
    si: number;
    sessao: number;
  }
  const brutas: Bruta[] = [];
  subs.forEach((s, si) => {
    for (let k = 0; k < s.sessoes; k++) {
      brutas.push({ data: addDays(s.inicio, k * s.frequenciaDias), si, sessao: k + 1 });
    }
  });

  // 2) Agrupa por semana ISO (segunda como dia 1).
  const semanas = new Map<string, Bruta[]>();
  for (const b of brutas) {
    const chave = chaveDia(segundaDaSemana(b.data));
    const arr = semanas.get(chave);
    if (arr) arr.push(b);
    else semanas.set(chave, [b]);
  }

  // 3) Para cada semana: 1a data prevista + consolida os contadores das subs.
  const consolidadas = Array.from(semanas.values()).map((items) => {
    const data = items.reduce((a, b) => (a.data <= b.data ? a : b)).data;
    const contadores = subs.map((s, si) => {
      const sessoes = items
        .filter((it) => it.si === si)
        .map((it) => it.sessao)
        .sort((a, b) => a - b);
      if (sessoes.length === 0) return null;
      // Em geral 1 sessao por semana. Se a frequencia for < 7 dias e cair mais de
      // uma na mesma semana, lista TODAS (ex.: "1\u00b72\u00b73/4") — nunca perde dado.
      return `${sessoes.join("\u00b7")}/${s.sessoes}`;
    });
    return { data, contadores };
  });
  consolidadas.sort((a, b) => a.data.getTime() - b.data.getTime());

  const linhas: LinhaGrade[] = consolidadas.map((c, idx) => ({
    numero: idx + 1,
    data: c.data,
    contadores: c.contadores,
  }));

  while (linhas.length < minLinhas) {
    linhas.push({ numero: linhas.length + 1, contadores: subs.map(() => null) });
  }
  return linhas;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export interface PaginaRasFap {
  grupo: SubstanciaFap[];
  linhas: LinhaGrade[];
}

/**
 * Planeja as paginas a partir de uma AGENDA GLOBAL unica (Opcao A): o numero da
 * ida (SEM) e a data sao consolidados de TODAS as substancias e a numeracao e
 * sequencial, continua e CRUZA paginas. Cada grupo de ate 5 substancias apenas
 * PROJETA suas colunas sobre essa agenda, preservando o SEM global e descartando
 * as idas em que nenhuma substancia do grupo se aplica (pagina seguinte sai com
 * lacunas: SEM 1, 3, 5... e isso e CORRETO). Padding ate 20 linhas POR PAGINA
 * com SEM em branco (linha de escrita, nao e ida real — nunca renumera).
 */
export function planejarPaginasRasFap(subs: SubstanciaFap[]): PaginaRasFap[] {
  const grupos = chunk(subs, MAX_SUBS_POR_PAGINA);
  const gradeGlobal = montarGrade(subs, 0);
  const plano: PaginaRasFap[] = [];
  for (const g of grupos) {
    const idxGlobais = g.map((s) => subs.indexOf(s));
    const linhasGrupo: LinhaGrade[] = gradeGlobal
      .map((ln) => ({
        numero: ln.numero,
        data: ln.data,
        contadores: idxGlobais.map((gi) => ln.contadores[gi]),
      }))
      .filter((ln) => ln.contadores.some((c) => c !== null));
    const paginasLinhas = chunk(linhasGrupo, LINHAS_POR_PAGINA);
    if (paginasLinhas.length === 0) paginasLinhas.push([]);
    for (const pl of paginasLinhas) {
      while (pl.length < LINHAS_POR_PAGINA) {
        pl.push({ numero: 0, contadores: g.map(() => null) });
      }
      plano.push({ grupo: g, linhas: pl });
    }
  }
  return plano;
}

// ===========================================================================
// FIM DO MOTOR IDENTICO. A partir daqui e desenho (estetica do Manager).
// ===========================================================================

// ---------------------------------------------------------------------------
// Paletas
// ---------------------------------------------------------------------------
interface Paleta {
  ink: string;
  brand: string; // navy do wordmark/cabecalho
  accent: string; // teal de apoio
  labelInk: string;
  border: string; // linhas finas internas
  frame: string; // moldura grossa externa
  gridFill: string; // tom pastel do cabecalho da grade
  protoFill: string;
  protoInk: string;
  zebra: string | null;
  aplic: string; // pintura "batalha naval" da celula aplicada
  aplicInk: string; // cor da fracao N/total sobre a pintura
  blank: string; // fundo da coluna em branco (sobra)
  // --- Estetica variavel (a "pele"); o motor da grade NAO muda ---
  bg: string; // cor do "papel" (fundo da folha)
  wordmark: "serif" | "sans"; // estilo do "RAS"
  cell: "battleship" | "center" | "tick"; // pintura da celula aplicada
  frameW: number; // grossura da moldura grossa externa
}
const PALETAS: Record<ModoRasFap, Paleta> = {
  // Tema A — PETROLEO CLASSICO (atual, aprovado): navy + teal + bronze.
  PREMIUM: {
    ink: "#1f2937",
    brand: "#0a2540",
    accent: "#0e7490",
    labelInk: "#54647a",
    border: "#aab6c6",
    frame: "#0a2540",
    gridFill: "#eaf3f7",
    protoFill: "#0a2540",
    protoInk: "#ffffff",
    zebra: "#f5f8fb",
    aplic: "#c3d7ea",
    aplicInk: "#0a2540",
    blank: "#fbfcfe",
    bg: "#ffffff",
    wordmark: "serif",
    cell: "battleship",
    frameW: 1.5,
  },
  SIMPLES: {
    ink: "#000000",
    brand: "#000000",
    accent: "#000000",
    labelInk: "#333333",
    border: "#000000",
    frame: "#000000",
    gridFill: "#ffffff",
    protoFill: "#ffffff",
    protoInk: "#000000",
    zebra: null,
    aplic: "#cfcfcf",
    aplicInk: "#000000",
    blank: "#ffffff",
    bg: "#ffffff",
    wordmark: "sans",
    cell: "tick",
    frameW: 1.2,
  },
  // Tema B — MARCA PAXTER/PADCON: verde-petroleo (#3D7A7A) + ciano (#45B8CC).
  MARCA: {
    ink: "#14342f",
    brand: "#3D7A7A",
    accent: "#2a9aad",
    labelInk: "#51716d",
    border: "#b7d3d0",
    frame: "#3D7A7A",
    gridFill: "#e6f5f7",
    protoFill: "#3D7A7A",
    protoInk: "#ffffff",
    zebra: "#f1f9f9",
    aplic: "#bfe6ec",
    aplicInk: "#1f5560",
    blank: "#fbfdfd",
    bg: "#ffffff",
    wordmark: "sans",
    cell: "center",
    frameW: 1.6,
  },
  // Tema C — CLINICO MINIMAL: monocromatico, leve/arejado, fio hairline.
  MINIMAL: {
    ink: "#1f2937",
    brand: "#111827",
    accent: "#475569",
    labelInk: "#6b7280",
    border: "#d6dbe2",
    frame: "#1f2937",
    gridFill: "#fafbfc",
    protoFill: "#eef1f4",
    protoInk: "#111827",
    zebra: null,
    aplic: "#e7ebf0",
    aplicInk: "#1f2937",
    blank: "#ffffff",
    bg: "#ffffff",
    wordmark: "serif",
    cell: "tick",
    frameW: 0.9,
  },
  // Tema D — EDITORIAL BRONZE: papel creme, tinta marrom, dourado classico.
  BRONZE: {
    ink: "#3b2f2a",
    brand: "#4a3b30",
    accent: "#9a7b4f",
    labelInk: "#6e5d4e",
    border: "#d9cbb6",
    frame: "#4a3b30",
    gridFill: "#f1e8d8",
    protoFill: "#4a3b30",
    protoInk: "#f7efe1",
    zebra: "#f7f1e6",
    aplic: "#e6d7bd",
    aplicInk: "#4a3b30",
    blank: "#f7f2e9",
    bg: "#faf7f1",
    wordmark: "serif",
    cell: "center",
    frameW: 1.4,
  },
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const M = 24;
// Faixa lateral esquerda (RAS/FAP) reserva BAND_W; o CONTEUDO comeca em ML.
// Margem direita/topo/base seguem M. CW recalculado (assimetrico).
const BAND_W = 30;
const ML = M + BAND_W;
const CW = PAGE_W - ML - M;

const COLS_FIXAS = [
  { key: "sem", label: "APLIC", head: ["APLIC"], w: 26 },
  { key: "agend", label: "DATA AGENDADA", head: ["DATA", "AGENDADA"], w: 58 },
  { key: "efetiva", label: "DATA EFETIVA", head: ["DATA", "EFETIVA"], w: 58 },
  { key: "hora", label: "HORA", head: ["HORA"], w: 30 },
  { key: "cienciaPac", label: "CIÊNCIA / RUBRICA PACIENTE", head: ["CIÊNCIA / RUBRICA", "PACIENTE"], w: 120 },
  { key: "rubEnf", label: "RUBRICA ENF.", head: ["RUBRICA", "ENF."], w: 64 },
  { key: "obs", label: "OBS.", head: ["OBS."], w: 58 },
] as const;
const FIXED_W = COLS_FIXAS.reduce((a, c) => a + c.w, 0);

const MAX_SUBS_POR_PAGINA = 5;
const LINHAS_POR_PAGINA = 20;
// Largura FIXA da coluna de substancia: SEMPRE como se houvesse 5 (regra do CEO).
const SUB_W = (CW - FIXED_W) / MAX_SUBS_POR_PAGINA;

type Doc = InstanceType<typeof PDFDocument>;

// Preenche o grupo ate 5 slots; posicoes vazias = null (coluna em branco).
function slots5(grupo: SubstanciaFap[]): (SubstanciaFap | null)[] {
  const out: (SubstanciaFap | null)[] = [];
  for (let i = 0; i < MAX_SUBS_POR_PAGINA; i++) out.push(grupo[i] ?? null);
  return out;
}

function celula(
  doc: Doc,
  pal: Paleta,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    text?: string;
    fill?: string;
    bold?: boolean;
    serif?: boolean;
    size?: number;
    align?: "left" | "center" | "right";
    color?: string;
    border?: boolean;
    wrap?: boolean;
    valign?: "middle" | "top";
    spacing?: number;
  } = {},
) {
  if (opts.fill) doc.rect(x, y, w, h).fill(opts.fill);
  if (opts.border !== false) doc.lineWidth(0.4).rect(x, y, w, h).stroke(pal.border);
  if (opts.text) {
    const size = opts.size ?? 7;
    const wrap = opts.wrap ?? false;
    // Centragem vertical real: a altura visivel da maiuscula ~0.72*size, entao
    // centramos por essa metrica (item ouro do CEO: texto no meio da celula).
    const ty = opts.valign === "top" ? y + 2.5 : y + (h - size * 0.72) / 2;
    const font = opts.serif
      ? opts.bold
        ? "Times-Bold"
        : "Times-Roman"
      : opts.bold
        ? "Helvetica-Bold"
        : "Helvetica";
    doc
      .font(font)
      .fontSize(size)
      .fillColor(opts.color ?? pal.ink)
      .text(opts.text, x + 3, ty, {
        width: w - 6,
        align: opts.align ?? "left",
        lineBreak: wrap,
        height: wrap ? h - 3 : undefined,
        ellipsis: false,
        characterSpacing: opts.spacing ?? 0,
      });
  }
}

// Cabecalho de coluna FIXA: mesma fonte, tamanho e altura em TODAS as colunas
// (Helvetica-Bold 6, centralizado vertical e horizontal), multi-linha, para
// harmonia (regra do CEO). As linhas ja vem pre-quebradas em COLS_FIXAS.head.
function cabecalhoFixo(
  doc: Doc,
  pal: Paleta,
  x: number,
  y: number,
  w: number,
  h: number,
  lines: readonly string[],
): void {
  doc.rect(x, y, w, h).fill(pal.gridFill);
  doc.lineWidth(0.4).rect(x, y, w, h).stroke(pal.border);
  const size = 6;
  const lh = size + 1.7;
  const blockH = lines.length * lh;
  let ty = y + (h - blockH) / 2 + 0.3;
  doc.font("Helvetica-Bold").fontSize(size).fillColor(pal.labelInk);
  for (const ln of lines) {
    doc.text(ln, x + 2, ty, {
      width: w - 4,
      align: "center",
      lineBreak: false,
      characterSpacing: 0.3,
    });
    ty += lh;
  }
}

// Moldura grossa SO na caixa externa do bloco (regra do CEO).
function molduraBloco(doc: Doc, pal: Paleta, x: number, y: number, w: number, h: number) {
  doc.lineWidth(pal.frameW).rect(x, y, w, h).stroke(pal.frame);
}

function rotulo(doc: Doc, pal: Paleta, texto: string, x: number, y: number) {
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(pal.accent)
    .text(texto, x, y, { lineBreak: false, characterSpacing: 1.3 });
}

function desenharCabecalho(doc: Doc, pal: Paleta, y: number): number {
  const rEnd = PAGE_W - M;

  // --- Cabecalho-titulo: RAS FAP (esquerda) e marcas PAXTER/PADCON (direita)
  //     no MESMO NIVEL, centralizados verticalmente um ao outro (pedido do CEO).
  const bandH = 30;
  const yc = y + bandH / 2; // linha de centro comum aos dois lados

  // Esquerda: wordmark "RAS FAP" + 2 descritivos, centralizados em yc.
  const wmSize = 23;
  const wmFont = pal.wordmark === "serif" ? "Times-Bold" : "Helvetica-Bold";
  doc.font(wmFont).fontSize(wmSize).fillColor(pal.brand).text("RAS FAP", ML, yc - (wmSize * 0.72) / 2, { lineBreak: false, characterSpacing: pal.wordmark === "serif" ? 0 : 1 });
  const dx = ML + doc.widthOfString("RAS FAP") + 18;
  doc.font("Helvetica").fontSize(8.5).fillColor(pal.ink).text("Registro de Administração de Substâncias.", dx, yc - 8, { lineBreak: false, characterSpacing: 0.3 });
  doc.font("Helvetica-Oblique").fontSize(6.8).fillColor(pal.labelInk).text("Formulário de Auditoria de Procedimentos.", dx + 16, yc + 2.5, { lineBreak: false, characterSpacing: 0.3 });

  // Direita: PAXTER e PADCON lado a lado, cada um com tagline em ingles
  // DESTACADA (cor de acento). Bloco (marca + tagline) centralizado em yc, no
  // MESMO NIVEL do wordmark. PAXTER = sistema clinico; PADCON = empresa-raiz
  // de tecnologia (holding que cria varias empresas de tecnologia).
  const colW = 190;
  const colAx = rEnd - 400; // coluna PAXTER (borda direita em rEnd-210)
  const colBx = rEnd - colW; // coluna PADCON (borda direita em rEnd)
  const brandSize = 9.5;
  const tagSize = 6.5;
  const gapBT = 3;
  const blockH = brandSize * 0.72 + gapBT + tagSize * 0.72;
  const yBrand = yc - blockH / 2;
  const yTag = yBrand + brandSize * 0.72 + gapBT;
  doc.font("Helvetica-Bold").fontSize(brandSize).fillColor(pal.brand).text("PAXTER", colAx, yBrand, { width: colW, align: "right", lineBreak: false, characterSpacing: 0.5 });
  doc.font("Helvetica-Bold").fontSize(brandSize).fillColor(pal.brand).text("PADCON", colBx, yBrand, { width: colW, align: "right", lineBreak: false, characterSpacing: 0.5 });
  doc.font("Helvetica-Bold").fontSize(tagSize).fillColor(pal.accent).text("CLINICAL INTELLIGENCE SYSTEM", colAx, yTag, { width: colW, align: "right", lineBreak: false, characterSpacing: 1.1 });
  doc.font("Helvetica-Bold").fontSize(tagSize).fillColor(pal.accent).text("ADVANCED SYSTEMS ARCHITECTURE", colBx, yTag, { width: colW, align: "right", lineBreak: false, characterSpacing: 1.3 });

  // Fio unico fino de ponta a ponta.
  const yl = y + bandH + 4;
  doc.lineWidth(0.8).moveTo(ML, yl).lineTo(PAGE_W - M, yl).stroke(pal.accent);
  return yl + 8;
}

function desenharPaciente(doc: Doc, pal: Paleta, dados: DadosRasFap, y: number): number {
  const rowH = 14;
  const nRows = 5;
  const blocoH = rowH * nRows;
  const half = CW / 2;
  const labelW = 122;

  // Linhas internas finas + divisoria central.
  doc.lineWidth(0.5).moveTo(ML + half, y).lineTo(ML + half, y + blocoH).stroke(pal.border);

  const esq: [string, string][] = [
    ["NOME", dados.nome],
    ["CPF", dados.cpf || ""],
    ["CELULAR", dados.celular || ""],
    ["MÉDICO RESPONSÁVEL", dados.medicoResponsavel],
    ["PROTOCOLO", dados.protocoloNumero || ""],
  ];
  const dir: [string, string][] = [
    ["IDADE", dados.idade || ""],
    ["ENFERMEIRA", dados.enfermeira],
    ["UNIDADE", dados.unidade],
    ["DATA ATENDIMENTO", fmtData(dados.dataAtendimento)],
    ["VALOR TRATAMENTO", dados.valorTratamento != null ? fmtMoeda(dados.valorTratamento) : ""],
  ];

  const linha = (x0: number, idx: number, par: [string, string]) => {
    const ly = y + idx * rowH;
    if (idx > 0) doc.lineWidth(0.3).moveTo(x0, ly).lineTo(x0 + half, ly).stroke("#d7dfe9");
    doc.font("Helvetica-Bold").fontSize(6.4).fillColor(pal.labelInk).text(par[0], x0 + 6, ly + (rowH - 6.4 * 0.72) / 2, { width: labelW - 10, lineBreak: false, characterSpacing: 0.5 });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(pal.ink).text(par[1], x0 + labelW, ly + (rowH - 8 * 0.72) / 2, { width: half - labelW - 6, lineBreak: false });
  };
  esq.forEach((p, i) => linha(ML, i, p));
  dir.forEach((p, i) => linha(ML + half, i, p));

  molduraBloco(doc, pal, ML, y, CW, blocoH);
  return y + blocoH + 7;
}

function desenharProtocolo(doc: Doc, pal: Paleta, grupo: SubstanciaFap[], y: number): number {
  rotulo(doc, pal, "PROTOCOLO", ML, y);
  const cyTop = y + 11;
  let cy = cyTop;
  const cols = slots5(grupo);

  const linhas: { label: string; valor: (s: SubstanciaFap) => string; destaque?: boolean }[] = [
    { label: "SUBSTÂNCIAS", valor: (s) => `${s.nome}${s.dose ? " " + s.dose : ""}`, destaque: true },
    { label: "APLICAÇÕES", valor: (s) => String(s.sessoes) },
    { label: "FREQUÊNCIA", valor: (s) => `A cada ${s.frequenciaDias} dias.` },
    { label: "INÍCIO DA APLICAÇÃO", valor: (s) => fmtData(s.inicio) },
  ];

  for (const ln of linhas) {
    const rh = ln.destaque ? 22 : 15;
    celula(doc, pal, ML, cy, FIXED_W, rh, {
      text: ln.label,
      bold: true,
      size: ln.label.length > 18 ? 6.5 : 7.5,
      color: pal.labelInk,
      fill: pal.zebra ?? undefined,
      spacing: 0.4,
    });
    cols.forEach((s, i) => {
      const x = ML + FIXED_W + i * SUB_W;
      if (!s) {
        celula(doc, pal, x, cy, SUB_W, rh, { fill: pal.blank });
        return;
      }
      celula(doc, pal, x, cy, SUB_W, rh, {
        text: ln.valor(s),
        bold: true,
        size: ln.destaque ? 7 : 7.5,
        align: "center",
        fill: ln.destaque ? pal.protoFill : pal.gridFill,
        color: ln.destaque ? pal.protoInk : pal.ink,
        wrap: ln.destaque,
        valign: ln.destaque ? "top" : "middle",
      });
    });
    cy += rh;
  }
  molduraBloco(doc, pal, ML, cyTop, CW, cy - cyTop);
  return cy + 7;
}

function desenharGrade(
  doc: Doc,
  pal: Paleta,
  grupo: SubstanciaFap[],
  linhas: LinhaGrade[],
  yTopo: number,
  yRodape: number,
  aplicInicio: number,
): void {
  rotulo(doc, pal, "GRADE DE APLICAÇÕES", ML, yTopo - 11);
  const headH = 26;
  const rowH = Math.min(15, (yRodape - yTopo - headH) / LINHAS_POR_PAGINA);
  const cols = slots5(grupo);

  // Cabecalho da grade — TODAS as colunas fixas com a mesma fonte/tamanho/altura
  // (helper cabecalhoFixo), centralizadas, multi-linha, para harmonia.
  let x = ML;
  for (const c of COLS_FIXAS) {
    cabecalhoFixo(doc, pal, x, yTopo, c.w, headH, c.head);
    x += c.w;
  }
  cols.forEach((s, i) => {
    const sx = ML + FIXED_W + i * SUB_W;
    if (!s) {
      celula(doc, pal, sx, yTopo, SUB_W, headH, { fill: pal.blank });
      return;
    }
    celula(doc, pal, sx, yTopo, SUB_W, headH, {
      text: "SESSÃO",
      bold: true,
      size: 7,
      align: "center",
      fill: pal.gridFill,
      color: pal.brand,
      wrap: false,
      valign: "middle",
    });
  });

  // Linhas
  let ry = yTopo + headH;
  linhas.forEach((ln, idx) => {
    const zebra = pal.zebra && idx % 2 === 1 ? pal.zebra : undefined;
    let cx = ML;
    const fixedVals: Record<string, string> = {
      // APLIC: numeracao continua POR FOLHA (1..20, 21..40 ...), em TODAS as
      // linhas, inclusive padding (regra do CEO: aparece com ou sem aplicacao).
      sem: String(aplicInicio + idx + 1),
      agend: ln.data ? fmtData(ln.data) : "",
      hora: "",
      cienciaPac: "",
      rubEnf: "",
      efetiva: "",
      obs: "",
    };
    for (const c of COLS_FIXAS) {
      celula(doc, pal, cx, ry, c.w, rowH, {
        text: fixedVals[c.key],
        size: 6.6,
        align: c.key === "sem" || c.key === "agend" ? "center" : "left",
        bold: c.key === "sem",
        fill: zebra,
      });
      cx += c.w;
    }
    cols.forEach((s, i) => {
      const sx = ML + FIXED_W + i * SUB_W;
      if (!s) {
        celula(doc, pal, sx, ry, SUB_W, rowH, { fill: pal.blank });
        return;
      }
      const v = ln.contadores[i];
      celula(doc, pal, sx, ry, SUB_W, rowH, { fill: zebra });
      if (!v) return;
      // Espaco ao redor da barra: "1/12" -> "1 / 12" (so render; motor intacto).
      const vFmt = v.replace("/", " / ");
      const escreveFracao = (fx: number, fw: number) =>
        doc
          .font("Helvetica-Bold")
          .fontSize(6.8)
          .fillColor(pal.aplicInk)
          .text(vFmt, fx, ry + (rowH - 6.8) / 2 - 0.3, { width: fw, align: "center", lineBreak: false });
      if (pal.cell === "tick") {
        // Minimal: sem pintura, fracao centralizada na celula inteira.
        escreveFracao(sx, SUB_W);
      } else {
        // Pinta SOMENTE 1/4 (faixa marcador a esquerda); fracao nos 3/4 da direita.
        const q = SUB_W / 4;
        doc.save();
        doc.rect(sx + 0.6, ry + 0.6, q - 0.6, rowH - 1.2).fillAndStroke(pal.aplic, pal.border);
        doc.restore();
        escreveFracao(sx + q, SUB_W - q);
      }
    });
    ry += rowH;
  });

  molduraBloco(doc, pal, ML, yTopo, CW, headH + rowH * LINHAS_POR_PAGINA);
}

function desenharAssinaturas(doc: Doc, pal: Paleta, y: number, h: number): void {
  // Caixas retangulares (regra do CEO); profissionais com espaco para CARIMBO.
  const slots: { label: string; weight: number; carimbo?: boolean }[] = [
    { label: "ASSINATURA DO PACIENTE", weight: 200 },
    { label: "MÉDICO(A) RESPONSÁVEL", weight: 150 },
    { label: "CARIMBO / CRM", weight: 96, carimbo: true },
    { label: "ENFERMAGEM RESPONSÁVEL", weight: 170 },
    { label: "CARIMBO / COREN", weight: 96, carimbo: true },
  ];
  const totalWeight = slots.reduce((a, s) => a + s.weight, 0);
  const scale = CW / totalWeight;

  let x = ML;
  for (const s of slots) {
    const w = s.weight * scale;
    // Caixa interna fina.
    doc.lineWidth(0.5).rect(x, y, w, h).stroke(pal.border);
    if (s.carimbo) {
      // Area tracejada indicando "lugar do carimbo".
      doc.save();
      doc.lineWidth(0.5).dash(2.4, { space: 2 }).rect(x + 7, y + 6, w - 14, h - 20).stroke(pal.border);
      doc.undash();
      doc.restore();
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(6)
      .fillColor(pal.labelInk)
      .text(s.label, x, y + h - 9, { width: w, align: "center", lineBreak: false, characterSpacing: 0.4 });
    x += w;
  }
  // Moldura grossa externa da faixa toda.
  molduraBloco(doc, pal, ML, y, CW, h);
}

// Faixa lateral: spine vertical que mostra "RAS FAP — NOME DO PACIENTE".
// lado = "esquerda": ocupa o espaco reservado por BAND_W a esquerda de ML.
// lado = "direita":  espelhada na margem direita (M px de folga, cabe sem tocar grade).
// Rotacao -90 graus (anti-horario): texto corre de BAIXO para CIMA — giro de
// 180 graus em relacao ao +90 anterior, conforme pedido do CEO 15/07/2026.
function desenharFaixaLateral(
  doc: Doc,
  pal: Paleta,
  nome: string,
  top: number,
  bottom: number,
  lado: "esquerda" | "direita" = "esquerda",
): void {
  const bandW = BAND_W - 8; // largura visivel (folga ate o conteudo)
  const x0 = lado === "esquerda" ? M : PAGE_W - M - bandW;
  const h = bottom - top;

  // Fundo pastel + moldura fina.
  doc.save();
  doc.rect(x0, top, bandW, h).fill(pal.gridFill);
  doc.lineWidth(0.6).rect(x0, top, bandW, h).stroke(pal.accent);
  doc.restore();

  const cx = x0 + bandW / 2; // centro da espessura
  const size = 9;
  const cspc = 1;
  doc.font("Helvetica-Bold").fontSize(size);

  // Trunca se nome for longo demais.
  const avail = h - 14;
  let label = `RAS FAP   —   ${(nome || "").toUpperCase()}`;
  if (doc.widthOfString(label, { characterSpacing: cspc }) > avail) {
    while (label.length > 12 && doc.widthOfString(label + "\u2026", { characterSpacing: cspc }) > avail) {
      label = label.slice(0, -1);
    }
    label = label.replace(/\s+$/, "") + "\u2026";
  }

  // Gira -90 graus (anti-horario): texto de BAIXO para CIMA.
  // Ancora no FUNDO da faixa (padBase) para o inicio do texto ficar na base.
  const padBase = 10;
  const textW = doc.widthOfString(label, { characterSpacing: cspc });
  const cyA = bottom - padBase - textW / 2;
  doc.save();
  doc.rotate(-90, { origin: [cx, cyA] });
  doc.fillColor(pal.brand);
  doc.text(label, cx - textW / 2, cyA - size / 2, { lineBreak: false, characterSpacing: cspc });
  doc.restore();
}

function desenharRodape(doc: Doc, pal: Paleta, pageNum: number, totalPages: number, qrBuf: Buffer | null): void {
  const yb = PAGE_H - M + 2;
  doc.font("Helvetica").fontSize(6).fillColor(pal.labelInk).text("PAXTER  \u00b7  DESENVOLVIDO PELA PADCON  \u00b7  ADVANCED SYSTEMS ARCHITECTURE  \u00b7  DOCUMENTO DE AUDITORIA — PREENCHIMENTO À CANETA NA SALA.", ML, yb, { lineBreak: false, characterSpacing: 0.4 });
  const pagX = PAGE_W - M - 90;
  doc.font("Helvetica").fontSize(6.5).fillColor(pal.labelInk).text(`PAG. ${pageNum} / ${totalPages}`, pagX, yb, { width: 90, align: "right", lineBreak: false });
  // Selo QR PAXTER (best-effort): pequeno, a esquerda do indicador de pagina.
  if (qrBuf) {
    const qrSize = 18;
    const qx = pagX - qrSize - 56;
    const qy = yb - (qrSize - 8);
    try {
      doc.image(qrBuf, qx, qy, { width: qrSize, height: qrSize });
      doc.font("Helvetica-Bold").fontSize(5).fillColor(pal.labelInk).text("PAXTER", qx + qrSize + 3, qy + 2, { lineBreak: false, characterSpacing: 0.3 });
      doc.font("Helvetica").fontSize(4.5).fillColor(pal.labelInk).text("paxter.com.br", qx + qrSize + 3, qy + 9, { lineBreak: false, characterSpacing: 0.2 });
    } catch { /* nunca derruba a emissao */ }
  }
}

// ---------------------------------------------------------------------------
// Geracao
// ---------------------------------------------------------------------------
export async function gerarRasFapPdf(dados: DadosRasFap, modo: ModoRasFap = "PREMIUM"): Promise<Buffer> {
  // QR do rodape gerado uma vez (best-effort): se falhar, documento sai sem QR.
  let qrBuf: Buffer | null = null;
  try {
    qrBuf = await QRCode.toBuffer(PAXTER_SITE_URL, { width: 120, margin: 0, color: { dark: "#0d1830ff", light: "#ffffffff" } });
  } catch {
    qrBuf = null;
  }
  return new Promise((resolve, reject) => {
    const pal = PALETAS[modo] ?? PALETAS.PREMIUM;
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const bufs: Buffer[] = [];
    doc.on("data", (b: Buffer) => bufs.push(b));
    doc.on("end", () => resolve(Buffer.concat(bufs)));
    doc.on("error", reject);

    const planoPaginas = planejarPaginasRasFap(dados.substancias);
    const totalPages = planoPaginas.length;

    // APLIC continua, reiniciando a cada GRUPO de substancias (cada grupo gera
    // seu proprio conjunto de folhas). Cada folha tem exatamente
    // LINHAS_POR_PAGINA linhas (com padding), entao o passo e fixo = 20.
    let aplicBase = 0;
    let grupoAtual: SubstanciaFap[] | null = null;

    planoPaginas.forEach((p, idx) => {
      if (idx > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
      if (pal.bg !== "#ffffff") doc.rect(0, 0, PAGE_W, PAGE_H).fill(pal.bg);
      if (p.grupo !== grupoAtual) {
        grupoAtual = p.grupo;
        aplicBase = 0;
      }
      let y = M;
      y = desenharCabecalho(doc, pal, y);
      y = desenharPaciente(doc, pal, dados, y);
      y = desenharProtocolo(doc, pal, p.grupo, y);
      y += 11; // espaco para o rotulo "GRADE DE APLICACOES"
      const assinH = 42;
      const yAssin = PAGE_H - M - 12 - assinH;
      const yRodape = yAssin - 8;
      desenharGrade(doc, pal, p.grupo, p.linhas, y, yRodape, aplicBase);
      desenharAssinaturas(doc, pal, yAssin, assinH);
      desenharRodape(doc, pal, idx + 1, totalPages, qrBuf);
      desenharFaixaLateral(doc, pal, dados.nome, M, PAGE_H - M, "esquerda");
      aplicBase += LINHAS_POR_PAGINA;
    });

    doc.end();
  });
}
