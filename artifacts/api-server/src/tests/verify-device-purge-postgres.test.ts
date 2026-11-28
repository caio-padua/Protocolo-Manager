import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { startIsolatedPostgres } from "./helpers/postgres-isolado.js";

// Keep the real SQL builder and module. Only redirect the database boundary to
// our disposable cluster; never import the application's configured connection.
const database = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: database }));

import {
  purgeExpiredVerificationCodes,
  purgeExpiredVerifiedSessions,
} from "../lib/device-throttle.js";

let postgres: Awaited<ReturnType<typeof startIsolatedPostgres>>;
let client: PoolClient | undefined;
const dialect = new PgDialect();

beforeAll(async () => {
  postgres = await startIsolatedPostgres();
  client = await postgres.pool.connect();
  database.execute.mockImplementation((statement: SQL) => {
    const query = dialect.sqlToQuery(statement);
    return client!.query(query.sql, query.params);
  });

  // Bootstrap real schemas before the per-test transactions, so cached
  // initialization promises never refer to rolled-back CREATE TABLE statements.
  expect(await purgeExpiredVerificationCodes()).toBe(0);
  expect(await purgeExpiredVerifiedSessions()).toBe(0);
}, 30_000);

beforeEach(async () => {
  // NOW() is constant throughout this transaction, including fixture insertion,
  // both purge calls and assertions. No timing race at the exact boundary.
  await client!.query("BEGIN");
});

afterEach(async () => {
  await client?.query("ROLLBACK");
});

afterAll(async () => {
  client?.release();
  await postgres?.stop();
}, 30_000);

describe("limpeza real de registros expirados — PostgreSQL descartável", () => {
  it("preserva OTP com mais 5 minutos e no limite; remove somente o vencido há 1 segundo", async () => {
    await client!.query(`
      INSERT INTO device_contact_verifications (id, cpf, code, sent_at, expires_at)
      VALUES
        (1, '00000000000', '111111', NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '5 minutes'),
        (2, '00000000000', '222222', NOW() - INTERVAL '10 minutes 1 second', NOW() - INTERVAL '1 second'),
        (3, '00000000000', '333333', NOW() - INTERVAL '10 minutes', NOW())
    `);

    expect(await purgeExpiredVerificationCodes()).toBe(1);
    const remaining = await client!.query(
      "SELECT id FROM device_contact_verifications ORDER BY id",
    );
    expect(remaining.rows).toEqual([{ id: 1 }, { id: 3 }]);

    expect(await purgeExpiredVerificationCodes()).toBe(0);
    expect((await client!.query(
      "SELECT id FROM device_contact_verifications ORDER BY id",
    )).rows).toEqual(remaining.rows);
  });

  it("preserva sessões de 90 dias ainda válidas e no limite; remove somente a vencida há 1 segundo", async () => {
    await client!.query(`
      INSERT INTO device_verified_sessions (id, device_fingerprint, verified_at, expires_at)
      VALUES
        (1, 'synthetic-active', NOW() - INTERVAL '90 days' + INTERVAL '5 minutes', NOW() + INTERVAL '5 minutes'),
        (2, 'synthetic-expired', NOW() - INTERVAL '90 days 1 second', NOW() - INTERVAL '1 second'),
        (3, 'synthetic-boundary', NOW() - INTERVAL '90 days', NOW()),
        (4, 'synthetic-new', NOW(), NOW() + INTERVAL '90 days')
    `);

    expect(await purgeExpiredVerifiedSessions()).toBe(1);
    const remaining = await client!.query(
      "SELECT id FROM device_verified_sessions ORDER BY id",
    );
    expect(remaining.rows).toEqual([{ id: 1 }, { id: 3 }, { id: 4 }]);

    expect(await purgeExpiredVerifiedSessions()).toBe(0);
    expect((await client!.query(
      "SELECT id FROM device_verified_sessions ORDER BY id",
    )).rows).toEqual(remaining.rows);
  });
});
