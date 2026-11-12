import { MAX_DIAS_BUSCA, buscarHorariosDaEquipe, type Participante } from "./equipe-reserva.js";
import { somarDias, diferencaDias } from "./pit-stop-regras.js";

/** Intervalo ocupado por uma agenda/profissional dentro do plano (minutos desde 00:00). */
export type Ocupado = { resourceId: number; professionalId: number | null; date: string; ini: number; fim: number };
/** Intervalo em que o PACIENTE já está ocupado (dentro do plano ou em outra visita dele). */
export type OcupadoPaciente = { date: string; ini: number; fim: number };
export type Vaga = { date: string; time: string; parts: any[] };

export const minutosDe = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

/**
 * Leitor de vagas de UM procedimento: a equipe inteira, lida em blocos de 31 dias com cache.
 * Só leitura: nada é gravado. EquipeErro (escolha pendente, sem agenda...) sobe para quem chamou.
 */
export function criarBuscador(p: { empresaId: number; equipe: Participante[]; duracaoSegundos: number; origem: string }) {
  const duracaoMin = Math.ceil(p.duracaoSegundos / 60);
  const cache = new Map<string, Awaited<ReturnType<typeof buscarHorariosDaEquipe>>>();
  const dia = async (data: string) => {
    const base = somarDias(p.origem, Math.floor(diferencaDias(data, p.origem) / MAX_DIAS_BUSCA) * MAX_DIAS_BUSCA);
    if (!cache.has(base)) {
      cache.set(base, await buscarHorariosDaEquipe({
        empresaId: p.empresaId, participantes: p.equipe, duracaoSegundos: p.duracaoSegundos, from: base, to: somarDias(base, MAX_DIAS_BUSCA - 1),
      }));
    }
    return cache.get(base)!.find((d) => d.date === data)?.horarios ?? [];
  };
  const choca = (v: { date: string; time: string; parts: any[] }, ocupados: Ocupado[], paciente: OcupadoPaciente[]) => {
    const ini = minutosDe(v.time), fim = ini + duracaoMin;
    if (paciente.some((o) => o.date === v.date && ini < o.fim && o.ini < fim)) return true;
    return ocupados.some((o) => o.date === v.date && ini < o.fim && o.ini < fim &&
      v.parts.some((x: any) => x.resourceId === o.resourceId || (o.professionalId != null && x.professionalId === o.professionalId)));
  };
  /** Todas as vagas livres entre duas datas (inclusive), já sem choque com o plano e com o paciente. */
  const vagas = async (de: string, ate: string, ocupados: Ocupado[], paciente: OcupadoPaciente[], depoisDe?: { date: string; time: string } | null): Promise<Vaga[]> => {
    const out: Vaga[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      for (const h of await dia(d)) {
        if (depoisDe && (d < depoisDe.date || (d === depoisDe.date && h.time <= depoisDe.time))) continue;
        const v = { date: d, time: h.time, parts: h.participantes };
        if (!choca(v, ocupados, paciente)) out.push(v);
      }
    }
    return out;
  };
  /** Marca a vaga como ocupada (equipe e paciente) para as buscas seguintes. */
  const ocupar = (v: Vaga, ocupados: Ocupado[], paciente: OcupadoPaciente[]) => {
    const ini = minutosDe(v.time);
    for (const x of v.parts) ocupados.push({ resourceId: x.resourceId, professionalId: x.professionalId ?? null, date: v.date, ini, fim: ini + duracaoMin });
    paciente.push({ date: v.date, ini, fim: ini + duracaoMin });
  };
  return { dia, vagas, ocupar, choca, duracaoMin };
}
export type Buscador = ReturnType<typeof criarBuscador>;
