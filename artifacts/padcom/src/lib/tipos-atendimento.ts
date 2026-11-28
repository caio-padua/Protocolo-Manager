/**
 * Tipos de atendimento do profissional: todo profissional tem os mesmos QUATRO interruptores.
 * O banco guarda uma lista de texto com valores antigos misturados ("clinic", "home", "homecare"...).
 * A leitura traduz o valor antigo para o valor oficial; valor desconhecido NUNCA é apagado
 * (Regra de Ouro): fica na lista e é regravado como veio.
 */
export const TIPOS_ATENDIMENTO = [
  { value: "presencial", label: "Sede" },
  { value: "externo", label: "Local externo" },
  { value: "online", label: "Online" },
  { value: "home_care", label: "Home Care" },
] as const;

export type TipoAtendimento = (typeof TIPOS_ATENDIMENTO)[number]["value"];

const SINONIMOS: Record<string, TipoAtendimento> = {
  presencial: "presencial",
  sede: "presencial",
  na_sede: "presencial",
  local: "presencial",
  clinic: "presencial",
  externo: "externo",
  local_externo: "externo",
  outro_local: "externo",
  home_care: "home_care",
  homecare: "home_care",
  home: "home_care",
  online: "online",
};

const chaveDoValor = (valor: string) => valor.trim().toLowerCase().replace(/[\s-]+/g, "_");

export interface TiposNormalizados {
  /** Valores oficiais, na ordem Sede, Local externo, Online, Home Care. */
  oficiais: TipoAtendimento[];
  /** Valores que o sistema não conhece: preservados como estão. */
  desconhecidos: string[];
}

export function normalizarTiposAtendimento(valores: readonly string[] | null | undefined): TiposNormalizados {
  const achados = new Set<TipoAtendimento>();
  const desconhecidos: string[] = [];
  for (const valor of valores ?? []) {
    const oficial = SINONIMOS[chaveDoValor(valor)];
    if (oficial) achados.add(oficial);
    else if (!desconhecidos.includes(valor)) desconhecidos.push(valor);
  }
  return {
    oficiais: TIPOS_ATENDIMENTO.map((t) => t.value).filter((v) => achados.has(v)),
    desconhecidos,
  };
}

/** Lista que o formulário guarda e envia: oficiais + desconhecidos preservados. */
export function tiposParaFormulario(valores: readonly string[] | null | undefined, padrao: TipoAtendimento = "presencial"): string[] {
  const { oficiais, desconhecidos } = normalizarTiposAtendimento(valores);
  const lista = [...oficiais, ...desconhecidos];
  return lista.length ? lista : [padrao];
}

/**
 * Liga ou desliga um tipo. A lista volta na ordem Sede, Local externo, Online, Home Care (valores desconhecidos
 * preservados no fim) e nunca fica vazia: o último tipo ligado não desliga.
 */
export function alternarTipoDeAtendimento(atuais: readonly string[], valor: string): string[] {
  const { oficiais, desconhecidos } = normalizarTiposAtendimento(atuais);
  const ligado = oficiais.includes(valor as TipoAtendimento);
  const proximos = TIPOS_ATENDIMENTO.map((t) => t.value).filter((v) => (v === valor ? !ligado : oficiais.includes(v)));
  const lista = [...proximos, ...desconhecidos];
  return lista.length ? lista : [...atuais];
}
