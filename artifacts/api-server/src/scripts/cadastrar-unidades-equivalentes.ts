// Cadastro aditivo de aliases de unidade equivalentes (fator 1) + simulação de reclassificação.
// Não altera resultados clínicos. Sem dados pessoais na saída.
// Uso: tsx src/scripts/cadastrar-unidades-equivalentes.ts [--aplicar]
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ALIASES_EQUIVALENTES, cadastrarAliasesEquivalentes } from "../lib/exam-units-equivalentes";
import { normUnit } from "../lib/exam-extraction/persist";

async function main() {
  if (process.env.NODE_ENV !== "development") throw new Error("Operação permitida apenas em desenvolvimento.");
  const aplicar = process.argv.includes("--aplicar");
  const relatorio = await cadastrarAliasesEquivalentes({ aplicar });
  process.stdout.write(`Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}\n`);
  for (const r of relatorio) process.stdout.write(`${r.analyteCode} | ${r.alias} | ${r.decisao} | ${r.motivo}\n`);

  // Simulação de reclassificação: só conta resultados retidos cuja unidade passa a ser reconhecida.
  const normAlias = new Map(ALIASES_EQUIVALENTES.map((a) => [`${a.analyteCode}|${normUnit(a.alias)}`, a]));
  const retidos = (await db.execute(sql`
    SELECT analyte_code, unit_raw, ref_low, ref_high, value_canonical, count(*)::int AS n
    FROM exam_results WHERE status = 'conferencia' GROUP BY 1,2,3,4,5
  `)).rows as Array<{ analyte_code: string; unit_raw: string; ref_low: string | null; ref_high: string | null; value_canonical: string | null; n: number }>;
  let total = 0, elegiveis = 0, comValor = 0, comFaixa = 0;
  for (const r of retidos) {
    total += r.n;
    if (!normAlias.has(`${r.analyte_code}|${normUnit(r.unit_raw)}`)) continue;
    elegiveis += r.n;
    if (r.value_canonical !== null) comValor += r.n;
    if (r.ref_low !== null || r.ref_high !== null) comFaixa += r.n;
  }
  process.stdout.write(`Retidos em conferência: ${total}. Elegíveis aos novos aliases: ${elegiveis} (com valor canônico: ${comValor}; com faixa do laudo: ${comFaixa}). Nenhum resultado foi alterado.\n`);
  process.exit(0);
}
main().catch((e) => { process.stderr.write(`Falha: ${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); });
