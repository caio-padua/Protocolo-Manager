/**
 * Regras puras da linha do tempo da Agenda (Dia e Semana). Sem React e sem relógio próprio:
 * quem chama informa "agora", para que o teste e a tela usem a mesma conta.
 * Tudo em minutos desde 00:00 do horário de Brasília, como a agenda já grava (texto "HH:MM").
 */

export type Faixa = { ini: number; fim: number };
export type Posicionado<T> = T & { col: number; cols: number };

/** "09:30" ou "09:30:00" para minutos desde 00:00. Texto inválido devolve null (nada é inventado). */
export function minutosDoHorario(texto: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(texto ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/** Duração mínima desenhada (minutos): compromisso curto continua legível e clicável. */
export const DURACAO_MINIMA_DESENHO = 25;

export const fimDesenhado = (ini: number, fim: number) => Math.max(fim, ini + DURACAO_MINIMA_DESENHO);

/**
 * Compromissos que se sobrepõem no tempo ficam lado a lado (como no Google Agenda).
 * Cada grupo de sobreposição divide a largura entre as colunas que ele realmente usa.
 */
export function colunarSobrepostos<T extends Faixa>(itens: T[]): Posicionado<T>[] {
  const ordenados = [...itens].sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const saida: Posicionado<T>[] = [];
  let grupo: { item: T; col: number }[] = [];
  let colunasFim: number[] = [];
  let fimDoGrupo = -1;
  const fechar = () => {
    const cols = colunasFim.length;
    for (const g of grupo) saida.push({ ...g.item, col: g.col, cols });
    grupo = [];
    colunasFim = [];
    fimDoGrupo = -1;
  };
  for (const item of ordenados) {
    if (grupo.length > 0 && item.ini >= fimDoGrupo) fechar();
    let col = colunasFim.findIndex((f) => f <= item.ini);
    if (col < 0) { col = colunasFim.length; colunasFim.push(item.fim); } else colunasFim[col] = item.fim;
    grupo.push({ item, col });
    fimDoGrupo = Math.max(fimDoGrupo, item.fim);
  }
  if (grupo.length > 0) fechar();
  return saida;
}

/**
 * Faixa de horas exibida: padrão 7h–20h, ampliada só quando existe compromisso fora dela.
 * Devolve horas inteiras: `inicio` (inclusive) e `fim` (linha final).
 */
export function faixaDeHoras(itens: Faixa[], padraoInicio = 7, padraoFim = 20): { inicio: number; fim: number } {
  let inicio = padraoInicio;
  let fim = padraoFim;
  for (const i of itens) {
    inicio = Math.min(inicio, Math.floor(i.ini / 60));
    fim = Math.max(fim, Math.ceil(Math.min(i.fim, 24 * 60) / 60));
  }
  return { inicio: Math.max(0, inicio), fim: Math.min(24, fim) };
}

export type Proximidade = "encerrada" | "proxima" | "andamento" | "futura" | "passada";

/** Estados em que o atendimento ainda vai acontecer; concluído, faltou e cancelado nunca chamam atenção. */
export const STATUS_ABERTOS = ["scheduled", "confirmed"] as const;
export const JANELA_PROXIMA_MIN = 30;
export const JANELA_AVISO_SONORO_MIN = 10;

export function proximidade(p: { ehHoje: boolean; ini: number; fim: number; agora: number; status: string }): Proximidade {
  if (!(STATUS_ABERTOS as readonly string[]).includes(p.status)) return "encerrada";
  if (!p.ehHoje) return "futura";
  const faltam = p.ini - p.agora;
  if (faltam >= 0 && faltam <= JANELA_PROXIMA_MIN) return "proxima";
  if (faltam < 0 && p.agora < p.fim) return "andamento";
  return faltam > 0 ? "futura" : "passada";
}

/** "agora", "em 12 min", "em 1h05". */
export function textoFaltam(minutos: number): string {
  if (minutos <= 0) return "agora";
  if (minutos < 60) return `em ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `em ${h}h${String(m).padStart(2, "0")}`;
}

export const rotuloHora = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Data e minutos de agora em Brasília, a partir de um instante (o relógio do navegador pode estar em outro fuso). */
export function agoraEmBrasilia(instante: Date): { data: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instante);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return { data: `${g("year")}-${g("month")}-${g("day")}`, minutos: Number(g("hour")) * 60 + Number(g("minute")) };
}

export type EstadoAplicacao = "disp" | "prox" | "applied" | "notPerformed" | "unavailable" | "review";

/** Texto e cor de cada quadradinho de aplicação (mesmas palavras do cartão da sessão). */
export const ESTADO_APLICACAO: Record<EstadoAplicacao, { rotulo: string; cor: string }> = {
  applied: { rotulo: "Aplicada", cor: "#16a34a" },
  disp: { rotulo: "A aplicar", cor: "#d97706" },
  prox: { rotulo: "Próxima", cor: "#64748b" },
  notPerformed: { rotulo: "Não aplicada", cor: "#b91c1c" },
  unavailable: { rotulo: "Indisponível", cor: "#94a3b8" },
  review: { rotulo: "Conferir", cor: "#b91c1c" },
};

export const estadoDaAplicacao = (valor: unknown): EstadoAplicacao =>
  typeof valor === "string" && valor in ESTADO_APLICACAO ? (valor as EstadoAplicacao) : "review";

const COR_VALIDA = /^#[0-9a-fA-F]{3,8}$/;
export const SEM_AGENDA_COR = "#64748b";
export const corSegura = (cor: string | null | undefined, padrao = SEM_AGENDA_COR) => (cor && COR_VALIDA.test(cor) ? cor : padrao);

/**
 * Compromisso do Google: horário de início vem pronto em "HH:MM" (Brasília) e a duração sai de início/fim.
 * Dia inteiro não ocupa a linha do tempo: vai para a faixa de cima.
 */
export function faixaDoGoogle(e: { diaInteiro: boolean; horario: string; inicio: string; fim: string }): Faixa | null {
  if (e.diaInteiro) return null;
  const ini = minutosDoHorario(e.horario);
  const dur = Math.round((new Date(e.fim).getTime() - new Date(e.inicio).getTime()) / 60000);
  if (ini === null || !Number.isFinite(dur) || dur <= 0) return null;
  return { ini, fim: Math.min(ini + dur, 24 * 60) };
}

/** Nome do atendimento pelas aplicações do dia (mesma regra do cartão da sessão). */
export function rotuloAtendimento(sessao: { substanceApplications?: { availability: string; procedureType?: string }[] }): string {
  const apps = sessao.substanceApplications?.filter((a) => a.availability === "disp") ?? [];
  if (apps.length === 0) return "Aplicação";
  const tipos = new Set(apps.map((a) => a.procedureType ?? "iv"));
  if (tipos.has("implant")) return "Implante";
  if (tipos.has("im") && !tipos.has("iv")) return "Aplicação IM";
  if (tipos.has("iv")) return "Aplicação EV";
  return "Aplicação";
}

export type ModoAgenda = "dia" | "semana" | "mes";

/**
 * Lê ?data=AAAA-MM-DD&modo=dia|semana|mes&visao=linha|lista (links do Pit Stop). Valor inválido é ignorado, nunca corrigido por adivinhação:
 * data inexistente (31/02) e modo desconhecido voltam null e a tela segue no padrão.
 */
export type VisaoAgenda = "linha" | "lista";

export function lerParametrosAgenda(busca: string): { data: Date | null; modo: ModoAgenda | null; visao: VisaoAgenda | null } {
  const q = new URLSearchParams(busca);
  const textoData = q.get("data") ?? "";
  let data: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(textoData)) {
    const d = new Date(`${textoData}T12:00:00`);
    const [a, m, dia] = textoData.split("-").map(Number);
    if (d.getFullYear() === a && d.getMonth() + 1 === m && d.getDate() === dia) data = d;
  }
  const m = q.get("modo");
  const v = q.get("visao");
  return { data, modo: m === "dia" || m === "semana" || m === "mes" ? m : null, visao: v === "linha" || v === "lista" ? v : null };
}
