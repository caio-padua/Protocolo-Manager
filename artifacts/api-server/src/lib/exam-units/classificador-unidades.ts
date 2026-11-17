/**
 * Classificador determinístico de unidades de exame (SEM IA, SEM banco).
 *
 * Decide, por análise dimensional com aritmética racional EXATA (BigInt), se uma unidade vinda do laudo
 * é equivalente, convertível por fator exato, ou se depende de informação que o sistema não tem.
 * Nunca inventa fator: o que não for comprovável sai como curadoria (CONTEXT_DEPENDENT, ANALYTE_SPECIFIC,
 * NON_CONVERTIBLE ou AMBIGUOUS). Só SAFE_ALIAS e DIMENSIONAL_CONVERSION são candidatos a aprovação automática.
 */
export type ClasseUnidade =
  | "MATCH_EXISTING"
  | "SAFE_ALIAS"
  | "DIMENSIONAL_CONVERSION"
  | "ANALYTE_SPECIFIC"
  | "CONTEXT_DEPENDENT"
  | "NON_CONVERTIBLE"
  | "AMBIGUOUS";

export interface Racional { num: bigint; den: bigint }
const mdc = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a || 1n; };
export const rac = (num: bigint, den: bigint = 1n): Racional => { const g = mdc(num, den); const s = den < 0n ? -1n : 1n; return { num: (s * num) / g, den: (s * den) / g }; };
const mul = (a: Racional, b: Racional) => rac(a.num * b.num, a.den * b.den);
const div = (a: Racional, b: Racional) => rac(a.num * b.den, a.den * b.num);
const pot10 = (e: number): Racional => (e >= 0 ? rac(10n ** BigInt(e)) : rac(1n, 10n ** BigInt(-e)));
export const ehUm = (r: Racional) => r.num === 1n && r.den === 1n;
export const fatorComoNumero = (r: Racional) => Number(r.num) / Number(r.den);

/** Expoentes das grandezas: massa, quantidade de matéria, volume, tempo, contagem, razão, U, UI. */
type Dim = { massa: number; mol: number; vol: number; tempo: number; contagem: number; razao: number; u: number; ui: number };
const dimZero = (): Dim => ({ massa: 0, mol: 0, vol: 0, tempo: 0, contagem: 0, razao: 0, u: 0, ui: 0 });
const mesmaDim = (a: Dim, b: Dim) => (Object.keys(a) as Array<keyof Dim>).every((k) => a[k] === b[k]);

interface Parseada { dim: Dim; escala: Racional; qualificador: string | null }

const PREFIXOS: Record<string, number> = { "": 0, k: 3, d: -1, c: -2, m: -3, u: -6, "µ": -6, "μ": -6, n: -9, p: -12 };
const SUPER: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/** Lê um fator escalar de abertura: "10^6", "10⁶", "x10^6", "10*6", "milhões". */
function lerEscalar(token: string): { escala: Racional; resto: string } {
  let t = token;
  let escala = rac(1n);
  const m = /^(?:x|×)?10(?:\^|\*)?([+-]?\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)(?=\/|\.|$)/.exec(t);
  if (m) {
    const exp = Number([...m[1]].map((c) => SUPER[c] ?? c).join(""));
    escala = pot10(exp);
    t = t.slice(m[0].length);
  } else if (/^milh(?:ões|oes)/i.test(t)) {
    escala = pot10(6);
    t = t.replace(/^milh(?:ões|oes)/i, "");
  }
  return { escala, resto: t };
}

/** Uma "palavra" de unidade (sem barra): prefixo + base [+ expoente]. */
function lerAtomo(a: string): { dim: Dim; escala: Racional } | null {
  const dimV = (v: number): Dim => ({ ...dimZero(), vol: v });
  // Volume cúbico: mm³ = 1e-6 L ; cm³ = 1e-3 L (1 µL = 1 mm³).
  const cubico = /^(m|c)m(?:3|³|\^3)$/.exec(a);
  if (cubico) return { dim: dimV(1), escala: pot10(cubico[1] === "m" ? -6 : -3) };
  const prefixoRe = "(k|d|c|m|u|µ|μ|n|p)?";
  const tabela: Array<{ re: RegExp; dim: Partial<Dim>; fixo?: number; pct?: boolean; semPrefixo?: boolean }> = [
    { re: new RegExp(`^${prefixoRe}g$`), dim: { massa: 1 } },
    { re: new RegExp(`^${prefixoRe}mol$`), dim: { mol: 1 } },
    { re: new RegExp(`^${prefixoRe}[Ll]$`), dim: { vol: 1 } },
    { re: /^(?:s|seg|sec)$/, dim: { tempo: 1 }, semPrefixo: true },
    { re: /^min$/, dim: { tempo: 1 }, fixo: 60, semPrefixo: true },
    { re: new RegExp(`^${prefixoRe}U$`), dim: { u: 1 } },
    { re: new RegExp(`^${prefixoRe}(?:IU|UI)$`), dim: { ui: 1 } },
    { re: /^%$/, dim: { razao: 1 }, pct: true, semPrefixo: true },
    { re: /^(?:cel|células|celulas|cells)$/i, dim: { contagem: 1 }, semPrefixo: true },
  ];
  for (const t of tabela) {
    const m = t.re.exec(a);
    if (!m) continue;
    const dim = dimZero();
    for (const [k, v] of Object.entries(t.dim)) (dim as Record<string, number>)[k] = v as number;
    let escala = rac(1n);
    if (!t.semPrefixo) {
      const p = PREFIXOS[m[1] ?? ""];
      if (p === undefined) return null;
      escala = pot10(p);
    }
    if (t.fixo) escala = rac(BigInt(t.fixo));
    if (t.pct) escala = pot10(-2);
    return { dim, escala };
  }
  return null;
}

export function parseUnidade(entrada: string | null): Parseada | null {
  if (!entrada) return null;
  let t = entrada.normalize("NFC").trim().replace(/\s+/g, " ");
  let qualificador: string | null = null;
  const q = /\s*\b(FEU|DDU)\b$/i.exec(t);
  if (q) { qualificador = q[1].toUpperCase(); t = t.slice(0, q.index).trim(); }
  t = t.replace(/\s+/g, "").replace(/1,73/g, "1.73");
  if (t.includes("1.73")) return null; // superfície corporal: tratada só como alias textual (normUnit), nunca por dimensão
  const barra = t.indexOf("/");
  const numTxt = barra === -1 ? t : t.slice(0, barra);
  const denTxt = barra === -1 ? "" : t.slice(barra + 1);
  if (denTxt.includes("/")) return null;
  const dim = dimZero();
  let escala = rac(1n);
  let baseNoNumerador = false;
  const lado = (txt: string, sinal: 1 | -1): boolean => {
    const { escala: e0, resto } = lerEscalar(txt);
    escala = sinal === 1 ? mul(escala, e0) : div(escala, e0);
    if (resto === "") return true;
    for (const parte of resto.split(/[.·*]/).filter(Boolean)) {
      const at = lerAtomo(parte);
      if (!at) return false;
      if (sinal === 1) baseNoNumerador = true;
      for (const k of Object.keys(dim) as Array<keyof Dim>) dim[k] += sinal * at.dim[k];
      escala = sinal === 1 ? mul(escala, at.escala) : div(escala, at.escala);
    }
    return true;
  };
  if (numTxt !== "" && !lado(numTxt, 1)) return null;
  if (denTxt !== "" && !lado(denTxt, -1)) return null;
  // Numerador vazio ("/μL") ou só escalar ("10^6/μL") = contagem de células.
  if (!baseNoNumerador) dim.contagem += 1;
  return { dim, escala, qualificador };
}

export interface ResultadoClasse {
  classe: ClasseUnidade;
  /** fator exato bruto -> canônica (só quando comprovado) */
  fator: Racional | null;
  motivo: string;
}

const norm = (u: string) =>
  u.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/µ|μ/g, "u").toLowerCase().replace(/\s+/g, "");

export function classificarUnidade(bruta: string | null, canonica: string | null): ResultadoClasse {
  if (!bruta || !canonica) return { classe: "AMBIGUOUS", fator: null, motivo: "unidade ausente" };
  if (norm(bruta) === norm(canonica)) return { classe: "MATCH_EXISTING", fator: rac(1n), motivo: "mesma escrita normalizada" };
  const a = parseUnidade(bruta);
  const b = parseUnidade(canonica);
  if (!a || !b) {
    // Escrita só difere por vírgula/ponto decimal numa unidade que não analisamos dimensionalmente.
    if (norm(bruta).replace(/,/g, ".") === norm(canonica).replace(/,/g, "."))
      return { classe: "SAFE_ALIAS", fator: rac(1n), motivo: "difere apenas por vírgula decimal" };
    return { classe: "AMBIGUOUS", fator: null, motivo: "unidade fora da gramática dimensional conhecida" };
  }
  if (a.qualificador !== b.qualificador)
    return { classe: "CONTEXT_DEPENDENT", fator: null, motivo: "qualificador de ensaio diferente (FEU/DDU) exige propriedade do ensaio" };
  if (mesmaDim(a.dim, b.dim)) {
    const f = div(a.escala, b.escala);
    return ehUm(f)
      ? { classe: "SAFE_ALIAS", fator: f, motivo: "mesma grandeza e escala (análise dimensional exata)" }
      : { classe: "DIMENSIONAL_CONVERSION", fator: f, motivo: "mesma grandeza; fator exato por prefixos/escala" };
  }
  const massaVol = (d: Dim) => d.massa === 1 && d.vol === -1;
  const molVol = (d: Dim) => d.mol === 1 && d.vol === -1;
  const uVol = (d: Dim) => (d.u === 1 || d.ui === 1) && d.vol === -1;
  const contVol = (d: Dim) => d.contagem === 1 && d.vol === -1;
  const razao = (d: Dim) => d.razao === 1 && Object.entries(d).every(([k, v]) => k === "razao" || v === 0);
  if ((massaVol(a.dim) && molVol(b.dim)) || (molVol(a.dim) && massaVol(b.dim)))
    return { classe: "ANALYTE_SPECIFIC", fator: null, motivo: "massa/volume x mol/volume exige massa molar do analito" };
  if (uVol(a.dim) && uVol(b.dim))
    return { classe: "ANALYTE_SPECIFIC", fator: null, motivo: "U e UI não são intercambiáveis sem equivalência do analito" };
  if ((contVol(a.dim) && razao(b.dim)) || (razao(a.dim) && contVol(b.dim)))
    return { classe: "CONTEXT_DEPENDENT", fator: null, motivo: "contagem x percentual exige o total do mesmo exame (100 x abs / total)" };
  return { classe: "NON_CONVERTIBLE", fator: null, motivo: "grandezas fisicamente diferentes" };
}

/** Só estas classes podem ser aprovadas sem curadoria humana. */
export const aprovacaoAutomatica = (c: ClasseUnidade) => c === "SAFE_ALIAS" || c === "DIMENSIONAL_CONVERSION";
