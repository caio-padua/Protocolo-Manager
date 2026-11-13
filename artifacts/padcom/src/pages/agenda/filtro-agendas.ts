/**
 * Filtro único de agendas da Agenda Diária (Dia, Semana, Mês e Lista usam o MESMO conjunto de agendas ocultas).
 * A chave de uma agenda é a mesma para as sessões do sistema e para os compromissos do Google dela:
 *   r{id da agenda}  = agenda de atendimento (Agenda Configuração), sessões + compromissos do Google do calendário dela;
 *   g{id do local}   = calendário só do Google (Geral, Pessoal, Feriados), sem agenda de atendimento.
 * O conjunto guarda o que foi DESMARCADO: agenda criada depois nasce marcada.
 */
import { sugerirApelido } from "./apelido-agenda";

export const SEM_CATEGORIA = "Sem categoria";
export const CATEGORIA_SO_GOOGLE = "Só no Google (somente leitura)";
export const CHAVE_SESSAO_SEM_AGENDA = "r-sem";

/** Linha de cima do botão da agenda: só a categoria profissional, vinda do campo "categoria" da agenda ("Médico", "Enfermeira"). Só apresentação. */
const PROFISSAO: Record<string, string> = {
  medicina: "Médico", medico: "Médico", medicos: "Médico",
  enfermagem: "Enfermeira", enfermeira: "Enfermeira", enfermeiro: "Enfermeira",
  biomedicina: "Biomédico", biomedico: "Biomédico", biomedicos: "Biomédico",
};
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export function rotuloDaEquipe(categoria: string): string {
  if (categoria === CATEGORIA_SO_GOOGLE) return "Só no Google";
  if (categoria === SEM_CATEGORIA) return "Sem categoria";
  return PROFISSAO[semAcento(categoria)] ?? categoria.trim();
}
/**
 * Linha de baixo do botão: o nome da agenda sem repetir a categoria que já está em cima
 * ("MEDICO - CAIO - SEDE" em Medicina vira "CAIO - SEDE"). Só no botão: a nuvenzinha e os painéis mostram o nome inteiro.
 */
export function nomeCurtoDaAgenda(nomeCompleto: string, categoria: string): string {
  const nome = categoria === CATEGORIA_SO_GOOGLE ? nomeCompleto : sugerirApelido(nomeCompleto);
  const partes = nome.split(/\s+-\s+/);
  if (partes.length < 2) return nome;
  const a = semAcento(partes[0]); const c = semAcento(categoria);
  const mesmaCategoria = a.length >= 5 && c.length >= 5 && (c.startsWith(a.slice(0, 5)) || a.startsWith(c.slice(0, 5)));
  return mesmaCategoria ? partes.slice(1).join(" - ") : nome;
}

const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
/** Número inteiro (0 a 999, masculino) por extenso; acima disso devolve os algarismos. */
export function numeroPorExtenso(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 20) return UNIDADES[n];
  if (n === 100) return "cem";
  const c = Math.floor(n / 100); const resto = n % 100;
  const dez = resto < 20 ? UNIDADES[resto] : `${DEZENAS[Math.floor(resto / 10)]}${resto % 10 ? ` e ${UNIDADES[resto % 10]}` : ""}`;
  if (c === 0) return dez;
  return resto === 0 ? CENTENAS[c] : `${CENTENAS[c]} e ${dez}`;
}
/** "Cinco agendamentos", "Um agendamento", "Nenhum agendamento". */
/** "38 atendimentos", "1 atendimento", "0 atendimentos" (número em algarismos, como o CEO pediu para a nuvenzinha). */
export function contagem(n: number, substantivo: [string, string] = ["atendimento", "atendimentos"]): string {
  return `${n} ${n === 1 ? substantivo[0] : substantivo[1]}`;
}
export function agendamentosPorExtenso(n: number, substantivo: [string, string] = ["agendamento", "agendamentos"]): string {
  if (n === 0) return `Nenhum ${substantivo[0]}`;
  const texto = `${numeroPorExtenso(n)} ${n === 1 ? substantivo[0] : substantivo[1]}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const chaveDaAgenda = (id: number) => `r${id}`;
export const chaveDaSessao = (s: { resourceId?: number | null }) => (s.resourceId ? chaveDaAgenda(s.resourceId) : CHAVE_SESSAO_SEM_AGENDA);
export const chaveDoCompromisso = (e: { agendaId: number; agendaRecursoId?: number | null }) =>
  e.agendaRecursoId != null ? chaveDaAgenda(e.agendaRecursoId) : `g${e.agendaId}`;
export const chaveDoCalendario = (a: { id: number; agendaRecursoId?: number | null }) =>
  a.agendaRecursoId != null ? chaveDaAgenda(a.agendaRecursoId) : `g${a.id}`;

export interface AgendaDoFiltro {
  chave: string; nome: string;
  /** Apelido cadastrado (o que o dono da clínica quer ver no botão); nulo = usa a sugestão. */
  apelido: string | null; cor: string; forma: string | null; categoria: string;
  /** Profissional titular da agenda; nulo em agenda compartilhada ou só do Google. */
  profissional: string | null;
  /** Duração padrão de cada horário da agenda, em minutos (nulo se desconhecida). */
  minutos: number | null;
  /** Endereço: o da sede (agenda presencial na sede) ou o próprio da agenda externa, quando cadastrado; nulo nos demais casos. */
  endereco: string | null;
  /** Atendimentos do sistema no período. */
  sessoes: number;
  /** Compromissos do Google no período (somente leitura). */
  google: number;
  /** Calendário só do Google, sem agenda de atendimento. */
  somenteGoogle: boolean;
}
export interface GrupoDoFiltro { categoria: string; agendas: AgendaDoFiltro[]; }

export interface EntradaCatalogo {
  agendas: { id: number; name: string; displayName?: string | null; color?: string | null; modality?: string | null; categoryName?: string | null; professionalName?: string | null; slotMinutes?: number | null; externalAddressText?: string | null; locationAddressText?: string | null; active?: boolean }[];
  sessoes: { resourceId?: number | null; agendaNome?: string | null; agendaCor?: string | null }[];
  calendarios: { id: number; agendaRecursoId?: number | null; nome: string; cor: string }[];
  compromissos: { agendaId: number; agendaRecursoId?: number | null }[];
}

/** Monta os grupos por categoria. Toda agenda ativa aparece, mesmo sem nada no período (o painel cobre TODAS). */
export function montarGrupos(entrada: EntradaCatalogo): GrupoDoFiltro[] {
  const mapa = new Map<string, AgendaDoFiltro>();
  for (const a of entrada.agendas) {
    if (a.active === false) continue;
    mapa.set(chaveDaAgenda(a.id), {
      chave: chaveDaAgenda(a.id), nome: a.name, apelido: a.displayName?.trim() || null, cor: a.color || "#64748b", forma: a.modality ?? null,
      categoria: a.categoryName?.trim() || SEM_CATEGORIA, profissional: a.professionalName?.trim() || null, minutos: a.slotMinutes ?? null, endereco: a.externalAddressText?.trim() || a.locationAddressText?.trim() || null, sessoes: 0, google: 0, somenteGoogle: false,
    });
  }
  for (const s of entrada.sessoes) {
    const chave = chaveDaSessao(s);
    let item = mapa.get(chave);
    if (!item) {
      // Sessão de agenda que o catálogo não trouxe (ou sem agenda ligada): aparece, nunca some em silêncio.
      item = { chave, nome: s.agendaNome ?? "Sem agenda ligada", apelido: null, cor: s.agendaCor || "#64748b", forma: null, categoria: SEM_CATEGORIA, profissional: null, minutos: null, endereco: null, sessoes: 0, google: 0, somenteGoogle: false };
      mapa.set(chave, item);
    }
    item.sessoes += 1;
  }
  for (const c of entrada.calendarios) {
    const chave = chaveDoCalendario(c);
    if (!mapa.has(chave)) {
      mapa.set(chave, { chave, nome: c.nome, apelido: null, cor: c.cor || "#64748b", forma: null, categoria: CATEGORIA_SO_GOOGLE, profissional: null, minutos: null, endereco: null, sessoes: 0, google: 0, somenteGoogle: true });
    }
  }
  for (const e of entrada.compromissos) {
    const item = mapa.get(chaveDoCompromisso(e));
    if (item) item.google += 1;
  }
  const grupos = new Map<string, AgendaDoFiltro[]>();
  for (const item of mapa.values()) grupos.set(item.categoria, [...(grupos.get(item.categoria) ?? []), item]);
  const ordemCategoria = (c: string) => (c === CATEGORIA_SO_GOOGLE ? 2 : c === SEM_CATEGORIA ? 1 : 0);
  return [...grupos.entries()]
    .sort(([a], [b]) => ordemCategoria(a) - ordemCategoria(b) || a.localeCompare(b, "pt-BR"))
    .map(([categoria, agendas]) => ({ categoria, agendas: agendas.sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")) }));
}

export const todasAsChaves = (grupos: readonly GrupoDoFiltro[]) => grupos.flatMap((g) => g.agendas.map((a) => a.chave));

export function alternarAgenda(ocultas: ReadonlySet<string>, chave: string): Set<string> {
  const n = new Set(ocultas);
  if (n.has(chave)) n.delete(chave); else n.add(chave);
  return n;
}

/** "Só esta": oculta todas as outras. Clicar de novo, quando já é a única visível, devolve todas. */
export function soEstaAgenda(ocultas: ReadonlySet<string>, chave: string, todas: readonly string[]): Set<string> {
  const outras = todas.filter((c) => c !== chave);
  const jaEhSo = !ocultas.has(chave) && outras.every((c) => ocultas.has(c));
  return jaEhSo ? new Set() : new Set(outras);
}

/** Marca ou desmarca um grupo inteiro: se todo o grupo está visível, oculta; senão, mostra todo o grupo. */
export function alternarGrupo(ocultas: ReadonlySet<string>, chavesDoGrupo: readonly string[]): Set<string> {
  const n = new Set(ocultas);
  const todasVisiveis = chavesDoGrupo.every((c) => !n.has(c));
  for (const c of chavesDoGrupo) { if (todasVisiveis) n.add(c); else n.delete(c); }
  return n;
}

export const mostrarTodas = (): Set<string> => new Set();
export const ocultarTodas = (todas: readonly string[]): Set<string> => new Set(todas);

/** Quantas agendas conhecidas estão ocultas (só conta chaves que existem no painel). */
export const quantasOcultas = (ocultas: ReadonlySet<string>, todas: readonly string[]) => todas.filter((c) => ocultas.has(c)).length;
