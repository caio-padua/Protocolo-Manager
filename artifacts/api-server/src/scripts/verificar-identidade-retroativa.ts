// Verificação de identidade retroativa (sem IA, sem leitura de PDF).
// Documentos extraídos ANTES do porteiro de identidade têm resultados gravados, mas nenhum
// registro 'verificacao'. Sem esse registro a Área do Cliente os esconde (por segurança).
// Este script aplica o MESMO porteiro, sobre a identidade já guardada na extração, uma vez
// por documento. Idempotente: nunca altera resultados, status ou documento já verificado.
// Uso: tsx src/scripts/verificar-identidade-retroativa.ts <empresaId> <idDoc>[,<idDoc>...] [--aplicar]
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { runIdentityGate } from "../lib/exam-extraction/identity-gate";
import type { ExtractedExam } from "../lib/exam-extraction/schema";

async function main() {
  if (process.env.NODE_ENV !== "development") throw new Error("Operação permitida apenas em desenvolvimento.");
  const empresaId = Number(process.argv[2]);
  const ids = (process.argv[3] ?? "").split(",").map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
  const aplicar = process.argv.includes("--aplicar");
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || ids.length === 0) throw new Error("Informe empresa e documentos.");

  const rows = (
    await db.execute(sql`
      SELECT d.id, d.client_id, d.model_used, d.raw_json, d.llm_pipeline
      FROM exam_documents d
      WHERE d.id IN (${sql.join(ids.map((n) => sql`${n}`), sql`, `)})
        AND d.empresa_id = ${empresaId}
        AND d.status IN ('recebido', 'conferido_1')
        AND EXISTS (SELECT 1 FROM exam_results r WHERE r.exam_document_id = d.id)
        AND NOT EXISTS (SELECT 1 FROM exam_identity_checks i WHERE i.document_id = d.id AND i.event = 'verificacao')
    `)
  ).rows as Array<Record<string, any>>;
  process.stdout.write(`Elegíveis: ${rows.length} de ${ids.length}. Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}.\n`);
  if (!aplicar) return;

  for (const row of rows) {
    let extracted: ExtractedExam;
    try {
      extracted = typeof row.raw_json === "string" ? JSON.parse(row.raw_json) : row.raw_json;
    } catch {
      process.stdout.write(`Documento ${row.id}: extração ilegível; ignorado.\n`);
      continue;
    }
    if (!extracted?.patient) {
      process.stdout.write(`Documento ${row.id}: sem identidade guardada; ignorado.\n`);
      continue;
    }
    const pipeline = Array.isArray(row.llm_pipeline) ? row.llm_pipeline : [];
    const result = await runIdentityGate({
      documentId: Number(row.id),
      clientId: Number(row.client_id),
      extracted,
      modelUsed: String(row.model_used ?? "retroativo"),
      pipeline,
    });
    process.stdout.write(
      `Documento ${row.id}: veredito=${result.assessment.verdict}; decisão=${result.assessment.decision}; campos=${JSON.stringify(result.assessment.fields)}.\n`,
    );
  }
}

main().catch((e) => {
  process.stderr.write(`Falha: ${e instanceof Error ? e.message : "erro"}\n`);
  process.exitCode = 1;
}).finally(() => process.exit());
