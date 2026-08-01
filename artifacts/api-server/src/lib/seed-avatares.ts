/**
 * seed-avatares.ts — Semente dos 3 avatares iniciais do Instituto Pádua.
 *
 * Regra: APENAS adiciona — nunca apaga nem atualiza dados já editados pelo CEO.
 * Idempotente: verifica (empresaId, tipo) antes de inserir.
 *
 * Instituto Pádua → empresa_id = 5.
 */

import { db, clinicAvatarsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

type SeedLog = (msg: string) => void;
const noopLog: SeedLog = () => {};

const EMPRESA_PADUA = 5; // Instituto Pádua (PADUCCIA)

const SEED_AVATARES = [
  {
    tipo: 1,
    nomeExibido: "Dr. Caio — Médico",
    descricao: "Avatar do médico responsável. Envia lembretes clínicos, protocolos e orientações na voz do Dr. Caio.",
  },
  {
    tipo: 2,
    nomeExibido: "Secretária do Instituto Pádua",
    descricao: "Avatar da secretária. Confirma consultas, orienta sobre exames e retornos.",
  },
  {
    tipo: 3,
    nomeExibido: "Avatar Livre",
    descricao: "Propósito livre — configure o texto e a função na tela de Avatares.",
  },
] as const;

export async function runSeedAvatares(log: SeedLog = noopLog): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped  = 0;

  for (const a of SEED_AVATARES) {
    const existing = await db
      .select({ id: clinicAvatarsTable.id })
      .from(clinicAvatarsTable)
      .where(
        and(
          eq(clinicAvatarsTable.empresaId, EMPRESA_PADUA),
          eq(clinicAvatarsTable.tipo, a.tipo),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      log(`skip avatar tipo ${a.tipo} — já existe`);
      continue;
    }

    await db.insert(clinicAvatarsTable).values({
      empresaId:   EMPRESA_PADUA,
      tipo:        a.tipo,
      nomeExibido: a.nomeExibido,
      descricao:   a.descricao,
      status:      "inativo",
    });
    inserted++;
    log(`avatar criado: tipo ${a.tipo} — ${a.nomeExibido}`);
  }

  return { inserted, skipped };
}
