/**
 * Task 277 — índice único de substance_applications.
 *
 * Cobre os dois comportamentos exigidos:
 *  1. Fluxo sub-semanal (intervalDays < 7): a MESMA substância na MESMA sessão
 *     com sessionNumber distintos é legítima e continua aceita.
 *  2. Migração de boot: duplicata EXATA preexistente (mesmo trio) é removida
 *     mantendo a linha mais antiga (menor id), e o índice único passa a
 *     recusar novas duplicatas exatas.
 *
 * Teste de integração: usa o banco real de desenvolvimento com um session_id
 * sintético alto (sem FK física) e limpa tudo ao final.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const SESSION_ID = 987654301; // sintético — nunca colide com dados reais
const SUB_A = 987001;
const SUB_B = 987002;

async function cleanup() {
  await db.execute(sql`DELETE FROM substance_applications WHERE session_id = ${SESSION_ID}`);
}

async function insertRow(substanceId: number, sessionNumber: number) {
  return db.execute(sql`
    INSERT INTO substance_applications
      (session_id, substance_id, dose, session_number, total_sessions, status, availability)
    VALUES (${SESSION_ID}, ${substanceId}, '1ml', ${sessionNumber}, 4, 'pending', 'disp')
    RETURNING id
  `);
}

describe("substance_applications — índice único (session_id, substance_id, session_number)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("migração de boot remove duplicata exata (mantém menor id) e cria o índice", async () => {
    // Simula banco legado: sem os índices, com duplicata exata preexistente.
    await db.execute(sql`DROP INDEX IF EXISTS substance_applications_session_substance_uidx`);
    await db.execute(sql`DROP INDEX IF EXISTS substance_applications_session_substance_num_uidx`);

    const first = await insertRow(SUB_A, 1);
    const firstId = Number((first.rows[0] as { id: number }).id);
    await insertRow(SUB_A, 1); // duplicata exata (id maior)
    await insertRow(SUB_A, 2); // legítima (sessionNumber distinto) — deve sobreviver

    // Roda a migração com estado de módulo zerado (o ensure memoiza _ready).
    vi.resetModules();
    const { ensureSubstanceApplicationsUnique } = await import("../lib/ensure-substance-applications-unique");
    await ensureSubstanceApplicationsUnique();

    const rows = await db.execute(sql`
      SELECT id, substance_id, session_number FROM substance_applications
      WHERE session_id = ${SESSION_ID} ORDER BY id
    `);
    // Sobraram exatamente 2 linhas: a original (menor id) e a legítima nº 2.
    expect(rows.rows).toHaveLength(2);
    expect(Number((rows.rows[0] as { id: number }).id)).toBe(firstId);
    expect((rows.rows as Array<{ session_number: number }>).map((r) => Number(r.session_number))).toEqual([1, 2]);

    const idx = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'substance_applications'
        AND indexname = 'substance_applications_session_substance_num_uidx'
    `);
    expect(idx.rows).toHaveLength(1);
  });

  it("fluxo sub-semanal: mesma substância na mesma sessão com sessionNumber distinto é aceita", async () => {
    // SUB_B, ocorrências 1..3 na MESMA sessão consolidada (intervalDays < 7).
    await insertRow(SUB_B, 1);
    await insertRow(SUB_B, 2);
    await insertRow(SUB_B, 3);

    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM substance_applications
      WHERE session_id = ${SESSION_ID} AND substance_id = ${SUB_B}
    `);
    expect(Number((rows.rows[0] as { n: number }).n)).toBe(3);
  });

  it("duplicata exata é recusada pelo banco", async () => {
    // drizzle embrulha o erro do pg ("Failed query"); o código 23505
    // (unique_violation) fica no cause.
    let err: unknown = null;
    try {
      await insertRow(SUB_B, 3);
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    const cause = (err as { cause?: { code?: string; constraint?: string } }).cause;
    expect(cause?.code).toBe("23505");
    expect(cause?.constraint).toBe("substance_applications_session_substance_num_uidx");
  });
});
