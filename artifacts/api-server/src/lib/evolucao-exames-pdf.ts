/**
 * TEX — Descritivo de Evolução de Exames: gerador de UM único PDF institucional.
 * Entrada = a evolução já existente (montarEvolucao). Nada é inventado: valores, unidades,
 * faixas e selos de conferência vêm exatamente do que está gravado. Sem julgamento clínico.
 * Identidade visual = Modelo 2B do receituário (cabeçalho, rodapé, tipografia EB Garamond).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  PAXMED_LIMITE_CONTEUDO, prepararVisualProva, desenharCabecalhoProva, carimbarRodapesProva, carimbarRodapesClinicos,
  geometriaA4, type VisualProva,
} from "./documentos/paxmed-modelo-2b-prova";
import type { TextosEmpresa2b } from "./documentos/paxmed-2b-limites";
import type { EvolucaoMontada } from "../routes/exames-lab";
import { NOME_COMERCIAL_EVOLUCAO } from "./evolucao-exames-nome";

const MM = 72 / 25.4;
const INK = rgb(20 / 255, 34 / 255, 56 / 255);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.84, 0.86, 0.9);
const BAND = rgb(0.965, 0.955, 0.93);
const GOLD = rgb(0.72, 0.55, 0.25);
const ALERT = rgb(0.65, 0.08, 0.08);

export type ModoEvolucaoExames = "ultimas5" | "completo";
export type OrientacaoEvolucaoExames = "retrato" | "paisagem";

export interface DadosEvolucaoExames {
  evolucao: EvolucaoMontada;
  paciente: { nome: string; documentoMinimo?: string | null };
  /** YYYY-MM-DD (BRT) */
  emissao: string;
  modo: ModoEvolucaoExames;
  /** Identidade da clínica já validada pelo servidor; ausente = Instituto Pádua (arte aprovada). */
  identidade?: { empresaId?: number; textos: TextosEmpresa2b; simboloDourado: Uint8Array };
  /** Rótulo de ambiente exibido no PDF (prova sintética). */
  rotuloAmbiente?: string | null;
  /** Texto de rastreio curto (ex.: protocolo TEX), nunca resultado clínico. */
  protocolo?: string | null;
  qr?: Uint8Array | null;
}

export interface ColunaEvolucaoExames {
  key: string;
  date: string | null;
  lab: string | null;
  confLevel: "ia" | "c1" | "c2" | null;
}

export interface ResultadoEvolucaoExames {
  pdf: Uint8Array;
  orientacao: OrientacaoEvolucaoExames;
  colunasUsadas: number;
  blocos: number;
  paginas: number;
  /** true quando há coluna sem conferência final (C2). */
  contemNaoConferidos: boolean;
}

const COL_NOME = 150, COL_UNID = 38, COL_REF = 66;
const LARG_DATA_MIN = 52;
const PAD = 28;

function fmtData(ymd: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return "sem data";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function limpar(t: unknown): string {
  return String(t ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function fonte(nome: string): Buffer {
  for (const c of [resolve(import.meta.dirname, "../assets/fonts", nome), resolve(import.meta.dirname, "../../assets/fonts", nome), resolve(import.meta.dirname, "assets/fonts", nome)]) {
    try { return readFileSync(c); } catch { /* próximo */ }
  }
  throw new Error(`Fonte institucional ausente: ${nome}`);
}

function ajustar(texto: string, font: PDFFont, size: number, max: number): string {
  let t = texto;
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Decisão pura de formato (testável): quantas colunas por bloco e a orientação. */
export function decidirFormato(nColunas: number, modo: ModoEvolucaoExames): { orientacao: OrientacaoEvolucaoExames; porBloco: number } {
  const retratoLargura = 595.28 - 2 * PAD - COL_NOME - COL_UNID - COL_REF;
  const maxRetrato = Math.floor(retratoLargura / LARG_DATA_MIN); // 5
  if (modo === "ultimas5" || nColunas <= maxRetrato) return { orientacao: "retrato", porBloco: maxRetrato };
  const paisagemLargura = 841.89 - 2 * PAD - COL_NOME - COL_UNID - COL_REF;
  return { orientacao: "paisagem", porBloco: Math.min(10, Math.floor(paisagemLargura / LARG_DATA_MIN)) };
}

export function selecionarColunas(evo: EvolucaoMontada, modo: ModoEvolucaoExames): ColunaEvolucaoExames[] {
  const cols = evo.columns.map((c) => ({ key: c.key, date: c.date, lab: c.lab, confLevel: c.confLevel }));
  // Cronológico crescente; sem data vai primeiro (nunca à direita, que é o mais recente).
  cols.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.key.localeCompare(b.key));
  return modo === "ultimas5" ? cols.slice(-5) : cols;
}

const SELO: Record<string, string> = { c2: "Conferido (C2)", c1: "Conferência parcial (C1)", ia: "Não conferido (IA)" };

export async function gerarEvolucaoExamesPdf(d: DadosEvolucaoExames): Promise<ResultadoEvolucaoExames> {
  const colunas = selecionarColunas(d.evolucao, d.modo);
  if (colunas.length === 0) throw new Error("Não há resultados de exames para compor o descritivo.");
  const { orientacao, porBloco } = decidirFormato(colunas.length, d.modo);
  const dims: [number, number] = orientacao === "retrato" ? [595.28, 841.89] : [841.89, 595.28];
  const analitos = d.evolucao.analytes.filter((a) => colunas.some((c) => a.cells[c.key]));
  const contemNaoConferidos = colunas.some((c) => c.confLevel !== "c2");

  const doc = await PDFDocument.create();
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(fonte("EBGaramond-Regular.ttf"), { subset: true });
  const bold = await doc.embedFont(fonte("EBGaramond-Bold.ttf"), { subset: true });
  const ital = await doc.embedFont(fonte("EBGaramond-SemiBoldItalic.ttf"), { subset: true });
  const visual: VisualProva = await prepararVisualProva(doc, d.identidade ? { textos: d.identidade.textos, simboloDourado: d.identidade.simboloDourado } : undefined);
  const qrImg = d.qr ? await doc.embedPng(d.qr) : null;

  // Blocos de colunas (cronológicos); o último bloco contém a data mais recente à direita.
  const blocos: ColunaEvolucaoExames[][] = [];
  for (let i = 0; i < colunas.length; i += porBloco) blocos.push(colunas.slice(i, i + porBloco));

  const W = dims[0];
  const areaX0 = PAD;
  const areaLarg = W - 2 * PAD;
  const TOPO_CONT = (): number => dims[1] - 59 * MM;
  const BASE = PAXMED_LIMITE_CONTEUDO + 4;
  const ALT_CAB = 35;
  const ALT_LIN = 24;

  function novaPagina(titulo: string, subtitulo: string): { page: PDFPage; y: number } {
    const page = doc.addPage(dims);
    desenharCabecalhoProva(page, visual, reg, bold, titulo, subtitulo, false);
    return { page, y: TOPO_CONT() };
  }

  let pg = novaPagina(`${NOME_COMERCIAL_EVOLUCAO} · Evolução de Exames`, "Descritivo comparativo");
  const idLinhas = [`Paciente: ${limpar(d.paciente.nome)}${d.paciente.documentoMinimo ? `   ·   ${limpar(d.paciente.documentoMinimo)}` : ""}`,
    `Emissão: ${fmtData(d.emissao)}   ·   Período: ${fmtData(colunas[0].date)} a ${fmtData(colunas[colunas.length - 1].date)}   ·   ${d.modo === "completo" ? "Histórico completo" : "Últimas 5 coletas"}`];
  idLinhas.forEach((t, i) => { pg.page.drawText(ajustar(t, i === 0 ? bold : reg, 10.5, areaLarg), { x: areaX0, y: pg.y - i * 14, font: i === 0 ? bold : reg, size: 10.5, color: INK }); });
  pg.y -= 34;
  if (d.rotuloAmbiente) { pg.page.drawText(limpar(d.rotuloAmbiente), { x: areaX0, y: pg.y + 8, font: bold, size: 8.5, color: ALERT }); pg.y -= 8; }
  if (contemNaoConferidos) {
    pg.page.drawText("ATENÇÃO: há resultados ainda sem conferência final da equipe (marcados abaixo).", { x: areaX0, y: pg.y + 4, font: bold, size: 9, color: ALERT });
    pg.y -= 12;
  }

  const larguraData = (areaLarg - COL_NOME - COL_UNID - COL_REF) / porBloco;

  blocos.forEach((bloco, bi) => {
    const desenharCabTabela = () => {
      const { page } = pg;
      let x = areaX0;
      page.drawRectangle({ x: areaX0, y: pg.y - ALT_CAB + 6, width: areaLarg, height: ALT_CAB, color: INK });
      const branco = rgb(0.97, 0.94, 0.86);
      page.drawText("Exame", { x: x + 4, y: pg.y - 10, font: bold, size: 9, color: branco }); x += COL_NOME;
      page.drawText("Unid.", { x: x + 2, y: pg.y - 10, font: bold, size: 9, color: branco }); x += COL_UNID;
      page.drawText("Ref. laboratório", { x: x + 2, y: pg.y - 10, font: bold, size: 8, color: branco });
      // Datas alinhadas à DIREITA da área: a mais recente fica na última coluna.
      const x0 = areaX0 + areaLarg - larguraData * bloco.length;
      bloco.forEach((c, i) => {
        const cx = x0 + i * larguraData;
        page.drawText(fmtData(c.date), { x: cx + 3, y: pg.y - 9, font: bold, size: 8.6, color: branco });
        page.drawText(ajustar(limpar(c.lab) || "lab. n/i", reg, 6.8, larguraData - 5), { x: cx + 3, y: pg.y - 17.5, font: reg, size: 6.8, color: branco });
        const selo = c.confLevel === "c2" ? "C2" : c.confLevel === "c1" ? "C1 · parcial" : "NÃO CONFERIDO";
        page.drawText(ajustar(selo, bold, 6.2, larguraData - 5), { x: cx + 3, y: pg.y - 25, font: bold, size: 6.2, color: c.confLevel === "c2" ? branco : rgb(1, 0.78, 0.5) });
      });
      pg.y -= ALT_CAB + 4;
    };

    if (bi > 0) {
      pg = novaPagina(`${NOME_COMERCIAL_EVOLUCAO} · Evolução de Exames`, "Continuação cronológica");
      pg.page.drawText(`Bloco ${bi + 1} de ${blocos.length} — coletas de ${fmtData(bloco[0].date)} a ${fmtData(bloco[bloco.length - 1].date)}`, { x: areaX0, y: pg.y, font: ital, size: 10, color: MUTED });
      pg.y -= 18;
    } else if (blocos.length > 1) {
      pg.page.drawText(`Bloco 1 de ${blocos.length} — coletas de ${fmtData(bloco[0].date)} a ${fmtData(bloco[bloco.length - 1].date)}`, { x: areaX0, y: pg.y, font: ital, size: 10, color: MUTED });
      pg.y -= 18;
    }
    desenharCabTabela();

    analitos.forEach((a, ai) => {
      if (!bloco.some((c) => a.cells[c.key]) && blocos.length > 1) return; // exame sem dado neste bloco
      if (pg.y - ALT_LIN < BASE) {
        pg = novaPagina(`${NOME_COMERCIAL_EVOLUCAO} · Evolução de Exames`, "Continuação");
        desenharCabTabela();
      }
      const { page } = pg;
      const y = pg.y;
      if (ai % 2 === 0) page.drawRectangle({ x: areaX0, y: y - ALT_LIN + 8, width: areaLarg, height: ALT_LIN, color: BAND });
      {
        // Nome completo em até 2 linhas (sem truncar quando cabe); só reticências se passar de 2.
        const palavras = limpar(a.name).split(" ");
        const linhas: string[] = []; let cur = "";
        for (const w of palavras) {
          const c = cur ? `${cur} ${w}` : w;
          if (bold.widthOfTextAtSize(c, 8.4) > COL_NOME - 6 && cur) { linhas.push(cur); cur = w; } else cur = c;
        }
        if (cur) linhas.push(cur);
        const vis = linhas.slice(0, 2);
        if (linhas.length > 2) vis[1] = ajustar(`${vis[1]} ${linhas.slice(2).join(" ")}`, bold, 8.4, COL_NOME - 6);
        vis.forEach((t, li) => page.drawText(ajustar(t, bold, 8.4, COL_NOME - 6), { x: areaX0 + 4, y: y - 2 - li * 9, font: bold, size: 8.4, color: INK }));
      }
      page.drawText(ajustar(limpar(a.unit) || "—", reg, 8.2, COL_UNID - 3), { x: areaX0 + COL_NOME + 2, y: y - 5, font: reg, size: 8.2, color: INK });
      const ref = a.refLow !== null || a.refHigh !== null
        ? `${limpar(a.refLow) || "—"} a ${limpar(a.refHigh) || "—"}`
        : "não informada";
      page.drawText(ajustar(ref, reg, 8.2, COL_REF - 3), { x: areaX0 + COL_NOME + COL_UNID + 2, y: y - 5, font: reg, size: 8.2, color: a.refLow !== null || a.refHigh !== null ? INK : MUTED });
      const x0 = areaX0 + areaLarg - larguraData * bloco.length;
      bloco.forEach((c, i) => {
        const cell = a.cells[c.key];
        const cx = x0 + i * larguraData;
        if (!cell) { page.drawText("—", { x: cx + 3, y: y - 5, font: reg, size: 9, color: MUTED }); return; }
        const valor = limpar(cell.value) || "sem valor";
        page.drawText(ajustar(valor, bold, 9.4, larguraData - 5), { x: cx + 3, y: y - 5, font: bold, size: 9.4, color: c.confLevel === "c2" ? INK : ALERT });
        // 2ª linha: unidade original quando houve conversão, ou unidade própria do laudo se diferir; ref do próprio laudo se diferir.
        const notas: string[] = [];
        if (cell.unitConverted && cell.unitRaw) notas.push(`orig. ${limpar(cell.unitRaw)}`);
        if (cell.refLow !== a.refLow || cell.refHigh !== a.refHigh) notas.push(`ref ${limpar(cell.refLow) || "—"}-${limpar(cell.refHigh) || "—"}`);
        if (notas.length) page.drawText(ajustar(notas.join(" · "), ital, 6.4, larguraData - 4), { x: cx + 3, y: y - 13, font: ital, size: 6.4, color: MUTED });
      });
      page.drawLine({ start: { x: areaX0, y: y - ALT_LIN + 8 }, end: { x: areaX0 + areaLarg, y: y - ALT_LIN + 8 }, thickness: 0.3, color: LINE });
      pg.y -= ALT_LIN;
    });
  });

  // Texto de encerramento (curto, sem alegação jurídica), mantido junto da última tabela.
  const fecho = [
    "Compilação informativa e comparativa dos resultados registrados no prontuário, na ordem cronológica das coletas.",
    "Não substitui os laudos originais dos laboratórios nem a consulta médica, e não constitui laudo ou relatório médico.",
    `Faixas "Ref. laboratório" são as impressas em cada laudo; valores marcados em vermelho ainda não receberam conferência final.${d.protocolo ? `   Protocolo: ${limpar(d.protocolo)}` : ""}`,
  ];
  if (pg.y - fecho.length * 11 - 14 < BASE) { pg = novaPagina(`${NOME_COMERCIAL_EVOLUCAO} · Evolução de Exames`, "Observações"); }
  pg.page.drawLine({ start: { x: areaX0, y: pg.y }, end: { x: areaX0 + areaLarg, y: pg.y }, thickness: 0.6, color: GOLD });
  pg.y -= 12;
  for (const t of fecho) {
    let linha = "";
    for (const w of t.split(" ")) {
      const c = linha ? `${linha} ${w}` : w;
      if (ital.widthOfTextAtSize(c, 8.6) > areaLarg && linha) { pg.page.drawText(linha, { x: areaX0, y: pg.y, font: ital, size: 8.6, color: MUTED }); pg.y -= 11; linha = w; } else linha = c;
    }
    if (linha) { pg.page.drawText(linha, { x: areaX0, y: pg.y, font: ital, size: 8.6, color: MUTED }); pg.y -= 11; }
  }

  if (d.identidade) carimbarRodapesClinicos(doc, visual, reg, qrImg);
  else carimbarRodapesProva(doc, visual, reg);
  geometriaA4(doc.getPages()[0]);
  const pdf = await doc.save();
  return { pdf, orientacao, colunasUsadas: colunas.length, blocos: blocos.length, paginas: doc.getPageCount(), contemNaoConferidos };
}
