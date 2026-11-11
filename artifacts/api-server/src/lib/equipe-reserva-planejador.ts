/**
 * Planejador puro da reserva por equipe (sem banco, sem relogio, sem rede).
 *
 * Uma ocorrencia de procedimento exige de 1 a 3 participantes. Cada participante
 * pertence a uma categoria profissional (cadastro real, sem lista fixa) e e atendido
 * por uma agenda (recurso) dessa categoria. Esta funcao decide qual agenda atende
 * cada participante num horario, sem repetir agenda nem profissional.
 */
export type Candidato = {
  resourceId: number; professionalId: number | null; locationId: number | null; sortOrder: number;
  /** Categoria GRAVADA na agenda que atende; numa necessidade com alternativas (médico OU biomédico) é a que foi escolhida. */
  categoryId?: number;
};
export type Necessidade = { ordem: number; categoryId: number; candidatos: Candidato[] };
export type SlotLido = { time: string; state: string };

export const MAX_PARTICIPANTES = 3;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const horario = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** Horarios de inicio em que a agenda tem TODA a duracao aberta, em passos consecutivos da grade. */
export function iniciosComDuracaoAberta(slots: SlotLido[], slotMinutes: number, duracaoMinutos: number): Set<string> {
  if (!Number.isSafeInteger(slotMinutes) || slotMinutes <= 0) throw new Error("Grade da agenda invalida");
  if (!(duracaoMinutos > 0)) throw new Error("Duracao do procedimento invalida");
  const abertos = new Set(slots.filter((s) => HHMM.test(s.time) && s.state === "aberto").map((s) => minutos(s.time)));
  const passos = Math.ceil(duracaoMinutos / slotMinutes);
  const inicios = new Set<string>();
  for (const inicio of abertos) {
    let completo = true;
    for (let i = 1; i < passos; i++) if (!abertos.has(inicio + i * slotMinutes)) { completo = false; break; }
    if (completo) inicios.add(horario(inicio));
  }
  return inicios;
}

/**
 * Escolhe uma agenda para cada necessidade no horario dado. Retorna null se nao houver
 * combinacao em que as agendas estejam livres e nenhum recurso ou profissional se repita.
 */
export function escolherAtribuicao(
  necessidades: Necessidade[], inicios: Map<number, Set<string>>, time: string,
): (Candidato & { ordem: number; categoryId: number })[] | null {
  if (necessidades.length < 1 || necessidades.length > MAX_PARTICIPANTES) return null;
  const resolvido: (Candidato & { ordem: number; categoryId: number })[] = [];
  const recursos = new Set<number>();
  const profissionais = new Set<number>();
  const visitar = (indice: number): boolean => {
    if (indice === necessidades.length) return true;
    const need = necessidades[indice];
    const ordenados = [...need.candidatos].sort((a, b) => a.sortOrder - b.sortOrder || a.resourceId - b.resourceId);
    for (const c of ordenados) {
      if (recursos.has(c.resourceId)) continue;
      if (c.professionalId != null && profissionais.has(c.professionalId)) continue;
      if (!inicios.get(c.resourceId)?.has(time)) continue;
      recursos.add(c.resourceId);
      if (c.professionalId != null) profissionais.add(c.professionalId);
      resolvido.push({ ...c, ordem: need.ordem, categoryId: c.categoryId ?? need.categoryId });
      if (visitar(indice + 1)) return true;
      resolvido.pop();
      recursos.delete(c.resourceId);
      if (c.professionalId != null) profissionais.delete(c.professionalId);
    }
    return false;
  };
  return visitar(0) ? resolvido.slice().sort((a, b) => a.ordem - b.ordem) : null;
}

/** Todos os horarios (ordenados) em que a equipe inteira pode ser reservada no dia. */
export function horariosDaEquipe(necessidades: Necessidade[], inicios: Map<number, Set<string>>) {
  const todos = new Set<string>();
  for (const n of necessidades) for (const c of n.candidatos) for (const t of inicios.get(c.resourceId) ?? []) todos.add(t);
  return [...todos].sort().flatMap((time) => {
    const atribuicao = escolherAtribuicao(necessidades, inicios, time);
    return atribuicao ? [{ time, atribuicao }] : [];
  });
}
