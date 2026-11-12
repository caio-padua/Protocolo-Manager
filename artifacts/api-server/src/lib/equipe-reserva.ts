import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { computeResourceSlots } from "./agenda-booking.js";
import type { AgendaExecutor } from "./agenda-occupancy";
import { brtISODate } from "./brt.js";
import { carregarCategorias } from "./agenda-recurso-categoria.js";
import { condicaoCorpoClinico } from "./corpo-clinico.js";
import {
  MAX_PARTICIPANTES, escolherAtribuicao, horariosDaEquipe, iniciosComDuracaoAberta,
  type Candidato, type Necessidade,
} from "./equipe-reserva-planejador";
import { existeCombinacaoDistinta } from "../../../../lib/procedimentos-shared/src/index";

/**
 * Um participante é UMA pessoa necessária. `categoryId` é a categoria principal e `alternativeCategoryIds` as
 * categorias alternativas da MESMA necessidade (ex.: médico OU biomédico: atende um, não os dois). Equipe conjunta
 * (duas pessoas) = dois participantes. `professionalIds` é a lista configurável de quem está habilitado.
 * O sistema não decide habilitação profissional por categoria: quem configura é a clínica.
 */
export type Modalidade = "local" | "online" | "externo" | "home_care";
export const MODALIDADES: readonly Modalidade[] = ["local", "online", "externo", "home_care"];
/** Home Care atende no endereço do paciente (ou outro endereço domiciliar da visita): não tem local fixo nem exige vínculo com local. */
export const modalidadeSemLocalFixo = (m: string | null | undefined) => m === "home_care";
export type Participante = {
  categoryId: number; alternativeCategoryIds?: number[]; locationId?: number | null; professionalIds?: number[];
  /** Forma do atendimento: local = Sede da empresa (padrão), online ou externo. Nunca se mistura entre formas. */
  modalidade?: Modalidade;
  /** Agenda escolhida (sugerida ou pelo prescritor). Sem ela, várias agendas igualmente elegíveis = escolha pendente. */
  agendaId?: number | null;
  /** Requisito de nível: "enfermeiro" só aceita quem tem esse nível GRAVADO (técnica de enfermagem não satisfaz). */
  exigeNivel?: "enfermeiro" | null;
};
export const categoriasDoParticipante = (p: Participante): number[] =>
  [...new Set([p.categoryId, ...(p.alternativeCategoryIds ?? [])])];

export class EquipeErro extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 422 | 503, message: string, readonly code = "equipe_invalida",
    readonly detalhes?: Record<string, unknown>) {
    super(message);
  }
}
export type OpcaoAgenda = { id: number; nome: string; modalidade: string; professionalId: number | null; categoryId: number };

type Executor = AgendaExecutor;
type RecursoInfo = { id: number; slotMinutes: number; modality: string; name: string; locationName: string; categoryId: number };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_DIAS_BUSCA = 31;

export function dataValida(value: string): boolean {
  const parsed = new Date(`${value}T12:00:00Z`);
  return ISO_DATE.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function datasEntre(from: string, to: string): string[] {
  if (!dataValida(from) || !dataValida(to) || to < from) throw new EquipeErro(400, "Período inválido.", "periodo_invalido");
  const dias = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  if (dias > MAX_DIAS_BUSCA) throw new EquipeErro(400, `Consulte no máximo ${MAX_DIAS_BUSCA} dias por vez.`, "periodo_longo");
  return Array.from({ length: dias }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
}

/**
 * Valida a equipe e encontra, para cada participante, as agendas candidatas da clínica.
 * Nada é presumido por nome: só conta agenda com categoria GRAVADA igual à do participante.
 */
export async function validarParticipantes(executor: Executor, empresaId: number, participantes: Participante[]) {
  if (participantes.length < 1 || participantes.length > MAX_PARTICIPANTES) {
    throw new EquipeErro(422, `A equipe deve ter de 1 a ${MAX_PARTICIPANTES} participantes.`, "equipe_tamanho");
  }
  const categorias = await carregarCategorias(executor);
  const grupos: number[][] = [];
  for (const p of participantes) {
    const ids = p.professionalIds ?? [];
    const alternativas = p.alternativeCategoryIds ?? [];
    if (!Number.isSafeInteger(p.categoryId) || new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id)) ||
        alternativas.some((id) => !Number.isSafeInteger(id)) || new Set(alternativas).size !== alternativas.length ||
        alternativas.includes(p.categoryId)) {
      throw new EquipeErro(400, "Confira a equipe: categoria inválida, repetida ou profissional repetido.", "equipe_invalida");
    }
    const cats = categoriasDoParticipante(p);
    const nomes: string[] = [];
    for (const catId of cats) {
      const categoria = categorias.find((c) => c.id === catId);
      if (!categoria || !categoria.active) throw new EquipeErro(404, "Categoria profissional não encontrada ou inativa.", "categoria_invalida");
      nomes.push(categoria.name);
    }
    if (p.modalidade !== undefined && !MODALIDADES.includes(p.modalidade)) {
      throw new EquipeErro(400, "Modalidade inválida: use local (Sede), online, externo (Local externo) ou home_care.", "modalidade_invalida");
    }
    if (p.agendaId != null) {
      const ag = await executor.execute(sql`SELECT r.category_id, r.modality FROM agenda_resources r
        LEFT JOIN locations l ON l.id=r.location_id
        WHERE r.id=${p.agendaId} AND r.active AND COALESCE(r.empresa_id, l.empresa_id)=${empresaId}`);
      const a = ag.rows[0];
      if (!a) throw new EquipeErro(404, "Agenda não encontrada nesta clínica.", "agenda_invalida");
      if (!cats.includes(Number(a.category_id)) || String(a.modality) !== (p.modalidade ?? "local")) {
        throw new EquipeErro(409, "A agenda escolhida não é da categoria ou da forma de atendimento deste participante.", "agenda_incompativel");
      }
    }
    if (p.locationId != null) {
      const loc = await executor.execute(sql`SELECT 1 FROM locations WHERE id=${p.locationId} AND active='true' AND empresa_id=${empresaId}`);
      if (!loc.rows.length) throw new EquipeErro(404, "Local não encontrado nesta clínica.", "local_invalido");
    }
    if (ids.length) {
      const okRows = await executor.execute(sql`SELECT p.id FROM professionals p
        WHERE p.id = ANY(${`{${ids.join(",")}}`}::int[]) AND p.active AND p.area_id = ANY(${`{${cats.join(",")}}`}::int[])
          AND ${condicaoCorpoClinico(empresaId)}
          AND (${p.exigeNivel ?? null}::text IS NULL OR p.habilitacao_nivel = ${p.exigeNivel ?? null})`);
      if (okRows.rows.length !== ids.length) {
        if (p.exigeNivel === "enfermeiro") {
          throw new EquipeErro(409, "Este requisito exige enfermeiro(a) com habilitação registrada. Técnica ou técnico de enfermagem, ou cadastro sem nível informado, não satisfaz.", "nivel_exigido_nao_atendido");
        }
        throw new EquipeErro(409, `Algum profissional não está ativo, não é de uma das categorias (${nomes.join(" ou ")}) ou não pertence a esta clínica.`, "profissional_incompativel");
      }
      grupos.push(ids);
    }
  }
  if (grupos.length && !existeCombinacaoDistinta(grupos)) {
    throw new EquipeErro(409, "As alternativas escolhidas não permitem profissionais diferentes em cada participante.", "equipe_sem_combinacao");
  }
  return categorias;
}

export async function resolverNecessidades(executor: Executor, empresaId: number, participantes: Participante[]) {
  const categorias = await validarParticipantes(executor, empresaId, participantes);
  const recursos = new Map<number, RecursoInfo>();
  const necessidades: Necessidade[] = [];
  for (let i = 0; i < participantes.length; i++) {
    const p = participantes[i];
    const ids = p.professionalIds ?? [];
    const cats = categoriasDoParticipante(p);
    const nomes = cats.map((id) => categorias.find((c) => c.id === id)!.name).join(" ou ");
    // Agenda nova não tem registro de local: vale pela clínica gravada nela. O filtro de local do procedimento
    // só restringe agendas que têm local ligado (legado).
    const rows = await executor.execute(sql`SELECT r.id, r.name, r.professional_id, r.location_id, r.sort_order, r.slot_minutes, r.modality,
        r.category_id, COALESCE(l.name, r.name) AS location_name, pr.active AS prof_active, pr.area_id AS prof_area,
        (pr.id IS NOT NULL AND ${condicaoCorpoClinico(empresaId, "pr")}) AS prof_da_clinica
      FROM agenda_resources r
      LEFT JOIN locations l ON l.id=r.location_id
      LEFT JOIN professionals pr ON pr.id=r.professional_id
      WHERE r.active AND r.category_id = ANY(${`{${cats.join(",")}}`}::int[])
        AND COALESCE(r.empresa_id, l.empresa_id)=${empresaId}
        AND (r.location_id IS NULL OR l.active='true')
        AND (${p.locationId ?? null}::int IS NULL OR r.location_id IS NULL OR r.location_id=${p.locationId ?? null})
        AND r.modality=${p.modalidade ?? "local"}
        AND (${p.agendaId ?? null}::int IS NULL OR r.id=${p.agendaId ?? null})`);
    const candidatos: Candidato[] = [];
    const compartilhadas = rows.rows.filter((r) => r.professional_id == null);
    const vinculos = ids.length && compartilhadas.length
      ? await executor.execute(sql`SELECT professional_id, location_id FROM location_professionals
          WHERE professional_id = ANY(${`{${ids.join(",")}}`}::int[])`)
      : { rows: [] as any[] };
    for (const r of rows.rows) {
      const info: RecursoInfo = { id: Number(r.id), slotMinutes: Number(r.slot_minutes), modality: String(r.modality),
        name: String(r.name), locationName: String(r.location_name), categoryId: Number(r.category_id) };
      const base = { resourceId: info.id, locationId: r.location_id == null ? null : Number(r.location_id),
        sortOrder: Number(r.sort_order), categoryId: info.categoryId };
      if (r.professional_id != null) {
        const prof = Number(r.professional_id);
        // Vínculo incoerente (inativo, de outra clínica ou de outra categoria): nunca reservar.
        if (r.prof_active !== true || r.prof_da_clinica !== true || Number(r.prof_area) !== info.categoryId) continue;
        if (ids.length && !ids.includes(prof)) continue;
        candidatos.push({ ...base, professionalId: prof });
      } else if (!ids.length) {
        candidatos.push({ ...base, professionalId: null });
      } else {
        for (const id of ids) {
          // Home Care e agenda sem local não dependem de vínculo legado com local: a elegibilidade do profissional
          // (ativo, da clínica e da categoria) já foi conferida em validarParticipantes.
          const semVinculoLegado = modalidadeSemLocalFixo(info.modality) || base.locationId == null;
          if (semVinculoLegado || vinculos.rows.some((v) => Number(v.professional_id) === id && Number(v.location_id) === base.locationId)) {
            candidatos.push({ ...base, professionalId: id });
          }
        }
      }
      if (candidatos.some((c) => c.resourceId === info.id)) recursos.set(info.id, info);
    }
    if (!candidatos.length) {
      throw new EquipeErro(422,
        `Não há agenda ativa da categoria ${nomes} com o profissional e o local pedidos. Nada foi agendado.`,
        "sem_agenda_da_categoria");
    }
    // Várias agendas igualmente elegíveis NÃO se resolvem pela ordem de exibição: a escolha fica pendente.
    const distintas = [...new Set(candidatos.map((c) => c.resourceId))];
    if (distintas.length > 1 && p.agendaId == null) {
      const opcoes: OpcaoAgenda[] = distintas.map((id) => {
        const info = recursos.get(id)!;
        const doRecurso = rows.rows.find((r) => Number(r.id) === id);
        return { id, nome: info.name, modalidade: info.modality, categoryId: info.categoryId,
          professionalId: doRecurso?.professional_id == null ? null : Number(doRecurso.professional_id) };
      });
      throw new EquipeErro(409,
        `Há ${distintas.length} agendas igualmente possíveis para ${nomes} (${p.modalidade ?? "local"}). Escolha a agenda; o sistema não decide pela ordem de exibição.`,
        "escolha_agenda_pendente", { participanteOrdem: i + 1, categoryIds: cats, modalidade: p.modalidade ?? "local", opcoes });
    }
    necessidades.push({ ordem: i + 1, categoryId: p.categoryId, candidatos });
  }
  return { necessidades, recursos };
}

async function iniciosDoDia(
  executor: Executor, recursos: Map<number, RecursoInfo>, date: string, duracaoMinutos: number, semAntecedencia = false,
): Promise<Map<number, Set<string>>> {
  const inicios = new Map<number, Set<string>>();
  for (const recurso of recursos.values()) {
    const computed = await computeResourceSlots(recurso.id, date, null, executor, undefined, { semAntecedencia });
    inicios.set(recurso.id, computed
      ? iniciosComDuracaoAberta(computed.result.slots, recurso.slotMinutes, duracaoMinutos) : new Set());
  }
  return inicios;
}

/** Leitura (nada é gravado): horários em que a equipe inteira cabe, com as agendas escolhidas. */
export async function buscarHorariosDaEquipe(params: {
  empresaId: number; participantes: Participante[]; duracaoSegundos: number; from: string; to: string; executor?: Executor;
  semAntecedencia?: boolean;
}) {
  const executor = params.executor ?? db;
  const datas = datasEntre(params.from, params.to);
  const duracaoMinutos = params.duracaoSegundos / 60;
  const { necessidades, recursos } = await resolverNecessidades(executor, params.empresaId, params.participantes);
  const hoje = brtISODate();
  const dias: { date: string; horarios: { time: string; participantes: any[] }[] }[] = [];
  for (const date of datas) {
    if (date < hoje) continue;
    const inicios = await iniciosDoDia(executor, recursos, date, duracaoMinutos, params.semAntecedencia === true);
    const horarios = horariosDaEquipe(necessidades, inicios).map((h) => ({
      time: h.time,
      participantes: h.atribuicao.map((a) => ({
        ordem: a.ordem, categoryId: a.categoryId, resourceId: a.resourceId, professionalId: a.professionalId,
        locationId: a.locationId, agenda: recursos.get(a.resourceId)!.name,
      })),
    }));
    dias.push({ date, horarios });
  }
  return dias;
}

/**
 * Reserva transacional de UMA ocorrência: todas as agendas da equipe ou nenhuma.
 * Relê a disponibilidade dentro do bloqueio da clínica antes de gravar.
 */
type ReservaParams = {
  empresaId: number; protocoloProcedimentoId: number; numero: number; date: string; time: string; criadoPor: number | null;
  /** Só o encaixe no término da consulta (marcado pelo servidor no plano) dispensa a antecedência mínima. */
  semAntecedencia?: boolean;
};
export async function reservarOcorrencia(params: ReservaParams) {
  if (!dataValida(params.date) || !HHMM.test(params.time)) throw new EquipeErro(400, "Data ou horário inválido.", "data_invalida");
  if (params.date < brtISODate()) throw new EquipeErro(422, "Não é possível reservar em data passada.", "data_passada");
  return db.transaction((tx) => reservarOcorrenciaTx(tx, params));
}

/** Mesma reserva, dentro de uma transação já aberta (o plano do Pit Stop reserva todas as ocorrências ou nenhuma). */
export async function reservarOcorrenciaTx(tx: Executor, params: ReservaParams) {
  if (!dataValida(params.date) || !HHMM.test(params.time)) throw new EquipeErro(400, "Data ou horário inválido.", "data_invalida");
  if (params.date < brtISODate()) throw new EquipeErro(422, "Não é possível reservar em data passada.", "data_passada");
  {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${params.empresaId})`);
    const itens = await tx.execute(sql`SELECT pp.id, pp.protocol_id, pp.duracao_segundos, pp.total_sessoes, pp.nome_snapshot,
        p.client_id, c.status AS client_status, c.empresa_id AS client_empresa, c.clinica_origem_empresa_id AS client_origem
      FROM protocolo_procedimentos pp
      JOIN protocols p ON p.id=pp.protocol_id AND p.empresa_id=pp.empresa_id
      JOIN clients c ON c.id=p.client_id
      WHERE pp.id=${params.protocoloProcedimentoId} AND pp.empresa_id=${params.empresaId} AND pp.status='ativo' FOR UPDATE OF pp`);
    const item = itens.rows[0];
    if (!item) throw new EquipeErro(404, "Procedimento do protocolo não encontrado nesta clínica.", "item_nao_encontrado");
    if (item.client_status !== "active" || Number(item.client_empresa) !== params.empresaId ||
        Number(item.client_origem) !== params.empresaId) {
      throw new EquipeErro(403, "O cliente não pertence a esta clínica ou está inativo.", "cliente_invalido");
    }
    if (!Number.isInteger(params.numero) || params.numero < 1 || params.numero > Number(item.total_sessoes)) {
      throw new EquipeErro(400, `Informe a ocorrência de 1 a ${item.total_sessoes}.`, "numero_invalido");
    }
    const ja = await tx.execute(sql`SELECT 1 FROM protocolo_ocorrencias
      WHERE protocolo_procedimento_id=${item.id} AND numero=${params.numero} AND status='reservada'`);
    if (ja.rows.length) throw new EquipeErro(409, "Esta ocorrência já está reservada.", "ocorrencia_ja_reservada");
    const conflitoCliente = await tx.execute(sql`SELECT 1 FROM sessions WHERE client_id=${item.client_id}
      AND scheduled_date=${params.date} AND scheduled_time=${params.time}
      AND status IN ('scheduled','confirmed') AND NOT agenda_archived LIMIT 1`);
    if (conflitoCliente.rows.length) throw new EquipeErro(409, "O cliente já tem uma visita neste horário.", "cliente_ocupado");

    const equipe = await tx.execute(sql`SELECT ordem, category_id, alternative_category_ids, location_id, professional_ids,
        modalidade, agenda_id, exige_nivel FROM protocolo_procedimento_equipe WHERE protocolo_procedimento_id=${item.id} ORDER BY ordem`);
    const participantes = equipe.rows.map(participanteDaLinha);
    const { necessidades, recursos } = await resolverNecessidades(tx, params.empresaId, participantes);
    const duracaoMinutos = Number(item.duracao_segundos) / 60;
    const inicios = await iniciosDoDia(tx, recursos, params.date, duracaoMinutos, params.semAntecedencia === true);
    const atribuicao = escolherAtribuicao(necessidades, inicios, params.time);
    if (!atribuicao) {
      throw new EquipeErro(409, "Este horário não está livre para a equipe completa. Nada foi reservado.", "horario_indisponivel");
    }

    const [ocorrencia] = (await tx.execute(sql`INSERT INTO protocolo_ocorrencias
      (empresa_id, protocolo_procedimento_id, client_id, numero, scheduled_date, scheduled_time, duracao_segundos)
      VALUES (${params.empresaId}, ${item.id}, ${item.client_id}, ${params.numero}, ${params.date}, ${params.time}, ${item.duracao_segundos})
      RETURNING id`)).rows;
    const duracaoGravada = Math.ceil(duracaoMinutos);
    const gravados: { ordem: number; resourceId: number; professionalId: number | null; sessionId: number }[] = [];
    for (const a of atribuicao) {
      const recurso = recursos.get(a.resourceId)!;
      const [sessao] = (await tx.execute(sql`INSERT INTO sessions
        (protocol_id, client_id, professional_id, scheduled_date, scheduled_time, status, unit, service_type,
         week_number, empresa_id, resource_id, duration_minutes)
        VALUES (${item.protocol_id}, ${item.client_id}, ${a.professionalId}, ${params.date}, ${params.time}, 'scheduled',
          ${recurso.locationName}, ${recurso.modality === "domiciliar" || recurso.modality === "home_care" ? "home" : "clinic"},
          ${params.numero}, ${params.empresaId}, ${a.resourceId}, ${duracaoGravada}) RETURNING id`)).rows;
      await tx.execute(sql`INSERT INTO protocolo_ocorrencia_participantes
        (ocorrencia_id, ordem, category_id, professional_id, resource_id, session_id)
        VALUES (${ocorrencia.id}, ${a.ordem}, ${a.categoryId}, ${a.professionalId}, ${a.resourceId}, ${sessao.id})`);
      gravados.push({ ordem: a.ordem, resourceId: a.resourceId, professionalId: a.professionalId, sessionId: Number(sessao.id) });
    }
    return { ocorrenciaId: Number(ocorrencia.id), numero: params.numero, date: params.date, time: params.time, participantes: gravados };
  }
}

/** Linha de protocolo_procedimento_equipe -> participante (um só lugar: reserva, busca e plano leem igual). */
export function participanteDaLinha(e: Record<string, unknown>): Participante {
  return {
    categoryId: Number(e.category_id), alternativeCategoryIds: ((e.alternative_category_ids as number[] | null) ?? []).map(Number),
    locationId: e.location_id == null ? null : Number(e.location_id),
    professionalIds: ((e.professional_ids as number[] | null) ?? []).map(Number),
    modalidade: (e.modalidade as Modalidade | undefined) ?? "local",
    agendaId: e.agenda_id == null ? null : Number(e.agenda_id),
    exigeNivel: e.exige_nivel === "enfermeiro" ? "enfermeiro" : null,
  };
}
