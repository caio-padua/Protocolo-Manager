/**
 * Aliases de unidade FISICAMENTE EQUIVALENTES (fator 1), por analito, validados por análise dimensional.
 * Só entram aqui diferenças de ESCRITA. Nada que exija fator real, massa molar, método ou outra
 * grandeza (diferenciais /uL -> %, TP atividade % -> segundos, D-dímero FEU/DDU, testosterona, insulina).
 *
 * O cadastro é ADITIVO e idempotente: nunca apaga, nunca troca a unidade padrão, nunca altera fator existente.
 * Escreve na mesma tabela (exam_analyte_units) que a tela do Console de Exames lê e que loadUnits usa.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { normUnit } from "./exam-extraction/persist";

export interface AliasEquivalente {
  analyteCode: string;
  /** unidade padrão que o catálogo DEVE ter; se divergir, nada é gravado. */
  canonicalEsperada: string;
  alias: string;
  motivo: string;
}

export const ALIASES_EQUIVALENTES: readonly AliasEquivalente[] = [
  { analyteCode: "hemacias", canonicalEsperada: "milhões/mm³", alias: "10^6/μL", motivo: "1 μL = 1 mm³; 10^6 = milhão" },
  { analyteCode: "hemacias", canonicalEsperada: "milhões/mm³", alias: "x106/uL", motivo: "1 μL = 1 mm³; x10^6 = milhão" },
  { analyteCode: "leucocitos", canonicalEsperada: "/mm³", alias: "/μL", motivo: "1 μL = 1 mm³" },
  { analyteCode: "taxa de filtracao glomerular (egfr)", canonicalEsperada: "mL/min/1.73m²", alias: "mL/min/1,73m²", motivo: "mesma unidade; vírgula decimal" },
  { analyteCode: "tempo de protrombina tempo em segundos", canonicalEsperada: "seg", alias: "s", motivo: "s = segundo; padrão do analito é duração em segundos" },
];

export type DecisaoAlias = "inserido" | "ja_existe" | "bloqueado";
export interface RelatorioAlias {
  analyteCode: string;
  alias: string;
  decisao: DecisaoAlias;
  motivo: string;
}

/** Valida e (se aplicar) grava, tudo em UMA transação. Em simulação a transação é revertida. */
export async function cadastrarAliasesEquivalentes(opts: { aplicar: boolean }): Promise<RelatorioAlias[]> {
  const relatorio: RelatorioAlias[] = [];
  class Rollback extends Error {}
  try {
    await db.transaction(async (tx) => {
      for (const a of ALIASES_EQUIVALENTES) {
        const bloquear = (motivo: string) => relatorio.push({ analyteCode: a.analyteCode, alias: a.alias, decisao: "bloqueado", motivo });
        const cat = (await tx.execute(sql`SELECT canonical_unit FROM exam_analyte_catalog WHERE code = ${a.analyteCode}`)).rows as Array<{ canonical_unit: string | null }>;
        if (cat.length !== 1) { bloquear("analito ausente do catálogo"); continue; }
        if (normUnit(cat[0].canonical_unit) !== normUnit(a.canonicalEsperada)) { bloquear("unidade padrão do catálogo diferente da esperada"); continue; }
        const unidades = (await tx.execute(sql`
          SELECT unit, factor_to_canonical, is_canonical, active FROM exam_analyte_units WHERE analyte_code = ${a.analyteCode}
        `)).rows as Array<{ unit: string; factor_to_canonical: string | null; is_canonical: boolean; active: boolean }>;
        const canon = unidades.filter((u) => u.is_canonical);
        if (canon.length !== 1 || normUnit(canon[0].unit) !== normUnit(a.canonicalEsperada) || Number(canon[0].factor_to_canonical) !== 1) {
          bloquear("unidade padrão cadastrada ausente, duplicada ou com fator diferente de 1"); continue;
        }
        const mesmaEscrita = unidades.filter((u) => normUnit(u.unit) === normUnit(a.alias));
        if (mesmaEscrita.length > 0) {
          const ok = mesmaEscrita.every((u) => u.active && Number(u.factor_to_canonical) === 1);
          relatorio.push({ analyteCode: a.analyteCode, alias: a.alias, decisao: ok ? "ja_existe" : "bloqueado", motivo: ok ? "já cadastrado com fator 1" : "escrita equivalente já existe com fator ou estado diferente" });
          continue;
        }
        await tx.execute(sql`
          INSERT INTO exam_analyte_units (analyte_code, unit, factor_to_canonical, is_canonical, active, ordem)
          VALUES (${a.analyteCode}, ${a.alias}, 1, false, true,
                  (SELECT COALESCE(MAX(ordem), 0) + 1 FROM exam_analyte_units WHERE analyte_code = ${a.analyteCode}))
          ON CONFLICT (analyte_code, unit) DO NOTHING
        `);
        relatorio.push({ analyteCode: a.analyteCode, alias: a.alias, decisao: "inserido", motivo: a.motivo });
      }
      if (!opts.aplicar) throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return relatorio;
}
