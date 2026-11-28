/**
 * Boot: preenchimento inicial e NÃO destrutivo dos papéis por clínica (Plano Mestre de Permissões).
 * - Só INSERE linhas que ainda não existem (ON CONFLICT DO NOTHING): nunca altera papel já cadastrado.
 * - Não cria tabela: o esquema vem do Publish. Tabela ausente = registra aviso e segue (fail-closed continua).
 * - Papel derivado da categoria; "outro" e "licenciado" ficam SEM papel (decisão do CEO: atribuição manual).
 * - O CEO (dono da plataforma) recebe médico + administrador na clínica de origem.
 * - Clínicas: a de origem (professionals.empresa_id) e as extras (professional_empresas).
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function ensurePapeisIniciais(): Promise<{ inseridos: number } | null> {
  const existe = await db.execute(sql`SELECT to_regclass('public.professional_papeis_empresa') AS t`);
  const t = (existe.rows?.[0] as { t: string | null } | undefined)?.t;
  if (!t) {
    logger.warn("papeis-iniciais: tabela professional_papeis_empresa ausente; publique o esquema antes. Nada foi preenchido.");
    return null;
  }
  const r = await db.execute(sql`
    WITH vinculos AS (
      SELECT p.id AS professional_id, p.empresa_id, p.category, p.is_platform_owner
        FROM professionals p
       WHERE p.active AND p.empresa_id IS NOT NULL
      UNION
      SELECT p.id, pe.empresa_id, p.category, p.is_platform_owner
        FROM professionals p
        JOIN professional_empresas pe ON pe.professional_id = p.id
       WHERE p.active AND pe.empresa_id IS NOT NULL
    ), novos AS (
      INSERT INTO professional_papeis_empresa
        (professional_id, empresa_id, is_clinic_admin, is_doctor, is_nurse, is_reception, is_finance, origem)
      SELECT v.professional_id, v.empresa_id,
             v.is_platform_owner,
             (v.category = 'medico'),
             (v.category = 'enfermagem'),
             (v.category = 'recepcao'),
             (v.category IN ('financeiro', 'administrativo')),
             'boot_categoria'
        FROM vinculos v
       WHERE v.is_platform_owner
          OR v.category IN ('medico', 'enfermagem', 'recepcao', 'financeiro', 'administrativo')
      ON CONFLICT (professional_id, empresa_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM novos
  `);
  const n = Number((r.rows?.[0] as { n: number } | undefined)?.n ?? 0);
  logger.info({ inseridos: n }, "papeis-iniciais: preenchimento concluído (sem sobrescrever)");
  return { inseridos: n };
}
