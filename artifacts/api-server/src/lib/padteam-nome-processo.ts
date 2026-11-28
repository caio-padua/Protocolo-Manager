/**
 * O nome antigo é também a chave única do processo semeado.
 * Só a apresentação é alterada, para não duplicar a responsabilidade.
 */
export function nomeProcessoExibido(processo: string): string {
  return processo === "Gerar RAS Assinado" ? "Gerar RASP Assinado" : processo;
}
