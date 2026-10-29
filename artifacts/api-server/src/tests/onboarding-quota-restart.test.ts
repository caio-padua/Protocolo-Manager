/**
 * Real route + real PostgreSQL quota SQL; external delivery and client lookup
 * are stubbed. Only a connection-local temporary table is written.
 *
 * Restart means closing the HTTP listener AND re-importing the route module:
 * the cooldown Map is new, while PostgreSQL keeps its counter. This does not
 * restart the Vitest process or PostgreSQL itself.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Server } from "node:http";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  lookup: vi.fn(),
  whatsapp: vi.fn(),
  telegram: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      execute: mocks.execute,
      select: () => ({
        from: () => ({ where: () => ({ limit: mocks.lookup }) }),
      }),
    },
  };
});
vi.mock("../lib/whatsapp.js", () => ({ sendWhatsapp: mocks.whatsapp }));
vi.mock("../lib/telegram.js", () => ({ sendTelegram: mocks.telegram }));

import { pool } from "@workspace/db";

type Canal = "WHATSAPP" | "TELEGRAM";
let connection: Awaited<ReturnType<typeof pool.connect>>;
let server: Server | undefined;

async function restartServer() {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => error ? reject(error) : resolve()),
    );
    server = undefined;
  }
  vi.resetModules();
  const { onboardingRouter } = await import("../routes/onboarding.js");
  const app = express();
  app.use(express.json());
  app.use("/api/onboarding", onboardingRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server!.once("listening", resolve);
    server!.once("error", reject);
  });
  return server;
}

function send(canais: Canal[]) {
  return request(server!).post("/api/onboarding/enviar-guia").send({
    clientId: 42,
    canais,
    guiaUrl: "https://example.com/guia-digital?c=42",
  });
}

async function count(canal: Canal) {
  const result = await connection.query(
    "SELECT enviados FROM pg_temp.onboarding_quota WHERE client_id = 42 AND canal = $1",
    [canal],
  );
  return result.rows[0]?.enviados ?? 0;
}

beforeAll(async () => {
  connection = await pool.connect();
  const database = drizzle(connection);
  const dialect = new PgDialect();
  mocks.execute.mockImplementation(async (query) => {
    const { sql } = dialect.sqlToQuery(query);
    // Suppress the unrelated boot migrations; never touch persistent tables.
    if (/^\s*(CREATE|ALTER)\b/i.test(sql)) return { rows: [] };
    if (!/^\s*(INSERT INTO|UPDATE)\s+onboarding_quota\b/i.test(sql)) {
      throw new Error("Unexpected database write in isolated quota test");
    }
    return database.execute(query);
  });
});

beforeEach(async () => {
  // Each test rolls back its own temporary table, not application data.
  await connection.query("BEGIN");
  await connection.query(`
    CREATE TEMP TABLE onboarding_quota (
      client_id INT NOT NULL,
      canal TEXT NOT NULL,
      dia_brt DATE NOT NULL,
      enviados INT NOT NULL DEFAULT 0,
      PRIMARY KEY (client_id, canal, dia_brt)
    ) ON COMMIT DROP
  `);
  mocks.lookup.mockResolvedValue([{
    id: 42, name: "Cliente Teste", phone: "+5500000000000",
    telegramChatId: "synthetic-chat",
  }]);
  mocks.whatsapp.mockReset().mockResolvedValue({ sent: true });
  mocks.telegram.mockReset().mockResolvedValue({ sent: true });
  await restartServer();
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => error ? reject(error) : resolve()),
    );
    server = undefined;
  }
  await connection.query("ROLLBACK");
});

afterAll(async () => {
  connection?.release();
  await pool.end();
});

describe("Guia — quota PostgreSQL sobrevive ao reinício do servidor HTTP", () => {
  it.each<Canal>(["WHATSAPP", "TELEGRAM"])(
    "%s: três sucessos, reinício, quarto envio bloqueado por limite diário",
    async (canal) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) await restartServer();
        const response = await send([canal]).expect(200);
        expect(response.body).toMatchObject({
          ok: true, resultados: [{ canal, ok: true }],
        });
        expect(await count(canal)).toBe(attempt);
      }

      await restartServer();
      const blocked = await send([canal]).expect(429);
      expect(blocked.body).toMatchObject({
        ok: false, motivo: "limite_diario", canal,
      });
      expect(await count(canal)).toBe(3);
      const provider = canal === "WHATSAPP" ? mocks.whatsapp : mocks.telegram;
      expect(provider).toHaveBeenCalledTimes(3);

      const other = canal === "WHATSAPP" ? "TELEGRAM" : "WHATSAPP";
      expect((await send([other]).expect(200)).body.ok).toBe(true);
      expect(await count(other)).toBe(1);
    },
  );

  it("sem reinício, o reenvio imediato é cooldown e não consome outra quota", async () => {
    await send(["WHATSAPP"]).expect(200);
    expect((await send(["WHATSAPP"]).expect(429)).body.motivo).toBe("cooldown");
    expect(await count("WHATSAPP")).toBe(1);
    expect(mocks.whatsapp).toHaveBeenCalledTimes(1);
  });

  it("falha de entrega libera a reserva persistente", async () => {
    mocks.telegram.mockResolvedValueOnce({ sent: false, error: "Falha simulada" });
    expect((await send(["TELEGRAM"]).expect(200)).body.ok).toBe(false);
    expect(await count("TELEGRAM")).toBe(0);
    await restartServer();
    expect((await send(["TELEGRAM"]).expect(200)).body.ok).toBe(true);
    expect(await count("TELEGRAM")).toBe(1);
  });
});
