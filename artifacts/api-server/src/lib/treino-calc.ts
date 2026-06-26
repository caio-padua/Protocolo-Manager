// ============================================================================
// Motor de calculo do Orgao TREINO — ONDA C do Master Loop Paxter.
// Funcoes PURAS (sem efeito colateral): volume de series, tonelagem (volume-load),
// duracao estimada por sessao e gasto calorico estimado via MET.
// Espelha a arquitetura do dieta-calc.ts.
// ============================================================================

// Equivalente metabolico (MET) padrao por grupo muscular, quando o exercicio do
// catalogo nao trouxer um MET proprio. Valores conservadores de musculacao.
export const MET_PADRAO: Record<string, number> = {
  peito: 5.0,
  costas: 5.0,
  perna: 6.0,
  gluteo: 6.0,
  ombro: 4.5,
  biceps: 4.0,
  triceps: 4.0,
  core: 4.0,
  panturrilha: 4.0,
  cardio: 8.0,
};
export const MET_GENERICO = 5.0; // musculacao geral

// Tempo medio de execucao de uma serie (segundos), usado para estimar duracao.
const SEG_POR_SERIE_EXEC = 40;

export interface ItemVolumeInput {
  series?: number | null;
  repeticoesNum?: number | null;
  cargaKg?: number | null;
  descansoSeg?: number | null;
}

export interface ItemVolumeResult {
  tonelagemKg: number | null; // series x reps x carga (volume-load)
  duracaoMin: number; // tempo estimado do item (execucao + descanso)
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Tonelagem (volume-load) de um item = series x repeticoes x carga (kg).
 * Duracao estimada do item = series x (tempo de execucao + descanso), em minutos.
 * Tonelagem fica null quando faltam series/reps/carga (item so de mobilidade, p.ex.).
 */
export function calcularItemVolume(item: ItemVolumeInput): ItemVolumeResult {
  const series = typeof item.series === "number" && item.series > 0 ? item.series : 0;
  const reps = typeof item.repeticoesNum === "number" && item.repeticoesNum > 0 ? item.repeticoesNum : 0;
  const carga = typeof item.cargaKg === "number" && item.cargaKg > 0 ? item.cargaKg : 0;

  const tonelagemKg = series && reps && carga ? round1(series * reps * carga) : null;

  const descanso = typeof item.descansoSeg === "number" && item.descansoSeg > 0 ? item.descansoSeg : 0;
  const segsItem = series ? series * (SEG_POR_SERIE_EXEC + descanso) : 0;
  const duracaoMin = round1(segsItem / 60);

  return { tonelagemKg, duracaoMin };
}

export interface GastoCaloricoInput {
  met?: number | null;
  pesoKg?: number | null;
  duracaoMin?: number | null;
}

/**
 * Gasto calorico estimado pela formula classica do MET:
 *   kcal = MET x peso(kg) x tempo(horas)
 * Retorna null quando faltam peso ou tempo.
 */
export function calcularGastoCalorico(input: GastoCaloricoInput): number | null {
  const met = typeof input.met === "number" && input.met > 0 ? input.met : MET_GENERICO;
  const peso = typeof input.pesoKg === "number" && input.pesoKg > 0 ? input.pesoKg : null;
  const dur = typeof input.duracaoMin === "number" && input.duracaoMin > 0 ? input.duracaoMin : null;
  if (peso === null || dur === null) return null;
  return Math.round(met * peso * (dur / 60));
}

/** Resolve o MET de um exercicio: o proprio do catalogo, ou o padrao do grupo. */
export function metDoExercicio(met?: number | null, grupoMuscular?: string | null): number {
  if (typeof met === "number" && met > 0) return met;
  const g = (grupoMuscular ?? "").toLowerCase();
  return MET_PADRAO[g] ?? MET_GENERICO;
}

export interface ItemResumoInput extends ItemVolumeInput {
  met?: number | null;
  grupoMuscular?: string | null;
}

export interface ResumoTreinoResult {
  volumeTotalSeries: number; // soma das series de todos os itens
  tonelagemKg: number; // soma das tonelagens dos itens
  duracaoEstimadaMin: number; // soma das duracoes dos itens
  gastoCaloricoKcal: number | null; // estimativa via MET ponderado pelo tempo
}

/**
 * Resumo de uma ficha de treino (agrega os itens). O gasto calorico usa o MET de
 * cada item ponderado pelo tempo (cada item gasta met x peso x tempo do item).
 */
export function calcularResumoTreino(itens: ItemResumoInput[], pesoKg?: number | null): ResumoTreinoResult {
  let volumeTotalSeries = 0;
  let tonelagemKg = 0;
  let duracaoEstimadaMin = 0;
  let kcalTotal = 0;
  let temPesoEDuracao = false;

  for (const it of itens) {
    const vol = calcularItemVolume(it);
    if (typeof it.series === "number" && it.series > 0) volumeTotalSeries += it.series;
    if (vol.tonelagemKg) tonelagemKg += vol.tonelagemKg;
    duracaoEstimadaMin += vol.duracaoMin;

    const met = metDoExercicio(it.met, it.grupoMuscular);
    const kcalItem = calcularGastoCalorico({ met, pesoKg, duracaoMin: vol.duracaoMin });
    if (kcalItem !== null) {
      kcalTotal += kcalItem;
      temPesoEDuracao = true;
    }
  }

  return {
    volumeTotalSeries,
    tonelagemKg: round1(tonelagemKg),
    duracaoEstimadaMin: round1(duracaoEstimadaMin),
    gastoCaloricoKcal: temPesoEDuracao ? Math.round(kcalTotal) : null,
  };
}
