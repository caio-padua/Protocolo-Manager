import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { condicaoCorpoClinico } from "./corpo-clinico.js";
import { agendasDoProfissional, profissionaisVinculadosDaAgenda } from "./agenda-vinculos.js";

/**
 * Conferência automática entre as DUAS telas que mostram a ligação agenda x profissional:
 *   - Agenda Configuração (quem está ligado a cada agenda) e
 *   - Cadastro do profissional, aba Vínculos (em quais agendas cada pessoa está).
 * Lê as mesmas funções que as telas leem, cruza todos os pares agenda x profissional da clínica e devolve
 * qualquer par em que uma tela diz "ligado" e a outra diz "não". Somente leitura; nunca corrige sozinha.
 */
export interface DivergenciaVinculo {
  agendaId: number; agendaNome: string; professionalId: number; profissionalNome: string;
  naAgendaConfiguracao: boolean; noCadastroDoProfissional: boolean;
}
export interface AuditoriaVinculos {
  agendas: number; profissionais: number; paresConferidos: number; paresLigados: number;
  divergencias: DivergenciaVinculo[];
  /** Informativo: titular de agenda com local que NÃO tem o vínculo do cadastro com o local (aparece como titular, sem acesso de local). */
  titularesSemVinculoDoLocal: { agendaId: number; agendaNome: string; professionalId: number }[];
}

export async function auditarVinculosAgendaProfissional(empresaId: number): Promise<AuditoriaVinculos> {
  const agendas = (await db.execute(sql`SELECT a.id, a.name, a.location_id, a.professional_id
    FROM agenda_resources a LEFT JOIN locations l ON l.id=a.location_id
    WHERE a.active AND COALESCE(a.empresa_id, l.empresa_id)=${empresaId} ORDER BY a.id`)).rows;
  const pessoas = (await db.execute(sql`SELECT p.id, p.name FROM professionals p
    WHERE p.active AND ${condicaoCorpoClinico(empresaId)} ORDER BY p.id`)).rows;

  const naConfiguracao = new Map<number, Set<number>>();
  for (const a of agendas) {
    const v = await profissionaisVinculadosDaAgenda(empresaId, Number(a.id));
    naConfiguracao.set(Number(a.id), new Set((v?.profissionais ?? []).map((p) => p.id)));
  }
  const divergencias: DivergenciaVinculo[] = [];
  let ligados = 0;
  for (const p of pessoas) {
    const pid = Number(p.id);
    const doCadastro = await agendasDoProfissional(empresaId, pid);
    const mapa = new Map((doCadastro ?? []).map((a) => [a.id, a.vinculado]));
    for (const a of agendas) {
      const aid = Number(a.id);
      const naAgenda = naConfiguracao.get(aid)!.has(pid);
      const noCadastro = mapa.get(aid) === true;
      if (naAgenda || noCadastro) ligados++;
      if (naAgenda !== noCadastro) {
        divergencias.push({ agendaId: aid, agendaNome: String(a.name), professionalId: pid, profissionalNome: String(p.name),
          naAgendaConfiguracao: naAgenda, noCadastroDoProfissional: noCadastro });
      }
    }
  }
  const titulares = (await db.execute(sql`SELECT a.id, a.name, a.professional_id FROM agenda_resources a
    LEFT JOIN locations l ON l.id=a.location_id
    WHERE a.active AND a.professional_id IS NOT NULL AND a.location_id IS NOT NULL
      AND COALESCE(a.empresa_id, l.empresa_id)=${empresaId}
      AND NOT EXISTS (SELECT 1 FROM location_professionals lp WHERE lp.location_id=a.location_id AND lp.professional_id=a.professional_id)
    ORDER BY a.id`)).rows;
  return {
    agendas: agendas.length, profissionais: pessoas.length, paresConferidos: agendas.length * pessoas.length, paresLigados: ligados,
    divergencias,
    titularesSemVinculoDoLocal: titulares.map((t) => ({ agendaId: Number(t.id), agendaNome: String(t.name), professionalId: Number(t.professional_id) })),
  };
}
