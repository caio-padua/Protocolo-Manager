import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { Pool, PoolClient } from "pg";
import { ErroBlend } from "./blend-cadastro";
import { gravarOfertaNaTransacao } from "./oferta-apresentacao";

/**
 * Importação da lista de preços de um fornecedor (planilha .xlsx ou .csv).
 * Fluxo: LER -> PRÉVIA (nada é gravado) -> APROVAÇÃO HUMANA -> GRAVAR.
 * Duvidosas nunca são adivinhadas: exigem decisão explícita. Reenviar a mesma lista não duplica nada.
 */

export type LinhaLista = {
  linha: number; produto: string; dose: string; volumeMl: number | null; concentracao: string | null;
  forma: "ampola" | "frasco"; via: "IM" | "EV" | "SC" | "ID" | null; categoria: string | null;
  quantidadeEmbalagem: number; precoCaixaCentavos: number;
};
export type LinhaInvalida = { linha: number; produto: string; motivo: string };
export type Opcao = { varianteId: number; substanciaId: number; produto: string; dose: string; volumeMl: string | null; concentracao: string | null };
export type Classificacao =
  | { tipo: "casada"; varianteId: number; produto: string; ofertaAtual: { quantidade: number; precoCaixaCentavos: number } | null; semAlteracao: boolean }
  | { tipo: "nova"; }
  | { tipo: "nova_apresentacao"; substanciaId: number; produto: string }
  | { tipo: "duvidosa"; motivo: string; opcoes: Opcao[] };
export type ItemPrevia = { linha: LinhaLista; resultado: Classificacao };
export type Decisao = { linha: number; acao: "casar"; varianteId: number } | { linha: number; acao: "nova" } | { linha: number; acao: "ignorar" };

const VIAS = ["IM", "EV", "SC", "ID"] as const;
const MAX_LINHAS = 2000;

export const sem = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9%.,+ ]/g, " ").replace(/\s+/g, " ").trim();
const dosePadrao = (s: unknown): string => sem(s).replace(/(\d),(\d)/g, "$1.$2").replace(/\s+/g, "");

function celula(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return celula(o.result as ExcelJS.CellValue);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text ?? "");
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v).trim();
}

function numero(t: string): number | null {
  let s = t.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const COLUNAS: Record<string, string[]> = {
  produto: ["produto", "substancia", "nome", "item", "descricao"],
  dose: ["dose", "dose total", "dosagem", "apresentacao"],
  volume: ["volume", "volume ml", "volume (ml)", "ml"],
  concentracao: ["concentracao", "concentração"],
  forma: ["forma", "embalagem tipo"],
  via: ["via", "via de aplicacao", "via de uso"],
  quantidade: ["quantidade", "qtd", "qtd caixa", "qtd na caixa", "unidades", "unidades na caixa", "quantidade na caixa"],
  precoCaixa: ["preco caixa", "preco da caixa", "valor caixa", "valor da caixa", "preco", "valor"],
  precoUnitario: ["preco unitario", "valor unitario", "custo unitario"],
  categoria: ["categoria"],
};

/** Lê a planilha. Cabeçalho obrigatório na primeira linha preenchida. Linhas sem produto são ignoradas em silêncio só se totalmente vazias. */
export async function lerPlanilha(buffer: Buffer, nomeArquivo: string): Promise<{ linhas: LinhaLista[]; invalidas: LinhaInvalida[] }> {
  const wb = new ExcelJS.Workbook();
  const ehCsv = /\.csv$/i.test(nomeArquivo);
  try {
    if (ehCsv) await wb.csv.read(Readable.from(buffer), { parserOptions: { delimiter: sniffDelimitador(buffer) } });
    else await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ErroBlend(400, "Não foi possível ler o arquivo. Envie uma planilha .xlsx ou .csv.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ErroBlend(400, "A planilha está vazia.");
  let cab = 0;
  const mapa: Partial<Record<keyof typeof COLUNAS, number>> = {};
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (cab) return;
    const valores = (row.values as ExcelJS.CellValue[]).map(celula);
    const achados: Partial<Record<keyof typeof COLUNAS, number>> = {};
    valores.forEach((v, i) => {
      const k = sem(v);
      for (const [campo, nomes] of Object.entries(COLUNAS)) if (achados[campo] === undefined && nomes.map(sem).includes(k)) achados[campo] = i;
    });
    if (achados.produto !== undefined) { cab = n; Object.assign(mapa, achados); }
  });
  if (!cab) throw new ErroBlend(400, "Cabeçalho não encontrado. A primeira linha precisa ter a coluna \"Produto\" (e Dose, Qtd na caixa, Preço da caixa).");
  const falta = (["dose"] as const).filter((c) => mapa[c] === undefined);
  if (falta.length || (mapa.precoCaixa === undefined && mapa.precoUnitario === undefined)) {
    throw new ErroBlend(400, "Faltam colunas obrigatórias: Produto, Dose e Preço da caixa (ou Preço unitário com Qtd na caixa).");
  }
  const linhas: LinhaLista[] = [];
  const invalidas: LinhaInvalida[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= cab) return;
    const v = row.values as ExcelJS.CellValue[];
    const pega = (c: keyof typeof COLUNAS) => (mapa[c] === undefined ? "" : celula(v[mapa[c] as number]));
    const produto = pega("produto").replace(/\s+/g, " ").trim();
    const dose = pega("dose").replace(/\s+/g, " ").trim();
    if (!produto && !dose && !pega("precoCaixa") && !pega("precoUnitario")) return;
    if (linhas.length + invalidas.length >= MAX_LINHAS) throw new ErroBlend(400, `A lista passa de ${MAX_LINHAS} linhas. Divida o arquivo.`);
    const bad = (motivo: string): void => { invalidas.push({ linha: n, produto: produto || "(sem produto)", motivo }); };
    if (!produto) return bad("Produto em branco.");
    if (!dose) return bad("Dose em branco.");
    const volTxt = pega("volume");
    const volumeMl = volTxt ? numero(volTxt) : null;
    if (volTxt && (volumeMl === null || volumeMl <= 0 || volumeMl > 1000)) return bad("Volume inválido.");
    const qtdTxt = pega("quantidade");
    const qtd = qtdTxt ? numero(qtdTxt) : 1;
    if (qtd === null || !Number.isInteger(qtd) || qtd < 1 || qtd > 1000) return bad("Quantidade na caixa inválida (inteiro de 1 a 1000).");
    let precoCaixaCentavos: number | null = null;
    const caixa = pega("precoCaixa") ? numero(pega("precoCaixa")) : null;
    const unit = pega("precoUnitario") ? numero(pega("precoUnitario")) : null;
    if (caixa !== null) precoCaixaCentavos = Math.round(caixa * 100);
    else if (unit !== null) precoCaixaCentavos = Math.round(unit * qtd * 100);
    if (precoCaixaCentavos === null || precoCaixaCentavos < 1 || precoCaixaCentavos > 100_000_000) return bad("Preço ausente ou inválido (nunca é assumido zero).");
    const formaTxt = sem(pega("forma"));
    if (formaTxt && !["ampola", "frasco"].includes(formaTxt)) return bad("Forma não suportada na importação (use ampola ou frasco; implantes só pelo cadastro manual).");
    const viaTxt = pega("via").toUpperCase().replace(/[^A-Z]/g, "");
    const via = viaTxt ? (VIAS as readonly string[]).includes(viaTxt) ? (viaTxt as LinhaLista["via"]) : undefined : null;
    if (via === undefined) return bad("Via inválida (use IM, EV, SC ou ID).");
    linhas.push({
      linha: n, produto, dose, volumeMl, concentracao: pega("concentracao") || null,
      forma: formaTxt === "frasco" ? "frasco" : "ampola", via, categoria: pega("categoria") || null,
      quantidadeEmbalagem: qtd, precoCaixaCentavos,
    });
  });
  return { linhas, invalidas };
}

function sniffDelimitador(buffer: Buffer): string {
  const primeira = buffer.toString("utf8", 0, 2000).split(/\r?\n/)[0] ?? "";
  return (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
}

/** Revalida uma linha vinda do cliente (a aplicação nunca confia no que o navegador devolveu). */
export function validarLinha(x: unknown): LinhaLista {
  const o = (x ?? {}) as Record<string, unknown>;
  const txt = (v: unknown, c: string, max = 160) => {
    if (typeof v !== "string" || !v.trim() || v.length > max) throw new ErroBlend(400, `Linha inválida: ${c}.`);
    return v.replace(/\s+/g, " ").trim();
  };
  const int = (v: unknown, a: number, b: number, c: string) => {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < a || v > b) throw new ErroBlend(400, `Linha inválida: ${c}.`);
    return v;
  };
  const volume = o.volumeMl === null || o.volumeMl === undefined ? null : Number(o.volumeMl);
  if (volume !== null && (!Number.isFinite(volume) || volume <= 0 || volume > 1000)) throw new ErroBlend(400, "Linha inválida: volume.");
  if (o.forma !== "ampola" && o.forma !== "frasco") throw new ErroBlend(400, "Linha inválida: forma.");
  const via = o.via === null || o.via === undefined ? null : String(o.via);
  if (via !== null && !(VIAS as readonly string[]).includes(via)) throw new ErroBlend(400, "Linha inválida: via.");
  return {
    linha: int(o.linha, 1, 1_000_000, "número da linha"), produto: txt(o.produto, "produto"), dose: txt(o.dose, "dose", 120),
    volumeMl: volume, concentracao: typeof o.concentracao === "string" && o.concentracao.trim() ? o.concentracao.trim().slice(0, 120) : null,
    forma: o.forma, via: via as LinhaLista["via"], categoria: typeof o.categoria === "string" && o.categoria.trim() ? o.categoria.trim().slice(0, 60) : null,
    quantidadeEmbalagem: int(o.quantidadeEmbalagem, 1, 1000, "quantidade"), precoCaixaCentavos: int(o.precoCaixaCentavos, 1, 100_000_000, "preço"),
  };
}

type Q = Pick<Pool | PoolClient, "query">;
type Variante = { id: number; substance_id: number; name: string; dose_total: string; forma: string; volume_ml: string | null; concentracao: string | null };

async function carregar(q: Q, empresaId: number) {
  const [vs, ss] = await Promise.all([
    q.query(`SELECT v.id, v.substance_id, s.name, v.dose_total, v.forma, v.volume_ml, v.concentracao
             FROM substance_variantes v JOIN substances s ON s.id=v.substance_id WHERE v.empresa_id=$1`, [empresaId]),
    q.query(`SELECT id, name FROM substances`),
  ]);
  return { variantes: vs.rows as Variante[], substancias: ss.rows as { id: number; name: string }[] };
}
const opcao = (v: Variante): Opcao => ({ varianteId: v.id, substanciaId: v.substance_id, produto: v.name, dose: v.dose_total, volumeMl: v.volume_ml, concentracao: v.concentracao });
const tokens = (s: string) => new Set(sem(s).split(" ").filter((t) => t.length > 1));

function compativel(v: Variante, l: LinhaLista): boolean {
  if (dosePadrao(v.dose_total) !== dosePadrao(l.dose)) return false;
  if (l.volumeMl !== null && v.volume_ml !== null && Number(v.volume_ml) !== l.volumeMl) return false;
  if (l.concentracao && v.concentracao && dosePadrao(v.concentracao) !== dosePadrao(l.concentracao)) return false;
  if (v.forma !== l.forma && (v.forma === "ampola" || v.forma === "frasco")) return false;
  return true;
}

export function classificarLinha(base: Awaited<ReturnType<typeof carregar>>, l: LinhaLista, ofertas: Map<number, { quantidade_embalagem: number; custo_embalagem_centavos: number }>): Classificacao {
  const chave = sem(l.produto);
  const exatas = base.substancias.filter((s) => sem(s.name) === chave);
  if (exatas.length > 1) {
    return { tipo: "duvidosa", motivo: "Mais de uma substância com este nome no cadastro.", opcoes: base.variantes.filter((v) => exatas.some((s) => s.id === v.substance_id)).map(opcao) };
  }
  if (exatas.length === 1) {
    const vs = base.variantes.filter((v) => v.substance_id === exatas[0].id);
    const ok = vs.filter((v) => compativel(v, l));
    if (ok.length === 1) {
      const o = ofertas.get(ok[0].id) ?? null;
      return { tipo: "casada", varianteId: ok[0].id, produto: exatas[0].name, ofertaAtual: o ? { quantidade: o.quantidade_embalagem, precoCaixaCentavos: o.custo_embalagem_centavos } : null,
        semAlteracao: !!o && o.quantidade_embalagem === l.quantidadeEmbalagem && o.custo_embalagem_centavos === l.precoCaixaCentavos };
    }
    if (ok.length > 1) return { tipo: "duvidosa", motivo: "Mais de uma apresentação do cadastro combina com esta linha.", opcoes: ok.map(opcao) };
    return { tipo: "nova_apresentacao", substanciaId: exatas[0].id, produto: exatas[0].name };
  }
  const tk = tokens(l.produto);
  const parecidas = base.substancias.filter((s) => {
    const k = sem(s.name);
    if (k.length >= 4 && (k.includes(chave) || chave.includes(k))) return true;
    const t2 = tokens(s.name);
    const inter = [...tk].filter((t) => t2.has(t)).length;
    const uniao = new Set([...tk, ...t2]).size;
    return uniao > 0 && inter / uniao >= 0.6;
  });
  if (parecidas.length) {
    return { tipo: "duvidosa", motivo: "Nome parecido com substâncias já cadastradas; confirme se é a mesma.",
      opcoes: base.variantes.filter((v) => parecidas.some((s) => s.id === v.substance_id)).map(opcao).slice(0, 30) };
  }
  return { tipo: "nova" };
}

async function ofertasDoFornecedor(q: Q, empresaId: number, fornecedorId: number) {
  const r = await q.query(`SELECT variante_id, quantidade_embalagem, custo_embalagem_centavos FROM substance_ofertas WHERE empresa_id=$1 AND fornecedor_id=$2`, [empresaId, fornecedorId]);
  return new Map<number, { quantidade_embalagem: number; custo_embalagem_centavos: number }>(r.rows.map((x) => [x.variante_id as number, x]));
}

export async function montarPrevia(pool: Pool, empresaId: number, fornecedorId: number, linhas: LinhaLista[]): Promise<ItemPrevia[]> {
  const f = await pool.query("SELECT 1 FROM fornecedores_cadastrados WHERE id=$1 AND empresa_id=$2 AND ativo=true", [fornecedorId, empresaId]);
  if (!f.rowCount) throw new ErroBlend(404, "Fornecedor não encontrado ou inativo nesta clínica.");
  const [base, ofertas] = await Promise.all([carregar(pool, empresaId), ofertasDoFornecedor(pool, empresaId, fornecedorId)]);
  // Linhas repetidas no mesmo arquivo (mesmo produto+dose+volume+concentração) viram dúvida, não duas gravações.
  const vistos = new Map<string, number>();
  return linhas.map((l) => {
    const k = [sem(l.produto), dosePadrao(l.dose), l.volumeMl ?? "", dosePadrao(l.concentracao ?? "")].join("|");
    const antes = vistos.get(k);
    vistos.set(k, l.linha);
    if (antes !== undefined) return { linha: l, resultado: { tipo: "duvidosa", motivo: `Repete a linha ${antes} deste arquivo.`, opcoes: [] } as Classificacao };
    return { linha: l, resultado: classificarLinha(base, l, ofertas) };
  });
}

export type ResultadoLinha = { linha: number; produto: string; situacao: "criada" | "oferta_nova" | "oferta_atualizada" | "sem_alteracao" | "ignorada" | "pulada" | "erro"; detalhe?: string; substanciaId?: number; varianteId?: number };

async function categoriaValida(cli: PoolClient, nome: string | null): Promise<string> {
  if (nome) {
    const chave = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
    const r = await cli.query("SELECT nome FROM matriz_categorias WHERE chave=$1 AND ativo=true", [chave]);
    if (r.rowCount) return r.rows[0].nome as string;
  }
  return "ORTOMOLECULAR";
}

async function criarVariante(cli: PoolClient, empresaId: number, profissionalId: number, substanciaId: number, l: LinhaLista, arquivo: string): Promise<number> {
  if (!l.via) throw new ErroBlend(400, "Informe a via (IM, EV, SC ou ID) para cadastrar uma apresentação nova.");
  const v = await cli.query(`INSERT INTO substance_variantes(empresa_id,substance_id,dose_total,forma,volume_ml,vias_fonte,concentracao,composicao)
    VALUES($1,$2,$3,$4,$5,$6,$7,NULL) RETURNING *`, [empresaId, substanciaId, l.dose, l.forma, l.volumeMl, l.via, l.concentracao]);
  await cli.query(`INSERT INTO substance_variante_historico(empresa_id,variante_id,ator_tipo,profissional_id,justificativa,depois) VALUES($1,$2,'profissional',$3,$4,$5::jsonb)`,
    [empresaId, v.rows[0].id, profissionalId, `Apresentação criada por importação aprovada da lista ${arquivo}.`, JSON.stringify(v.rows[0])]);
  return v.rows[0].id as number;
}

/** Grava UMA linha dentro de uma transação aberta. Reclassifica no banco (a prévia pode estar velha). */
export async function aplicarLinha(cli: PoolClient, empresaId: number, profissionalId: number, fornecedorId: number, arquivo: string, l: LinhaLista, decisao: Decisao | undefined): Promise<ResultadoLinha> {
  const base = await carregar(cli, empresaId);
  const ofertas = await ofertasDoFornecedor(cli, empresaId, fornecedorId);
  const c = classificarLinha(base, l, ofertas);
  const out = (situacao: ResultadoLinha["situacao"], extra: Partial<ResultadoLinha> = {}): ResultadoLinha => ({ linha: l.linha, produto: l.produto, situacao, ...extra });
  if (decisao?.acao === "ignorar") return out("ignorada");
  const origem = { documento: `Lista do fornecedor: ${arquivo}`, justificativa: `Oferta gravada por importação aprovada da lista ${arquivo}.` };
  const oferta = async (varianteId: number, extra: Partial<ResultadoLinha> = {}) => {
    const r = await gravarOfertaNaTransacao(cli, empresaId, profissionalId, { varianteId, fornecedorId, quantidadeEmbalagem: l.quantidadeEmbalagem, precoCaixaCentavos: l.precoCaixaCentavos }, origem);
    return out(r.atualizada ? "oferta_atualizada" : "oferta_nova", { varianteId, ...extra });
  };
  const nova = async () => {
    if (!l.via) throw new ErroBlend(400, "Informe a via (IM, EV, SC ou ID) para cadastrar uma substância nova.");
    const nome = l.produto.toUpperCase();
    const cat = await categoriaValida(cli, l.categoria);
    const s = await cli.query(`INSERT INTO substances(name,category,color,procedure_type,via_uso,disponivel) VALUES($1,$2,'#16284a',$3,$4,false) RETURNING id`,
      [nome, cat, l.via === "EV" ? "iv" : l.via === "SC" ? "sc" : "im", l.via]);
    const vid = await criarVariante(cli, empresaId, profissionalId, s.rows[0].id, l, arquivo);
    const r = await oferta(vid, { substanciaId: s.rows[0].id });
    return { ...r, situacao: "criada" as const };
  };
  if (c.tipo === "casada") {
    if (decisao && decisao.acao === "nova") throw new ErroBlend(409, "Esta linha já casa com o cadastro; a decisão \"nova\" não se aplica.");
    if (c.semAlteracao) return out("sem_alteracao", { varianteId: c.varianteId });
    return oferta(c.varianteId);
  }
  if (c.tipo === "nova_apresentacao") {
    const vid = await criarVariante(cli, empresaId, profissionalId, c.substanciaId, l, arquivo);
    return oferta(vid, { substanciaId: c.substanciaId });
  }
  if (c.tipo === "nova") return nova();
  // duvidosa: só com decisão humana explícita, validada contra as opções reais
  if (!decisao) return out("pulada", { detalhe: c.motivo });
  if (decisao.acao === "nova") return nova();
  if (decisao.acao === "casar") {
    const v = base.variantes.find((x) => x.id === decisao.varianteId);
    if (!v || !c.opcoes.some((o) => o.varianteId === decisao.varianteId)) throw new ErroBlend(409, "A apresentação escolhida não é uma das opções desta linha.");
    return oferta(v.id, { substanciaId: v.substance_id });
  }
  return out("pulada");
}

export async function aplicarLista(pool: Pool, empresaId: number, profissionalId: number, fornecedorId: number, arquivo: string, linhas: LinhaLista[], decisoes: Decisao[]): Promise<ResultadoLinha[]> {
  const porLinha = new Map(decisoes.map((d) => [d.linha, d]));
  const resultados: ResultadoLinha[] = [];
  for (const l of linhas) {
    const cli = await pool.connect();
    try {
      await cli.query("BEGIN");
      // Uma importação por clínica de cada vez: duas listas simultâneas não duplicam substâncias novas.
      await cli.query("SELECT pg_advisory_xact_lock(19872027, $1)", [empresaId]);
      resultados.push(await aplicarLinha(cli, empresaId, profissionalId, fornecedorId, arquivo, l, porLinha.get(l.linha)));
      await cli.query("COMMIT");
    } catch (e) {
      await cli.query("ROLLBACK").catch(() => undefined);
      resultados.push({ linha: l.linha, produto: l.produto, situacao: "erro", detalhe: e instanceof ErroBlend ? e.message : "Falha ao gravar esta linha; nada foi alterado nela." });
    } finally { cli.release(); }
  }
  return resultados;
}
