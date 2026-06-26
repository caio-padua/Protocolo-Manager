// ============================================================================
// Motor de calculo do Orgao DIETA — ONDA A do Master Loop Paxter.
// Funcoes PURAS (sem efeito colateral): TMB, TDEE, calorias-alvo, macros por
// porcao e validacao da janela de jejum intermitente.
// ============================================================================

// Fator de atividade (multiplica a TMB para virar TDEE).
export const FATOR_ATIVIDADE: Record<string, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  atleta: 1.9,
};

// Fator de ajuste pelo objetivo (multiplica o TDEE para virar a meta).
export const FATOR_OBJETIVO: Record<string, number> = {
  emagrecimento: 0.8,
  longevidade: 0.95,
  manutencao: 1.0,
  hipertrofia: 1.15,
  superavit: 1.15,
};

export interface TdeeInput {
  pesoKg?: number | null;
  alturaCm?: number | null;
  idade?: number | null;
  sexo?: string | null; // "M" | "F"
  nivelAtividade?: string | null;
  objetivo?: string | null;
  fatorAjusteObjetivo?: number | null; // sobrepoe o mapa de objetivo, se vier
}

export interface TdeeResult {
  tmb: number | null;
  tdee: number | null;
  caloriasAlvo: number | null;
}

/**
 * TMB pela equacao de Mifflin-St Jeor (a mais aceita clinicamente):
 *   Homem:  10*peso + 6.25*altura - 5*idade + 5
 *   Mulher: 10*peso + 6.25*altura - 5*idade - 161
 * Retorna null quando faltam dados antropometricos minimos.
 */
export function calcularTdee(input: TdeeInput): TdeeResult {
  const { pesoKg, alturaCm, idade, sexo } = input;
  if (!pesoKg || !alturaCm || !idade) {
    return { tmb: null, tdee: null, caloriasAlvo: null };
  }
  const base = 10 * pesoKg + 6.25 * alturaCm - 5 * idade;
  const sexoNorm = (sexo ?? "M").toUpperCase().startsWith("F") ? "F" : "M";
  const tmb = sexoNorm === "F" ? base - 161 : base + 5;

  const fatorAtiv = FATOR_ATIVIDADE[input.nivelAtividade ?? "moderado"] ?? 1.55;
  const tdee = tmb * fatorAtiv;

  const fatorObj =
    typeof input.fatorAjusteObjetivo === "number" && input.fatorAjusteObjetivo > 0
      ? input.fatorAjusteObjetivo
      : FATOR_OBJETIVO[input.objetivo ?? "manutencao"] ?? 1.0;
  const caloriasAlvo = tdee * fatorObj;

  return {
    tmb: Math.round(tmb),
    tdee: Math.round(tdee),
    caloriasAlvo: Math.round(caloriasAlvo),
  };
}

export interface MacroPor100g {
  kcal100g?: number | null;
  proteinaG100g?: number | null;
  carboidratoG100g?: number | null;
  gorduraG100g?: number | null;
}

export interface MacroPorcao {
  kcal: number | null;
  proteinaG: number | null;
  carboidratoG: number | null;
  gorduraG: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Macros de uma porcao = valor por 100 g x (quantidade / 100). */
export function calcularMacrosPorcao(alimento: MacroPor100g, quantidadeG?: number | null): MacroPorcao {
  if (!quantidadeG || quantidadeG <= 0) {
    return { kcal: null, proteinaG: null, carboidratoG: null, gorduraG: null };
  }
  const f = quantidadeG / 100;
  const num = (v?: number | null) => (typeof v === "number" ? round1(v * f) : null);
  return {
    kcal: num(alimento.kcal100g),
    proteinaG: num(alimento.proteinaG100g),
    carboidratoG: num(alimento.carboidratoG100g),
    gorduraG: num(alimento.gorduraG100g),
  };
}

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

/**
 * Verifica se um horario "HH:MM" cai DENTRO da janela de alimentacao.
 * Suporta janela que cruza a meia-noite (ex.: 20:00 -> 04:00).
 * Se a janela estiver incompleta/invalida, considera permitido (sem bloqueio).
 */
export function dentroDaJanela(horario: string | null | undefined, inicio: string | null | undefined, fim: string | null | undefined): boolean {
  if (!horario || !inicio || !fim) return true;
  const h = toMinutes(horario);
  const i = toMinutes(inicio);
  const f = toMinutes(fim);
  if (h === null || i === null || f === null) return true;
  if (i === f) return true; // janela de 24h
  if (i < f) return h >= i && h <= f; // janela no mesmo dia
  return h >= i || h <= f; // janela cruzando a meia-noite
}
