/**
 * Regras puras da marcação de consulta avulsa pela Agenda Diária: de onde o dedo ou o mouse apontou até o
 * horário e a duração, e a leitura honesta da resposta do servidor. Sem React e sem relógio.
 * Tudo em minutos desde 00:00 de Brasília (como a agenda grava "HH:MM").
 */
import { rotuloHora } from "./timeline-logica";

export const PASSO_MINUTOS = 5;
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 480;
/** Quanto o ponteiro precisa andar (px) para o gesto virar arraste em vez de clique. */
export const LIMIAR_ARRASTE_PX = 6;
/** Toque e segure no celular: tempo até a seleção começar (ms) e quanto o dedo pode andar antes (px) sem virar rolagem. */
export const TOQUE_SEGURAR_MS = 450;
export const TOQUE_TOLERANCIA_PX = 10;

export type FaixaHoras = { horaIni: number; horaFim: number };

const piso = (m: number) => Math.floor(m / PASSO_MINUTOS) * PASSO_MINUTOS;
const teto = (m: number) => Math.ceil(m / PASSO_MINUTOS) * PASSO_MINUTOS;

/** Posição vertical dentro da coluna (px) para minutos do dia. */
export function minutoDoPonteiro(y: number, horaPx: number, faixa: FaixaHoras): number {
  const bruto = faixa.horaIni * 60 + (y / horaPx) * 60;
  return Math.min(Math.max(bruto, faixa.horaIni * 60), faixa.horaFim * 60);
}

/**
 * Intervalo escolhido por arraste (para cima ou para baixo): início arredondado para baixo e fim para cima,
 * de 5 em 5 minutos, nunca menor que 5 minutos e nunca fora da faixa de horas exibida.
 */
export function intervaloDoArraste(a: number, b: number, faixa: FaixaHoras): { ini: number; fim: number } {
  const limiteIni = faixa.horaIni * 60;
  const limiteFim = faixa.horaFim * 60;
  let ini = Math.max(piso(Math.min(a, b)), limiteIni);
  let fim = Math.min(teto(Math.max(a, b)), limiteFim);
  if (fim - ini < DURACAO_MIN) {
    fim = Math.min(ini + DURACAO_MIN, limiteFim);
    ini = Math.max(fim - DURACAO_MIN, limiteIni);
  }
  return { ini, fim };
}

export const ehArraste = (dx: number, dy: number) => Math.hypot(dx, dy) >= LIMIAR_ARRASTE_PX;

/** Clique simples: início arredondado para baixo, duração fica por conta da agenda escolhida. */
export const inicioDoClique = (minuto: number) => piso(minuto);

export function duracaoValida(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= DURACAO_MIN && valor <= DURACAO_MAX;
}

/** Texto digitado vira inteiro; vazio, decimal e lixo viram null (nada é adivinhado). */
export function lerDuracao(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const n = Number(texto.trim());
  return duracaoValida(n) ? n : null;
}

export const textoDuracao = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

export const textoIntervalo = (ini: number, dur: number) => `${rotuloHora(ini)} às ${rotuloHora(Math.min(ini + dur, 24 * 60))}`;

export type SlotMotor = { time: string; state: string; reason?: string | null };

/**
 * A agenda só aceita início em um período dela (grade de 20 em 20, por exemplo). Pega o período que contém o
 * minuto pedido. Antes do primeiro período, usa o primeiro (e avisa que foi ajustado).
 */
export function periodoDoInicio(minuto: number, slots: SlotMotor[]): { time: string; ajustado: boolean } | null {
  const tempos = slots
    .map((s) => ({ s, m: toMin(s.time) }))
    .filter((x): x is { s: SlotMotor; m: number } => x.m !== null)
    .sort((x, y) => x.m - y.m);
  if (tempos.length === 0) return null;
  let escolhido = tempos[0]!;
  for (const t of tempos) if (t.m <= minuto) escolhido = t;
  return { time: escolhido.s.time, ajustado: escolhido.m !== minuto };
}

function toMin(texto: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(texto);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Conferência prévia, só informativa (quem decide é o servidor): o motor mostra algum período do trecho como
 * ocupado, bloqueado ou inexistente? Devolve o primeiro período problemático, ou null se o trecho parece livre.
 */
export function primeiroPeriodoIndisponivel(
  inicio: string, duracao: number, slotMinutos: number, slots: SlotMotor[],
): { time: string; state: string; reason: string | null } | null {
  const ini = toMin(inicio);
  if (ini === null || slotMinutos <= 0) return null;
  const necessarios = Math.ceil(duracao / slotMinutos);
  const porHora = new Map(slots.map((s) => [s.time, s]));
  for (let i = 0; i < necessarios; i++) {
    const t = rotuloHora(ini + i * slotMinutos);
    const s = porHora.get(t);
    if (!s) return { time: t, state: "inexistente", reason: null };
    if (s.state !== "aberto") return { time: t, state: s.state, reason: s.reason ?? null };
  }
  return null;
}

export function explicarPeriodo(p: { time: string; state: string; reason: string | null }): string {
  if (p.state === "inexistente") return `A agenda não tem período às ${p.time} neste dia.`;
  if (p.state === "ocupado") return `O período das ${p.time} já está ocupado nesta agenda.`;
  const motivo = p.reason === "antecedencia" ? "fora da antecedência mínima"
    : p.reason === "compromisso" ? "bloqueado por compromisso"
    : p.reason === "cadeia" ? "ainda não liberado pela agenda"
    : "bloqueado";
  return `O período das ${p.time} está ${motivo}.`;
}

// ── Resultado da marcação ─────────────────────────────────────────────────────

export type ResultadoMarcacao =
  | { tipo: "ok" }
  | { tipo: "google-aviso"; aviso: string }
  | { tipo: "recusada"; status: number; mensagem: string }
  | { tipo: "incerto"; mensagem: string };

export const AVISO_GOOGLE_SEM_CONFIRMACAO =
  "O Google Agenda não confirmou a criação do evento. A consulta está salva no sistema; use Sincronizar no cartão da consulta.";

/** Resposta 2xx. Com sincronização pedida, evento criado = ok; aviso ou ausência de evento = aviso explícito. */
export function lerRespostaDeSucesso(
  resposta: { googleEventId?: string | null; googleSyncWarning?: string | null } | null | undefined,
  sincronizar: boolean,
): ResultadoMarcacao {
  if (resposta?.googleSyncWarning) return { tipo: "google-aviso", aviso: resposta.googleSyncWarning };
  if (sincronizar && !resposta?.googleEventId) return { tipo: "google-aviso", aviso: AVISO_GOOGLE_SEM_CONFIRMACAO };
  return { tipo: "ok" };
}

/**
 * Falha da chamada. Status 4xx com mensagem do servidor = recusa clara (nada foi gravado).
 * Sem status, 5xx ou resposta ilegível = a gravação PODE ter acontecido: resultado incerto, nunca repetir às cegas.
 */
export function lerFalha(erro: unknown): ResultadoMarcacao {
  const e = erro as { status?: number; data?: { error?: unknown } | null } | null;
  const status = typeof e?.status === "number" ? e.status : null;
  const mensagem = typeof e?.data?.error === "string" ? e.data.error : null;
  if (status !== null && status >= 400 && status < 500) {
    return { tipo: "recusada", status, mensagem: mensagem ?? mensagemPadraoDaRecusa(status) };
  }
  return {
    tipo: "incerto",
    mensagem: "Não recebemos a resposta do servidor. A consulta pode ou não ter sido gravada. Confira a agenda antes de tentar de novo.",
  };
}

function mensagemPadraoDaRecusa(status: number): string {
  if (status === 401) return "Sua sessão expirou. Entre de novo para marcar.";
  if (status === 403) return "Seu acesso não permite marcar nesta agenda.";
  if (status === 404) return "Agenda ou cliente não encontrado nesta clínica.";
  if (status === 409) return "Horário já ocupado.";
  return "A marcação foi recusada.";
}

/** A consulta já aparece na agenda? (conferência do resultado incerto: mesma agenda, cliente, dia e horário, sem protocolo) */
export function jaMarcada(
  sessoes: { clientId: number; resourceId?: number | null; scheduledDate: string; scheduledTime: string; protocolId?: number | null; status?: string }[],
  alvo: { clientId: number; resourceId: number; date: string; time: string },
): boolean {
  return sessoes.some((s) =>
    s.clientId === alvo.clientId && s.resourceId === alvo.resourceId && s.scheduledDate === alvo.date
    && s.scheduledTime.slice(0, 5) === alvo.time && s.protocolId == null && s.status !== "cancelled");
}

// ── Cadastro da agenda, separado em campos ────────────────────────────────────

export const TIPOS_RESERVAVEIS = ["medico", "enfermagem"] as const;

export type AgendaOpcao = {
  id: number; name: string; kind: string; modality: string; slotMinutes: number;
  professionalName?: string | null; locationName?: string | null; externalAddressText?: string | null; active?: boolean;
};

export const agendaReservavel = (r: { kind: string; active?: boolean }) =>
  r.active !== false && (TIPOS_RESERVAVEIS as readonly string[]).includes(r.kind);

export const ROTULO_MODALIDADE: Record<string, string> = {
  local: "Presencial na sede", online: "Online", domiciliar: "Domiciliar (Home Care)", externo: "Em outro local",
};
export const rotuloModalidade = (m: string) => ROTULO_MODALIDADE[m] ?? "A confirmar";

/** Local da agenda: só o que está cadastrado. Nada é inventado; ausência aparece como "A definir". */
export function rotuloLocal(r: AgendaOpcao): string {
  if (r.modality === "online") return "Atendimento online (sem local físico)";
  if (r.modality === "externo") return r.externalAddressText ?? r.locationName ?? "A definir";
  return r.locationName ?? "A definir";
}

export const rotuloProfissional = (r: AgendaOpcao) => r.professionalName ?? "Agenda compartilhada (sem profissional titular)";
