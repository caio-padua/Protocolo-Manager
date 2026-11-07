// Inicialização autorizada somente do Instituto no banco de desenvolvimento.
// Nunca sobrescreve a configuração existente nem executa no boot.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { aplicarOuroAoSimbolo } from "../lib/documentos/paxmed-ouro";

async function main() {
  if (process.env.NODE_ENV !== "development") throw new Error("Operação permitida apenas em desenvolvimento.");
  const location = await db.execute(sql`
    SELECT id, empresa_id FROM locations
    WHERE id = 8 AND empresa_id = 5 AND name = 'Instituto Padua' AND active = 'true'
  `);
  if (location.rows.length !== 1) throw new Error("A unidade esperada não foi encontrada.");
  const existing = await db.execute(sql`SELECT location_id FROM paxmed_2b_identidade WHERE location_id = 8`);
  if (existing.rows.length) {
    process.stdout.write("Identidade existente preservada; nenhuma configuração foi substituída.\n");
    return;
  }
  const bytes = await readFile("../padcom/src/assets/padua-dp-mask.png");
  aplicarOuroAoSimbolo(bytes);
  const id = randomUUID();
  await new ObjectStorageService().savePrivateObject(`paxmed-marcas-finais/${id}`, bytes, "image/png");
  const result = await db.execute(sql`
    INSERT INTO paxmed_2b_identidade
      (location_id, empresa_id, nome_clinica, endereco_linha1, endereco_linha2, simbolo_path)
    SELECT id, empresa_id, 'Instituto Pádua', 'Rua Guaxupé, 327 - Tatuapé',
           'CEP.: 03416-050 - São Paulo - SP', ${id}
    FROM locations
    WHERE id = 8 AND empresa_id = 5 AND name = 'Instituto Padua' AND active = 'true'
    ON CONFLICT (location_id) DO NOTHING RETURNING location_id
  `);
  if (result.rows.length !== 1) throw new Error("A identidade foi alterada por outra sessão; nada foi substituído.");
  process.stdout.write("Identidade do Instituto cadastrada em desenvolvimento.\n");
}

main().catch(() => {
  process.stderr.write("Não foi possível configurar a identidade; nenhuma configuração existente foi substituída.\n");
  process.exitCode = 1;
}).finally(() => process.exit());
