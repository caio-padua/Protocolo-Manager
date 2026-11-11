import type { pool } from "@workspace/db";
import { CreateProcedimentoBody } from "@workspace/api-zod";
import { z } from "zod";
import { durationSecondsFromMinutes } from "./substance-duration";

type Pool = typeof pool;

const entrada = CreateProcedimentoBody.strict().superRefine((value, ctx) => {
  if (!value.nome.trim()) ctx.addIssue({ code: "custom", path: ["nome"], message: "Informe o nome." });
  if (value.produtoIds.some((id) => !Number.isSafeInteger(id)) || new Set(value.produtoIds).size !== value.produtoIds.length) {
    ctx.addIssue({ code: "custom", path: ["produtoIds"], message: "Selecione produtos válidos sem repetição." });
  }
  const grupos = value.profissionaisNecessarios;
  if (value.ativo && grupos.length === 0) {
    ctx.addIssue({ code: "custom", path: ["profissionaisNecessarios"], message: "Informe os profissionais necessários." });
  }
  if (new Set(grupos.map((g) => `${g.areaId}:${g.localId}`)).size !== grupos.length ||
      grupos.some((g) => !Number.isSafeInteger(g.areaId) || !Number.isSafeInteger(g.localId) ||
        g.professionalIds.some((id) => !Number.isSafeInteger(id)) ||
        new Set(g.professionalIds).size !== g.professionalIds.length)) {
    ctx.addIssue({ code: "custom", path: ["profissionaisNecessarios"], message: "Confira as áreas, locais e profissionais sem repetição." });
  }
  if (value.dose && /(?:ml\b|%|\/)/i.test(value.dose)) {
    ctx.addIssue({ code: "custom", path: ["dose"], message: "Informe a dose, sem volume nem concentração." });
  }
  if (value.duracaoMinutos == null && value.ativo) {
    ctx.addIssue({ code: "custom", path: ["duracaoMinutos"], message: "Informe a duração para um procedimento ativo." });
  } else if (value.duracaoMinutos != null) {
    try {
      durationSecondsFromMinutes(value.duracaoMinutos);
    } catch {
      ctx.addIssue({ code: "custom", path: ["duracaoMinutos"], message: "Informe uma duração positiva correspondente a segundos inteiros." });
    }
  }
});

export type EntradaProcedimento = z.infer<typeof entrada>;
export function validarProcedimento(data: unknown) {
  return entrada.safeParse(data);
}

export class ProcedimentoErro extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Queryable = Pick<Pool, "query">;
type Linha = {
  id: number; empresa_id: number; nome: string; tipo: string | null; dose: string | null;
  descricao: string | null; duracao_minutos: number | null; ativo: boolean; produto_ids: number[];
  profissionais_necessarios: { areaId: number; localId: number; professionalIds: number[] }[];
};
function formatar(row: Linha) {
  return {
    id: row.id, empresaId: row.empresa_id, nome: row.nome, tipo: row.tipo, dose: row.dose,
    profissionaisNecessarios: row.profissionais_necessarios,
    descricao: row.descricao, duracaoMinutos: row.duracao_minutos, ativo: row.ativo,
    produtoIds: row.produto_ids,
  };
}

const LISTA_SQL = `
  SELECT p.id, p.empresa_id, p.nome, p.tipo, p.dose, p.descricao,
    COALESCE(p.duracao_segundos::double precision / 60, p.duracao_minutos::double precision) AS duracao_minutos, p.ativo,
         COALESCE(array_agg(pp.produto_id ORDER BY pp.produto_id)
           FILTER (WHERE pp.ativo = TRUE AND pp.produto_id IS NOT NULL), '{}') AS produto_ids,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'areaId', e.area_id, 'localId', e.location_id,
           'professionalIds', (SELECT COALESCE(jsonb_agg(ep.professional_id ORDER BY ep.professional_id), '[]'::jsonb)
             FROM procedimento_equipes_profissionais ep WHERE ep.equipe_id=e.id)) ORDER BY e.id)
           FROM procedimento_equipes e WHERE e.procedimento_id=p.id AND e.ativo), '[]'::jsonb) AS profissionais_necessarios
    FROM procedimentos_clinicos p
    LEFT JOIN procedimento_produtos pp ON pp.procedimento_id = p.id
   WHERE p.empresa_id = $1 AND ($2::integer IS NULL OR p.id = $2)
   GROUP BY p.id ORDER BY p.nome, p.id`;

export async function listarProcedimentos(db: Queryable, empresaId: number, id: number | null = null) {
  const result = await db.query<Linha>(LISTA_SQL, [empresaId, id]);
  return result.rows.map(formatar);
}

export async function salvarProcedimento(pool: Pool, empresaId: number, data: EntradaProcedimento, professionalId: number, id?: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (id !== undefined) {
      const current = await client.query(
        "SELECT id FROM procedimentos_clinicos WHERE id = $1 AND empresa_id = $2 FOR UPDATE", [id, empresaId],
      );
      if (!current.rowCount) throw new ProcedimentoErro(404, "Procedimento não encontrado nesta clínica.");
      const [anterior] = await listarProcedimentos(client, empresaId, id);
      await client.query("INSERT INTO procedimento_revisoes(procedimento_id, professional_id, conteudo_anterior) VALUES ($1,$2,$3::jsonb)",
        [id, professionalId, JSON.stringify(anterior)]);
    }
    const slugs = new Set<string>();
    for (const grupo of data.profissionaisNecessarios) {
      const elegiveis = await client.query<{ id: number; slug: string }>(
        `SELECT p.id, a.slug FROM professionals p
         JOIN professional_areas a ON a.id=p.area_id AND a.active=TRUE
         JOIN location_professionals lp ON lp.professional_id=p.id
         JOIN locations l ON l.id=lp.location_id AND l.active='true'
         WHERE p.active=TRUE AND p.area_id=$1 AND l.id=$2 AND l.empresa_id=$3 AND p.id=ANY($4::int[])
         FOR SHARE OF p,a,lp,l`,
        [grupo.areaId, grupo.localId, empresaId, grupo.professionalIds],
      );
      if (elegiveis.rowCount !== grupo.professionalIds.length) {
        throw new ProcedimentoErro(400, "Profissional, área ou local não está ativo e vinculado a esta clínica.");
      }
      elegiveis.rows.forEach((row) => slugs.add(row.slug));
    }
    if (data.produtoIds.length) {
      const products = await client.query<{ id: number; procedure_type: string; doctor_participation: boolean | null }>(
        "SELECT id, procedure_type, doctor_participation FROM substances WHERE id = ANY($1::int[]) FOR SHARE",
        [data.produtoIds],
      );
      if (products.rowCount !== data.produtoIds.length) {
        throw new ProcedimentoErro(400, "Um dos produtos selecionados não existe mais.");
      }
      if (products.rows.some((p) => p.procedure_type === "implant") &&
          (!slugs.has("medicina") || !slugs.has("enfermagem"))) {
        throw new ProcedimentoErro(400, "Implante exige profissionais de medicina e enfermagem.");
      }
    }
    const segundos = data.duracaoMinutos == null ? null : durationSecondsFromMinutes(data.duracaoMinutos);
    // Manter o campo anterior apenas quando a representação for exata,
    // sem arredondar nem sobrescrever registros legados.
    const minutosLegados = data.duracaoMinutos != null
      && Math.abs(data.duracaoMinutos * 100 - Math.round(data.duracaoMinutos * 100)) < 1e-8
      ? data.duracaoMinutos : null;
    const values = [empresaId, data.nome.trim(), data.descricao?.trim() || null, minutosLegados, data.ativo, segundos, data.dose?.trim() || null];
    const result = id === undefined
      ? await client.query<{ id: number }>(
        `INSERT INTO procedimentos_clinicos (empresa_id, nome, descricao, duracao_minutos, ativo, duracao_segundos, dose)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, values)
      : await client.query<{ id: number }>(
        `UPDATE procedimentos_clinicos SET nome=$2, descricao=$3, duracao_minutos=$4,
          ativo=$5, duracao_segundos=$6, dose=$7, updated_at=NOW() WHERE empresa_id=$1 AND id=$8 RETURNING id`, [...values, id]);
    const procedimentoId = result.rows[0].id;
    await client.query("UPDATE procedimento_equipes SET ativo=FALSE WHERE procedimento_id=$1 AND ativo=TRUE", [procedimentoId]);
    for (const grupo of data.profissionaisNecessarios) {
      const inserted = await client.query<{ id: number }>(
        "INSERT INTO procedimento_equipes(procedimento_id, area_id, location_id) VALUES ($1,$2,$3) RETURNING id",
        [procedimentoId, grupo.areaId, grupo.localId]);
      await client.query(`INSERT INTO procedimento_equipes_profissionais(equipe_id, professional_id)
        SELECT $1, unnest($2::integer[])`, [inserted.rows[0].id, grupo.professionalIds]);
    }
    await client.query("UPDATE procedimento_produtos SET ativo = FALSE WHERE procedimento_id = $1 AND ativo = TRUE", [procedimentoId]);
    if (data.produtoIds.length) {
      await client.query(
        `INSERT INTO procedimento_produtos (procedimento_id, produto_id, ativo)
         SELECT $1, produto_id, TRUE FROM unnest($2::integer[]) AS produto_id
         ON CONFLICT (procedimento_id, produto_id) DO UPDATE SET ativo=TRUE`,
        [procedimentoId, data.produtoIds],
      );
    }
    const [saved] = await listarProcedimentos(client, empresaId, procedimentoId);
    await client.query("COMMIT");
    return saved;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
