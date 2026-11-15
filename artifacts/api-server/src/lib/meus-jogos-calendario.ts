import type { Modalidade } from "./meus-jogos-regras";

/**
 * CALENDARIO OFICIAL de concursos (CAIXA) — logica PURA (sem rede, sem banco). Ver specs/meus-jogos-calendario-logistica.md.
 * Tudo em Brasilia (-03:00). O calendario so existe se foi LIDO de fonte oficial (ver meus-jogos-extracao.ts);
 * aqui so se decide, a partir dele, quais concursos existem, quando fecham e se podem ser vendidos.
 */

export type Canal = "aposta_simples" | "bolao_caixa_digital";

/** Regras que so valem quando o texto oficial correspondente foi encontrado na ultima leitura. */
export interface RegrasVerificadas {
  /** Cronograma semanal (pagina regras-sorteios). */
  semanal: boolean;
  /** Concurso de domingo: aposta simples ate sabado 22h (comunicado de 19/07/2026). */
  domingoSabado22h: boolean;
  /** Bolao no canal eletronico encerra 15 min antes do sorteio (comunicado). */
  bolao15min: boolean;
  /** Cronograma mensal: demais modalidades encerram 1 hora antes do sorteio. */
  umaHoraAntes: boolean;
  /** Paginas das modalidades: bolao digital encerra as 19h30 em sorteio no mesmo dia. */
  bolaoSemana1930: boolean;
}
export const REGRAS_NAO_VERIFICADAS: RegrasVerificadas = { semanal: false, domingoSabado22h: false, bolao15min: false, umaHoraAntes: false, bolaoSemana1930: false };

export interface SorteioCalendario {
  modalidade: Modalidade;
  /** YYYY-MM-DD (dia do sorteio, Brasilia). */
  data: string;
  concurso: number;
  /** Citado em nota do cronograma como especial / vendas exclusivas: nunca vendido sem preco e regras verificados. */
  especial: boolean;
  /** Excecao oficial do dia: instante (ISO, -03:00) em que as apostas encerram, quando difere da regra geral. */
  apostasEncerramEm: string | null;
  /** Excecao oficial do dia: hora do sorteio (HH:MM), quando difere do cronograma semanal. */
  horaSorteio: string | null;
}

export interface CalendarioOficial {
  geradoEm: string;
  validoAte: string;
  regras: RegrasVerificadas;
  /** Meses (YYYY-MM) cobertos por cronograma mensal lido com sucesso. */
  meses: string[];
  sorteios: SorteioCalendario[];
  /** Datas marcadas "Feriado" no cronograma mensal (sem sorteio das modalidades). */
  feriados: string[];
}

// ---------------------------------------------------------------- tempo (Brasilia)
const NUM = /^\d{4}-\d{2}-\d{2}$/;
export const instante = (data: string, hhmm: string): Date => new Date(`${data}T${hhmm}:00-03:00`);
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + dias);
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}
/** 0 = domingo ... 6 = sabado, para uma data civil de Brasilia. */
export function diaDaSemana(data: string): number {
  if (!NUM.test(data)) return NaN;
  return new Date(`${data}T12:00:00-03:00`).getUTCDay();
}

// ---------------------------------------------------------------- cronograma semanal regular (pagina regras-sorteios)
const DIAS_UTEIS = [1, 2, 3, 4, 5];
const DIAS_SEMANAIS: Record<Modalidade, readonly number[]> = {
  megasena: [2, 4], lotofacil: DIAS_UTEIS, quina: DIAS_UTEIS, lotomania: [1, 3, 5],
};
const TEM_DOMINGO: Record<Modalidade, boolean> = { megasena: true, lotofacil: true, quina: true, lotomania: false };

/** Hora regular do sorteio (HH:MM) naquele dia da semana, ou null se a modalidade nao sorteia nesse dia. */
export function horaRegular(m: Modalidade, dow: number): string | null {
  if (dow === 0) return TEM_DOMINGO[m] ? "11:00" : null;
  return DIAS_SEMANAIS[m].includes(dow) ? "21:00" : null;
}

export const horaDoSorteio = (s: SorteioCalendario): string | null => s.horaSorteio ?? horaRegular(s.modalidade, diaDaSemana(s.data));
export const sorteioEm = (s: SorteioCalendario): Date | null => { const h = horaDoSorteio(s); return h ? instante(s.data, h) : null; };

// ---------------------------------------------------------------- fechamento por canal
export interface FechamentoCanal { em: string; regra: string }

/**
 * Fechamento OFICIAL do canal para um sorteio. null = nao verificado em fonte (nunca se presume).
 * Aposta simples: excecao do dia > domingo (sabado 22h) > 1 hora antes do sorteio.
 * Bolao digital: domingo 15 min antes do sorteio; dia de semana 19h30 do mesmo dia; excecao do dia = nao verificado.
 */
export function fechamentoDoCanal(s: SorteioCalendario, canal: Canal, regras: RegrasVerificadas): FechamentoCanal | null {
  const sorteio = sorteioEm(s);
  if (!sorteio) return null;
  const dow = diaDaSemana(s.data);
  if (canal === "aposta_simples") {
    if (s.apostasEncerramEm) return { em: new Date(s.apostasEncerramEm).toISOString(), regra: "excecao_oficial_do_dia" };
    if (dow === 0) return regras.domingoSabado22h ? { em: instante(somarDias(s.data, -1), "22:00").toISOString(), regra: "domingo_sabado_22h" } : null;
    return regras.umaHoraAntes ? { em: new Date(sorteio.getTime() - 3_600_000).toISOString(), regra: "uma_hora_antes" } : null;
  }
  if (s.apostasEncerramEm || s.horaSorteio) return null; // dia com excecao: sem fonte para o bolao
  if (dow === 0) return regras.bolao15min ? { em: new Date(sorteio.getTime() - 15 * 60_000).toISOString(), regra: "bolao_15_min_antes" } : null;
  return regras.bolaoSemana1930 ? { em: instante(s.data, "19:30").toISOString(), regra: "bolao_19h30_mesmo_dia" } : null;
}

// ---------------------------------------------------------------- avaliacao e opcoes de concurso
export type MotivoSorteio =
  | "especial_nao_verificado" | "fora_do_cronograma_regular" | "regras_semanais_nao_verificadas"
  | "fechamento_nao_verificado" | "fora_do_prazo";

const MSG_SORTEIO: Record<MotivoSorteio, string> = {
  especial_nao_verificado: "Concurso especial: preço e regras ainda não foram verificados na fonte oficial. Nenhum pedido é aceito.",
  fora_do_cronograma_regular: "A data deste concurso foge do cronograma semanal oficial e ainda não foi verificada. Nenhum pedido é aceito.",
  regras_semanais_nao_verificadas: "O cronograma semanal oficial não pôde ser verificado agora. Nenhum pedido é aceito.",
  fechamento_nao_verificado: "O horário oficial de fechamento deste concurso não foi verificado. Nenhum pedido é aceito.",
  fora_do_prazo: "O prazo interno para este concurso já passou. Escolha o próximo concurso, se houver; nada é cobrado.",
};
export const mensagemSorteio = (m: MotivoSorteio) => MSG_SORTEIO[m];

export interface OpcaoConcurso {
  concurso: number; data: string; horaSorteio: string; sorteioEm: string;
  canais: {
    aposta_simples: { oficialEm: string; internoEm: string; regra: string } | null;
    bolao_caixa_digital: { oficialEm: string; regra: string } | null;
  };
  aberto: boolean; motivo: MotivoSorteio | null; mensagem: string | null; especial: boolean;
}

export function avaliarSorteio(s: SorteioCalendario, cal: Pick<CalendarioOficial, "regras">, agora: Date, margemMinutos: number): OpcaoConcurso | null {
  const sorteio = sorteioEm(s);
  const hora = horaDoSorteio(s);
  if (!sorteio || !hora) {
    // Sem hora regular nem excecao: existe no calendario mensal, mas fora do cronograma semanal.
    return {
      concurso: s.concurso, data: s.data, horaSorteio: "—", sorteioEm: instante(s.data, "00:00").toISOString(),
      canais: { aposta_simples: null, bolao_caixa_digital: null }, aberto: false,
      motivo: "fora_do_cronograma_regular", mensagem: MSG_SORTEIO.fora_do_cronograma_regular, especial: s.especial,
    };
  }
  const simples = fechamentoDoCanal(s, "aposta_simples", cal.regras);
  const bolao = fechamentoDoCanal(s, "bolao_caixa_digital", cal.regras);
  let motivo: MotivoSorteio | null = null;
  if (s.especial) motivo = "especial_nao_verificado";
  else if (!cal.regras.semanal && s.horaSorteio === null) motivo = "regras_semanais_nao_verificadas";
  else if (!simples) motivo = "fechamento_nao_verificado";
  const interno = simples ? new Date(new Date(simples.em).getTime() - margemMinutos * 60_000) : null;
  if (!motivo && interno && agora.getTime() >= interno.getTime()) motivo = "fora_do_prazo";
  return {
    concurso: s.concurso, data: s.data, horaSorteio: hora, sorteioEm: sorteio.toISOString(),
    canais: {
      aposta_simples: simples && interno ? { oficialEm: simples.em, internoEm: interno.toISOString(), regra: simples.regra } : null,
      bolao_caixa_digital: bolao ? { oficialEm: bolao.em, regra: bolao.regra } : null,
    },
    aberto: motivo === null, motivo, mensagem: motivo ? MSG_SORTEIO[motivo] : null, especial: s.especial,
  };
}

/** Proximos concursos da modalidade (sorteio ainda no futuro), do mais proximo ao mais distante. */
export function opcoesDeConcurso(m: Modalidade, cal: CalendarioOficial, agora: Date, margemMinutos: number, limite = 4): OpcaoConcurso[] {
  const out: OpcaoConcurso[] = [];
  const ordenados = cal.sorteios.filter((s) => s.modalidade === m).sort((a, b) => a.data.localeCompare(b.data) || a.concurso - b.concurso);
  for (const s of ordenados) {
    const sorteio = sorteioEm(s);
    if (sorteio && sorteio.getTime() <= agora.getTime()) continue;
    if (!sorteio && s.data < agora.toISOString().slice(0, 10)) continue;
    const o = avaliarSorteio(s, cal, agora, margemMinutos);
    if (o) out.push(o);
    if (out.length >= limite) break;
  }
  return out;
}

// ---------------------------------------------------------------- consistencia entre fontes
export type ConsistenciaApi = { ok: true } | { ok: false; motivo: "dados_divergentes" | "calendario_nao_cobre"; detalhe: string };

/**
 * A API ao vivo diz qual e o proximo concurso (numero e data). O cronograma mensal precisa dizer o MESMO.
 * Data inexistente no calendario (ex.: feriado sem sorteio) ou numero diferente = divergencia = nao vende.
 */
export function conferirProximoComCalendario(m: Modalidade, api: { concurso: number; data: string }, cal: CalendarioOficial): ConsistenciaApi {
  if (!cal.meses.includes(api.data.slice(0, 7))) return { ok: false, motivo: "calendario_nao_cobre", detalhe: `o cronograma de ${api.data.slice(0, 7)} não foi lido` };
  const s = cal.sorteios.find((x) => x.modalidade === m && x.data === api.data);
  if (!s) return { ok: false, motivo: "dados_divergentes", detalhe: `a API indica ${api.data}, mas o cronograma oficial não tem sorteio nessa data` };
  if (s.concurso !== api.concurso) return { ok: false, motivo: "dados_divergentes", detalhe: `a API indica o concurso ${api.concurso} e o cronograma, ${s.concurso}` };
  return { ok: true };
}

export function calendarioValido(cal: CalendarioOficial | null, agora: Date): cal is CalendarioOficial {
  return Boolean(cal) && Number.isFinite(new Date(cal!.validoAte).getTime()) && agora.getTime() < new Date(cal!.validoAte).getTime();
}
