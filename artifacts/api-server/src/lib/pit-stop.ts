import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { AgendaExecutor } from "./agenda-occupancy";
import { brtISODate } from "./brt.js";
import { condicaoCorpoClinico } from "./corpo-clinico.js";
import {
  EquipeErro, MAX_DIAS_BUSCA, buscarHorariosDaEquipe, dataValida, participanteDaLinha, reservarOcorrenciaTx,
  resolverNecessidades, type Participante,
} from "./equipe-reserva.js";
import {
  estruturaDisponivel, incluirProcedimentoTx, validarEquipeDoProcedimento, type EntradaItem,
} from "./protocolo-procedimentos-store.js";

/**
 * PIT STOP: o plano de agendamento compartilhado entre o médico (prescritor) e a recepção/enfermagem.
 * Um plano vivo por protocolo; nada é reservado até a confirmação explícita (todas as ocorrências ou nenhuma).
 */
type Tx = AgendaExecutor;
export const REVISAO_MINUTOS = 15;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const BUSCA_MAX_JANELAS = 6;

export async function estruturaPitStopDisponivel(): Promise<boolean> {
  if (!(await estruturaDisponivel())) return false;
  const r = await db.execute(sql`SELECT to_regclass('agendamento_planos') IS NOT NULL
    AND to_regclass('agendamento_plano_ocorrencias') IS NOT NULL AS ok`);
  return r.rows[0]?.ok === true;
}

/** Usado pelo Caminho A (agenda por protocolo legado): se existe plano vivo, o Caminho A não pode reservar de novo. */
export async function protocoloTemPlanoVivo(protocolId: number): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass('agendamento_planos') IS NOT NULL AS ok`);
  if (r.rows[0]?.ok !== true) return false;
  const v = await db.execute(sql`SELECT 1 FROM agendamento_planos WHERE protocol_id=${protocolId}
    AND estado IN ('pendente','em_revisao','confirmado') LIMIT 1`);
  return v.rows.length > 0;
}

const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const minutos = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// ───────────────────────── criação ─────────────────────────

export type CriarPlanoParams = {
  empresaId: number; protocolId: number; clientId: number; prescritorId: number; criadoPor: number;
  procedimentos: EntradaItem[]; assumir?: boolean;
};

export async function criarPlano(p: CriarPlanoParams): Promise<number> {
  const planoId = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19872027, ${p.protocolId})`);
    const vivo = await tx.execute(sql`SELECT id FROM agendamento_planos WHERE protocol_id=${p.protocolId}
      AND estado IN ('pendente','em_revisao','confirmado') LIMIT 1`);
    if (vivo.rows[0]) {
      throw new EquipeErro(409, "Este protocolo já tem um plano de agendamento em andamento no Pit Stop.", "plano_ja_existe",
        { planoId: Number(vivo.rows[0].id) });
    }
    const legado = await tx.execute(sql`SELECT 1 FROM sessions s WHERE s.protocol_id=${p.protocolId}
      AND NOT s.agenda_archived AND s.status IN ('scheduled','confirmed')
      AND NOT EXISTS (SELECT 1 FROM protocolo_ocorrencia_participantes x WHERE x.session_id=s.id) LIMIT 1`);
    if (legado.rows.length) {
      throw new EquipeErro(409, "Este protocolo já tem visitas agendadas pelo caminho por substâncias. O Pit Stop não duplica a reserva.",
        "protocolo_ja_agendado_legado");
    }
    for (const entrada of p.procedimentos) {
      await incluirProcedimentoTx(tx, { empresaId: p.empresaId, protocolId: p.protocolId, professionalId: p.prescritorId, entrada });
    }
    const itens = await itensSemReserva(tx, p.empresaId, p.protocolId);
    if (!itens.length) throw new EquipeErro(422, "Não há procedimento a agendar neste protocolo.", "sem_procedimentos");
    const [plano] = (await tx.execute(sql`INSERT INTO agendamento_planos
      (empresa_id, protocol_id, client_id, estado, prescritor_id, criado_por, revisor_id, revisao_expira_em)
      VALUES (${p.empresaId}, ${p.protocolId}, ${p.clientId}, ${p.assumir ? "em_revisao" : "pendente"}, ${p.prescritorId}, ${p.criadoPor},
        ${p.assumir ? p.criadoPor : null}, ${p.assumir ? sql`now() + make_interval(mins => ${REVISAO_MINUTOS})` : null})
      RETURNING id`)).rows;
    for (const it of itens) {
      for (let n = 1; n <= it.total; n++) {
        await tx.execute(sql`INSERT INTO agendamento_plano_ocorrencias (plano_id, protocolo_procedimento_id, numero)
          VALUES (${plano.id}, ${it.id}, ${n})`);
      }
    }
    return Number(plano.id);
  });
  // Sugestão de agendas e de datas: fora da transação principal; falha aqui vira "motivo" visível, nunca plano perdido.
  await sugerirAgendas(planoId);
  await proporDatas(planoId);
  return planoId;
}

async function itensSemReserva(tx: Tx, empresaId: number, protocolId: number) {
  const r = await tx.execute(sql`SELECT pp.id, pp.total_sessoes FROM protocolo_procedimentos pp
    WHERE pp.empresa_id=${empresaId} AND pp.protocol_id=${protocolId} AND pp.status='ativo'
      AND NOT EXISTS (SELECT 1 FROM protocolo_ocorrencias o WHERE o.protocolo_procedimento_id=pp.id AND o.status='reservada')
    ORDER BY pp.ordem, pp.id`);
  return r.rows.map((x) => ({ id: Number(x.id), total: Number(x.total_sessoes) }));
}

// ───────────────────────── sugestões ─────────────────────────

async function equipeDoItem(ex: Tx, itemId: number) {
  const r = await ex.execute(sql`SELECT ordem, category_id, alternative_category_ids, location_id, professional_ids, modalidade, agenda_id
    FROM protocolo_procedimento_equipe WHERE protocolo_procedimento_id=${itemId} ORDER BY ordem`);
  return r.rows.map((x) => ({ ordem: Number(x.ordem), participante: participanteDaLinha(x) }));
}

async function agendasPadraoDaClinica(ex: Tx, empresaId: number): Promise<number[]> {
  const t = await ex.execute(sql`SELECT to_regclass('client_clinic_agenda_defaults') IS NOT NULL AS ok`);
  if (t.rows[0]?.ok !== true) return [];
  const r = await ex.execute(sql`SELECT enfermagem_resource_id, medico_resource_id FROM client_clinic_agenda_defaults WHERE empresa_id=${empresaId}`);
  const row = r.rows[0];
  return row ? [row.enfermagem_resource_id, row.medico_resource_id].filter((v) => v != null).map(Number) : [];
}

/**
 * Sugere a agenda de cada participante SEM agenda escolhida: (a) a única agenda elegível; ou (b) entre várias,
 * a que a clínica marcou como padrão. Sem padrão inequívoco a escolha continua pendente: nunca vale a ordem de exibição.
 */
export async function sugerirAgendas(planoId: number, somenteItemId?: number) {
  const pl = (await db.execute(sql`SELECT empresa_id FROM agendamento_planos WHERE id=${planoId}`)).rows[0];
  if (!pl) return;
  const empresaId = Number(pl.empresa_id);
  const itens = await db.execute(sql`SELECT DISTINCT protocolo_procedimento_id AS id FROM agendamento_plano_ocorrencias
    WHERE plano_id=${planoId} ORDER BY 1`);
  const padrao = await agendasPadraoDaClinica(db, empresaId);
  for (const it of itens.rows) {
    const itemId = Number(it.id);
    if (somenteItemId && somenteItemId !== itemId) continue;
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const equipe = await equipeDoItem(db, itemId);
      try {
        const { necessidades } = await resolverNecessidades(db, empresaId, equipe.map((e) => e.participante));
        for (const n of necessidades) {
          const alvo = equipe[n.ordem - 1];
          if (alvo.participante.agendaId != null) continue;
          const unicas = [...new Set(n.candidatos.map((c) => c.resourceId))];
          if (unicas.length === 1) await gravarAgendaSugerida(itemId, alvo.ordem, unicas[0]);
        }
        break;
      } catch (e) {
        if (!(e instanceof EquipeErro)) throw e;
        if (e.code !== "escolha_agenda_pendente") break; // outros motivos aparecem no detalhe do plano
        const ordem = Number(e.detalhes?.participanteOrdem);
        const opcoes = (e.detalhes?.opcoes as { id: number }[]) ?? [];
        const doPadrao = opcoes.filter((o) => padrao.includes(o.id));
        if (doPadrao.length !== 1) break; // sem padrão inequívoco: escolha pendente
        await gravarAgendaSugerida(itemId, ordem, doPadrao[0].id);
      }
    }
  }
}

async function gravarAgendaSugerida(itemId: number, ordem: number, agendaId: number) {
  await db.execute(sql`UPDATE protocolo_procedimento_equipe SET agenda_id=${agendaId}, agenda_origem='sugerida'
    WHERE protocolo_procedimento_id=${itemId} AND ordem=${ordem} AND agenda_id IS NULL`);
}

// ───────────────────────── datas propostas ─────────────────────────

type Ocupado = { resourceId: number; professionalId: number | null; date: string; ini: number; fim: number };

/** Propõe datas pela frequência do procedimento, sem sobrepor outras propostas do mesmo plano. Nada é reservado. */
export async function proporDatas(planoId: number, somenteItemId?: number) {
  const pl = (await db.execute(sql`SELECT empresa_id FROM agendamento_planos WHERE id=${planoId}`)).rows[0];
  if (!pl) return;
  const empresaId = Number(pl.empresa_id);
  const itens = await db.execute(sql`SELECT pp.id, pp.total_sessoes, pp.intervalo_dias, pp.data_inicio, pp.duracao_segundos
    FROM protocolo_procedimentos pp WHERE pp.id IN (SELECT DISTINCT protocolo_procedimento_id FROM agendamento_plano_ocorrencias WHERE plano_id=${planoId})
    ORDER BY pp.ordem, pp.id`);
  // Ocorrências manuais já fixadas pelo revisor também ocupam a agenda do plano.
  const ocupados: Ocupado[] = [];
  const manuais = await db.execute(sql`SELECT o.protocolo_procedimento_id AS item, o.data, o.hora, pp.duracao_segundos
    FROM agendamento_plano_ocorrencias o JOIN protocolo_procedimentos pp ON pp.id=o.protocolo_procedimento_id
    WHERE o.plano_id=${planoId} AND o.origem='manual' AND o.data IS NOT NULL`);
  for (const m of manuais.rows) {
    const equipe = await equipeDoItem(db, Number(m.item));
    for (const e of equipe) {
      if (e.participante.agendaId != null) {
        ocupados.push({ resourceId: e.participante.agendaId, professionalId: null, date: String(m.data),
          ini: minutos(String(m.hora)), fim: minutos(String(m.hora)) + Math.ceil(Number(m.duracao_segundos) / 60) });
      }
    }
  }
  const hoje = brtISODate();
  for (const it of itens.rows) {
    const itemId = Number(it.id);
    if (somenteItemId && somenteItemId !== itemId) continue;
    const total = Number(it.total_sessoes);
    const intervalo = Number(it.intervalo_dias);
    const duracaoSeg = Number(it.duracao_segundos);
    const duracaoMin = Math.ceil(duracaoSeg / 60);
    const equipe = (await equipeDoItem(db, itemId)).map((e) => e.participante);
    const inicio = it.data_inicio && String(it.data_inicio) >= hoje ? String(it.data_inicio) : hoje;
    const cache = new Map<string, Awaited<ReturnType<typeof buscarHorariosDaEquipe>>>();
    const dia = async (data: string) => {
      const base = somarDias(inicio, Math.floor((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000 / MAX_DIAS_BUSCA) * MAX_DIAS_BUSCA);
      if (!cache.has(base)) {
        cache.set(base, await buscarHorariosDaEquipe({
          empresaId, participantes: equipe, duracaoSegundos: duracaoSeg, from: base, to: somarDias(base, MAX_DIAS_BUSCA - 1),
        }));
      }
      return cache.get(base)!.find((d) => d.date === data)?.horarios ?? [];
    };
    const ocorrencias = await db.execute(sql`SELECT id, numero, origem FROM agendamento_plano_ocorrencias
      WHERE plano_id=${planoId} AND protocolo_procedimento_id=${itemId} ORDER BY numero`);
    let anterior: { date: string; time: string } | null = null;
    let motivoItem: string | null = null;
    for (const oc of ocorrencias.rows) {
      const numero = Number(oc.numero);
      if (oc.origem === "manual") {
        const fix = (await db.execute(sql`SELECT data, hora FROM agendamento_plano_ocorrencias WHERE id=${oc.id}`)).rows[0];
        if (fix?.data) anterior = { date: String(fix.data), time: String(fix.hora) };
        continue;
      }
      let achado: { date: string; time: string; parts: any[] } | null = null;
      let motivo: string | null = motivoItem;
      if (!motivoItem) {
        try {
          const alvo = somarDias(inicio, (numero - 1) * intervalo);
          let data = anterior && anterior.date > alvo ? anterior.date : alvo;
          const limite = somarDias(inicio, BUSCA_MAX_JANELAS * MAX_DIAS_BUSCA);
          for (; data <= limite && !achado; data = somarDias(data, 1)) {
            if (data < hoje) continue;
            for (const h of await dia(data)) {
              if (anterior && data === anterior.date && h.time <= anterior.time) continue;
              const ini = minutos(h.time);
              const choca = ocupados.some((o) => o.date === data && ini < o.fim && o.ini < ini + duracaoMin &&
                h.participantes.some((x: any) => x.resourceId === o.resourceId ||
                  (o.professionalId != null && x.professionalId === o.professionalId)));
              if (!choca) { achado = { date: data, time: h.time, parts: h.participantes }; break; }
            }
          }
          if (!achado) motivo = "sem_horario_disponivel";
        } catch (e) {
          if (!(e instanceof EquipeErro)) throw e;
          motivo = e.code; // ex.: escolha_agenda_pendente, sem_agenda_da_categoria: aparece no plano, sem inventar disponibilidade
          motivoItem = e.code;
        }
      }
      if (achado) {
        const ini = minutos(achado.time);
        for (const x of achado.parts) {
          ocupados.push({ resourceId: x.resourceId, professionalId: x.professionalId ?? null, date: achado.date, ini, fim: ini + duracaoMin });
        }
        anterior = { date: achado.date, time: achado.time };
      }
      await db.execute(sql`UPDATE agendamento_plano_ocorrencias SET data=${achado?.date ?? null}, hora=${achado?.time ?? null},
        motivo=${achado ? null : motivo}, origem='automatica' WHERE id=${oc.id}`);
    }
  }
}

// ───────────────────────── leitura ─────────────────────────

export async function listarPlanos(empresaId: number, professionalId: number, filtro: { estado?: string; busca?: string } = {}) {
  const busca = filtro.busca?.trim() ? `%${filtro.busca.trim()}%` : null;
  const r = await db.execute(sql`SELECT pl.id, pl.estado, pl.sync_estado, pl.protocol_id, pl.versao, pl.created_at, pl.confirmado_em,
      pl.revisao_expira_em, (pl.revisao_expira_em IS NOT NULL AND pl.revisao_expira_em < now()) AS revisao_expirada,
      c.id AS client_id, c.name AS cliente, pr.name AS prescritor, rv.name AS revisor, pl.revisor_id,
      (SELECT count(DISTINCT o.protocolo_procedimento_id) FROM agendamento_plano_ocorrencias o WHERE o.plano_id=pl.id) AS itens,
      (SELECT count(*) FROM agendamento_plano_ocorrencias o WHERE o.plano_id=pl.id) AS ocorrencias,
      (SELECT count(*) FROM agendamento_plano_ocorrencias o WHERE o.plano_id=pl.id AND o.data IS NULL) AS sem_data
    FROM agendamento_planos pl
    JOIN clients c ON c.id=pl.client_id
    LEFT JOIN professionals pr ON pr.id=pl.prescritor_id
    LEFT JOIN professionals rv ON rv.id=pl.revisor_id
    WHERE pl.empresa_id=${empresaId}
      AND EXISTS (SELECT 1 FROM location_professionals lp WHERE lp.location_id=c.location_id AND lp.professional_id=${professionalId})
      AND (${filtro.estado ?? null}::text IS NULL OR pl.estado=${filtro.estado ?? null})
      AND (${busca}::text IS NULL OR c.name ILIKE ${busca})
    ORDER BY CASE pl.estado WHEN 'pendente' THEN 0 WHEN 'em_revisao' THEN 1 WHEN 'confirmado' THEN 2 ELSE 3 END, pl.id DESC LIMIT 200`);
  return r.rows.map((x) => ({
    id: Number(x.id), estado: String(x.estado), syncEstado: String(x.sync_estado), protocolId: Number(x.protocol_id),
    versao: Number(x.versao), criadoEm: x.created_at, confirmadoEm: x.confirmado_em, revisaoExpiraEm: x.revisao_expira_em,
    revisaoExpirada: x.revisao_expirada === true, clienteId: Number(x.client_id), cliente: String(x.cliente),
    prescritor: x.prescritor ?? null, revisor: x.revisor ?? null, revisorId: x.revisor_id == null ? null : Number(x.revisor_id),
    itens: Number(x.itens), ocorrencias: Number(x.ocorrencias), semData: Number(x.sem_data),
  }));
}

export async function carregarPlano(empresaId: number, planoId: number) {
  const r = await db.execute(sql`SELECT * FROM agendamento_planos WHERE id=${planoId} AND empresa_id=${empresaId}`);
  return r.rows[0] ?? null;
}

/** Plano completo para a tela: itens, equipe com agenda/opções, problema atual de cada item e ocorrências propostas. */
export async function detalharPlano(empresaId: number, planoId: number) {
  const plano = (await db.execute(sql`SELECT pl.*, (pl.revisao_expira_em IS NOT NULL AND pl.revisao_expira_em < now()) AS revisao_expirada,
      c.name AS cliente, c.location_id AS cliente_local, pr.name AS prescritor, rv.name AS revisor, cf.name AS confirmador, p.title AS protocolo
    FROM agendamento_planos pl JOIN clients c ON c.id=pl.client_id JOIN protocols p ON p.id=pl.protocol_id
    LEFT JOIN professionals pr ON pr.id=pl.prescritor_id LEFT JOIN professionals rv ON rv.id=pl.revisor_id
    LEFT JOIN professionals cf ON cf.id=pl.confirmado_por
    WHERE pl.id=${planoId} AND pl.empresa_id=${empresaId}`)).rows[0];
  if (!plano) return null;
  const itensRows = await db.execute(sql`SELECT pp.id, pp.nome_snapshot AS nome, pp.total_sessoes, pp.intervalo_dias, pp.data_inicio,
      pp.duracao_segundos, pp.produto_id, pp.dose, pp.equipe_origem, pp.procedimento_id,
      (SELECT e.origem FROM procedimento_equipes e WHERE e.procedimento_id=pp.procedimento_id AND e.origem IS NOT NULL ORDER BY e.id LIMIT 1) AS origem_requisito
    FROM protocolo_procedimentos pp
    WHERE pp.id IN (SELECT DISTINCT protocolo_procedimento_id FROM agendamento_plano_ocorrencias WHERE plano_id=${planoId})
    ORDER BY pp.ordem, pp.id`);
  const categoriasUsadas = new Set<number>();
  const itens = [];
  for (const it of itensRows.rows) {
    const itemId = Number(it.id);
    const equipeRows = await db.execute(sql`SELECT e.ordem, e.category_id, a.name AS category_name, e.alternative_category_ids,
        e.location_id, e.professional_ids, e.modalidade, e.agenda_id, e.agenda_origem, r.name AS agenda_nome
      FROM protocolo_procedimento_equipe e JOIN professional_areas a ON a.id=e.category_id
      LEFT JOIN agenda_resources r ON r.id=e.agenda_id WHERE e.protocolo_procedimento_id=${itemId} ORDER BY e.ordem`);
    const equipe = [];
    for (const e of equipeRows.rows) {
      const part = participanteDaLinha(e);
      const cats = [part.categoryId, ...(part.alternativeCategoryIds ?? [])];
      cats.forEach((c) => categoriasUsadas.add(c));
      const opcoes = await db.execute(sql`SELECT r.id, r.name, r.modality, r.professional_id, r.category_id FROM agenda_resources r
        LEFT JOIN locations l ON l.id=r.location_id
        WHERE r.active AND r.category_id = ANY(${`{${cats.join(",")}}`}::int[]) AND COALESCE(r.empresa_id, l.empresa_id)=${empresaId}
          AND r.modality=${part.modalidade ?? "local"} AND (r.location_id IS NULL OR l.active='true') ORDER BY r.name, r.id`);
      equipe.push({
        ordem: Number(e.ordem), categoryId: part.categoryId, categoryName: String(e.category_name),
        alternativeCategoryIds: part.alternativeCategoryIds ?? [], professionalIds: part.professionalIds ?? [],
        modalidade: part.modalidade ?? "local", agendaId: part.agendaId ?? null, agendaOrigem: e.agenda_origem ?? null,
        agendaNome: e.agenda_nome ?? null,
        opcoesAgenda: opcoes.rows.map((o) => ({ id: Number(o.id), nome: String(o.name), modalidade: String(o.modality),
          professionalId: o.professional_id == null ? null : Number(o.professional_id) })),
      });
    }
    let problema: { code: string; message: string; opcoes?: unknown } | null = null;
    try {
      await resolverNecessidades(db, empresaId, equipe.map((e) => ({
        categoryId: e.categoryId, alternativeCategoryIds: e.alternativeCategoryIds, professionalIds: e.professionalIds,
        modalidade: e.modalidade as Participante["modalidade"], agendaId: e.agendaId, locationId: null,
      })));
    } catch (err) {
      if (!(err instanceof EquipeErro)) throw err;
      problema = { code: err.code, message: err.message, opcoes: err.detalhes?.opcoes };
    }
    const ocs = await db.execute(sql`SELECT o.id, o.numero, o.data, o.hora, o.origem, o.motivo, o.ocorrencia_id,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('sessionId', s.id, 'agenda', r.name, 'googleEventId', s.google_event_id,
            'pendente', s.google_sync_pending_operation IS NOT NULL) ORDER BY x.ordem)
          FROM protocolo_ocorrencia_participantes x JOIN sessions s ON s.id=x.session_id
          LEFT JOIN agenda_resources r ON r.id=x.resource_id WHERE x.ocorrencia_id=o.ocorrencia_id), '[]'::jsonb) AS visitas
      FROM agendamento_plano_ocorrencias o WHERE o.plano_id=${planoId} AND o.protocolo_procedimento_id=${itemId} ORDER BY o.numero`);
    itens.push({
      id: itemId, procedimentoId: Number(it.procedimento_id), nome: String(it.nome), totalSessoes: Number(it.total_sessoes),
      intervaloDias: Number(it.intervalo_dias), dataInicio: it.data_inicio ?? null, duracaoSegundos: Number(it.duracao_segundos),
      produtoId: it.produto_id == null ? null : Number(it.produto_id), dose: it.dose ?? null, equipeOrigem: String(it.equipe_origem),
      origemRequisito: it.origem_requisito ?? null, equipe, problema,
      ocorrencias: ocs.rows.map((o) => ({
        id: Number(o.id), numero: Number(o.numero), data: o.data ?? null, hora: o.hora ?? null, origem: String(o.origem),
        motivo: o.motivo ?? null, reservada: o.ocorrencia_id != null, visitas: o.visitas,
      })),
    });
  }
  const cats = [...categoriasUsadas];
  const profs = cats.length ? await db.execute(sql`SELECT p.id, p.name, p.area_id FROM professionals p
    WHERE p.active AND p.area_id = ANY(${`{${cats.join(",")}}`}::int[]) AND ${condicaoCorpoClinico(empresaId)} ORDER BY p.name`) : { rows: [] as any[] };
  const areas = await db.execute(sql`SELECT id, name FROM professional_areas WHERE active ORDER BY sort_order, name`);
  return {
    id: Number(plano.id), estado: String(plano.estado), syncEstado: String(plano.sync_estado), syncDetalhe: plano.sync_detalhe ?? null,
    syncEm: plano.sync_em ?? null, versao: Number(plano.versao), protocolId: Number(plano.protocol_id), protocolo: plano.protocolo,
    clienteId: Number(plano.client_id), cliente: String(plano.cliente), prescritor: plano.prescritor ?? null,
    prescritorId: plano.prescritor_id == null ? null : Number(plano.prescritor_id),
    revisor: plano.revisor ?? null, revisorId: plano.revisor_id == null ? null : Number(plano.revisor_id),
    revisaoExpiraEm: plano.revisao_expira_em ?? null, revisaoExpirada: plano.revisao_expirada === true,
    confirmador: plano.confirmador ?? null, confirmadoEm: plano.confirmado_em ?? null, itens,
    profissionaisPorCategoria: profs.rows.map((p) => ({ id: Number(p.id), name: String(p.name), categoryId: Number(p.area_id) })),
    categorias: areas.rows.map((a) => ({ id: Number(a.id), name: String(a.name) })),
  };
}

// ───────────────────────── revisão (um revisor por vez) ─────────────────────────

function erroDeEstado(plano: Record<string, unknown> | null, me: number): EquipeErro {
  if (!plano) return new EquipeErro(404, "Plano não encontrado.", "plano_nao_encontrado");
  if (plano.estado === "confirmado") return new EquipeErro(409, "Este plano já foi confirmado.", "plano_ja_confirmado");
  if (plano.estado === "cancelado") return new EquipeErro(409, "Este plano foi cancelado.", "plano_cancelado");
  if (plano.estado === "em_revisao" && Number(plano.revisor_id) !== me) {
    return new EquipeErro(409, "Outra pessoa está revisando este plano.", "em_revisao_por_outro");
  }
  return new EquipeErro(409, "Abra a revisão do plano antes de continuar.", "sem_revisao_ativa");
}

export async function abrirRevisao(empresaId: number, planoId: number, me: number) {
  const r = await db.execute(sql`UPDATE agendamento_planos SET estado='em_revisao', revisor_id=${me},
      revisao_expira_em=now() + make_interval(mins => ${REVISAO_MINUTOS}),
      versao = CASE WHEN estado='em_revisao' AND revisor_id=${me} THEN versao ELSE versao+1 END, updated_at=now()
    WHERE id=${planoId} AND empresa_id=${empresaId}
      AND (estado='pendente' OR (estado='em_revisao' AND (revisor_id=${me} OR revisao_expira_em < now())))
    RETURNING id`);
  if (!r.rows.length) throw erroDeEstado(await carregarPlano(empresaId, planoId), me);
}

export async function liberarRevisao(empresaId: number, planoId: number, me: number) {
  const r = await db.execute(sql`UPDATE agendamento_planos SET estado='pendente', revisor_id=NULL, revisao_expira_em=NULL,
      versao=versao+1, updated_at=now()
    WHERE id=${planoId} AND empresa_id=${empresaId} AND estado='em_revisao' AND revisor_id=${me} RETURNING id`);
  if (!r.rows.length) throw erroDeEstado(await carregarPlano(empresaId, planoId), me);
}

export async function cancelarPlano(empresaId: number, planoId: number, me: number) {
  const r = await db.execute(sql`UPDATE agendamento_planos SET estado='cancelado', revisor_id=NULL, revisao_expira_em=NULL,
      versao=versao+1, updated_at=now()
    WHERE id=${planoId} AND empresa_id=${empresaId}
      AND (estado='pendente' OR (estado='em_revisao' AND (revisor_id=${me} OR revisao_expira_em < now()))) RETURNING id`);
  if (!r.rows.length) throw erroDeEstado(await carregarPlano(empresaId, planoId), me);
}

/** Confere (travando a linha) que `me` é o revisor ativo e que a versão vista é a atual; devolve a versão nova. */
async function exigirRevisorTx(tx: Tx, empresaId: number, planoId: number, me: number, versao: number) {
  const plano = (await tx.execute(sql`SELECT * FROM agendamento_planos WHERE id=${planoId} AND empresa_id=${empresaId} FOR UPDATE`)).rows[0] ?? null;
  if (!plano || plano.estado !== "em_revisao" || Number(plano.revisor_id) !== me) throw erroDeEstado(plano, me);
  if (Number(plano.versao) !== versao) {
    throw new EquipeErro(409, "O plano mudou desde que você o abriu. Recarregue antes de continuar.", "plano_mudou", { versaoAtual: Number(plano.versao) });
  }
  return plano;
}
const renovar = (tx: Tx, planoId: number) => tx.execute(sql`UPDATE agendamento_planos SET versao=versao+1, updated_at=now(),
  revisao_expira_em=now() + make_interval(mins => ${REVISAO_MINUTOS}) WHERE id=${planoId}`);

export async function ajustarOcorrencias(empresaId: number, planoId: number, me: number, versao: number,
  ajustes: { id: number; data: string | null; hora: string | null }[]) {
  await db.transaction(async (tx) => {
    await exigirRevisorTx(tx, empresaId, planoId, me, versao);
    for (const a of ajustes) {
      if (a.data !== null && (!dataValida(a.data) || a.hora === null || !HHMM.test(a.hora))) {
        throw new EquipeErro(400, "Data ou horário inválido.", "data_invalida");
      }
      if (a.data !== null && a.data < brtISODate()) throw new EquipeErro(422, "Não é possível agendar em data passada.", "data_passada");
      const r = await tx.execute(sql`UPDATE agendamento_plano_ocorrencias SET data=${a.data}, hora=${a.data === null ? null : a.hora},
          origem='manual', motivo=${a.data === null ? "sem_data_escolhida" : null}
        WHERE id=${a.id} AND plano_id=${planoId} AND ocorrencia_id IS NULL RETURNING id`);
      if (!r.rows.length) throw new EquipeErro(404, "Ocorrência não encontrada neste plano.", "ocorrencia_nao_encontrada");
    }
    await renovar(tx, planoId);
  });
}

export async function ajustarEquipe(empresaId: number, planoId: number, me: number, versao: number, itemId: number, equipe: Participante[]) {
  await db.transaction(async (tx) => {
    await exigirRevisorTx(tx, empresaId, planoId, me, versao);
    const item = (await tx.execute(sql`SELECT pp.procedimento_id FROM protocolo_procedimentos pp
      WHERE pp.id=${itemId} AND pp.empresa_id=${empresaId} AND pp.status='ativo'
        AND EXISTS (SELECT 1 FROM agendamento_plano_ocorrencias o WHERE o.plano_id=${planoId} AND o.protocolo_procedimento_id=pp.id)`)).rows[0];
    if (!item) throw new EquipeErro(404, "Procedimento não encontrado neste plano.", "item_nao_encontrado");
    await validarEquipeDoProcedimento(tx, empresaId, Number(item.procedimento_id), equipe);
    const antes = new Map((await tx.execute(sql`SELECT ordem, agenda_id, agenda_origem FROM protocolo_procedimento_equipe
      WHERE protocolo_procedimento_id=${itemId}`)).rows.map((x) => [Number(x.ordem), x]));
    await tx.execute(sql`DELETE FROM protocolo_procedimento_equipe WHERE protocolo_procedimento_id=${itemId}`);
    for (let i = 0; i < equipe.length; i++) {
      const e = equipe[i];
      const ant = antes.get(i + 1);
      // Mesma agenda que já estava (sugerida) continua "sugerida"; trocar ou escolher marca como escolha do revisor.
      const origem = e.agendaId == null ? null : (ant && Number(ant.agenda_id) === e.agendaId && ant.agenda_origem ? ant.agenda_origem : "escolhida");
      await tx.execute(sql`INSERT INTO protocolo_procedimento_equipe
        (protocolo_procedimento_id, ordem, category_id, alternative_category_ids, location_id, professional_ids, modalidade, agenda_id, agenda_origem)
        VALUES (${itemId}, ${i + 1}, ${e.categoryId}, ${`{${(e.alternativeCategoryIds ?? []).join(",")}}`}::int[], ${e.locationId ?? null},
          ${`{${(e.professionalIds ?? []).join(",")}}`}::int[], ${e.modalidade ?? "local"}, ${e.agendaId ?? null}, ${origem})`);
    }
    await tx.execute(sql`UPDATE protocolo_procedimentos SET equipe_origem='prescritor' WHERE id=${itemId}`);
    // As propostas automáticas deste item eram da equipe antiga: voltam a ser calculadas.
    await tx.execute(sql`UPDATE agendamento_plano_ocorrencias SET data=NULL, hora=NULL, motivo=NULL
      WHERE plano_id=${planoId} AND protocolo_procedimento_id=${itemId} AND origem='automatica'`);
    await renovar(tx, planoId);
  });
  await sugerirAgendas(planoId, itemId);
  await proporDatas(planoId, itemId);
}

// ───────────────────────── revalidar / confirmar ─────────────────────────

class Reverter extends Error { constructor(readonly payload: unknown) { super("reverter"); } }

export type ResultadoOcorrencia = {
  itemId: number; numero: number; data: string | null; hora: string | null; ok: boolean; code?: string; message?: string;
  detalhes?: Record<string, unknown>;
};

async function tentarReservarTodas(tx: Tx, empresaId: number, planoId: number, me: number): Promise<{
  resultados: ResultadoOcorrencia[]; reservadas: { ocId: number; ocorrenciaId: number }[];
}> {
  const ocs = await tx.execute(sql`SELECT o.id, o.protocolo_procedimento_id AS item, o.numero, o.data, o.hora FROM agendamento_plano_ocorrencias o
    JOIN protocolo_procedimentos pp ON pp.id=o.protocolo_procedimento_id WHERE o.plano_id=${planoId} ORDER BY pp.ordem, pp.id, o.numero`);
  const resultados: ResultadoOcorrencia[] = [];
  const reservadas: { ocId: number; ocorrenciaId: number }[] = [];
  for (const o of ocs.rows) {
    const base = { itemId: Number(o.item), numero: Number(o.numero), data: o.data == null ? null : String(o.data), hora: o.hora == null ? null : String(o.hora) };
    if (!o.data || !o.hora) {
      resultados.push({ ...base, ok: false, code: "sem_data", message: "Falta escolher data e horário desta ocorrência." });
      continue;
    }
    try {
      const r = await reservarOcorrenciaTx(tx, { empresaId, protocoloProcedimentoId: Number(o.item), numero: Number(o.numero),
        date: String(o.data), time: String(o.hora), criadoPor: me });
      reservadas.push({ ocId: Number(o.id), ocorrenciaId: r.ocorrenciaId });
      resultados.push({ ...base, ok: true });
    } catch (e) {
      if (!(e instanceof EquipeErro)) throw e;
      resultados.push({ ...base, ok: false, code: e.code, message: e.message, detalhes: e.detalhes });
    }
  }
  return { resultados, reservadas };
}

/**
 * Revalida o plano inteiro com a MESMA lógica da confirmação (conflitos entre as ocorrências do plano, mesmo
 * profissional em várias agendas, duração, cliente ocupado) e desfaz tudo ao final: nada fica gravado.
 */
export async function revalidarPlano(empresaId: number, planoId: number) {
  const plano = await carregarPlano(empresaId, planoId);
  if (!plano) throw new EquipeErro(404, "Plano não encontrado.", "plano_nao_encontrado");
  if (plano.estado === "confirmado") throw new EquipeErro(409, "Este plano já foi confirmado.", "plano_ja_confirmado");
  if (plano.estado === "cancelado") throw new EquipeErro(409, "Este plano foi cancelado.", "plano_cancelado");
  try {
    await db.transaction(async (tx) => {
      const { resultados } = await tentarReservarTodas(tx, empresaId, planoId, Number(plano.criado_por ?? plano.prescritor_id));
      throw new Reverter(resultados);
    });
  } catch (e) {
    if (e instanceof Reverter) {
      const resultados = e.payload as ResultadoOcorrencia[];
      return { ok: resultados.every((r) => r.ok), resultados };
    }
    throw e;
  }
  throw new Error("inalcançável");
}

export async function confirmarPlano(empresaId: number, planoId: number, me: number, versao: number):
  Promise<{ repetido: boolean }> {
  try {
    return await db.transaction(async (tx) => {
      const plano = (await tx.execute(sql`SELECT * FROM agendamento_planos WHERE id=${planoId} AND empresa_id=${empresaId} FOR UPDATE`)).rows[0] ?? null;
      if (!plano) throw new EquipeErro(404, "Plano não encontrado.", "plano_nao_encontrado");
      if (plano.estado === "confirmado") {
        // Repetição da mesma pessoa (resposta perdida) é idempotente; outra pessoa nunca confirma de novo.
        if (Number(plano.confirmado_por) === me) return { repetido: true };
        throw new EquipeErro(409, "Este plano já foi confirmado por outra pessoa.", "plano_ja_confirmado");
      }
      if (plano.estado !== "em_revisao" || Number(plano.revisor_id) !== me) throw erroDeEstado(plano, me);
      if (Number(plano.versao) !== versao) {
        throw new EquipeErro(409, "O plano mudou desde que você o abriu. Recarregue antes de confirmar.", "plano_mudou", { versaoAtual: Number(plano.versao) });
      }
      const { resultados, reservadas } = await tentarReservarTodas(tx, empresaId, planoId, me);
      if (resultados.some((r) => !r.ok)) throw new Reverter(resultados);
      for (const r of reservadas) {
        await tx.execute(sql`UPDATE agendamento_plano_ocorrencias SET ocorrencia_id=${r.ocorrenciaId} WHERE id=${r.ocId}`);
      }
      await tx.execute(sql`UPDATE agendamento_planos SET estado='confirmado', confirmado_por=${me}, confirmado_em=now(),
        revisor_id=NULL, revisao_expira_em=NULL, sync_estado='nao_iniciada', versao=versao+1, updated_at=now() WHERE id=${planoId}`);
      return { repetido: false };
    });
  } catch (e) {
    if (e instanceof Reverter) {
      throw new EquipeErro(409, "Há conflitos no plano. Nada foi reservado: resolva-os e confirme de novo.", "plano_com_conflitos",
        { resultados: e.payload });
    }
    throw e;
  }
}
