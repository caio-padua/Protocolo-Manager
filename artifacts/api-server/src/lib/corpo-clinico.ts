import { sql } from "drizzle-orm";

/**
 * Corpo Clínico de uma empresa: a MESMA regra de GET /professionals (professionalIdsForCompany):
 *   - cadastro originário na empresa (professionals.empresa_id);
 *   - vínculo empresarial adicional (professional_empresas, posições 2 a 5);
 *   - vínculo com algum local da empresa (location_professionals).
 * Criar a primeira agenda de uma pessoa NÃO depende de ela já ter agenda ou vínculo de local.
 * O identificador de categoria é professionals.area_id; nome ou rótulo nunca entram na comparação.
 * `alias` é sempre uma constante do código chamador, nunca valor vindo do navegador.
 */
export function condicaoCorpoClinico(empresaId: number, alias = "p") {
  const a = sql.raw(alias);
  return sql`(${a}.empresa_id=${empresaId}
    OR EXISTS (SELECT 1 FROM professional_empresas pe WHERE pe.professional_id=${a}.id AND pe.empresa_id=${empresaId})
    OR EXISTS (SELECT 1 FROM location_professionals lp JOIN locations l ON l.id=lp.location_id
               WHERE lp.professional_id=${a}.id AND l.empresa_id=${empresaId}))`;
}
