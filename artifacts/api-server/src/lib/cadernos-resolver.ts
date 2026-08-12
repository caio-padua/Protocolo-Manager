/**
 * Lógica canônica de seleção de cadernos jurídicos.
 * Fonte única de verdade usada por:
 *   - GET  /api/cadernos-juridicos/resolver/:protocolId
 *   - POST /api/ras-fap/entregar-protocolo   (despacho automático)
 *
 * Mantendo aqui, qualquer mudança nas regras de seleção propaga para
 * ambos os fluxos automaticamente, evitando drift entre as duas listas.
 */

export interface SubstanciaParaResolver {
  /** Nome da substância (usado para detecção por regex). */
  nome: string;
  /** Tipo de procedimento: "iv" | "im" | "implant" | "sc" | etc. */
  procedureType?: string | null;
  /** Descrição textual da via (ex.: "Endovenosa", "Intramuscular"). */
  via?: string | null;
  /** Categoria: "formula" | "manipulado" | etc. */
  categoryType?: string | null;
}

export interface ResolucaoCadernos {
  codigos: Set<string>;
  hasIV: boolean;
  hasIM: boolean;
  hasImplant: boolean;
  hasSC: boolean;
  isGLP1: boolean;
  isPeptide: boolean;
  isLipo: boolean;
  isFormula: boolean;
}

const _n = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Dado um array de substâncias, retorna o conjunto canônico de códigos de
 * cadernos jurídicos que devem ser emitidos, mais os flags de detecção.
 */
export function resolverCodigosCadernos(
  substancias: SubstanciaParaResolver[],
): ResolucaoCadernos {
  const allNames = substancias.map((s) => _n(s.nome)).join(" ");
  const allTypes = substancias.map((s) => (_n(s.procedureType ?? "")));

  const hasIV      = allTypes.includes("iv")      || substancias.some((s) => _n(s.via ?? "").includes("endovenosa"));
  const hasIM      = allTypes.includes("im")      || substancias.some((s) => _n(s.via ?? "").includes("intramuscular"));
  const hasImplant = allTypes.includes("implant") || substancias.some((s) => _n(s.via ?? "").includes("implant") || _n(s.via ?? "").includes("pellet"));
  const hasSC      = allTypes.includes("sc")      || substancias.some((s) => _n(s.via ?? "").includes("subcutanea"));

  const isGLP1    = /semaglutida|tirzepatida|liraglutida|glp.?1|incretina|ozempic|wegovy|mounjaro/.test(allNames);
  const isPeptide = /bpc.?157|tb.?500|ipamorelin|cjc.?1295|sermorelin|peptid|ghk|fragment|ghrp|mk.?677|ibutamoren/.test(allNames);
  const isLipo    = /fosfatidilcolina|pcdc|deoxicol|lipolit|melting/.test(allNames);
  const isFormula = substancias.some(
    (s) =>
      _n(s.categoryType ?? "").includes("formula") ||
      _n(s.categoryType ?? "").includes("manipulado") ||
      hasSC,
  );

  // Base obrigatória (igual para todos os protocolos)
  const codigos = new Set<string>([
    "CGLO", "TCLE", "CTCLE_G",
    "CLGPD", "CPRIV", "CDIG",
    "CFIN", "CGAR", "CIMG",
    "RAS-JUR",
  ]);

  // Condicionais por tipo de via / substância
  if (hasIV)                         codigos.add("CEND");
  if (hasIM)                         codigos.add("CIMU");
  if (hasImplant)                    codigos.add("CIMP");
  if (isFormula)                     codigos.add("CFOR");
  if (isGLP1)                        codigos.add("CINC");
  if (isPeptide)                     codigos.add("CPEP");
  if (isLipo)                        codigos.add("CLIP");
  if (isGLP1 || isPeptide || isLipo) codigos.add("CSUB");

  return { codigos, hasIV, hasIM, hasImplant, hasSC, isGLP1, isPeptide, isLipo, isFormula };
}
