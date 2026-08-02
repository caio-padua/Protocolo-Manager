// Verificação de plano da clínica — MVP: sempre retorna "premium".
// Estrutura existe para ativar monetização por empresa sem mudar nenhum componente.
// Quando ativo: consultar /api/empresa/minha → campo planId.

export type PlanoId = "basico" | "premium";

export interface UsePlanoResult {
  plano: PlanoId;
  isPremium: boolean;
  isBasico: boolean;
}

export function usePlano(): UsePlanoResult {
  // MVP: desbloqueado para todos. Para fechar, trocar para "basico".
  //
  // O `as PlanoId` NAO e enfeite: sem ele o TypeScript estreita a constante
  // para o literal "premium", e a comparacao com "basico" logo abaixo vira
  // erro TS2367 ("os tipos nao tem sobreposicao"). Mantendo o tipo da uniao,
  // as duas comparacoes continuam validas e o dia em que este valor vier da
  // API nao exige tocar em componente nenhum — que e o motivo deste arquivo.
  const plano = "premium" as PlanoId;
  return {
    plano,
    isPremium: plano === "premium",
    isBasico: plano === "basico",
  };
}
