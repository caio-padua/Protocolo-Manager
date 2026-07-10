// PARSER DE POSOLOGIA — CLONE FIEL do motor do primo IHE (lib/posologia).
// Copiado como módulo NATIVO do Manager (regra dos primos independentes: sem
// prefixo de origem). Transforma texto livre de posologia em estrutura
// normalizada e devolve uma frase canônica. Fonte: IHE lib/posologia/src.
//
// NÃO recriar heurísticas aqui: mantê-lo idêntico ao IHE facilita reaproveitar
// futuras evoluções do primo. Ajustes de negócio ficam em quem consome (ex.:
// formula-manipulada.ts), nunca dentro deste parser.

export type UnidadeForma =
  | "capsula"
  | "comprimido"
  | "dose"
  | "pellet"
  | "ml"
  | "gota"
  | "ampola"
  | "sache"
  | "spray"
  | "puff"
  | "unidade";

export type ViaAdministracao =
  | "oral"
  | "sublingual"
  | "intramuscular"
  | "endovenosa"
  | "subcutanea"
  | "topica"
  | "nasal"
  | "retal"
  | "vaginal"
  | "ocular"
  | "implante";

export type MomentoIngestao =
  | "jejum"
  | "antes_dormir"
  | "antes_cafe"
  | "antes_almoco"
  | "antes_jantar"
  | "com_refeicao"
  | "apos_refeicao"
  | "manha"
  | "tarde"
  | "noite";

export type FrequenciaTipo =
  | "diaria"
  | "semanal"
  | "mensal"
  | "horaria"
  | "unica"
  | "continua";

export interface Frequencia {
  tipo: FrequenciaTipo;
  /** Número de vezes por unidade (ex.: 2x ao dia → vezes=2, tipo="diaria"). */
  vezes?: number;
  /** Intervalo em horas entre doses (ex.: 8/8h → intervaloHoras=8). */
  intervaloHoras?: number;
}

export interface PosologiaEstruturada {
  /** Texto original — sempre preenchido. */
  raw: string;
  /** true quando ao menos uma heurística casou. false = fallback texto puro. */
  interpretado: boolean;
  /** Quantidade administrada por tomada (ex.: 1 cápsula → 1). */
  quantidade?: number;
  /** Unidade da forma farmacêutica (cápsula, comprimido, mL, pellet…). */
  unidadeForma?: UnidadeForma;
  /** Via de administração (oral, IM, EV, SC, sublingual…). */
  via?: ViaAdministracao;
  /** Dose ativa em mg, quando explicitada (ex.: "100mg" → 100). */
  doseMg?: number;
  /** Volume em mL, para injetáveis e soluções (ex.: "/ 2mL" → 2). */
  volumeMl?: number;
  /** Frequência normalizada. */
  frequencia?: Frequencia;
  /** Momentos relativos a refeição/sono detectados. */
  momento?: MomentoIngestao[];
  /** Duração explícita em dias (ex.: "por 7 dias" → 7). */
  duracaoDias?: number;
  /** Texto residual / observações livres não mapeáveis. */
  observacoes?: string;
}

export interface ParseContexto {
  /** Categoria do item (ajuda a desambiguar formatos). */
  categoria?:
    | "formula"
    | "injetavel_im"
    | "injetavel_ev"
    | "implante"
    | "exame"
    | "protocolo"
    | "revo_medicamento"
    | "revo_formula";
  /** Via padrão do catálogo, usada como fallback quando não detectada no texto. */
  viaPadrao?: ViaAdministracao;
}

/* -------------------------------------------------------------------------- */
/* Normalização                                                               */
/* -------------------------------------------------------------------------- */

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Mapas de detecção                                                          */
/* -------------------------------------------------------------------------- */

const FORMA_REGEX: Array<[RegExp, UnidadeForma]> = [
  [/\b(caps?(?:ulas?)?|caps?)\b/, "capsula"],
  [/\b(comp(?:r(?:imidos?)?)?|cpr|cp)\b/, "comprimido"],
  [/\bpellets?\b/, "pellet"],
  [/\b(ml|mililitros?)\b/, "ml"],
  [/\bgotas?\b/, "gota"],
  [/\bampolas?\b/, "ampola"],
  [/\bsach[eê]s?\b/, "sache"],
  [/\bsprays?\b/, "spray"],
  [/\bpuffs?\b/, "puff"],
  [/\bdoses?\b/, "dose"],
  [/\bunid(?:ades?)?\b/, "unidade"],
];

const VIA_REGEX: Array<[RegExp, ViaAdministracao]> = [
  [/\b(vo|via oral|oral)\b/, "oral"],
  [/\b(sl|sublingual)\b/, "sublingual"],
  [/\b(im|intramuscular)\b/, "intramuscular"],
  [/\b(ev|iv|endovenos[ao]|intravenos[ao])\b/, "endovenosa"],
  [/\b(sc|subcutane[ao])\b/, "subcutanea"],
  [/\b(t[oó]pic[ao]|uso topico)\b/, "topica"],
  [/\bnasal\b/, "nasal"],
  [/\bretal\b/, "retal"],
  [/\bvaginal\b/, "vaginal"],
  [/\bocular\b/, "ocular"],
  [/\bimplante\b/, "implante"],
];

const MOMENTO_REGEX: Array<[RegExp, MomentoIngestao]> = [
  [/\bem\s+jejum\b|\bjejum\b/, "jejum"],
  [/\bantes\s+de\s+dormir\b|\bao\s+deitar\b/, "antes_dormir"],
  [/\bantes\s+(do\s+)?caf[eé]\b/, "antes_cafe"],
  [/\bantes\s+(do\s+)?almoc[oa]\b/, "antes_almoco"],
  [/\bantes\s+(do\s+)?jantar\b/, "antes_jantar"],
  [/\bcom\s+(as\s+)?refei[cç][oõ]es?\b|\bdurante\s+(as\s+)?refei[cç][oõ]es?\b/, "com_refeicao"],
  [/\bap[oó]s\s+(as\s+)?refei[cç][oõ]es?\b|\bdepois\s+(das\s+)?refei[cç][oõ]es?\b/, "apos_refeicao"],
  [/\bpela\s+manh[ãa]\b|\bde\s+manh[ãa]\b/, "manha"],
  [/\b[aà]\s+tarde\b|\bpela\s+tarde\b/, "tarde"],
  [/\b[aà]\s+noite\b|\bpela\s+noite\b/, "noite"],
];

/* -------------------------------------------------------------------------- */
/* Detectores específicos                                                     */
/* -------------------------------------------------------------------------- */

function detectarForma(t: string): UnidadeForma | undefined {
  for (const [re, forma] of FORMA_REGEX) if (re.test(t)) return forma;
  return undefined;
}

function detectarVia(t: string): ViaAdministracao | undefined {
  for (const [re, via] of VIA_REGEX) if (re.test(t)) return via;
  return undefined;
}

function detectarMomentos(t: string): MomentoIngestao[] {
  const out: MomentoIngestao[] = [];
  for (const [re, m] of MOMENTO_REGEX) if (re.test(t) && !out.includes(m)) out.push(m);
  return out;
}

function detectarDoseMg(t: string): number | undefined {
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*mg\b/);
  if (!m) return undefined;
  return Number(m[1].replace(",", "."));
}

function detectarVolumeMl(t: string): number | undefined {
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*ml\b/);
  if (!m) return undefined;
  return Number(m[1].replace(",", "."));
}

function detectarDuracaoDias(t: string): number | undefined {
  const m = t.match(/(?:por|durante)\s+(\d+)\s*(dias?|d)\b/);
  if (m) return Number(m[1]);
  const m2 = t.match(/(\d+)\s*dias\b/);
  if (m2) return Number(m2[1]);
  return undefined;
}

function detectarFrequencia(t: string): Frequencia | undefined {
  // Nx/dia, Nx ao dia, N vezes ao dia
  const mDia = t.match(/(\d+)\s*x\s*(?:\/|ao|por|no)?\s*dia\b/) || t.match(/(\d+)\s*vezes?\s*(?:ao|por)\s*dia\b/);
  if (mDia) return { tipo: "diaria", vezes: Number(mDia[1]) };

  // Nx/semana
  const mSem = t.match(/(\d+)\s*x\s*(?:\/|ao|por)?\s*semana\b/) || t.match(/(\d+)\s*vezes?\s*(?:ao|por)\s*semana\b/);
  if (mSem) return { tipo: "semanal", vezes: Number(mSem[1]) };

  // Nx/mes
  const mMes = t.match(/(\d+)\s*x\s*(?:\/|ao|por)?\s*m[eê]s\b/) || t.match(/(\d+)\s*vezes?\s*(?:ao|por)\s*m[eê]s\b/);
  if (mMes) return { tipo: "mensal", vezes: Number(mMes[1]) };

  // de N em N horas (8/8h, 6 em 6 horas)
  const mInt = t.match(/(\d+)\s*\/\s*(\d+)\s*h\b/) || t.match(/de\s+(\d+)\s+em\s+(\d+)\s*h(?:oras?)?\b/);
  if (mInt && mInt[1] === mInt[2]) return { tipo: "horaria", intervaloHoras: Number(mInt[1]) };

  // 1x/dia implícito ("1 capsula ao dia", "uma vez ao dia")
  if (/\b(1|uma?)\s*vez\s*(ao|por|no)?\s*dia\b/.test(t)) return { tipo: "diaria", vezes: 1 };
  if (/\bao dia\b|\bpor dia\b|\bdiariamente\b|\bdiario\b/.test(t)) return { tipo: "diaria", vezes: 1 };
  if (/\bsemanal(mente)?\b/.test(t)) return { tipo: "semanal", vezes: 1 };
  if (/\bmensal(mente)?\b/.test(t)) return { tipo: "mensal", vezes: 1 };
  if (/\bdose\s+[uú]nica\b/.test(t)) return { tipo: "unica" };
  if (/\bcontinu[ao]\b|\buso continuo\b/.test(t)) return { tipo: "continua" };

  return undefined;
}

/**
 * Lê a quantidade no início do texto.
 * Aceita números (1, 2, 0.5) ou palavras (um, uma, dois, duas, três).
 */
function detectarQuantidade(t: string): number | undefined {
  const palavras: Record<string, number> = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, "três": 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, meia: 0.5, meio: 0.5,
  };
  const mNum = t.match(/^(\d+(?:[.,]\d+)?)\s+/);
  if (mNum) return Number(mNum[1].replace(",", "."));
  const mPal = t.match(/^([a-z]+)\s+/);
  if (mPal && palavras[mPal[1]] !== undefined) return palavras[mPal[1]];
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Parser principal                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Transforma um texto livre de posologia em estrutura normalizada.
 *
 * Sempre devolve `raw` igual ao texto original. Quando nenhuma heurística
 * casa, devolve `{ raw, interpretado: false }` para fallback no consumidor.
 */
export function parsePosologia(
  texto: string | null | undefined,
  contexto?: ParseContexto,
): PosologiaEstruturada {
  const raw = (texto ?? "").trim();
  if (!raw) return { raw: "", interpretado: false };

  const t = normalizar(raw);

  // Caso especial: "100mg / 2mL" → dose+volume puro de injetável.
  const mDoseVol = t.match(/^\s*(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*(\d+(?:[.,]\d+)?)\s*ml\s*$/);
  if (mDoseVol) {
    const result: PosologiaEstruturada = {
      raw,
      interpretado: true,
      doseMg: Number(mDoseVol[1].replace(",", ".")),
      volumeMl: Number(mDoseVol[2].replace(",", ".")),
    };
    if (contexto?.viaPadrao) result.via = contexto.viaPadrao;
    else if (contexto?.categoria === "injetavel_im") result.via = "intramuscular";
    else if (contexto?.categoria === "injetavel_ev") result.via = "endovenosa";
    return result;
  }

  // Caso especial: "50 mg — 4 pellets" → implante.
  const mImpl = t.match(/(\d+(?:[.,]\d+)?)\s*mg\s*-\s*(\d+)\s*pellets?\b/);
  if (mImpl) {
    return {
      raw,
      interpretado: true,
      doseMg: Number(mImpl[1].replace(",", ".")),
      quantidade: Number(mImpl[2]),
      unidadeForma: "pellet",
      via: "implante",
    };
  }

  const quantidade = detectarQuantidade(t);
  const unidadeForma = detectarForma(t);
  const via = detectarVia(t) ?? contexto?.viaPadrao;
  const doseMg = detectarDoseMg(t);
  const volumeMl = detectarVolumeMl(t);
  const momento = detectarMomentos(t);
  let frequencia = detectarFrequencia(t);
  const duracaoDias = detectarDuracaoDias(t);

  // Heurística: "1 capsula 1 hora antes de dormir" → frequência diária 1x.
  if (!frequencia && momento.length > 0 && quantidade !== undefined) {
    frequencia = { tipo: "diaria", vezes: 1 };
  }

  const interpretado = Boolean(
    quantidade !== undefined ||
    unidadeForma ||
    via ||
    doseMg !== undefined ||
    volumeMl !== undefined ||
    frequencia ||
    momento.length > 0 ||
    duracaoDias !== undefined,
  );

  const out: PosologiaEstruturada = { raw, interpretado };
  if (quantidade !== undefined) out.quantidade = quantidade;
  if (unidadeForma) out.unidadeForma = unidadeForma;
  if (via) out.via = via;
  if (doseMg !== undefined) out.doseMg = doseMg;
  if (volumeMl !== undefined) out.volumeMl = volumeMl;
  if (frequencia) out.frequencia = frequencia;
  if (momento.length > 0) out.momento = momento;
  if (duracaoDias !== undefined) out.duracaoDias = duracaoDias;
  return out;
}

/* -------------------------------------------------------------------------- */
/* Renderização canônica                                                      */
/* -------------------------------------------------------------------------- */

const FORMA_LABEL: Record<UnidadeForma, [string, string]> = {
  capsula: ["cápsula", "cápsulas"],
  comprimido: ["comprimido", "comprimidos"],
  dose: ["dose", "doses"],
  pellet: ["pellet", "pellets"],
  ml: ["mL", "mL"],
  gota: ["gota", "gotas"],
  ampola: ["ampola", "ampolas"],
  sache: ["sachê", "sachês"],
  spray: ["spray", "sprays"],
  puff: ["puff", "puffs"],
  unidade: ["unidade", "unidades"],
};

export const VIA_LABEL: Record<ViaAdministracao, string> = {
  oral: "via oral",
  sublingual: "via sublingual",
  intramuscular: "intramuscular",
  endovenosa: "endovenosa",
  subcutanea: "subcutânea",
  topica: "uso tópico",
  nasal: "via nasal",
  retal: "via retal",
  vaginal: "via vaginal",
  ocular: "uso ocular",
  implante: "implante",
};

const MOMENTO_LABEL: Record<MomentoIngestao, string> = {
  jejum: "em jejum",
  antes_dormir: "antes de dormir",
  antes_cafe: "antes do café",
  antes_almoco: "antes do almoço",
  antes_jantar: "antes do jantar",
  com_refeicao: "com as refeições",
  apos_refeicao: "após as refeições",
  manha: "pela manhã",
  tarde: "à tarde",
  noite: "à noite",
};

function fraseFrequencia(f: Frequencia): string {
  if (f.tipo === "horaria" && f.intervaloHoras) return `de ${f.intervaloHoras} em ${f.intervaloHoras} horas`;
  if (f.tipo === "unica") return "dose única";
  if (f.tipo === "continua") return "uso contínuo";
  const sufixo = f.tipo === "diaria" ? "ao dia" : f.tipo === "semanal" ? "por semana" : "por mês";
  const vezes = f.vezes ?? 1;
  return vezes === 1 ? `1x ${sufixo}` : `${vezes}x ${sufixo}`;
}

/**
 * Devolve uma frase canônica a partir da estrutura, ex.:
 * "1 cápsula, via oral, 1x ao dia, antes de dormir".
 * Retorna `raw` quando `interpretado=false`.
 */
export function formatarPosologiaEstruturada(p: PosologiaEstruturada): string {
  if (!p.interpretado) return p.raw;
  const partes: string[] = [];

  if (p.quantidade !== undefined && p.unidadeForma) {
    const [sing, plural] = FORMA_LABEL[p.unidadeForma];
    const label = p.quantidade === 1 ? sing : plural;
    partes.push(`${p.quantidade} ${label}`);
  } else if (p.unidadeForma) {
    partes.push(FORMA_LABEL[p.unidadeForma][0]);
  } else if (p.quantidade !== undefined) {
    partes.push(String(p.quantidade));
  }

  if (p.doseMg !== undefined && p.volumeMl !== undefined) {
    partes.push(`${p.doseMg} mg / ${p.volumeMl} mL`);
  } else if (p.doseMg !== undefined) {
    partes.push(`${p.doseMg} mg`);
  } else if (p.volumeMl !== undefined) {
    partes.push(`${p.volumeMl} mL`);
  }

  if (p.via) partes.push(VIA_LABEL[p.via]);
  if (p.frequencia) partes.push(fraseFrequencia(p.frequencia));
  if (p.momento && p.momento.length > 0) {
    partes.push(p.momento.map((m) => MOMENTO_LABEL[m]).join(", "));
  }
  if (p.duracaoDias !== undefined) partes.push(`por ${p.duracaoDias} dias`);

  return partes.length > 0 ? partes.join(", ") : p.raw;
}

// NORMALIZADOR DE ACENTO (regra do CEO, 09/07/2026): toda mensagem de lembrete
// sai SEM acento para nao dar erro em nenhum canal. Remove marcas diacriticas
// (NFD) e troca c-cedilha; preserva emojis, quebras e formatacao (*_).
export function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00ba/g, "o")
    .replace(/\u00aa/g, "a");
}
