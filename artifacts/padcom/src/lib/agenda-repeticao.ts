/**
 * Padrões de repetição das janelas de atendimento (espelho de api-server/src/lib/agenda-window-recurrence.ts).
 *   1 = toda semana | 2, 3, 4, 6, 8 = a cada N semanas, contando da data inicial
 *   101..104 = 1º..4º dia da semana do mês | 105 = último do mês
 */
export const NOME_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MASCULINO = new Set([0, 6]);

export const INTERVALOS = [2, 3, 4, 6, 8] as const;
export const MENSAIS = [101, 102, 103, 104, 105] as const;

export const ehMensal = (c: number) => c >= 101 && c <= 105;
export const exigeDataInicial = (c: number) => c > 1 && !ehMensal(c);

export function rotuloRepeticao(codigo: number, weekday: number): string {
  if (codigo === 1) return "Toda semana";
  if (exigeDataInicial(codigo)) return `A cada ${codigo} semanas`;
  const dia = NOME_DIA[weekday];
  const masc = MASCULINO.has(weekday);
  if (codigo === 105) return `${masc ? "Último" : "Última"} ${dia} do mês`;
  const n = codigo - 100;
  return `${n}${masc ? "º" : "ª"} ${dia} do mês`;
}

const DIA = 86_400_000;
const ms = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T12:00:00Z`) : NaN);
export const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10);

/** A janela cai nesta data? (mesma regra do servidor) */
export function ocorreEm(w: { repeatWeeks: number; anchorDate: string }, weekday: number, data: number): boolean {
  if (new Date(data).getUTCDay() !== weekday) return false;
  if (w.repeatWeeks === 1) return true;
  if (ehMensal(w.repeatWeeks)) {
    const d = new Date(data);
    const ultima = new Date(data + 7 * DIA).getUTCMonth() !== d.getUTCMonth();
    return w.repeatWeeks === 105 ? ultima : Math.ceil(d.getUTCDate() / 7) === w.repeatWeeks - 100;
  }
  const ancora = ms(w.anchorDate);
  return Number.isFinite(ancora) && data >= ancora && ((data - ancora) / DIA) % (7 * w.repeatWeeks) === 0;
}

/** Próximas datas (dd/mm) em que a janela atende, a partir de hoje. */
export function proximasDatas(w: { repeatWeeks: number; anchorDate: string }, weekday: number, quantidade = 4): string[] {
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  let t = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12);
  const saida: string[] = [];
  for (let i = 0; i < 400 && saida.length < quantidade; i++, t += DIA) {
    if (ocorreEm(w, weekday, t)) saida.push(isoDe(t).split("-").reverse().slice(0, 2).join("/"));
  }
  return saida;
}

/** Próxima data (ISO) do dia da semana, hoje incluído — usada como data inicial sugerida. */
export function proximaDataDoDia(weekday: number): string {
  const hoje = new Date();
  let t = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12);
  while (new Date(t).getUTCDay() !== weekday) t += DIA;
  return isoDe(t);
}

export function dataInicialValida(iso: string, weekday: number): boolean {
  const t = ms(iso);
  return Number.isFinite(t) && isoDe(t) === iso && new Date(t).getUTCDay() === weekday;
}

/** Frase de resumo de uma janela com repetição, para telas de leitura. null = toda semana. */
export function resumoRepeticao(w: { weekday: number; repeatWeeks?: number | null; anchorDate?: string | null }): string | null {
  const c = w.repeatWeeks ?? 1;
  if (c === 1) return null;
  if (ehMensal(c)) return rotuloRepeticao(c, w.weekday);
  const nome = c === 2 ? "duas" : String(c);
  const desde = w.anchorDate?.split("-").reverse().join("/") ?? "data não informada";
  return `A cada ${nome} semanas, desde ${desde}`;
}
