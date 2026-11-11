import { and, eq, inArray } from "drizzle-orm";
import { agendaWindowsTable, db } from "@workspace/db";

/**
 * Horário padrão = horário em que o expediente COMEÇA, lido do cadastro da Agenda Configuração
 * (tabela agenda_windows). Não olha vaga livre: disponibilidade é conferida depois, na prévia.
 * Regra: para cada dia da semana, vale o início mais cedo; o horário padrão é o início que mais se repete
 * entre os dias com expediente (empate: o mais cedo).
 */
export type HorarioPadraoAgenda = {
  time: string;
  /** Quantos dias da semana começam nesse horário. */
  diasComEsseInicio: number;
  /** Quantos dias da semana têm expediente cadastrado. */
  diasComExpediente: number;
};

export function horarioPadraoDeJanelas(
  janelas: { weekday: number; startTime: string }[],
): HorarioPadraoAgenda | null {
  const inicioPorDia = new Map<number, string>();
  for (const janela of janelas) {
    if (!/^\d{2}:\d{2}$/.test(janela.startTime)) continue;
    const atual = inicioPorDia.get(janela.weekday);
    if (!atual || janela.startTime < atual) inicioPorDia.set(janela.weekday, janela.startTime);
  }
  if (inicioPorDia.size === 0) return null;
  const contagem = new Map<string, number>();
  for (const inicio of inicioPorDia.values()) contagem.set(inicio, (contagem.get(inicio) ?? 0) + 1);
  const [time, diasComEsseInicio] = [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { time, diasComEsseInicio, diasComExpediente: inicioPorDia.size };
}

export async function carregarHorarioPadraoDaAgenda(resourceId: number): Promise<HorarioPadraoAgenda | null> {
  const janelas = await db.select({ weekday: agendaWindowsTable.weekday, startTime: agendaWindowsTable.startTime })
    .from(agendaWindowsTable)
    .where(and(inArray(agendaWindowsTable.resourceId, [resourceId]), eq(agendaWindowsTable.active, true)));
  return horarioPadraoDeJanelas(janelas);
}
