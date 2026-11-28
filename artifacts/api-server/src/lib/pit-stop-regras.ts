/**
 * Regras PURAS (sem banco, sem relógio) da distribuição de datas do Pit Stop.
 * Regra do médico: margem de 4 dias para mais ou para menos da data nominal; intervalo mínimo entre aplicações
 * consecutivas = frequência cadastrada menos 4 dias (frequências de 1 a 4 dias: o mínimo é a própria frequência).
 * Nada aqui presume que toda data da janela é válida: a disponibilidade da equipe é conferida pelo servidor.
 */
const DIA_MS = 86_400_000;
export const TOLERANCIA_DIAS = 4;
export const REDUCAO_INTERVALO_MINIMO = 4;

export const somarDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
export const diferencaDias = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DIA_MS);
export const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
export const maiorData = (...datas: (string | null | undefined)[]) =>
  datas.filter((d): d is string => !!d).reduce((a, b) => (a >= b ? a : b));

export const intervaloMinimo = (frequenciaDias: number) =>
  frequenciaDias <= REDUCAO_INTERVALO_MINIMO ? Math.max(frequenciaDias, 0) : frequenciaDias - REDUCAO_INTERVALO_MINIMO;

/** Data nominal da sessão `numero`: base + (numero-1) × frequência. A base é fixa (início do plano), nunca a data escolhida. */
export const dataNominal = (base: string, numero: number, frequenciaDias: number) => somarDias(base, (numero - 1) * frequenciaDias);

export type PreferenciaVisita = {
  weekdays: number[]; times: { weekday: number; time: string }[]; priority?: { weekday: number; time: string }[];
};
/** 1 = mais desejada; undefined = sem preferência. A preferência ORDENA as vagas, nunca exclui nem libera nenhuma. */
export function rankPreferencia(pref: PreferenciaVisita | null | undefined, data: string, hora: string): number | undefined {
  if (!pref) return undefined;
  const wd = diaDaSemana(data);
  const prioridade = pref.priority ?? [];
  const exato = prioridade.findIndex((e) => e.weekday === wd && e.time === hora);
  if (exato >= 0) return exato + 1;
  if (pref.times.some((e) => e.weekday === wd && e.time === hora)) return prioridade.length + 1;
  if (pref.weekdays.includes(wd)) return prioridade.length + 2;
  return undefined;
}

export type Avaliacao = {
  dataNominal: string | null; diferencaDias: number | null; foraDaJanela: boolean;
  intervaloAnterior: number | null; intervaloMinimo: number; abaixoDoMinimo: boolean; naOrdem: boolean;
};
/** Compara a data escolhida com a nominal e com a aplicação anterior do MESMO procedimento. */
export function avaliarOcorrencia(p: { nominal: string; data: string | null; anteriorData: string | null; frequenciaDias: number }): Avaliacao {
  const minimo = intervaloMinimo(p.frequenciaDias);
  if (!p.data) {
    return { dataNominal: p.nominal, diferencaDias: null, foraDaJanela: false, intervaloAnterior: null, intervaloMinimo: minimo, abaixoDoMinimo: false, naOrdem: true };
  }
  const dif = diferencaDias(p.data, p.nominal);
  const intervalo = p.anteriorData ? diferencaDias(p.data, p.anteriorData) : null;
  return {
    dataNominal: p.nominal, diferencaDias: dif, foraDaJanela: Math.abs(dif) > TOLERANCIA_DIAS,
    intervaloAnterior: intervalo, intervaloMinimo: minimo,
    abaixoDoMinimo: intervalo !== null && intervalo < minimo, naOrdem: intervalo === null || intervalo >= 0,
  };
}

/** Janela de busca da sessão: nominal ±4 dias, sem passado e sem violar o intervalo mínimo da anterior. */
export function janelaDaSessao(nominal: string, hoje: string, minimoAposAnterior: string | null) {
  return { de: maiorData(somarDias(nominal, -TOLERANCIA_DIAS), hoje, minimoAposAnterior), ate: somarDias(nominal, TOLERANCIA_DIAS) };
}

export type VagaPontuavel = { date: string; time: string };
/** Melhor vaga: preferência do paciente primeiro, depois a mais próxima da data nominal, depois a mais cedo. */
export function ordenarVagas<T extends VagaPontuavel>(vagas: T[], nominal: string, pref: PreferenciaVisita | null | undefined): (T & { rank: number | null; diferenca: number })[] {
  return vagas.map((v) => ({ ...v, rank: rankPreferencia(pref, v.date, v.time) ?? null, diferenca: diferencaDias(v.date, nominal) }))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || Math.abs(a.diferenca) - Math.abs(b.diferenca) ||
      a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
