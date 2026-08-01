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
  const plano: PlanoId = "premium";
  return {
    plano,
    isPremium: true,
    isBasico: false,
  };
}
