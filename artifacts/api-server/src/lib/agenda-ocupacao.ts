import { windowOccursOnDate } from "./agenda-window-recurrence";

/**
 * Ocupação de uma agenda num período: "vagas ocupadas / vagas previstas".
 *  - vagas previstas = soma, em cada data, das vagas inteiras de cada janela que ocorre naquela data
 *    (duração da janela dividida pela duração da vaga da agenda); data com exceção (feriado/bloqueio) não tem vaga;
 *  - vagas ocupadas = vagas cobertas por atendimentos do sistema DENTRO das janelas (quanto ocupa fora da janela
 *    não entra na conta, para nunca mostrar mais ocupado do que previsto).
 * Função pura: não lê banco nem Google e não grava nada.
 */
export const MAX_DIAS_OCUPACAO = 62;
const DAY_MS = 86_400_000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface JanelaOcupacao { weekday: number; startTime: string; endTime: string; repeatWeeks: number; anchorDate: string | null }
export interface AtendimentoOcupacao { date: string; time: string; durationMinutes: number | null }
export interface OcupacaoDaAgenda { capacidade: number; ocupadas: number }

const minutos = (hhmm: string): number | null => (HHMM.test(hhmm) ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);

export function datasDoPeriodo(de: string, ate: string): string[] {
  const ini = Date.parse(`${de}T12:00:00Z`);
  const fim = Date.parse(`${ate}T12:00:00Z`);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return [];
  const out: string[] = [];
  for (let t = ini; t <= fim; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function calcularOcupacao(entrada: {
  de: string; ate: string; slotMinutes: number;
  janelas: readonly JanelaOcupacao[]; datasBloqueadas: ReadonlySet<string>; atendimentos: readonly AtendimentoOcupacao[];
}): OcupacaoDaAgenda {
  const passo = entrada.slotMinutes > 0 ? entrada.slotMinutes : 30;
  let capacidade = 0;
  const janelasPorData = new Map<string, { ini: number; fim: number }[]>();
  for (const data of datasDoPeriodo(entrada.de, entrada.ate)) {
    if (entrada.datasBloqueadas.has(data)) continue;
    const doDia: { ini: number; fim: number }[] = [];
    for (const j of entrada.janelas) {
      if (!windowOccursOnDate(j, data)) continue;
      const ini = minutos(j.startTime); const fim = minutos(j.endTime);
      if (ini === null || fim === null || fim <= ini) continue;
      doDia.push({ ini, fim });
      capacidade += Math.floor((fim - ini) / passo);
    }
    if (doDia.length > 0) janelasPorData.set(data, doDia);
  }
  let ocupadas = 0;
  for (const a of entrada.atendimentos) {
    const janelasDoDia = janelasPorData.get(a.date);
    const ini = minutos(String(a.time).slice(0, 5));
    if (!janelasDoDia || ini === null) continue;
    const fim = ini + (a.durationMinutes && a.durationMinutes > 0 ? a.durationMinutes : passo);
    const dentro = janelasDoDia.reduce((soma, j) => soma + Math.max(0, Math.min(fim, j.fim) - Math.max(ini, j.ini)), 0);
    ocupadas += Math.ceil(dentro / passo);
  }
  return { capacidade, ocupadas: Math.min(ocupadas, capacidade) };
}
