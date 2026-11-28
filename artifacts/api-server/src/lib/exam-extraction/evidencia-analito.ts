/**
 * Evidência de identidade do analito (função pura, sem banco, sem IA, sem rede).
 *
 * Família tratada nesta fatia: vitamina D. Formas quimicamente distintas e NUNCA fundíveis:
 *   - 25-OH  (calcidiol/calcifediol)  — dimensão típica ng/mL ou nmol/L
 *   - 1,25-(OH)2 (calcitriol)         — dimensão típica pg/mL ou pmol/L
 * Regras: o token "vitamina D" sozinho nunca é identidade; unidade é dica, jamais prova;
 * conversão de unidade só com fator validado já cadastrado; o código da forma é descoberto
 * pelo catálogo (nome/apelidos), sem código fixo no programa.
 */
import { normalizeAnalyteName } from "./persist";

export type FormaVitD = "25oh" | "1,25oh2";
export type VereditoEvidencia = "confirmado" | "candidato" | "pendente" | "fora_da_familia";

export interface ContextoAnalito {
  nome: string;
  unidade?: string | null;
  faixa?: string | null;
  metodo?: string | null;
  amostra?: string | null;
  loinc?: string | null;
}
export interface EntradaCatalogo { code: string; displayName: string; keys: Set<string>; loinc?: string | null }
export interface Evidencia { tipo: "nome" | "unidade" | "metodo" | "amostra" | "loinc" | "catalogo" | "regra"; detalhe: string }
export interface AvaliacaoEvidencia {
  veredito: VereditoEvidencia;
  forma: FormaVitD | null;
  /** código do catálogo da forma identificada (nunca da outra forma); null se não houver ou se pendente */
  code: string | null;
  evidencias: Evidencia[];
  /** códigos com os quais este analito NUNCA pode ser fundido */
  naoFundirCom: string[];
  /** a unidade, sozinha, jamais autoriza conversão ou fusão */
  unidadeBastaParaFundir: false;
}

const re125 = /\b1 25\b|\bcalcitriol\b|\bdihidroxi\w*\b|\bdi hidroxi\w*\b/;
const re25 = /\b25 ?(oh|hidroxi\w*|hydroxy\w*)\b|\bcalcidiol\b|\bcalcifediol\b/;
const reGenerica = /\bvit(amina)? ?d\d?\b|\bcolecalciferol\b/;

function dimensao(unidade?: string | null): "massa_25" | "massa_125" | "molar_25" | "molar_125" | "desconhecida" {
  const u = (unidade ?? "").toLowerCase().replace(/\s+/g, "").replace("µ", "u").replace("μ", "u");
  if (u === "ng/ml" || u === "ug/l") return "massa_25";
  if (u === "pg/ml" || u === "ng/l") return "massa_125";
  if (u === "nmol/l") return "molar_25";
  if (u === "pmol/l") return "molar_125";
  return "desconhecida";
}
const dicaUnidade = (u?: string | null): FormaVitD | null => {
  const d = dimensao(u);
  return d.endsWith("_25") ? "25oh" : d.endsWith("_125") ? "1,25oh2" : null;
};

export function detectarForma(texto: string): { forma: FormaVitD | null; conflito: boolean; vitD: boolean } {
  const k = normalizeAnalyteName(texto);
  const f125 = re125.test(k);
  const f25 = re25.test(k) && !f125;
  const soCalcidiol = /\bcalcidiol\b|\bcalcifediol\b/.test(k);
  const vitD = reGenerica.test(k) || f125 || re25.test(k);
  if (f125 && soCalcidiol) return { forma: null, conflito: true, vitD };
  if (f125) return { forma: "1,25oh2", conflito: false, vitD };
  if (f25) return { forma: "25oh", conflito: false, vitD };
  return { forma: null, conflito: false, vitD };
}

/** Código do catálogo de cada forma, descoberto pelo próprio catálogo (nome + apelidos). */
export function codigosPorForma(catalogo: EntradaCatalogo[]): Partial<Record<FormaVitD, EntradaCatalogo>> {
  const out: Partial<Record<FormaVitD, EntradaCatalogo>> = {};
  for (const e of catalogo) {
    const formas = new Set<FormaVitD>();
    for (const k of [e.displayName, ...e.keys]) {
      const d = detectarForma(k);
      if (d.forma) formas.add(d.forma);
    }
    if (formas.size === 1) {
      const f = [...formas][0];
      if (!out[f]) out[f] = e;
    }
  }
  return out;
}

export function avaliarEvidenciaAnalito(ctx: ContextoAnalito, catalogo: EntradaCatalogo[]): AvaliacaoEvidencia {
  const ev: Evidencia[] = [];
  const base = { naoFundirCom: [] as string[], unidadeBastaParaFundir: false as const };
  const nomeTxt = [ctx.nome, ctx.metodo].filter(Boolean).join(" ");
  const det = detectarForma(nomeTxt);
  if (!det.vitD) return { veredito: "fora_da_familia", forma: null, code: null, evidencias: ev, ...base };

  const formas = codigosPorForma(catalogo);
  const naoFundir = Object.values(formas).map((e) => e!.code);
  const hint = dicaUnidade(ctx.unidade);
  if (ctx.unidade) ev.push({ tipo: "unidade", detalhe: hint ? `${ctx.unidade} é típica de ${hint} (dica, não prova)` : `${ctx.unidade} sem dica` });
  if (ctx.metodo) ev.push({ tipo: "metodo", detalhe: "método informado" });
  if (ctx.amostra) ev.push({ tipo: "amostra", detalhe: "amostra informada" });

  if (det.conflito) {
    ev.push({ tipo: "regra", detalhe: "nome mistura 1,25 com calcidiol: conflito" });
    return { veredito: "pendente", forma: null, code: null, evidencias: ev, naoFundirCom: naoFundir, unidadeBastaParaFundir: false };
  }
  if (!det.forma) {
    ev.push({ tipo: "regra", detalhe: "'vitamina D' sem qualificador não identifica a forma" });
    return { veredito: "pendente", forma: null, code: null, evidencias: ev, naoFundirCom: naoFundir, unidadeBastaParaFundir: false };
  }

  const alvo = formas[det.forma] ?? null;
  const outra = formas[det.forma === "25oh" ? "1,25oh2" : "25oh"] ?? null;
  const naoFundirCom = outra ? [outra.code] : [];
  ev.push({ tipo: "nome", detalhe: `nome indica ${det.forma}` });

  if (hint && hint !== det.forma) {
    ev.push({ tipo: "regra", detalhe: `unidade diverge do nome (${hint} x ${det.forma}): exige conferência` });
    return { veredito: "pendente", forma: det.forma, code: null, evidencias: ev, naoFundirCom, unidadeBastaParaFundir: false };
  }
  if (ctx.loinc && alvo?.loinc) {
    const igual = ctx.loinc.trim() === alvo.loinc.trim();
    ev.push({ tipo: "loinc", detalhe: igual ? "LOINC coincide com o catálogo" : "LOINC diverge do catálogo" });
    if (!igual) return { veredito: "pendente", forma: det.forma, code: null, evidencias: ev, naoFundirCom, unidadeBastaParaFundir: false };
  }
  const chave = normalizeAnalyteName(ctx.nome);
  const exato = !!alvo && (alvo.keys.has(chave) || normalizeAnalyteName(alvo.displayName) === chave);
  if (exato && alvo) {
    ev.push({ tipo: "catalogo", detalhe: "nome idêntico ao nome/apelido homologado" });
    return { veredito: "confirmado", forma: det.forma, code: alvo.code, evidencias: ev, naoFundirCom, unidadeBastaParaFundir: false };
  }
  ev.push({ tipo: "regra", detalhe: "grafia nova da forma: candidato, nunca autoconfirmado sem método/homologação" });
  return { veredito: "candidato", forma: det.forma, code: alvo?.code ?? null, evidencias: ev, naoFundirCom, unidadeBastaParaFundir: false };
}

/** Conversão só com fator já validado (linha ativa em exam_analyte_units); nome/unidade sozinhos nunca bastam. */
export function podeConverterUnidade(
  code: string,
  de: string,
  para: string,
  fatoresValidados: Array<{ analyteCode: string; unit: string; factorToCanonical: number; isCanonical: boolean; active: boolean }>,
): { permitido: boolean; fator: number | null; motivo: string } {
  const f = (u: string) => fatoresValidados.find((x) => x.analyteCode === code && x.active && x.unit.toLowerCase() === u.toLowerCase());
  const a = f(de), b = f(para);
  if (!a || !b) return { permitido: false, fator: null, motivo: "sem fator validado cadastrado para o par de unidades" };
  if (!b.isCanonical && !a.isCanonical) return { permitido: false, fator: null, motivo: "nenhuma das unidades é a canônica" };
  return { permitido: true, fator: a.factorToCanonical / b.factorToCanonical, motivo: "fator validado do cadastro" };
}

/** Somente campos técnicos do analito seguem para a IA: nada de paciente, CPF ou valor. */
export function contextoTecnicoParaIA(entrada: Record<string, unknown>): ContextoAnalito {
  const txt = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const nome = txt(entrada.nome);
  if (!nome) throw new Error("nome do analito obrigatório");
  if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(nome) || /@/.test(nome)) throw new Error("nome contém dado pessoal");
  return { nome, unidade: txt(entrada.unidade, 24), faixa: txt(entrada.faixa, 60), metodo: txt(entrada.metodo), amostra: txt(entrada.amostra, 40), loinc: txt(entrada.loinc, 16) };
}

export interface PropostaIA { code: string | null; forma: FormaVitD | null; fontes: string[]; confianca: number }

/** A IA propõe; o motor decide. Nunca sobrepõe forma já determinada nem aproxima dois códigos distintos. */
export function validarPropostaIA(p: PropostaIA, det: AvaliacaoEvidencia): { aceita: boolean; motivos: string[] } {
  const m: string[] = [];
  if (!p.fontes.length) m.push("proposta sem fonte citada");
  if (!(p.confianca >= 0 && p.confianca <= 1)) m.push("confiança inválida");
  if (det.veredito === "pendente" && !det.forma) m.push("evidência determinística pendente: exige médico");
  if (det.forma && p.forma && p.forma !== det.forma) m.push("IA contradiz a forma determinada: red-line");
  if (p.code && det.naoFundirCom.includes(p.code)) m.push("código proibido para esta forma: red-line");
  if (det.veredito === "pendente" && det.forma) m.push("evidências divergentes: exige médico");
  return { aceita: m.length === 0, motivos: m };
}
