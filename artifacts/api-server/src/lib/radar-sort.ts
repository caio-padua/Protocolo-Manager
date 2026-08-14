/**
 * radar-sort.ts
 *
 * Lógica de ordenação do Radar Clínico — extraída da rota para ser
 * testável de forma independente.
 *
 * Regra de urgência:
 *   1. faltou DESC  — quem faltou aparece antes
 *   2. silêncio DESC — maior silêncio primeiro; null = nunca contatado → MAX
 *   3. nome ASC     — desempate alfabético (pt-BR, sem sensibilidade a acento)
 */

export interface RadarAlerta {
  faltaHaDias: number | null;
  silencioHaDias: number | null;
}

export interface RadarPaciente {
  nome: string;
  alertas: RadarAlerta;
}

/**
 * Compara dois pacientes seguindo a regra de urgência.
 * Retorna negativo, zero ou positivo (compatível com Array.sort).
 */
export function compareUrgencia(a: RadarPaciente, b: RadarPaciente): number {
  // 1) faltou DESC
  const faltaA = a.alertas.faltaHaDias != null ? 1 : 0;
  const faltaB = b.alertas.faltaHaDias != null ? 1 : 0;
  if (faltaB !== faltaA) return faltaB - faltaA;

  // 2) silêncio DESC (null → máximo)
  const silA = a.alertas.silencioHaDias ?? Number.MAX_SAFE_INTEGER;
  const silB = b.alertas.silencioHaDias ?? Number.MAX_SAFE_INTEGER;
  if (silB !== silA) return silB - silA;

  // 3) nome ASC
  return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
}

/**
 * Ordena um array de pacientes in-place e o retorna.
 */
export function sortByUrgencia<T extends RadarPaciente>(rows: T[]): T[] {
  return rows.sort(compareUrgencia);
}
