/**
 * Teste de idempotência do #75 — prova que o mesmo eventId não penaliza duas vezes.
 * Executar: npx tsx src/scripts/test-idempotencia-75.ts
 *
 * Saída esperada:
 *   [1] Primeira chamada → penalidade registrada (tentativas_falha = 1)
 *   [2] Segunda chamada (mesmo eventId) → dedup disparou, tentativas_falha ainda = 1
 *   [3] Terceira chamada (mesmo eventId) → dedup disparou, tentativas_falha ainda = 1
 *   [4] Quarta chamada (eventId DIFERENTE) → nova penalidade, tentativas_falha = 2
 *   RESULTADO: ✅ idempotência confirmada
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { registrarFalha } from "../lib/concierge-penalidade.js";

const CPF_TESTE = "00000000191"; // CPF de dígitos válidos para teste

async function lerPenalidade(cpf: string) {
  const rows = await db.execute(
    sql`SELECT tentativas_falha, bloqueado_permanente FROM concierge_penalidades WHERE cpf = ${cpf}`,
  );
  return rows.rows[0] ?? null;
}

async function limpar(cpf: string) {
  await db.execute(sql`DELETE FROM concierge_penalidades WHERE cpf = ${cpf}`);
  // tabela pode ainda não existir no primeiro run — ignora erro
  try {
    await db.execute(sql`DELETE FROM concierge_webhook_eventos WHERE cpf = ${cpf}`);
  } catch { /* ok */ }
}

async function main() {
  console.log("=== Teste de Idempotência #75 ===\n");
  await limpar(CPF_TESTE);

  const eventId = `teste-idem-${Date.now()}`;

  // [1] Primeira chamada — deve registrar penalidade
  await registrarFalha(CPF_TESTE, eventId);
  const p1 = await lerPenalidade(CPF_TESTE);
  console.log(`[1] Após 1ª chamada (eventId="${eventId}"):`);
  console.log(`    tentativas_falha = ${p1?.tentativas_falha}`);
  if (p1?.tentativas_falha !== 1) throw new Error("FALHOU: esperava 1, got " + p1?.tentativas_falha);
  console.log("    ✅ correto\n");

  // [2] Segunda chamada — mesmo eventId, dedup deve bloquear
  await registrarFalha(CPF_TESTE, eventId);
  const p2 = await lerPenalidade(CPF_TESTE);
  console.log(`[2] Após 2ª chamada (mesmo eventId):`);
  console.log(`    tentativas_falha = ${p2?.tentativas_falha}`);
  if (p2?.tentativas_falha !== 1) throw new Error("FALHOU: esperava 1, got " + p2?.tentativas_falha);
  console.log("    ✅ dedup funcionou\n");

  // [3] Terceira chamada — mesmo eventId, dedup deve bloquear
  await registrarFalha(CPF_TESTE, eventId);
  const p3 = await lerPenalidade(CPF_TESTE);
  console.log(`[3] Após 3ª chamada (mesmo eventId):`);
  console.log(`    tentativas_falha = ${p3?.tentativas_falha}`);
  if (p3?.tentativas_falha !== 1) throw new Error("FALHOU: esperava 1, got " + p3?.tentativas_falha);
  console.log("    ✅ dedup funcionou\n");

  // [4] Quarta chamada — eventId DIFERENTE, deve penalizar
  const eventId2 = `teste-idem-${Date.now()}-v2`;
  await registrarFalha(CPF_TESTE, eventId2);
  const p4 = await lerPenalidade(CPF_TESTE);
  console.log(`[4] Após 4ª chamada (eventId DIFERENTE="${eventId2}"):`);
  console.log(`    tentativas_falha = ${p4?.tentativas_falha}`);
  if (p4?.tentativas_falha !== 2) throw new Error("FALHOU: esperava 2, got " + p4?.tentativas_falha);
  console.log("    ✅ novo evento registrado corretamente\n");

  await limpar(CPF_TESTE);
  console.log("=== RESULTADO: ✅ idempotência #75 confirmada ===");
}

main().catch(err => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
