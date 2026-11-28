/**
 * Regras OFICIAIS das modalidades de Meus Jogos (CAIXA), em forma de dado versionado.
 * Conferidas em 15/11/2026 nas paginas oficiais de cada modalidade (ver specs/meus-jogos-area-cliente.md).
 * Nada aqui e inventado: preco ausente ou divergente da fonte bloqueia o pedido (ver `situacaoDaFonte`).
 */

export type Modalidade = "megasena" | "lotofacil" | "quina" | "lotomania";
export const MODALIDADES: readonly Modalidade[] = ["megasena", "lotofacil", "quina", "lotomania"];

export interface RegraModalidade {
  chave: Modalidade;
  nome: string;
  /** Menor e maior dezena do volante (Lotomania vai de 0 a 99, exibida com dois digitos). */
  dezenaMin: number;
  dezenaMax: number;
  dezenasMin: number;
  dezenasMax: number;
  /** Quantidade de dezenas sorteadas por concurso (usada para validar o resultado oficial). */
  sorteadas: number;
  /** quantidade de dezenas marcadas -> preco em centavos (tabela oficial). */
  precosCentavos: Readonly<Record<number, number>>;
  /** Slug da API publica de resultados da CAIXA. */
  apiSlug: string;
  fonteUrl: string;
  /** Trechos que devem existir na pagina oficial; se sumirem, a fonte mudou. */
  ancoras: readonly RegExp[];
  sorteios: string;
}

const c = (reais: string) => Math.round(Number(reais.replace(/\./g, "").replace(",", ".")) * 100);
const tabela = (pares: Array<[number, string]>): Record<number, number> => Object.fromEntries(pares.map(([n, v]) => [n, c(v)]));

export const REGRAS: Readonly<Record<Modalidade, RegraModalidade>> = {
  megasena: {
    chave: "megasena", nome: "Mega-Sena", dezenaMin: 1, dezenaMax: 60, dezenasMin: 6, dezenasMax: 20, sorteadas: 6,
    precosCentavos: tabela([[6, "6,00"], [7, "42,00"], [8, "168,00"], [9, "504,00"], [10, "1.260,00"], [11, "2.772,00"], [12, "5.544,00"], [13, "10.296,00"],
      [14, "18.018,00"], [15, "30.030,00"], [16, "48.048,00"], [17, "74.256,00"], [18, "111.384,00"], [19, "162.792,00"], [20, "232.560,00"]]),
    apiSlug: "megasena", fonteUrl: "https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx",
    ancoras: [/marque de 6 a 20 n[uú]meros/i, /aposta m[ií]nima, de 6 n[uú]meros, custa R\$ ?6,00/i, /dentre os 60/i],
    sorteios: "Terças e quintas, a partir das 21h, e domingos, a partir das 11h (conforme a CAIXA).",
  },
  lotofacil: {
    chave: "lotofacil", nome: "Lotofácil", dezenaMin: 1, dezenaMax: 25, dezenasMin: 15, dezenasMax: 20, sorteadas: 15,
    precosCentavos: tabela([[15, "3,50"], [16, "56,00"], [17, "476,00"], [18, "2.856,00"], [19, "13.566,00"], [20, "54.264,00"]]),
    apiSlug: "lotofacil", fonteUrl: "https://loterias.caixa.gov.br/Paginas/Lotofacil.aspx",
    ancoras: [/entre 15 e 20 n[uú]meros dentre os 25/i, /aposta m[ií]nima, de 15 n[uú]meros, custa R\$ ?3,50/i],
    sorteios: "Segundas, terças, quartas, quintas e sextas, às 21h; domingos, às 11h (conforme o cronograma oficial da CAIXA).",
  },
  quina: {
    chave: "quina", nome: "Quina", dezenaMin: 1, dezenaMax: 80, dezenasMin: 5, dezenasMax: 15, sorteadas: 5,
    precosCentavos: tabela([[5, "3,00"], [6, "18,00"], [7, "63,00"], [8, "168,00"], [9, "378,00"], [10, "756,00"], [11, "1.386,00"], [12, "2.376,00"], [13, "3.861,00"],
      [14, "6.006,00"], [15, "9.009,00"]]),
    apiSlug: "quina", fonteUrl: "https://loterias.caixa.gov.br/Paginas/Quina.aspx",
    ancoras: [/marque de 5 a 15 n[uú]meros dentre os 80/i, /pre[cç]o da aposta com 5 n[uú]meros [eé] de R\$ ?3,00/i],
    sorteios: "Segundas, terças, quartas, quintas e sextas, às 21h; domingos, às 11h (conforme o cronograma oficial da CAIXA).",
  },
  lotomania: {
    chave: "lotomania", nome: "Lotomania", dezenaMin: 0, dezenaMax: 99, dezenasMin: 50, dezenasMax: 50, sorteadas: 20,
    precosCentavos: tabela([[50, "3,00"]]),
    apiSlug: "lotomania", fonteUrl: "https://loterias.caixa.gov.br/Paginas/Lotomania.aspx",
    ancoras: [/marque 50 n[uú]meros no volante/i, /pre[cç]o da aposta [eé] [uú]nico e custa apenas R\$ ?3,00/i],
    sorteios: "Segundas, quartas e sextas, a partir das 21h (conforme a CAIXA).",
  },
};

/** Data em que o snapshot acima foi conferido com as paginas oficiais. */
export const SNAPSHOT_VERIFICADO_EM = "2026-11-15";
export const VALIDADE_SNAPSHOT_DIAS = 30;

export const ehModalidade = (v: unknown): v is Modalidade => typeof v === "string" && (MODALIDADES as readonly string[]).includes(v);

export type MotivoAposta = "quantidade_invalida" | "dezena_invalida" | "dezena_repetida" | "sem_preco_oficial";
export type ResultadoAposta = { ok: true; dezenas: number[]; precoCentavos: number } | { ok: false; motivo: MotivoAposta };

/** Valida UMA aposta contra a regra oficial e devolve as dezenas ordenadas e o preco oficial. */
export function validarAposta(modalidade: Modalidade, dezenas: unknown): ResultadoAposta {
  const r = REGRAS[modalidade];
  if (!Array.isArray(dezenas)) return { ok: false, motivo: "quantidade_invalida" };
  if (dezenas.length < r.dezenasMin || dezenas.length > r.dezenasMax) return { ok: false, motivo: "quantidade_invalida" };
  if (!dezenas.every((n) => Number.isInteger(n) && n >= r.dezenaMin && n <= r.dezenaMax)) return { ok: false, motivo: "dezena_invalida" };
  if (new Set(dezenas).size !== dezenas.length) return { ok: false, motivo: "dezena_repetida" };
  const preco = r.precosCentavos[dezenas.length];
  if (!Number.isSafeInteger(preco) || preco <= 0) return { ok: false, motivo: "sem_preco_oficial" };
  return { ok: true, dezenas: [...(dezenas as number[])].sort((a, b) => a - b), precoCentavos: preco };
}

export function precoOficial(modalidade: Modalidade, quantidade: number): number | null {
  const p = REGRAS[modalidade].precosCentavos[quantidade];
  return Number.isSafeInteger(p) ? p : null;
}

export type SituacaoFonte = { modalidade: Modalidade; desatualizado: boolean; motivo: string | null; verificadoEm: string };
export interface ConferenciaFonte { modalidade: Modalidade; ok: boolean; verificadoEm: string; divergencias: string[] }

const DIA_MS = 86_400_000;
const brl = (cent: number) => (cent / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Situacao do dado de cada modalidade. Vale a conferencia ao vivo mais recente quando existir:
 * conferencia com divergencia = desatualizado; conferencia ok renova a validade; sem conferencia vale o snapshot por 30 dias.
 */
export function situacaoDaFonte(modalidade: Modalidade, agora: Date, conferencia: ConferenciaFonte | null): SituacaoFonte {
  if (conferencia && !conferencia.ok) {
    return { modalidade, desatualizado: true, motivo: `A página oficial da CAIXA divergiu do cadastro (${conferencia.divergencias.slice(0, 2).join("; ")}).`, verificadoEm: conferencia.verificadoEm };
  }
  const base = conferencia?.ok ? conferencia.verificadoEm : SNAPSHOT_VERIFICADO_EM;
  const idade = (agora.getTime() - new Date(`${base.slice(0, 10)}T00:00:00-03:00`).getTime()) / DIA_MS;
  if (!(idade <= VALIDADE_SNAPSHOT_DIAS)) {
    return { modalidade, desatualizado: true, motivo: `Preços e regras sem conferência com a CAIXA há mais de ${VALIDADE_SNAPSHOT_DIAS} dias.`, verificadoEm: base };
  }
  return { modalidade, desatualizado: false, motivo: null, verificadoEm: base };
}

/** Compara o texto da pagina oficial com o cadastro. Texto vazio ou sem as ancoras = divergencia (nunca "ok" por omissao). */
export function conferirTextoOficial(modalidade: Modalidade, textoPagina: string, agora: Date): ConferenciaFonte {
  const r = REGRAS[modalidade];
  const t = textoPagina.replace(/\s+/g, " ");
  const divergencias: string[] = [];
  if (t.length < 500) divergencias.push("página oficial vazia ou ilegível");
  else {
    for (const a of r.ancoras) if (!a.test(t)) divergencias.push(`trecho oficial não encontrado: ${a.source.slice(0, 50)}`);
    for (const [n, cent] of Object.entries(r.precosCentavos)) {
      if (!t.includes(brl(cent))) divergencias.push(`preço de ${n} dezenas (R$ ${brl(cent)}) não consta na página`);
    }
  }
  return { modalidade, ok: divergencias.length === 0, verificadoEm: agora.toISOString(), divergencias };
}

/** Texto puro de uma pagina HTML (sem script/estilo/tags). */
export function htmlParaTexto(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
