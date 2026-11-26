// LEITURA DETERMINÍSTICA DA DOSE DE UMA SUBSTÂNCIA (texto do catálogo -> nome + dose).
//
// Regra mãe: o que não for lido COM CERTEZA nunca vira dose na mensagem. Em vez de
// chutar, devolve `alerta` e o motor de lembrete NÃO envia (ver lembrete-periodo.ts).
// Função pura: sem banco, sem rede, sem relógio.
//
// Convenção brasileira: ponto separa MILHAR ("5.000" = cinco mil) e vírgula separa
// DECIMAL ("0,5" = meio). O número sai colado na unidade ("200mg", "5.000mcg").

export interface SubstanciaInterpretada {
  /** Nome sem a dose, ainda no formato do catálogo (quem chama aplica Title Case). */
  nomeBruto: string;
  /** Dose pronta para a mensagem, ex.: "5.000mcg", "0,5mg", "100mcg/ml". */
  dose?: string;
  /** Motivo pelo qual a leitura não é segura. Presente = NÃO enviar. */
  alerta?: string;
}

const UNIDADE = "(?:mcg|µg|μg|ug|mg|kg|ml|ui|iu|meq|mmol|g|l)";
const COMPOSTA = "(?:\\s*\\/\\s*(?:ml|g|kg|l|ui|mg))?";
const RE_DOSE = new RegExp(
  `(?<![\\p{L}\\d.,])(\\d+(?:[.,]\\d+)*)\\s*(${UNIDADE})(${COMPOSTA})(?![\\p{L}\\d])`,
  "giu",
);
// Unidade ou forma que o motor NÃO sabe converter: número seguido destas palavras = dúvida.
const RE_UNIDADE_DESCONHECIDA = new RegExp(
  "(?<![\\p{L}\\d])\\d+(?:[.,]\\d+)*\\s*(?:gotas?|gts|caps?|capsulas?|cápsulas?|sache?s?|sachês?|cfu|ufc|ppm|mui|miu|mol|bilhoes|bilhões|milhoes|milhões|mgs|mcgs|gramas?|miligramas?|microgramas?|mililitros?|litros?|unidades?)(?![\\p{L}])",
  "iu",
);
// Unidades em que "1.500" é, sem dúvida, mil e quinhentos (milhar rotineiro).
const UNIDADES_MILHAR = new Set(["mg", "mcg", "ui"]);
const LIMITE_DOSE_CARACTERES = 12;

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function normalizarUnidade(u: string): string {
  const x = u.toLowerCase();
  if (x === "µg" || x === "μg" || x === "ug") return "mcg";
  if (x === "iu") return "ui";
  return x;
}

type NumeroLido = { texto: string; valor: number } | { alerta: string };

/** Número no padrão brasileiro. Qualquer forma ambígua devolve alerta (nunca adivinha). */
export function lerNumeroBR(token: string, unidade: string): NumeroLido {
  const milharPermitido = UNIDADES_MILHAR.has(unidade);

  // 1. Só dígitos: "500", "1000".
  if (/^\d+$/.test(token)) {
    if (token.length > 1 && token.startsWith("0")) return { alerta: `numero com zero a esquerda ("${token}")` };
    const valor = Number(token);
    if (valor === 0) return { alerta: "dose igual a zero" };
    return { texto: agruparMilhar(token), valor };
  }

  // 2. Vírgula decimal: "0,5", "1,25".
  let m = /^(\d+),(\d+)$/.exec(token);
  if (m) {
    const [, inteiro, dec] = m;
    if (inteiro.length > 1 && inteiro.startsWith("0")) return { alerta: `numero com zero a esquerda ("${token}")` };
    if (inteiro !== "0" && dec.length === 3 && inteiro.length <= 3) {
      return { alerta: `"${token}" pode ser decimal (virgula) ou milhar de outro padrao` };
    }
    const valor = Number(`${inteiro}.${dec}`);
    if (valor === 0) return { alerta: "dose igual a zero" };
    return { texto: `${agruparMilhar(inteiro)},${dec}`, valor };
  }

  // 3. Ponto com 1-3 dígitos antes e grupos de 3 depois: milhar ("5.000", "1.500", "1.000.000"),
  //    opcionalmente com vírgula decimal ("1.500,5").
  m = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/.exec(token);
  if (m && !token.startsWith("0.")) {
    const [, inteiroComPonto, dec] = m;
    if (!dec && !milharPermitido) {
      return { alerta: `"${token} ${unidade}" pode ser milhar ou decimal` };
    }
    const inteiro = inteiroComPonto.replace(/\./g, "");
    const valor = Number(dec ? `${inteiro}.${dec}` : inteiro);
    if (valor === 0) return { alerta: "dose igual a zero" };
    return { texto: dec ? `${agruparMilhar(inteiro)},${dec}` : agruparMilhar(inteiro), valor };
  }

  // 4. Ponto decimal (padrão de outro país): "0.21", "1.5", "0.500", "1000.5".
  m = /^(\d+)\.(\d+)$/.exec(token);
  if (m) {
    const [, inteiro, dec] = m;
    if (inteiro.length > 1 && inteiro.startsWith("0")) return { alerta: `numero com zero a esquerda ("${token}")` };
    const valor = Number(`${inteiro}.${dec}`);
    if (valor === 0) return { alerta: "dose igual a zero" };
    return { texto: `${agruparMilhar(inteiro)},${dec}`, valor };
  }

  return { alerta: `formato de numero ambiguo ("${token}")` };
}

/** "SUBS" cru do catálogo (ex.: "MAGNESIO 200 MG") -> nome + dose, ou alerta. */
export function interpretarSubstancia(subsRaw: string): SubstanciaInterpretada {
  const raw = subsRaw.trim().replace(/\s+/g, " ");
  const matches = [...raw.matchAll(RE_DOSE)];

  const limparNome = (s: string) =>
    s.replace(/\s+/g, " ").replace(/^[\s\-–—,;:+/]+|[\s\-–—,;:+/]+$/g, "").trim();

  if (matches.length === 0) {
    const nomeBruto = limparNome(raw);
    if (RE_UNIDADE_DESCONHECIDA.test(raw)) {
      return { nomeBruto, alerta: "unidade de dose nao reconhecida" };
    }
    return { nomeBruto, ...(nomeBruto ? {} : { alerta: "substancia sem nome" }) };
  }

  if (matches.length > 1) {
    return { nomeBruto: limparNome(raw), alerta: "mais de uma dose no mesmo campo de substancia" };
  }

  const m = matches[0];
  const unidade = normalizarUnidade(m[2]);
  const composta = (m[3] ?? "").replace(/\s+/g, "").toLowerCase();
  const antes = raw.slice(0, m.index);
  const depois = raw.slice((m.index ?? 0) + m[0].length);
  const nomeBruto = limparNome(`${antes} ${depois}`);
  const falha = (alerta: string): SubstanciaInterpretada => ({ nomeBruto, alerta });

  if (!nomeBruto) return falha("substancia sem nome");

  // Faixa ("5-10 mg", "5 a 10 mg"): a dose não é um valor único.
  if (/\d\s*(?:-|–|—|a|ate|até)\s*$/i.test(antes)) return falha("dose em faixa (de-ate)");

  // "1 000 mg": número solto de 1 a 3 dígitos colado antes da dose de 3 dígitos pode ser
  // milhar com espaço ("1 000") ou nome com número ("OMEGA 3 100 MG"): ambíguo.
  if (/(?<![\p{L}\d.,])\d{1,3}\s+$/u.test(antes) && /^\d{3}(?:[.,]\d+)?$/.test(m[1])) {
    return falha("numero solto antes da dose (milhar com espaco ou numero do nome)");
  }

  if (RE_UNIDADE_DESCONHECIDA.test(`${antes} ${depois}`)) {
    return falha("unidade de dose nao reconhecida em outro trecho");
  }

  const numero = lerNumeroBR(m[1], unidade);
  if ("alerta" in numero) return falha(numero.alerta);

  const dose = `${numero.texto}${unidade}${composta}`;
  if (dose.length > LIMITE_DOSE_CARACTERES) return falha("dose longa demais para a coluna");
  return { nomeBruto, dose };
}

const RE_COLAR = /(\d)\s+(mcg|mg|kg|ml|ui|iu|g|l)(?![\p{L}\d])/giu;

/** Texto livre: remove o espaço entre número e unidade ("500 mg" -> "500mg"). Não mexe no número. */
export function colarUnidades(texto: string): string {
  return texto.replace(RE_COLAR, (_t, n: string, u: string) => `${n}${u.toLowerCase()}`);
}

/** Tira só os caracteres que a mensageria interpreta como formatação (* _ ~ e crase). */
export function limparTextoMensagem(texto: string): string {
  return texto.replace(/[*_~`]/g, "").replace(/[ \t]+/g, " ").trim();
}
