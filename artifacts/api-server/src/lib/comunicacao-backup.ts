/**
 * Backup de mensagens (WWP/TG) por clinica, em 3 formatos: PDF (leitura/prova), XLSX (analise) e
 * JSON (portabilidade). Nomes seguem lib/backup-mensagens-nome.ts (validado pelo CEO).
 *
 * Integridade: cada arquivo carrega o SHA-256 do CONJUNTO de mensagens (impressao digital do dado)
 * e a tabela guarda o SHA-256 do arquivo gerado. Isolamento: tudo escopado por empresa_id.
 * Limite por arquivo: LIMITE_MENSAGENS (reduza o periodo); a leitura e feita em lotes.
 */
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { pool } from "@workspace/db";
import { nomeBackupGeral, nomeBackupIndividual, type CanalBackup } from "./backup-mensagens-nome";
import {
  clienteDaClinica, inicioDoPeriodo, lerConversasEmLotes,
  type CanalConversa, type FiltroConversas, type LinhaConversa, type Periodo,
} from "./comunicacao-unificada";

export const LIMITE_MENSAGENS = 10_000;
export const FORMATOS = ["pdf", "xlsx", "json"] as const;
export type FormatoBackup = (typeof FORMATOS)[number];

export class ErroBackup extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}

const ROTULO_COBRANCA: Record<string, string> = {
  paga: "Paga", isenta: "Isenta", sem_tarifa: "Sem tarifa", teste: "Teste",
  nao_tarifado: "Não tarifado", sem_registro: "Sem registro",
};
const ROTULO_ORIGEM: Record<string, string> = {
  cliente: "Cliente", humano: "Humano", ia: "IA", automatico: "Automático", nao_informado: "Não informado",
};
const MIME: Record<FormatoBackup, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json",
};

const dataHoraBrt = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(iso)).replace(",", "");
const reais = (c: number | null) => (c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Impressao digital do conjunto de mensagens (ordem e conteudo). */
export function impressaoDigitalDoConjunto(linhas: LinhaConversa[]): string {
  const h = crypto.createHash("sha256");
  for (const l of linhas) h.update(JSON.stringify([l.ref, l.criadoEm, l.canal, l.direcao, l.corpo])).update("\n");
  return h.digest("hex");
}

export interface Contexto {
  nomeBase: string;
  canal: CanalBackup;
  escopo: "geral" | "cliente";
  clinica: string;
  periodoTexto: string;
  geradoEm: string;
  cliente: { nome: string } | null;
  linhas: LinhaConversa[];
  digital: string;
}

function linhaPlana(l: LinhaConversa) {
  return {
    dataHora: dataHoraBrt(l.criadoEm), canal: l.canal === "tg" ? "TG" : "WWP", cliente: l.clienteNome ?? "",
    destino: l.destino, direcao: l.direcao === "entrada" ? "Recebida" : "Enviada", contexto: l.contexto ?? "",
    origem: ROTULO_ORIGEM[l.origem], entrega: l.entrega, cobranca: ROTULO_COBRANCA[l.cobranca],
    valor: reais(l.valorCentavos), clinica: l.empresaNome ?? "", conteudo: l.corpo,
  };
}

export function montarJson(c: Contexto): Buffer {
  return Buffer.from(JSON.stringify({
    arquivo: c.nomeBase, formato: "json", canal: c.canal, escopo: c.escopo, clinica: c.clinica,
    cliente: c.cliente?.nome ?? null, periodo: c.periodoTexto, geradoEm: c.geradoEm,
    totalMensagens: c.linhas.length,
    integridade: { algoritmo: "SHA-256", escopo: "conjunto de mensagens (ref, data, canal, direcao, conteudo)", valor: c.digital },
    mensagens: c.linhas.map((l) => ({
      ref: l.ref, dataHora: l.criadoEm, canal: l.canal === "tg" ? "TG" : "WWP", clienteId: l.clienteId,
      cliente: l.clienteNome, destino: l.destino, direcao: l.direcao, contexto: l.contexto, origem: l.origem,
      entrega: l.entrega, erro: l.erro, cobranca: l.cobranca, valorCentavos: l.valorCentavos,
      clinica: l.empresaNome, conteudo: l.corpo,
    })),
  }, null, 2), "utf8");
}

export async function montarXlsx(c: Contexto): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PaxMed";
  const ws = wb.addWorksheet("Mensagens", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Data e hora (Brasília)", key: "dataHora", width: 20 }, { header: "Canal", key: "canal", width: 8 },
    { header: "Cliente", key: "cliente", width: 28 }, { header: "Destino", key: "destino", width: 20 },
    { header: "Direção", key: "direcao", width: 11 }, { header: "Contexto", key: "contexto", width: 22 },
    { header: "Origem", key: "origem", width: 13 }, { header: "Entrega", key: "entrega", width: 12 },
    { header: "Cobrança", key: "cobranca", width: 13 }, { header: "Valor (R$)", key: "valor", width: 11 },
    { header: "Clínica", key: "clinica", width: 24 }, { header: "Conteúdo completo", key: "conteudo", width: 80 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E8D0" } };
  for (const l of c.linhas) ws.addRow(linhaPlana(l)).getCell("conteudo").alignment = { wrapText: true, vertical: "top" };
  ws.autoFilter = { from: "A1", to: "L1" };
  const wi = wb.addWorksheet("Integridade");
  wi.columns = [{ width: 28 }, { width: 90 }];
  for (const [k, v] of [
    ["Arquivo", c.nomeBase], ["Clínica", c.clinica], ["Canal", c.canal], ["Escopo", c.escopo === "geral" ? "Geral" : "Cliente individual"],
    ["Cliente", c.cliente?.nome ?? "—"], ["Período", c.periodoTexto], ["Gerado em", c.geradoEm],
    ["Total de mensagens", String(c.linhas.length)], ["SHA-256 do conjunto", c.digital],
  ]) wi.addRow([k, v]).getCell(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function permitido(font: PDFFont): Set<number> { return new Set(font.getCharacterSet()); }
function seguro(texto: string, ok: Set<number>): string {
  let out = "";
  for (const ch of texto.replace(/\r/g, "")) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\n" || ch === "\t") out += ch === "\t" ? "  " : "\n";
    else if (ok.has(cp)) out += ch;
    else out += `[U+${cp.toString(16).toUpperCase()}]`;
  }
  return out;
}
function quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
  const linhas: string[] = [];
  for (const par of texto.split("\n")) {
    let atual = "";
    for (const palavra of par.split(" ")) {
      let p = palavra;
      while (font.widthOfTextAtSize(p, size) > largura) {
        let i = p.length - 1;
        while (i > 1 && font.widthOfTextAtSize(p.slice(0, i), size) > largura) i--;
        if (atual) { linhas.push(atual); atual = ""; }
        linhas.push(p.slice(0, i)); p = p.slice(i);
      }
      const tent = atual ? `${atual} ${p}` : p;
      if (font.widthOfTextAtSize(tent, size) <= largura) atual = tent;
      else { linhas.push(atual); atual = p; }
    }
    linhas.push(atual);
  }
  return linhas;
}

export async function montarPdf(c: Contexto): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(c.nomeBase); doc.setCreator("PaxMed"); doc.setProducer("PaxMed");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const neg = await doc.embedFont(StandardFonts.HelveticaBold);
  const ok = permitido(reg);
  const W = 595.28, H = 841.89, M = 42, L = W - 2 * M;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const novaPagina = () => { page = doc.addPage([W, H]); y = H - M; };
  const garantir = (altura: number) => { if (y - altura < M + 22) novaPagina(); };
  const linha = (t: string, font: PDFFont, size: number, cor = rgb(0.1, 0.12, 0.2), recuo = 0) => {
    for (const parte of quebrar(seguro(t, ok), font, size, L - recuo)) {
      garantir(size + 3);
      page.drawText(parte, { x: M + recuo, y: y - size, size, font, color: cor });
      y -= size + 3;
    }
  };

  linha(c.nomeBase, neg, 15);
  y -= 4;
  linha(`Clínica: ${c.clinica}`, reg, 9.5);
  linha(`Canal: ${c.canal === "TG" ? "Telegram (TG)" : "WhatsApp (WWP)"}  |  Escopo: ${c.escopo === "geral" ? "Geral (todas as conversas)" : `Cliente individual: ${c.cliente?.nome ?? ""}`}`, reg, 9.5);
  linha(`Período: ${c.periodoTexto}  |  Gerado em: ${c.geradoEm} (Brasília)  |  Mensagens: ${c.linhas.length}`, reg, 9.5);
  linha(`Integridade SHA-256 do conjunto: ${c.digital}`, reg, 7.5, rgb(0.35, 0.35, 0.4));
  linha("Caracteres sem suporte neste PDF (ex.: emojis) aparecem como [U+código]; o texto exato está no arquivo JSON e na planilha.", reg, 7.5, rgb(0.35, 0.35, 0.4));
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: rgb(0.7, 0.6, 0.35) });
  y -= 10;

  for (const l of c.linhas) {
    const p = linhaPlana(l);
    garantir(34);
    linha(`${p.dataHora}  |  ${p.canal}  |  ${p.direcao}  |  ${p.cliente || "Cliente não identificado"}  |  ${p.destino}`, neg, 8.5);
    linha(`Entrega: ${p.entrega}  |  Origem: ${p.origem}  |  Cobrança: ${p.cobranca}${p.valor ? ` (R$ ${p.valor})` : ""}${p.contexto ? `  |  Contexto: ${p.contexto}` : ""}`, reg, 7.5, rgb(0.35, 0.35, 0.4));
    linha(l.corpo, reg, 9, rgb(0.1, 0.12, 0.2), 8);
    y -= 7;
  }
  if (!c.linhas.length) linha("Nenhuma mensagem no período e escopo informados.", reg, 10);

  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    pg.drawText(seguro(`${c.nomeBase}  |  Página ${i + 1} de ${paginas.length}  |  SHA-256 ${c.digital.slice(0, 16)}…`, ok),
      { x: M, y: 24, size: 7, font: reg, color: rgb(0.4, 0.4, 0.45) });
  });
  return Buffer.from(await doc.save());
}

export interface PedidoBackup {
  empresaId: number;
  canais: CanalBackup[];
  escopo: "geral" | "cliente";
  clienteId?: number | null;
  periodo: Periodo;
  por: { id: number | null; nome: string };
}
export interface ArquivoBackup {
  id: number; canal: CanalBackup; formato: FormatoBackup; nome: string; tamanhoBytes: number; sha256: string; totalMensagens: number;
}

const periodoTexto = (p: Periodo) => ({ hoje: "Hoje", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", tudo: "Todo o histórico" }[p]);

export async function gerarBackup(p: PedidoBackup): Promise<{ lote: string; arquivos: ArquivoBackup[] }> {
  if (!p.canais.length) throw new ErroBackup("Escolha o canal do backup.", 400);
  const emp = await pool.query(`SELECT nome FROM empresas WHERE id = $1`, [p.empresaId]);
  const clinica = String(emp.rows[0]?.nome ?? `Clínica ${p.empresaId}`);
  let cliente: { id: number; nome: string; cpf: string | null } | null = null;
  if (p.escopo === "cliente") {
    if (!p.clienteId) throw new ErroBackup("Escolha o cliente do backup individual.", 400);
    cliente = await clienteDaClinica(p.empresaId, p.clienteId);
    if (!cliente) throw new ErroBackup("Cliente não encontrado nesta clínica.", 404);
    if (!cliente.cpf || cliente.cpf.replace(/\D/g, "").length !== 11) {
      throw new ErroBackup("O cliente precisa ter CPF válido cadastrado para o backup individual (o CPF faz parte do nome do arquivo).");
    }
  }
  const de = inicioDoPeriodo(p.periodo);
  const lote = crypto.randomUUID();
  const agora = new Date();
  const geradoEm = dataHoraBrt(agora.toISOString());
  const arquivos: ArquivoBackup[] = [];

  for (const canal of p.canais) {
    const filtro: FiltroConversas = {
      empresaId: p.empresaId, canal: (canal === "TG" ? "tg" : "wwp") as CanalConversa,
      clienteId: cliente?.id ?? null, de,
    };
    const linhas: LinhaConversa[] = [];
    for await (const lote500 of lerConversasEmLotes(filtro)) {
      linhas.push(...lote500);
      if (linhas.length > LIMITE_MENSAGENS) {
        throw new ErroBackup(`O período tem mais de ${LIMITE_MENSAGENS.toLocaleString("pt-BR")} mensagens. Escolha um período menor.`, 413);
      }
    }
    linhas.reverse(); // leitura cronologica (a consulta vem do mais novo para o mais antigo)
    const nomeBase = cliente
      ? nomeBackupIndividual(canal, { nome: cliente.nome, cpf: cliente.cpf! }, agora)
      : nomeBackupGeral(canal, agora);
    const ctx: Contexto = {
      nomeBase, canal, escopo: p.escopo, clinica, periodoTexto: periodoTexto(p.periodo), geradoEm,
      cliente, linhas, digital: impressaoDigitalDoConjunto(linhas),
    };
    const conteudos: Record<FormatoBackup, Buffer> = {
      pdf: await montarPdf(ctx), xlsx: await montarXlsx(ctx), json: montarJson(ctx),
    };
    for (const formato of FORMATOS) {
      const buf = conteudos[formato];
      const nome = `${nomeBase}.${formato}`;
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const ins = await pool.query(
        `INSERT INTO comunicacao_backups (empresa_id, lote, canal, escopo, cliente_id, periodo_inicio, periodo_fim, formato,
           nome_arquivo, mime, tamanho_bytes, sha256, total_mensagens, conteudo, gerado_por, gerado_por_nome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [p.empresaId, lote, canal, p.escopo, cliente?.id ?? null, de, agora, formato, nome, MIME[formato], buf.length,
         sha256, linhas.length, buf, p.por.id, p.por.nome],
      );
      arquivos.push({ id: ins.rows[0].id, canal, formato, nome, tamanhoBytes: buf.length, sha256, totalMensagens: linhas.length });
    }
  }
  return { lote, arquivos };
}

export const nomeDeArquivoSeguroNoHeader = (nome: string) => ({
  ascii: nome.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'"),
  utf8: encodeURIComponent(nome),
});
