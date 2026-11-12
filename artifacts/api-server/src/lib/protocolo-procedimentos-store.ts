import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { AgendaExecutor } from "./agenda-occupancy";
import { EquipeErro, categoriasDoParticipante, participanteDaLinha, validarParticipantes, type Participante } from "./equipe-reserva.js";

export type EntradaItem = {
  procedimentoId: number; totalSessoes?: number; intervaloDias?: number; dataInicio?: string | null;
  produtoId?: number | null; dose?: string | null; equipe?: Participante[];
};

export async function estruturaDisponivel(): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass('protocolo_procedimentos') IS NOT NULL
    AND to_regclass('protocolo_procedimento_equipe') IS NOT NULL AND to_regclass('protocolo_ocorrencias') IS NOT NULL
    AND to_regclass('protocolo_ocorrencia_participantes') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocolo_procedimento_equipe'
                AND column_name='alternative_category_ids')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocolo_procedimento_equipe'
                AND column_name='agenda_origem')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='protocolo_procedimento_equipe'
                AND column_name='exige_nivel')
    AND to_regclass('procedimento_equipes_alternativas') IS NOT NULL AS ok`);
  return r.rows[0]?.ok === true;
}

/**
 * Inclui um PROCEDIMENTO real (cadastro de Procedimentos) no protocolo.
 * A equipe padrão vem do procedimento da clínica; o prescritor pode substituí-la (1 a 3 participantes).
 * Consulta sem produto/dose é válida. O cadastro do procedimento nunca é alterado.
 */
export async function incluirProcedimento(params: {
  empresaId: number; protocolId: number; professionalId: number; entrada: EntradaItem;
}) {
  return db.transaction((tx) => incluirProcedimentoTx(tx, params));
}

/** Mesma inclusão dentro de uma transação já aberta (o lançamento clínico inclui vários procedimentos de uma vez). */
export async function incluirProcedimentoTx(tx: AgendaExecutor, params: {
  empresaId: number; protocolId: number; professionalId: number; entrada: EntradaItem;
}) {
  const { empresaId, protocolId, entrada } = params;
  {
    const proc = (await tx.execute(sql`SELECT id, nome, ativo, dose,
        COALESCE(duracao_segundos, ROUND(duracao_minutos*60)::int) AS duracao_segundos
      FROM procedimentos_clinicos WHERE id=${entrada.procedimentoId} AND empresa_id=${empresaId} FOR SHARE`)).rows[0];
    if (!proc) throw new EquipeErro(404, "Procedimento não encontrado nesta clínica.", "procedimento_nao_encontrado");
    if (!proc.ativo) throw new EquipeErro(409, "Este procedimento está inativo.", "procedimento_inativo");
    if (!proc.duracao_segundos) throw new EquipeErro(422, "O procedimento não tem duração cadastrada.", "procedimento_sem_duracao");

    let equipe = entrada.equipe;
    let origem: "padrao_procedimento" | "prescritor" = "prescritor";
    if (!equipe) {
      origem = "padrao_procedimento";
      const padrao = await tx.execute(sql`SELECT e.area_id, e.location_id,
          COALESCE((SELECT array_agg(ea.area_id ORDER BY ea.area_id)
            FROM procedimento_equipes_alternativas ea WHERE ea.equipe_id=e.id AND ea.area_id<>e.area_id), '{}') AS alternativas,
          COALESCE((SELECT array_agg(ep.professional_id ORDER BY ep.professional_id)
            FROM procedimento_equipes_profissionais ep WHERE ep.equipe_id=e.id), '{}') AS professional_ids,
          e.exige_nivel
        FROM procedimento_equipes e WHERE e.procedimento_id=${proc.id} AND e.ativo ORDER BY e.id`);
      // A equipe padrão parte da Sede (modalidade local) e sem agenda escolhida: a sugestão e a escolha vêm depois.
      equipe = padrao.rows.map((r) => ({
        categoryId: Number(r.area_id), alternativeCategoryIds: (r.alternativas as number[]).map(Number),
        locationId: Number(r.location_id), professionalIds: (r.professional_ids as number[]).map(Number),
        modalidade: "local" as const, agendaId: null,
        exigeNivel: r.exige_nivel === "enfermeiro" ? ("enfermeiro" as const) : null,
      }));
      if (!equipe.length) {
        throw new EquipeErro(422, "O procedimento não tem equipe padrão. Informe a equipe do protocolo.", "procedimento_sem_equipe");
      }
    }
    await validarEquipeDoProcedimento(tx, empresaId, Number(proc.id), equipe);

    if (entrada.produtoId != null) {
      const ligado = await tx.execute(sql`SELECT 1 FROM procedimento_produtos
        WHERE procedimento_id=${proc.id} AND produto_id=${entrada.produtoId} AND ativo`);
      if (!ligado.rows.length) throw new EquipeErro(409, "O produto não pertence a este procedimento.", "produto_invalido");
    }
    if (entrada.dose && /(?:ml\b|%|\/)/i.test(entrada.dose)) {
      throw new EquipeErro(400, "Informe a dose, sem volume nem concentração.", "dose_invalida");
    }
    const ordem = Number((await tx.execute(sql`SELECT COALESCE(MAX(ordem),0)+1 AS n FROM protocolo_procedimentos
      WHERE protocol_id=${protocolId}`)).rows[0].n);
    const item = (await tx.execute(sql`INSERT INTO protocolo_procedimentos
      (empresa_id, protocol_id, procedimento_id, ordem, total_sessoes, intervalo_dias, data_inicio, nome_snapshot,
       duracao_segundos, produto_id, dose, equipe_origem, criado_por)
      VALUES (${empresaId}, ${protocolId}, ${proc.id}, ${ordem}, ${entrada.totalSessoes ?? 1}, ${entrada.intervaloDias ?? 7},
        ${entrada.dataInicio ?? null}, ${proc.nome}, ${proc.duracao_segundos}, ${entrada.produtoId ?? null},
        ${entrada.dose?.trim() || null}, ${origem}, ${params.professionalId}) RETURNING id`)).rows[0];
    for (let i = 0; i < equipe.length; i++) {
      const p = equipe[i];
      await tx.execute(sql`INSERT INTO protocolo_procedimento_equipe
        (protocolo_procedimento_id, ordem, category_id, alternative_category_ids, location_id, professional_ids,
         modalidade, agenda_id, agenda_origem, exige_nivel)
        VALUES (${item.id}, ${i + 1}, ${p.categoryId}, ${`{${(p.alternativeCategoryIds ?? []).join(",")}}`}::int[],
          ${p.locationId ?? null}, ${`{${(p.professionalIds ?? []).join(",")}}`}::int[],
          ${p.modalidade ?? "local"}, ${p.agendaId ?? null}, ${p.agendaId ? "escolhida" : null},
          ${p.exigeNivel ?? null})`);
    }
    return Number(item.id);
  }
}

/** Valida a equipe (categorias, agenda, profissionais) e a regra de implante: medicina E enfermagem, mesmo com equipe alterada. */
export async function validarEquipeDoProcedimento(tx: AgendaExecutor, empresaId: number, procedimentoId: number, equipe: Participante[]) {
  // O requisito de nível vem do cadastro do procedimento (por categoria): o servidor o reaplica e ninguém o remove pela tela.
  const exigencias = await tx.execute(sql`SELECT DISTINCT area_id FROM procedimento_equipes
    WHERE procedimento_id=${procedimentoId} AND ativo AND exige_nivel='enfermeiro'`);
  const areasExigentes = new Set(exigencias.rows.map((r) => Number(r.area_id)));
  for (const p of equipe) if (areasExigentes.has(p.categoryId)) p.exigeNivel = "enfermeiro";
  const categorias = await validarParticipantes(tx, empresaId, equipe);
  const implante = await tx.execute(sql`SELECT 1 FROM procedimento_produtos pp JOIN substances s ON s.id=pp.produto_id
    WHERE pp.procedimento_id=${procedimentoId} AND pp.ativo AND s.procedure_type='implant' LIMIT 1`);
  if (implante.rows.length) {
    // Alternativas valem para uma pessoa só: o implante precisa de medicina E enfermagem como necessidades
    // distintas, e cada necessidade só atende se TODAS as suas alternativas forem da categoria exigida.
    const exige = (slug: string) => equipe.some((p) => categoriasDoParticipante(p)
      .every((id) => categorias.find((c) => c.id === id)?.slug === slug));
    if (!exige("medicina") || !exige("enfermagem")) {
      throw new EquipeErro(422, "Implante exige profissionais de medicina e enfermagem na equipe.", "implante_equipe");
    }
  }
  return categorias;
}

export async function listarItens(empresaId: number, protocolId: number) {
  const itens = await db.execute(sql`SELECT pp.id, pp.procedimento_id AS "procedimentoId", pp.nome_snapshot AS nome,
      pp.ordem, pp.total_sessoes AS "totalSessoes", pp.intervalo_dias AS "intervaloDias", pp.data_inicio AS "dataInicio",
      pp.duracao_segundos AS "duracaoSegundos", pp.produto_id AS "produtoId", pp.dose, pp.equipe_origem AS "equipeOrigem",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('ordem',e.ordem,'categoryId',e.category_id,'categoryName',a.name,
          'alternativeCategoryIds',to_jsonb(e.alternative_category_ids),
          'alternativeCategoryNames',(SELECT COALESCE(jsonb_agg(x.name ORDER BY x.name),'[]'::jsonb) FROM professional_areas x WHERE x.id=ANY(e.alternative_category_ids)),
          'locationId',e.location_id,'professionalIds',to_jsonb(e.professional_ids),
          'modalidade',e.modalidade,'agendaId',e.agenda_id,'agendaOrigem',e.agenda_origem,
          'exigeNivel',e.exige_nivel,'profissionalOrigem',e.profissional_origem) ORDER BY e.ordem)
        FROM protocolo_procedimento_equipe e JOIN professional_areas a ON a.id=e.category_id
        WHERE e.protocolo_procedimento_id=pp.id), '[]'::jsonb) AS equipe,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'numero',o.numero,'date',o.scheduled_date,'time',o.scheduled_time,
          'participantes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('ordem',x.ordem,'categoryId',x.category_id,
            'professionalId',x.professional_id,'resourceId',x.resource_id,'sessionId',x.session_id) ORDER BY x.ordem),'[]'::jsonb)
            FROM protocolo_ocorrencia_participantes x WHERE x.ocorrencia_id=o.id)) ORDER BY o.numero)
        FROM protocolo_ocorrencias o WHERE o.protocolo_procedimento_id=pp.id AND o.status='reservada'), '[]'::jsonb) AS ocorrencias
    FROM protocolo_procedimentos pp
    WHERE pp.empresa_id=${empresaId} AND pp.protocol_id=${protocolId} AND pp.status='ativo' ORDER BY pp.ordem, pp.id`);
  return itens.rows;
}

export async function carregarItem(empresaId: number, protocolId: number, itemId: number) {
  const r = await db.execute(sql`SELECT pp.id, pp.duracao_segundos FROM protocolo_procedimentos pp
    WHERE pp.id=${itemId} AND pp.empresa_id=${empresaId} AND pp.protocol_id=${protocolId} AND pp.status='ativo'`);
  if (!r.rows[0]) throw new EquipeErro(404, "Procedimento do protocolo não encontrado.", "item_nao_encontrado");
  const equipe = await db.execute(sql`SELECT category_id, alternative_category_ids, location_id, professional_ids, modalidade, agenda_id, exige_nivel
    FROM protocolo_procedimento_equipe WHERE protocolo_procedimento_id=${itemId} ORDER BY ordem`);
  return {
    duracaoSegundos: Number(r.rows[0].duracao_segundos),
    participantes: equipe.rows.map((e): Participante => participanteDaLinha(e)),
  };
}
