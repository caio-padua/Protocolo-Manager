import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { condicaoCorpoClinico } from "./corpo-clinico.js";

/**
 * Ligação entre AGENDA (Agenda Configuração) e PROFISSIONAL (cadastro, aba Vínculos).
 * Uma só fonte de leitura para os dois lados da tela:
 *   - "individual": a agenda tem um único titular (agenda_resources.professional_id);
 *   - "local": o profissional está vinculado ao local da agenda (location_professionals);
 *   - "preferencia": o profissional é preferido de uma agenda SEM local físico, como Home Care
 *     (agenda_profissionais_preferidos). É assim que a agenda sem local aparece no cadastro,
 *     sem criar local falso e sem dar acesso clínico por engano.
 */
export type OrigemVinculo = "individual" | "local" | "preferencia";

export interface ProfissionalVinculado {
  id: number;
  name: string;
  active: boolean;
  categoriaId: number | null;
  categoriaNome: string | null;
  habilitacaoNivel: string | null;
  origens: OrigemVinculo[];
}

type LinhaProfissional = Omit<ProfissionalVinculado, "origens">;

const ORDEM_ORIGEM: OrigemVinculo[] = ["individual", "local", "preferencia"];

/** Junta as três origens numa lista sem repetir pessoa; a mesma pessoa acumula as origens. */
export function mesclarVinculos(fontes: { origem: OrigemVinculo; linhas: LinhaProfissional[] }[]): ProfissionalVinculado[] {
  const porId = new Map<number, ProfissionalVinculado>();
  for (const { origem, linhas } of fontes) {
    for (const linha of linhas) {
      const atual = porId.get(linha.id);
      if (atual) {
        if (!atual.origens.includes(origem)) atual.origens.push(origem);
      } else {
        porId.set(linha.id, { ...linha, origens: [origem] });
      }
    }
  }
  const lista = [...porId.values()];
  for (const p of lista) p.origens.sort((a, b) => ORDEM_ORIGEM.indexOf(a) - ORDEM_ORIGEM.indexOf(b));
  return lista.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const mapearLinha = (r: Record<string, unknown>): LinhaProfissional => ({
  id: Number(r.id),
  name: String(r.name),
  active: r.active !== false,
  categoriaId: r.area_id == null ? null : Number(r.area_id),
  categoriaNome: r.area_nome == null ? null : String(r.area_nome),
  habilitacaoNivel: r.habilitacao_nivel == null ? null : String(r.habilitacao_nivel),
});

export interface VinculosDaAgenda {
  agenda: { id: number; name: string; locationId: number | null; professionalId: number | null };
  profissionais: ProfissionalVinculado[];
}

/** Quem está ligado a esta agenda no cadastro. Agenda de outra clínica não existe para quem pergunta. */
export async function profissionaisVinculadosDaAgenda(empresaId: number, agendaId: number): Promise<VinculosDaAgenda | null> {
  const agenda = (await db.execute(sql`SELECT a.id, a.name, a.location_id, a.professional_id
    FROM agenda_resources a LEFT JOIN locations l ON l.id=a.location_id
    WHERE a.id=${agendaId} AND COALESCE(a.empresa_id, l.empresa_id)=${empresaId}`)).rows[0];
  if (!agenda) return null;
  const colunas = sql`p.id, p.name, p.active, p.area_id, pa.name AS area_nome, p.habilitacao_nivel`;
  const [individual, local, preferencia] = await Promise.all([
    agenda.professional_id == null ? { rows: [] } : db.execute(sql`SELECT ${colunas} FROM professionals p
      LEFT JOIN professional_areas pa ON pa.id=p.area_id WHERE p.id=${agenda.professional_id}`),
    agenda.location_id == null ? { rows: [] } : db.execute(sql`SELECT ${colunas} FROM location_professionals lp
      JOIN professionals p ON p.id=lp.professional_id LEFT JOIN professional_areas pa ON pa.id=p.area_id
      WHERE lp.location_id=${agenda.location_id}`),
    db.execute(sql`SELECT ${colunas} FROM agenda_profissionais_preferidos f
      JOIN professionals p ON p.id=f.professional_id LEFT JOIN professional_areas pa ON pa.id=p.area_id
      WHERE f.agenda_id=${agendaId} AND f.empresa_id=${empresaId}`),
  ]);
  return {
    agenda: {
      id: Number(agenda.id), name: String(agenda.name),
      locationId: agenda.location_id == null ? null : Number(agenda.location_id),
      professionalId: agenda.professional_id == null ? null : Number(agenda.professional_id),
    },
    profissionais: mesclarVinculos([
      { origem: "individual", linhas: individual.rows.map(mapearLinha) },
      { origem: "local", linhas: local.rows.map(mapearLinha) },
      { origem: "preferencia", linhas: preferencia.rows.map(mapearLinha) },
    ]),
  };
}

export interface AgendaDoProfissional {
  id: number;
  name: string;
  locationId: number | null;
  empresaId: number;
  modality: string | null;
  color: string | null;
  categoriaId: number | null;
  categoriaNome: string | null;
  /** O profissional está ligado a esta agenda por alguma origem. */
  vinculado: boolean;
  origens: OrigemVinculo[];
  /** O cadastro pode ligar/desligar aqui: só agenda SEM local, de categoria compatível e que não é titularidade individual. */
  editavelNoCadastro: boolean;
  /** Motivo exato quando não pode editar aqui (nunca silencioso). */
  motivoBloqueio: string | null;
}

/** Todas as agendas ativas da clínica, com a situação do profissional em cada uma. */
export async function agendasDoProfissional(empresaId: number, professionalId: number): Promise<AgendaDoProfissional[] | null> {
  const pessoa = (await db.execute(sql`SELECT p.id, p.area_id FROM professionals p
    WHERE p.id=${professionalId} AND ${condicaoCorpoClinico(empresaId)}`)).rows[0];
  if (!pessoa) return null;
  const { rows } = await db.execute(sql`SELECT a.id, a.name, a.location_id, a.modality, a.color, a.category_id,
      COALESCE(a.empresa_id, l.empresa_id) AS empresa_id, a.professional_id AS titular_id, pa.name AS categoria_nome,
      EXISTS (SELECT 1 FROM location_professionals lp WHERE lp.location_id=a.location_id AND lp.professional_id=${professionalId}) AS via_local,
      EXISTS (SELECT 1 FROM agenda_profissionais_preferidos f WHERE f.agenda_id=a.id AND f.empresa_id=${empresaId}
              AND f.professional_id=${professionalId}) AS via_preferencia
    FROM agenda_resources a LEFT JOIN locations l ON l.id=a.location_id
    LEFT JOIN professional_areas pa ON pa.id=a.category_id
    WHERE a.active AND COALESCE(a.empresa_id, l.empresa_id)=${empresaId}
    ORDER BY a.sort_order, a.id`);
  return rows.map((r) => {
    const origens: OrigemVinculo[] = [];
    if (r.titular_id != null && Number(r.titular_id) === professionalId) origens.push("individual");
    if (r.via_local === true) origens.push("local");
    if (r.via_preferencia === true) origens.push("preferencia");
    const semLocal = r.location_id == null;
    const categoriaAgenda = r.category_id == null ? null : Number(r.category_id);
    const categoriaPessoa = pessoa.area_id == null ? null : Number(pessoa.area_id);
    let motivoBloqueio: string | null = null;
    if (!semLocal) motivoBloqueio = "Agenda com local: o vínculo é feito pelo local, na lista de clínicas acima.";
    else if (origens.includes("individual")) motivoBloqueio = "Agenda individual deste profissional: o titular é definido em Agenda Configuração.";
    else if (categoriaAgenda == null) motivoBloqueio = "A agenda não tem categoria definida em Agenda Configuração.";
    else if (categoriaAgenda !== categoriaPessoa) motivoBloqueio = "Categoria profissional diferente da categoria da agenda.";
    return {
      id: Number(r.id), name: String(r.name),
      locationId: r.location_id == null ? null : Number(r.location_id),
      empresaId: Number(r.empresa_id),
      modality: r.modality == null ? null : String(r.modality),
      color: r.color == null ? null : String(r.color),
      categoriaId: categoriaAgenda,
      categoriaNome: r.categoria_nome == null ? null : String(r.categoria_nome),
      vinculado: origens.length > 0,
      origens,
      editavelNoCadastro: motivoBloqueio === null,
      motivoBloqueio,
    };
  });
}

export type ResultadoPreferencia =
  | { ok: true; vinculado: boolean }
  | { ok: false; status: 404 | 409; code: string; error: string };

/** Liga ou desliga UM profissional como preferido de uma agenda sem local (mesmas travas do PUT em lista). */
export async function definirPreferenciaDoProfissional(
  empresaId: number, agendaId: number, professionalId: number, vinculado: boolean, atorId: number | null,
): Promise<ResultadoPreferencia> {
  const agenda = (await db.execute(sql`SELECT id, category_id, location_id, professional_id FROM agenda_resources
    WHERE id=${agendaId} AND empresa_id=${empresaId} AND active`)).rows[0];
  if (!agenda) return { ok: false, status: 404, code: "agenda_nao_encontrada", error: "Agenda não encontrada nesta clínica." };
  if (agenda.location_id != null) {
    return { ok: false, status: 409, code: "agenda_com_local", error: "Esta agenda tem local: o vínculo é feito pelo local do profissional." };
  }
  if (vinculado) {
    if (agenda.professional_id != null) {
      return { ok: false, status: 409, code: "agenda_individual", error: "Agenda individual: o titular é definido em Agenda Configuração." };
    }
    const valido = (await db.execute(sql`SELECT p.id FROM professionals p WHERE p.id=${professionalId} AND p.active
      AND p.area_id=${agenda.category_id} AND ${condicaoCorpoClinico(empresaId)}`)).rows[0];
    if (!valido) {
      return { ok: false, status: 409, code: "profissional_incompativel", error: "Profissional inativo, de outra clínica ou de categoria diferente da agenda." };
    }
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM agenda_profissionais_preferidos
      WHERE agenda_id=${agendaId} AND empresa_id=${empresaId} AND professional_id=${professionalId}`);
    if (vinculado) {
      await tx.execute(sql`INSERT INTO agenda_profissionais_preferidos (empresa_id, agenda_id, professional_id, criado_por)
        VALUES (${empresaId}, ${agendaId}, ${professionalId}, ${atorId})`);
    }
  });
  return { ok: true, vinculado };
}
