import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("@workspace/db", () => ({ db: { execute: mocks.execute } }));
// O worker usa node-cron 3; o api-server usa outra instalação (versão 4).
// Mockar a dependência resolvida pelo consumidor, não a deste arquivo.
vi.mock("../../../api-worker/node_modules/node-cron", () => ({
  default: { schedule: mocks.schedule },
}));

// Isolar todos os outros efeitos imediatos do boot completo: nenhum banco,
// envio, watcher ou cron real pode ser acionado por esta suíte.
vi.mock("../lib/drive-watcher", () => ({
  processWatchedFolders: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/telegram-webhook-guard", () => ({
  startWebhookGuard: vi.fn(),
}));
vi.mock("../lib/device-throttle", () => ({
  purgeExpiredVerificationCodes: vi.fn().mockResolvedValue(0),
  purgeExpiredVerifiedSessions: vi.fn().mockResolvedValue(0),
}));
vi.mock("../lib/cert-source", () => ({
  refreshCertCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/cert-expiry-alert", () => ({
  checkCertExpiryAndAlert: vi.fn().mockResolvedValue(undefined),
}));

const PURGA_ERRO = "Worker: falha na purga de concierge_webhook_eventos";
const PURGA_OK = "Worker: purga de concierge_webhook_eventos concluída";
const dialect = new PgDialect();
const queryText = (query: SQL) => dialect.sqlToQuery(query).sql;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function boot() {
  const logger = { info: vi.fn(), error: vi.fn() };
  const { startWorkerJobs } = await import("../../../api-worker/src/worker");
  // Invoca a função inteira, não uma cópia nem apenas o helper de purga.
  startWorkerJobs(logger as never);
  expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Worker iniciado."));
  expect(mocks.schedule).toHaveBeenCalledWith(
    "30 3 1 * *",
    expect.any(Function),
    { timezone: "America/Sao_Paulo" },
  );
  return logger;
}

describe("boot completo do worker com purga de idempotência", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue({ rows: [], rowCount: 0 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(["CREATE TABLE", "DELETE FROM"])(
    "inicia antes de %s terminar e registra sucesso tardio",
    async (stage) => {
      const bancoLento = deferred<{ rows: never[]; rowCount: number }>();
      mocks.execute.mockImplementation((query: SQL) =>
        queryText(query).includes(stage)
          ? bancoLento.promise
          : Promise.resolve({
              rows: [],
              rowCount: queryText(query).includes("DELETE FROM") ? 7 : 0,
            }),
      );
      const logger = await boot();
      await vi.dynamicImportSettled();
      expect(mocks.execute.mock.calls.some(([q]) => queryText(q).includes(stage))).toBe(true);
      // Uma janela longa passa sem concluir a consulta; o boot já foi registrado.
      vi.advanceTimersByTime(30_000);
      expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), PURGA_OK);
      expect(logger.error).not.toHaveBeenCalled();

      bancoLento.resolve({ rows: [], rowCount: 7 });
      await vi.dynamicImportSettled();
      expect(logger.info).toHaveBeenCalledWith({ removidas: 7, origem: "boot" }, PURGA_OK);
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["CREATE TABLE", "ECONNREFUSED", "connect ECONNREFUSED"],
    ["CREATE TABLE", "42P01", "relation unavailable during bootstrap"],
    ["ALTER TABLE", "42P01", 'relation "concierge_webhook_eventos" does not exist'],
    ["DELETE FROM", "42P01", 'relation "concierge_webhook_eventos" does not exist'],
  ])("contém erro de %s (%s) sem abortar o boot", async (stage, code, message) => {
    const error = Object.assign(new Error(message), { code });
    mocks.execute.mockImplementation((query: SQL) =>
      queryText(query).includes(stage)
        ? Promise.reject(error)
        : Promise.resolve({ rows: [], rowCount: 0 }),
    );
    const logger = await boot();
    await vi.dynamicImportSettled();

    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: message, origem: "boot" },
      PURGA_ERRO,
    );
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), PURGA_OK);
    // Vitest reprova automaticamente qualquer unhandledRejection originada
    // pelo fire-and-forget; o log de inicialização veio antes do erro capturado.
    const bootIndex = logger.info.mock.calls.findIndex(
      ([message]) => typeof message === "string" && message.startsWith("Worker iniciado."),
    );
    expect(logger.info.mock.invocationCallOrder[bootIndex]).toBeLessThan(
      logger.error.mock.invocationCallOrder[0],
    );
  });

  it("captura a falha de conexão que chega somente depois do boot", async () => {
    const bancoLento = deferred<never>();
    mocks.execute.mockReturnValue(bancoLento.promise);
    const logger = await boot();
    await vi.dynamicImportSettled();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);
    bancoLento.reject(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }));
    await vi.dynamicImportSettled();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: "connect ETIMEDOUT", origem: "boot" },
      PURGA_ERRO,
    );
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), PURGA_OK);
  });
});
