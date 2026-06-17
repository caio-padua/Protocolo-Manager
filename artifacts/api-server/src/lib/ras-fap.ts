/**
 * RAS FAP — gerador (Padcon Conect).
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
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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
  gold: string; // fio bronze classico
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
  rule: "double" | "single" | "hair"; // fio sob o cabecalho
  cell: "battleship" | "center" | "tick"; // pintura da celula aplicada
  frameW: number; // grossura da moldura grossa externa
}
const PALETAS: Record<ModoRasFap, Paleta> = {
  // Tema A — PETROLEO CLASSICO (atual, aprovado): navy + teal + bronze.
  PREMIUM: {
    ink: "#1f2937",
    brand: "#0a2540",
    accent: "#0e7490",
    gold: "#b08d57",
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
    rule: "double",
    cell: "battleship",
    frameW: 1.5,
  },
  SIMPLES: {
    ink: "#000000",
    brand: "#000000",
    accent: "#000000",
    gold: "#000000",
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
    rule: "hair",
    cell: "tick",
    frameW: 1.2,
  },
  // Tema B — MARCA PADCON CONECT: verde-petroleo (#3D7A7A) + ciano (#45B8CC).
  MARCA: {
    ink: "#14342f",
    brand: "#3D7A7A",
    accent: "#2a9aad",
    gold: "#45B8CC",
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
    rule: "single",
    cell: "center",
    frameW: 1.6,
  },
  // Tema C — CLINICO MINIMAL: monocromatico, leve/arejado, fio hairline.
  MINIMAL: {
    ink: "#1f2937",
    brand: "#111827",
    accent: "#475569",
    gold: "#cbd5e1",
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
    rule: "hair",
    cell: "tick",
    frameW: 0.9,
  },
  // Tema D — EDITORIAL BRONZE: papel creme, tinta marrom, dourado classico.
  BRONZE: {
    ink: "#3b2f2a",
    brand: "#4a3b30",
    accent: "#9a7b4f",
    gold: "#b08d57",
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
    rule: "double",
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
const CW = PAGE_W - 2 * M;

const COLS_FIXAS = [
  { key: "sem", label: "SEM.", w: 26 },
  { key: "agend", label: "DATA AGEND.", w: 58 },
  { key: "hora", label: "HORA", w: 30 },
  { key: "efetiva", label: "DATA EFETIVA", w: 58 },
  { key: "cienciaPac", label: "CIENCIA / RUBRICA PACIENTE", w: 120 },
  { key: "rubEnf", label: "RUBRICA ENF.", w: 64 },
  { key: "obs", label: "OBS.", w: 58 },
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
    keepAccents?: boolean;
  } = {},
) {
  if (opts.fill) doc.rect(x, y, w, h).fill(opts.fill);
  if (opts.border !== false) doc.lineWidth(0.4).rect(x, y, w, h).stroke(pal.border);
  if (opts.text) {
    const size = opts.size ?? 7;
    const wrap = opts.wrap ?? false;
    const ty = opts.valign === "top" ? y + 2.5 : y + (h - size) / 2 - 0.5;
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
      .text(opts.keepAccents ? opts.text : semAcento(opts.text), x + 3, ty, {
        width: w - 6,
        align: opts.align ?? "left",
        lineBreak: wrap,
        height: wrap ? h - 3 : undefined,
        ellipsis: false,
        characterSpacing: opts.spacing ?? 0,
      });
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
    .text(semAcento(texto), x, y, { lineBreak: false, characterSpacing: 1.3 });
}

function desenharCabecalho(doc: Doc, pal: Paleta, y: number): number {
  // Wordmark "RAS": serif (classico/editorial) ou sans block (marca).
  if (pal.wordmark === "serif") {
    doc.font("Times-Bold").fontSize(30).fillColor(pal.brand).text("RAS", M, y - 6, { lineBreak: false });
  } else {
    doc.font("Helvetica-Bold").fontSize(27).fillColor(pal.brand).text("RAS", M, y - 4, { lineBreak: false, characterSpacing: 1.5 });
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(pal.ink)
    .text("REGISTRO DE ADMINISTRACAO DE SUBSTANCIAS", M + 70, y + 1, { lineBreak: false, characterSpacing: 0.6 });
  doc
    .font("Helvetica")
    .fontSize(6.4)
    .fillColor(pal.labelInk)
    .text("FORMULARIO DE AUDITORIA DE PROCEDIMENTOS  \u00b7  FAP", M + 70, y + 14, {
      lineBreak: false,
      characterSpacing: 1.2,
    });

  const rEnd = PAGE_W - M;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(pal.brand).text("PAWARDS", rEnd - 320, y - 2, { width: 150, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(6.2).fillColor(pal.labelInk).text("Clinical Intelligence System", rEnd - 320, y + 9, { width: 150, align: "right", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(pal.brand).text("PADCON CONECT", rEnd - 165, y - 2, { width: 165, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(6.2).fillColor(pal.labelInk).text("Motor Clinico", rEnd - 165, y + 9, { width: 165, align: "right", lineBreak: false });

  // Fio sob o cabecalho: duplo (teal+bronze) | unico grosso | hairline fino.
  const yl = y + 26;
  if (pal.rule === "double") {
    doc.lineWidth(1.2).moveTo(M, yl).lineTo(PAGE_W - M, yl).stroke(pal.accent);
    doc.lineWidth(0.5).moveTo(M, yl + 2.4).lineTo(PAGE_W - M, yl + 2.4).stroke(pal.gold);
  } else if (pal.rule === "single") {
    doc.lineWidth(1.8).moveTo(M, yl).lineTo(PAGE_W - M, yl).stroke(pal.accent);
  } else {
    doc.lineWidth(0.6).moveTo(M, yl).lineTo(PAGE_W - M, yl).stroke(pal.border);
  }
  return yl + 9;
}

function desenharPaciente(doc: Doc, pal: Paleta, dados: DadosRasFap, y: number): number {
  const rowH = 14;
  const nRows = 5;
  const blocoH = rowH * nRows;
  const half = CW / 2;
  const labelW = 122;

  // Linhas internas finas + divisoria central.
  doc.lineWidth(0.5).moveTo(M + half, y).lineTo(M + half, y + blocoH).stroke(pal.border);

  const esq: [string, string][] = [
    ["NOME", dados.nome],
    ["CPF", dados.cpf || ""],
    ["CELULAR", dados.celular || ""],
    ["MEDICO RESPONSAVEL", dados.medicoResponsavel],
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
    doc.font("Helvetica-Bold").fontSize(6.4).fillColor(pal.labelInk).text(semAcento(par[0]), x0 + 6, ly + 4.2, { width: labelW - 10, lineBreak: false, characterSpacing: 0.5 });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(pal.ink).text(semAcento(par[1]), x0 + labelW, ly + 3.4, { width: half - labelW - 6, lineBreak: false });
  };
  esq.forEach((p, i) => linha(M, i, p));
  dir.forEach((p, i) => linha(M + half, i, p));

  molduraBloco(doc, pal, M, y, CW, blocoH);
  return y + blocoH + 7;
}

function desenharProtocolo(doc: Doc, pal: Paleta, grupo: SubstanciaFap[], y: number): number {
  rotulo(doc, pal, "PROTOCOLO", M, y);
  const cyTop = y + 11;
  let cy = cyTop;
  const cols = slots5(grupo);

  const linhas: { label: string; valor: (s: SubstanciaFap) => string; destaque?: boolean }[] = [
    { label: "SUBSTANCIAS", valor: (s) => `${s.nome}${s.dose ? " " + s.dose : ""}`, destaque: true },
    { label: "APLICACOES", valor: (s) => String(s.sessoes) },
    { label: "FREQUENCIA", valor: (s) => `A cada ${s.frequenciaDias} dias` },
    { label: "INICIO DA APLICACAO", valor: (s) => fmtData(s.inicio) },
  ];

  for (const ln of linhas) {
    const rh = ln.destaque ? 22 : 15;
    celula(doc, pal, M, cy, FIXED_W, rh, {
      text: ln.label,
      bold: true,
      size: ln.label.length > 18 ? 6.5 : 7.5,
      color: pal.labelInk,
      fill: pal.zebra ?? undefined,
      spacing: 0.4,
    });
    cols.forEach((s, i) => {
      const x = M + FIXED_W + i * SUB_W;
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
  molduraBloco(doc, pal, M, cyTop, CW, cy - cyTop);
  return cy + 7;
}

function desenharGrade(
  doc: Doc,
  pal: Paleta,
  grupo: SubstanciaFap[],
  linhas: LinhaGrade[],
  yTopo: number,
  yRodape: number,
): void {
  rotulo(doc, pal, "GRADE DE APLICACOES", M, yTopo - 11);
  const headH = 26;
  const rowH = Math.min(15, (yRodape - yTopo - headH) / LINHAS_POR_PAGINA);
  const cols = slots5(grupo);

  // Cabecalho da grade
  let x = M;
  for (const c of COLS_FIXAS) {
    celula(doc, pal, x, yTopo, c.w, headH, {
      text: c.label,
      bold: true,
      size: 5.8,
      align: "center",
      fill: pal.gridFill,
      color: pal.labelInk,
      wrap: true,
      valign: "top",
    });
    x += c.w;
  }
  cols.forEach((s, i) => {
    const sx = M + FIXED_W + i * SUB_W;
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
      keepAccents: true,
    });
  });

  // Linhas
  let ry = yTopo + headH;
  linhas.forEach((ln, idx) => {
    const zebra = pal.zebra && idx % 2 === 1 ? pal.zebra : undefined;
    let cx = M;
    const fixedVals: Record<string, string> = {
      sem: ln.numero > 0 ? String(ln.numero) : "",
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
      const sx = M + FIXED_W + i * SUB_W;
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

  molduraBloco(doc, pal, M, yTopo, CW, headH + rowH * LINHAS_POR_PAGINA);
}

function desenharAssinaturas(doc: Doc, pal: Paleta, y: number, h: number): void {
  // Caixas retangulares (regra do CEO); profissionais com espaco para CARIMBO.
  const slots: { label: string; weight: number; carimbo?: boolean }[] = [
    { label: "ASSINATURA DO PACIENTE", weight: 200 },
    { label: "MEDICO(A) RESPONSAVEL", weight: 150 },
    { label: "CARIMBO / CRM", weight: 96, carimbo: true },
    { label: "ENFERMAGEM RESPONSAVEL", weight: 170 },
    { label: "CARIMBO / COREN", weight: 96, carimbo: true },
  ];
  const totalWeight = slots.reduce((a, s) => a + s.weight, 0);
  const scale = CW / totalWeight;

  let x = M;
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
      .text(semAcento(s.label), x, y + h - 9, { width: w, align: "center", lineBreak: false, characterSpacing: 0.4 });
    x += w;
  }
  // Moldura grossa externa da faixa toda.
  molduraBloco(doc, pal, M, y, CW, h);
}

function desenharRodape(doc: Doc, pal: Paleta, pageNum: number, totalPages: number): void {
  const yb = PAGE_H - M + 2;
  doc.font("Helvetica").fontSize(6).fillColor(pal.labelInk).text("PADCON CONECT  \u00b7  MOTOR CLINICO  \u00b7  DOCUMENTO DE AUDITORIA — PREENCHIMENTO A CANETA NA SALA", M, yb, { lineBreak: false, characterSpacing: 0.4 });
  doc.font("Helvetica").fontSize(6.5).fillColor(pal.labelInk).text(`PAG. ${pageNum} / ${totalPages}`, PAGE_W - M - 90, yb, { width: 90, align: "right", lineBreak: false });
}

// ---------------------------------------------------------------------------
// Geracao
// ---------------------------------------------------------------------------
export function gerarRasFapPdf(dados: DadosRasFap, modo: ModoRasFap = "PREMIUM"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pal = PALETAS[modo] ?? PALETAS.PREMIUM;
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const bufs: Buffer[] = [];
    doc.on("data", (b: Buffer) => bufs.push(b));
    doc.on("end", () => resolve(Buffer.concat(bufs)));
    doc.on("error", reject);

    const planoPaginas = planejarPaginasRasFap(dados.substancias);
    const totalPages = planoPaginas.length;

    planoPaginas.forEach((p, idx) => {
      if (idx > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
      if (pal.bg !== "#ffffff") doc.rect(0, 0, PAGE_W, PAGE_H).fill(pal.bg);
      let y = M;
      y = desenharCabecalho(doc, pal, y);
      y = desenharPaciente(doc, pal, dados, y);
      y = desenharProtocolo(doc, pal, p.grupo, y);
      y += 11; // espaco para o rotulo "GRADE DE APLICACOES"
      const assinH = 42;
      const yAssin = PAGE_H - M - 12 - assinH;
      const yRodape = yAssin - 8;
      desenharGrade(doc, pal, p.grupo, p.linhas, y, yRodape);
      desenharAssinaturas(doc, pal, yAssin, assinH);
      desenharRodape(doc, pal, idx + 1, totalPages);
    });

    doc.end();
  });
}
