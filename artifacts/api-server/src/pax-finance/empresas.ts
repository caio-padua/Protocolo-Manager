import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { Request } from "express";
import { empresasPermitidas } from "./tenant";

type Row = Record<string, unknown>;

/** Seletor de empresa: so empresas autorizadas ao colaborador; nome fantasia, razao social e CNPJ para evitar confusao. */
export async function listarEmpresasSeletor(req: Request, atualId: number) {
  const ids = await empresasPermitidas(req);
  if (!ids.length) return { atualId, empresas: [] };
  const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  const r = await db.execute(sql`SELECT e.id, e.nome, e.razao_social, e.cnpj,
      f.id AS entity_id, f.cnpj AS entity_cnpj, f.razao_social AS entity_razao, f.nome_fantasia_preferencial, f.aliases, f.status_validacao
    FROM empresas e LEFT JOIN LATERAL (SELECT * FROM fin_entity x WHERE x.company_id = e.id ORDER BY x.id LIMIT 1) f ON true
    WHERE e.id IN (${lista}) AND e.ativa = true AND e.status = 'ATIVO' ORDER BY e.id`);
  return {
    atualId,
    empresas: (r.rows as Row[]).map((x) => ({
      id: Number(x.id),
      nomeFantasia: (x.nome_fantasia_preferencial as string | null) ?? (x.nome as string),
      razaoSocial: ((x.entity_razao ?? x.razao_social) as string | null) ?? null,
      cnpj: ((x.entity_cnpj ?? x.cnpj) as string | null) ?? null,
      aliases: (x.aliases as string[] | null) ?? [],
      entidadeId: x.entity_id == null ? null : Number(x.entity_id),
      statusCadastro: (x.status_validacao as string | null) ?? null,
    })),
  };
}
