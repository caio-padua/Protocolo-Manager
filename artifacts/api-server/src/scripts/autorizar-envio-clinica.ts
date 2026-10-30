/**
 * Trusted server administration only — never imported by the HTTP server.
 * No browser endpoint can self-grant access or change the mapped clinic.
 */
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const args = process.argv.slice(2);
const revogar = args.includes("--revogar");
const values = args.filter((arg) => arg !== "--revogar");
const [professionalId, empresaId] = values.map(Number);
const validId = (value: number | undefined) => Number.isSafeInteger(value) && value! > 0;

try {
  if (!validId(professionalId) || (revogar ? values.length !== 1 : values.length !== 2 || !validId(empresaId))) {
    throw new Error("Uso: autorizar-envio-clinica.ts PROFESSIONAL_ID EMPRESA_ID | PROFESSIONAL_ID --revogar");
  }
  if (revogar) {
    const result = await db.execute(sql`
      UPDATE professionals SET empresa_id = NULL
       WHERE id = ${professionalId} RETURNING id
    `);
    logger.info({ professionalId, alterados: result.rows.length }, "Autorização de envio revogada");
  } else {
    // Reject nonexistent/inactive identities, including a suspended clinic.
    const result = await db.execute(sql`
      UPDATE professionals p SET empresa_id = e.id
      FROM empresas e
       WHERE p.id = ${professionalId} AND p.active = true
         AND e.id = ${empresaId} AND e.ativa = true AND e.status = 'ATIVO'
      RETURNING p.id
    `);
    if (result.rows.length !== 1) throw new Error("Profissional ou clínica inexistente/inativo");
    logger.info({ professionalId, empresaId }, "Clínica autorizada para envio");
  }
} catch (error) {
  logger.error({ err: error }, "Não foi possível alterar autorização de envio");
  process.exitCode = 1;
} finally {
  await pool.end();
}
