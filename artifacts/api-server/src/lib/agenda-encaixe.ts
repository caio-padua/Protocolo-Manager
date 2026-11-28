import { and, eq, sql } from "drizzle-orm";
import { db, clientsTable, sessionsTable, type Session, type agendaResourcesTable } from "@workspace/db";
import { fontesGoogleDaAgenda, type AgendaExecutor } from "./agenda-occupancy";
import { atualizarLocaisAoVivo } from "./agenda-google-sync";
import { logger } from "./logger";
import {
  computeResourceSlots, gravarSessaoAvulsa, lockAgendaParticipants, lockAgendaResource, RESERVABLE_KINDS,
} from "./agenda-booking";
import { classificarSobreposicao, listarSessoesCandidatas } from "./agenda-conflitos";
import { syncBookedSession } from "./session-google-sync";
import { getJsonSetting } from "./secure-settings";

/**
 * ENCAIXE RÁPIDO INTERNO (Quick Book): marcação de consulta avulsa pela própria equipe autorizada, com antecedência
 * curta em MINUTOS e sem a liberação em cadeia (anti-ilha). A regra de 24 horas e a cadeia continuam valendo para o
 * paciente, o protocolo, o Pit Stop, a concierge e toda marcação padrão: este módulo só é chamado pelas rotas
 * /agenda/encaixe/*, que decidem o canal no servidor (agenda-encaixe-acesso.ts).
 *
 * O seletor (avaliarEncaixeDoDia) e a confirmação (encaixarConsultaAvulsa) usam a MESMA função de decisão. Esta etapa
 * NÃO compartilha horário: qualquer sobreposição com agenda, profissional ou cliente é recusada.
 */

export const CHAVE_ANTECEDENCIA_INTERNA = "agenda.encaixe_interno.antecedencia_minutos";
export const ANTECEDENCIA_INTERNA_PADRAO_MIN = 5;
export const ANTECEDENCIA_INTERNA_MAX_MIN = 1440;
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 480;
const JANELA_DUPLICIDADE_SEGUNDOS = 120;
const DIAS_PARA_PROXIMO_LIVRE = 14;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hhmmOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const dataValida = (date: string) => {
  if (!ISO_DATE.test(date)) return false;
  const v = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(v.getTime()) && v.toISOString().slice(0, 10) === date;
};
const somarDias = (date: string, dias: number) => {
  const v = new Date(`${date}T12:00:00Z`);
  v.setUTCDate(v.getUTCDate() + dias);
  return v.toISOString().slice(0, 10);
};

/** Antecedência interna em minutos: configurada pelo CEO ou o padrão sugerido (5). Valor gravado inválido = erro explícito. */
export async function lerAntecedenciaInterna(): Promise<{ minutos: number; configurada: boolean }> {
  const guardado = await getJsonSetting<unknown>(CHAVE_ANTECEDENCIA_INTERNA);
  if (guardado == null) return { minutos: ANTECEDENCIA_INTERNA_PADRAO_MIN, configurada: false };
  if (typeof guardado !== "number" || !Number.isInteger(guardado) || guardado < 0 || guardado > ANTECEDENCIA_INTERNA_MAX_MIN) {
    throw new Error(`Configuração inválida de antecedência interna do encaixe (${CHAVE_ANTECEDENCIA_INTERNA}).`);
  }
  return { minutos: guardado, configurada: true };
}

export type CodigoMotivo =
  | "ocupado" | "passado" | "antecedencia" | "compromisso" | "integracao" | "profissional" | "cliente" | "intervalo";

export interface EncaixeSlot {
  time: string;
  state: "aberto" | "bloqueado" | "ocupado";
  reason: CodigoMotivo | null;
  /** Explicação pronta em português; é a mesma que a confirmação devolve quando recusa. */
  message: string | null;
}

export function mensagemDoMotivo(codigo: CodigoMotivo, leadMinutes: number, detalhe?: string): string {
  switch (codigo) {
    case "ocupado": return "Horário já ocupado nesta agenda.";
    case "passado": return "O horário já passou.";
    case "antecedencia":
      return `Falta menos de ${leadMinutes} minuto${leadMinutes === 1 ? "" : "s"} para este horário (antecedência interna do encaixe).`;
    case "compromisso": return "Há um compromisso (Google ou agenda pessoal) sobreposto a este horário.";
    case "integracao":
      return "A agenda Google não foi atualizada há pouco: a disponibilidade não pode ser garantida agora.";
    case "profissional": return "O profissional já tem outra marcação neste horário, em outra agenda.";
    case "cliente": return "O cliente já tem outra marcação que se sobrepõe a este horário.";
    case "intervalo": return detalhe ?? "O trecho inteiro da consulta não está livre.";
  }
}

export interface AvaliacaoEncaixe {
  resource: typeof agendaResourcesTable.$inferSelect;
  leadMinutes: number;
  agora: string;
  /** excecao | sem-expediente | sincronizacao-pendente | null */
  motivoDia: string | null;
  integracaoAtualizada: boolean;
  clienteVerificado: boolean;
  durationMinutes: number;
  slotMinutes: number;
  slots: EncaixeSlot[];
}

/**
 * Decisão ÚNICA do encaixe para um dia: para cada horário de início, a consulta de `durationMinutes` cabe? O trecho
 * inteiro precisa estar livre (todos os períodos da agenda cobertos), sem sobrepor agenda, profissional (em QUALQUER
 * agenda) ou cliente, sem compromisso do Google e com a integração atualizada. Passado e expediente valem sempre.
 */
export async function avaliarEncaixeDoDia(
  p: { resourceId: number; date: string; durationMinutes: number; clientId: number | null },
  executor: AgendaExecutor,
  leadMinutes: number,
): Promise<AvaliacaoEncaixe | null> {
  const computed = await computeResourceSlots(p.resourceId, p.date, null, executor, undefined, { encaixeInterno: { leadMinutes } });
  if (!computed) return null;
  const { resource, result } = computed;
  const slotMinutes = resource.slotMinutes;
  const sessoes = await listarSessoesCandidatas(executor, {
    date: p.date, slotMinutes, resourceId: resource.id, professionalId: resource.professionalId, clientId: p.clientId,
  });
  const porHorario = new Map(result.slots.map((s) => [s.time, s]));
  const periodos = Math.max(1, Math.ceil(p.durationMinutes / slotMinutes));

  const slots: EncaixeSlot[] = result.slots.map((s): EncaixeSlot => {
    const ini = toMinutes(s.time);
    const falha = (reason: CodigoMotivo, detalhe?: string): EncaixeSlot => ({
      time: s.time, state: reason === "ocupado" ? "ocupado" : "bloqueado", reason, message: mensagemDoMotivo(reason, leadMinutes, detalhe),
    });
    if (s.state === "ocupado") return falha("ocupado");
    if (s.state === "bloqueado") {
      if (s.reason === "compromisso") {
        // Sessão do MESMO profissional em outra agenda aparece como compromisso no motor; aqui ganha o motivo certo.
        const fim = ini + slotMinutes;
        const outraAgenda = sessoes.some((o) => o.resourceId !== resource.id && resource.professionalId != null
          && o.agendaProfessional === resource.professionalId
          && ini < toMinutes(o.scheduledTime) + o.duration && fim > toMinutes(o.scheduledTime));
        return falha(outraAgenda ? "profissional" : "compromisso");
      }
      return falha((s.reason ?? "integracao") as CodigoMotivo);
    }
    for (let i = 1; i < periodos; i++) {
      const t = hhmmOf(ini + i * slotMinutes);
      const prox = porHorario.get(t);
      if (!prox) return falha("intervalo", `A consulta de ${p.durationMinutes} minutos passa do fim do expediente ou entra numa pausa da agenda (não há período às ${t}).`);
      if (prox.state !== "aberto") {
        const motivo: CodigoMotivo = prox.state === "ocupado" ? "ocupado" : ((prox.reason ?? "integracao") as CodigoMotivo);
        return falha("intervalo", `A consulta de ${p.durationMinutes} minutos precisa de horários seguidos e o das ${t} não está livre: ${mensagemDoMotivo(motivo === "intervalo" ? "compromisso" : motivo, leadMinutes).replace(/\.$/, "").toLowerCase()}.`);
      }
    }
    const conflito = classificarSobreposicao(sessoes, {
      start: ini, end: ini + p.durationMinutes, resourceId: resource.id,
      professionalId: resource.professionalId, clientId: p.clientId,
    });
    if (conflito) return falha(conflito.tipo === "agenda" ? "ocupado" : conflito.tipo);
    return { time: s.time, state: "aberto", reason: null, message: null };
  });

  return {
    resource, leadMinutes, agora: new Date().toISOString(), motivoDia: result.reason,
    integracaoAtualizada: computed.integracaoAtualizada, clienteVerificado: p.clientId != null,
    durationMinutes: p.durationMinutes, slotMinutes, slots,
  };
}

export interface Alternativas {
  /** Até 3 inícios livres no mesmo dia, os mais próximos do horário pedido (ou os primeiros do dia). */
  mesmoDia: string[];
  /** Primeiro início livre nos próximos dias, quando o dia não tem nenhum. */
  proximoDia: { date: string; time: string } | null;
}

export async function sugerirAlternativas(
  av: AvaliacaoEncaixe,
  p: { resourceId: number; date: string; time?: string; clientId: number | null },
  executor: AgendaExecutor,
): Promise<Alternativas> {
  const livres = av.slots.filter((s) => s.state === "aberto").map((s) => s.time);
  const ref = p.time ? toMinutes(p.time) : -1;
  const mesmoDia = [...livres]
    .sort((a, b) => (Math.abs(toMinutes(a) - ref) - Math.abs(toMinutes(b) - ref)) || (toMinutes(a) - toMinutes(b)))
    .slice(0, 3)
    .sort();
  if (livres.length > 0) return { mesmoDia, proximoDia: null };
  for (let i = 1; i <= DIAS_PARA_PROXIMO_LIVRE; i++) {
    const date = somarDias(p.date, i);
    const dia = await avaliarEncaixeDoDia({ resourceId: p.resourceId, date, durationMinutes: av.durationMinutes, clientId: p.clientId }, executor, av.leadMinutes);
    const primeiro = dia?.slots.find((s) => s.state === "aberto");
    if (primeiro) return { mesmoDia: [], proximoDia: { date, time: primeiro.time } };
  }
  return { mesmoDia: [], proximoDia: null };
}

export type EncaixeResultado =
  | { ok: true; status: 200 | 201; session: Session; duplicada: boolean; googleEventId: string | null; googleSyncWarning?: string }
  | { ok: false; status: number; error: string; codigo?: CodigoMotivo | "fora-expediente"; alternativas?: Alternativas };

export interface EncaixeParams {
  resourceId: number;
  clientId: number;
  date: string;
  time: string;
  durationMinutes: number;
  empresaId: number;
  syncGoogle?: boolean;
}

type DecisaoLocked =
  | { ok: true; session: Session; duplicada: boolean }
  | { ok: false; status: number; error: string; codigo?: CodigoMotivo | "fora-expediente" };


const DETALHE_AO_VIVO = {
  conta: "A conta Google da clínica não foi confirmada.",
  falha: "A leitura do Google Agenda falhou agora.",
  prazo: "O Google Agenda não respondeu a tempo.",
  ocupado: "Outra atualização do Google Agenda ainda estava em andamento.",
} as const;

/**
 * Lê agora o Google dos locais que entram na ocupação desta agenda (agenda, pessoais do profissional e outras agendas
 * dele). Agenda inexistente ou de outra clínica não dispara leitura: a transação responde 404 como sempre.
 */
async function conferirGoogleAoVivo(resourceId: number, empresaId: number): Promise<{ ok: true } | { ok: false; detalhe: string }> {
  const r = await db.execute(sql`SELECT r.id, r.professional_id, r.location_id, COALESCE(r.empresa_id, l.empresa_id) AS empresa_id
    FROM agenda_resources r LEFT JOIN locations l ON l.id=r.location_id WHERE r.id=${resourceId}`);
  const linha = r.rows[0];
  if (!linha || Number(linha.empresa_id) !== empresaId) return { ok: true };
  const fontes = await fontesGoogleDaAgenda({
    id: Number(linha.id), professionalId: linha.professional_id == null ? null : Number(linha.professional_id),
    locationId: linha.location_id == null ? null : Number(linha.location_id), empresaId,
  }, db);
  const inicio = Date.now();
  const vivo = await atualizarLocaisAoVivo(fontes.filter((f) => f.googleCalendarId).map((f) => f.id));
  logger.info({ resourceId, locais: fontes.length, ms: Date.now() - inicio, resultado: vivo.ok ? "ok" : vivo.motivo },
    "encaixe interno: conferência do Google ao vivo");
  return vivo.ok ? { ok: true } : { ok: false, detalhe: DETALHE_AO_VIVO[vivo.motivo] };
}

/**
 * Confirma o encaixe sob as travas de clínica, profissional e cliente, relendo TUDO (expediente, ocupação, compromissos,
 * frescor do Google e sessões) com a mesma decisão do seletor. Requisição idêntica repetida (duplo clique, nova
 * tentativa) devolve a marcação que já existe em vez de um erro enganoso.
 */
export async function encaixarConsultaAvulsa(p: EncaixeParams): Promise<EncaixeResultado> {
  if (!dataValida(p.date)) return { ok: false, status: 400, error: "Data inválida" };
  if (!HHMM.test(p.time)) return { ok: false, status: 400, error: "horário inválido (HH:mm)" };
  if (!Number.isInteger(p.durationMinutes) || p.durationMinutes < DURACAO_MIN || p.durationMinutes > DURACAO_MAX) {
    return { ok: false, status: 400, error: `Duração inválida: informe minutos inteiros de ${DURACAO_MIN} a ${DURACAO_MAX}.` };
  }
  const { minutos: lead } = await lerAntecedenciaInterna();

  // Conferência ao vivo do Google ANTES das travas (a leitura usa rede e não pode segurar travas da clínica). Na dúvida
  // a marcação é recusada: nunca promete disponibilidade com a cópia local possivelmente velha.
  const aoVivo = await conferirGoogleAoVivo(p.resourceId, p.empresaId);
  if (!aoVivo.ok) {
    return { ok: false, status: 409, codigo: "integracao",
      error: `${mensagemDoMotivo("integracao", lead)} ${aoVivo.detalhe} Nada foi agendado.` };
  }

  const decisao = await db.transaction(async (tx): Promise<DecisaoLocked> => {
    const empresaId = await lockAgendaResource(tx, p.resourceId);
    if (!empresaId || empresaId !== p.empresaId) return { ok: false, status: 404, error: "Agenda não encontrada" };
    await lockAgendaParticipants(tx, p.resourceId, p.clientId);

    const [client] = await tx.select().from(clientsTable).where(and(eq(clientsTable.id, p.clientId)));
    if (!client || client.empresaId !== p.empresaId) return { ok: false, status: 404, error: "Cliente não encontrado" };

    const dup = await tx.execute(sql`SELECT id FROM sessions
      WHERE client_id=${p.clientId} AND resource_id=${p.resourceId} AND scheduled_date=${p.date} AND scheduled_time=${p.time}
        AND duration_minutes=${p.durationMinutes} AND protocol_id IS NULL AND empresa_id=${p.empresaId}
        AND status IN ('scheduled','confirmed') AND NOT agenda_archived
        AND created_at > now() - make_interval(secs => ${JANELA_DUPLICIDADE_SEGUNDOS})
      ORDER BY id LIMIT 1`);
    if (dup.rows[0]) {
      const [existente] = await tx.select().from(sessionsTable).where(eq(sessionsTable.id, Number(dup.rows[0].id)));
      return { ok: true, session: existente, duplicada: true };
    }

    const av = await avaliarEncaixeDoDia(
      { resourceId: p.resourceId, date: p.date, durationMinutes: p.durationMinutes, clientId: p.clientId }, tx, lead);
    if (!av) return { ok: false, status: 404, error: "Agenda não encontrada" };
    if (!RESERVABLE_KINDS.has(av.resource.kind)) {
      return { ok: false, status: 422, error: "Esta agenda é de uma categoria profissional sem reserva de procedimento habilitada. Nada foi agendado." };
    }
    const slot = av.slots.find((s) => s.time === p.time);
    if (!slot) {
      return { ok: false, status: 409, codigo: "fora-expediente",
        error: av.motivoDia === "excecao" ? "A agenda está fechada neste dia (feriado ou bloqueio)."
          : "Horário fora do expediente desta agenda." };
    }
    if (slot.state !== "aberto") {
      return { ok: false, status: 409, codigo: slot.reason ?? undefined, error: slot.message ?? "Horário indisponível." };
    }
    const session = await gravarSessaoAvulsa(tx, {
      resource: av.resource, clientId: p.clientId, date: p.date, time: p.time,
      durationMinutes: p.durationMinutes, empresaId: p.empresaId,
    });
    return { ok: true, session, duplicada: false };
  });

  if (!decisao.ok) {
    // Alternativas lidas FORA da transação e das travas: só orientam, a confirmação seguinte decide de novo.
    let alternativas: Alternativas | undefined;
    if (decisao.status === 409) {
      const av = await avaliarEncaixeDoDia(
        { resourceId: p.resourceId, date: p.date, durationMinutes: p.durationMinutes, clientId: p.clientId }, db, lead);
      if (av) alternativas = await sugerirAlternativas(av, { resourceId: p.resourceId, date: p.date, time: p.time, clientId: p.clientId }, db);
    }
    return { ...decisao, alternativas };
  }
  if (decisao.duplicada) {
    return { ok: true, status: 200, session: decisao.session, duplicada: true, googleEventId: decisao.session.googleEventId ?? null };
  }
  // O Google só é chamado DEPOIS de a marcação estar gravada (fora da transação); falha nunca desfaz a marcação.
  if (!p.syncGoogle) return { ok: true, status: 201, session: decisao.session, duplicada: false, googleEventId: null };
  const sync = await syncBookedSession(decisao.session.id, p.empresaId);
  const [fresca] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, decisao.session.id));
  return {
    ok: true, status: 201, session: fresca ?? decisao.session, duplicada: false,
    googleEventId: sync.eventId, googleSyncWarning: sync.warning,
  };
}
