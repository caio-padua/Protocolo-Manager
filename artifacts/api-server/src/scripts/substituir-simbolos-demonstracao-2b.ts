// Atualização manual da demonstração autorizada: somente em desenvolvimento.
// Os objetos antigos permanecem no armazenamento; nenhuma marca oficial é alterada.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { aplicarOuroAoSimbolo } from "../lib/documentos/paxmed-ouro";

const targets = [
  [2, "Instituto Lemos", "lemos"],
  [3, "Instituto Barros", "barros"],
  [4, "Instituto Genesis", "genesis"],
  [7, "Instituto Barakat", "barakat"],
  [8, "Instituto Paluzze", "paluzze"],
  [10, "Instituto Pazialle", "pazialle"],
  [11, "Instituto Paduzzi", "paduzzi"],
  [12, "Instituto Paduzzi Guarulhos", "paduzzi-guarulhos"],
  [13, "Instituto Padilha", "padilha"],
] as const;

async function main() {
  if (process.env.NODE_ENV !== "development" || !process.argv.includes("--confirmar-exemplos")) {
    throw new Error("Operação manual permitida apenas em desenvolvimento com confirmação explícita.");
  }
  const storage = new ObjectStorageService();
  const updates: Array<{ empresa: number; nome: string; versao: number; anterior: string; novo: string }> = [];
  for (const [empresa, nome, arquivo] of targets) {
    const found = await db.execute(sql`
      SELECT e.nome, e.ativa, i.versao, i.simbolo_path, i.simbolo_exemplo
      FROM empresas e JOIN paxmed_2b_empresa_identidade i ON i.empresa_id = e.id
      WHERE e.id = ${empresa}
    `);
    const row = found.rows[0] as { nome: string; ativa: boolean; versao: number; simbolo_path: string; simbolo_exemplo: boolean } | undefined;
    // Versão conhecida da demonstração antes desta operação. Caso o usuário
    // tenha editado a identidade, interromper sem sobrescrever sua alteração.
    if (!row || row.nome !== nome || !row.ativa || !row.simbolo_exemplo || Number(row.versao) !== 2) {
      throw new Error(`${nome}: identidade mudou ou não é provisória; nenhuma identidade foi atualizada.`);
    }
    const original = readFileSync(resolve(`../../generated-artifacts/marcas-clinicas-ficticias/preparado-${arquivo}.png`));
    aplicarOuroAoSimbolo(original);
    const novo = randomUUID();
    await storage.savePrivateObject(`paxmed-marcas-finais/${novo}`, original, "image/png");
    updates.push({ empresa, nome, versao: Number(row.versao), anterior: row.simbolo_path, novo });
  }
  await db.transaction(async (tx) => {
    for (const item of updates) {
      const changed = await tx.execute(sql`
        UPDATE paxmed_2b_empresa_identidade SET simbolo_path = ${item.novo},
          versao = versao + 1, atualizado_em = NOW()
        WHERE empresa_id = ${item.empresa} AND versao = ${item.versao}
          AND simbolo_path = ${item.anterior} AND simbolo_exemplo = TRUE
        RETURNING empresa_id
      `);
      if (changed.rows.length !== 1) throw new Error(`${item.nome}: edição concorrente; atualização cancelada.`);
    }
  });
  for (const item of updates) console.info(`${item.nome}: símbolo de demonstração atualizado.`);
  console.info(`${updates.length} identidades atualizadas; símbolos anteriores preservados.`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
