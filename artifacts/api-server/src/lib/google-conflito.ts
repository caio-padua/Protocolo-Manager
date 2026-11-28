import { createHash } from "node:crypto";

/**
 * Conflito de edição concorrente entre o sistema e o Google Agenda.
 *
 * O sistema grava, em cada evento que envia, uma "impressão" (hash curto) de início, fim e título numa propriedade
 * PRIVADA do evento. Antes de atualizar um evento que já existe, o servidor lê o evento no Google e compara a
 * impressão do estado atual com a marca gravada na última escrita do sistema. Se forem diferentes, alguém mudou o
 * evento direto no Google e o sistema NÃO sobrescreve em silêncio: bloqueia, registra e pede decisão humana.
 *
 * A descrição e o endereço ficam de fora da impressão de propósito: o Google pode normalizar texto e isso geraria
 * conflito falso, bloqueando ações clínicas sem necessidade.
 */
export const CHAVE_MARCA_GOOGLE = "paxterFp";

export interface TempoGoogle { dateTime?: string | null; date?: string | null }
export interface EventoRemoto {
  status?: string | null;
  summary?: string | null;
  start?: TempoGoogle | null;
  end?: TempoGoogle | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
}
export interface IntervaloEvento { inicio: string; fim: string; titulo: string }

function instante(tempo?: TempoGoogle | null): string {
  if (tempo?.dateTime) {
    const valor = new Date(tempo.dateTime);
    return Number.isFinite(valor.getTime()) ? valor.toISOString() : "";
  }
  if (tempo?.date) return `dia:${tempo.date}`;
  return "";
}

export function impressaoDoEvento(evento: IntervaloEvento): string {
  return createHash("sha256").update(`${evento.inicio}|${evento.fim}|${evento.titulo}`).digest("hex").slice(0, 24);
}

export function intervaloDoRemoto(remoto: EventoRemoto): IntervaloEvento {
  return { inicio: instante(remoto.start), fim: instante(remoto.end), titulo: String(remoto.summary ?? "") };
}

export type ConferenciaRemota =
  | { tipo: "sem_conflito" }
  /** Evento sem marca (enviado antes deste controle): não há base para provar edição; a próxima escrita grava a marca. */
  | { tipo: "sem_marca" }
  | { tipo: "alterado"; remoto: IntervaloEvento }
  | { tipo: "apagado" };

export function conferirEventoRemoto(remoto: EventoRemoto): ConferenciaRemota {
  if (remoto.status === "cancelled") return { tipo: "apagado" };
  const marca = remoto.extendedProperties?.private?.[CHAVE_MARCA_GOOGLE];
  if (!marca) return { tipo: "sem_marca" };
  const atual = intervaloDoRemoto(remoto);
  return impressaoDoEvento(atual) === marca ? { tipo: "sem_conflito" } : { tipo: "alterado", remoto: atual };
}

export class GoogleConflito extends Error {
  readonly code = "google_conflito";
  constructor(
    readonly tipo: "alterado" | "apagado",
    readonly remoto: IntervaloEvento | null,
  ) {
    super(tipo === "apagado"
      ? "O evento foi apagado no Google depois do último envio. O sistema não recriou nem sobrescreveu nada; decida na tela de conflitos."
      : "O evento foi alterado direto no Google depois do último envio. O sistema não sobrescreveu a alteração; decida na tela de conflitos.");
    this.name = "GoogleConflito";
  }
}
