import { createHash } from "node:crypto";
import { REGRAS, type Modalidade, MODALIDADES, conferirTextoOficial } from "./meus-jogos-regras";
import {
  type CalendarioOficial, type RegrasVerificadas, type SorteioCalendario,
} from "./meus-jogos-calendario";

export const URL_REGRAS_SORTEIOS = "https://loterias.caixa.gov.br/Paginas/regras-sorteios.aspx";
export const URL_COMUNICADOS = "https://www.caixa.gov.br/loterias/comunicados-importantes/Paginas/default.aspx";
const MES_NOME = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"] as const;

const TITULO_COLUNA: Record<Modalidade, string> = {
  lotofacil: "LOTOFÁCIL", lotomania: "LOTOMANIA", quina: "QUINA", megasena: "MEGA-SENA",
};
const normalizarTexto = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
export const htmTexto = (s: string) => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"').replace(/&#0*58;|&colon;/gi, ":").replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#([0-9]+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ");

export interface ColetaFonte {
  status: number;
  texto?: string;
  bytes?: Uint8Array;
  urlFinal?: string;
}
export type BuscarFonte = (url: string, tipo: "texto" | "pdf") => Promise<ColetaFonte>;

/**
 * Le fonte CAIXA com redirecionamentos limitados e cookies de sessão em memória.
 * O cookie só é reenviado ao mesmo host que o emitiu; nenhum dado de usuário é enviado.
 */
export const buscarFonteCaixa: BuscarFonte = async (url, tipo) => {
  const cookies = new Map<string, string>();
  let atual = new URL(url);
  for (let tentativa = 0; tentativa < 7; tentativa++) {
    const cookie = atual.hostname.endsWith("caixa.gov.br")
      ? [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") : "";
    const resposta = await fetch(atual, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
        Accept: tipo === "pdf" ? "application/pdf,*/*;q=0.8" : "text/html,application/xhtml+xml,*/*;q=0.8",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    for (const setCookie of resposta.headers.getSetCookie?.() ?? []) {
      const match = /^([^=;\s]+)=([^;]*)/.exec(setCookie);
      if (match && !/max-age=0|expires=Thu, 01 Jan 1970/i.test(setCookie)) cookies.set(match[1]!, match[2]!);
      else if (match) cookies.delete(match[1]!);
    }
    if ([301, 302, 303, 307, 308].includes(resposta.status)) {
      const location = resposta.headers.get("location");
      if (!location) throw new Error(`CAIXA respondeu ${resposta.status} sem destino de redirecionamento`);
      const proxima = new URL(location, atual);
      if (proxima.protocol !== "https:" || !/(^|\.)caixa\.gov\.br$/i.test(proxima.hostname)) {
        throw new Error("redirecionamento da CAIXA para domínio não autorizado");
      }
      atual = proxima;
      continue;
    }
    if (tipo === "pdf") return { status: resposta.status, bytes: new Uint8Array(await resposta.arrayBuffer()), urlFinal: atual.toString() };
    return { status: resposta.status, texto: await resposta.text(), urlFinal: atual.toString() };
  }
  throw new Error("CAIXA excedeu o limite de redirecionamentos");
};

function isoDataBR(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toISOString().slice(0, 10) === iso ? iso : null;
}
function isoInstante(data: string, hhmm: string): string { return new Date(`${data}T${hhmm}:00-03:00`).toISOString(); }
function mesIso(data: string): string { return data.slice(0, 7); }
function urlPdf(mes: number, ano: number): string {
  const n = String(mes).padStart(2, "0");
  return `https://www.caixa.gov.br/Downloads/caixa-loterias/Cronograma_${n}_${MES_NOME[mes - 1]}_${ano}.pdf`;
}

type ItemTextoPdf = { texto: string; x: number; y: number; largura: number };
type LinhaPdf = { y: number; itens: ItemTextoPdf[] };
function agruparLinhas(items: ItemTextoPdf[]): LinhaPdf[] {
  const linhas: LinhaPdf[] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let linha = linhas.find((x) => Math.abs(x.y - item.y) <= 1.5);
    if (!linha) { linha = { y: item.y, itens: [] }; linhas.push(linha); }
    linha.itens.push(item);
  }
  return linhas.map((x) => ({ ...x, itens: x.itens.sort((a, b) => a.x - b.x) }));
}
const centro = (i: ItemTextoPdf) => i.x + i.largura / 2;

/**
 * Extrai as quatro modalidades pelo eixo horizontal do cabeçalho do PDF oficial.
 * Não usa a magnitude do número para adivinhar a modalidade: concursos vizinhos podem se sobrepor.
 */
export async function parsearPdfCronograma(
  bytes: Uint8Array,
  mesEsperado: string,
  fonteUrl: string,
  geradoEm: string,
  validoAte: string,
): Promise<CalendarioOficial> {
  const moduloPdf = "pdfjs-dist/legacy/build/pdf.mjs";
  const pdfjs = await import(moduloPdf) as { getDocument: (options: unknown) => { promise: Promise<any> } };
  const documento = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const itens: ItemTextoPdf[] = [];
  for (let pagina = 1; pagina <= documento.numPages; pagina++) {
    const conteudo = await documento.getPage(pagina).then((p: any) => p.getTextContent());
    for (const item of conteudo.items as Array<{ str?: string; width?: number; transform?: number[] }>) {
      const texto = String(item.str ?? "").trim();
      if (!texto || !item.transform) continue;
      itens.push({ texto, x: Number(item.transform[4]), y: Number(item.transform[5]), largura: Number(item.width ?? 0) });
    }
  }
  const linhas = agruparLinhas(itens);
  const cabecalho = linhas.find((linha) => linha.itens.some((i) => normalizarTexto(i.texto) === "data") &&
    MODALIDADES.every((m) => linha.itens.some((i) => normalizarTexto(i.texto) === normalizarTexto(TITULO_COLUNA[m]))));
  if (!cabecalho) throw new Error("o PDF oficial não contém todos os cabeçalhos de modalidade esperados");
  const centros: Record<Modalidade, number> = {} as Record<Modalidade, number>;
  for (const m of MODALIDADES) {
    const h = cabecalho.itens.find((i) => normalizarTexto(i.texto) === normalizarTexto(TITULO_COLUNA[m]));
    if (!h) throw new Error(`coluna oficial ausente: ${m}`);
    centros[m] = centro(h);
  }
  const datasPorLinha = new Map<number, string>();
  for (const linha of linhas) {
    const dataItem = linha.itens.find((i) => isoDataBR(i.texto));
    if (dataItem) datasPorLinha.set(linha.y, isoDataBR(dataItem.texto)!);
  }
  const especialIds = new Set<number>();
  for (const linha of linhas) {
    const texto = normalizarTexto(linha.itens.map((i) => i.texto).join(" "));
    if (/especial|vendas exclusivas|mega da virada|quina friday/.test(texto)) {
      for (const m of texto.matchAll(/\((\d{3,5})\)/g)) especialIds.add(Number(m[1]));
    }
  }
  const excecaoPorConcurso = new Map<number, { dataEncerramento: string; horaEncerramento: string; dataSorteio: string; horaSorteio: string }>();
  const textoCompleto = normalizarTexto(itens.map((i) => i.texto).join(" "));
  const nota24 = /no dia 24\/12\/(\d{4}).{0,220}?encerrarao as 16h.{0,140}?sorteio ocorrera a partir das 17h/i.exec(textoCompleto);
  if (nota24) {
    const data = `${nota24[1]}-12-24`;
    const linha = linhas.find((l) => datasPorLinha.get(l.y) === data);
    if (linha) for (const m of MODALIDADES) {
      const c = linha.itens.find((i) => Math.abs(centro(i) - centros[m]) <= 18 && /^\d{3,5}$/.test(i.texto));
      if (c) excecaoPorConcurso.set(Number(c.texto), { dataEncerramento: data, horaEncerramento: "16:00", dataSorteio: data, horaSorteio: "17:00" });
    }
  }
  // A Mega da Virada tem fechamento em 31/12 e sorteio no dia seguinte.
  const notaMegaVirada = /as apostas para o concurso especial da mega da virada\s*\(?(\d{3,5})\)?.{0,240}?encerrarao as 22h do dia 31\/12\/(\d{4}).{0,180}?sorteio ocorrera a partir das 11h do dia 01\/01\/(\d{4})/i.exec(textoCompleto);
  if (notaMegaVirada) {
    const id = Number(notaMegaVirada[1]);
    excecaoPorConcurso.set(id, {
      dataEncerramento: `${notaMegaVirada[2]}-12-31`, horaEncerramento: "22:00",
      dataSorteio: `${notaMegaVirada[3]}-01-01`, horaSorteio: "11:00",
    });
  }
  const sorteios: SorteioCalendario[] = [];
  const feriados = new Set<string>();
  for (const linha of linhas) {
    const data = datasPorLinha.get(linha.y);
    if (!data) continue;
    if (/feriado/i.test(linha.itens.map((i) => i.texto).join(" "))) feriados.add(data);
    for (const m of MODALIDADES) {
      const coluna = linha.itens.filter((i) => Math.abs(centro(i) - centros[m]) <= 18 && /^\d{3,5}$/.test(i.texto))
        .sort((a, b) => Math.abs(centro(a) - centros[m]) - Math.abs(centro(b) - centros[m]))[0];
      if (!coluna) continue;
      const concurso = Number(coluna.texto);
      const excecao = excecaoPorConcurso.get(concurso);
      const dataSorteio = excecao?.dataSorteio ?? data;
      const horaSorteio = excecao?.horaSorteio ?? null;
      sorteios.push({
        modalidade: m, data: dataSorteio, concurso, especial: especialIds.has(concurso),
        apostasEncerramEm: excecao ? isoInstante(excecao.dataEncerramento, excecao.horaEncerramento) : null,
        horaSorteio,
      });
    }
  }
  const meses = [...new Set(sorteios.map((s) => mesIso(s.data)))].sort();
  // A linha final de dezembro também pode listar o concurso da Mega da Virada em janeiro.
  if (sorteios.some((s) => s.especial && s.modalidade === "megasena" && s.data.endsWith("-01-01"))) {
    const jan = sorteios.find((s) => s.especial && s.modalidade === "megasena" && s.data.endsWith("-01-01"))!.data.slice(0, 7);
    if (!meses.includes(jan)) meses.push(jan);
  }
  if (!meses.includes(mesEsperado)) throw new Error(`o PDF não contém concursos do mês esperado ${mesEsperado}`);
  if (sorteios.length === 0) throw new Error("o PDF oficial não trouxe concursos das modalidades vendidas");
  return {
    geradoEm, validoAte,
    regras: {
      semanal: false, domingoSabado22h: false, bolao15min: false,
      umaHoraAntes: /demais modalidades.{0,100}?01\s*\(uma\)\s*hora antes do sorteio/i.test(textoCompleto),
      bolaoSemana1930: false,
    },
    meses: meses.sort(), sorteios, feriados: [...feriados].sort(),
  };
}

export interface ResultadoAtualizacaoCalendario {
  ok: boolean;
  calendario: CalendarioOficial | null;
  extraidoEm: string;
  fontes: Array<{ tipo: string; url: string; ok: boolean; detalhe: string }>;
  erros: string[];
  impressaoDigital: string | null;
  regrasPreco: Array<{ modalidade: Modalidade; ok: boolean; divergencias: string[]; fonteUrl: string }>;
}

function lerRegrasGerais(texto: string, comunicado: string, paginasModalidade: Map<Modalidade, string>): RegrasVerificadas {
  const r = normalizarTexto(texto);
  const trechoModalidade = (nome: string) => {
    const padrao = new RegExp(`${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(.{1,220}?)\\s+saiba mais`, "i");
    return padrao.exec(r)?.[1] ?? "";
  };
  const mega = trechoModalidade("mega-sena");
  const facil = trechoModalidade("lotofacil");
  const quina = trechoModalidade("quina");
  const mania = trechoModalidade("lotomania");
  const cronograma =
    /tercas e quintas-feiras.{0,80}?21 horas.{0,80}?domingos.{0,50}?11 horas/i.test(mega) &&
    /segundas, tercas, quartas, quintas e sextas-feiras.{0,80}?21 horas.{0,80}?domingos.{0,50}?11 horas/i.test(facil) &&
    /segundas, tercas, quartas, quintas e sextas-feiras.{0,80}?21 horas.{0,80}?domingos.{0,50}?11 horas/i.test(quina) &&
    /segundas, quartas e sextas.{0,50}?21 horas/i.test(mania);
  const c = normalizarTexto(comunicado);
  const bolao = c.includes("15 minutos antes do sorteio");
  const domingo = c.includes("22h de sabado") && c.includes("19 de julho de 2026") && c.includes("aos domingos");
  const umaHora = false; // A regra genérica vem dos PDFs mensais, não do comunicado.
  const bolaoSemana1930 = MODALIDADES.every((m) => {
    const pagina = normalizarTexto(paginasModalidade.get(m) ?? "");
    return pagina.includes("19h30") && pagina.includes("boloes digitais");
  });
  return { semanal: cronograma, domingoSabado22h: domingo, bolao15min: bolao, umaHoraAntes: umaHora, bolaoSemana1930 };
}

function validarMesUrl(html: string, mes: number, ano: number): string {
  const alvo = normalizarTexto(`Cronograma_${String(mes).padStart(2, "0")}_${MES_NOME[mes - 1]}_${ano}.pdf`);
  const links = [...html.matchAll(/href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map((m) => m[1]!);
  const encontrado = links.find((link) => normalizarTexto(decodeURIComponent(link)).includes(alvo));
  if (!encontrado) throw new Error(`link do cronograma oficial ${alvo} ausente na página da CAIXA`);
  const u = new URL(encontrado, "https://www.caixa.gov.br");
  if (u.hostname !== "www.caixa.gov.br" || !u.pathname.includes("/Downloads/caixa-loterias/")) throw new Error("link do cronograma não pertence ao caminho oficial esperado");
  return u.toString();
}

/**
 * Atualiza um calendário mensal e seguinte, além de consultar as páginas oficiais de preço/regras.
 * Nenhum resultado parcial substitui o calendário anterior: `ok=false` quando falta qualquer fonte crítica.
 */
export async function atualizarCalendarioOficial(
  opcoes: { buscar?: BuscarFonte; agora?: Date; validadeDias?: number } = {},
): Promise<ResultadoAtualizacaoCalendario> {
  const buscar = opcoes.buscar ?? buscarFonteCaixa;
  const agora = opcoes.agora ?? new Date();
  const extraidoEm = agora.toISOString();
  const validadeDias = Math.min(31, Math.max(1, opcoes.validadeDias ?? 8));
  const validoAte = new Date(agora.getTime() + validadeDias * 86_400_000).toISOString();
  const d = new Date(agora.getTime() - 3 * 3_600_000);
  const mesAtual = d.getUTCMonth() + 1, anoAtual = d.getUTCFullYear();
  const mesSeguinte = mesAtual === 12 ? 1 : mesAtual + 1;
  const anoSeguinte = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  const erros: string[] = [];
  const fontes: ResultadoAtualizacaoCalendario["fontes"] = [];
  const regrasPreco: ResultadoAtualizacaoCalendario["regrasPreco"] = [];
  let paginaRegras = "", paginaComunicados = "";
  let htmlRegras = "";
  const paginasModalidade = new Map<Modalidade, string>();
  for (const [tipo, url] of [["regras", URL_REGRAS_SORTEIOS], ["comunicados", URL_COMUNICADOS]] as const) {
    try {
      const res = await buscar(url, "texto");
      if (res.status !== 200 || !res.texto) throw new Error(`HTTP ${res.status}`);
      if (tipo === "regras") { htmlRegras = res.texto; paginaRegras = htmTexto(res.texto); }
      else paginaComunicados = htmTexto(res.texto);
      fontes.push({ tipo, url: res.urlFinal ?? url, ok: true, detalhe: "leitura concluída" });
    } catch (e) {
      erros.push(`${tipo}: ${String((e as Error).message ?? e).slice(0, 120)}`);
      fontes.push({ tipo, url, ok: false, detalhe: "leitura indisponível ou inválida" });
    }
  }
  const mesesAlvo = [{ mes: mesAtual, ano: anoAtual }, { mes: mesSeguinte, ano: anoSeguinte }];
  const mesesLidos: CalendarioOficial[] = [];
  for (const alvo of mesesAlvo) {
    const mesIsoEsperado = `${alvo.ano}-${String(alvo.mes).padStart(2, "0")}`;
    try {
      const url = htmlRegras ? validarMesUrl(htmlRegras, alvo.mes, alvo.ano) : urlPdf(alvo.mes, alvo.ano);
      const res = await buscar(url, "pdf");
      if (res.status !== 200 || !res.bytes?.length) throw new Error(`PDF respondeu HTTP ${res.status} ou veio vazio`);
      const cal = await parsearPdfCronograma(res.bytes, mesIsoEsperado, res.urlFinal ?? url, extraidoEm, validoAte);
      mesesLidos.push(cal);
      fontes.push({ tipo: `cronograma_${mesIsoEsperado}`, url: res.urlFinal ?? url, ok: true, detalhe: `${cal.sorteios.length} concursos extraídos por posição das colunas` });
    } catch (e) {
      erros.push(`cronograma ${mesIsoEsperado}: ${String((e as Error).message ?? e).slice(0, 140)}`);
      fontes.push({ tipo: `cronograma_${mesIsoEsperado}`, url: urlPdf(alvo.mes, alvo.ano), ok: false, detalhe: "PDF ausente, inválido ou não verificável" });
    }
  }
  for (const m of MODALIDADES) {
    try {
      const url = REGRAS[m].fonteUrl;
      const res = await buscar(url, "texto");
      if (res.status !== 200 || !res.texto) throw new Error(`HTTP ${res.status}`);
      const texto = htmTexto(res.texto);
      paginasModalidade.set(m, texto);
      const conf = conferirTextoOficial(m, texto, agora);
      regrasPreco.push({ modalidade: m, ok: conf.ok, divergencias: conf.divergencias, fonteUrl: res.urlFinal ?? url });
      fontes.push({ tipo: `preco_regras_${m}`, url: res.urlFinal ?? url, ok: conf.ok, detalhe: conf.ok ? "preços e regras bateram com as âncoras cadastradas" : conf.divergencias.join("; ").slice(0, 180) });
      if (!conf.ok) erros.push(`preço/regras ${m}: divergência com o cadastro oficial`);
    } catch (e) {
      regrasPreco.push({ modalidade: m, ok: false, divergencias: [`página indisponível: ${String((e as Error).message ?? e).slice(0, 100)}`], fonteUrl: REGRAS[m].fonteUrl });
      erros.push(`preço/regras ${m}: página oficial indisponível`);
    }
  }
  const pdfsUmaHora = mesesLidos.length === mesesAlvo.length && mesesLidos.every((c) => c.regras.umaHoraAntes);
  const regrasBase = lerRegrasGerais(paginaRegras, paginaComunicados, paginasModalidade);
  const regras = { ...regrasBase, umaHoraAntes: pdfsUmaHora };
  if (!regras.semanal) erros.push("cronograma semanal: âncoras oficiais ausentes ou alteradas");
  if (!regras.domingoSabado22h) erros.push("fechamento de domingo: comunicado oficial não confirmou sábado às 22h");
  if (!regras.bolao15min) erros.push("fechamento de bolão digital de domingo: comunicado oficial não confirmou 15 minutos antes");
  if (!regras.umaHoraAntes) erros.push("fechamento geral: PDFs mensais não confirmaram uma hora antes");
  if (!regras.bolaoSemana1930) fontes.push({
    tipo: "fechamento_bolao_dia_util", url: REGRAS.megasena.fonteUrl, ok: false,
    detalhe: "horário não confirmado; este canal permanece desabilitado sem afetar a aposta simples",
  });
  const unicos = new Map<string, SorteioCalendario>();
  for (const cal of mesesLidos) for (const s of cal.sorteios) unicos.set(`${s.modalidade}:${s.concurso}`, s);
  // Datas especiais e exceções só são utilizáveis quando o PDF do mês correspondente foi validado.
  const calendario: CalendarioOficial | null = mesesLidos.length === mesesAlvo.length && !erros.length
    ? {
        geradoEm: extraidoEm, validoAte, regras,
        meses: [...new Set(mesesLidos.flatMap((c) => c.meses))].sort(),
        sorteios: [...unicos.values()].sort((a, b) => a.data.localeCompare(b.data) || a.modalidade.localeCompare(b.modalidade)),
        feriados: [...new Set(mesesLidos.flatMap((c) => c.feriados))].sort(),
      }
    : null;
  const impressaoDigital = calendario ? createHash("sha256").update(JSON.stringify(calendario)).digest("hex") : null;
  return { ok: calendario !== null, calendario, extraidoEm, fontes, erros, impressaoDigital, regrasPreco };
}

